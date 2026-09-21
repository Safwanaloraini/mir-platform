import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";
import {
  canTransition,
  getRequiredFields,
  getAvailableTransitions,
  ACTIVE_EXECUTION_STATUSES,
} from "@/lib/task-workflow";
import {
  computeProgress,
  getBlockingInfo,
  checkRequiredFields,
} from "@/lib/task-utils";

const DETAIL_INCLUDE = {
  department: true,
  project: { select: { id: true, name: true, code: true } },
  costCenter: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true, avatarUrl: true, jobTitle: true } },
  parent: { select: { id: true, title: true, number: true, status: true } },
  subtasks: {
    include: {
      assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  assignees: {
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, jobTitle: true, department: { select: { name: true } } } },
    },
    orderBy: [{ isMain: "desc" as const }, { createdAt: "asc" as const }],
  },
  dependencies: { include: { dependsOn: { select: { id: true, title: true, number: true, status: true, progress: true } } } },
  blockingTasks: { include: { task: { select: { id: true, title: true, number: true, status: true, progress: true } } } },
  checklist: { orderBy: { order: "asc" as const } },
  comments: { orderBy: { createdAt: "asc" as const }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  attachments: { orderBy: { createdAt: "desc" as const }, include: { user: { select: { id: true, name: true } } } },
  statusHistory: { orderBy: { createdAt: "desc" as const }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  statusTransitions: { orderBy: { enteredAt: "desc" as const }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  request: { select: { id: true, number: true, title: true, status: true } },
  meeting: { select: { id: true, title: true, date: true } },
  decision: { select: { id: true, text: true, status: true } },
};

async function loadTaskOr404(id: string) {
  const task = await db.task.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!task) throw new Error("NOT_FOUND");
  return task;
}

/**
 * GET /api/tasks/[id]
 * تفاصيل مهمة بعينها مع كل العلاقات + معلومات مُضافة V1 (حجب، تقدم محسوب، انتقالات متاحة).
 */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await loadTaskOr404(id);

  const viewAll = can(user, "task.view.all");
  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a: any) => a.userId === user.id);
  if (!viewAll && !isCreator && !isAssignee) throw new Error("FORBIDDEN");

  // V1: معلومات الحجب (تابعيات finish_to_start غير مكتملة)
  const blockingInfo = await getBlockingInfo(task.id);

  // V1: التقدم المحسوب من المهام الفرعية أو قائمة التحقق
  const computedProgress = computeProgress(task);

  // V1: الانتقالات المتاحة من الحالة الحالية (للعرض في الواجهة)
  const availableTransitions = getAvailableTransitions(task.status, {
    isCreator,
    isAssignee,
    can: (p) => can(user, p),
  });

  // V1: تأجيلات المستخدم الحالي على هذه المهمة
  const mySnoozes = await db.taskSnooze.findMany({
    where: { taskId: task.id, userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return {
    ...task,
    isBlocked: blockingInfo.isBlocked,
    blockingTasks: blockingInfo.blockingTasks,
    blockedByCount: blockingInfo.blockedByCount,
    computedProgress,
    availableTransitions,
    snoozes: mySnoozes,
  };
});

/**
 * PATCH /api/tasks/[id]
 * تحديث حقول المهمة + قفل متفائل عبر version + دعم حقول V1 الجديدة.
 */
export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const existing = await loadTaskOr404(id);

  const isCreator = existing.createdById === user.id;
  if (!can(user, "task.edit") && !isCreator) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));

  // V1: قفل متفائل — إذا أُرسل version وتطابق diferente -> 409
  if (body.version != null && body.version !== undefined) {
    const sentVersion = Number(body.version);
    if (!Number.isNaN(sentVersion) && sentVersion !== existing.version) {
      return NextResponse.json(
        { error: "MODIFIED", currentVersion: existing.version },
        { status: 409 }
      );
    }
  }

  const allowedFields = [
    "title", "description", "type", "source", "priority",
    "departmentId", "projectId", "costCenterId", "parentId",
    "startDate", "dueDate", "estimatedHours", "tags",
    "isRecurring", "recurrence", "progress",
    // V1: حقول جديدة
    "definitionOfDone", "storyPoints", "waitingReason",
  ];

  const data: any = {};
  const changes: string[] = [];

  for (const f of allowedFields) {
    if (body[f] !== undefined) {
      let v = body[f];
      if (f === "startDate" || f === "dueDate") {
        v = v ? new Date(v) : null;
      } else if (f === "estimatedHours") {
        v = v != null ? Number(v) : null;
      } else if (f === "storyPoints") {
        v = v != null ? Math.max(0, parseInt(v, 10) || 0) : null;
      } else if (f === "isRecurring") {
        v = !!v;
      } else if (f === "progress") {
        v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
      } else if (f === "title") {
        v = String(v).trim();
        if (!v) badRequest("عنوان المهمة لا يمكن أن يكون فارغًا");
      } else if (f === "description" || f === "tags" || f === "recurrence" || f === "definitionOfDone" || f === "waitingReason") {
        v = v ? String(v) : null;
      }
      if (typeof v === "object" && v !== null && v instanceof Date) {
        const oldVal = existing[f as keyof typeof existing];
        if (!oldVal || new Date(oldVal as any).getTime() !== v.getTime()) {
          data[f] = v;
          changes.push(f);
        }
      } else if (existing[f as keyof typeof existing] !== v) {
        data[f] = v;
        changes.push(f);
      }
    }
  }

  // تغيير الحالة → يُسجَّل في statusHistory + TaskStatusTransition مع المرور عبر محرّك سير العمل
  let statusChanged = false;
  let newStatus: string | null = null;
  let statusNote: string | null = null;
  if (body.status && body.status !== existing.status) {
    newStatus = String(body.status);

    // فحص الانتقال عبر محرّك سير العمل
    const check = canTransition(existing.status, newStatus, {
      isCreator,
      isAssignee: existing.assignees.some((a: any) => a.userId === user.id),
      can: (p) => can(user, p),
    });
    if (!check.allowed) {
      const e = new Error("FORBIDDEN");
      (e as any).cause = check.reason ?? "الانتقال غير مسموح";
      throw e;
    }

    // فحص الحقول المطلوبة
    const requiredFields = getRequiredFields(existing.status, newStatus);
    const missing = checkRequiredFields(existing, requiredFields);
    if (missing.length > 0) {
      badRequest(`لا يمكن الانتقال: حقول ناقصة — ${missing.join("، ")}`);
    }

    data.status = newStatus;
    if (newStatus === "completed_approved" || newStatus === "completed_review") {
      data.progress = 100;
    }
    if (newStatus === "stalled") {
      if (body.stallReason) data.stallReason = String(body.stallReason);
      else if (!existing.stallReason) badRequest("سبب التعثر مطلوب عند تغيير الحالة إلى متعثرة");
    } else if (existing.stallReason && newStatus !== "stalled") {
      data.stallReason = null;
    }
    // waitingReason
    if (newStatus === "awaiting_info") {
      if (body.waitingReason) data.waitingReason = String(body.waitingReason);
    } else if (existing.waitingReason && newStatus !== "awaiting_info") {
      data.waitingReason = null;
    }
    // الطوابع الزمنية للحالات
    const now = new Date();
    if (ACTIVE_EXECUTION_STATUSES.includes(newStatus) && !existing.startedAt) {
      data.startedAt = now;
    }
    if (newStatus === "completed_approved") {
      data.completedAt = now;
    } else if (existing.completedAt && newStatus !== "completed_approved") {
      data.completedAt = null;
    }
    if (newStatus === "cancelled") {
      data.cancelledAt = now;
    } else if (existing.cancelledAt && newStatus !== "cancelled") {
      data.cancelledAt = null;
    }
    if (newStatus === "archived") {
      data.archivedAt = now;
    } else if (existing.archivedAt && newStatus !== "archived") {
      data.archivedAt = null;
    }
    statusNote = body.note ? String(body.note) : null;
    statusChanged = true;
  }

  // تعديل الإسناد
  let assigneeChange = false;
  if (body.assigneeIds !== undefined) {
    if (!can(user, "task.assign") && !isCreator) throw new Error("FORBIDDEN");
    const newIds: string[] = Array.isArray(body.assigneeIds) ? body.assigneeIds.filter(Boolean) : [];
    const mainAssigneeId = body.mainAssigneeId || null;
    if (mainAssigneeId && !newIds.includes(mainAssigneeId)) {
      badRequest("المسؤول الرئيسي يجب أن يكون ضمن المسندين");
    }
    const current = existing.assignees;
    const currentIds = new Set(current.map((a: any) => a.userId));
    const newIdSet = new Set(newIds);
    const toRemove = current.filter((a: any) => !newIdSet.has(a.userId));
    const toAdd = newIds.filter((uid) => !currentIds.has(uid));

    if (toRemove.length > 0 || toAdd.length > 0) assigneeChange = true;

    await db.$transaction(async (tx) => {
      if (toRemove.length > 0) {
        await tx.taskAssignee.deleteMany({ where: { taskId: id, userId: { in: toRemove.map((a: any) => a.userId) } } });
      }
      for (const uid of toAdd) {
        await tx.taskAssignee.create({ data: { taskId: id, userId: uid, role: "contributor", isMain: false } });
      }
      const all = await tx.taskAssignee.findMany({ where: { taskId: id } });
      const mainTarget = mainAssigneeId
        ? all.find((a) => a.userId === mainAssigneeId)
        : all[0];
      if (mainTarget) {
        await tx.taskAssignee.updateMany({ where: { taskId: id }, data: { isMain: false } });
        await tx.taskAssignee.update({ where: { id: mainTarget.id }, data: { isMain: true, role: "responsible" } });
        await tx.task.update({ where: { id }, data: { mainAssigneeId: mainTarget.id } });
      } else {
        await tx.task.update({ where: { id }, data: { mainAssigneeId: null } });
      }
    });
    if (assigneeChange) changes.push("assignees");
  }

  if (Object.keys(data).length === 0 && !assigneeChange) {
    return existing;
  }

  // V1: زيادة version عند الحفظ (قفل متفائل)
  if (Object.keys(data).length > 0) {
    data.version = { increment: 1 };
    await db.task.update({ where: { id }, data });
  }

  // كتابة سجلات تغيير الحالة (statusHistory + TaskStatusTransition)
  if (statusChanged && newStatus) {
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.taskStatusHistory.create({
        data: {
          taskId: id,
          userId: user.id,
          fromStatus: existing.status,
          toStatus: newStatus!,
          note: statusNote,
        },
      });
      // إغلاق الانتقال المفتوح السابق
      await tx.taskStatusTransition.updateMany({
        where: { taskId: id, exitedAt: null },
        data: { exitedAt: now },
      });
      await tx.taskStatusTransition.create({
        data: {
          taskId: id,
          fromStatus: existing.status,
          toStatus: newStatus!,
          userId: user.id,
          note: statusNote,
          stallReason: newStatus === "stalled" ? data.stallReason ?? existing.stallReason : null,
          enteredAt: now,
          exitedAt: null,
        },
      });
    });
    const recipients = new Set<string>();
    if (existing.createdById !== user.id) recipients.add(existing.createdById);
    existing.assignees.forEach((a: any) => { if (a.userId !== user.id) recipients.add(a.userId); });
    for (const rid of recipients) {
      await notify({
        userId: rid,
        actorId: user.id,
        type: "status_change",
        title: `تحديث حالة المهمة: ${existing.title}`,
        body: `${existing.status} → ${newStatus}`,
        link: `task-detail:${id}`,
        entityType: "task",
        entityId: id,
      });
    }
  }

  const updated = await loadTaskOr404(id);

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: statusChanged ? "status_change" : "update",
    entityType: "task",
    entityId: id,
    before: { title: existing.title, status: existing.status, priority: existing.priority, version: existing.version },
    after: {
      title: updated.title,
      status: updated.status,
      priority: updated.priority,
      version: updated.version,
      changes,
    },
    summary: statusChanged
      ? `تغيير حالة المهمة "${existing.title}" من ${existing.status} إلى ${newStatus}`
      : `تعديل المهمة "${existing.title}" (${changes.join("، ") || "—"})`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: statusChanged ? "status_change" : "update",
    entityType: "task",
    entityId: id,
    summary: statusChanged
      ? `غيّر حالة مهمة ${existing.title} إلى ${newStatus}`
      : `عدّل مهمة ${existing.title}`,
    ip,
  });

  return updated;
});

/**
 * DELETE /api/tasks/[id]
 * حذف مهمة. سلوك ذكي:
 * - إن كانت المهمة في حالة "مسودة" أو لم يُبدأ بها (new/draft) → حذف صلب
 * - إن كانت منتهية (completed_approved/cancelled/archived) → حذف صلب مع طلب تأكيد
 * - إن كانت قيد التنفيذ → تحويل لأرشفة (soft delete) بدل الحذف الصلب
 * الصلاحية: المنشئ (للمسودات/المهام غير المبدوءة) أو task.delete للأخرى.
 */
export const DELETE = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await db.task.findUnique({
    where: { id },
    select: {
      id: true, title: true, number: true, status: true, createdById: true,
      assignees: { select: { userId: true } },
      _count: { select: { subtasks: true, comments: true, attachments: true } },
    },
  });
  if (!task) throw new Error("NOT_FOUND");

  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  const canDelete = can(user, "task.delete");
  const viewAll = can(user, "task.view.all");

  // صلاحية الرؤية
  if (!viewAll && !isCreator && !isAssignee) throw new Error("FORBIDDEN");

  // تحديد نوع الحذف
  const isDraftLike = ["draft", "new"].includes(task.status);
  const isFinished = ["completed_approved", "cancelled", "archived"].includes(task.status);
  const forceHard = new URL(req.url).searchParams.get("hard") === "true";

  // للمهام قيد التنفيذ: حذف صلب يتطلب task.delete
  const canHardDelete = isDraftLike ? isCreator || canDelete : canDelete;

  if (!canHardDelete && !forceHard) {
    // أرشفة ناعمة
    await db.task.update({
      where: { id },
      data: {
        status: "archived",
        archivedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await db.taskStatusHistory.create({
      data: {
        taskId: id,
        userId: user.id,
        fromStatus: task.status,
        toStatus: "archived",
        note: "أرشفة قبل الحذف",
      },
    });
    await db.taskStatusTransition.create({
      data: {
        taskId: id,
        userId: user.id,
        fromStatus: task.status,
        toStatus: "archived",
        note: "أرشفة قبل الحذف",
        enteredAt: new Date(),
      },
    });

    const ip = getClientIp(req);
    await audit({
      user,
      action: "archive",
      entityType: "task",
      entityId: id,
      before: { status: task.status, title: task.title },
      summary: `أرشف مهمة "${task.title}" (م-${task.number}) قبل الحذف`,
      ip,
      userAgent: getUserAgent(req),
    });

    return { ok: true, mode: "archived", message: "تمت أرشفة المهمة. للحذف النهائي، أعد الطلب مع ?hard=true" };
  }

  // حذف صلب — نتحقق من عدم وجود مهام فرعية معتمدة
  if (task._count.subtasks > 0) {
    const activeSubs = await db.task.count({
      where: { parentId: id, status: { notIn: ["completed_approved", "cancelled", "archived"] } },
    });
    if (activeSubs > 0 && !forceHard) {
      badRequest(`لا يمكن الحذف: المهمة لها ${activeSubs} مهمة فرعية نشطة. أكملها أو ألغها أولًا، أو استخدم ?hard=true للحذف الإجباري.`);
    }
  }

  // نسخة احتياطية للسجل قبل الحذف
  const snapshot = {
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    deletedAt: new Date().toISOString(),
  };

  // الحذف الصلب (cascade يحذف تلقائيًا: assignees, checklist, comments, attachments, statusHistory, statusTransitions, snoozes)
  await db.task.delete({ where: { id } });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "delete",
    entityType: "task",
    entityId: id,
    before: snapshot,
    summary: `حذف مهمة "${task.title}" (م-${task.number}) — الحالة السابقة: ${task.status}`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "delete",
    entityType: "task",
    entityId: id,
    summary: `حذف مهمة ${task.title} (#${task.number})`,
    ip,
  });

  // إشعار المعنيين
  const recipients = new Set<string>();
  if (task.createdById !== user.id) recipients.add(task.createdById);
  task.assignees.forEach((a) => { if (a.userId !== user.id) recipients.add(a.userId); });
  for (const rid of recipients) {
    await notify({
      userId: rid,
      actorId: user.id,
      type: "status_change",
      title: `تم حذف مهمة: ${task.title}`,
      body: `المهمة م-${task.number} حُذفت بواسطة ${user.name}`,
      entityType: "task",
      entityId: id,
    });
  }

  return NextResponse.json({ ok: true, mode: "deleted", snapshot });
});
