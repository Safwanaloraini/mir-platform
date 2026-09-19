import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

/**
 * POST /api/tasks/[id]/attachments
 * تسجيل مرفق (بيانات وصفية فقط — الرفع الفعلي يتم خارجيًا، نُخزّن المسار/الرابط).
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true, createdById: true, assignees: { select: { userId: true } } } });
  if (!task) throw new Error("NOT_FOUND");

  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  if (!can(user, "task.edit") && !isCreator && !isAssignee) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const fileName = (body.fileName || "").toString().trim();
  const fileUrl = (body.fileUrl || "").toString().trim();
  if (!fileName) badRequest("اسم الملف مطلوب");
  if (!fileUrl) badRequest("رابط الملف مطلوب");

  const fileType = body.fileType ? String(body.fileType) : null;
  const fileSize = body.fileSize != null ? Number(body.fileSize) : null;
  const required = !!body.required;

  const attachment = await db.taskAttachment.create({
    data: {
      taskId: id,
      userId: user.id,
      fileName,
      fileUrl,
      fileType,
      fileSize,
      required,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "create",
    entityType: "task_attachment",
    entityId: attachment.id,
    summary: `أضاف مرفقًا "${fileName}" إلى مهمة "${task.title}"`,
    after: { fileName, fileUrl, required },
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "attachment_add",
    entityType: "task",
    entityId: id,
    summary: `أضاف مرفقًا إلى مهمة ${task.title}`,
    ip,
  });

  return attachment;
});
