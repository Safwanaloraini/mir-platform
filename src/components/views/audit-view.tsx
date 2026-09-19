"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/ui-bits/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  ScrollText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  Filter,
  History,
} from "lucide-react";
import { apiFetch, type CurrentUser } from "@/lib/client";
import { formatDateTime } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ACTIONS: Record<string, string> = {
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  create: "إنشاء",
  update: "تحديث",
  delete: "حذف",
  archive: "أرشفة",
  approve: "اعتماد",
  reject: "رفض",
  status_change: "تغيير حالة",
  permission_change: "تغيير صلاحية",
  export: "تصدير",
  settings_change: "تغيير إعداد",
};

const ENTITY_TYPES: Record<string, string> = {
  user: "مستخدم",
  task: "مهمة",
  request: "طلب",
  meeting: "اجتماع",
  decision: "قرار",
  expense: "مصروف",
  invoice: "فاتورة",
  payment: "دفعة",
  setting: "إعداد",
  vendor: "مورد",
  cost_center: "مركز تكلفة",
  budget: "ميزانية",
};

interface AuditItem {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: string | null;
  after?: string | null;
  summary: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: { id: string; name: string; role: string } | null;
}

interface AuditResponse {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function AuditView({ user }: { user: CurrentUser }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [action, setAction] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // قائمة المستخدمين للفلترة
  const { data: usersData } = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ["meta-users-for-audit"],
    queryFn: () => apiFetch("/api/users"),
  });

  const queryStr = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(userId ? { userId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(search ? { search } : {}),
  }).toString();

  const { data, isLoading, isFetching } = useQuery<AuditResponse>({
    queryKey: ["audit", queryStr],
    queryFn: () => apiFetch(`/api/audit?${queryStr}`),
    enabled: !!user,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function reset() {
    setAction("");
    setEntityType("");
    setUserId("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="سجل التدقيق"
        subtitle="سجل شامل للعمليات الحساسة في النظام (للقراءة فقط)"
        actions={
          <Badge variant="outline" className="text-xs gap-1">
            <ScrollText className="h-3 w-3" />
            <span className="nums">{total}</span> سجل
          </Badge>
        }
      />

      {/* الفلاتر */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold">تصفية السجل</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الإجراء</label>
            <Select value={action || "all"} onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="كل الإجراءات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الإجراءات</SelectItem>
                {Object.entries(ACTIONS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">النوع</label>
            <Select value={entityType || "all"} onValueChange={(v) => { setEntityType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {Object.entries(ENTITY_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المستخدم</label>
            <Select value={userId || "all"} onValueChange={(v) => { setUserId(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="كل المستخدمين" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المستخدمين</SelectItem>
                <SelectItem value="me">سجلاتي</SelectItem>
                {(usersData?.items ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">بحث في الوصف</label>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="بحث..."
                className="pr-8"
              />
            </div>
          </div>
        </div>
        {(action || entityType || userId || dateFrom || dateTo || search) && (
          <div className="flex justify-end mt-3">
            <Button variant="ghost" size="sm" onClick={reset}>إزالة الفلاتر</Button>
          </div>
        )}
      </Card>

      {/* الجدول */}
      <Card className="p-0">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={History}
            title="لا توجد سجلات مطابقة"
            description="جرّب تعديل الفلاتر أو تغيير النطاق الزمني."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>التاريخ والوقت</TableHead>
                <TableHead>المستخدم</TableHead>
                <TableHead>الإجراء</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => {
                const hasDiff = !!(a.before || a.after);
                const isOpen = expanded === a.id;
                return (
                  <Fragment key={a.id}>
                    <TableRow
                      onClick={() => hasDiff && setExpanded(isOpen ? null : a.id)}
                      className={cn("cursor-pointer", hasDiff && "hover:bg-accent")}
                    >
                      <TableCell className="text-muted-foreground">
                        {hasDiff && (
                          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground nums whitespace-nowrap">{formatDateTime(a.createdAt)}</TableCell>
                      <TableCell className="text-xs font-medium">{a.user?.name ?? "—محذوف—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">{ACTIONS[a.action] ?? a.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.entityType ? (ENTITY_TYPES[a.entityType] ?? a.entityType) : "—"}</TableCell>
                      <TableCell className="text-xs max-w-md"><span className="line-clamp-1">{a.summary}</span></TableCell>
                      <TableCell className="text-[11px] text-muted-foreground nums">{a.ip ?? "—"}</TableCell>
                    </TableRow>
                    {isOpen && hasDiff && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={6}>
                          <div className="grid sm:grid-cols-2 gap-3 py-2">
                            <DiffPanel title="قبل" jsonStr={a.before} />
                            <DiffPanel title="بعد" jsonStr={a.after} />
                          </div>
                          {a.userAgent && (
                            <div className="text-[10px] text-muted-foreground mt-2 nums" dir="ltr">{a.userAgent}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ترقيم الصفحات */}
      {total > pageSize && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground nums">
            صفحة <span className="font-semibold">{page}</span> من <span className="font-semibold">{totalPages}</span> · إجمالي <span className="font-semibold">{total}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffPanel({ title, jsonStr }: { title: string; jsonStr?: string | null }) {
  let pretty = "—";
  if (jsonStr) {
    try {
      pretty = JSON.stringify(JSON.parse(jsonStr), null, 2);
    } catch {
      pretty = jsonStr;
    }
  }
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 text-[11px] font-bold bg-muted text-muted-foreground border-b border-border">{title}</div>
      <pre className="p-3 text-[11px] leading-relaxed overflow-x-auto max-h-64 overflow-y-auto nums" dir="ltr">{pretty}</pre>
    </div>
  );
}
