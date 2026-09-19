"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { apiFetch, canClient } from "@/lib/client";
import { useNav } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/constants";
import type { CurrentUser } from "@/lib/client";
import {
  Building2, Plus, Pencil, ChevronLeft, ChevronDown,
  Wallet, PiggyBank, AlertTriangle, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

type Meta = {
  users: { id: string; name: string; role: string }[];
  costCenters: { id: string; name: string; code: string }[];
};

type CostCenterItem = {
  id: string; code: string; name: string; parentId?: string | null;
  parent?: { id: string; name: string; code: string } | null;
  managerId?: string | null;
  manager?: { id: string; name: string } | null;
  active: boolean;
  budget: {
    id: string; period: string; periodType: string;
    plannedAmount: number | null; actualAmount: number | null;
    committedAmount: number | null; notes?: string | null;
  } | null;
  actualSpent: number | null;
  expenseCount: number;
  utilization: number;
  budgetExceeded: boolean;
};

type CostCentersResp = {
  items: CostCenterItem[];
  currentYear: string;
  canSeeAmounts: boolean;
};

type BudgetRow = {
  id: string; costCenterId: string; period: string; periodType: string;
  plannedAmount: number | null; actualAmount: number | null;
  committedAmount: number | null; utilization: number;
  notes?: string | null;
  costCenter?: { id: string; name: string; code: string } | null;
};

export function CostCentersView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const canManage = canClient(user, "finance.manage");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ccDialogOpen, setCcDialogOpen] = useState(false);
  const [editCC, setEditCC] = useState<CostCenterItem | null>(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetRow | null>(null);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cost-centers"],
    queryFn: () => apiFetch<CostCentersResp>("/api/cost-centers"),
  });

  const items = data?.items ?? [];
  const seeAmounts = data?.canSeeAmounts ?? false;

  // بناء شجرة هرمية
  const tree = useMemo(() => buildTree(items), [items]);

  // اختيار فعلي: المحدد أو الأول افتراضيًا
  const effectiveSelectedId = selectedId ?? items[0]?.id ?? null;
  const selected = items.find((i) => i.id === effectiveSelectedId) ?? null;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="مراكز التكلفة والميزانيات"
        subtitle="إدارة مراكز التكلفة وتتبع الميزانيات الفعلية والمخططة"
        actions={
          canManage ? (
            <Button className="bg-primary hover:bg-primary/90 gap-1.5" onClick={() => { setEditCC(null); setCcDialogOpen(true); }}>
              <Plus className="h-4 w-4" /> مركز تكلفة جديد
            </Button>
          ) : undefined
        }
      />

      {/* رسم مقارنة مخطط مقابل فعلي */}
      {seeAmounts && items.length > 0 && (
        <SectionCard title="مخطط مقابل فعلي لمراكز التكلفة (السنة الحالية)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={items.filter((i) => i.budget).map((cc) => ({
              name: cc.code,
              full: cc.name,
              planned: cc.budget?.plannedAmount ?? 0,
              actual: cc.actualSpent ?? 0,
            }))} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="var(--muted-foreground)" width={70} tickFormatter={(v) => Number(v).toLocaleString("ar-SA")} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "inherit" }}
                formatter={(v: any, _n, p: any) => [formatCurrency(Number(v)), p?.payload?.full ?? ""]}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "inherit" }} />
              <Bar dataKey="planned" name="مخطط" fill="#004645" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="فعلي" fill="#FF7F32" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* شجرة مراكز التكلفة */}
        <Card className="p-3 lg:col-span-1">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-bold">الشجرة</h3>
            <Button variant="ghost" size="sm" onClick={() => setView("finance")} className="text-xs">للوحدة المالية</Button>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState icon={Building2} title="لا توجد مراكز" />
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              {tree.map((node) => (
                <CostCenterTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  toggle={(id) =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      if (n.has(id)) n.delete(id);
                      else n.add(id);
                      return n;
                    })
                  }
                  selectedId={effectiveSelectedId}
                  onSelect={setSelectedId}
                  seeAmounts={seeAmounts}
                />
              ))}
            </div>
          )}
        </Card>

        {/* تفاصيل المركز المحدد */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <Card className="p-6">
              <EmptyState icon={Building2} title="اختر مركز تكلفة لعرض تفاصيله" />
            </Card>
          ) : (
            <>
              <Card className="p-4 lg:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black nums">{selected.code}</span>
                      <h2 className="text-lg font-bold">{selected.name}</h2>
                    </div>
                    {selected.parent && (
                      <p className="text-xs text-muted-foreground mt-1">
                        تحت: {selected.parent.code} • {selected.parent.name}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {selected.manager && <span>المدير: {selected.manager.name}</span>}
                      <span>{selected.expenseCount} مصروف</span>
                      {selected.budgetExceeded && <StatusBadge label="ميزانية متجاوزة" color="red" />}
                      {!selected.active && <StatusBadge label="مؤرشف" color="gray" />}
                    </div>
                  </div>
                  {canManage && (
                    <Button variant="outline" size="sm" onClick={() => { setEditCC(selected); setCcDialogOpen(true); }} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </Button>
                  )}
                </div>

                {/* بطاقات الميزانية */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                  <BudgetMiniCard label="مخطط" value={seeAmounts ? (selected.budget?.plannedAmount ?? 0) : null} icon={PiggyBank} color="primary" />
                  <BudgetMiniCard label="فعلي" value={seeAmounts ? (selected.actualSpent ?? 0) : null} icon={Wallet} color="orange" />
                  <BudgetMiniCard label="ملتزم" value={seeAmounts ? (selected.budget?.committedAmount ?? 0) : null} icon={AlertTriangle} color="amber" />
                  <BudgetMiniCard label="نسبة الاستهلاك" value={selected.utilization != null ? `${selected.utilization}%` : "—"} icon={BarChart3} color={selected.utilization > 90 ? "red" : "green"} />
                </div>

                {seeAmounts && selected.budget && selected.budget.plannedAmount != null && selected.budget.plannedAmount > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">استهلاك الميزانية</span>
                      <span className="text-muted-foreground nums">
                        {formatCurrency(selected.actualSpent ?? 0)} / {formatCurrency(selected.budget.plannedAmount)}
                      </span>
                    </div>
                    <Progress
                      value={selected.utilization}
                      className="h-2"
                      indicatorClassName={selected.utilization > 90 ? "bg-red-500" : selected.utilization > 75 ? "bg-amber-500" : "bg-primary"}
                    />
                  </div>
                )}
              </Card>

              {/* ميزانيات المركز عبر الفترات */}
              <SectionCard
                title="ميزانيات المركز عبر الفترات"
                action={
                  canManage && selected ? (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditBudget(null); setBudgetDialogOpen(true); }} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> ميزانية جديدة
                      </Button>
                    </div>
                  ) : undefined
                }
              >
                <CenterBudgetsTable costCenterId={selected.id} canManage={canManage} seeAmounts={seeAmounts} onEdit={(b) => { setEditBudget(b); setBudgetDialogOpen(true); }} />
              </SectionCard>
            </>
          )}
        </div>
      </div>

      {canManage && (
        <CostCenterFormDialog
          open={ccDialogOpen}
          onOpenChange={setCcDialogOpen}
          editItem={editCC}
        />
      )}
      {canManage && selected && (
        <BudgetFormDialog
          open={budgetDialogOpen}
          onOpenChange={setBudgetDialogOpen}
          costCenterId={selected.id}
          costCenterName={`${selected.code} • ${selected.name}`}
          editItem={editBudget}
        />
      )}
    </div>
  );
}

/* ===== شجرة مركز التكلفة ===== */
type TreeNode = CostCenterItem & { children: TreeNode[] };

function buildTree(items: CostCenterItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  items.forEach((i) => map.set(i.id, { ...i, children: [] }));
  const roots: TreeNode[] = [];
  items.forEach((i) => {
    const node = map.get(i.id)!;
    if (i.parentId && map.has(i.parentId)) {
      map.get(i.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // ترتيب
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.code.localeCompare(b.code));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function CostCenterTreeNode({
  node, depth, expanded, toggle, selectedId, onSelect, seeAmounts,
}: {
  node: TreeNode; depth: number;
  expanded: Set<string>; toggle: (id: string) => void;
  selectedId: string | null; onSelect: (id: string) => void;
  seeAmounts: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`w-full text-right flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-accent transition ${
          isSelected ? "bg-primary/10 text-primary" : ""
        }`}
        style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            className="h-5 w-5 rounded hover:bg-accent-foreground/10 flex items-center justify-center shrink-0"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className="text-xs font-medium nums w-12 shrink-0">{node.code}</span>
        <span className="text-xs flex-1 truncate">{node.name}</span>
        {node.budgetExceeded && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
        {!node.active && <span className="text-[10px] text-muted-foreground shrink-0">مؤرشف</span>}
      </button>
      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <CostCenterTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
              seeAmounts={seeAmounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== بطاقة مصغرة للميزانية ===== */
function BudgetMiniCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: string | number | null;
  icon: React.ComponentType<{ className?: string }>;
  color: "primary" | "orange" | "green" | "red" | "amber";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return (
    <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border">
      <div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-base font-bold nums mt-0.5">{value == null ? "—" : value}</div>
      </div>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

/* ===== جدول ميزانيات مركز محدد ===== */
function CenterBudgetsTable({
  costCenterId, canManage, seeAmounts, onEdit,
}: {
  costCenterId: string;
  canManage: boolean;
  seeAmounts: boolean;
  onEdit: (b: BudgetRow) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["budgets", costCenterId],
    queryFn: () => apiFetch<{ items: BudgetRow[] }>(`/api/budgets?costCenterId=${costCenterId}`),
  });

  if (isLoading) return <div className="p-3 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>;

  if (!data?.items || data.items.length === 0) {
    return <EmptyState icon={PiggyBank} title="لا توجد ميزانيات" description="ابدأ بإضافة ميزانية لهذا المركز" />;
  }

  const sorted = [...data.items].sort((a, b) => b.period.localeCompare(a.period));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>الفترة</TableHead>
          <TableHead>النوع</TableHead>
          {seeAmounts && <TableHead className="text-left">مخطط</TableHead>}
          {seeAmounts && <TableHead className="text-left">فعلي</TableHead>}
          {seeAmounts && <TableHead className="text-left">ملتزم</TableHead>}
          {seeAmounts && <TableHead className="text-left">الاستهلاك</TableHead>}
          {canManage && <TableHead className="text-left">إجراءات</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((b) => (
          <TableRow key={b.id} className="hover:bg-accent/50">
            <TableCell className="font-medium nums">{b.period}</TableCell>
            <TableCell className="text-xs">
              {b.periodType === "yearly" ? "سنوي" : b.periodType === "quarterly" ? "ربعي" : "شهري"}
            </TableCell>
            {seeAmounts && <TableCell className="text-left nums font-medium">{b.plannedAmount != null ? formatCurrency(b.plannedAmount) : "—"}</TableCell>}
            {seeAmounts && <TableCell className="text-left nums text-orange-600">{b.actualAmount != null ? formatCurrency(b.actualAmount) : "—"}</TableCell>}
            {seeAmounts && <TableCell className="text-left nums text-amber-600">{b.committedAmount != null ? formatCurrency(b.committedAmount) : "—"}</TableCell>}
            {seeAmounts && (
              <TableCell className="text-left">
                <div className="flex items-center gap-2">
                  <Progress
                    value={b.utilization}
                    className="h-2 w-20"
                    indicatorClassName={b.utilization > 90 ? "bg-red-500" : b.utilization > 75 ? "bg-amber-500" : "bg-primary"}
                  />
                  <span className="text-xs nums">{b.utilization}%</span>
                </div>
              </TableCell>
            )}
            {canManage && (
              <TableCell className="text-left">
                <Button variant="ghost" size="sm" onClick={() => onEdit(b)} className="h-8 w-8 p-0">
                  <Pencil className="h-4 w-4" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ===== نافذة إنشاء/تعديل مركز تكلفة ===== */
function CostCenterFormDialog({
  open, onOpenChange, editItem,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editItem: CostCenterItem | null;
}) {
  return (
    <CostCenterFormInner
      key={editItem?.id ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
      editItem={editItem}
    />
  );
}

function CostCenterFormInner({
  open, onOpenChange, editItem,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editItem: CostCenterItem | null;
}) {
  const qc = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => apiFetch<Meta>("/api/meta") });
  const { data: ccData } = useQuery({ queryKey: ["cost-centers"], queryFn: () => apiFetch<CostCentersResp>("/api/cost-centers") });
  const [form, setForm] = useState<any>(() => ({
    code: editItem?.code ?? "",
    name: editItem?.name ?? "",
    parentId: editItem?.parentId ?? "",
    managerId: editItem?.managerId ?? "",
  }));
  const [saving, setSaving] = useState(false);

  const createMut = useMutation({
    mutationFn: (payload: any) => apiFetch("/api/cost-centers", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم إنشاء مركز التكلفة");
      qc.invalidateQueries({ queryKey: ["cost-centers"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "فشل"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => apiFetch(`/api/cost-centers/${editItem!.id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["cost-centers"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "فشل"),
  });

  const submit = () => {
    if (!form.code.trim()) return toast.error("الرمز مطلوب");
    if (!form.name.trim()) return toast.error("الاسم مطلوب");
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      parentId: form.parentId || undefined,
      managerId: form.managerId || undefined,
    };
    if (editItem) {
      updateMut.mutate(payload, { onSettled: () => setSaving(false) });
    } else {
      createMut.mutate(payload, { onSettled: () => setSaving(false) });
    }
  };

  const possibleParents = (ccData?.items ?? []).filter((cc) => cc.id !== editItem?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editItem ? "تعديل مركز تكلفة" : "مركز تكلفة جديد"}</DialogTitle>
          <DialogDescription>{editItem ? "عدّل بيانات المركز" : "أدخل بيانات المركز الجديد"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">الرمز *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 nums" placeholder="CC-001" />
            </div>
            <div>
              <Label className="text-xs">الاسم *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">المركز الأب (اختياري)</Label>
            <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون (جذري)" /></SelectTrigger>
              <SelectContent>
                {possibleParents.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>{cc.code} • {cc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">المدير المسؤول</Label>
            <Select value={form.managerId} onValueChange={(v) => setForm({ ...form, managerId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                {(meta?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary/90">{saving ? "جارٍ الحفظ..." : editItem ? "حفظ" : "إنشاء"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===== نافذة إنشاء/تعديل ميزانية ===== */
function BudgetFormDialog({
  open, onOpenChange, costCenterId, costCenterName, editItem,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  costCenterId: string; costCenterName: string;
  editItem: BudgetRow | null;
}) {
  return (
    <BudgetFormInner
      key={editItem?.id ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
      costCenterId={costCenterId}
      costCenterName={costCenterName}
      editItem={editItem}
    />
  );
}

function BudgetFormInner({
  open, onOpenChange, costCenterId, costCenterName, editItem,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  costCenterId: string; costCenterName: string;
  editItem: BudgetRow | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(() => ({
    period: editItem?.period ?? String(new Date().getFullYear()),
    periodType: editItem?.periodType ?? "yearly",
    plannedAmount: editItem?.plannedAmount ?? "",
    notes: editItem?.notes ?? "",
  }));
  const [saving, setSaving] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/api/budgets", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success(editItem ? "تم تحديث الميزانية" : "تم إنشاء الميزانية");
      qc.invalidateQueries({ queryKey: ["budgets", costCenterId] });
      qc.invalidateQueries({ queryKey: ["cost-centers"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "فشل"),
  });

  const submit = () => {
    if (!form.period.trim()) return toast.error("الفترة مطلوبة");
    if (!form.plannedAmount || Number(form.plannedAmount) < 0) return toast.error("المبلغ المخطط غير صحيح");
    setSaving(true);
    mutation.mutate(
      {
        costCenterId,
        period: form.period.trim(),
        periodType: form.periodType,
        plannedAmount: Number(form.plannedAmount),
        notes: form.notes || undefined,
      },
      { onSettled: () => setSaving(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editItem ? "تعديل ميزانية" : "ميزانية جديدة"}</DialogTitle>
          <DialogDescription>المركز: {costCenterName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">الفترة *</Label>
              <Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="mt-1 nums" placeholder="2026 أو 2026-Q1 أو 2026-01" />
            </div>
            <div>
              <Label className="text-xs">نوع الفترة</Label>
              <Select value={form.periodType} onValueChange={(v) => setForm({ ...form, periodType: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yearly">سنوي</SelectItem>
                  <SelectItem value="quarterly">ربعي</SelectItem>
                  <SelectItem value="monthly">شهري</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">المبلغ المخطط *</Label>
            <Input type="number" min="0" step="0.01" value={form.plannedAmount} onChange={(e) => setForm({ ...form, plannedAmount: e.target.value })} className="mt-1 nums" />
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="ملاحظات حول الميزانية..." />
          </div>
          {editItem && (
            <p className="text-xs text-muted-foreground">
              سيتم تحديث الميزانية الموجودة للفترة {editItem.period}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary/90">{saving ? "جارٍ الحفظ..." : editItem ? "تحديث" : "إنشاء"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
