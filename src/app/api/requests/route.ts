import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";

/**
 * GET /api/requests
 * قائمة الطلبات مع فلاتر متقدمة.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const viewAll = can(user, "request.view.all");
  const viewOwn = can(user, "request.view.own");
  if (!viewAll && !viewOwn) throw new Error("FORBIDDEN");

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const requestTypeId = url.searchParams.get("requestTypeId");
  const costCenterId = url.searchParams.get("costCenterId");
  const projectId = url.searchParams.get("projectId");
  const vendorId = url.searchParams.get("vendorId");
  const mine = url.searchParams.get("mine") === "true";
  const pendingMyApproval = url.searchParams.get("pending_my_approval") === "true";
  const search = url.searchParams.get("search")?.trim();
  const minAmount = url.searchParams.get("minAmount");
  const maxAmount = url.searchParams.get("maxAmount");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));

  // بناء شروط البحث
  const where: any = { AND: [] as any[] };

  // صلاحية العرض
  if (!viewAll || mine) {
    where.AND.push({ createdById: user.id });
  }

  if (pendingMyApproval) {
    where.AND.push({
      currentApproverRole: user.role,
      status: { in: ["submitted", "under_review", "preliminarily_approved", "awaiting_final"] },
    });
  }

  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) where.AND.push({ status: statuses[0] });
    else if (statuses.length > 1) where.AND.push({ status: { in: statuses } });
  }
  if (requestTypeId) where.AND.push({ requestTypeId });
  if (costCenterId) where.AND.push({ costCenterId });
  if (projectId) where.AND.push({ projectId });
  if (vendorId) where.AND.push({ vendorId });
  if (search) {
    where.AND.push({
      OR: [
        { title: { contains: search } },
        { refCode: { contains: search } },
        { purpose: { contains: search } },
      ],
    });
  }
  if (minAmount) {
    const n = parseFloat(minAmount);
    if (!Number.isNaN(n)) where.AND.push({ totalAmount: { gte: n } });
  }
  if (maxAmount) {
    const n = parseFloat(maxAmount);
    if (!Number.isNaN(n)) where.AND.push({ totalAmount: { lte: n } });
  }

  const [total, items] = await Promise.all([
    db.request.count({ where }),
    db.request.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        requestType: true,
        costCenter: true,
        vendor: true,
        project: true,
        createdBy: { select: { id: true, name: true, role: true, jobTitle: true, department: { select: { name: true } } } },
        currentStep: true,
      },
    }),
  ]);

  return { items, total, page, pageSize };
});

/**
 * POST /api/requests
 * إنشاء طلب جديد مع تحديد مسار الاعتماد المناسب تلقائيًا.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "request.create")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const {
    requestTypeCode,
    requestTypeId,
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
    attachments = [],
    note,
  } = body as any;

  if (!title || !title.trim()) badRequest("العنوان مطلوب");
  if (!requestTypeCode && !requestTypeId) badRequest("نوع الطلب مطلوب");

  // تحديد نوع الطلب
  let reqType;
  if (requestTypeId) {
    reqType = await db.requestType.findUnique({ where: { id: requestTypeId } });
  } else if (requestTypeCode) {
    reqType = await db.requestType.findUnique({ where: { code: requestTypeCode } });
  }
  if (!reqType) badRequest("نوع الطلب غير موجود");

  const amt = amount != null && amount !== "" ? Number(amount) : null;
  const tax = taxAmount != null && taxAmount !== "" ? Number(taxAmount) : 0;
  const total = amt != null ? amt + (tax || 0) : null;

  // توليد رقم الطلب
  const lastReq = await db.request.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  const number = (lastReq?.number ?? 4999) + 1;

  // توليد رمز مرجعي
  const typePrefix: Record<string, string> = {
    purchase: "PUR",
    disbursement: "DSB",
    payment: "PAY",
    reimbursement: "EXP",
    custody: "CST",
    transfer: "TRF",
    contract: "CON",
    budget: "BUD",
    operational: "OPS",
    exception: "EXC",
  };
  const year = new Date().getFullYear();
  const prefix = typePrefix[reqType.code] ?? "REQ";
  const seq = String(number - 4999).padStart(3, "0");
  const refCode = body.refCode || `${prefix}-${year}-${seq}`;

  // تحديد مسار الاعتماد المناسب
  let workflow: any = null;
  let currentStepId: string | null = null;
  let currentApproverRole: string | null = null;
  let status = "submitted";

  if (amt != null) {
    const candidates = await db.approvalWorkflow.findMany({
      where: {
        active: true,
        OR: [{ requestTypeId: reqType.id }, { requestTypeId: null }],
        AND: [
          { OR: [{ minAmount: null }, { minAmount: { lte: amt } }] },
          { OR: [{ maxAmount: null }, { maxAmount: { gte: amt } }] },
        ],
      },
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    // أ prefer workflow bound to this requestType; fallback to generic
    workflow = candidates.find((w) => w.requestTypeId === reqType.id) ?? candidates[0] ?? null;
  }

  if (workflow && workflow.steps.length > 0) {
    const firstStep = workflow.steps[0];
    currentStepId = firstStep.id;
    currentApproverRole = firstStep.approverRole;
    status = "under_review"; // الطلب أصبح بانتظار المراجعة من أول جهة اعتماد
  }

  // إنشاء الطلب
  const request = await db.request.create({
    data: {
      number,
      refCode,
      requestTypeId: reqType.id,
      workflowId: workflow?.id ?? null,
      status,
      title: title.trim(),
      purpose: purpose?.trim() || null,
      amount: amt,
      taxAmount: tax || null,
      totalAmount: total,
      currency: currency || "SAR",
      costCenterId: costCenterId || null,
      projectId: projectId || null,
      vendorId: vendorId || null,
      beneficiary: beneficiary?.trim() || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: user.id,
      currentStepId,
      currentApproverRole,
      attachments: attachments.length
        ? {
            create: attachments.map((a: any) => ({
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileType: a.fileType || null,
              required: !!a.required,
            })),
          }
        : undefined,
      notes: note?.trim()
        ? { create: { userId: user.id, text: note.trim() } }
        : undefined,
    },
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

  // إشعار أول جهة اعتماد
  if (currentApproverRole) {
    const approvers = await db.user.findMany({
      where: { role: currentApproverRole, orgId: user.orgId, status: "active" },
    });
    for (const ap of approvers) {
      if (ap.id !== user.id) {
        await notify({
          userId: ap.id,
          actorId: user.id,
          type: "approval_required",
          title: `طلب اعتماد جديد: ${request.title}`,
          body: `${requestNumber(number)} — ${request.refCode}`,
          link: `request-detail:${request.id}`,
          entityType: "request",
          entityId: request.id,
        });
      }
    }
  }

  await activity({
    user,
    action: "create",
    entityType: "request",
    entityId: request.id,
    summary: `إنشاء طلب جديد «${request.title}» (${requestNumber(number)})`,
    ip: getClientIp(req),
  });

  await audit({
    user,
    action: "create",
    entityType: "request",
    entityId: request.id,
    after: { title: request.title, number, status, amount: amt, requestTypeId: reqType.id, workflowId: workflow?.id ?? null },
    summary: `إنشاء طلب ${requestNumber(number)}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return request;
});

function requestNumber(n: number): string {
  return `ط-${String(n).padStart(4, "0")}`;
}
