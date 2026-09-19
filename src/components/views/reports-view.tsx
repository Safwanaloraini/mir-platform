"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader, SectionCard, EmptyState, StatCard } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import {
  TASK_STATUSES, REQUEST_STATUSES, EXPENSE_CATEGORIES,
  formatCurrency, formatDate, formatDateTime, taskNumber,
} from "@/lib/constants";
import { toast } from "sonner";
import {
  BarChart3, Download, Clock, AlertTriangle, PieChart as PieIcon,
  BarChart2, Wallet, Building2, Gavel, CheckCircle2, FileText,
  ClipboardList, Users, Target, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type ReportKey =
  | "tasks_by_status" | "tasks_by_assignee" | "overdue_tasks"
  | "requests_by_type" | "requests_by_status" | "avg_approval_hours"
  | "expenses_by_category" | "expenses_by_project" | "expenses_by_cost_center"
  | "budget_vs_actual" | "department_performance" | "decisions_implementation";

interface ReportDef {
  key: ReportKey;
  label: string;
  icon: any;
  category: "tasks" | "requests" | "finance" | "operations";
  needsAmounts?: boolean;
}

const REPORTS: ReportDef[] = [
  { key: "tasks_by_status", label: "المهام حسب الحالة", icon: PieIcon, category: "tasks" },
  { key: "tasks_by_assignee", label: "المهام حسب المسؤول", icon: Users, category: "tasks" },
  { key: "overdue_tasks", label: "المهام المتأخرة", icon: AlertTriangle, category: "tasks" },
  { key: "requests_by_type", label: "الطلبات حسب النوع", icon: BarChart2, category: "requests" },
  { key: "requests_by_status", label: "الطلبات حسب الحالة", icon: PieIcon, category: "requests" },
  { key: "avg_approval_hours", label: "متوسط زمن الاعتماد", icon: Clock, category: "requests" },
  { key: "expenses_by_category", label: "المصروفات حسب البند", icon: Wallet, category: "finance", needsAmounts: true },
  { key: "expenses_by_project", label: "المصروفات حسب المشروع", icon: Building2, category: "finance", needsAmounts: true },
  { key: "expenses_by_cost_center", label: "المصروفات حسب مركز التكلفة", icon: Target, category: "finance", needsAmounts: true },
  { key: "budget_vs_actual", label: "الميزانية مقابل الفعلي", icon: TrendingUp, category: "finance", needsAmounts: true },
  { key: "department_performance", label: "أداء الإدارات", icon: BarChart2, category: "operations" },
  { key: "decisions_implementation", label: "تنفيذ القرارات", icon: Gavel, category: "operations" },
];

const CATEGORY_LABELS: Record<ReportDef["category"], string> = {
  tasks: "المهام",
  requests: "الطلبات والاعتمادات",
  finance: "المالية",
  operations: "الأداء والتنظيم",
};

const STATUS_COLOR_HEX: Record<string, string> = {
  draft: "#94a3b8", new: "#0ea5e9", assigned: "#14b8a6", in_progress: "#f59e0b",
  awaiting_info: "#a855f7", awaiting_approval: "#8b5cf6", stalled: "#ef4444",
  completed_review: "#6366f1", completed_approved: "#16a34a", cancelled: "#64748b", archived: "#71717a",
  // حالات القرار
  pending: "#f59e0b", converted: "#14b8a6", implemented: "#16a34a",
  // حالات الطلب الإضافية
  submitted: "#0ea5e9", under_review: "#14b8a6", needs_completion: "#f59e0b",
  preliminarily_approved: "#06b6d4", awaiting_final: "#8b5cf6", approved: "#16a34a",
  rejected: "#ef4444", forwarded_accountant: "#6366f1", in_execution: "#f59e0b",
  partially_executed: "#eab308", fully_executed: "#16a34a", closed: "#10b981",
  // ألوان عامة
  amber: "#f59e0b", teal: "#14b8a6", green: "#16a34a", gray: "#64748b", slate: "#94a3b8", red: "#ef4444", sky: "#0ea5e9",
  purple: "#8b5cf6", violet: "#a855f7", indigo: "#6366f1", cyan: "#06b6d4", emerald: "#10b981", yellow: "#eab308", zinc: "#71717a",
};

const PALETTE = ["#14b8a6", "#ff7f32", "#16a34a", "#f59e0b", "#0ea5e9", "#a855f7", "#ef4444", "#10b981", "#06b6d4", "#8b5cf6", "#eab308", "#64748b"];

export function ReportsView({ user }: { user: CurrentUser }) {
  const [selected, setSelected] = useState<ReportKey>("tasks_by_status");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canExport = canClient(user, "report.export");
  const canSeeAmounts = canClient(user, "finance.view.amounts");

  // تطبيق تاريخ افتراضي (السنة الحالية) عند فتح التقرير لأول مرة
  useEffect(() => {
    if (!dateFrom && !dateTo) {
      const y = new Date().getFullYear();
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-12-31`);
    }
  }, [dateFrom, dateTo]);

  const queryKey = ["report", selected, dateFrom, dateTo];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("type", selected);
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      return apiFetch<any>(`/api/reports?${p.toString()}`);
    },
  });

  const groupedReports = useMemo(() => {
    const map: Record<string, ReportDef[]> = {};
    for (const r of REPORTS) {
      (map[r.category] ??= []).push(r);
    }
    return map;
  }, []);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="التقارير والإحصاءات"
        subtitle="تحليلات شاملة لأداء المهام والطلبات والمالية والقرارات"
        actions={
          canExport && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => downloadCsv(selected, data)}
            >
              <Download className="h-4 w-4" /> تصدير CSV
            </Button>
          )
        }
      />

      <div className="grid lg:grid-cols-[280px_1fr] gap-5">
        {/* الشريط الجانبي: قائمة التقارير + فلتر التاريخ */}
        <div className="space-y-4">
          <SectionCard title="نطاق التاريخ">
            <div className="space-y-2">
              <div>
                <Label className="text-xs mb-1 block">من</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">إلى</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="التقارير" className="p-0">
            <ScrollArea className="h-[420px]">
              <div className="p-2">
                {Object.entries(groupedReports).map(([cat, reports]) => {
                  const visibleReports = reports.filter((r) => !r.needsAmounts || canSeeAmounts);
                  if (visibleReports.length === 0) return null;
                  return (
                    <div key={cat} className="mb-2">
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {CATEGORY_LABELS[cat as ReportDef["category"]]}
                      </div>
                      <div className="space-y-0.5">
                        {visibleReports.map((r) => {
                          const active = selected === r.key;
                          const Icon = r.icon;
                          return (
                            <button
                              key={r.key}
                              onClick={() => setSelected(r.key)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-right ${
                                active
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "text-foreground/85 hover:bg-accent"
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate flex-1">{r.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </SectionCard>
        </div>

        {/* لوحة التقرير */}
        <div className="space-y-4 min-w-0">
          {isLoading ? (
            <SectionCard>
              <div className="space-y-3">
                <div className="h-6 w-40 bg-muted animate-pulse rounded" />
                <div className="h-64 bg-muted animate-pulse rounded-xl" />
              </div>
            </SectionCard>
          ) : !data ? (
            <SectionCard><div className="text-sm text-muted-foreground">لا توجد بيانات</div></SectionCard>
          ) : (
            <ReportRenderer reportKey={selected} data={data} canSeeAmounts={canSeeAmounts} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============ عارض التقرير ============
function ReportRenderer({ reportKey, data, canSeeAmounts }: { reportKey: ReportKey; data: any; canSeeAmounts: boolean }) {
  const def = REPORTS.find((r) => r.key === reportKey)!;
  const items: any[] = data.items ?? [];
  const chartType = data.chartType ?? "table";

  return (
    <>
      <SectionCard
        title={def.label}
        action={
          items.length > 0 && (
            <Badge variant="secondary" className="nums">{items.length} عنصر</Badge>
          )
        }
      >
        {items.length === 0 && chartType !== "stat" ? (
          <EmptyState icon={BarChart3} title="لا توجد بيانات في النطاق المحدد" description="جرّب توسيع نطاق التاريخ أو تحديد تقرير آخر." />
        ) : (
          <ReportChart reportKey={reportKey} data={data} canSeeAmounts={canSeeAmounts} />
        )}
      </SectionCard>

      {/* جدول البيانات */}
      {items.length > 0 && (
        <SectionCard title="تفاصيل البيانات">
          <ReportTable reportKey={reportKey} data={data} canSeeAmounts={canSeeAmounts} />
        </SectionCard>
      )}
    </>
  );
}

function ReportChart({ reportKey, data, canSeeAmounts }: { reportKey: ReportKey; data: any; canSeeAmounts: boolean }) {
  const items: any[] = data.items ?? [];

  switch (reportKey) {
    case "tasks_by_status": {
      const chart = items.map((it) => ({ name: it.label, count: it.count, fill: STATUS_COLOR_HEX[it.status] ?? PALETTE[0] }));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={chart} dataKey="count" nameKey="name" outerRadius={100} innerRadius={45}>
              {chart.map((c, i) => <Cell key={i} fill={c.fill} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: "inherit" }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    case "tasks_by_assignee": {
      const chart = items.map((it) => ({ name: it.name, count: it.count, overdue: it.overdue, completed: it.completed }));
      return (
        <ResponsiveContainer width="100%" height={Math.max(300, items.length * 36)}>
          <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
            <Bar dataKey="count" name="الكل" fill="#14b8a6" radius={[0, 4, 4, 0]} />
            <Bar dataKey="completed" name="مكتملة" fill="#16a34a" radius={[0, 4, 4, 0]} />
            <Bar dataKey="overdue" name="متأخرة" fill="#ef4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "overdue_tasks":
      return null; // table only
    case "requests_by_type": {
      const chart = items.map((it, i) => ({ name: it.label, count: it.count, total: canSeeAmounts ? it.totalAmount : 0, fill: PALETTE[i % PALETTE.length] }));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chart} margin={{ right: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} />
            <Bar dataKey="count" name="عدد الطلبات" radius={[4, 4, 0, 0]}>
              {chart.map((c, i) => <Cell key={i} fill={c.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "requests_by_status": {
      const chart = items.map((it) => ({ name: it.label, count: it.count, fill: STATUS_COLOR_HEX[it.status] ?? PALETTE[0] }));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={chart} dataKey="count" nameKey="name" outerRadius={100} innerRadius={45}>
              {chart.map((c, i) => <Cell key={i} fill={c.fill} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: "inherit" }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    case "avg_approval_hours": {
      const avg = data.avg;
      return (
        <div className="grid sm:grid-cols-3 gap-3">
          <StatCard label="متوسط زمن الاعتماد" value={avg != null ? `${avg} ساعة` : "—"} icon={Clock} color="primary" />
          <StatCard label="عدد الطلبات المعتمدة" value={data.count ?? 0} icon={CheckCircle2} color="green" />
          <StatCard label="متوسط الأيام" value={avg != null ? (avg / 24).toFixed(1) : "—"} icon={Clock} color="orange" subtitle="يوم عمل تقريبًا" />
        </div>
      );
    }
    case "expenses_by_category": {
      const chart = items.map((it, i) => ({ name: it.label, value: it.total, fill: PALETTE[i % PALETTE.length] }));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={chart} dataKey="value" nameKey="name" outerRadius={100} innerRadius={45}>
              {chart.map((c, i) => <Cell key={i} fill={c.fill} />)}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
              formatter={(v: any) => formatCurrency(Number(v))}
            />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    case "expenses_by_project":
    case "expenses_by_cost_center": {
      const key = reportKey === "expenses_by_project" ? "project" : "costCenter";
      const chart = items.map((it) => ({ name: it[key], total: it.total }));
      return (
        <ResponsiveContainer width="100%" height={Math.max(300, items.length * 36)}>
          <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" tickFormatter={(v) => v.toLocaleString("ar-SA")} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} formatter={(v: any) => formatCurrency(Number(v))} />
            <Bar dataKey="total" name="الإجمالي" fill="#14b8a6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "budget_vs_actual": {
      const chart = items.map((it) => ({ name: it.costCenter, planned: it.planned, actual: it.actual, utilization: it.utilization }));
      return (
        <ResponsiveContainer width="100%" height={Math.max(300, items.length * 42)}>
          <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" tickFormatter={(v) => v.toLocaleString("ar-SA")} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} formatter={(v: any) => formatCurrency(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
            <Bar dataKey="planned" name="مخطط" fill="#94a3b8" radius={[0, 4, 4, 0]} />
            <Bar dataKey="actual" name="فعلي" fill="#14b8a6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "department_performance": {
      const chart = items.map((it) => ({ name: it.department, total: it.totalTasks, completed: it.completed, overdue: it.overdue }));
      return (
        <ResponsiveContainer width="100%" height={Math.max(300, items.length * 42)}>
          <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
            <Bar dataKey="total" name="الإجمالي" fill="#94a3b8" radius={[0, 4, 4, 0]} />
            <Bar dataKey="completed" name="مكتملة" fill="#16a34a" radius={[0, 4, 4, 0]} />
            <Bar dataKey="overdue" name="متأخرة" fill="#ef4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "decisions_implementation": {
      const chart = items.map((it) => ({ name: it.label, count: it.count, fill: STATUS_COLOR_HEX[it.status] ?? PALETTE[0] }));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={chart} dataKey="count" nameKey="name" outerRadius={100} innerRadius={45}>
              {chart.map((c, i) => <Cell key={i} fill={c.fill} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: "inherit" }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    default:
      return null;
  }
}

function ReportTable({ reportKey, data, canSeeAmounts }: { reportKey: ReportKey; data: any; canSeeAmounts: boolean }) {
  const items: any[] = data.items ?? [];

  switch (reportKey) {
    case "tasks_by_status":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "label", header: "الحالة", render: (r) => <StatusBadge label={r.label} color={r.color} /> },
            { key: "count", header: "عدد المهام", numeric: true },
          ]}
        />
      );
    case "tasks_by_assignee":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "name", header: "المسؤول" },
            { key: "count", header: "إجمالي المهام", numeric: true },
            { key: "completed", header: "مكتملة", numeric: true },
            { key: "overdue", header: "متأخرة", numeric: true },
            { key: "avgCompletionHours", header: "متوسط زمن الإنجاز (ساعة)", numeric: true, render: (r) => r.avgCompletionHours != null ? r.avgCompletionHours : "—" },
          ]}
        />
      );
    case "overdue_tasks":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "number", header: "رقم", render: (r) => <span className="nums">{taskNumber(r.number)}</span> },
            { key: "title", header: "العنوان" },
            { key: "priorityLabel", header: "الأولوية", render: (r) => <StatusBadge label={r.priorityLabel} color={(r.priority === "urgent" ? "red" : r.priority === "high" ? "amber" : r.priority === "low" ? "slate" : "sky")} /> },
            { key: "daysLate", header: "أيام التأخر", numeric: true },
            { key: "dueDate", header: "تاريخ الاستحقاق", render: (r) => formatDate(r.dueDate) },
            { key: "assignees", header: "المسؤولون", render: (r) => r.assignees.join("، ") || "—" },
            { key: "department", header: "الإدارة", render: (r) => r.department ?? "—" },
          ]}
        />
      );
    case "requests_by_type":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "label", header: "النوع" },
            { key: "count", header: "عدد الطلبات", numeric: true },
            ...(canSeeAmounts ? [{ key: "totalAmount", header: "إجمالي المبالغ", numeric: true, render: (r: any) => formatCurrency(r.totalAmount) }] : []),
          ]}
        />
      );
    case "requests_by_status":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "label", header: "الحالة", render: (r) => <StatusBadge label={r.label} color={r.color} /> },
            { key: "count", header: "العدد", numeric: true },
          ]}
        />
      );
    case "avg_approval_hours":
      return (
        <SimpleTable
          rows={[{ label: "متوسط زمن الاعتماد", value: data.avg != null ? `${data.avg} ساعة` : "—", count: data.count ?? 0 }]}
          columns={[
            { key: "label", header: "المؤشر" },
            { key: "value", header: "القيمة" },
            { key: "count", header: "عدد الطلبات المعتمدة", numeric: true },
          ]}
        />
      );
    case "expenses_by_category":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "label", header: "البند" },
            { key: "count", header: "عدد المصروفات", numeric: true },
            { key: "total", header: "الإجمالي", numeric: true, render: (r) => formatCurrency(r.total) },
          ]}
        />
      );
    case "expenses_by_project":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "project", header: "المشروع" },
            { key: "total", header: "الإجمالي", numeric: true, render: (r) => formatCurrency(r.total) },
          ]}
        />
      );
    case "expenses_by_cost_center":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "costCenter", header: "مركز التكلفة" },
            { key: "count", header: "عدد المصروفات", numeric: true },
            { key: "total", header: "الإجمالي", numeric: true, render: (r) => formatCurrency(r.total) },
          ]}
        />
      );
    case "budget_vs_actual":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "costCenter", header: "مركز التكلفة" },
            { key: "period", header: "الفترة" },
            { key: "planned", header: "مخطط", numeric: true, render: (r) => formatCurrency(r.planned) },
            { key: "actual", header: "فعلي", numeric: true, render: (r) => formatCurrency(r.actual) },
            { key: "utilization", header: "نسبة الاستهلاك", numeric: true, render: (r) => `${r.utilization}%` },
          ]}
        />
      );
    case "department_performance":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "department", header: "الإدارة" },
            { key: "totalTasks", header: "إجمالي المهام", numeric: true },
            { key: "completed", header: "مكتملة", numeric: true },
            { key: "overdue", header: "متأخرة", numeric: true },
            { key: "onTimeRate", header: "نسبة الالتزام بالموعد", numeric: true, render: (r) => r.onTimeRate != null ? `${r.onTimeRate}%` : "—" },
          ]}
        />
      );
    case "decisions_implementation":
      return (
        <SimpleTable
          rows={items}
          columns={[
            { key: "label", header: "الحالة", render: (r) => <StatusBadge label={r.label} color={r.color} /> },
            { key: "count", header: "العدد", numeric: true },
          ]}
        />
      );
    default:
      return null;
  }
}

interface Column {
  key: string;
  header: string;
  numeric?: boolean;
  render?: (row: any) => React.ReactNode;
}

function SimpleTable({ rows, columns }: { rows: any[]; columns: Column[] }) {
  return (
    <div className="max-h-[420px] overflow-y-auto scrollbar-mir">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.numeric ? "text-left" : ""}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id ?? i}>
              {columns.map((c) => (
                <TableCell key={c.key} className={c.numeric ? "text-left nums" : ""}>
                  {c.render ? c.render(r) : (r[c.key] ?? "—")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============ تصدير CSV ============
function downloadCsv(reportKey: ReportKey, data: any) {
  const items: any[] = data?.items ?? [];
  if (items.length === 0) {
    toast.info("لا توجد بيانات للتصدير");
    return;
  }

  const headers = CSV_HEADERS[reportKey];
  if (!headers) {
    toast.info("هذا التقرير غير قابل للتصدير");
    return;
  }

  const rows = items.map((it) => headers.map((h) => {
    const v = h.value(it);
    const s = v == null ? "" : String(v);
    // الهروب من الفواصل وعلامات التنصيص
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }));

  const csv = [
    headers.map((h) => h.label).join(","),
    ...rows.map((r) => r.join(",")),
  ].join("\n");

  // BOM لدعم العربية في Excel
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reportKey}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("تم تصدير التقرير بصيغة CSV");
}

const CSV_HEADERS: Record<ReportKey, { label: string; value: (row: any) => any }[]> = {
  tasks_by_status: [
    { label: "الحالة", value: (r) => r.label },
    { label: "العدد", value: (r) => r.count },
  ],
  tasks_by_assignee: [
    { label: "المسؤول", value: (r) => r.name },
    { label: "إجمالي المهام", value: (r) => r.count },
    { label: "مكتملة", value: (r) => r.completed },
    { label: "متأخرة", value: (r) => r.overdue },
    { label: "متوسط زمن الإنجاز (ساعة)", value: (r) => r.avgCompletionHours ?? "" },
  ],
  overdue_tasks: [
    { label: "رقم", value: (r) => `م-${String(r.number).padStart(4, "0")}` },
    { label: "العنوان", value: (r) => r.title },
    { label: "الأولوية", value: (r) => r.priorityLabel },
    { label: "أيام التأخر", value: (r) => r.daysLate },
    { label: "تاريخ الاستحقاق", value: (r) => (r.dueDate ? new Date(r.dueDate).toLocaleDateString("ar-SA-u-ca-gregory") : "") },
    { label: "المسؤولون", value: (r) => (r.assignees || []).join("، ") },
    { label: "الإدارة", value: (r) => r.department ?? "" },
  ],
  requests_by_type: [
    { label: "النوع", value: (r) => r.label },
    { label: "عدد الطلبات", value: (r) => r.count },
    { label: "إجمالي المبالغ", value: (r) => r.totalAmount },
  ],
  requests_by_status: [
    { label: "الحالة", value: (r) => r.label },
    { label: "العدد", value: (r) => r.count },
  ],
  avg_approval_hours: [
    { label: "المؤشر", value: (r) => r.label ?? "متوسط زمن الاعتماد" },
    { label: "القيمة", value: (r) => r.value ?? "" },
    { label: "عدد الطلبات", value: (r) => r.count ?? "" },
  ],
  expenses_by_category: [
    { label: "البند", value: (r) => r.label },
    { label: "عدد المصروفات", value: (r) => r.count },
    { label: "الإجمالي", value: (r) => r.total },
  ],
  expenses_by_project: [
    { label: "المشروع", value: (r) => r.project },
    { label: "الإجمالي", value: (r) => r.total },
  ],
  expenses_by_cost_center: [
    { label: "مركز التكلفة", value: (r) => r.costCenter },
    { label: "عدد المصروفات", value: (r) => r.count },
    { label: "الإجمالي", value: (r) => r.total },
  ],
  budget_vs_actual: [
    { label: "مركز التكلفة", value: (r) => r.costCenter },
    { label: "الفترة", value: (r) => r.period },
    { label: "مخطط", value: (r) => r.planned },
    { label: "فعلي", value: (r) => r.actual },
    { label: "نسبة الاستهلاك", value: (r) => `${r.utilization}%` },
  ],
  department_performance: [
    { label: "الإدارة", value: (r) => r.department },
    { label: "إجمالي المهام", value: (r) => r.totalTasks },
    { label: "مكتملة", value: (r) => r.completed },
    { label: "متأخرة", value: (r) => r.overdue },
    { label: "نسبة الالتزام بالموعد", value: (r) => (r.onTimeRate != null ? `${r.onTimeRate}%` : "") },
  ],
  decisions_implementation: [
    { label: "الحالة", value: (r) => r.label },
    { label: "العدد", value: (r) => r.count },
  ],
};
