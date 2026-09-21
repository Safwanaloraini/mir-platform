import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

/**
 * DELETE /api/tasks/[id]/attachments/[attachmentId]
 * حذف مرفق من مهمة (مع حذف الملف الفعلي من قاعدة البيانات إن كان مرفوعًا محليًا).
 * الصلاحية: المنشئ أو المسؤول (task.edit) أو من رفع المرفق.
 */
export const DELETE = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id, attachmentId } = await ctx.params;

  const attachment = await db.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: { taskId: true, fileName: true, fileUrl: true, userId: true },
  });
  if (!attachment) throw new Error("NOT_FOUND");
  if (attachment.taskId !== id) throw new Error("NOT_FOUND");

  const task = await db.task.findUnique({
    where: { id },
    select: { title: true, createdById: true, assignees: { select: { userId: true } } },
  });
  if (!task) throw new Error("NOT_FOUND");

  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  const isUploader = attachment.userId === user.id;
  const canManage = can(user, "task.edit") || can(user, "task.delete");
  if (!isCreator && !isAssignee && !isUploader && !canManage) throw new Error("FORBIDDEN");

  // حذف المرفق من قاعدة البيانات
  await db.taskAttachment.delete({ where: { id: attachmentId } });

  // إن كان الملف مرفوعًا محليًا (URL يبدأ بـ /api/files/)، احذفه من FileAsset
  const match = attachment.fileUrl?.match(/^\/api\/files\/(.+)$/);
  if (match) {
    const fileId = match[1];
    try {
      await db.fileAsset.delete({ where: { id: fileId } });
    } catch {
      // الملف قد يكون محذوفًا مسبقًا — لا بأس
    }
  }

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "delete",
    entityType: "task_attachment",
    entityId: attachmentId,
    before: { fileName: attachment.fileName, fileUrl: attachment.fileUrl },
    summary: `حذف مرفقًا "${attachment.fileName}" من مهمة "${task.title}"`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "attachment_delete",
    entityType: "task",
    entityId: id,
    summary: `حذف مرفقًا من مهمة ${task.title}`,
    ip,
  });

  return { ok: true };
});
