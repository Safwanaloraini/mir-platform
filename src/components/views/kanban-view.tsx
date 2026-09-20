"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader, EmptyState } from "@/components/ui-bits/stat-card";
import { PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { TASK_STATUSES, TASK_PRIORITIES, taskNumber, relativeTime } from "@/lib/constants";
import { canTransition, FIELD_LABELS, type TransitionDef } from "@/lib/task-workflow";
import {
  Plus, Clock, ListTodo, Loader2, Lock, Settings2, Rows3, LayoutGrid,
  AlertTriangle, CheckCircle2, ShieldAlert,
} from "lucide-react";

const KANBAN_STATUSES = ["new", "assigned", "in_progress", "awaiting_info", "awaiting_approval", "stalled", "completed_review", "completed_approved"] as const;
type KanbanStatus = (typeof KANBAN_STATUSES)[number];

const COLUMN_COLORS: Record<string, string> = {
  new: "border-t-sky-400",
  assigned: "border-t-teal-400",
  in_progress: "border-t-amber-400",
  awaiting_info: "border-t-violet-400",
  awaiting_approval: "border-t-purple-400",
  stalled: "border-t-red-400",
  completed_review: "border-t-indigo-400",
  completed_approved: "border-t-green-400",
};

const COLUMN_DOT: Record<string, string> = {
  new: "bg-sky-500",
  assigned: "bg-teal-500",
  in_progress: "bg-amber-500",
  awaiting_info: "bg-violet-500",
  awaiting_approval: "bg-purple-500",
  stalled: "bg-red-500",
  completed_review: "bg-indigo-500",
  completed_approved: "bg-green-500",
};

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-sky-400",
  high: "bg-amber-500",
  urgent: "bg-red-500",
};

type SwimlaneMode = "none" | "assignee" | "department" | "priority";

const SWIMLANE_LABELS: Record<SwimlaneMode, string> = {
  none: "بدون ممرات",
  assignee: "حسب المسؤول",
  department: "حسب الإدارة",
  priority: "حسب الأولوية",
};

// ============ مساعدات ============

/** حساب قائمة الحجب من جهة العميل باستخدام علاقة dependencies المُضمَّنة في الاستجابة */
function getBlockingTasksClient(task: any): Array<{ id: string; title: string; number: number; status: string }> {
  const deps = task.dependencies ?? [];
  return deps
    .filter((d: any) =>
      d.type === "finish_to_start" &&
      !["completed_approved", "cancelled", "archived"].includes(d.dependsOn?.status)
    )
    .map((d: any) => ({
      id: d.dependsOn.id,
      title: d.dependsOn.title,
      number: d.dependsOn.number,
      status: d.dependsOn.status,
    }));
}

function isBlockedClient(task: any): boolean {
  return getBlockingTasksClient(task).length > 0;
}

export function KanbanView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [swimlane, setSwimlane] = useState<SwimlaneMode>("none");
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({});
  const [transitionDialog, setTransitionDialog] = useState<{
    open: boolean;
    task: any | null;
    newStatus: KanbanStatus | null;
    requiredFields: string[];
    needsStallReason: boolean;
    needsWaitingReason: boolean;
    requiresForce: boolean;
    blockingTasks: Array<{ id: string; title: string; number: number; status: string }>;
  }>({
    open: false, task: null, newStatus: null, requiredFields: [],
    needsStallReason: false, needsWaitingReason: false, requiresForce: false, blockingTasks: [],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const { data, isLoading } = useQuery({
    queryKey: ["kanban"],
    queryFn: () => apiFetch<{ items: any[] }>("/api/tasks?pageSize=200"),
  });

  const tasks = data?.items ?? [];

  // تجميع حسب الحالة
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of KANBAN_STATUSES) g[s] = [];
    for (const t of tasks) {
      if (g[t.status]) g[t.status].push(t);
    }
    return g;
  }, [tasks]);

  // تجميع حسب الممرات
  const swimlanes = useMemo(() => {
    if (swimlane === "none") return [{ key: "الكل", tasks }];
    const lanes: Record<string, any[]> = {};
    for (const t of tasks) {
      let key = "بدون";
      if (swimlane === "assignee") {
        const main = t.assignees?.find((a: any) => a.isMain) ?? t.assignees?.[0];
        key = main?.user?.name ?? "غير مسند";
      } else if (swimlane === "department") {
        key = t.department?.name ?? "بدون إدارة";
      } else if (swimlane === "priority") {
        key = TASK_PRIORITIES[t.priority as keyof typeof TASK_PRIORITIES]?.label ?? t.priority;
      }
      if (!lanes[key]) lanes[key] = [];
      lanes[key].push(t);
    }
    return Object.entries(lanes).map(([key, list]) => ({ key, tasks: list }));
  }, [tasks, swimlane]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    let newStatus: string | null = null;
    if (KANBAN_STATUSES.includes(overId as KanbanStatus)) {
      newStatus = overId;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      newStatus = overTask?.status ?? null;
    }
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // V1: فحص الانتقال من جانب العميل عبر canTransition
    const isCreator = task.createdById === user.id;
    const isAssignee = !!(task.assignees?.some((a: any) => a.userId === user.id));
    const check = canTransition(task.status, newStatus, {
      isCreator,
      isAssignee,
      can: (p) => canClient(user, p),
    });
    if (!check.allowed) {
      toast({
        title: "غير مسموح بنقل البطاقة",
        description: check.reason ?? "الانتقال غير مسموح بهذه الصلاحية",
        variant: "destructive",
      });
      // لا تحرّك البطاقة — التراجع التلقائي لأننا لم نُحدّث الـ cache
      return;
    }

    const def = check.def as TransitionDef | undefined;
    const requiredFields = def?.requiredFields ?? [];
    const needsStallReason = requiredFields.includes("stallReason");
    const needsWaitingReason = newStatus === "awaiting_info";
    const isCompletion = newStatus === "completed_review" || newStatus === "completed_approved";

    // فحص الحجب إن كان الهدف اكتمال
    let blockingTasks: Array<{ id: string; title: string; number: number; status: string }> = [];
    if (isCompletion) {
      blockingTasks = getBlockingTasksClient(task);
    }
    const requiresForce = isCompletion && blockingTasks.length > 0;

    // إذا كان الانتقال يتطلب جمع حقول أو تجاوز الحجب → افتح الحوار
    if (needsStallReason || needsWaitingReason || requiresForce) {
      setTransitionDialog({
        open: true,
        task,
        newStatus: newStatus as KanbanStatus,
        requiredFields,
        needsStallReason,
        needsWaitingReason,
        requiresForce,
        blockingTasks,
      });
      return;
    }

    // وإلا: تنفيذ مباشر
    await performStatusChange(task, newStatus, {});
  };

  // تنفيذ تغيير الحالة (مع تحديث متفائل + تراجع عند الفشل)
  const performStatusChange = async (task: any, newStatus: string, extra: { stallReason?: string; waitingReason?: string; note?: string; force?: boolean }) => {
    const prev = queryClient.getQueryData<any>(["kanban"]);
    if (prev) {
      const optimisticItems = prev.items.map((t: any) =>
        t.id === task.id ? { ...t, status: newStatus } : t
      );
      queryClient.setQueryData(["kanban"], { ...prev, items: optimisticItems });
    }

    try {
      await apiFetch(`/api/tasks/${task.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          status: newStatus,
          note: extra.note || "نقل عبر لوحة كانبان",
          stallReason: extra.stallReason,
          waitingReason: extra.waitingReason,
          force: extra.force || undefined,
          version: task.version,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["kanban"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    } catch (e: any) {
      if (prev) queryClient.setQueryData(["kanban"], prev);
      const msg = String(e?.message ?? "");
      if (msg === "MODIFIED" || msg.includes("MODIFIED")) {
        toast({
          title: "تم تعديل المهمة من مستخدم آخر",
          description: "أعد السحب بعد تحديث اللوحة",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["kanban"] });
      } else if (msg.startsWith("{")) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.code === "BLOCKED") {
            toast({
              title: "المهمة محجوبة",
              description: parsed.message ?? "تعذّر الانتقال",
              variant: "destructive",
            });
          } else {
            toast({ title: "تعذّر نقل المهمة", description: msg, variant: "destructive" });
          }
        } catch {
          toast({ title: "تعذّر نقل المهمة", description: msg, variant: "destructive" });
        }
      } else {
        toast({ title: "تعذّر نقل المهمة", description: msg, variant: "destructive" });
      }
    }
  };

  const canCreate = canClient(user, "task.create");
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PageHeader
        title="لوحة كانبان"
        subtitle="اسحب وأفلت المهام بين المراحل — يتم التحقق من سير العمل والصلاحيات قبل النقل"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SwimlaneToggle value={swimlane} onChange={setSwimlane} />
            <WipLimitsPopover limits={wipLimits} onChange={setWipLimits} />
            {canCreate ? (
              <Button onClick={() => setView("task-new")} className="bg-primary hover:bg-primary/90 gap-1.5">
                <Plus className="h-4 w-4" /> مهمة جديدة
              </Button>
            ) : null}
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="h-64 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-0"><EmptyState icon={ListTodo} title="لا توجد مهام" description="ابدأ بإنشاء مهمة جديدة" action={canCreate ? <Button onClick={() => setView("task-new")} className="bg-primary gap-1.5"><Plus className="h-4 w-4" /> مهمة جديدة</Button> : undefined} /></Card>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {swimlane === "none" ? (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-3 pb-3 min-w-max">
                {KANBAN_STATUSES.map((s) => {
                  const st = TASK_STATUSES[s];
                  const items = grouped[s] ?? [];
                  return (
                    <KanbanColumn
                      key={s}
                      status={s}
                      label={st.label}
                      color={st.color}
                      borderClass={COLUMN_COLORS[s]}
                      count={items.length}
                      wipLimit={wipLimits[s]}
                      tasks={items}
                      onOpen={(id) => setView("task-detail", { id })}
                    />
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <div className="space-y-4">
              {swimlanes.map((lane) => (
                <div key={lane.key} className="rounded-xl border border-border bg-card/50">
                  <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 rounded-t-xl">
                    <div className="flex items-center gap-2">
                      <Rows3 className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-bold">{lane.key}</h3>
                    </div>
                    <Badge variant="secondary" className="text-xs nums">{lane.tasks.length}</Badge>
                  </div>
                  <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex gap-3 p-3 min-w-max">
                      {KANBAN_STATUSES.map((s) => {
                        const st = TASK_STATUSES[s];
                        const items = lane.tasks.filter((t) => t.status === s);
                        return (
                          <KanbanColumn
                            key={`${lane.key}-${s}`}
                            status={s}
                            label={st.label}
                            color={st.color}
                            borderClass={COLUMN_COLORS[s]}
                            count={items.length}
                            wipLimit={wipLimits[s]}
                            tasks={items}
                            onOpen={(id) => setView("task-detail", { id })}
                          />
                        );
                      })}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              ))}
            </div>
          )}

          <DragOverlay>
            {activeTask ? <KanbanCard task={activeTask} dragging onClick={() => {}} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* حوار جمع الحقول المطلوبة قبل النقل */}
      {transitionDialog.open && transitionDialog.task && transitionDialog.newStatus && (
        <TransitionDialog
          state={transitionDialog}
          onClose={() => setTransitionDialog((s) => ({ ...s, open: false }))}
          onSubmit={async (payload) => {
            if (!transitionDialog.task || !transitionDialog.newStatus) return;
            await performStatusChange(transitionDialog.task, transitionDialog.newStatus, payload);
            setTransitionDialog((s) => ({ ...s, open: false }));
          }}
          onOpenTask={(tid) => {
            setTransitionDialog((s) => ({ ...s, open: false }));
            setView("task-detail", { id: tid });
          }}
        />
      )}
    </div>
  );
}

// ===== ممرات السباحة (Toggle) =====
function SwimlaneToggle({ value, onChange }: { value: SwimlaneMode; onChange: (m: SwimlaneMode) => void }) {
  const isOn = value !== "none";
  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isOn ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => onChange(isOn ? "none" : "assignee")}
              aria-label="تبديل ممرات السباحة"
            >
              {isOn ? <Rows3 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">ممرات</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">تجميع البطاقات أفقياً حسب المسؤول/الإدارة/الأولوية</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {isOn && (
        <Select value={value} onValueChange={(v) => onChange(v as SwimlaneMode)}>
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="نوع الممرات">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assignee">{SWIMLANE_LABELS.assignee}</SelectItem>
            <SelectItem value="department">{SWIMLANE_LABELS.department}</SelectItem>
            <SelectItem value="priority">{SWIMLANE_LABELS.priority}</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ===== إعدادات حدود WIP =====
function WipLimitsPopover({ limits, onChange }: { limits: Record<string, number>; onChange: (l: Record<string, number>) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" aria-label="حدود WIP">
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">حدود الأعمدة</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3" dir="rtl">
        <div className="space-y-2">
          <div className="text-sm font-bold flex items-center gap-1.5">
            <Settings2 className="h-4 w-4" /> حدود العمل قيد التنفيذ (WIP)
          </div>
          <p className="text-xs text-muted-foreground">حدّد أقصى عدد بطاقات لكل عمود. تجاوز الحد يُظهر تنبيهًا (لا يمنع الإفلات).</p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-mir pr-1">
            {KANBAN_STATUSES.map((s) => {
              const st = TASK_STATUSES[s];
              return (
                <div key={s} className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-accent">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${COLUMN_DOT[s]}`} />
                    <span className="text-xs">{st.label}</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    className="h-7 w-16 nums text-xs"
                    placeholder="—"
                    value={limits[s] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({ ...limits, [s]: v === "" ? 0 : Math.max(0, parseInt(v, 10) || 0) });
                    }}
                  />
                </div>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => onChange({})}
          >
            مسح الكل
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ===== عمود كانبان =====
function KanbanColumn({ status, label, color, borderClass, count, wipLimit, tasks, onOpen }: {
  status: string;
  label: string;
  color: string;
  borderClass: string;
  count: number;
  wipLimit?: number;
  tasks: any[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const exceedsWip = wipLimit != null && wipLimit > 0 && count > wipLimit;

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 flex flex-col rounded-xl border border-border border-t-4 ${borderClass} bg-card ${isOver ? "ring-2 ring-primary/40" : ""} ${exceedsWip ? "ring-2 ring-red-400" : ""}`}
      role="region"
      aria-label={`عمود ${label}`}
    >
      <div className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${COLUMN_DOT[status] ?? "bg-slate-400"}`} />
          <h3 className="text-sm font-bold">{label}</h3>
        </div>
        <Badge
          variant={exceedsWip ? "destructive" : "secondary"}
          className={`nums h-5 px-1.5 text-xs ${exceedsWip ? "bg-red-100 text-red-700 border border-red-300" : ""}`}
          title={wipLimit ? `الحد: ${wipLimit}` : undefined}
        >
          {count}{wipLimit ? ` / ${wipLimit}` : ""}
        </Badge>
      </div>
      <div className="flex-1 p-2 space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto scrollbar-mir min-h-[100px]">
        {tasks.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">—</div>
        ) : (
          tasks.map((t) => (
            <DraggableCard key={t.id} task={t} onOpen={onOpen} />
          ))
        )}
      </div>
      {exceedsWip && (
        <div className="px-2 py-1.5 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-[10px] text-red-700 dark:text-red-300 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> تجاوز الحد المسموح ({count}/{wipLimit})
        </div>
      )}
    </div>
  );
}

function DraggableCard({ task, onOpen }: { task: any; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <KanbanCard task={task} onClick={() => !isDragging && onOpen(task.id)} />
    </div>
  );
}

function KanbanCard({ task, onClick, dragging }: { task: any; onClick?: () => void; dragging?: boolean }) {
  const mainAssignee = task.assignees?.find((a: any) => a.isMain) ?? task.assignees?.[0];
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !["completed_approved", "cancelled"].includes(task.status);
  const blocked = isBlockedClient(task);
  return (
    <Card
      onClick={onClick}
      className={`p-3 ${dragging ? "shadow-xl rotate-2 cursor-grabbing" : "cursor-pointer"} hover:shadow-md transition border-border ${blocked ? "ring-1 ring-orange-300" : ""}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && onClick) { e.preventDefault(); onClick(); } }}
      aria-label={`مهمة ${task.title}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted-foreground nums">{taskNumber(task.number)}</span>
        <div className="flex items-center gap-1">
          {blocked && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800">
                    <Lock className="h-2.5 w-2.5" /> محجوبة
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span className="text-xs">هذه المهمة محجوبة بتبعيات غير مكتملة</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.medium}`} title={TASK_PRIORITIES[task.priority as keyof typeof TASK_PRIORITIES]?.label ?? task.priority} />
        </div>
      </div>
      <div className="text-sm font-medium line-clamp-2 leading-snug mb-2">{task.title}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {mainAssignee ? (
            <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px] bg-primary/10 text-primary">{mainAssignee.user?.name?.[0] ?? "؟"}</AvatarFallback></Avatar>
          ) : null}
          {task.assignees?.length > 1 && <span className="text-[10px] text-muted-foreground nums">+{task.assignees.length - 1}</span>}
        </div>
        {task.dueDate && (
          <span className={`text-[10px] flex items-center gap-0.5 nums ${isOverdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
            <Clock className="h-3 w-3" />{relativeTime(task.dueDate)}
          </span>
        )}
      </div>
      {typeof task.progress === "number" && task.progress > 0 && (
        <div className="mt-2 h-1 bg-muted rounded overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${task.progress}%` }} />
        </div>
      )}
    </Card>
  );
}

// ===== حوار جمع الحقول المطلوبة =====
function TransitionDialog({ state, onClose, onSubmit, onOpenTask }: {
  state: {
    open: boolean;
    task: any | null;
    newStatus: KanbanStatus | null;
    requiredFields: string[];
    needsStallReason: boolean;
    needsWaitingReason: boolean;
    requiresForce: boolean;
    blockingTasks: Array<{ id: string; title: string; number: number; status: string }>;
  };
  onClose: () => void;
  onSubmit: (payload: { stallReason?: string; waitingReason?: string; note?: string; force?: boolean }) => Promise<void>;
  onOpenTask: (id: string) => void;
}) {
  const { toast } = useToast();
  const [stallReason, setStallReason] = useState("");
  const [waitingReason, setWaitingReason] = useState("");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // مكوّن جديد في كل فتح (يُنشأ شرطياً من الوالد) لذا الحالة محلية وفيرة
  const newStatus = state.newStatus as KanbanStatus;

  const targetLabel = TASK_STATUSES[newStatus as keyof typeof TASK_STATUSES]?.label ?? newStatus;

  const canSubmit = (() => {
    if (state.needsStallReason && !stallReason.trim()) return false;
    if (state.needsWaitingReason && !waitingReason.trim()) return false;
    if (state.requiresForce && !force) return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast({ title: "أكمل الحقول المطلوبة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        stallReason: state.needsStallReason ? stallReason.trim() : undefined,
        waitingReason: state.needsWaitingReason ? waitingReason.trim() : undefined,
        note: note.trim() || undefined,
        force: state.requiresForce ? true : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={state.open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            نقل إلى: {targetLabel}
          </DialogTitle>
          <DialogDescription>
            هذا الانتقال إلى «{targetLabel}» يتطلب استكمال بعض الحقول قبل التنفيذ.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* قائمة الحقول المطلوبة كـ checklist */}
          {state.requiredFields.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
              <div className="text-xs font-bold text-amber-800 dark:text-amber-200 mb-1.5">هذا الانتقال يتطلب:</div>
              <ul className="space-y-1">
                {state.requiredFields.map((f) => (
                  <li key={f} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    {FIELD_LABELS[f] ?? f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.needsStallReason && (
            <div>
              <Label>سبب التعثر *</Label>
              <Textarea className="mt-1" value={stallReason} onChange={(e) => setStallReason(e.target.value)} placeholder="اشرح سبب التعثر…" />
            </div>
          )}

          {state.needsWaitingReason && (
            <div>
              <Label>سبب الانتظار *</Label>
              <Textarea className="mt-1" value={waitingReason} onChange={(e) => setWaitingReason(e.target.value)} placeholder="ما المعلومات أو الإجراء المنتظر؟" />
            </div>
          )}

          {/* تحذير الحجب */}
          {state.requiresForce && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-red-800 dark:text-red-200">
                    المهمة محجوبة بـ <span className="nums">{state.blockingTasks.length}</span> تبعية غير مكتملة
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {state.blockingTasks.slice(0, 5).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => onOpenTask(b.id)}
                        className="block w-full text-right text-[11px] px-2 py-1 rounded bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition border border-red-200 dark:border-red-800"
                      >
                        <span className="nums text-red-700 dark:text-red-300">{taskNumber(b.number)}</span>
                        {" — "}
                        <span className="text-red-900 dark:text-red-100">{b.title}</span>
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-red-800 dark:text-red-200">
                    <Checkbox checked={force} onCheckedChange={(v) => setForce(!!v)} />
                    تجاوز الحجب (سيسمح بالنقل رغم عدم اكتمال التبعيات)
                  </label>
                </div>
              </div>
            </div>
          )}

          <div>
            <Label>ملاحظة (اختياري)</Label>
            <Textarea className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة حول تغيير الحالة…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
          <Button onClick={handleSubmit} disabled={submitting || !canSubmit} className="bg-primary hover:bg-primary/90 gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {submitting ? "جارٍ…" : "تأكيد النقل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
