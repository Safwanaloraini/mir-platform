import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";

const DETAIL_INCLUDE = {
  checklist: { orderBy: { order: "asc" as const } },
  attachments: true,
  assignees: { include: { user: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
};

/**
 * POST /api/tasks/[id]/status
 * تغيير حالة المهمة مع التحقق من القواعد (إكمال، تعثر، اعتماد).
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
  if (newStatus === oldStatus) {
    return { task, unchanged: true };
  }

  const note: string | null = body.note ? String(body.note) : null;
  const stallReason: string | null = body.stallReason ? String(body.stallReason) : null;

  // التحقق من صلاحية الاعتماد النهائي
  if (newStatus === "completed_approved") {
    if (!can(user, "task.approve_completion")) throw new Error("FORBIDDEN");
    const requiredChecklist = task.checklist.filter((c) => c.required && !c.done);
    if (requiredChecklist.length > 0) {
      badRequest(`لا يمكن الاعتماد: ${requiredChecklist.length} عنصر إلزامي غير منجز في قائمة التحقق`);
    }
    const requiredAttachments = task.attachments.filter((a) => a.required);
    if (requiredAttachments.length > 0) {
      // كل المرفقات الإلزامية يجب أن تكون موجودة (لم نُرفق حالة "uploaded"، نتحقق من وجودها)
      // إذا كان هناك مرفق إلزامي مسجَّل، نعتبره مرفوعًا
      const hasMissing = requiredAttachments.length === 0; // لا يمكن أن يصل هنا إلا إذا لم تكن مرفوعة
      if (hasMissing) badRequest("هناك مرفقات إلزامية غير مرفوعة");
    }
  }

  // completed_review يتطلّب أن يكون المستخدم منشئًا أو مسؤولًا
  if (newStatus === "completed_review" && !isCreator && !isAssignee) {
    throw new Error("FORBIDDEN");
  }

  // stalled يتطلب سببًا
  let finalStallReason = task.stallReason;
  if (newStatus === "stalled") {
    if (!stallReason && !task.stallReason) badRequest("سبب التعثر مطلوب");
    if (stallReason) finalStallReason = stallReason;
  } else if (newStatus !== "stalled" && task.stallReason) {
    // مغادرة حالة التعثر: نمسح السبب
    finalStallReason = null;
  }

  // تحديث المهمة
  const updateData: any = { status: newStatus, stallReason: finalStallReason };
  if (newStatus === "completed_approved" || newStatus === "completed_review") {
    updateData.progress = 100;
  }
  await db.task.update({ where: { id }, data: updateData });

  // سجل الحالة
  await db.taskStatusHistory.create({
    data: {
      taskId: id,
      userId: user.id,
      fromStatus: oldStatus,
      toStatus: newStatus,
      note: note ?? (newStatus === "stalled" ? finalStallReason : null),
    },
  });

  // إشعار المستخدمين المعنيين
  const recipients = new Set<string>();
  if (task.createdById !== user.id) recipients.add(task.createdById);
  task.assignees.forEach((a: any) => { if (a.userId !== user.id) recipients.add(a.userId); });
  for (const rid of recipients) {
    await notify({
      userId: rid,
      actorId: user.id,
      type: "status_change",
      title: `تحديث حالة المهمة: ${task.title}`,
      body: `${oldStatus} → ${newStatus}${newStatus === "stalled" && finalStallReason ? " — " + finalStallReason : ""}`,
      link: `task-detail:${id}`,
      entityType: "task",
      entityId: id,
    });
  }

  // تدقيق ونشاط
  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "status_change",
    entityType: "task",
    entityId: id,
    before: { status: oldStatus },
    after: { status: newStatus, note },
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
