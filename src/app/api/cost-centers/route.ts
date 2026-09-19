import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

const CURRENT_YEAR = String(new Date().getFullYear());

/**
 * مراكز التكلفة: قائمة شجرية مسطحة + ميزانية السنة الحالية + مصروفات فعلية مُجمّعة
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.view")) throw new Error("FORBIDDEN");
  const seeAmounts = can(user, "finance.view.amounts");

  const costCenters = await db.costCenter.findMany({
    where: {},
    include: {
      manager: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, code: true } },
      budgets: {
        where: { period: CURRENT_YEAR },
      },
    },
    orderBy: { code: "asc" },
  });

  // تجميع المصروفات الفعلية لكل مركز تكلفة لهذه السنة
  let actualMap = new Map<string, number>();
  let countMap = new Map<string, number>();
  if (seeAmounts) {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const grouped = await db.expense.groupBy({
      by: ["costCenterId"],
      where: { date: { gte: startOfYear }, costCenterId: { not: null }, status: { notIn: ["cancelled"] } },
      _sum: { totalAmount: true },
      _count: true,
    });
    for (const g of grouped) {
      if (g.costCenterId) {
        actualMap.set(g.costCenterId, g._sum.totalAmount ?? 0);
        countMap.set(g.costCenterId, g._count);
      }
    }
  }

  const items = costCenters.map((cc) => {
    const budget = cc.budgets[0];
    const actual = seeAmounts ? actualMap.get(cc.id) ?? 0 : null;
    const planned = budget?.plannedAmount ?? 0;
    const committed = budget?.committedAmount ?? 0;
    const utilization = planned > 0 && actual != null ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
    return {
      id: cc.id,
      code: cc.code,
      name: cc.name,
      parentId: cc.parentId,
      parent: cc.parent ? { id: cc.parent.id, name: cc.parent.name, code: cc.parent.code } : null,
      managerId: cc.managerId,
      manager: cc.manager ? { id: cc.manager.id, name: cc.manager.name } : null,
      active: cc.active,
      createdAt: cc.createdAt,
      budget: budget
        ? {
            id: budget.id,
            period: budget.period,
            periodType: budget.periodType,
            plannedAmount: seeAmounts ? budget.plannedAmount : null,
            actualAmount: actual,
            committedAmount: seeAmounts ? budget.committedAmount : null,
            notes: budget.notes,
          }
        : null,
      actualSpent: actual,
      expenseCount: countMap.get(cc.id) ?? 0,
      utilization,
      budgetExceeded: seeAmounts && planned > 0 && (actual ?? 0) > planned,
      canSeeAmounts: seeAmounts,
    };
  });

  return { items, currentYear: CURRENT_YEAR, canSeeAmounts: seeAmounts };
});

export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.manage") && !can(user, "settings.manage")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const { code, name, parentId, managerId } = body || {};

  if (!code || typeof code !== "string" || !code.trim()) badRequest("رمز مركز التكلفة مطلوب");
  if (!name || typeof name !== "string" || !name.trim()) badRequest("اسم مركز التكلفة مطلوب");

  const existing = await db.costCenter.findUnique({ where: { code: code.trim() } });
  if (existing) badRequest("رمز مركز التكلفة مستخدم مسبقًا");
  if (parentId) {
    const parent = await db.costCenter.findUnique({ where: { id: parentId } });
    if (!parent) badRequest("مركز التكلفة الأب غير موجود");
  }

  const cc = await db.costCenter.create({
    data: {
      code: code.trim(),
      name: name.trim(),
      parentId: parentId || null,
      managerId: managerId || null,
      active: true,
    },
    include: {
      manager: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, code: true } },
    },
  });

  await audit({
    user,
    action: "create",
    entityType: "cost_center",
    entityId: cc.id,
    after: cc,
    summary: `إنشاء مركز تكلفة: ${cc.code} - ${cc.name}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return cc;
});
