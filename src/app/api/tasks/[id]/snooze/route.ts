import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

async function loadTaskAndCheckScope(id: string, user: { id: string }) {
  const task = await db.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new Error("NOT_FOUND");
  const viewAll = can(user as any, "task.view.all");
  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  if (!viewAll && !isCreator && !isAssignee) throw new Error("FORBIDDEN");
  return task;
}

/**
 * POST /api/tasks/[id]/snooze
 * تأجيل تنبيهات مهمة للمستخدم الحالي حتى تاريخ معيّن.
 * - لا يغيّر موعد المهمة (dueDate).
 * - يُنشئ/يحدّث سجل TaskSnooze (unique على taskId+userId).
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await loadTaskAndCheckScope(id, user);

  const body = await req.json().catch(() => ({}));
  const untilRaw = String(body.until || "").trim();
  if (!untilRaw) badRequest("تاريخ التأجيل مطلوب");
  const until = new Date(untilRaw);
  if (isNaN(until.getTime())) badRequest("تاريخ التأجيل غير صالح");
  if (until.getTime() <= Date.now()) {
    badRequest("تاريخ التأجيل يجب أن يكون في المستقبل");
  }

  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;

  const snooze = await db.taskSnooze.upsert({
    where: { taskId_userId: { taskId: id, userId: user.id } },
    create: { taskId: id, userId: user.id, until, reason },
    update: { until, reason },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "snooze",
    entityType: "task",
    entityId: id,
    after: { until: until.toISOString(), reason },
    summary: `تأجيل تنبيهات المهمة «${task.title}» حتى ${until.toLocaleString("ar-SA")}`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "snooze",
    entityType: "task",
    entityId: id,
    summary: `أجّل تنبيهات مهمة «${task.title}»`,
    ip,
  });

  return { ok: true, until: snooze.until };
});

/**
 * DELETE /api/tasks/[id]/snooze
 * إلغاء تأجيل التنبيهات (un-snooze) للمستخدم الحالي.
 */
export const DELETE = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await loadTaskAndCheckScope(id, user);

  await db.taskSnooze.deleteMany({ where: { taskId: id, userId: user.id } });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "unsnooze",
    entityType: "task",
    entityId: id,
    summary: `إلغاء تأجيل التنبيهات للمهمة «${task.title}»`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "unsnooze",
    entityType: "task",
    entityId: id,
    summary: `ألغى تأجيل تنبيهات مهمة «${task.title}»`,
    ip,
  });

  return { ok: true };
});
