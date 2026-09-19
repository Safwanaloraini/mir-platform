import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler } from "@/lib/api";
import { formatCurrency } from "@/lib/constants";

export const GET = apiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const seeAmounts = can(user, "finance.view.amounts");
  const viewAllTasks = can(user, "task.view.all");

  // فلترة المهام حسب الصلاحية
  const taskWhere = viewAllTasks
    ? { orgId: user.orgId }
    : {
        OR: [
          { createdById: user.id },
          { assignees: { some: { userId: user.id } } },
        ],
      };

  const [
    openTasks,
    overdueTasks,
    stalledTasks,
    urgentTasks,
    completedThisMonth,
    completedLastMonth,
    myTasks,
    pendingApprovals,
    pendingPayments,
    expensesThisMonth,
    expensesLastMonth,
    upcomingInvoices,
    recentActivity,
    departments,
    deptLoad,
  ] = await Promise.all([
    db.task.count({ where: { ...taskWhere, status: { in: ["new", "assigned", "in_progress", "awaiting_info", "awaiting_approval", "stalled", "completed_review"] } } }),
    db.task.count({ where: { ...taskWhere, status: { notIn: ["completed_approved", "cancelled", "archived"] }, dueDate: { lt: now } } }),
    db.task.count({ where: { ...taskWhere, status: "stalled" } }),
    db.task.count({ where: { ...taskWhere, priority: "urgent", status: { notIn: ["completed_approved", "cancelled", "archived"] } } }),
    db.task.count({ where: { status: "completed_approved", updatedAt: { gte: startOfMonth } } }),
    db.task.count({ where: { status: "completed_approved", updatedAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
    db.task.count({ where: { assignees: { some: { userId: user.id } }, status: { notIn: ["completed_approved", "cancelled", "archived"] } } }),
    db.request.count({ where: { status: { in: ["under_review", "preliminarily_approved", "awaiting_final"] }, currentApproverRole: user.role } }),
    db.request.count({ where: { status: { in: ["forwarded_accountant", "in_execution"] }, assignedToId: user.id } }),
    seeAmounts ? db.expense.aggregate({ where: { date: { gte: startOfMonth } }, _sum: { totalAmount: true } }) : Promise.resolve({ _sum: { totalAmount: 0 } }),
    seeAmounts ? db.expense.aggregate({ where: { date: { gte: startOfLastMonth, lt: startOfMonth } }, _sum: { totalAmount: true } }) : Promise.resolve({ _sum: { totalAmount: 0 } }),
    seeAmounts ? db.invoice.findMany({ where: { status: { in: ["unpaid", "partial", "overdue"] }, dueDate: { gte: now }, type: "payable" }, take: 5, orderBy: { dueDate: "asc" }, include: { vendor: true, payments: true } }) : Promise.resolve([]),
    db.activityLog.findMany({ take: 8, orderBy: { createdAt: "desc" }, include: { user: true } }),
    db.department.findMany({ where: { orgId: user.orgId }, include: { _count: { select: { users: true, tasks: true } } } }),
    db.task.groupBy({ by: ["departmentId"], where: { status: { notIn: ["completed_approved", "cancelled", "archived"] }, departmentId: { not: null } }, _count: true }),
  ]);

  // المهام حسب الحالة (للرسم البياني)
  const tasksByStatus = await db.task.groupBy({
    by: ["status"],
    where: taskWhere,
    _count: true,
  });

  // المهام المتأخرة التفصيلية (أعلى 5)
  const topOverdue = await db.task.findMany({
    where: { ...taskWhere, status: { notIn: ["completed_approved", "cancelled", "archived"] }, dueDate: { lt: now } },
    take: 5,
    orderBy: { dueDate: "asc" },
    include: { assignees: { include: { user: true } }, department: true },
  });

  // الطلبات بانتظار الاعتماد (للمدير)
  const approvalRequests = can(user, "request.approve")
    ? await db.request.findMany({
        where: { status: { in: ["under_review", "preliminarily_approved", "awaiting_final"] }, currentApproverRole: user.role },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { requestType: true, createdBy: true },
      })
    : [];

  // ميزانية مقابل فعلي
  const budgets = seeAmounts ? await db.budget.findMany({ include: { costCenter: true }, where: { period: String(now.getFullYear()) } }) : [];

  const expensesThis = expensesThisMonth._sum.totalAmount ?? 0;
  const expensesLast = expensesLastMonth._sum.totalAmount ?? 0;
  const expenseTrend = expensesLast > 0 ? ((expensesThis - expensesLast) / expensesLast) * 100 : 0;

  const deptLoadMap = new Map(deptLoad.map((d) => [d.departmentId, d._count]));

  return {
    role: user.role,
    stats: {
      openTasks,
      overdueTasks,
      stalledTasks,
      urgentTasks,
      myTasks,
      pendingApprovals,
      pendingPayments,
      completedThisMonth,
      completedLastMonth,
      expensesThisMonth: seeAmounts ? expensesThis : null,
      expenseTrend: seeAmounts ? Math.round(expenseTrend) : null,
      upcomingPaymentsTotal: seeAmounts ? upcomingInvoices.reduce((s, i) => s + (i.totalAmount - (i.payments?.reduce?.((p, x) => p + x.amount, 0) ?? 0)), 0) : null,
    },
    tasksByStatus: tasksByStatus.map((t) => ({ status: t.status, count: t._count })),
    topOverdue,
    approvalRequests,
    upcomingInvoices: seeAmounts ? upcomingInvoices : [],
    recentActivity,
    departments: departments.map((d) => ({
      id: d.id,
      name: d.name,
      members: d._count.users,
      openTasks: deptLoadMap.get(d.id) ?? 0,
    })),
    budgets: budgets.map((b) => ({
      costCenter: b.costCenter.name,
      planned: b.plannedAmount,
      actual: b.actualAmount,
      utilization: b.plannedAmount > 0 ? Math.round((b.actualAmount / b.plannedAmount) * 100) : 0,
    })),
    canSeeAmounts: seeAmounts,
    currency: user.org?.currency ?? "SAR",
  };
});
