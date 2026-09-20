import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

/**
 * PATCH /api/tasks/[id]/dod
 * تحديث "معيار الإنجاز" (Definition of Done) للمهمة.
 * - يتطلب صلاحية task.edit + (منشئ أو مسؤول).
 * - يدعم التحرير المتفائل عبر فحص version.
 */
export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const task = await db.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      version: true,
      definitionOfDone: true,
      createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new Error("NOT_FOUND");

  const isCreator = task.createdById === user.id;
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  if (!can(user, "task.edit")) throw new Error("FORBIDDEN");
  if (!isCreator && !isAssignee) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const definitionOfDoneRaw = body.definitionOfDone;
  if (definitionOfDoneRaw === undefined) {
    badRequest("حقل definitionOfDone مطلوب");
  }
  if (definitionOfDoneRaw !== null && typeof definitionOfDoneRaw !== "string") {
    badRequest("معيار الإنجاز يجب أن يكون نصًا");
  }
  const definitionOfDone =
    definitionOfDoneRaw === null ? null : String(definitionOfDoneRaw).trim();
  if (definitionOfDone && definitionOfDone.length > 5000) {
    badRequest("نص معيار الإنجاز طويل جدًا (الحد الأقصى 5000 حرف)");
  }

  // فحص التحرير المتفائل
  if (body.version !== undefined && body.version !== null) {
    const clientVersion = Number(body.version);
    if (!Number.isNaN(clientVersion) && clientVersion !== task.version) {
      badRequest("تم تعديل المهمة من قبل مستخدم آخر. أعد التحميل وحاول مجددًا.");
    }
  }

  const updated = await db.task.update({
    where: { id },
    data: {
      definitionOfDone,
      version: { increment: 1 },
    },
    select: { id: true, definitionOfDone: true, version: true },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "update",
    entityType: "task",
    entityId: id,
    before: { definitionOfDone: task.definitionOfDone, version: task.version },
    after: { definitionOfDone, version: updated.version },
    summary: `تحديث معيار الإنجاز للمهمة «${task.title}»`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "update",
    entityType: "task",
    entityId: id,
    summary: `حدّث معيار الإنجاز لمهمة «${task.title}»`,
    ip,
  });

  return updated;
});
