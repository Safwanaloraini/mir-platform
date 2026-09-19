import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, notify } from "@/lib/audit";

/**
 * الميزانيات: قائمة مع فلاتر + upsert حسب (costCenterId + period)
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.view")) throw new Error("FORBIDDEN");
  const seeAmounts = can(user, "finance.view.amounts");

  const url = new URL(req.url);
  const params = url.searchParams;
  const period = params.get("period") || undefined;
  const costCenterId = params.get("costCenterId") || undefined;

  const where: any = {};
  if (period) where.period = period;
  if (costCenterId) where.costCenterId = costCenterId;

  const budgets = await db.budget.findMany({
    where,
    include: { costCenter: { select: { id: true, name: true, code: true } } },
    orderBy: [{ period: "desc" }, { costCenter: { code: "asc" } }],
  });

  return {
    items: budgets.map((b) => ({
      ...b,
      plannedAmount: seeAmounts ? b.plannedAmount : null,
      actualAmount: seeAmounts ? b.actualAmount : null,
      committedAmount: seeAmounts ? b.committedAmount : null,
      utilization:
        seeAmounts && b.plannedAmount > 0
          ? Math.min(100, Math.round((b.actualAmount / b.plannedAmount) * 100))
          : 0,
    })),
    canSeeAmounts: seeAmounts,
  };
});

export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.manage")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const { costCenterId, period, periodType, plannedAmount, notes } = body || {};

  if (!costCenterId) badRequest("مركز التكلفة مطلوب");
  if (!period || typeof period !== "string" || !period.trim()) badRequest("الفترة مطلوبة");
  const planned = Number(plannedAmount);
  if (!Number.isFinite(planned) || planned < 0) badRequest("المبلغ المخطط غير صحيح");

  const cc = await db.costCenter.findUnique({ where: { id: costCenterId } });
  if (!cc) badRequest("مركز التكلفة غير موجود");

  const pType = ["yearly", "quarterly", "monthly"].includes(periodType) ? periodType : "yearly";

  // upsert بناءً على (costCenterId + period)
  const existing = await db.budget.findUnique({
    where: { costCenterId_period: { costCenterId, period: period.trim() } },
  });

  let budget;
  let action: "create" | "update";
  if (existing) {
    budget = await db.budget.update({
      where: { id: existing.id },
      data: {
        plannedAmount: planned,
        periodType: pType,
        notes: notes ?? existing.notes,
      },
      include: { costCenter: { select: { id: true, name: true, code: true } } },
    });
    action = "update";
  } else {
    budget = await db.budget.create({
      data: {
        costCenterId,
        period: period.trim(),
        periodType: pType,
        plannedAmount: planned,
        actualAmount: 0,
        committedAmount: 0,
        notes: notes || null,
      },
      include: { costCenter: { select: { id: true, name: true, code: true } } },
    });
    action = "create";
  }

  // التحقق من تجاوز الميزانية (إذا الفعلي > المخطط) وإشعار المدير المعني
  if (budget.costCenter?.managerId && budget.actualAmount > planned) {
    await notify({
      userId: budget.costCenter.managerId,
      actorId: user.id,
      type: "budget_exceeded",
      title: "تجاوز ميزانية مركز التكلفة",
      body: `مركز «${budget.costCenter.name}» للفترة ${period}: الفعلي ${budget.actualAmount} يتجاوز المخطط ${planned}`,
      entityType: "cost_center",
      entityId: budget.costCenter.id,
    });
  }

  await audit({
    user,
    action,
    entityType: "budget",
    entityId: budget.id,
    after: budget,
    summary: `${action === "create" ? "إنشاء" : "تعديل"} ميزانية مركز ${budget.costCenter?.name} للفترة ${period} بقيمة ${planned}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return budget;
});
