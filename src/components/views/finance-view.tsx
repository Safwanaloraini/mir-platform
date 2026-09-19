"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { StatCard, PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { apiFetch, canClient } from "@/lib/client";
import { useNav } from "@/lib/store";
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, INVOICE_STATUSES,
  formatCurrency, formatDate, relativeTime,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/client";
import {
  Wallet, ArrowLeftRight, FileText, AlertTriangle, Plus, Search,
  Building2, ArrowDownLeft, ArrowUpRight, CircleDollarSign, Receipt,
  CalendarClock, TrendingUp, AlertOctagon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// خريطة ألوان للرسم — قائمة ألوان مير، بدون أزرق/إنديغو
const CHART_COLORS = ["#004645", "#FF7F32", "#D4EB8E", "#502B1C", "#5E8B7E", "#B5651D", "#8FA66E", "#9C6B3C"];

type Meta = {
  costCenters: { id: string; name: string; code: string }[];
  vendors: { id: string; name: string }[];
  users: { id: string; name: string }[];
  requestTypes: { id: string; code: string; nameAr: string }[];
};

export function FinanceView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const [tab, setTab] = useState("overview");
  const canManage = canClient(user, "finance.manage");
  const seeAmounts = canClient(user, "finance.view.amounts");

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="الوحدة المالية والمحاسبية"
        subtitle="متابعة المصروفات والفواتير والمدفوعات ومراكز التكلفة"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setView("cost-centers")} className="gap-1.5">
              <Building2 className="h-4 w-4" /> مراكز التكلفة
            </Button>
            <Button variant="outline" size="sm" onClick={() => setView("vendors")} className="gap-1.5">
              <ArrowLeftRight className="h-4 w-4" /> الموردون والعملاء
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="expenses">المصروفات</TabsTrigger>
          <TabsTrigger value="invoices">الفواتير</TabsTrigger>
          <TabsTrigger value="payments">المدفوعات والمقبوضات</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab seeAmounts={seeAmounts} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab canManage={canManage} seeAmounts={seeAmounts} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab canManage={canManage} seeAmounts={seeAmounts} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab canManage={canManage} seeAmounts={seeAmounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* =================== Overview =================== */
function OverviewTab({ seeAmounts }: { seeAmounts: boolean }) {
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<Meta>("/api/meta"),
  });
  const { data: summary, isLoading } = useQuery({
    queryKey: ["expenses-summary"],
    queryFn: () => apiFetch<any>("/api/finance/expenses?summary=true"),
  });
  const { data: invoices } = useQuery({
    queryKey: ["invoices-overview"],
    queryFn: () => apiFetch<any>("/api/finance/invoices?overdue=false&pageSize=100"),
  });
  const { data: costCenters } = useQuery({
    queryKey: ["cost-centers-overview"],
    queryFn: () => apiFetch<any>("/api/cost-centers"),
  });

  if (isLoading || !summary) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="h-72 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  const now = new Date();
  const upcoming = (invoices?.items || [])
    .filter((inv: any) => inv.status !== "paid" && inv.status !== "cancelled" && inv.dueDate)
    .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 6);
  const overdueInvoices = (invoices?.items || []).filter((inv: any) => inv.isOverdue);

  // مراكز تكلفة متجاوزة الميزانية
  const exceededCCs = (costCenters?.items || []).filter((cc: any) => cc.budgetExceeded);

  // مدفوعات هذا الشهر (تقريبي من الملخص byMonth للشهر الحالي)
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthTotal = (summary.byMonth || []).find((m: any) => m.month === monthKey)?.total ?? 0;

  // مستحقات قادمة (مجموع المستحقات غير المدفوعة)
  const upcomingTotal = upcoming.reduce((s: number, inv: any) => s + (inv.remaining ?? inv.totalAmount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard
          label="إجمالي مصروفات الشهر"
          value={seeAmounts ? formatCurrency(thisMonthTotal, "SAR") : "—"}
          icon={Wallet}
          color="primary"
          subtitle={`${summary.count ?? 0} مصروف إجمالاً`}
        />
        <StatCard
          label="مدفوعات هذا الشهر"
          value={seeAmounts ? formatCurrency(thisMonthTotal, "SAR") : "—"}
          icon={CircleDollarSign}
          color="green"
          subtitle="مدفوعات صادرة"
        />
        <StatCard
          label="مستحقات قادمة"
          value={seeAmounts ? formatCurrency(upcomingTotal, "SAR") : "—"}
          icon={CalendarClock}
          color="orange"
          subtitle={`${upcoming.length} فاتورة`}
        />
        <StatCard
          label="فواتير متأخرة"
          value={overdueInvoices.length}
          icon={AlertOctagon}
          color="red"
          subtitle={overdueInvoices.length > 0 ? "تحتاج متابعة" : "لا توجد"}
          trend={overdueInvoices.length > 0 ? { value: "متأخرة", up: false } : undefined}
        />
      </div>

      {/* رسوم بيانية */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="المصروفات الشهرية">
          {!summary.byMonth || summary.byMonth.length === 0 ? (
            <EmptyState icon={TrendingUp} title="لا توجد بيانات" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.byMonth.map((m: any) => ({ name: m.month, total: m.total }))} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" width={70} tickFormatter={(v) => seeAmounts ? v.toLocaleString("ar-SA") : "—"} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }}
                  formatter={(v: any) => seeAmounts ? formatCurrency(Number(v)) : "—"}
                />
                <Bar dataKey="total" name="الإجمالي" radius={[4, 4, 0, 0]} fill="#004645" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="المصروفات حسب مركز التكلفة">
          {!summary.byCostCenter || summary.byCostCenter.length === 0 ? (
            <EmptyState icon={Building2} title="لا توجد بيانات" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={summary.byCostCenter.map((c: any) => ({ name: c.name, total: c.total }))}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" tickFormatter={(v) => seeAmounts ? v.toLocaleString("ar-SA") : "—"} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} formatter={(v: any) => seeAmounts ? formatCurrency(Number(v)) : "—"} />
                <Bar dataKey="total" name="الإجمالي" radius={[0, 4, 4, 0]} fill="#FF7F32" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* مستحقات قادمة */}
        <SectionCard title="مستحقات قادمة" className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="لا توجد مستحقات قادمة" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الفاتورة</TableHead>
                    <TableHead>الجهة</TableHead>
                    <TableHead>تاريخ الاستحقاق</TableHead>
                    <TableHead className="text-left">المبلغ المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map((inv: any) => (
                    <TableRow key={inv.id} className={inv.isOverdue ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell className="font-medium nums">{inv.number}</TableCell>
                      <TableCell>{inv.vendor?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <span className={inv.isOverdue ? "text-red-600 font-medium" : ""}>
                          {formatDate(inv.dueDate)}
                        </span>
                        <span className="text-muted-foreground"> ({relativeTime(inv.dueDate)})</span>
                      </TableCell>
                      <TableCell className="text-left font-bold nums">
                        {seeAmounts ? formatCurrency(inv.remaining ?? inv.totalAmount, inv.currency) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>

        {/* تنبيهات مالية */}
        <SectionCard title="تنبيهات مالية" action={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {overdueInvoices.length === 0 && exceededCCs.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">لا توجد تنبيهات حالية</div>
            ) : (
              <>
                {overdueInvoices.slice(0, 4).map((inv: any) => (
                  <div key={inv.id} className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium nums">{inv.number}</span>
                      <StatusBadge label="متأخرة" color="red" />
                    </div>
                    <div className="text-sm font-medium mt-0.5 line-clamp-1">{inv.vendor?.name ?? "—"}</div>
                    {seeAmounts && <div className="text-xs text-red-600 mt-0.5 nums">{formatCurrency(inv.remaining ?? inv.totalAmount, inv.currency)}</div>}
                  </div>
                ))}
                {exceededCCs.slice(0, 4).map((cc: any) => (
                  <div key={cc.id} className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{cc.code} • {cc.name}</span>
                      <StatusBadge label="تجاوز" color="amber" />
                    </div>
                    {seeAmounts && cc.budget && (
                      <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 nums">
                        الفعلي {formatCurrency(cc.actualSpent)} / المخطط {formatCurrency(cc.budget.plannedAmount)}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </SectionCard>
      </div>

      {/* توزيع المصروفات حسب الفئة */}
      {seeAmounts && summary.byCategory && summary.byCategory.length > 0 && (
        <SectionCard title="توزيع المصروفات حسب الفئة">
          <div className="grid lg:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={summary.byCategory} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={90} label>
                  {summary.byCategory.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "inherit" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {summary.byCategory.map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-sm font-medium">{c.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground nums">{formatCurrency(c.total)} • {c.count} سند</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {meta && (
        <p className="text-xs text-muted-foreground text-center">
          مراكز التكلفة: {meta.costCenters.length} • الموردون: {meta.vendors.length}
        </p>
      )}
    </div>
  );
}

/* =================== Expenses =================== */
type ExpenseFilters = {
  dateFrom?: string; dateTo?: string; category?: string;
  costCenterId?: string; vendorId?: string; status?: string; search?: string;
};

function ExpensesTab({ canManage, seeAmounts }: { canManage: boolean; seeAmounts: boolean }) {
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 15;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [filters, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", queryString],
    queryFn: () => apiFetch<any>(`/api/finance/expenses?${queryString}`),
  });

  const update = (patch: Partial<ExpenseFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={filters.dateFrom || ""} onChange={(e) => update({ dateFrom: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={filters.dateTo || ""} onChange={(e) => update({ dateTo: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">الفئة</Label>
            <Select value={filters.category || ""} onValueChange={(v) => update({ category: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الحالة</Label>
            <Select value={filters.status || ""} onValueChange={(v) => update({ status: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">قيد المعالجة</SelectItem>
                <SelectItem value="invoiced">مُفوتر</SelectItem>
                <SelectItem value="paid">مدفوع</SelectItem>
                <SelectItem value="cancelled">ملغى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 lg:col-span-2">
            <Label className="text-xs">بحث</Label>
            <div className="relative mt-1">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث في الوصف..."
                value={filters.search || ""}
                onChange={(e) => update({ search: e.target.value })}
                className="pr-8"
              />
            </div>
          </div>
          <div className="col-span-2 lg:col-span-2 flex items-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="text-muted-foreground">إعادة تعيين</Button>
            {canManage && (
              <Button className="bg-primary hover:bg-primary/90 gap-1.5 mr-auto" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" /> مصروف جديد
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
          </div>
        ) : !data?.items || data.items.length === 0 ? (
          <EmptyState icon={Wallet} title="لا توجد مصروفات" description="ابدأ بإضافة مصروف جديد أو عدّل الفلاتر" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead>مركز التكلفة</TableHead>
                <TableHead>الفئة</TableHead>
                <TableHead className="text-left">المبلغ</TableHead>
                {seeAmounts && <TableHead className="text-left">الضريبة</TableHead>}
                {seeAmounts && <TableHead className="text-left">الإجمالي</TableHead>}
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((e: any) => (
                <TableRow key={e.id} className="hover:bg-accent/50">
                  <TableCell className="font-medium nums">م-{String(e.number).padStart(4, "0")}</TableCell>
                  <TableCell className="text-xs">{formatDate(e.date)}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={e.description}>{e.description}</TableCell>
                  <TableCell className="text-sm">{e.vendor?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {e.costCenter ? <span className="nums">{e.costCenter.code}</span> : null}
                    {e.costCenter ? ` • ${e.costCenter.name}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{(EXPENSE_CATEGORIES as any)[e.category] ?? e.category}</TableCell>
                  <TableCell className="text-left nums font-medium">{seeAmounts ? formatCurrency(e.amount, e.currency) : "—"}</TableCell>
                  {seeAmounts && <TableCell className="text-left nums text-muted-foreground">{e.taxAmount ? formatCurrency(e.taxAmount, e.currency) : "—"}</TableCell>}
                  {seeAmounts && <TableCell className="text-left nums font-bold">{formatCurrency(e.totalAmount, e.currency)}</TableCell>}
                  <TableCell>
                    <ExpenseStatusBadge status={e.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data?.total > pageSize && (
        <Pagination page={page} totalPages={Math.ceil(data.total / pageSize)} onChange={setPage} total={data.total} />
      )}

      {canManage && (
        <ExpenseFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
    </div>
  );
}

function ExpenseStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "قيد المعالجة", color: "amber" },
    invoiced: { label: "مُفوتر", color: "sky" },
    paid: { label: "مدفوع", color: "green" },
    cancelled: { label: "ملغى", color: "gray" },
  };
  const s = map[status] ?? { label: status, color: "slate" };
  return <StatusBadge label={s.label} color={s.color} />;
}

function ExpenseFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<Meta>("/api/meta"),
  });
  const [form, setForm] = useState<any>({
    date: new Date().toISOString().slice(0, 10),
    vendorId: "", costCenterId: "", category: "supplies",
    description: "", amount: "", taxAmount: "", currency: "SAR",
    paymentMethod: "", requestId: "",
  });
  const [saving, setSaving] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/api/finance/expenses", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم إنشاء المصروف");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-summary"] });
      onOpenChange(false);
      setForm({
        date: new Date().toISOString().slice(0, 10),
        vendorId: "", costCenterId: "", category: "supplies",
        description: "", amount: "", taxAmount: "", currency: "SAR",
        paymentMethod: "", requestId: "",
      });
    },
    onError: (e: any) => toast.error(e.message || "فشل إنشاء المصروف"),
  });

  const submit = () => {
    if (!form.description.trim()) return toast.error("الوصف مطلوب");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("المبلغ غير صحيح");
    setSaving(true);
    mutation.mutate(
      {
        date: form.date,
        vendorId: form.vendorId || undefined,
        costCenterId: form.costCenterId || undefined,
        requestId: form.requestId || undefined,
        category: form.category,
        description: form.description.trim(),
        amount: Number(form.amount),
        taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
        currency: form.currency,
        paymentMethod: form.paymentMethod || undefined,
      },
      { onSettled: () => setSaving(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>مصروف جديد</DialogTitle>
          <DialogDescription>أدخل بيانات السند المالي</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">الفئة</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">الوصف</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" placeholder="بيان المصروف..." />
          </div>
          <div>
            <Label className="text-xs">المورد</Label>
            <Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                {(meta?.vendors || []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">مركز التكلفة</Label>
            <Select value={form.costCenterId} onValueChange={(v) => setForm({ ...form, costCenterId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                {(meta?.costCenters || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.code} • {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">المبلغ</Label>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 nums" />
          </div>
          <div>
            <Label className="text-xs">الضريبة (اختياري)</Label>
            <Input type="number" min="0" step="0.01" value={form.taxAmount} onChange={(e) => setForm({ ...form, taxAmount: e.target.value })} className="mt-1 nums" />
          </div>
          <div>
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">العملة</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">ريال سعودي</SelectItem>
                <SelectItem value="USD">دولار أمريكي</SelectItem>
                <SelectItem value="EUR">يورو</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">ربط بطلب (اختياري)</Label>
            <Input value={form.requestId} onChange={(e) => setForm({ ...form, requestId: e.target.value })} className="mt-1" placeholder="معرّف الطلب..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary/90">{saving ? "جارٍ الحفظ..." : "حفظ المصروف"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== Invoices =================== */
type InvoiceFilters = {
  status?: string; type?: string; vendorId?: string;
  dateFrom?: string; dateTo?: string; search?: string;
};

function InvoicesTab({ canManage, seeAmounts }: { canManage: boolean; seeAmounts: boolean }) {
  const [filters, setFilters] = useState<InvoiceFilters>({});
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 15;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [filters, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", queryString],
    queryFn: () => apiFetch<any>(`/api/finance/invoices?${queryString}`),
  });

  const update = (patch: Partial<InvoiceFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">النوع</Label>
            <Select value={filters.type || ""} onValueChange={(v) => update({ type: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payable">مدفوعات (مستحقة علينا)</SelectItem>
                <SelectItem value="receivable">مقبوضات (مستحقة لنا)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الحالة</Label>
            <Select value={filters.status || ""} onValueChange={(v) => update({ status: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                {Object.entries(INVOICE_STATUSES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={filters.dateFrom || ""} onChange={(e) => update({ dateFrom: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={filters.dateTo || ""} onChange={(e) => update({ dateTo: e.target.value })} className="mt-1" />
          </div>
          <div className="col-span-2 lg:col-span-2">
            <Label className="text-xs">بحث</Label>
            <div className="relative mt-1">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="رقم الفاتورة أو المورد..."
                value={filters.search || ""}
                onChange={(e) => update({ search: e.target.value })}
                className="pr-8"
              />
            </div>
          </div>
          <div className="col-span-2 lg:col-span-2 flex items-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="text-muted-foreground">إعادة تعيين</Button>
            {canManage && (
              <Button className="bg-primary hover:bg-primary/90 gap-1.5 mr-auto" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" /> فاتورة جديدة
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
        ) : !data?.items || data.items.length === 0 ? (
          <EmptyState icon={FileText} title="لا توجد فواتير" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الجهة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>الاستحقاق</TableHead>
                {seeAmounts && <TableHead className="text-left">الإجمالي</TableHead>}
                {seeAmounts && <TableHead className="text-left">المدفوع</TableHead>}
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((inv: any) => (
                <TableRow key={inv.id} className={inv.isOverdue ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-accent/50"}>
                  <TableCell className="font-medium nums">{inv.number}</TableCell>
                  <TableCell>
                    <span className={`text-xs ${inv.type === "receivable" ? "text-green-600" : "text-orange-600"}`}>
                      {inv.type === "receivable" ? "مقبوضات" : "مدفوعات"}
                    </span>
                  </TableCell>
                  <TableCell>{inv.vendor?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(inv.date)}</TableCell>
                  <TableCell className="text-xs">
                    <span className={inv.isOverdue ? "text-red-600 font-medium" : ""}>{formatDate(inv.dueDate)}</span>
                  </TableCell>
                  {seeAmounts && <TableCell className="text-left nums font-medium">{formatCurrency(inv.totalAmount, inv.currency)}</TableCell>}
                  {seeAmounts && <TableCell className="text-left nums text-green-600">{formatCurrency(inv.paidAmount, inv.currency)}</TableCell>}
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} overdue={inv.isOverdue} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data?.total > pageSize && (
        <Pagination page={page} totalPages={Math.ceil(data.total / pageSize)} onChange={setPage} total={data.total} />
      )}

      {canManage && <InvoiceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  );
}

function InvoiceStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue && status !== "paid") return <StatusBadge label="متأخرة" color="red" />;
  const map: Record<string, string> = {
    unpaid: "slate", partial: "amber", paid: "green", overdue: "red", cancelled: "gray",
  };
  return <StatusBadge label={(INVOICE_STATUSES as any)[status] ?? status} color={map[status] ?? "slate"} />;
}

function InvoiceFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => apiFetch<Meta>("/api/meta") });
  const [form, setForm] = useState<any>({
    number: "", vendorId: "", type: "payable",
    date: new Date().toISOString().slice(0, 10), dueDate: "",
    amount: "", taxAmount: "", currency: "SAR",
  });
  const [saving, setSaving] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/api/finance/invoices", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم إنشاء الفاتورة");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onOpenChange(false);
      setForm({ number: "", vendorId: "", type: "payable", date: new Date().toISOString().slice(0, 10), dueDate: "", amount: "", taxAmount: "", currency: "SAR" });
    },
    onError: (e: any) => toast.error(e.message || "فشل إنشاء الفاتورة"),
  });

  const submit = () => {
    if (!form.number.trim()) return toast.error("رقم الفاتورة مطلوب");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("المبلغ غير صحيح");
    setSaving(true);
    mutation.mutate(
      {
        number: form.number.trim(),
        vendorId: form.vendorId || undefined,
        type: form.type,
        date: form.date,
        dueDate: form.dueDate || undefined,
        amount: Number(form.amount),
        taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
        currency: form.currency,
      },
      { onSettled: () => setSaving(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>فاتورة جديدة</DialogTitle>
          <DialogDescription>سجل فاتورة مدفوعات أو مقبوضات</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">رقم الفاتورة</Label>
            <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="mt-1 nums" placeholder="INV-0001" />
          </div>
          <div>
            <Label className="text-xs">النوع</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payable">مدفوعات (مستحقة علينا)</SelectItem>
                <SelectItem value="receivable">مقبوضات (مستحقة لنا)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">المورد / العميل</Label>
            <Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                {(meta?.vendors || []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">تاريخ الفاتورة</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">تاريخ الاستحقاق</Label>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">المبلغ</Label>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 nums" />
          </div>
          <div>
            <Label className="text-xs">الضريبة (اختياري)</Label>
            <Input type="number" min="0" step="0.01" value={form.taxAmount} onChange={(e) => setForm({ ...form, taxAmount: e.target.value })} className="mt-1 nums" />
          </div>
          <div>
            <Label className="text-xs">العملة</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">ريال سعودي</SelectItem>
                <SelectItem value="USD">دولار أمريكي</SelectItem>
                <SelectItem value="EUR">يورو</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary/90">{saving ? "جارٍ الحفظ..." : "حفظ الفاتورة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== Payments =================== */
type PaymentFilters = {
  type?: string; method?: string; vendorId?: string;
  dateFrom?: string; dateTo?: string; search?: string;
};

function PaymentsTab({ canManage, seeAmounts }: { canManage: boolean; seeAmounts: boolean }) {
  const [filters, setFilters] = useState<PaymentFilters>({});
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 15;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [filters, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["payments", queryString],
    queryFn: () => apiFetch<any>(`/api/finance/payments?${queryString}`),
  });

  const update = (patch: Partial<PaymentFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">النوع</Label>
            <Select value={filters.type || ""} onValueChange={(v) => update({ type: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="outgoing">صادر (مدفوع)</SelectItem>
                <SelectItem value="incoming">وارد (مقبوض)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الطريقة</Label>
            <Select value={filters.method || ""} onValueChange={(v) => update({ method: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={filters.dateFrom || ""} onChange={(e) => update({ dateFrom: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={filters.dateTo || ""} onChange={(e) => update({ dateTo: e.target.value })} className="mt-1" />
          </div>
          <div className="col-span-2 lg:col-span-2">
            <Label className="text-xs">بحث</Label>
            <div className="relative mt-1">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="رقم الدفعة أو المرجع أو رقم القيد..."
                value={filters.search || ""}
                onChange={(e) => update({ search: e.target.value })}
                className="pr-8"
              />
            </div>
          </div>
          <div className="col-span-2 lg:col-span-2 flex items-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="text-muted-foreground">إعادة تعيين</Button>
            {canManage && (
              <Button className="bg-primary hover:bg-primary/90 gap-1.5 mr-auto" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" /> دفعة جديدة
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
        ) : !data?.items || data.items.length === 0 ? (
          <EmptyState icon={Receipt} title="لا توجد مدفوعات" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>التاريخ</TableHead>
                {seeAmounts && <TableHead className="text-left">المبلغ</TableHead>}
                <TableHead>الطريقة</TableHead>
                <TableHead>المرجع</TableHead>
                <TableHead>رقم القيد</TableHead>
                <TableHead>الجهة</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((p: any) => (
                <TableRow key={p.id} className="hover:bg-accent/50">
                  <TableCell className="font-medium nums">{p.number}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 text-xs ${p.type === "incoming" ? "text-green-600" : "text-orange-600"}`}>
                      {p.type === "incoming" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {p.type === "incoming" ? "وارد" : "صادر"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(p.date)}</TableCell>
                  {seeAmounts && <TableCell className="text-left nums font-medium">{formatCurrency(p.amount, p.currency)}</TableCell>}
                  <TableCell className="text-xs">{(PAYMENT_METHODS as any)[p.method] ?? p.method}</TableCell>
                  <TableCell className="text-xs nums">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-xs nums">{p.journalEntry ?? "—"}</TableCell>
                  <TableCell className="text-sm">{p.vendor?.name ?? (p.invoice?.number ? `فاتورة ${p.invoice.number}` : "—")}</TableCell>
                  <TableCell><PaymentStatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data?.total > pageSize && (
        <Pagination page={page} totalPages={Math.ceil(data.total / pageSize)} onChange={setPage} total={data.total} />
      )}

      {canManage && <PaymentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    executed: { label: "منفذة", color: "green" },
    pending: { label: "قيد التنفيذ", color: "amber" },
    cancelled: { label: "ملغاة", color: "gray" },
  };
  const s = map[status] ?? { label: status, color: "slate" };
  return <StatusBadge label={s.label} color={s.color} />;
}

function PaymentFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => apiFetch<Meta>("/api/meta") });
  const { data: invoicesData } = useQuery({
    queryKey: ["invoices-for-payment"],
    queryFn: () => apiFetch<any>("/api/finance/invoices?pageSize=100"),
  });
  const [form, setForm] = useState<any>({
    number: "", type: "outgoing", invoiceId: "", vendorId: "",
    date: new Date().toISOString().slice(0, 10), amount: "",
    currency: "SAR", method: "bank_transfer", reference: "", journalEntry: "",
  });
  const [saving, setSaving] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/api/finance/payments", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم تسجيل الدفعة");
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onOpenChange(false);
      setForm({ number: "", type: "outgoing", invoiceId: "", vendorId: "", date: new Date().toISOString().slice(0, 10), amount: "", currency: "SAR", method: "bank_transfer", reference: "", journalEntry: "" });
    },
    onError: (e: any) => toast.error(e.message || "فشل تسجيل الدفعة"),
  });

  const submit = () => {
    if (!form.number.trim()) return toast.error("رقم الدفعة مطلوب");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("المبلغ غير صحيح");
    setSaving(true);
    mutation.mutate(
      {
        number: form.number.trim(),
        type: form.type,
        invoiceId: form.invoiceId || undefined,
        vendorId: form.vendorId || undefined,
        date: form.date,
        amount: Number(form.amount),
        currency: form.currency,
        method: form.method,
        reference: form.reference || undefined,
        journalEntry: form.journalEntry || undefined,
      },
      { onSettled: () => setSaving(false) }
    );
  };

  const openInvoices = (invoicesData?.items || []).filter((i: any) => i.status !== "paid" && i.status !== "cancelled");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>دفعة جديدة</DialogTitle>
          <DialogDescription>سجل دفعة صادرة أو مقبوضة، ويمكن ربطها بفاتورة</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">رقم الدفعة</Label>
            <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="mt-1 nums" placeholder="PAY-0001" />
          </div>
          <div>
            <Label className="text-xs">النوع</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="outgoing">صادر (مدفوع)</SelectItem>
                <SelectItem value="incoming">وارد (مقبوض)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">الفاتورة (اختياري)</Label>
            <Select value={form.invoiceId} onValueChange={(v) => setForm({ ...form, invoiceId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون ربط" /></SelectTrigger>
              <SelectContent>
                {openInvoices.map((inv: any) => (
                  <SelectItem key={inv.id} value={inv.id}>{inv.number} — {inv.vendor?.name ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">المورد / الجهة</Label>
            <Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                {(meta?.vendors || []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">المبلغ</Label>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 nums" />
          </div>
          <div>
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">العملة</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">ريال سعودي</SelectItem>
                <SelectItem value="USD">دولار أمريكي</SelectItem>
                <SelectItem value="EUR">يورو</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">المرجع</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="mt-1 nums" placeholder="رقم السند البنكي..." />
          </div>
          <div>
            <Label className="text-xs">رقم القيد المحاسبي</Label>
            <Input value={form.journalEntry} onChange={(e) => setForm({ ...form, journalEntry: e.target.value })} className="mt-1 nums" placeholder="JV-0001" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary/90">{saving ? "جارٍ الحفظ..." : "تسجيل الدفعة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== Pagination =================== */
function Pagination({ page, totalPages, onChange, total }: { page: number; totalPages: number; onChange: (p: number) => void; total: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-xs text-muted-foreground nums">{total} عنصر</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>السابق</Button>
        <span className="text-xs nums px-2">{page} / {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>التالي</Button>
      </div>
    </div>
  );
}
