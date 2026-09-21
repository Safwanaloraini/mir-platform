import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";
import { canTransition, getRequiredFields, ACTIVE_EXECUTION_STATUSES } from "@/lib/task-workflow";
import { checkRequiredFields, getBlockingInfo } from "@/lib/task-utils";
import { BULK_ACTIONS } from "@/lib/constants";

type BulkActionType = keyof typeof BULK_ACTIONS;

interface SkippedItem {
  id: string;
  reason: string;
}

/**
 * يبني بيانات التحديث المناسبة لكل نوع إجراء جماعي.
 */
function buildUpdateData(action: BulkActionType, value: unknown): Record<string, unknown> {
  switch (action) {
    case "status": {
      const status = String(value ?? "").trim();
      if (!status) badRequest("الحالة الجديدة مطلوبة");
      return { status };
    }
    case "priority": {
      const priority = String(value ?? "").trim();
      if (!["low", "medium", "high", "urgent"].includes(priority)) {
        badRequest("الأولوية غير صالحة");
      }
      return { priority };
    }
    case "dueDate": {
      if (value === null || value === "") return { dueDate: null };
      const d = new Date(String(value));
      if (isNaN(d.getTime())) badRequest("تاريخ الموعد النهائي غير صالح");
      return { dueDate: d };
    }
    case "department": {
      if (value === null || value === "") return { departmentId: null };
      return { departmentId: String(value) };
    }
    case "tags": {
      const arr = Array.isArray(value) ? value.map(String) : String(value).split(",").map((s) => s.trim()).filter(Boolean);
      return { tags: arr.join(",") };
    }
    case "assign": {
      // الإسناد لا يُحدّث مباشرة على Task — يُدار عبر TaskAssignee
      // نعيدها فارغة ونعالج الإسناد لاحقًا في المعاملة
      return {};
    }
    default:
      badRequest(`نوع الإجراء غير مدعوم: ${String(action)}`);
      // unreachable — badRequest يرمي دائمًا
      return {};
  }
}

/**
 * يتحقق من صحة نوع الإجراء.
 */
function assertValidAction(action: string): asserts action is BulkActionType {
  if (!Object.prototype.hasOwnProperty.call(BULK_ACTIONS, action)) {
    badRequest(`نوع الإجراء غير معروف: ${action}`);
  }
}

/**
 * POST /api/tasks/bulk
 * تنفيذ إجراء جماعي على عدة مهام.
 */
export const POST = apiHandler(async (req: Request, _ctx: { params: Promise<Record<string, string>> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  if (!can(user, "task.bulk_action")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  assertValidAction(action);

  const taskIds: string[] = Array.isArray(body.taskIds)
    ? body.taskIds.map(String).filter(Boolean)
    : [];
  if (taskIds.length === 0) badRequest("قائمة المهام فارغة");
  if (taskIds.length > 200) badRequest("لا يمكن تطبيق إجراء جماعي على أكثر من 200 مهمة في المرة");

  const value = body.value;
  const force = !!body.force;

  const viewAll = can(user, "task.view.all");

  // جلب المهام + علاقات أساسية للتحقق من النطاق والإسناد وقواعد الانتقال
  const tasks = await db.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      assignees: { select: { userId: true } },
      checklist: { select: { done: true, required: true } },
      attachments: { select: { required: true } },
    },
  });

  // التحقق من النطاق: المستخدم يرى المهام التي أنشأها أو مُسندة إليه (أو الكل إن كان يملك view.all)
  const inScope = (t: (typeof tasks)[number]) => {
    if (viewAll) return true;
    if (t.createdById === user.id) return true;
    if (t.assignees.some((a) => a.userId === user.id)) return true;
    return false;
  };

  // إن كانت هناك مهام غير موجودة أو خارج النطاق، نُبلغ عنها
  const foundIds = new Set(tasks.map((t) => t.id));
  const skipped: SkippedItem[] = [];
  for (const tid of taskIds) {
    if (!foundIds.has(tid)) {
      skipped.push({ id: tid, reason: "المهمة غير موجودة أو لا تملك صلاحية تعديلها" });
    }
  }
  for (const t of tasks) {
    if (!inScope(t)) {
      skipped.push({ id: t.id, reason: "لا تملك صلاحية تعديل هذه المهمة" });
    }
  }

  const scopedTasks = tasks.filter(inScope);

  // بناء بيانات التحديث المركزية (للإجراءات التي لا تتعلق بالحالة)
  const baseData = buildUpdateData(action, value);

  // للإجراء "assign": value = { userIds: string[], mainAssigneeId?: string }
  let assignUserIds: string[] = [];
  let assignMainId: string | null = null;
  if (action === "assign") {
    const v = value as { userIds?: string[]; mainAssigneeId?: string } | undefined;
    assignUserIds = Array.isArray(v?.userIds) ? v!.userIds!.map(String).filter(Boolean) : [];
    if (assignUserIds.length === 0) badRequest("قائمة المسؤولين فارغة");
    assignMainId = v?.mainAssigneeId ? String(v.mainAssigneeId) : null;
    if (assignMainId && !assignUserIds.includes(assignMainId)) {
      badRequest("المسؤول الرئيسي يجب أن يكون ضمن قائمة المسؤولين");
    }
  }

  const toUpdate: typeof scopedTasks = [];

  for (const t of scopedTasks) {
    if (action === "status") {
      const newStatus = String(value ?? "").trim();
      if (newStatus === t.status) {
        skipped.push({ id: t.id, reason: "الحالة الجديدة مطابقة للحالية" });
        continue;
      }
      const isCreator = t.createdById === user.id;
      const isAssignee = t.assignees.some((a) => a.userId === user.id);
      const check = canTransition(t.status, newStatus, {
        isCreator,
        isAssignee,
        can: (p) => can(user, p),
      });
      if (!check.allowed) {
        skipped.push({ id: t.id, reason: check.reason ?? "الانتقال غير مسموح" });
        continue;
      }
      // فحص الحقول المطلوبة
      const reqFields = getRequiredFields(t.status, newStatus);
      if (reqFields.length > 0) {
        const missing = checkRequiredFields(t, reqFields);
        if (missing.length > 0) {
          skipped.push({ id: t.id, reason: `حقول ناقصة: ${missing.join("، ")}` });
          continue;
        }
      }
      // فحص الحجب إن لم يكن forced
      if (!force) {
        const blocking = await getBlockingInfo(t.id);
        if (blocking.isBlocked) {
          const names = blocking.blockingTasks
            .map((b) => `م-${String(b.number).padStart(4, "0")}`)
            .join("، ");
          skipped.push({ id: t.id, reason: `محجوبة بتبعيات غير مكتملة (${names})` });
          continue;
        }
      }
      toUpdate.push(t);
    } else if (action === "assign") {
      toUpdate.push(t);
    } else {
      // إجراءات بسيطة (priority/dueDate/department/tags)
      toUpdate.push(t);
    }
  }

  if (toUpdate.length === 0) {
    // لا يوجد ما يمكن تحديثه — لكن نُسجّل الإجراء الجماعي الفارغ للشفافية
    const bulkAction = await db.bulkAction.create({
      data: {
        userId: user.id,
        action,
        taskIds: JSON.stringify(taskIds),
        payloadJson: JSON.stringify({ value, before: {}, versionAfter: {} }),
      },
    });
    const ipEmpty = getClientIp(req);
    const uaEmpty = getUserAgent(req);
    await audit({
      user,
      action: "bulk_action",
      entityType: "task",
      summary: `إجراء جماعي: ${action} على 0 مهمة (الكل متجاوز)`,
      ip: ipEmpty,
      userAgent: uaEmpty,
    });
    return { updated: [], skipped, bulkActionId: bulkAction.id };
  }

  // تنفيذ المعاملة الذرّية
  const now = new Date();
  const beforeSnapshots: Record<string, Record<string, unknown>> = {};
  const versionAfter: Record<string, number> = {};

  await db.$transaction(async (tx) => {
    for (const t of toUpdate) {
      const before: Record<string, unknown> = {
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        departmentId: t.departmentId,
        tags: t.tags,
        version: t.version,
      };

      // تطبيق الإسناد إن لزم
      if (action === "assign") {
        // حذف الإسنادات الحالية وإضافة الجديدة
        await tx.taskAssignee.deleteMany({ where: { taskId: t.id } });
        for (const uid of assignUserIds) {
          await tx.taskAssignee.create({
            data: {
              taskId: t.id,
              userId: uid,
              role: "contributor",
              isMain: false,
            },
          });
        }
        const all = await tx.taskAssignee.findMany({ where: { taskId: t.id } });
        const mainTarget = assignMainId
          ? all.find((a) => a.userId === assignMainId)
          : all[0];
        if (mainTarget) {
          await tx.taskAssignee.updateMany({ where: { taskId: t.id }, data: { isMain: false } });
          await tx.taskAssignee.update({
            where: { id: mainTarget.id },
            data: { isMain: true, role: "responsible" },
          });
          await tx.task.update({
            where: { id: t.id },
            data: { mainAssigneeId: mainTarget.id, version: { increment: 1 } },
          });
        } else {
          await tx.task.update({
            where: { id: t.id },
            data: { mainAssigneeId: null, version: { increment: 1 } },
          });
        }
        before.assigneeIds = (await tx.taskAssignee.findMany({
          where: { taskId: t.id },
          select: { userId: true, isMain: true },
        })).map((a) => a.userId);
        // لقطة ما قبل الحذف يحفظها المستدعي قبل التغييرات
        beforeSnapshots[t.id] = before;
        versionAfter[t.id] = t.version + 1;
        continue;
      }

      // تغيير الحالة يتطلب: كتابة TaskStatusTransition + TaskStatusHistory + exitedAt على السابق
      if (action === "status") {
        const newStatus = String(value ?? "").trim();
        const updateData: Record<string, unknown> = { status: newStatus, version: { increment: 1 } };
        // قواعد حالة الإكمال
        if (newStatus === "completed_approved" || newStatus === "completed_review") {
          updateData.progress = 100;
        }
        if (newStatus === "stalled") {
          // نُبقي stallReason الحالي إن وُجد
        }
        if (newStatus !== "stalled" && t.stallReason) {
          updateData.stallReason = null;
        }
        if (ACTIVE_EXECUTION_STATUSES.includes(newStatus) && !t.startedAt) {
          updateData.startedAt = now;
        }
        if (newStatus === "completed_approved" && !t.completedAt) {
          updateData.completedAt = now;
        }
        if (newStatus === "cancelled" && !t.cancelledAt) {
          updateData.cancelledAt = now;
        }

        // إغلاق انتقال الحالة المفتوح السابق
        await tx.taskStatusTransition.updateMany({
          where: { taskId: t.id, exitedAt: null },
          data: { exitedAt: now },
        });
        // إنشاء انتقال جديد
        await tx.taskStatusTransition.create({
          data: {
            taskId: t.id,
            fromStatus: t.status,
            toStatus: newStatus,
            userId: user.id,
            enteredAt: now,
          },
        });
        // سجل تاريخ الحالة المختصر
        await tx.taskStatusHistory.create({
          data: {
            taskId: t.id,
            userId: user.id,
            fromStatus: t.status,
            toStatus: newStatus,
            note: `إجراء جماعي (${action})`,
          },
        });

        await tx.task.update({ where: { id: t.id }, data: updateData });
        beforeSnapshots[t.id] = before;
        versionAfter[t.id] = t.version + 1;
        continue;
      }

      // الإجراءات البسيطة: priority/dueDate/department/tags
      const updateData: Record<string, unknown> = { ...baseData, version: { increment: 1 } };
      await tx.task.update({ where: { id: t.id }, data: updateData });
      beforeSnapshots[t.id] = before;
      versionAfter[t.id] = t.version + 1;
    }
  });

  // تسجيل الإجراء الجماعي (للتراجع)
  const bulkAction = await db.bulkAction.create({
    data: {
      userId: user.id,
      action,
      taskIds: JSON.stringify(toUpdate.map((t) => t.id)),
      payloadJson: JSON.stringify({ value, before: beforeSnapshots, versionAfter }),
    },
  });

  const updatedIds = toUpdate.map((t) => t.id);

  // تدقيق واحد مختصر + نشاط
  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  const summary = `إجراء جماعي: ${BULK_ACTIONS[action].label} على ${updatedIds.length} مهمة`;
  await audit({
    user,
    action: "bulk_action",
    entityType: "task",
    entityId: bulkAction.id,
    before: { action, taskIds: updatedIds, value },
    after: { updated: updatedIds.length, skipped: skipped.length, bulkActionId: bulkAction.id },
    summary,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "bulk_action",
    entityType: "task",
    entityId: bulkAction.id,
    summary,
    ip,
  });

  return {
    updated: updatedIds,
    skipped,
    bulkActionId: bulkAction.id,
  };
});
