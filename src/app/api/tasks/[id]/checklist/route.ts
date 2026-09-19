import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

/**
 * POST /api/tasks/[id]/checklist
 * إضافة عنصر جديد إلى قائمة التحقق، أو تحديث عنصر موجود (body.id → PATCH-like behavior).
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true, createdById: true, assignees: { select: { userId: true } }, checklist: { select: { id: true, order: true } } } });
  if (!task) throw new Error("NOT_FOUND");

  // السماح للمنشئ/المسؤول بالتعديل، أو من لديه task.edit
  const creator = task.createdById === user.id;
  const assignee = task.assignees.some((a) => a.userId === user.id);
  if (!can(user, "task.edit") && !creator && !assignee) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));

  // وضع التحديث: body.id موجود
  if (body.id) {
    const item = await db.taskChecklistItem.findUnique({ where: { id: body.id } });
    if (!item || item.taskId !== id) throw new Error("NOT_FOUND");

    const data: any = {};
    if (body.text !== undefined) {
      const t = String(body.text).trim();
      if (!t) badRequest("نص عنصر التحقق لا يمكن أن يكون فارغًا");
      data.text = t;
    }
    if (body.done !== undefined) {
      data.done = !!body.done;
      data.completedAt = data.done ? new Date() : null;
    }
    if (body.required !== undefined) {
      data.required = !!body.required;
    }

    const updated = await db.taskChecklistItem.update({
      where: { id: body.id },
      data,
    });

    // إذا اكتمل عنصر إلزامي، نحدّث تقدم المهمة تقريبًا (اختياري)
    if (body.done !== undefined) {
      await refreshTaskProgress(id);
    }

    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    await audit({
      user,
      action: "update",
      entityType: "task_checklist",
      entityId: item.id,
      summary: `${data.done ? "أكمل" : "أعاد فتح"} عنصر تحقق "${item.text}" في مهمة "${task.title}"`,
      ip,
      userAgent: ua,
    });
    await activity({
      user,
      action: "checklist_toggle",
      entityType: "task",
      entityId: id,
      summary: `${data.done ? "أكمل" : "أعاد فتح"} عنصر تحقق في مهمة ${task.title}`,
      ip,
    });

    return updated;
  }

  // وضع الإضافة
  const text = (body.text || "").toString().trim();
  if (!text) badRequest("نص عنصر التحقق مطلوب");
  const required = !!body.required;
  const order = task.checklist.length > 0 ? Math.max(...task.checklist.map((c) => c.order)) + 1 : 0;

  const item = await db.taskChecklistItem.create({
    data: {
      taskId: id,
      text,
      required,
      order,
      createdById: user.id,
    },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "create",
    entityType: "task_checklist",
    entityId: item.id,
    summary: `أضاف عنصر تحقق "${text}" إلى مهمة "${task.title}"`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "checklist_add",
    entityType: "task",
    entityId: id,
    summary: `أضاف عنصر تحقق إلى مهمة ${task.title}`,
    ip,
  });

  return item;
});

async function refreshTaskProgress(taskId: string) {
  const items = await db.taskChecklistItem.findMany({ where: { taskId }, select: { done: true, required: true } });
  if (items.length === 0) return;
  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  await db.task.update({ where: { id: taskId }, data: { progress: pct } });
}
