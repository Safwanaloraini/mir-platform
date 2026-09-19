import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";

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
 * تفاصيل مهمة بعينها مع كل العلاقات.
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

  return task;
});

/**
 * PATCH /api/tasks/[id]
 * تحديث حقول المهمة. تعديل الإسناد يتطلب task.assign، تغيير الحالة يُسجَّل في statusHistory.
 */
export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const existing = await loadTaskOr404(id);

  const isCreator = existing.createdById === user.id;
  if (!can(user, "task.edit") && !isCreator) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));

  const allowedFields = [
    "title", "description", "type", "source", "priority",
    "departmentId", "projectId", "costCenterId", "parentId",
    "startDate", "dueDate", "estimatedHours", "tags",
    "isRecurring", "recurrence", "progress",
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
      } else if (f === "isRecurring") {
        v = !!v;
      } else if (f === "progress") {
        v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
      } else if (f === "title") {
        v = String(v).trim();
        if (!v) badRequest("عنوان المهمة لا يمكن أن يكون فارغًا");
      } else if (f === "description" || f === "tags" || f === "recurrence") {
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

  // تغيير الحالة → يُسجَّل في statusHistory
  let statusChanged = false;
  let newStatus: string | null = null;
  let statusNote: string | null = null;
  if (body.status && body.status !== existing.status) {
    newStatus = String(body.status);
    if (newStatus === "completed_approved" && !can(user, "task.approve_completion")) {
      throw new Error("FORBIDDEN");
    }

    // التحقق من شروط الإكمال المعتمد
    if (newStatus === "completed_approved") {
      const requiredChecklist = existing.checklist.filter((c) => c.required && !c.done);
      if (requiredChecklist.length > 0) {
        badRequest(`لا يمكن الاعتماد: ${requiredChecklist.length} عنصر إلزامي غير منجز في قائمة التحقق`);
      }
      const hasRequiredAttachment = existing.attachments.some((a) => a.required);
      if (hasRequiredAttachment && !existing.attachments.some((a) => a.required)) {
        badRequest("هناك مرفقات إلزامية غير مرفوعة");
      }
    }

    data.status = newStatus;
    if (newStatus === "completed_approved" || newStatus === "completed_review") {
      data.progress = 100;
    }
    if (newStatus === "stalled") {
      if (body.stallReason) data.stallReason = String(body.stallReason);
      else if (!existing.stallReason) badRequest("سبب التعثر مطلوب عند تغيير الحالة إلى متعثرة");
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

  if (Object.keys(data).length > 0) {
    await db.task.update({ where: { id }, data });
  }

  if (statusChanged && newStatus) {
    await db.taskStatusHistory.create({
      data: {
        taskId: id,
        userId: user.id,
        fromStatus: existing.status,
        toStatus: newStatus,
        note: statusNote,
      },
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
    before: { title: existing.title, status: existing.status, priority: existing.priority },
    after: { title: updated.title, status: updated.status, priority: updated.priority, changes },
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
