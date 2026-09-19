import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, notFound, getClientIp } from "@/lib/api";
import { activity } from "@/lib/audit";

/**
 * POST /api/requests/[id]/notes
 * إضافة ملاحظة على الطلب.
 */
export const POST = apiHandler(async (req: Request, ctx: any) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const request = await db.request.findUnique({
    where: { id },
    select: { id: true, createdById: true, currentApproverRole: true, assignedToId: true, title: true },
  });
  if (!request) { notFound(); return; }

  // مسموح للمنشئ أو المعتمد الحالي أو المحاسب المسند
  const viewAll = can(user, "request.view.all");
  const isCreator = request.createdById === user.id;
  const isCurrentApprover = request.currentApproverRole === user.role;
  const isAssigned = request.assignedToId === user.id;
  if (!viewAll && !isCreator && !isCurrentApprover && !isAssigned) {
    throw new Error("FORBIDDEN");
  }

  const body = await req.json().catch(() => ({}));
  if (!body.text || !body.text.trim()) badRequest("نص الملاحظة مطلوب");

  const note = await db.requestNote.create({
    data: {
      requestId: id,
      userId: user.id,
      text: body.text.trim(),
    },
  });

  // إرفاق بيانات المستخدم (لا توجد علاقة مباشرة في المخطط)
  const noteUser = await db.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, role: true } });

  await activity({
    user,
    action: "comment",
    entityType: "request",
    entityId: id,
    summary: `إضافة ملاحظة على الطلب «${request.title}»`,
    ip: getClientIp(req),
  });

  return { ...note, user: noteUser };
});
