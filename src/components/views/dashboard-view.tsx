"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StatCard, PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch } from "@/lib/client";
import { ROLES, TASK_STATUSES, formatCurrency, formatDateTime, relativeTime, taskNumber, requestNumber, REQUEST_STATUSES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/client";
import {
  ListTodo, AlertTriangle, PauseCircle, Flame, CheckCircle2, Clock,
  Wallet, TrendingUp, Building2, ArrowLeft, Bell, FileText, Calendar,
  Users, Activity, CircleDollarSign, Receipt, AlertOctagon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TASK_STATUSES).map(([k, v]) => [k, v.label])
);
const STATUS_COLOR_HEX: Record<string, string> = {
  draft: "#94a3b8", new: "#0ea5e9", assigned: "#14b8a6", in_progress: "#f59e0b",
  awaiting_info: "#a855f7", awaiting_approval: "#8b5cf6", stalled: "#ef4444",
  completed_review: "#6366f1", completed_approved: "#16a34a", cancelled: "#64748b", archived: "#71717a",
};

export function DashboardView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch("/api/dashboard"),
  });

  const role = ROLES[user.role];
  const greeting = getGreeting();

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  const s = data.stats;
  const canSeeAmounts = data.canSeeAmounts;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={`${greeting}، ${user.name.split(" ").slice(0, 2).join(" ")}`}
        subtitle={`${role} — ملخص وضع الشركة اليوم`}
        actions={
          <Button onClick={() => setView("task-new")} className="bg-primary hover:bg-primary/90 gap-1.5">
            <ListTodo className="h-4 w-4" /> مهمة جديدة
          </Button>
        }
      />

      {/* بطاقات المؤشرات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="مهام مفتوحة" value={s.openTasks} icon={ListTodo} color="primary" subtitle={`${s.myTasks} منها لديك`} />
        <StatCard label="مهام متأخرة" value={s.overdueTasks} icon={Clock} color="red" subtitle={`${s.stalledTasks} متعثرة`} trend={s.overdueTasks > 0 ? { value: "تحتاج متابعة", up: false } : undefined} />
        <StatCard label="أولوية عاجلة" value={s.urgentTasks} icon={Flame} color="orange" />
        {canSeeAmounts ? (
          <StatCard
            label="مصروفات الشهر"
            value={formatCurrency(s.expensesThisMonth, data.currency)}
            icon={Wallet}
            color={s.expenseTrend && s.expenseTrend > 0 ? "red" : "green"}
            trend={s.expenseTrend != null ? { value: `${s.expenseTrend > 0 ? "+" : ""}${s.expenseTrend}%`, up: s.expenseTrend < 0 } : undefined}
          />
        ) : (
          <StatCard label="مهام مكتملة هذا الشهر" value={s.completedThisMonth} icon={CheckCircle2} color="green" />
        )}
      </div>

      {/* صندوق الإجراءات العاجلة */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* الطلبات بانتظار الاعتماد */}
        {data.approvalRequests.length > 0 && (
          <SectionCard title="طلبات بانتظار اعتمادك" action={<Button variant="ghost" size="sm" onClick={() => setView("approvals")}>الكل</Button>}>
            <div className="space-y-2">
              {data.approvalRequests.slice(0, 4).map((r: any) => (
                <button key={r.id} onClick={() => setView("request-detail", { id: r.id })} className="w-full text-right p-3 rounded-lg border border-border hover:bg-accent transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground nums">{requestNumber(r.number)}</span>
                    <StatusBadge label={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.label ?? r.status} color={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.color ?? "slate"} />
                  </div>
                  <div className="text-sm font-medium mt-1 line-clamp-1">{r.title}</div>
                  {canSeeAmounts && r.totalAmount != null && <div className="text-xs text-muted-foreground mt-0.5 nums">{formatCurrency(r.totalAmount, r.currency)}</div>}
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* المهام المتأخرة */}
        {data.topOverdue.length > 0 && (
          <SectionCard title="مهام متأخرة" className={data.approvalRequests.length === 0 ? "lg:col-span-2" : ""} action={<Button variant="ghost" size="sm" onClick={() => setView("tasks", { filter: "overdue" })}>الكل</Button>}>
            <div className="space-y-2">
              {data.topOverdue.slice(0, 4).map((t: any) => (
                <button key={t.id} onClick={() => setView("task-detail", { id: t.id })} className="w-full text-right p-3 rounded-lg border border-border hover:bg-accent transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground nums">{taskNumber(t.number)}</span>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <div className="text-sm font-medium mt-1 line-clamp-1">{t.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {t.dueDate && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{relativeTime(t.dueDate)}</span>}
                    {t.assignees[0]?.user?.name && <span>• {t.assignees[0].user.name}</span>}
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* الالتزامات القادمة (مالي) */}
        {canSeeAmounts && data.upcomingInvoices.length > 0 && (
          <SectionCard title="التزامات قادمة" action={<Button variant="ghost" size="sm" onClick={() => setView("finance")}>الكل</Button>}>
            <div className="space-y-2">
              {data.upcomingInvoices.slice(0, 4).map((inv: any) => (
                <div key={inv.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium nums">{inv.number}</span>
                    <span className="text-xs text-muted-foreground">{relativeTime(inv.dueDate)}</span>
                  </div>
                  <div className="text-sm font-medium mt-0.5 line-clamp-1">{inv.vendor?.name ?? "—"}</div>
                  <div className="text-sm font-bold text-primary mt-1 nums">{formatCurrency(inv.totalAmount, inv.currency)}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* الأنشطة الأخيرة */}
        <SectionCard title="آخر الأنشطة" className={canSeeAmounts ? "" : "lg:col-span-1"}>
          <div className="space-y-3">
            {data.recentActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">لا يوجد نشاط</div>
            ) : (
              data.recentActivity.slice(0, 6).map((a: any) => (
                <div key={a.id} className="flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    {a.user?.name?.[0] ?? "؟"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs"><span className="font-medium">{a.user?.name}</span> — {a.summary}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(a.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      {/* الرسوم البيانية */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="توزيع المهام حسب الحالة">
          {data.tasksByStatus.length === 0 ? (
            <EmptyState icon={Activity} title="لا توجد بيانات" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.tasksByStatus.map((t: any) => ({ name: STATUS_LABEL[t.status] ?? t.status, count: t.count, fill: STATUS_COLOR_HEX[t.status] }))} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {canSeeAmounts && data.budgets.length > 0 ? (
          <SectionCard title="استهلاك الميزانية حسب مركز التكلفة">
            <div className="space-y-3 mt-1">
              {data.budgets.map((b: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{b.costCenter}</span>
                    <span className="text-muted-foreground nums">
                      {formatCurrency(b.actual, data.currency)} / {formatCurrency(b.planned, data.currency)}
                    </span>
                  </div>
                  <Progress value={b.utilization} className="h-2" indicatorClassName={b.utilization > 90 ? "bg-red-500" : b.utilization > 75 ? "bg-amber-500" : "bg-primary"} />
                </div>
              ))}
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="أداء الإدارات">
            <div className="space-y-2">
              {data.departments.slice(0, 5).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3 w-3" />{d.members}</span>
                    <Badge variant="secondary" className="nums">{d.openTasks} مفتوحة</Badge>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 17) return "مساء الخير";
  return "مساء الخير";
}
