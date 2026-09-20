"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { PageHeader, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import {
  TASK_STATUSES, TASK_TYPES, TASK_PRIORITIES,
  taskNumber, relativeTime,
} from "@/lib/constants";
import {
  GROUP_OPTIONS, groupTasks, type GroupBy, type SortField,
} from "@/lib/task-utils";
import { useToast } from "@/hooks/use-toast";
import {
  ListTodo, Search, X, Plus, Download, ChevronRight, ChevronLeft,
  Clock, AlertTriangle, PauseCircle, FileWarning, ShieldQuestion,
  SlidersHorizontal, RotateCw, Bookmark, Pin, Trash2,
  ChevronDown, ArrowUp, ArrowDown, ArrowUpDown,
  Tag, Calendar, UserPlus, Flag, RefreshCw, Loader2, Save, Layers,
  Ban, CheckCircle2, Building2,
} from "lucide-react";

const PAGE_SIZE = 20;

const STATUS_KEYS = Object.keys(TASK_STATUSES);
const TYPE_KEYS = Object.keys(TASK_TYPES);
const PRIORITY_KEYS = Object.keys(TASK_PRIORITIES);

type MineScope = "all" | "assigned" | "created" | "following";

interface TaskFilters {
  search: string;
  status: string[];
  priority: string[];
  type: string[];
  departmentId: string;
  assigneeId: string;
  projectId: string;
  dueFrom: string;
  dueTo: string;
  hasAttachments: boolean;
  missingAttachments: boolean;
  overdue: boolean;
  stalled: boolean;
  approvalPending: boolean;
  tags: string[];
  mine: MineScope;
}

const EMPTY_FILTERS: TaskFilters = {
  search: "",
  status: [],
  priority: [],
  type: [],
  departmentId: "",
  assigneeId: "",
  projectId: "",
  dueFrom: "",
  dueTo: "",
  hasAttachments: false,
  missingAttachments: false,
  overdue: false,
  stalled: false,
  approvalPending: false,
  tags: [],
  mine: "all",
};

const SORT_FIELDS: Array<{ value: SortField; label: string }> = [
  { value: "createdAt", label: "تاريخ الإنشاء" },
  { value: "updatedAt", label: "آخر تحديث" },
  { value: "dueDate", label: "الموعد النهائي" },
  { value: "priority", label: "الأولوية" },
  { value: "status", label: "الحالة" },
  { value: "title", label: "العنوان" },
  { value: "progress", label: "التقدم" },
];

// ============ Filter ↔ URL sync ============
function filtersToQuery(filters: TaskFilters, sort: string, groupBy: GroupBy, page: number): string {
  const p = new URLSearchParams();
  if (filters.search) p.set("q", filters.search);
  if (filters.status.length) p.set("status", filters.status.join(","));
  if (filters.priority.length) p.set("priority", filters.priority.join(","));
  if (filters.type.length) p.set("type", filters.type.join(","));
  if (filters.departmentId) p.set("dept", filters.departmentId);
  if (filters.assigneeId) p.set("assignee", filters.assigneeId);
  if (filters.projectId) p.set("project", filters.projectId);
  if (filters.dueFrom) p.set("from", filters.dueFrom);
  if (filters.dueTo) p.set("to", filters.dueTo);
  if (filters.hasAttachments) p.set("hasAtt", "1");
  if (filters.missingAttachments) p.set("missAtt", "1");
  if (filters.overdue) p.set("overdue", "1");
  if (filters.stalled) p.set("stalled", "1");
  if (filters.approvalPending) p.set("appr", "1");
  if (filters.tags.length) p.set("tags", filters.tags.join(","));
  if (filters.mine !== "all") p.set("mine", filters.mine);
  if (sort !== "createdAt:desc") p.set("sort", sort);
  if (groupBy !== "none") p.set("group", groupBy);
  if (page > 1) p.set("page", String(page));
  return p.toString();
}

function queryToFilters(qs: string): { filters: Partial<TaskFilters>; sort: string; groupBy: GroupBy; page: number } {
  const p = new URLSearchParams(qs);
  const out: Partial<TaskFilters> = {};
  if (p.get("q")) out.search = p.get("q")!;
  if (p.get("status")) out.status = p.get("status")!.split(",").filter(Boolean);
  if (p.get("priority")) out.priority = p.get("priority")!.split(",").filter(Boolean);
  if (p.get("type")) out.type = p.get("type")!.split(",").filter(Boolean);
  if (p.get("dept")) out.departmentId = p.get("dept")!;
  if (p.get("assignee")) out.assigneeId = p.get("assignee")!;
  if (p.get("project")) out.projectId = p.get("project")!;
  if (p.get("from")) out.dueFrom = p.get("from")!;
  if (p.get("to")) out.dueTo = p.get("to")!;
  if (p.get("hasAtt") === "1") out.hasAttachments = true;
  if (p.get("missAtt") === "1") out.missingAttachments = true;
  if (p.get("overdue") === "1") out.overdue = true;
  if (p.get("stalled") === "1") out.stalled = true;
  if (p.get("appr") === "1") out.approvalPending = true;
  if (p.get("tags")) out.tags = p.get("tags")!.split(",").filter(Boolean);
  const mine = p.get("mine") as MineScope | null;
  if (mine && ["all", "assigned", "created", "following"].includes(mine)) out.mine = mine;
  const sort = p.get("sort") || "createdAt:desc";
  const groupBy = (p.get("group") as GroupBy | null) || "none";
  const page = Math.max(1, parseInt(p.get("page") || "1", 10) || 1);
  return { filters: out, sort, groupBy, page };
}

// ============ Main component ============
export function TasksView({ user }: { user: CurrentUser }) {
  const { setView, params } = useNav();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const canViewAll = canClient(user, "task.view.all");
  const canViewOwn = canClient(user, "task.view.own");
  const canBulk = canClient(user, "task.bulk_action");
  const canManageViews = canClient(user, "task.manage_views");
  const canCreate = canClient(user, "task.create");
  const canExport = canClient(user, "report.export");

  // Initial state from URL
  const initial = useMemo(() => {
    const fromUrl = typeof window !== "undefined"
      ? queryToFilters(window.location.search.replace(/^\?/, ""))
      : { filters: {}, sort: "createdAt:desc", groupBy: "none" as GroupBy, page: 1 };
    const merged: TaskFilters = {
      ...EMPTY_FILTERS,
      ...fromUrl.filters,
      // if navigated with params.filter=overdue, set overdue filter on
      overdue: params.filter === "overdue" ? true : (fromUrl.filters.overdue ?? false),
    };
    return { filters: merged, sort: fromUrl.sort, groupBy: fromUrl.groupBy, page: fromUrl.page };
  }, [params.filter]);

  const [filters, setFilters] = useState<TaskFilters>(initial.filters);
  const [sort, setSort] = useState<string>(initial.sort);
  const [groupBy, setGroupBy] = useState<GroupBy>(initial.groupBy);
  const [page, setPage] = useState<number>(initial.page);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  // URL sync (history.replaceState) — debounced via effect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = filtersToQuery(filters, sort, groupBy, page);
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [filters, sort, groupBy, page]);

  // Meta (departments/users/projects for filter dropdowns)
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<{
      users: Array<{ id: string; name: string; jobTitle?: string | null }>;
      departments: Array<{ id: string; name: string }>;
      projects: Array<{ id: string; name: string; code?: string | null }>;
    }>("/api/meta"),
  });

  // Build API query string (different from URL — uses API param names)
  const apiQueryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    if (filters.status.length) p.set("status", filters.status.join(","));
    if (filters.priority.length === 1) p.set("priority", filters.priority[0]);
    else if (filters.priority.length > 1) p.set("priority", filters.priority.join(","));
    if (filters.type.length === 1) p.set("type", filters.type[0]);
    else if (filters.type.length > 1) p.set("type", filters.type.join(","));
    if (filters.departmentId) p.set("departmentId", filters.departmentId);
    if (filters.assigneeId) p.set("assigneeId", filters.assigneeId);
    if (filters.projectId) p.set("projectId", filters.projectId);
    if (filters.dueTo) p.set("dueBefore", filters.dueTo);
    if (filters.dueFrom) p.set("dueAfter", filters.dueFrom);
    if (filters.hasAttachments) p.set("hasAttachments", "true");
    if (filters.missingAttachments) p.set("missingAttachments", "true");
    if (filters.overdue) p.set("overdue", "true");
    if (filters.stalled) p.set("stalled", "true");
    if (filters.tags.length) p.set("tags", filters.tags.join(","));
    if (filters.mine !== "all") p.set("mine", filters.mine);
    p.set("sort", sort);
    if (groupBy !== "none") p.set("groupBy", groupBy);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [filters, sort, groupBy, page]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["tasks", apiQueryString],
    queryFn: () => apiFetch<{
      items: TaskListItem[];
      total: number;
      page: number;
      pageSize: number;
      sort: string;
      groupBy: string | null;
    }>(`/api/tasks?${apiQueryString}`),
    placeholderData: keepPreviousData,
    enabled: canViewAll || canViewOwn,
  });

  const rawItems = data?.items ?? [];

  // Client-side filters not natively supported by API:
  // - approvalPending (awaiting_approval OR completed_review)
  // (multi priority/type are now supported via comma-separated values)
  const items = useMemo(() => {
    let arr = rawItems;
    if (filters.approvalPending) {
      arr = arr.filter((t) => t.status === "awaiting_approval" || t.status === "completed_review");
    }
    return arr;
  }, [rawItems, filters.approvalPending]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== "" ||
      filters.status.length > 0 ||
      filters.priority.length > 0 ||
      filters.type.length > 0 ||
      !!filters.departmentId ||
      !!filters.assigneeId ||
      !!filters.projectId ||
      !!filters.dueFrom ||
      !!filters.dueTo ||
      filters.hasAttachments ||
      filters.missingAttachments ||
      filters.overdue ||
      filters.stalled ||
      filters.approvalPending ||
      filters.tags.length > 0 ||
      filters.mine !== "all"
    );
  }, [filters]);

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allOnPageSelected = items.length > 0 && items.every((t) => selected.has(t.id));
  const toggleSelectAll = useCallback(() => {
    setSelected((s) => {
      const next = new Set(s);
      if (items.every((t) => next.has(t.id))) {
        items.forEach((t) => next.delete(t.id));
      } else {
        items.forEach((t) => next.add(t.id));
      }
      return next;
    });
  }, [items]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Grouped items (when groupBy !== none)
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    return groupTasks(items, groupBy);
  }, [items, groupBy]);

  // ============ Bulk action mutation ============
  const bulkMut = useMutation({
    mutationFn: (vars: { taskIds: string[]; action: string; value?: unknown; force?: boolean }) =>
      apiFetch<{ updated: string[]; skipped: Array<{ id: string; reason: string }>; bulkActionId: string }>(
        "/api/tasks/bulk",
        { method: "POST", body: JSON.stringify(vars) }
      ),
    onMutate: async (vars) => {
      // Optimistic: cancel outgoing refetches so they don't clobber our update
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      // Snapshot for rollback
      const snapshot = queryClient.getQueriesData<{ items: TaskListItem[] }>({ queryKey: ["tasks"] });
      // Apply optimistic update to all matching task queries
      queryClient.setQueriesData<{ items: TaskListItem[] }>({ queryKey: ["tasks"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((t) => {
            if (!vars.taskIds.includes(t.id)) return t;
            const next = { ...t };
            if (vars.action === "status") next.status = String(vars.value ?? t.status);
            else if (vars.action === "priority") next.priority = String(vars.value ?? t.priority);
            else if (vars.action === "dueDate") next.dueDate = vars.value ? String(vars.value) : null;
            else if (vars.action === "department") next.departmentId = vars.value ? String(vars.value) : null;
            return next;
          }),
        };
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback
      if (ctx?.snapshot) {
        ctx.snapshot.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      toast({ title: "تعذّر تنفيذ الإجراء الجماعي", variant: "destructive" });
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      const updatedCount = result.updated.length;
      const skippedCount = result.skipped.length;
      clearSelection();
      if (updatedCount > 0) {
        toast({
          title: `تم تحديث ${updatedCount} مهمة`,
          description: skippedCount > 0 ? `تم تخطّي ${skippedCount} مهمة` : undefined,
          duration: 10000,
          action: (
            <Button
              size="sm"
              variant="outline"
              onClick={() => undoBulk(result.bulkActionId, vars.action, updatedCount)}
              className="gap-1"
            >
              <RotateCw className="h-3.5 w-3.5" /> تراجع
            </Button>
          ),
        });
      } else {
        toast({ title: "لم يتم تحديث أي مهمة", description: "ربما لا تملك الصلاحية أو الحقول غير مكتملة", variant: "destructive" });
      }
    },
  });

  const undoBulk = async (bulkActionId: string, action: string, count: number) => {
    try {
      await apiFetch(`/api/tasks/bulk/${bulkActionId}/undo`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: `تم التراجع عن ${count} ${action === "status" ? "تغيير حالة" : "إجراء"}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطأ غير معروف";
      toast({ title: "تعذّر التراجع", description: msg, variant: "destructive" });
    }
  };

  // ============ Saved views ============
  const { data: savedViews, refetch: refetchViews } = useQuery({
    queryKey: ["task-views"],
    queryFn: () => apiFetch<{ items: SavedView[] }>("/api/tasks/views"),
  });

  const saveViewMut = useMutation({
    mutationFn: (body: { name: string; isShared?: boolean; filtersJson: TaskFilters; sortBy: string; groupBy: GroupBy }) =>
      apiFetch<SavedView>("/api/tasks/views", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-views"] });
      setSaveViewOpen(false);
      setSaveViewName("");
      toast({ title: "تم حفظ العرض" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطأ غير معروف";
      toast({ title: "تعذّر حفظ العرض", description: msg, variant: "destructive" });
    },
  });

  const patchViewMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SavedView> }) =>
      apiFetch<SavedView>(`/api/tasks/views/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-views"] });
    },
  });

  const deleteViewMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/tasks/views/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-views"] });
      toast({ title: "تم حذف العرض" });
    },
  });

  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewShared, setSaveViewShared] = useState(false);

  // ============ Bulk action dialog state ============
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkTagsInput, setBulkTagsInput] = useState("");
  const [bulkAssigneeIds, setBulkAssigneeIds] = useState<string[]>([]);
  const [bulkMainAssignee, setBulkMainAssignee] = useState<string>("");
  const [bulkForce, setBulkForce] = useState(false);

  const resetBulkForm = () => {
    setBulkAction(null);
    setBulkValue("");
    setBulkTagsInput("");
    setBulkAssigneeIds([]);
    setBulkMainAssignee("");
    setBulkForce(false);
  };

  const submitBulk = () => {
    if (!bulkAction) return;
    const selectedIds = Array.from(selected);
    const body: { taskIds: string[]; action: string; value?: unknown; force?: boolean } = {
      taskIds: selectedIds,
      action: bulkAction,
    };
    if (bulkAction === "assign") {
      body.value = { userIds: bulkAssigneeIds, mainAssigneeId: bulkMainAssignee || null };
    } else if (bulkAction === "tags") {
      body.value = bulkTagsInput.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (bulkAction === "dueDate" || bulkAction === "department") {
      body.value = bulkValue || null;
    } else {
      body.value = bulkValue;
    }
    if (bulkForce) body.force = true;
    bulkMut.mutate(body);
    resetBulkForm();
  };

  // ============ Permission gate ============
  if (!canViewAll && !canViewOwn) {
    return (
      <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
        <PageHeader title="قائمة المهام" subtitle="عرض المهام المتاح لك" />
        <Card className="p-6">
          <EmptyState
            icon={ShieldQuestion}
            title="لا تملك صلاحية عرض المهام"
            description="تواصل مع المدير لمنحك صلاحية عرض المهام الخاصة بك أو جميع المهام."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="قائمة المهام"
        subtitle={`${total} مهمة إجمالاً`}
        actions={
          <>
            {canExport && (
              <Button variant="outline" size="sm" onClick={() => toast({ title: "قريبًا: تصدير CSV" })} className="gap-1.5">
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
          {/* الصف الأول: بحث + إجراءات */}
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

            {/* Mine segmented control */}
            <MineSegmented
              value={filters.mine}
              onChange={(v) => { setFilters((f) => ({ ...f, mine: v })); setPage(1); }}
            />

            {/* Saved views dropdown */}
            <SavedViewsDropdown
              views={savedViews?.items ?? []}
              canManageViews={!!canManageViews}
              currentUserId={user.id}
              onLoad={(v) => {
                const parsed = JSON.parse(v.filtersJson || "{}") as Partial<TaskFilters>;
                setFilters({ ...EMPTY_FILTERS, ...parsed });
                if (v.sortBy) setSort(v.sortBy);
                if (v.groupBy) setGroupBy(v.groupBy as GroupBy);
                setPage(1);
                toast({ title: `تم تحميل العرض «${v.name}»` });
              }}
              onTogglePin={(v) => patchViewMut.mutate({ id: v.id, body: { isPinned: !v.isPinned } })}
              onDelete={(v) => deleteViewMut.mutate(v.id)}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveViewOpen(true)}
              className="gap-1.5"
              disabled={false}
            >
              <Bookmark className="h-4 w-4" /> حفظ العرض
            </Button>

            <Button
              variant={showFiltersPanel ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFiltersPanel((v) => !v)}
              className="gap-1.5"
              aria-expanded={showFiltersPanel}
            >
              <SlidersHorizontal className="h-4 w-4" />
              فلاتر
              {hasActiveFilters && (
                <Badge variant="secondary" className="nums h-5 px-1.5 ml-0.5">
                  {Object.entries(filters).filter(([, v]) => Array.isArray(v) ? v.length > 0 : !!v).length}
                </Badge>
              )}
            </Button>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }} className="text-muted-foreground gap-1">
                <X className="h-4 w-4" /> مسح الفلاتر
              </Button>
            )}
          </div>

          {/* الصف الثاني: الفلاتر التفصيلية (collapsible) */}
          {showFiltersPanel && (
            <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-border">
              {/* حالة (متعدد) */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9">
                    <PauseCircle className="h-4 w-4" />
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
                          <Checkbox checked={filters.status.includes(k)} onCheckedChange={() => {
                            setFilters((f) => ({
                              ...f,
                              status: f.status.includes(k) ? f.status.filter((s) => s !== k) : [...f.status, k],
                            }));
                            setPage(1);
                          }} />
                          <StatusBadge label={s.label} color={s.color} />
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* الأولوية (متعدد) */}
              <MultiSelectPopover
                label="الأولوية"
                icon={Flag}
                selected={filters.priority}
                options={PRIORITY_KEYS.map((k) => ({ value: k, label: TASK_PRIORITIES[k as keyof typeof TASK_PRIORITIES].label }))}
                onToggle={(v) => {
                  setFilters((f) => ({
                    ...f,
                    priority: f.priority.includes(v) ? f.priority.filter((p) => p !== v) : [...f.priority, v],
                  }));
                  setPage(1);
                }}
              />

              {/* النوع (متعدد) */}
              <MultiSelectPopover
                label="النوع"
                icon={Layers}
                selected={filters.type}
                options={TYPE_KEYS.map((k) => ({ value: k, label: TASK_TYPES[k as keyof typeof TASK_TYPES] }))}
                onToggle={(v) => {
                  setFilters((f) => ({
                    ...f,
                    type: f.type.includes(v) ? f.type.filter((p) => p !== v) : [...f.type, v],
                  }));
                  setPage(1);
                }}
              />

              <FilterSelect
                placeholder="الإدارة"
                value={filters.departmentId}
                onChange={(v) => { setFilters((f) => ({ ...f, departmentId: v })); setPage(1); }}
                options={(meta?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
              />
              <FilterSelect
                placeholder="المسؤول"
                value={filters.assigneeId}
                onChange={(v) => { setFilters((f) => ({ ...f, assigneeId: v })); setPage(1); }}
                options={(meta?.users ?? []).map((u) => ({ value: u.id, label: u.name + (u.jobTitle ? ` — ${u.jobTitle}` : "") }))}
              />
              <FilterSelect
                placeholder="المشروع"
                value={filters.projectId}
                onChange={(v) => { setFilters((f) => ({ ...f, projectId: v })); setPage(1); }}
                options={(meta?.projects ?? []).map((p) => ({ value: p.id, label: p.name + (p.code ? ` (${p.code})` : "") }))}
              />

              {/* تاريخ الاستحقاق */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9">
                    <Calendar className="h-4 w-4" />
                    الموعد
                    {(filters.dueFrom || filters.dueTo) && <Badge variant="secondary" className="nums h-5 px-1.5">•</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">من تاريخ</Label>
                      <Input type="date" className="mt-1 nums" value={filters.dueFrom} onChange={(e) => { setFilters((f) => ({ ...f, dueFrom: e.target.value })); setPage(1); }} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
                      <Input type="date" className="mt-1 nums" value={filters.dueTo} onChange={(e) => { setFilters((f) => ({ ...f, dueTo: e.target.value })); setPage(1); }} />
                    </div>
                    {(filters.dueFrom || filters.dueTo) && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => { setFilters((f) => ({ ...f, dueFrom: "", dueTo: "" })); setPage(1); }}>
                        مسح النطاق
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* الوسوم */}
              <TagsInput
                tags={filters.tags}
                onAdd={(t) => { setFilters((f) => ({ ...f, tags: [...new Set([...f.tags, t])] })); setPage(1); }}
                onRemove={(t) => { setFilters((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) })); setPage(1); }}
              />

              <ToggleChip active={filters.overdue} onClick={() => { setFilters((f) => ({ ...f, overdue: !f.overdue })); setPage(1); }} icon={Clock} label="متأخرة" color="red" />
              <ToggleChip active={filters.stalled} onClick={() => { setFilters((f) => ({ ...f, stalled: !f.stalled })); setPage(1); }} icon={PauseCircle} label="متعثرة" color="red" />
              <ToggleChip active={filters.approvalPending} onClick={() => { setFilters((f) => ({ ...f, approvalPending: !f.approvalPending })); setPage(1); }} icon={ShieldQuestion} label="بانتظار الاعتماد" color="amber" />
              <ToggleChip active={filters.hasAttachments} onClick={() => { setFilters((f) => ({ ...f, hasAttachments: !f.hasAttachments, missingAttachments: false })); setPage(1); }} icon={CheckCircle2} label="بمرفقات" color="green" />
              <ToggleChip active={filters.missingAttachments} onClick={() => { setFilters((f) => ({ ...f, missingAttachments: !f.missingAttachments, hasAttachments: false })); setPage(1); }} icon={FileWarning} label="بدون مرفقات" color="amber" />
            </div>
          )}

          {/* الصف الثالث: الترتيب والتجميع */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <SortControl value={sort} onChange={setSort} />
            <GroupControl value={groupBy} onChange={(v) => setGroupBy(v)} />
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground nums">
              عرض {items.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} من {total}
            </span>
          </div>
        </div>
      </Card>

      {/* الجدول */}
      <Card className="p-0 overflow-hidden relative">
        {/* "جارٍ التحديث" badge */}
        {isFetching && !isLoading && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm border border-border rounded-full px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            جارٍ التحديث
          </div>
        )}

        {isLoading ? (
          <TableSkeleton withCheckbox={!!canBulk} />
        ) : isError ? (
          <ErrorState message={error?.message || "تعذّر تحميل المهام"} onRetry={() => refetch()} />
        ) : !canViewAll && !canViewOwn ? (
          <EmptyState icon={ShieldQuestion} title="لا تملك صلاحية عرض المهام" description="تواصل مع المدير لمنحك صلاحية." />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="لا توجد مهام مطابقة"
            description={hasActiveFilters ? "جرّب تعديل الفلاتر" : "أنشئ مهمة جديدة للبدء"}
            action={canCreate ? (
              <Button onClick={() => setView("task-new")} className="bg-primary gap-1.5">
                <Plus className="h-4 w-4" /> مهمة جديدة
              </Button>
            ) : undefined}
          />
        ) : grouped ? (
          <GroupedTaskList
            groups={grouped}
            selected={selected}
            onToggle={toggleSelect}
            onOpen={(id) => setView("task-detail", { id })}
            canBulk={!!canBulk}
          />
        ) : (
          <TaskTable
            items={items}
            selected={selected}
            allSelected={allOnPageSelected}
            onToggleAll={toggleSelectAll}
            onToggle={toggleSelect}
            onOpen={(id) => setView("task-detail", { id })}
            canBulk={!!canBulk}
          />
        )}

        {/* الترقيم */}
        {items.length > 0 && totalPages > 1 && !grouped && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
            <div className="text-xs text-muted-foreground nums">
              عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="الصفحة السابقة">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs nums px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="الصفحة التالية">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bulk action bar (sticky bottom) */}
      {selected.size > 0 && (
        <BulkActionBar
          selectedCount={selected.size}
          canBulk={!!canBulk}
          onClear={clearSelection}
          onAction={(action) => setBulkAction(action)}
        />
      )}

      {/* Save view dialog */}
      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-4 w-4" /> حفظ العرض الحالي
            </DialogTitle>
            <DialogDescription>احفظ إعدادات الفلاتر والترتيب والتجميع الحالية لاستخدامها لاحقًا.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="view-name">اسم العرض</Label>
              <Input
                id="view-name"
                className="mt-1"
                placeholder="مثال: مهامي العاجلة"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                maxLength={80}
              />
            </div>
            {canManageViews && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={saveViewShared} onCheckedChange={(v) => setSaveViewShared(!!v)} />
                مشاركة العرض مع جميع المستخدمين
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveViewOpen(false)}>إلغاء</Button>
            <Button
              className="bg-primary hover:bg-primary/90 gap-1.5"
              disabled={!saveViewName.trim() || saveViewMut.isPending}
              onClick={() => {
                saveViewMut.mutate({
                  name: saveViewName.trim(),
                  isShared: saveViewShared,
                  filtersJson: filters,
                  sortBy: sort,
                  groupBy,
                });
              }}
            >
              {saveViewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk action dialog */}
      <Dialog open={!!bulkAction} onOpenChange={(v) => !v && resetBulkForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkAction && BULK_ACTION_LABELS[bulkAction]}
              <Badge variant="secondary" className="nums">{selected.size} مهمة</Badge>
            </DialogTitle>
            <DialogDescription>{bulkAction && BULK_ACTION_HINTS[bulkAction]}</DialogDescription>
          </DialogHeader>
          <BulkActionForm
            action={bulkAction}
            meta={meta}
            value={bulkValue}
            setValue={setBulkValue}
            tagsInput={bulkTagsInput}
            setTagsInput={setBulkTagsInput}
            assigneeIds={bulkAssigneeIds}
            setAssigneeIds={setBulkAssigneeIds}
            mainAssignee={bulkMainAssignee}
            setMainAssignee={setBulkMainAssignee}
            force={bulkForce}
            setForce={setBulkForce}
          />
          <DialogFooter>
            <Button variant="outline" onClick={resetBulkForm}>إلغاء</Button>
            <Button
              className="bg-primary hover:bg-primary/90 gap-1.5"
              disabled={bulkMut.isPending || !canSubmitBulk(bulkAction, bulkValue, bulkAssigneeIds, bulkTagsInput)}
              onClick={submitBulk}
            >
              {bulkMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              تنفيذ على {selected.size} مهمة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ Task list item type ============
interface TaskListItem {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  dueDate: string | null;
  progress: number;
  version: number;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  assignees?: Array<{
    id: string;
    userId: string;
    isMain: boolean;
    role: string;
    user: { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null };
  }>;
  subtasks?: Array<{ id: string; title: string; status: string; progress: number }>;
  _count?: { comments?: number; attachments?: number; checklist?: number };
  attachments?: unknown;
}

interface SavedView {
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  isPinned: boolean;
  filtersJson: string;
  sortBy: string;
  groupBy: string | null;
  viewMode: string;
  updatedAt: string;
}

// ============ Sub-components ============

function TableSkeleton({ withCheckbox }: { withCheckbox: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          {withCheckbox && <TableHead className="w-10"><Skeleton className="h-4 w-4" /></TableHead>}
          <TableHead className="w-20">الرقم</TableHead>
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
        {[...Array(8)].map((_, i) => (
          <TableRow key={i}>
            {withCheckbox && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell className="hidden lg:table-cell"><Skeleton className="h-2 w-full" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <div className="h-14 w-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
        <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="font-bold text-foreground">تعذّر تحميل المهام</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md">{message}</p>
      <Button onClick={onRetry} variant="outline" className="mt-4 gap-1.5" size="sm">
        <RotateCw className="h-4 w-4" /> إعادة المحاولة
      </Button>
    </div>
  );
}

function TaskTable({
  items, selected, allSelected, onToggleAll, onToggle, onOpen, canBulk,
}: {
  items: TaskListItem[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  canBulk: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          {canBulk && (
            <TableHead className="w-10 pr-3">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="تحديد الكل" />
            </TableHead>
          )}
          <TableHead className={canBulk ? "w-20" : "w-20 pr-4"}>الرقم</TableHead>
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
        {items.map((t) => (
          <TaskRow
            key={t.id}
            t={t}
            selected={selected.has(t.id)}
            onToggle={() => onToggle(t.id)}
            onOpen={() => onOpen(t.id)}
            canBulk={canBulk}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function TaskRow({
  t, selected, onToggle, onOpen, canBulk,
}: {
  t: TaskListItem;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  canBulk: boolean;
}) {
  const st = TASK_STATUSES[t.status as keyof typeof TASK_STATUSES];
  const mainAssignee = t.assignees?.find((a) => a.isMain) ?? t.assignees?.[0];
  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && !["completed_approved", "cancelled", "archived"].includes(t.status);
  const isBlocked = t.status === "stalled";
  return (
    <TableRow
      className={`cursor-pointer hover:bg-accent/50 transition ${selected ? "bg-primary/5" : ""}`}
      data-state={selected ? "selected" : undefined}
    >
      {canBulk && (
        <TableCell className="pr-3" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          <Checkbox checked={selected} aria-label={`تحديد ${t.title}`} />
        </TableCell>
      )}
      <TableCell className={canBulk ? "text-xs text-muted-foreground nums font-medium" : "pr-4 text-xs text-muted-foreground nums font-medium"} onClick={onOpen}>
        {taskNumber(t.number)}
      </TableCell>
      <TableCell onClick={onOpen}>
        <div className="font-medium line-clamp-1 max-w-xs sm:max-w-md">{t.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          {t.subtasks && t.subtasks.length > 0 && (
            <span className="text-[10px] text-muted-foreground nums">{t.subtasks.length} فرعية</span>
          )}
          {isBlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0.5 rounded">
              <Ban className="h-3 w-3" /> محجوبة
            </span>
          )}
        </div>
      </TableCell>
      <TableCell onClick={onOpen}>
        {st && <StatusBadge label={st.label} color={st.color} />}
      </TableCell>
      <TableCell onClick={onOpen}>
        <PriorityBadgeWithDot priority={t.priority} />
      </TableCell>
      <TableCell onClick={onOpen}>
        {mainAssignee ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{mainAssignee.user?.name?.[0] ?? "؟"}</AvatarFallback>
            </Avatar>
            <span className="text-xs line-clamp-1 max-w-[120px]">{mainAssignee.user?.name}</span>
          </div>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="hidden md:table-cell text-xs text-muted-foreground" onClick={onOpen}>{t.department?.name ?? "—"}</TableCell>
      <TableCell onClick={onOpen}>
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
      <TableCell className="hidden lg:table-cell" onClick={onOpen}>
        <div className="flex items-center gap-2">
          <Progress value={t.progress || 0} className="h-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground nums w-8">{t.progress || 0}%</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PriorityBadgeWithDot({ priority }: { priority: string }) {
  const dotColor: Record<string, string> = {
    urgent: "bg-red-500",
    high: "bg-amber-500",
    medium: "bg-teal-500",
    low: "bg-slate-400",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor[priority] ?? dotColor.medium}`} aria-hidden="true" />
      <PriorityBadge priority={priority} />
    </span>
  );
}

function GroupedTaskList({
  groups, selected, onToggle, onOpen, canBulk,
}: {
  groups: Record<string, TaskListItem[]>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  canBulk: boolean;
}) {
  const groupKeys = Object.keys(groups);
  return (
    <div className="divide-y divide-border">
      {groupKeys.map((key) => (
        <GroupSection
          key={key}
          groupKey={key}
          tasks={groups[key]}
          selected={selected}
          onToggle={onToggle}
          onOpen={onOpen}
          canBulk={canBulk}
        />
      ))}
    </div>
  );
}

function GroupSection({
  groupKey, tasks, selected, onToggle, onOpen, canBulk,
}: {
  groupKey: string;
  tasks: TaskListItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  canBulk: boolean;
}) {
  const [open, setOpen] = useState(true);
  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  const someSelected = tasks.some((t) => selected.has(t.id));
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-bold flex-1 text-right">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            <span>{groupKey}</span>
            <Badge variant="secondary" className="nums h-5 px-1.5">{tasks.length}</Badge>
          </button>
        </CollapsibleTrigger>
        {canBulk && (
          <Checkbox
            checked={allSelected ? true : (someSelected ? "indeterminate" : false)}
            onCheckedChange={() => {
              if (allSelected) {
                tasks.forEach((t) => selected.has(t.id) && onToggle(t.id));
              } else {
                tasks.forEach((t) => !selected.has(t.id) && onToggle(t.id));
              }
            }}
            aria-label={`تحديد الكل في مجموعة ${groupKey}`}
          />
        )}
      </div>
      <CollapsibleContent>
        <Table>
          <TableBody>
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                selected={selected.has(t.id)}
                onToggle={() => onToggle(t.id)}
                onOpen={() => onOpen(t.id)}
                canBulk={canBulk}
              />
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
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

function MultiSelectPopover({
  label, icon: Icon, selected, options, onToggle,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  selected: string[];
  options: { value: string; label: string }[];
  onToggle: (v: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9">
          <Icon className="h-4 w-4" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="nums h-5 px-1.5">{selected.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 max-h-80 overflow-y-auto scrollbar-mir">
        <div className="space-y-1">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 cursor-pointer text-sm py-1">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => onToggle(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ToggleChip({ active, onClick, icon: Icon, label, color }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; color: "red" | "amber" | "green" }) {
  const activeCls = color === "red"
    ? "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
    : color === "green"
    ? "bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
    : "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition ${active ? activeCls : "border-border bg-background hover:bg-accent"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function TagsInput({ tags, onAdd, onRemove }: { tags: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void }) {
  const [input, setInput] = useState("");
  const submit = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) onAdd(v);
    setInput("");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9">
          <Tag className="h-4 w-4" />
          الوسوم
          {tags.length > 0 && <Badge variant="secondary" className="nums h-5 px-1.5">{tags.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="أضف وسمًا…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              className="h-8"
            />
            <Button size="sm" onClick={submit} aria-label="إضافة الوسم">+</Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 pr-1 pl-2">
                  <button onClick={() => onRemove(t)} aria-label={`إزالة الوسم ${t}`} className="hover:bg-background/60 rounded p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {tags.length === 0 && <p className="text-xs text-muted-foreground">لا توجد وسوم بعد.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MineSegmented({ value, onChange }: { value: MineScope; onChange: (v: MineScope) => void }) {
  const opts: Array<{ value: MineScope; label: string }> = [
    { value: "all", label: "الكل" },
    { value: "assigned", label: "المسندة لي" },
    { value: "created", label: "أنشأتها" },
    { value: "following", label: "أتابعها" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5 gap-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-2.5 h-8 rounded text-xs font-medium transition ${value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SortControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [field, dir] = value.split(":");
  return (
    <div className="inline-flex items-center gap-1">
      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={field} onValueChange={(f) => onChange(`${f}:${dir || "desc"}`)}>
        <SelectTrigger size="sm" className="h-8 w-auto min-w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_FIELDS.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onChange(`${field}:${dir === "asc" ? "desc" : "asc"}`)}
        aria-label={dir === "asc" ? "ترتيب تنازلي" : "ترتيب تصاعدي"}
      >
        {dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function GroupControl({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as GroupBy)}>
        <SelectTrigger size="sm" className="h-8 w-auto min-w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GROUP_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SavedViewsDropdown({
  views, canManageViews, currentUserId, onLoad, onTogglePin, onDelete,
}: {
  views: SavedView[];
  canManageViews: boolean;
  currentUserId: string;
  onLoad: (v: SavedView) => void;
  onTogglePin: (v: SavedView) => void;
  onDelete: (v: SavedView) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={views.length === 0}>
          <Bookmark className="h-4 w-4" /> العروض
          {views.length > 0 && <Badge variant="secondary" className="nums h-5 px-1.5">{views.length}</Badge>}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-96 overflow-y-auto scrollbar-mir">
        <DropdownMenuLabel>العروض المحفوظة</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {views.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">لا توجد عروض محفوظة بعد.</div>
        ) : (
          views.map((v) => {
            const canEdit = v.ownerId === currentUserId || (v.isShared && canManageViews);
            return (
              <div key={v.id} className="group flex items-center gap-1 px-1 hover:bg-accent rounded-sm">
                <button
                  className="flex-1 text-right px-2 py-1.5 text-sm flex items-center gap-2"
                  onClick={() => onLoad(v)}
                >
                  {v.isPinned && <Pin className="h-3 w-3 text-primary" />}
                  <span className="flex-1 truncate">{v.name}</span>
                  {v.isShared && <Badge variant="outline" className="text-[10px] h-4 px-1">مشترك</Badge>}
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={() => onTogglePin(v)}
                      className="p-1 hover:bg-background rounded"
                      aria-label={v.isPinned ? "إلغاء التثبيت" : "تثبيت"}
                    >
                      <Pin className={`h-3 w-3 ${v.isPinned ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                    <button
                      onClick={() => onDelete(v)}
                      className="p-1 hover:bg-background rounded text-red-600"
                      aria-label="حذف العرض"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const BULK_ACTION_LABELS: Record<string, React.ReactNode> = {
  assign: (<><UserPlus className="h-4 w-4" /> إسناد المهام</>),
  status: (<><RefreshCw className="h-4 w-4" /> تغيير الحالة</>),
  priority: (<><Flag className="h-4 w-4" /> تغيير الأولوية</>),
  dueDate: (<><Calendar className="h-4 w-4" /> تغيير الموعد</>),
  department: (<><Building2 className="h-4 w-4" /> تغيير الإدارة</>),
  tags: (<><Tag className="h-4 w-4" /> إضافة وسوم</>),
};

const BULK_ACTION_HINTS: Record<string, string> = {
  assign: "اختر المسؤولين والمسؤول الرئيسي. سيتم استبدال الإسنادات الحالية.",
  status: "سيتم تطبيق الانتقال فقط على المهام التي يسمح سير عملها بذلك.",
  priority: "سيتم تحديث أولوية جميع المهام المحددة.",
  dueDate: "أدخل التاريخ الجديد أو اتركه فارغًا لإزالة الموعد.",
  department: "اختر الإدارة الجديدة أو فارغ لإزالة الإدارة.",
  tags: "أدخل الوسوم مفصولة بفواصل. سيتم استبدال الوسوم الحالية.",
};

function canSubmitBulk(
  action: string | null,
  value: string,
  assigneeIds: string[],
  tagsInput: string,
): boolean {
  if (!action) return false;
  if (action === "assign") return assigneeIds.length > 0;
  if (action === "status") return !!value;
  if (action === "priority") return !!value;
  if (action === "dueDate") return true; // can be empty to clear
  if (action === "department") return true;
  if (action === "tags") return tagsInput.trim().length > 0;
  return false;
}

function BulkActionForm({
  action, meta, value, setValue, tagsInput, setTagsInput,
  assigneeIds, setAssigneeIds, mainAssignee, setMainAssignee,
  force, setForce,
}: {
  action: string | null;
  meta: { users: Array<{ id: string; name: string; jobTitle?: string | null }>; departments: Array<{ id: string; name: string }> } | undefined;
  value: string;
  setValue: (v: string) => void;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  assigneeIds: string[];
  setAssigneeIds: (v: string[]) => void;
  mainAssignee: string;
  setMainAssignee: (v: string) => void;
  force: boolean;
  setForce: (v: boolean) => void;
}) {
  if (!action) return null;
  if (action === "status") {
    return (
      <div className="space-y-3 py-2">
        <div>
          <Label>الحالة الجديدة</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_STATUSES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={force} onCheckedChange={(v) => setForce(!!v)} />
          تجاوز الحجب (تنفيذ حتى لو كانت مهمة محجوبة بتبعيات)
        </label>
      </div>
    );
  }
  if (action === "priority") {
    return (
      <div className="py-2">
        <Label>الأولوية الجديدة</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الأولوية" /></SelectTrigger>
          <SelectContent>
            {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (action === "dueDate") {
    return (
      <div className="py-2">
        <Label>الموعد النهائي الجديد</Label>
        <Input type="date" className="mt-1 nums" value={value} onChange={(e) => setValue(e.target.value)} />
        <p className="text-xs text-muted-foreground mt-1">اتركه فارغًا لإزالة الموعد.</p>
      </div>
    );
  }
  if (action === "department") {
    return (
      <div className="py-2">
        <Label>الإدارة الجديدة</Label>
        <Select value={value || "NONE"} onValueChange={(v) => setValue(v === "NONE" ? "" : v)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الإدارة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">— بدون إدارة —</SelectItem>
            {(meta?.departments ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (action === "tags") {
    return (
      <div className="py-2">
        <Label>الوسوم (مفصولة بفواصل)</Label>
        <Input
          className="mt-1"
          placeholder="مثال: عاجل, تسويق, ربع-4"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">سيتم استبدال الوسوم الحالية.</p>
      </div>
    );
  }
  if (action === "assign") {
    return (
      <div className="space-y-3 py-2">
        <div>
          <Label>المسؤولون</Label>
          <div className="mt-1 space-y-1 max-h-48 overflow-y-auto scrollbar-mir border border-border rounded-md p-2">
            {(meta?.users ?? []).map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                <Checkbox
                  checked={assigneeIds.includes(u.id)}
                  onCheckedChange={() => {
                    setAssigneeIds(
                      assigneeIds.includes(u.id)
                        ? assigneeIds.filter((x) => x !== u.id)
                        : [...assigneeIds, u.id]
                    );
                    if (mainAssignee && !assigneeIds.includes(u.id) && mainAssignee !== u.id) {
                      // keep
                    }
                  }}
                />
                <span>{u.name}</span>
                {u.jobTitle && <span className="text-xs text-muted-foreground">— {u.jobTitle}</span>}
              </label>
            ))}
          </div>
        </div>
        {assigneeIds.length > 0 && (
          <div>
            <Label>المسؤول الرئيسي</Label>
            <Select value={mainAssignee || "NONE"} onValueChange={(v) => setMainAssignee(v === "NONE" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر المسؤول الرئيسي" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— تلقائي (الأول) —</SelectItem>
                {assigneeIds.map((id) => {
                  const u = (meta?.users ?? []).find((x) => x.id === id);
                  return <SelectItem key={id} value={id}>{u?.name ?? id}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  }
  return null;
}

function BulkActionBar({
  selectedCount, canBulk, onClear, onAction,
}: {
  selectedCount: number;
  canBulk: boolean;
  onClear: () => void;
  onAction: (action: string) => void;
}) {
  if (!canBulk) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-primary text-primary-foreground shadow-lg rounded-full px-4 py-2 flex items-center gap-3 text-sm">
        <span className="nums font-bold">{selectedCount}</span> محدد
        <button onClick={onClear} aria-label="إلغاء التحديد" className="hover:bg-primary-foreground/20 rounded-full p-1">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  const actions: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "assign", label: "إسناد", icon: UserPlus },
    { key: "status", label: "الحالة", icon: RefreshCw },
    { key: "priority", label: "الأولوية", icon: Flag },
    { key: "dueDate", label: "الموعد", icon: Calendar },
    { key: "department", label: "الإدارة", icon: Building2 },
    { key: "tags", label: "الوسوم", icon: Tag },
  ];
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border border-border shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap max-w-[95vw]">
      <span className="text-sm font-bold flex items-center gap-2 pl-2 border-l border-border">
        <span className="nums bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">{selectedCount}</span>
        محدد
      </span>
      {actions.map((a) => (
        <Button
          key={a.key}
          variant="outline"
          size="sm"
          onClick={() => onAction(a.key)}
          className="gap-1.5 h-8"
        >
          <a.icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{a.label}</span>
        </Button>
      ))}
      <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground gap-1 h-8" aria-label="إلغاء التحديد">
        <X className="h-4 w-4" />
        <span className="hidden sm:inline">إلغاء</span>
      </Button>
    </div>
  );
}
