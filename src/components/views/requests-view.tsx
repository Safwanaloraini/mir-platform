"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { StatCard, PageHeader, EmptyState, SectionCard } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import {
  REQUEST_STATUSES, REQUEST_TYPES, ROLES, formatCurrency, formatDate, relativeTime, requestNumber,
} from "@/lib/constants";
import {
  FileText, Plus, Search, Filter, X, Calendar as CalIcon,
  ChevronRight, ChevronLeft, FileSignature, Wallet, Banknote, ShoppingCart,
  Receipt, ArrowLeftRight, PiggyBank, Settings, ShieldAlert, Loader2, Trash2, Paperclip,
  Inbox, CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const STATUS_FILTERS = Object.entries(REQUEST_STATUSES).map(([k, v]) => ({ key: k, label: v.label, color: v.color }));

const TYPE_ICONS: Record<string, any> = {
  ShoppingCart, Banknote, CreditCard, Receipt, Wallet, ArrowLeftRight, FileSignature, PiggyBank, Settings, ShieldAlert,
};

interface RequestItem {
  id: string;
  number: number;
  refCode: string | null;
  title: string;
  status: string;
  amount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string;
  dueDate: string | null;
  createdAt: string;
  requestType: { id: string; nameAr: string; code: string };
  costCenter?: { id: string; name: string; code: string } | null;
  vendor?: { id: string; name: string } | null;
  createdBy: { id: string; name: string; role: string };
  currentStep?: { id: string; approverLabel: string | null; approverRole: string } | null;
  currentApproverRole: string | null;
}

interface MetaData {
  requestTypes: { id: string; code: string; nameAr: string; category: string }[];
  costCenters: { id: string; name: string; code: string }[];
  vendors: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  approvalWorkflows: any[];
}

export function RequestsView({ user }: { user: CurrentUser }) {
  const { setView, params, openDetail } = useNav();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canSeeAmounts = canClient(user, "finance.view.amounts");
  const canCreate = canClient(user, "request.create");

  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ccFilter, setCcFilter] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [prevAction, setPrevAction] = useState<string | undefined>(params.action);

  // فتح نافذة الإنشاء تلقائيًا عبر params.action === "new"
  if (params.action !== prevAction) {
    setPrevAction(params.action);
    if (params.action === "new" && canCreate) {
      setCreateOpen(true);
    }
  }

  const queryStr = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (search) p.set("search", search);
    if (typeFilter !== "all") p.set("requestTypeId", typeFilter);
    if (statusFilter.length) p.set("status", statusFilter.join(","));
    if (ccFilter !== "all") p.set("costCenterId", ccFilter);
    if (mineOnly) p.set("mine", "true");
    if (minAmount) p.set("minAmount", minAmount);
    if (maxAmount) p.set("maxAmount", maxAmount);
    return p.toString();
  }, [page, pageSize, search, typeFilter, statusFilter, ccFilter, mineOnly, minAmount, maxAmount]);

  const { data, isLoading } = useQuery({
    queryKey: ["requests", queryStr],
    queryFn: () => apiFetch<{ items: RequestItem[]; total: number; page: number; pageSize: number }>(`/api/requests?${queryStr}`),
  });

  const { data: meta } = useQuery<MetaData>({
    queryKey: ["meta"],
    queryFn: () => apiFetch("/api/meta"),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearch("");
    setSearchInput("");
    setTypeFilter("all");
    setStatusFilter([]);
    setCcFilter("all");
    setMinAmount("");
    setMaxAmount("");
    setMineOnly(false);
    setPage(1);
  };

  const toggleStatus = (key: string) => {
    setStatusFilter((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));
    setPage(1);
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="الطلبات والاعتمادات"
        subtitle="إدارة طلبات الشراء والصرف والاعتمادات ومتابعة مساراتها"
        actions={
          canCreate && (
            <Button onClick={() => setCreateOpen(true)} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Plus className="h-4 w-4" /> طلب جديد
            </Button>
          )
        }
      />

      {/* مؤشرات سريعة */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="إجمالي الطلبات"
          value={total}
          icon={FileText}
          color="primary"
        />
        <StatCard
          label="بانتظار الاعتماد"
          value={data?.items?.filter((r) => ["under_review", "preliminarily_approved", "awaiting_final"].includes(r.status)).length ?? 0}
          icon={Inbox}
          color="amber"
        />
        <StatCard
          label="معتمدة"
          value={data?.items?.filter((r) => ["approved", "forwarded_accountant", "in_execution", "fully_executed", "closed"].includes(r.status)).length ?? 0}
          icon={FileSignature}
          color="green"
        />
        <StatCard
          label="مرفوضة"
          value={data?.items?.filter((r) => r.status === "rejected").length ?? 0}
          icon={X}
          color="red"
        />
      </div>

      {/* شريط الفلاتر */}
      <Card className="p-4">
        <form onSubmit={onSearchSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="بحث بالعنوان أو الرقم المرجعي أو الغرض..."
                className="pr-9"
              />
            </div>
            <Button type="submit" variant="default" className="gap-1.5">
              <Search className="h-4 w-4" /> بحث
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="نوع الطلب" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {meta?.requestTypes?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between gap-2 font-normal">
                  <span className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    {statusFilter.length === 0 ? "كل الحالات" : `${statusFilter.length} حالة`}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-muted-foreground">تصفية حسب الحالة</div>
                  <div className="max-h-72 overflow-y-auto space-y-1">
                    {STATUS_FILTERS.map((s) => (
                      <label key={s.key} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer">
                        <Checkbox checked={statusFilter.includes(s.key)} onCheckedChange={() => toggleStatus(s.key)} />
                        <StatusBadge label={s.label} color={s.color} />
                      </label>
                    ))}
                  </div>
                  {statusFilter.length > 0 && (
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setStatusFilter([])}>
                      مسح الفلتر
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {canSeeAmounts && (
              <Select value={ccFilter} onValueChange={(v) => { setCcFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="مركز التكلفة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المراكز</SelectItem>
                  {meta?.costCenters?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {canSeeAmounts && (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  placeholder="من"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="text-xs"
                />
                <Input
                  type="number"
                  placeholder="إلى"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border">
              <Label htmlFor="mine-toggle" className="text-xs cursor-pointer">طلباتي فقط</Label>
              <Switch
                id="mine-toggle"
                checked={mineOnly}
                onCheckedChange={(v) => { setMineOnly(v); setPage(1); }}
              />
            </div>
          </div>

          {(search || typeFilter !== "all" || statusFilter.length > 0 || ccFilter !== "all" || mineOnly || minAmount || maxAmount) && (
            <Button type="button" variant="ghost" size="sm" className="w-fit text-xs gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" /> مسح كل الفلاتر
            </Button>
          )}
        </form>
      </Card>

      {/* جدول الطلبات */}
      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : !data?.items?.length ? (
          <EmptyState
            icon={FileText}
            title="لا توجد طلبات"
            description={canCreate ? "ابدأ بإنشاء طلبك الأول." : "لم يصلك أي طلب بعد."}
            action={canCreate && <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> طلب جديد</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-right text-xs font-bold">المرجع</TableHead>
                <TableHead className="text-right text-xs font-bold">العنوان</TableHead>
                <TableHead className="text-right text-xs font-bold">النوع</TableHead>
                <TableHead className="text-right text-xs font-bold">الحالة</TableHead>
                <TableHead className="text-right text-xs font-bold">القيمة</TableHead>
                <TableHead className="text-right text-xs font-bold">مقدم الطلب</TableHead>
                <TableHead className="text-right text-xs font-bold">المسار الحالي</TableHead>
                <TableHead className="text-right text-xs font-bold">الموعد</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => {
                const typeMeta = REQUEST_TYPES[r.requestType.code as keyof typeof REQUEST_TYPES];
                const Icon = (typeMeta?.icon && TYPE_ICONS[typeMeta.icon]) || FileText;
                const statusMeta = REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES];
                return (
                  <TableRow
                    key={r.id}
                    onClick={() => openDetail("request-detail", r.id)}
                    className="cursor-pointer hover:bg-accent/50 transition"
                  >
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-primary nums">{requestNumber(r.number)}</span>
                        {r.refCode && <span className="text-[10px] text-muted-foreground nums">{r.refCode}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-medium line-clamp-1 max-w-xs">{r.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.requestType.nameAr}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={statusMeta?.label ?? r.status}
                        color={statusMeta?.color ?? "slate"}
                      />
                    </TableCell>
                    <TableCell className="text-xs nums font-bold">
                      {canSeeAmounts && r.totalAmount != null ? formatCurrency(r.totalAmount, r.currency) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium">{r.createdBy.name}</span>
                        <span className="text-[10px] text-muted-foreground">{ROLES[r.createdBy.role as keyof typeof ROLES] ?? r.createdBy.role}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.currentApproverRole ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                          {r.currentStep?.approverLabel ?? ROLES[r.currentApproverRole as keyof typeof ROLES] ?? r.currentApproverRole}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.dueDate ? (
                        <div className="flex flex-col">
                          <span className="nums">{formatDate(r.dueDate)}</span>
                          <span className="text-[10px]">{relativeTime(r.dueDate)}</span>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ترقيم الصفحات */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground nums">
            عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} من {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="gap-1"
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <span className="text-sm nums px-2">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="gap-1"
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* نافذة إنشاء طلب جديد */}
      {createOpen && (
        <CreateRequestDialog
          open={createOpen}
          onOpenChange={(v) => {
            setCreateOpen(v);
            if (!v && params.action === "new") {
              setView("requests");
            }
          }}
          meta={meta}
          canSeeAmounts={canSeeAmounts}
          onCreated={(id) => {
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ["requests"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            toast({ title: "تم إنشاء الطلب بنجاح", description: "سيتم تحويله لمسار الاعتماد المناسب." });
            openDetail("request-detail", id);
          }}
        />
      )}
    </div>
  );
}

// ============== نافذة إنشاء الطلب ==============
function CreateRequestDialog({
  open, onOpenChange, meta, canSeeAmounts, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meta?: MetaData;
  canSeeAmounts: boolean;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [typeId, setTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [attachments, setAttachments] = useState<{ fileName: string; fileUrl: string; fileType: string; required: boolean }[]>([]);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch<{ id: string }>("/api/requests", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (resp) => {
      onCreated(resp.id);
      // إعادة ضبط الحقول
      setTypeId(""); setTitle(""); setPurpose(""); setAmount(""); setTaxAmount("");
      setCostCenterId(""); setProjectId(""); setVendorId(""); setBeneficiary("");
      setDueDate(undefined); setAttachments([]); setNote("");
    },
    onError: (e: any) => {
      toast({ title: "تعذّر إنشاء الطلب", description: e.message ?? "خطأ غير معروف", variant: "destructive" });
    },
  });

  const submit = () => {
    if (!typeId) { toast({ title: "اختر نوع الطلب", variant: "destructive" }); return; }
    if (!title.trim()) { toast({ title: "أدخل عنوان الطلب", variant: "destructive" }); return; }
    const selectedType = meta?.requestTypes.find((t) => t.id === typeId);
    mutation.mutate({
      requestTypeId: typeId,
      requestTypeCode: selectedType?.code,
      title: title.trim(),
      purpose: purpose.trim(),
      amount: amount ? Number(amount) : undefined,
      taxAmount: taxAmount ? Number(taxAmount) : undefined,
      costCenterId: costCenterId || undefined,
      projectId: projectId || undefined,
      vendorId: vendorId || undefined,
      beneficiary: beneficiary.trim() || undefined,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      attachments,
      note: note.trim() || undefined,
    });
  };

  const addAttachment = () => {
    setAttachments((a) => [...a, { fileName: "", fileUrl: "", fileType: "document", required: false }]);
  };
  const updateAttachment = (i: number, key: string, value: any) => {
    setAttachments((a) => a.map((x, idx) => (idx === i ? { ...x, [key]: value } : x)));
  };
  const removeAttachment = (i: number) => {
    setAttachments((a) => a.filter((_, idx) => idx !== i));
  };

  const isFinancial = meta?.requestTypes.find((t) => t.id === typeId)?.category === "financial";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> إنشاء طلب جديد
          </DialogTitle>
          <DialogDescription>سيتم تحديد مسار الاعتماد المناسب تلقائيًا بناءً على نوع ومبلغ الطلب.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* نوع الطلب */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">نوع الطلب *</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent>
                  {meta?.requestTypes?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">الموعد النهائي</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-right font-normal">
                    <CalIcon className="ml-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "yyyy/MM/dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    locale={ar}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* العنوان */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">عنوان الطلب *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان موجز وواضح للطلب" />
          </div>

          {/* الغرض */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">الغرض / التبرير</Label>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="اشرح الغرض من الطلب والمبررات..."
              rows={3}
            />
          </div>

          {/* القيم المالية */}
          {canSeeAmounts && isFinancial && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">المبلغ (قبل الضريبة)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">ضريبة القيمة المضافة</Label>
                <Input
                  type="number"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  placeholder="0.00"
                  className="nums"
                />
              </div>
              {amount && (
                <div className="col-span-2 text-xs flex justify-between items-center pt-1 border-t">
                  <span className="text-muted-foreground">الإجمالي شامل الضريبة:</span>
                  <span className="font-bold text-primary nums">
                    {formatCurrency((Number(amount) || 0) + (Number(taxAmount) || 0))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* مركز التكلفة والمشروع والمورد */}
          {canSeeAmounts && (
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">مركز التكلفة</Label>
                <Select value={costCenterId} onValueChange={setCostCenterId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {meta?.costCenters?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">المشروع</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {meta?.projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">المورد</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {meta?.vendors?.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* المستفيد */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">المستفيد</Label>
            <Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="اسم الجهة أو الشخص المستفيد" />
          </div>

          {/* المرفقات */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> المرفقات
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addAttachment} className="gap-1 text-xs">
                <Plus className="h-3 w-3" /> إضافة مرفق
              </Button>
            </div>
            {attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد مرفقات. أضف مرفقًا (رابط ملف مرفوع مسبقًا).</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md border bg-background">
                    <Input
                      placeholder="اسم الملف"
                      value={a.fileName}
                      onChange={(e) => updateAttachment(i, "fileName", e.target.value)}
                      className="text-xs h-8"
                    />
                    <Input
                      placeholder="رابط الملف"
                      value={a.fileUrl}
                      onChange={(e) => updateAttachment(i, "fileUrl", e.target.value)}
                      className="text-xs h-8"
                    />
                    <label className="flex items-center gap-1 text-[10px] whitespace-nowrap px-1">
                      <Checkbox checked={a.required} onCheckedChange={(v) => updateAttachment(i, "required", v)} />
                      إلزامي
                    </label>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAttachment(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ملاحظة افتتاحية */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">ملاحظة للمعتمد (اختياري)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="أي معلومات إضافية للمعتمد..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="gap-1.5 bg-primary hover:bg-primary/90">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
