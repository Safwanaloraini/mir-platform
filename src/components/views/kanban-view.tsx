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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PageHeader, EmptyState } from "@/components/ui-bits/stat-card";
import { PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { TASK_STATUSES, TASK_PRIORITIES, taskNumber, relativeTime } from "@/lib/constants";
import {
  Plus, Clock, Flame, ListTodo, Loader2, GripVertical,
} from "lucide-react";

const KANBAN_STATUSES = ["new", "assigned", "in_progress", "awaiting_info", "awaiting_approval", "stalled", "completed_review", "completed_approved"] as const;

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

export function KanbanView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const { data, isLoading } = useQuery({
    queryKey: ["kanban"],
    queryFn: () => apiFetch<{ items: any[] }>("/api/tasks?pageSize=200"),
  });

  const tasks = data?.items ?? [];

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of KANBAN_STATUSES) g[s] = [];
    for (const t of tasks) {
      if (g[t.status]) g[t.status].push(t);
    }
    return g;
  }, [tasks]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    // over.id قد يكون عمودًا (status) أو بطاقة مهمة أخرى
    let newStatus: string | null = null;
    if (KANBAN_STATUSES.includes(overId as any)) {
      newStatus = overId;
    } else {
      // بطاقة مهمة — ابحث عن حالتها
      const overTask = tasks.find((t) => t.id === overId);
      newStatus = overTask?.status ?? null;
    }
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // optimistic: update cache
    const prev = queryClient.getQueryData<any>(["kanban"]);
    if (prev) {
      const optimisticItems = prev.items.map((t: any) =>
        t.id === taskId ? { ...t, status: newStatus } : t
      );
      queryClient.setQueryData(["kanban"], { ...prev, items: optimisticItems });
    }

    try {
      await apiFetch(`/api/tasks/${taskId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus, note: "نقل عبر لوحة كانبان" }),
      });
      queryClient.invalidateQueries({ queryKey: ["kanban"] });
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    } catch (e: any) {
      // rollback
      if (prev) queryClient.setQueryData(["kanban"], prev);
      toast({ title: "تعذّر نقل المهمة", description: e?.message, variant: "destructive" });
    }
  };

  const canCreate = canClient(user, "task.create");
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PageHeader
        title="لوحة كانبان"
        subtitle="اسحب وأفلت المهام بين المراحل"
        actions={
          canCreate ? (
            <Button onClick={() => setView("task-new")} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Plus className="h-4 w-4" /> مهمة جديدة
            </Button>
          ) : null
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
                    tasks={items}
                    onOpen={(id) => setView("task-detail", { id })}
                  />
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <DragOverlay>
            {activeTask ? <KanbanCard task={activeTask} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function KanbanColumn({ status, label, color, borderClass, count, tasks, onOpen }: {
  status: string;
  label: string;
  color: string;
  borderClass: string;
  count: number;
  tasks: any[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 flex flex-col rounded-xl border border-border border-t-4 ${borderClass} bg-card ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${COLUMN_DOT[status] ?? "bg-slate-400"}`} />
          <h3 className="text-sm font-bold">{label}</h3>
        </div>
        <Badge variant="secondary" className="nums h-5 px-1.5 text-xs">{count}</Badge>
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
  return (
    <Card
      onClick={onClick}
      className={`p-3 ${dragging ? "shadow-xl rotate-2 cursor-grabbing" : "cursor-pointer"} hover:shadow-md transition border-border`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted-foreground nums">{taskNumber(task.number)}</span>
        <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.medium}`} title={TASK_PRIORITIES[task.priority as keyof typeof TASK_PRIORITIES]?.label ?? task.priority} />
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
