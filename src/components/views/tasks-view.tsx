"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { TASK_STATUSES, TASK_TYPES, TASK_PRIORITIES, taskNumber, relativeTime } from "@/lib/constants";
import {
  ListTodo, Search, Filter, X, Plus, Download, ChevronRight, ChevronLeft,
  Clock, AlertTriangle, PauseCircle, FileWarning, ShieldQuestion, SlidersHorizontal,
} from "lucide-react";

const PAGE_SIZE = 20;

const STATUS_KEYS = Object.keys(TASK_STATUSES);
const TYPE_KEYS = Object.keys(TASK_TYPES);
const PRIORITY_KEYS = Object.keys(TASK_PRIORITIES);

interface TaskFilters {
  search: string;
  status: string[];
  priority: string;
  type: string;
  departmentId: string;
  assigneeId: string;
  overdue: boolean;
  stalled: boolean;
  missingAttachments: boolean;
  approvalPending: boolean;
  mine: boolean;
}

const EMPTY_FILTERS: TaskFilters = {
  search: "",
  status: [],
  priority: "",
  type: "",
  departmentId: "",
  assigneeId: "",
  overdue: false,
  stalled: false,
  missingAttachments: false,
  approvalPending: false,
  mine: false,
};

export function TasksView({ user }: { user: CurrentUser }) {
  const { setView, params } = useNav();
  const queryClient = useQueryClient();

  const initial: TaskFilters = {
    ...EMPTY_FILTERS,
    overdue: params.filter === "overdue" ? true : false,
  };

  const [filters, setFilters] = useState<TaskFilters>(initial);
  const [page, setPage] = useState(1);

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<any>("/api/meta"),
  });

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    if (filters.status.length > 0) p.set("status", filters.status.join(","));
    if (filters.priority) p.set("priority", filters.priority);
    if (filters.type) p.set("type", filters.type);
    if (filters.departmentId) p.set("departmentId", filters.departmentId);
    if (filters.assigneeId) p.set("assigneeId", filters.assigneeId);
    if (filters.overdue) p.set("overdue", "true");
    if (filters.stalled) p.set("stalled", "true");
    if (filters.mine) p.set("mine", "true");
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [filters, page]);

  // approval-pending and missing-attachments are not in API filter, we'll filter client-side
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["tasks", queryString],
    queryFn: () => apiFetch<{ items: any[]; total: number; page: number; pageSize: number }>(`/api/tasks?${queryString}`),
  });

  const rawItems = data?.items ?? [];

  // Apply client-side filters that aren't supported by API
  const items = useMemo(() => {
    let arr = rawItems;
    if (filters.approvalPending) {
      arr = arr.filter((t) => t.status === "awaiting_approval" || t.status === "completed_review");
    }
    if (filters.missingAttachments) {
      arr = arr.filter((t) => t.attachments?._count?.attachments === 0 || t._count?.attachments === 0);
    }
    return arr;
  }, [rawItems, filters.approvalPending, filters.missingAttachments]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status.length > 0 ||
    !!filters.priority ||
    !!filters.type ||
    !!filters.departmentId ||
    !!filters.assigneeId ||
    filters.overdue ||
    filters.stalled ||
    filters.missingAttachments ||
    filters.approvalPending ||
    filters.mine;

  const toggleStatus = (k: string) => {
    setFilters((f) => ({
      ...f,
      status: f.status.includes(k) ? f.status.filter((s) => s !== k) : [...f.status, k],
    }));
    setPage(1);
  };

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const canCreate = canClient(user, "task.create");
  const canExport = canClient(user, "report.export");

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="قائمة المهام"
        subtitle={`${total} مهمة إجمالاً`}
        actions={
          <>
            {canExport && (
              <Button variant="outline" size="sm" onClick={() => { /* stub */ }} className="gap-1.5">
                <Download className="h-4 w-4" /> تصدير
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setView("task-new")} className="bg-primary hover:bg-primary/90 gap-1.5">
                <Plus className="h-4 w-4" /> مهمة جديدة
              </Button>
            )}
          </>
        }
      />

      {/* شريط الفلاتر */}
      <Card className="p-3 lg:p-4">
        <div className="flex flex-col gap-3">
          {/* الصف الأول: بحث + الإجراءات */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث في عناوين المهام…"
                className="pr-9"
                value={filters.search}
                onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))} className={filters.mine ? "bg-primary/10 border-primary text-primary" : ""}>
              <ListTodo className="h-4 w-4 ml-1" /> مهامي
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground gap-1">
                <X className="h-4 w-4" /> مسح الفلاتر
              </Button>
            )}
          </div>

          {/* الصف الثاني: الفلاتر التفصيلية */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* حالة (متعدد) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9">
                  <SlidersHorizontal className="h-4 w-4" />
                  الحالة
                  {filters.status.length > 0 && (
                    <Badge variant="secondary" className="nums h-5 px-1.5">{filters.status.length}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 max-h-80 overflow-y-auto scrollbar-mir">
                <div className="space-y-2">
                  {STATUS_KEYS.map((k) => {
                    const s = TASK_STATUSES[k as keyof typeof TASK_STATUSES];
                    return (
                      <label key={k} className="flex items-center gap-2 cursor-pointer text-sm py-1">
                        <Checkbox checked={filters.status.includes(k)} onCheckedChange={() => toggleStatus(k)} />
                        <StatusBadge label={s.label} color={s.color} />
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <FilterSelect
              placeholder="الأولوية"
              value={filters.priority}
              onChange={(v) => { setFilters((f) => ({ ...f, priority: v })); setPage(1); }}
              options={PRIORITY_KEYS.map((k) => ({ value: k, label: TASK_PRIORITIES[k as keyof typeof TASK_PRIORITIES].label }))}
            />
            <FilterSelect
              placeholder="النوع"
              value={filters.type}
              onChange={(v) => { setFilters((f) => ({ ...f, type: v })); setPage(1); }}
              options={TYPE_KEYS.map((k) => ({ value: k, label: TASK_TYPES[k as keyof typeof TASK_TYPES] }))}
            />
            <FilterSelect
              placeholder="الإدارة"
              value={filters.departmentId}
              onChange={(v) => { setFilters((f) => ({ ...f, departmentId: v })); setPage(1); }}
              options={(meta?.departments ?? []).map((d: any) => ({ value: d.id, label: d.name }))}
            />
            <FilterSelect
              placeholder="المسؤول"
              value={filters.assigneeId}
              onChange={(v) => { setFilters((f) => ({ ...f, assigneeId: v })); setPage(1); }}
              options={(meta?.users ?? []).map((u: any) => ({ value: u.id, label: u.name + (u.jobTitle ? ` — ${u.jobTitle}` : "") }))}
            />

            <ToggleChip active={filters.overdue} onClick={() => { setFilters((f) => ({ ...f, overdue: !f.overdue })); setPage(1); }} icon={Clock} label="متأخرة" color="red" />
            <ToggleChip active={filters.stalled} onClick={() => { setFilters((f) => ({ ...f, stalled: !f.stalled })); setPage(1); }} icon={PauseCircle} label="متعثرة" color="red" />
            <ToggleChip active={filters.approvalPending} onClick={() => { setFilters((f) => ({ ...f, approvalPending: !f.approvalPending })); setPage(1); }} icon={ShieldQuestion} label="بانتظار الاعتماد" color="amber" />
            <ToggleChip active={filters.missingAttachments} onClick={() => { setFilters((f) => ({ ...f, missingAttachments: !f.missingAttachments })); setPage(1); }} icon={FileWarning} label="بدون مرفقات" color="amber" />
          </div>
        </div>
      </Card>

      {/* الجدول */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={ListTodo} title="لا توجد مهام مطابقة" description="جرّب تعديل الفلاتر أو إنشاء مهمة جديدة" action={canCreate ? <Button onClick={() => setView("task-new")} className="bg-primary gap-1.5"><Plus className="h-4 w-4" /> مهمة جديدة</Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pr-4 w-20">الرقم</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead className="w-32">الحالة</TableHead>
                <TableHead className="w-28">الأولوية</TableHead>
                <TableHead className="w-36">المسؤول</TableHead>
                <TableHead className="w-32 hidden md:table-cell">الإدارة</TableHead>
                <TableHead className="w-36">الموعد النهائي</TableHead>
                <TableHead className="w-28 hidden lg:table-cell">التقدم</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => {
                const st = TASK_STATUSES[t.status as keyof typeof TASK_STATUSES];
                const mainAssignee = t.assignees?.find((a: any) => a.isMain) ?? t.assignees?.[0];
                const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && !["completed_approved", "cancelled"].includes(t.status);
                return (
                  <TableRow
                    key={t.id}
                    onClick={() => setView("task-detail", { id: t.id })}
                    className="cursor-pointer hover:bg-accent/50 transition"
                  >
                    <TableCell className="pr-4 text-xs text-muted-foreground nums font-medium">{taskNumber(t.number)}</TableCell>
                    <TableCell>
                      <div className="font-medium line-clamp-1 max-w-xs sm:max-w-md">{t.title}</div>
                      {t.subtasks && t.subtasks.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{t.subtasks.length} مهمة فرعية</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {st && <StatusBadge label={st.label} color={st.color} />}
                    </TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell>
                      {mainAssignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{mainAssignee.user?.name?.[0] ?? "؟"}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs line-clamp-1 max-w-[120px]">{mainAssignee.user?.name}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{t.department?.name ?? "—"}</TableCell>
                    <TableCell>
                      {t.dueDate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-xs flex items-center gap-1 nums ${isOverdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                              <Clock className={`h-3 w-3 ${isOverdue ? "text-red-600" : ""}`} />
                              {relativeTime(t.dueDate)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{new Date(t.dueDate).toLocaleString("ar-SA-u-ca-gregory")}</TooltipContent>
                        </Tooltip>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-2">
                        <Progress value={t.progress || 0} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground nums w-8">{t.progress || 0}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* الترقيم */}
        {items.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
            <div className="text-xs text-muted-foreground nums">
              عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs nums px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {isFetching && items.length > 0 && (
        <div className="text-center text-xs text-muted-foreground">جارٍ التحديث…</div>
      )}
    </div>
  );
}

function FilterSelect({ placeholder, value, onChange, options }: { placeholder: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value || "ALL"} onValueChange={(v) => onChange(v === "ALL" ? "" : v)}>
      <SelectTrigger size="sm" className="h-9 w-auto min-w-[120px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">— {placeholder} —</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleChip({ active, onClick, icon: Icon, label, color }: { active: boolean; onClick: () => void; icon: any; label: string; color: "red" | "amber" }) {
  const activeCls = color === "red"
    ? "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
    : "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition ${active ? activeCls : "border-border bg-background hover:bg-accent"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
