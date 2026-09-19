import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";

/**
 * POST /api/tasks/[id]/comments
 * إضافة تعليق على المهمة (مع mentions اختيارية).
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true, createdById: true, assignees: { select: { userId: true } } } });
  if (!task) throw new Error("NOT_FOUND");

  const viewAll = can(user, "task.view.all");
  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  if (!viewAll && !isCreator && !isAssignee) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const text = (body.text || "").toString().trim();
  if (!text) badRequest("نص التعليق مطلوب");

  const mentionsRaw: string = Array.isArray(body.mentions) ? body.mentions.filter(Boolean).join(",") : (body.mentions || "").toString().trim();
  const mentionIds = mentionsRaw ? mentionsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const comment = await db.taskComment.create({
    data: {
      taskId: id,
      userId: user.id,
      text,
      mentions: mentionIds.length > 0 ? mentionIds.join(",") : null,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, jobTitle: true } },
    },
  });

  // إشعار المنشئ/المسؤولين بتعليق جديد
  const recipients = new Set<string>();
  if (task.createdById !== user.id) recipients.add(task.createdById);
  task.assignees.forEach((a) => { if (a.userId !== user.id) recipients.add(a.userId); });
  // إشارة @mention
  mentionIds.forEach((uid) => { if (uid !== user.id) recipients.add(uid); });

  for (const rid of recipients) {
    await notify({
      userId: rid,
      actorId: user.id,
      type: mentionIds.includes(rid) ? "mention" : "comment",
      title: `تعليق جديد على: ${task.title}`,
      body: text.length > 80 ? text.slice(0, 80) + "…" : text,
      link: `task-detail:${id}`,
      entityType: "task",
      entityId: id,
    });
  }

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "create",
    entityType: "task_comment",
    entityId: comment.id,
    summary: `أضاف تعليقًا على مهمة "${task.title}"`,
    after: { text: text.slice(0, 200) },
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "comment",
    entityType: "task",
    entityId: id,
    summary: `علّق على مهمة ${task.title}`,
    ip,
  });

  return comment;
});
