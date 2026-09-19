import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, notify } from "@/lib/audit";
import { PAYMENT_METHODS } from "@/lib/constants";

/**
 * المدفوعات والمقبوضات: قائمة + إنشاء (مع تحديث حالة الفاتورة المرتبطة وإشعار منشئ الطلب)
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.view")) throw new Error("FORBIDDEN");
  const seeAmounts = can(user, "finance.view.amounts");

  const url = new URL(req.url);
  const params = url.searchParams;

  const type = params.get("type") || undefined;
  const method = params.get("method") || undefined;
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const vendorId = params.get("vendorId") || undefined;
  const invoiceId = params.get("invoiceId") || undefined;
  const requestId = params.get("requestId") || undefined;
  const search = params.get("search") || undefined;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") || "20", 10)));

  const where: any = {};
  if (type) where.type = type;
  if (method) where.method = method;
  if (vendorId) where.vendorId = vendorId;
  if (invoiceId) where.invoiceId = invoiceId;
  if (requestId) where.requestId = requestId;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      where.date.lte = d;
    }
  }
  if (search) {
    where.OR = [
      { number: { contains: search } },
      { reference: { contains: search } },
      { journalEntry: { contains: search } },
      { vendor: { name: { contains: search } } },
    ];
  }

  const [items, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        invoice: { select: { id: true, number: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payment.count({ where }),
  ]);

  return {
    items: items.map((p) => ({
      ...p,
      amount: seeAmounts ? p.amount : null,
    })),
    total,
    page,
    pageSize,
    canSeeAmounts: seeAmounts,
  };
});

export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.manage")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const {
    number, type, invoiceId, vendorId, requestId,
    date, amount, currency, method, reference, journalEntry,
  } = body || {};

  if (!number || typeof number !== "string" || !number.trim()) badRequest("رقم الدفعة مطلوب");
  if (type && !["outgoing", "incoming"].includes(type)) badRequest("نوع الدفعة غير صحيح");
  if (!method || !(method in PAYMENT_METHODS)) badRequest("طريقة الدفع غير صحيحة");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) badRequest("المبلغ غير صحيح");

  // التأكد من تفرّد الرقم
  const existing = await db.payment.findUnique({ where: { number: number.trim() } });
  if (existing) badRequest("رقم الدفعة مستخدم مسبقًا");

  const paymentDate = date ? new Date(date) : new Date();
  if (isNaN(paymentDate.getTime())) badRequest("تاريخ غير صحيح");

  // إنشاء الدفعة (معاملة)
  const payment = await db.payment.create({
    data: {
      number: number.trim(),
      type: type || "outgoing",
      invoiceId: invoiceId || null,
      vendorId: vendorId || null,
      requestId: requestId || null,
      date: paymentDate,
      amount: amt,
      currency: currency || "SAR",
      method,
      reference: reference || null,
      journalEntry: journalEntry || null,
      status: "executed",
      createdBy: user.id,
    },
    include: {
      vendor: { select: { id: true, name: true } },
      invoice: { select: { id: true, number: true, totalAmount: true } },
    },
  });

  // تحديث حالة الفاتورة المرتبطة
  let invoiceStatusChanged: { id: string; from: string; to: string } | null = null;
  if (invoiceId) {
    const inv = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: { select: { amount: true, status: true } } },
    });
    if (inv) {
      const paidAmount = (inv.payments || [])
        .filter((p) => p.status !== "cancelled")
        .reduce((s, p) => s + p.amount, 0);
      const newStatus = paidAmount >= inv.totalAmount ? "paid" : paidAmount > 0 ? "partial" : inv.status;
      if (newStatus !== inv.status) {
        await db.invoice.update({ where: { id: inv.id }, data: { status: newStatus } });
        invoiceStatusChanged = { id: inv.id, from: inv.status, to: newStatus };
      }
    }
  }

  await audit({
    user,
    action: "create",
    entityType: "payment",
    entityId: payment.id,
    after: { ...payment, invoiceStatusChanged },
    summary: `إنشاء دفعة رقم ${number} (${type === "incoming" ? "مقبوضات" : "مدفوعات"}) بقيمة ${amt} ${currency || "SAR"}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  // إشعار منشئ الطلب إذا كانت الدفعة مرتبطة بطلب
  if (requestId) {
    const req0 = await db.request.findUnique({
      where: { id: requestId },
      select: { id: true, createdById: true, number: true, title: true },
    });
    if (req0 && req0.createdById && req0.createdById !== user.id) {
      await notify({
        userId: req0.createdById,
        actorId: user.id,
        type: "payment_done",
        title: "تم تنفيذ دفعة لطلبك",
        body: `دفعة رقم ${number} بقيمة ${amt} ${currency || "SAR"} لطلب «${req0.title}»`,
        link: undefined,
        entityType: "request",
        entityId: req0.id,
      });
    }
  }

  return { payment, invoiceStatusChanged };
});
