import type { User } from "@prisma/client";

/**
 * تعريف الصلاحيات حسب الدور (RBAC).
 * تُطبَّق على مستوى API، وليس إخفاء الأزرار فقط.
 */
export type Permission =
  | "task.create"
  | "task.view.all"
  | "task.view.dept"
  | "task.view.own"
  | "task.edit"
  | "task.delete"
  | "task.assign"
  | "task.approve_completion"
  | "request.create"
  | "request.view.all"
  | "request.view.own"
  | "request.edit"
  | "request.delete"
  | "request.approve"
  | "request.execute" // المحاسب ينفّذ
  | "finance.view"
  | "finance.manage"
  | "finance.view.amounts"
  | "meeting.create"
  | "meeting.edit"
  | "report.view"
  | "report.export"
  | "users.manage"
  | "audit.view"
  | "settings.manage";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ceo: [
    "task.create", "task.view.all", "task.edit", "task.delete", "task.assign", "task.approve_completion",
    "request.create", "request.view.all", "request.edit", "request.delete", "request.approve",
    "finance.view", "finance.manage", "finance.view.amounts",
    "meeting.create", "meeting.edit", "report.view", "report.export",
    "users.manage", "audit.view", "settings.manage",
  ],
  ops_manager: [
    "task.create", "task.view.all", "task.edit", "task.assign", "task.approve_completion",
    "request.create", "request.view.all", "request.edit",
    "finance.view", "finance.view.amounts",
    "meeting.create", "meeting.edit", "report.view", "report.export", "audit.view",
  ],
  finance_manager: [
    "task.create", "task.view.all", "task.edit", "task.assign",
    "request.create", "request.view.all", "request.edit", "request.approve",
    "finance.view", "finance.manage", "finance.view.amounts",
    "meeting.create", "meeting.edit", "report.view", "report.export", "audit.view",
  ],
  accountant: [
    "task.create", "task.view.own", "task.edit",
    "request.view.all", "request.execute",
    "finance.view", "finance.manage", "finance.view.amounts",
    "report.view", "audit.view",
  ],
  employee: [
    "task.create", "task.view.own", "task.edit",
    "request.create", "request.view.own",
    "meeting.create",
    "report.view",
  ],
};

export function can(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  const perms = ROLE_PERMISSIONS[user.role] ?? [];
  return perms.includes(permission);
}

export function canAny(user: User | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(user, p));
}

/**
 * التحقق من فصل الصلاحيات: لا يجوز للمستخدم اعتماد طلب أنشأه بنفسه.
 */
export function canApproveRequest(user: User, requestCreatorId: string): boolean {
  if (!can(user, "request.approve")) return false;
  if (user.id === requestCreatorId) return false;
  return true;
}

/**
 * المستخدمون الذين يمكنهم رؤية القيم المالية.
 */
export function canSeeAmounts(user: User | null): boolean {
  return can(user, "finance.view.amounts");
}
