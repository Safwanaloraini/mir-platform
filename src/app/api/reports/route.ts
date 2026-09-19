import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest } from "@/lib/api";
import {
  TASK_STATUSES, TASK_PRIORITIES, EXPENSE_CATEGORIES, REQUEST_TYPES, REQUEST_STATUSES,
} from "@/lib/constants";

/**
 * GET /api/reports?type=...&dateFrom=...&dateTo=...
 *
 * أنواع التقارير المتاحة:
 *   - tasks_by_status          : المهام حسب الحالة
 *   - tasks_by_assignee        : المهام حسب المسؤول (عدد، متأخرة، مكتملة، متوسط زمن الإنجاز)
 *   - overdue_tasks            : قائمة المهام المتأخرة
 *   - requests_by_type         : الطلبات حسب النوع (عدد، مجموع المبالغ)
 *   - requests_by_status       : الطلبات حسب الحالة
 *   - avg_approval_hours       : متوسط زمن الاعتماد (ساعات)
 *   - expenses_by_category     : المصروفات حسب البند
 *   - expenses_by_project      : المصروفات حسب المشروع
 *   - expenses_by_cost_center  : المصروفات حسب مركز التكلفة
 *   - budget_vs_actual         : الميزانية مقابل الفعلي
 *   - department_performance   : أداء الإدارات
 *   - decisions_implementation  : تنفيذ القرارات
 *
 * المبالغ لا تُرجع إلا لمن يملك finance.view.amounts.
 */
export const GET = apiHandler(async (req) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "report.view")) throw new Error("FORBIDDEN");

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  if (!type) badRequest("type مطلوب");

  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (from && isNaN(from.getTime())) badRequest("dateFrom غير صالح");
  if (to && isNaN(to.getTime())) badRequest("dateTo غير صالح");
  const dateRange = from && to ? { gte: from, lte: to } : from ? { gte: from } : to ? { lte: to } : undefined;

  const seeAmounts = can(user, "finance.view.amounts");
  const viewAllTasks = can(user, "task.view.all");
  const orgId = user.orgId;

  // نطاق المهام حسب الصلاحية
  const taskWhere = viewAllTasks
    ? { orgId }
    : { OR: [{ createdById: user.id }, { assignees: { some: { userId: user.id } } }] };

  switch (type) {
    case "tasks_by_status":
      return await tasksByStatus(taskWhere);

    case "tasks_by_assignee":
      return await tasksByAssignee(taskWhere);

    case "overdue_tasks":
      return await overdueTasks(taskWhere);

    case "requests_by_type":
      return await requestsByType(orgId, seeAmounts, dateRange);

    case "requests_by_status":
      return await requestsByStatus(orgId, dateRange);

    case "avg_approval_hours":
      return await avgApprovalHours(orgId, dateRange);

    case "expenses_by_category":
      if (!seeAmounts) return { items: [], canSeeAmounts: false };
      return await expensesByCategory(dateRange);

    case "expenses_by_project":
      if (!seeAmounts) return { items: [], canSeeAmounts: false };
      return await expensesByProject(dateRange);

    case "expenses_by_cost_center":
      if (!seeAmounts) return { items: [], canSeeAmounts: false };
      return await expensesByCostCenter(dateRange);

    case "budget_vs_actual":
      if (!seeAmounts) return { items: [], canSeeAmounts: false };
      return await budgetVsActual();

    case "department_performance":
      return await departmentPerformance(orgId);

    case "decisions_implementation":
      return await decisionsImplementation(orgId);

    default:
      badRequest(`نوع تقرير غير معروف: ${type}`);
  }
});

// ============ التطبيقات ============

async function tasksByStatus(taskWhere: any) {
  const groups = await db.task.groupBy({
    by: ["status"],
    where: taskWhere,
    _count: true,
  });
  const items = groups.map((g) => ({
    status: g.status,
    label: (TASK_STATUSES as any)[g.status]?.label ?? g.status,
    color: (TASK_STATUSES as any)[g.status]?.color ?? "slate",
    count: g._count,
  }));
  // ضمان ترتيب ثابت حسب ترتيب TASK_STATUSES
  const order = Object.keys(TASK_STATUSES);
  items.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return { items, chartType: "pie" };
}

async function tasksByAssignee(taskWhere: any) {
  const assignees = await db.taskAssignee.findMany({
    where: { task: taskWhere },
    select: {
      userId: true,
      user: { select: { name: true } },
      task: {
        select: {
          status: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  const now = new Date();
  const map = new Map<string, { name: string; count: number; overdue: number; completed: number; totalHours: number; completedCount: number }>();
  for (const a of assignees) {
    const cur = map.get(a.userId) ?? { name: a.user.name, count: 0, overdue: 0, completed: 0, totalHours: 0, completedCount: 0 };
    cur.count++;
    const isClosed = a.task.status === "completed_approved" || a.task.status === "cancelled" || a.task.status === "archived";
    if (a.task.status === "completed_approved") {
      cur.completed++;
      if (a.task.createdAt && a.task.updatedAt) {
        const hours = (a.task.updatedAt.getTime() - a.task.createdAt.getTime()) / 3_600_000;
        cur.totalHours += hours;
        cur.completedCount++;
      }
    }
    if (!isClosed && a.task.dueDate && a.task.dueDate < now) cur.overdue++;
    map.set(a.userId, cur);
  }
  const items = Array.from(map.entries()).map(([userId, v]) => ({
    userId,
    name: v.name,
    count: v.count,
    overdue: v.overdue,
    completed: v.completed,
    avgCompletionHours: v.completedCount > 0 ? Math.round((v.totalHours / v.completedCount) * 10) / 10 : null,
  }));
  items.sort((a, b) => b.count - a.count);
  return { items, chartType: "bar" };
}

async function overdueTasks(taskWhere: any) {
  const now = new Date();
  const tasks = await db.task.findMany({
    where: { ...taskWhere, status: { notIn: ["completed_approved", "cancelled", "archived"] }, dueDate: { lt: now } },
    orderBy: { dueDate: "asc" },
    take: 200,
    include: {
      assignees: { include: { user: { select: { name: true } } } },
      department: { select: { name: true } },
    },
  });
  const items = tasks.map((t) => {
    const due = t.dueDate!;
    const daysLate = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
    return {
      id: t.id,
      number: t.number,
      title: t.title,
      priority: t.priority,
      priorityLabel: (TASK_PRIORITIES as any)[t.priority]?.label ?? t.priority,
      status: t.status,
      statusLabel: (TASK_STATUSES as any)[t.status]?.label ?? t.status,
      dueDate: due,
      daysLate,
      assignees: t.assignees.map((a) => a.user.name),
      department: t.department?.name ?? null,
    };
  });
  return { items, total: items.length, chartType: "table" };
}

async function requestsByType(orgId: string, seeAmounts: boolean, dateRange: any) {
  const where: any = { createdBy: { orgId } };
  if (dateRange) where.createdAt = dateRange;
  const rows = await db.request.findMany({
    where,
    select: { requestType: { select: { code: true, nameAr: true } }, totalAmount: true, amount: true },
  });
  const map = new Map<string, { type: string; label: string; count: number; totalAmount: number }>();
  for (const r of rows) {
    const code = r.requestType.code;
    const cur = map.get(code) ?? { type: code, label: r.requestType.nameAr, count: 0, totalAmount: 0 };
    cur.count++;
    cur.totalAmount += r.totalAmount ?? r.amount ?? 0;
    map.set(code, cur);
  }
  const items = Array.from(map.values()).sort((a, b) => b.count - a.count);
  return { items, chartType: "bar", canSeeAmounts: seeAmounts };
}

async function requestsByStatus(orgId: string, dateRange: any) {
  const where: any = { createdBy: { orgId } };
  if (dateRange) where.createdAt = dateRange;
  const groups = await db.request.groupBy({
    by: ["status"],
    where,
    _count: true,
  });
  const items = groups.map((g) => ({
    status: g.status,
    label: (REQUEST_STATUSES as any)[g.status]?.label ?? g.status,
    color: (REQUEST_STATUSES as any)[g.status]?.color ?? "slate",
    count: g._count,
  }));
  const order = Object.keys(REQUEST_STATUSES);
  items.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return { items, chartType: "pie" };
}

async function avgApprovalHours(orgId: string, dateRange: any) {
  // متوسط الفارق بين تاريخ إنشاء الطلب وأحدث إجراء اعتماد (approve) نهائي
  const where: any = { createdBy: { orgId }, status: { in: ["approved", "fully_executed", "closed"] } };
  if (dateRange) where.createdAt = dateRange;
  const requests = await db.request.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      actions: {
        where: { action: "approve" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
    take: 500,
  });
  let total = 0;
  let count = 0;
  const items: { requestId: string; hours: number; createdAt: Date; approvedAt: Date | null }[] = [];
  for (const r of requests) {
    if (r.actions.length === 0) continue;
    const approvedAt = r.actions[0].createdAt;
    const hours = (approvedAt.getTime() - r.createdAt.getTime()) / 3_600_000;
    total += hours;
    count++;
    items.push({ requestId: r.id, hours: Math.round(hours * 10) / 10, createdAt: r.createdAt, approvedAt });
  }
  const avg = count > 0 ? Math.round((total / count) * 10) / 10 : null;
  return { avg, count, chartType: "stat" };
}

async function expensesByCategory(dateRange: any) {
  const where: any = {};
  if (dateRange) where.date = dateRange;
  const groups = await db.expense.groupBy({
    by: ["category"],
    where,
    _sum: { totalAmount: true },
    _count: true,
  });
  const items = groups.map((g) => ({
    category: g.category,
    label: (EXPENSE_CATEGORIES as any)[g.category] ?? g.category,
    total: g._sum.totalAmount ?? 0,
    count: g._count,
  }));
  items.sort((a, b) => b.total - a.total);
  return { items, chartType: "pie", canSeeAmounts: true };
}

async function expensesByProject(dateRange: any) {
  const where: any = {};
  if (dateRange) where.date = dateRange;
  const expenses = await db.expense.findMany({
    where,
    select: {
      totalAmount: true,
      requestId: true,
      request: { select: { projectId: true, project: { select: { name: true } } } },
    },
  });
  const map = new Map<string, { project: string; total: number }>();
  for (const e of expenses) {
    const projName = e.request?.project?.name ?? "غير مرتبط بمشروع";
    const cur = map.get(projName) ?? { project: projName, total: 0 };
    cur.total += e.totalAmount;
    map.set(projName, cur);
  }
  const items = Array.from(map.values()).sort((a, b) => b.total - a.total);
  return { items, chartType: "bar", canSeeAmounts: true };
}

async function expensesByCostCenter(dateRange: any) {
  const where: any = {};
  if (dateRange) where.date = dateRange;
  const expenses = await db.expense.findMany({
    where,
    select: { totalAmount: true, costCenterId: true, costCenter: { select: { name: true } } },
  });
  const map = new Map<string, { costCenter: string; total: number; count: number }>();
  for (const e of expenses) {
    const name = e.costCenter?.name ?? "بدون مركز تكلفة";
    const cur = map.get(name) ?? { costCenter: name, total: 0, count: 0 };
    cur.total += e.totalAmount;
    cur.count++;
    map.set(name, cur);
  }
  const items = Array.from(map.values()).sort((a, b) => b.total - a.total);
  return { items, chartType: "bar", canSeeAmounts: true };
}

async function budgetVsActual() {
  const year = new Date().getFullYear();
  const budgets = await db.budget.findMany({
    where: { period: { startsWith: String(year) } },
    include: { costCenter: { select: { name: true } } },
  });
  const items = budgets.map((b) => ({
    costCenter: b.costCenter.name,
    period: b.period,
    planned: b.plannedAmount,
    actual: b.actualAmount,
    utilization: b.plannedAmount > 0 ? Math.round((b.actualAmount / b.plannedAmount) * 100) : 0,
  }));
  items.sort((a, b) => b.utilization - a.utilization);
  return { items, year, chartType: "bar", canSeeAmounts: true };
}

async function departmentPerformance(orgId: string) {
  const departments = await db.department.findMany({
    where: { orgId },
    include: {
      tasks: {
        select: { status: true, dueDate: true, createdAt: true, updatedAt: true },
      },
    },
  });
  const now = new Date();
  const items = departments.map((d) => {
    const total = d.tasks.length;
    const completed = d.tasks.filter((t) => t.status === "completed_approved").length;
    const overdue = d.tasks.filter(
      (t) => t.status !== "completed_approved" && t.status !== "cancelled" && t.status !== "archived" && t.dueDate && t.dueDate < now
    ).length;
    // onTimeRate: نسبة المهام المكتملة المعتمدة التي اكتملت قبل أو عند dueDate
    const completedWithDue = d.tasks.filter((t) => t.status === "completed_approved" && t.dueDate);
    const onTime = completedWithDue.filter((t) => t.updatedAt <= t.dueDate!).length;
    const onTimeRate = completedWithDue.length > 0 ? Math.round((onTime / completedWithDue.length) * 100) : null;
    return {
      department: d.name,
      totalTasks: total,
      completed,
      overdue,
      onTimeRate,
    };
  });
  items.sort((a, b) => b.totalTasks - a.totalTasks);
  return { items, chartType: "bar" };
}

async function decisionsImplementation(orgId: string) {
  const decisions = await db.decision.findMany({
    where: { meeting: { organizer: { orgId } } },
    select: { status: true },
  });
  const counts = { total: decisions.length, pending: 0, converted: 0, implemented: 0, cancelled: 0 };
  for (const d of decisions) {
    if (d.status === "pending") counts.pending++;
    else if (d.status === "converted") counts.converted++;
    else if (d.status === "implemented") counts.implemented++;
    else if (d.status === "cancelled") counts.cancelled++;
  }
  const items = [
    { status: "pending", label: "قيد الانتظار", color: "amber", count: counts.pending },
    { status: "converted", label: "محوَّلة إلى مهمة", color: "teal", count: counts.converted },
    { status: "implemented", label: "مُنفَّذة", color: "green", count: counts.implemented },
    { status: "cancelled", label: "ملغاة", color: "gray", count: counts.cancelled },
  ];
  return { items, total: counts.total, chartType: "pie" };
}
