import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";
import { INVOICE_STATUSES } from "@/lib/constants";

/**
 * الفواتير: قائمة مع فلاتر + إنشاء
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.view")) throw new Error("FORBIDDEN");
  const seeAmounts = can(user, "finance.view.amounts");

  const url = new URL(req.url);
  const params = url.searchParams;

  const status = params.get("status") || undefined;
  const type = params.get("type") || undefined;
  const vendorId = params.get("vendorId") || undefined;
  const overdue = params.get("overdue") === "true";
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const search = params.get("search") || undefined;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") || "20", 10)));

  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (vendorId) where.vendorId = vendorId;
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
      { vendor: { name: { contains: search } } },
    ];
  }
  if (overdue) {
    where.status = { in: ["unpaid", "partial", "overdue"] };
    where.dueDate = { lt: new Date() };
  }

  const [items, total] = await Promise.all([
    db.invoice.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        payments: { select: { amount: true, status: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.invoice.count({ where }),
  ]);

  const now = new Date();
  return {
    items: items.map((inv) => {
      const paidAmount = (inv.payments || [])
        .filter((p) => p.status !== "cancelled")
        .reduce((s, p) => s + p.amount, 0);
      const isOverdue =
        inv.status !== "paid" &&
        inv.status !== "cancelled" &&
        inv.dueDate &&
        new Date(inv.dueDate) < now;
      return {
        ...inv,
        amount: seeAmounts ? inv.amount : null,
        taxAmount: seeAmounts ? inv.taxAmount : null,
        totalAmount: seeAmounts ? inv.totalAmount : null,
        paidAmount: seeAmounts ? paidAmount : null,
        remaining: seeAmounts ? Math.max(0, inv.totalAmount - paidAmount) : null,
        isOverdue,
      };
    }),
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
  const { number, vendorId, customerId, type, date, dueDate, amount, taxAmount, currency, expenseId, requestId, status } = body || {};

  if (!number || typeof number !== "string" || !number.trim()) badRequest("رقم الفاتورة مطلوب");
  if (type && !["payable", "receivable"].includes(type)) badRequest("نوع الفاتورة غير صحيح");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) badRequest("المبلغ غير صحيح");
  const tax = taxAmount != null ? Number(taxAmount) : 0;
  if (!Number.isFinite(tax) || tax < 0) badRequest("قيمة الضريبة غير صحيحة");
  if (status && !(status in INVOICE_STATUSES)) badRequest("حالة غير صحيحة");

  // التأكد من تفرّد الرقم
  const existing = await db.invoice.findUnique({ where: { number: number.trim() } });
  if (existing) badRequest("رقم الفاتورة مستخدم مسبقًا");

  const totalAmount = amt + (tax || 0);
  const invoiceDate = date ? new Date(date) : new Date();
  if (isNaN(invoiceDate.getTime())) badRequest("تاريخ غير صحيح");
  const due = dueDate ? new Date(dueDate) : null;
  if (dueDate && due && isNaN(due.getTime())) badRequest("تاريخ الاستحقاق غير صحيح");

  const invoice = await db.invoice.create({
    data: {
      number: number.trim(),
      vendorId: vendorId || null,
      customerId: customerId || null,
      type: type || "payable",
      date: invoiceDate,
      dueDate: due,
      amount: amt,
      taxAmount: tax || null,
      totalAmount,
      currency: currency || "SAR",
      status: status || "unpaid",
      expenseId: expenseId || null,
      requestId: requestId || null,
      createdBy: user.id,
    },
    include: {
      vendor: { select: { id: true, name: true } },
    },
  });

  await audit({
    user,
    action: "create",
    entityType: "invoice",
    entityId: invoice.id,
    after: invoice,
    summary: `إنشاء فاتورة رقم ${number}: ${type === "receivable" ? "مقبوضات" : "مدفوعات"}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return invoice;
});
