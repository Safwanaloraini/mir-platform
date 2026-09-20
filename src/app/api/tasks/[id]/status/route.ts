import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";
import {
  canTransition,
  getRequiredFields,
  ACTIVE_EXECUTION_STATUSES,
} from "@/lib/task-workflow";
import { checkRequiredFields, getBlockingInfo } from "@/lib/task-utils";

const DETAIL_INCLUDE = {
  checklist: { orderBy: { order: "asc" as const } },
  attachments: true,
  assignees: { include: { user: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
  dependencies: {
    include: {
      dependsOn: { select: { id: true, title: true, number: true, status: true } },
    },
  },
} as const;

/**
 * POST /api/tasks/[id]/status
 * تغيير حالة المهمة عبر محرّك سير العمل (task-workflow.ts) كمصدر وحيد للحقيقة.
 *
 * - فحص الصلاحيات والمنشئ/المسؤول عبر canTransition.
 * - فحص الحقول المطلوبة عبر checkRequiredFields.
 * - فحص الحجب بالتبعيات قبل الإكمال (مع force=true للتجاوز).
 * - القفل المتفائل عبر version.
 * - كتابة TaskStatusHistory + TaskStatusTransition (مع exitedAt للسابق).
 * - ضبط startedAt/completedAt/cancelledAt/archivedAt.
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await db.task.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!task) throw new Error("NOT_FOUND");

  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a: any) => a.userId === user.id);
  const viewAll = can(user, "task.view.all");
  if (!viewAll && !isCreator && !isAssignee) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const newStatus = (body.status || "").toString().trim();
  if (!newStatus) badRequest("الحالة الجديدة مطلوبة");

  const oldStatus = task.status;
  const note: string | null = body.note ? String(body.note).trim() || null : null;
  const stallReason: string | null =
    body.stallReason != null ? String(body.stallReason).trim() || null : null;
  const waitingReason: string | null =
    body.waitingReason != null ? String(body.waitingReason).trim() || null : null;
  const force = body.force === true;

  // القفل المتفائل: إذا أُرسل version وتطابق diferente -> 409
  if (body.version != null && body.version !== undefined) {
    const sentVersion = Number(body.version);
    if (!Number.isNaN(sentVersion) && sentVersion !== task.version) {
      return NextResponse.json(
        { error: "MODIFIED", currentVersion: task.version },
        { status: 409 }
      );
    }
  }

  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  // لا شيء إذا كانت الحالة مطابقة
  if (newStatus === oldStatus) {
    return NextResponse.json({ task, unchanged: true });
  }

  // 1) فحص الانتقال عبر محرّك سير العمل
  const check = canTransition(oldStatus, newStatus, {
    isCreator,
    isAssignee,
    can: (p) => can(user, p),
  });
  if (!check.allowed) {
    // تسجيل محاولة الرفض
    await audit({
      user,
      action: "status_change_denied",
      entityType: "task",
      entityId: id,
      before: { status: oldStatus },
      after: { attemptedStatus: newStatus, reason: check.reason },
      summary: `رُفض تغيير حالة المهمة "${task.title}" إلى ${newStatus} — ${check.reason}`,
      ip,
      userAgent: ua,
    });
    const e = new Error("FORBIDDEN");
    (e as any).cause = check.reason ?? "الانتقال غير مسموح";
    throw e;
  }

  // 2) فحص الحقول المطلوبة
  const requiredFields = getRequiredFields(oldStatus, newStatus);
  // إذا كان الانتقال إلى stalled وأُرسل stallReason عبر البدي، نُدمجه في نسخة الفحص
  const taskForCheck = {
    ...task,
    stallReason: newStatus === "stalled" ? (stallReason ?? task.stallReason) : task.stallReason,
  };
  const missing = checkRequiredFields(taskForCheck, requiredFields);
  if (missing.length > 0) {
    badRequest(`لا يمكن الانتقال: حقول ناقصة — ${missing.join("، ")}`);
  }

  // 3) فحص الحجب قبل إكمال (مراجعة أو اعتماد)
  if (newStatus === "completed_review" || newStatus === "completed_approved") {
    const blocking = await getBlockingInfo(task.id);
    if (blocking.isBlocked && !force) {
      const e = new Error("VALIDATION");
      (e as any).cause = JSON.stringify({
        code: "BLOCKED",
        message: `المهمة محجوبة بـ ${blocking.blockingTasks.length} تبعية غير مكتملة`,
        blockingTasks: blocking.blockingTasks,
      });
      throw e;
    }
  }

  // 4) بناء بيانات التحديث
  const now = new Date();
  const updateData: Record<string, unknown> = {
    status: newStatus,
    version: { increment: 1 },
  };

  // stallReason
  if (newStatus === "stalled") {
    updateData.stallReason = stallReason ?? task.stallReason;
  } else if (oldStatus === "stalled" && newStatus !== "stalled") {
    updateData.stallReason = null;
  }

  // waitingReason (awaiting_info)
  if (newStatus === "awaiting_info") {
    updateData.waitingReason = waitingReason ?? task.waitingReason;
  } else if (oldStatus === "awaiting_info" && newStatus !== "awaiting_info") {
    updateData.waitingReason = null;
  }

  // progress عند الاعتماد النهائي
  if (newStatus === "completed_approved") {
    updateData.progress = 100;
  }

  // startedAt عند دخول حالة تنفيذ فعلي لأول مرة
  if (ACTIVE_EXECUTION_STATUSES.includes(newStatus) && !task.startedAt) {
    updateData.startedAt = now;
  }

  // completedAt عند الاعتماد النهائي
  if (newStatus === "completed_approved") {
    updateData.completedAt = now;
  } else if (oldStatus === "completed_approved" && newStatus !== "completed_approved") {
    // إعادة فتح: نمسح
    updateData.completedAt = null;
  }

  // cancelledAt
  if (newStatus === "cancelled") {
    updateData.cancelledAt = now;
  } else if (oldStatus === "cancelled" && newStatus !== "cancelled") {
    updateData.cancelledAt = null;
  }

  // archivedAt (دفاعي — لا انتقال إلى archived حاليًا في الخريطة، لكن نُجهّز له)
  if (newStatus === "archived") {
    updateData.archivedAt = now;
  } else if (oldStatus === "archived" && newStatus !== "archived") {
    updateData.archivedAt = null;
  }

  // 5) معاملة ذرّية: تحديث المهمة + كتابة سجلين + إغلاق الانتقال المفتوح السابق
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: updateData });

    // أ) TaskStatusHistory — للتوافق مع القائمة السابقة
    await tx.taskStatusHistory.create({
      data: {
        taskId: id,
        userId: user.id,
        fromStatus: oldStatus,
        toStatus: newStatus,
        note:
          note ??
          (newStatus === "stalled" ? (stallReason ?? task.stallReason) : null) ??
          null,
      },
    });

    // ب) إغلاق الانتقال المفتوح السابق (exitedAt = now)
    await tx.taskStatusTransition.updateMany({
      where: { taskId: id, exitedAt: null },
      data: { exitedAt: now },
    });

    // ج) إنشاء سجل TaskStatusTransition جديد للحالة الحالية
    await tx.taskStatusTransition.create({
      data: {
        taskId: id,
        fromStatus: oldStatus,
        toStatus: newStatus,
        userId: user.id,
        note,
        stallReason: newStatus === "stalled" ? (stallReason ?? task.stallReason) : null,
        enteredAt: now,
        exitedAt: null,
      },
    });
  });

  // 6) إشعار المستلمين (المنشئ + المسؤولون ما عدا المستخدم الحالي)
  const recipients = new Set<string>();
  if (task.createdById !== user.id) recipients.add(task.createdById);
  task.assignees.forEach((a: any) => {
    if (a.userId !== user.id) recipients.add(a.userId);
  });
  for (const rid of recipients) {
    await notify({
      userId: rid,
      actorId: user.id,
      type: "status_change",
      title: `تحديث حالة المهمة: ${task.title}`,
      body: `${oldStatus} → ${newStatus}${
        newStatus === "stalled" && updateData.stallReason ? " — " + (updateData.stallReason as string) : ""
      }${newStatus === "awaiting_info" && updateData.waitingReason ? " — " + (updateData.waitingReason as string) : ""}`,
      link: `task-detail:${id}`,
      entityType: "task",
      entityId: id,
    });
  }

  // 7) تدقيق ونشاط
  await audit({
    user,
    action: "status_change",
    entityType: "task",
    entityId: id,
    before: { status: oldStatus, version: task.version },
    after: { status: newStatus, note, version: task.version + 1 },
    summary: `تغيير حالة المهمة "${task.title}" من ${oldStatus} إلى ${newStatus}`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "status_change",
    entityType: "task",
    entityId: id,
    summary: `غيّر حالة مهمة ${task.title} إلى ${newStatus}`,
    ip,
  });

  const updated = await db.task.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  return updated;
});
