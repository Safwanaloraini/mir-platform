import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/constants";

/**
 * المصروفات: قائمة مع فلاتر + ملخص + إنشاء
 * - GET  يتطلب finance.view
 * - POST يتطلب finance.manage
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.view")) throw new Error("FORBIDDEN");
  const seeAmounts = can(user, "finance.view.amounts");

  const url = new URL(req.url);
  const params = url.searchParams;

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const category = params.get("category") || undefined;
  const costCenterId = params.get("costCenterId") || undefined;
  const vendorId = params.get("vendorId") || undefined;
  const status = params.get("status") || undefined;
  const requestId = params.get("requestId") || undefined;
  const search = params.get("search") || undefined;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") || "20", 10)));
  const summaryFlag = params.get("summary") === "true";

  // مرشّح مشترك
  const where: any = {};
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      where.date.lte = d;
    }
  }
  if (category) where.category = category;
  if (costCenterId) where.costCenterId = costCenterId;
  if (vendorId) where.vendorId = vendorId;
  if (status) where.status = status;
  if (requestId) where.requestId = requestId;
  if (search) where.description = { contains: search };

  // وضع الملخص التجميعي
  if (summaryFlag) {
    const [totalAgg, byCategory, byCostCenter, byMonth] = await Promise.all([
      db.expense.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
      db.expense.groupBy({
        by: ["category"],
        where,
        _sum: { totalAmount: true },
        _count: true,
      }),
      db.expense.groupBy({
        by: ["costCenterId"],
        where: { ...where, costCenterId: { not: null } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      db.expense.findMany({
        where,
        select: { date: true, totalAmount: true },
      }),
    ]);

    // تكوين byCostCenter مع الأسماء
    const ccIds = byCostCenter.map((c) => c.costCenterId).filter(Boolean) as string[];
    const costCenters = ccIds.length
      ? await db.costCenter.findMany({ where: { id: { in: ccIds } }, select: { id: true, name: true } })
      : [];
    const ccMap = new Map(costCenters.map((c) => [c.id, c.name]));

    // تجميع شهري
    const monthMap = new Map<string, number>();
    for (const e of byMonth) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + (e.totalAmount ?? 0));
    }
    const byMonthArr = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, total]) => ({ month, total }));

    return {
      total: totalAgg._sum.totalAmount ?? 0,
      count: totalAgg._count,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        label: (EXPENSE_CATEGORIES as any)[c.category] ?? c.category,
        total: c._sum.totalAmount ?? 0,
        count: c._count,
      })),
      byCostCenter: byCostCenter.map((c) => ({
        costCenterId: c.costCenterId,
        name: c.costCenterId ? ccMap.get(c.costCenterId) ?? "—" : "غير محدد",
        total: c._sum.totalAmount ?? 0,
        count: c._count,
      })),
      byMonth: byMonthArr,
      canSeeAmounts: seeAmounts,
    };
  }

  const [items, total] = await Promise.all([
    db.expense.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, name: true } },
        invoice: { select: { id: true, number: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.expense.count({ where }),
  ]);

  return {
    items: items.map((e) => ({
      ...e,
      amount: seeAmounts ? e.amount : null,
      taxAmount: seeAmounts ? e.taxAmount : null,
      totalAmount: seeAmounts ? e.totalAmount : null,
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
  const { date, vendorId, costCenterId, requestId, taskId, category, description, amount, taxAmount, currency, paymentMethod } = body || {};

  if (!category || !(category in EXPENSE_CATEGORIES)) badRequest("فئة المصروف غير صحيحة");
  if (!description || typeof description !== "string" || !description.trim()) badRequest("الوصف مطلوب");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) badRequest("المبلغ غير صحيح");
  const tax = taxAmount != null ? Number(taxAmount) : 0;
  if (!Number.isFinite(tax) || tax < 0) badRequest("قيمة الضريبة غير صحيحة");
  if (paymentMethod && !(paymentMethod in PAYMENT_METHODS)) badRequest("طريقة الدفع غير صحيحة");

  // رقم تسلسلي
  const last = await db.expense.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  const number = (last?.number ?? 0) + 1;

  const totalAmount = amt + (tax || 0);
  const expenseDate = date ? new Date(date) : new Date();
  if (isNaN(expenseDate.getTime())) badRequest("تاريخ غير صحيح");

  const expense = await db.expense.create({
    data: {
      number,
      date: expenseDate,
      vendorId: vendorId || null,
      costCenterId: costCenterId || null,
      requestId: requestId || null,
      taskId: taskId || null,
      category,
      description: description.trim(),
      amount: amt,
      taxAmount: tax || null,
      totalAmount,
      currency: currency || "SAR",
      paymentMethod: paymentMethod || null,
      status: "pending",
      createdBy: user.id,
    },
    include: {
      vendor: { select: { id: true, name: true } },
      costCenter: { select: { id: true, name: true, code: true } },
    },
  });

  await audit({
    user,
    action: "create",
    entityType: "expense",
    entityId: expense.id,
    after: expense,
    summary: `إنشاء مصروف رقم ${number}: ${description.slice(0, 60)}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return expense;
});
