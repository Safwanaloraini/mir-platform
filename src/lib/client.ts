import { ROLES } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  nameEn?: string | null;
  role: keyof typeof ROLES;
  jobTitle?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  org: { id: string; name: string; nameEn?: string | null; currency: string };
};

const ROLE_PERMS: Record<string, Permission[]> = {
  ceo: ["task.create","task.view.all","task.edit","task.delete","task.assign","task.change_status","task.approve_completion","task.bulk_action","task.manage_views","task.export","request.create","request.view.all","request.edit","request.delete","request.approve","finance.view","finance.manage","finance.view.amounts","meeting.create","meeting.edit","report.view","report.export","users.manage","audit.view","settings.manage"],
  ops_manager: ["task.create","task.view.all","task.edit","task.assign","task.change_status","task.approve_completion","task.bulk_action","task.manage_views","task.export","request.create","request.view.all","request.edit","finance.view","finance.view.amounts","meeting.create","meeting.edit","report.view","report.export","audit.view"],
  finance_manager: ["task.create","task.view.all","task.edit","task.assign","task.change_status","task.bulk_action","task.export","request.create","request.view.all","request.edit","request.approve","finance.view","finance.manage","finance.view.amounts","meeting.create","meeting.edit","report.view","report.export","audit.view"],
  accountant: ["task.create","task.view.own","task.edit","task.change_status","task.bulk_action","request.view.all","request.execute","finance.view","finance.manage","finance.view.amounts","report.view","audit.view"],
  employee: ["task.create","task.view.own","task.edit","task.change_status","request.create","request.view.own","meeting.create","report.view"],
};

export function canClient(user: CurrentUser | null, perm: Permission): boolean {
  if (!user) return false;
  return (ROLE_PERMS[user.role] ?? []).includes(perm);
}

export async function apiFetch<T = any>(
  url: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers as any) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}
