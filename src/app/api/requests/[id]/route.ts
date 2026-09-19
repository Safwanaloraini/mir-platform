import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can, canApproveRequest } from "@/lib/permissions";
import { apiHandler, badRequest, notFound, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

/**
 * GET /api/requests/[id]
 * تفاصيل الطلب الكاملة مع مسار الاعتماد والإجراءات والملاحظات.
 */
export const GET = apiHandler(async (req: Request, ctx: any) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const request = await db.request.findUnique({
    where: { id },
    include: {
      requestType: true,
      workflow: { include: { steps: { orderBy: { order: "asc" } } } },
      currentStep: true,
      costCenter: true,
      vendor: true,
      project: true,
      createdBy: { select: { id: true, name: true, nameEn: true, role: true, jobTitle: true, department: { select: { name: true } } } },
      assignedTo: { select: { id: true, name: true, role: true, jobTitle: true } },
      attachments: true,
      actions: { include: { user: { select: { id: true, name: true, role: true } }, step: true }, orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      task: { select: { id: true, number: true, title: true, status: true } },
    },
  });

  if (!request) { notFound(); return; }

  // إرفاق بيانات المستخدمين بالملاحظات (لا توجد علاقة مباشرة في المخطط)
  const noteUserIds = [...new Set(request.notes.map((n) => n.userId))];
  const noteUsers = noteUserIds.length
    ? await db.user.findMany({ where: { id: { in: noteUserIds } }, select: { id: true, name: true, role: true } })
    : [];
  const userMap = new Map(noteUsers.map((u) => [u.id, u]));
  const notesWithUser = request.notes.map((n) => ({ ...n, user: userMap.get(n.userId) ?? null }));

  const viewAll = can(user, "request.view.all");
  const isCreator = request.createdById === user.id;
  const isCurrentApprover = request.currentApproverRole === user.role;
  const isAssigned = request.assignedToId === user.id;
  if (!viewAll && !isCreator && !isCurrentApprover && !isAssigned) {
    throw new Error("FORBIDDEN");
  }

  // إخفاء الحقول المالية لمن لا يملك الصلاحية
  const canSeeAmounts = can(user, "finance.view.amounts");
  if (!canSeeAmounts) {
    (request as any).amount = null;
    (request as any).taxAmount = null;
    (request as any).totalAmount = null;
  }

  // معلومة مساعدة: هل يمكن للمستخدم الحالي اتخاذ إجراء؟
  const canTakeAction =
    canApproveRequest(user, request.createdById) &&
    isCurrentApprover &&
    ["under_review", "preliminarily_approved", "awaiting_final"].includes(request.status);

  const canExecute =
    user.role === "accountant" &&
    can(user, "request.execute") &&
    isAssigned &&
    ["forwarded_accountant", "in_execution", "fully_executed"].includes(request.status);

  return { ...request, notes: notesWithUser, _canTakeAction: canTakeAction, _canExecute: canExecute, _isCreator: isCreator };
});

/**
 * PATCH /api/requests/[id]
 * تعديل الطلب (للمسودات أو الطلبات المعادة للاستكمال فقط).
 */
export const PATCH = apiHandler(async (req: Request, ctx: any) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "request.edit")) throw new Error("FORBIDDEN");

  const { id } = await ctx.params;
  const existing = await db.request.findUnique({ where: { id }, include: { attachments: true } });
  if (!existing) { notFound(); return; }

  // فقط المنشئ يمكنه التعديل
  if (existing.createdById !== user.id) throw new Error("FORBIDDEN");

  // الحالات المسموح بتعديلها
  if (!["draft", "needs_completion"].includes(existing.status)) {
    badRequest("لا يمكن تعديل الطلب في حالته الحالية");
  }

  const body = await req.json().catch(() => ({}));
  const {
    title,
    purpose,
    amount,
    taxAmount,
    currency,
    costCenterId,
    projectId,
    vendorId,
    beneficiary,
    dueDate,
    attachments,
    submit,
  } = body as any;

  const data: any = {};
  if (title !== undefined) data.title = title?.trim();
  if (purpose !== undefined) data.purpose = purpose?.trim() || null;
  if (costCenterId !== undefined) data.costCenterId = costCenterId || null;
  if (projectId !== undefined) data.projectId = projectId || null;
  if (vendorId !== undefined) data.vendorId = vendorId || null;
  if (beneficiary !== undefined) data.beneficiary = beneficiary?.trim() || null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (currency !== undefined) data.currency = currency || "SAR";

  if (amount !== undefined) {
    const amt = amount !== "" ? Number(amount) : null;
    data.amount = amt;
    const tax = taxAmount !== undefined && taxAmount !== "" ? Number(taxAmount) : 0;
    data.taxAmount = tax || null;
    data.totalAmount = amt != null ? amt + (tax || 0) : null;
  }

  // تحديث مسار الاعتماد إذا تغير المبلغ
  if (data.amount != null) {
    const amt = data.amount;
    const candidates = await db.approvalWorkflow.findMany({
      where: {
        active: true,
        OR: [{ requestTypeId: existing.requestTypeId }, { requestTypeId: null }],
        AND: [
          { OR: [{ minAmount: null }, { minAmount: { lte: amt } }] },
          { OR: [{ maxAmount: null }, { maxAmount: { gte: amt } }] },
        ],
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    const wf = candidates.find((w) => w.requestTypeId === existing.requestTypeId) ?? candidates[0] ?? null;
    if (wf && wf.steps.length > 0) {
      data.workflowId = wf.id;
      data.currentStepId = wf.steps[0].id;
      data.currentApproverRole = wf.steps[0].approverRole;
    }
  }

  // إعادة إرسال الطلب
  if (submit === true) {
    if (existing.status === "needs_completion") {
      data.status = "under_review";
    } else if (existing.status === "draft") {
      data.status = data.currentApproverRole || existing.currentApproverRole ? "under_review" : "submitted";
    }
  }

  const updated = await db.request.update({
    where: { id },
    data,
    include: {
      requestType: true,
      workflow: { include: { steps: { orderBy: { order: "asc" } } } },
      currentStep: true,
      costCenter: true,
      vendor: true,
      project: true,
      createdBy: { select: { id: true, name: true, role: true, jobTitle: true } },
      attachments: true,
    },
  });

  // استبدال المرفقات إذا تم إرسالها
  let finalAttachments = updated.attachments;
  if (Array.isArray(attachments)) {
    await db.requestAttachment.deleteMany({ where: { requestId: id } });
    if (attachments.length > 0) {
      await db.requestAttachment.createMany({
        data: attachments.map((a: any) => ({
          requestId: id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileType: a.fileType || null,
          required: !!a.required,
        })),
      });
    }
    finalAttachments = await db.requestAttachment.findMany({ where: { requestId: id } });
  }

  await activity({
    user,
    action: "update",
    entityType: "request",
    entityId: id,
    summary: `تعديل الطلب «${updated.title}»`,
    ip: getClientIp(req),
  });

  await audit({
    user,
    action: "update",
    entityType: "request",
    entityId: id,
    before: { status: existing.status, title: existing.title, amount: existing.amount },
    after: { status: updated.status, title: updated.title, amount: updated.amount },
    summary: `تعديل الطلب ${updated.refCode ?? id}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return { ...updated, attachments: finalAttachments };
});

/**
 * POST /api/requests/[id]/notes
 * تُضاف هنا كمسار فرعي: إضافة ملاحظة على الطلب.
 * (موجودة في ملف notes/route.ts منفصل)
 */
