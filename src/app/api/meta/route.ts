import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler } from "@/lib/api";

/**
 * يرجع البيانات المرجعية اللازمة للنماذج (مستخدمون، إدارات، مشاريع، أنواع طلبات، مراكز تكلفة، موردين).
 */
export const GET = apiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const seeAmounts = can(user, "finance.view.amounts");

  const [users, departments, projects, requestTypes, approvalWorkflows, costCenters, vendors] = await Promise.all([
    db.user.findMany({
      where: { orgId: user.orgId, status: "active" },
      select: { id: true, name: true, role: true, jobTitle: true, departmentId: true, department: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    db.department.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { orgId: user.orgId, status: "active" }, orderBy: { name: "asc" } }),
    db.requestType.findMany({ orderBy: { nameAr: "asc" } }),
    db.approvalWorkflow.findMany({ where: { active: true }, include: { steps: { orderBy: { order: "asc" } } } }),
    db.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    seeAmounts ? db.vendor.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return {
    users,
    departments,
    projects,
    requestTypes: seeAmounts ? requestTypes.filter((r) => r.category === "financial" || can(user, "request.approve")) : requestTypes,
    allRequestTypes: requestTypes,
    approvalWorkflows,
    costCenters: seeAmounts ? costCenters : [],
    vendors,
  };
});
