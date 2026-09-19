"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatCard, PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch } from "@/lib/client";
import { TASK_STATUSES, taskNumber, relativeTime, formatDate, formatDateTime } from "@/lib/constants";
import type { CurrentUser } from "@/lib/client";
import {
  ListTodo, Clock, CheckCircle2, AlertTriangle, CalendarClock,
  ArrowLeft, Sparkles, PauseCircle, Eye, Flame, ClipboardList,
} from "lucide-react";

const OPEN_STATUSES = ["new", "assigned", "in_progress", "awaiting_info", "awaiting_approval", "stalled", "completed_review"];
const PENDING_STATUSES = ["awaiting_info", "awaiting_approval"];
const COMPLETED_STATUSES = ["completed_approved", "cancelled"];

export function MyWorkView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();

  const { data, isLoading } = useQuery({
    queryKey: ["mywork", user.id],
    queryFn: () => apiFetch<{ items: any[] }>("/api/tasks?mine=true&pageSize=100"),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  const tasks = data?.items ?? [];
  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const pending = tasks.filter((t) => PENDING_STATUSES.includes(t.status));
  const completed = tasks.filter((t) => COMPLETED_STATUSES.includes(t.status));
  const stalled = tasks.filter((t) => t.status === "stalled");

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const dueToday = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) <= todayEnd && !COMPLETED_STATUSES.includes(t.status)
  );
  const overdue = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < todayStart && !COMPLETED_STATUSES.includes(t.status)
  );

  // ما يحتاج تدخلي
  const needsMyAction = tasks.filter((t) => {
    if (t.status === "in_progress" && t.assignees?.some((a: any) => a.userId === user.id)) return true;
    if (t.status === "awaiting_info" && t.assignees?.some((a: any) => a.userId === user.id)) return true;
    if (t.status === "awaiting_approval" && t.createdById === user.id) return true;
    return false;
  });

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="أعمالي"
        subtitle="مهامي ومسؤولياتي الحالية"
        actions={
          <Button onClick={() => setView("task-new")} className="bg-primary hover:bg-primary/90 gap-1.5">
            <ListTodo className="h-4 w-4" /> مهمة جديدة
          </Button>
        }
      />

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="مهام مفتوحة" value={open.length} icon={ListTodo} color="primary" />
        <StatCard label="بانتظار إجراء" value={pending.length} icon={Clock} color="amber" subtitle="تحتاج متابعة" />
        <StatCard label="مكتملة" value={completed.length} icon={CheckCircle2} color="green" />
        <StatCard label="متأخرة" value={overdue.length} icon={AlertTriangle} color="red" trend={overdue.length > 0 ? { value: "تحتاج تدخل", up: false } : undefined} />
      </div>

      {/* جدول اليوم */}
      <SectionCard
        title="أجندة اليوم"
        action={<Button variant="ghost" size="sm" onClick={() => setView("calendar")}><CalendarClock className="h-4 w-4 ml-1" />التقويم</Button>}
      >
        {dueToday.length === 0 ? (
          <EmptyState icon={CalendarClock} title="لا توجد مهام مستحقة اليوم" description="استمتع بيوم هادئ!" />
        ) : (
          <div className="space-y-2">
            {dueToday.map((t) => (
              <TaskRow key={t.id} task={t} highlight="today" onClick={() => setView("task-detail", { id: t.id })} />
            ))}
          </div>
        )}
      </SectionCard>

      {overdue.length > 0 && (
        <SectionCard title="مهام متأخرة" className="border-red-200 dark:border-red-900/40">
          <div className="space-y-2">
            {overdue.slice(0, 5).map((t) => (
              <TaskRow key={t.id} task={t} highlight="overdue" onClick={() => setView("task-detail", { id: t.id })} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* ما يحتاج تدخلي */}
      <SectionCard title="ما يحتاج تدخلي" action={<Sparkles className="h-4 w-4 text-orange-500" />}>
        {needsMyAction.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="لا يوجد ما يحتاج تدخلك الآن" description="كل شيء تحت السيطرة" />
        ) : (
          <div className="space-y-2">
            {needsMyAction.map((t) => (
              <TaskRow key={t.id} task={t} showActionBadge onClick={() => setView("task-detail", { id: t.id })} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* قوائم حسب الحالة */}
      <div className="grid lg:grid-cols-3 gap-4">
        <SectionCard title={`مفتوحة (${open.length})`}>
          <TaskList tasks={open} emptyIcon={ListTodo} emptyTitle="لا توجد مهام مفتوحة" onOpen={(id) => setView("task-detail", { id })} />
        </SectionCard>
        <SectionCard title={`بانتظار (${pending.length})`}>
          <TaskList tasks={pending} emptyIcon={PauseCircle} emptyTitle="لا توجد مهام بانتظار" onOpen={(id) => setView("task-detail", { id })} />
        </SectionCard>
        <SectionCard title={`مكتملة (${completed.length})`}>
          <TaskList tasks={completed} emptyIcon={CheckCircle2} emptyTitle="لا توجد مهام مكتملة" onOpen={(id) => setView("task-detail", { id })} />
        </SectionCard>
      </div>
    </div>
  );
}

function TaskList({ tasks, emptyIcon, emptyTitle, onOpen }: { tasks: any[]; emptyIcon: any; emptyTitle: string; onOpen: (id: string) => void }) {
  if (tasks.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} />;
  }
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-mir pl-1">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onClick={() => onOpen(t.id)} />
      ))}
    </div>
  );
}

function TaskRow({ task, highlight, showActionBadge, onClick }: { task: any; highlight?: "today" | "overdue"; showActionBadge?: boolean; onClick: () => void }) {
  const st = TASK_STATUSES[task.status as keyof typeof TASK_STATUSES];
  const isOverdue = highlight === "overdue" || (task.dueDate && new Date(task.dueDate) < new Date() && !["completed_approved", "cancelled"].includes(task.status));
  const isToday = highlight === "today";
  return (
    <button onClick={onClick} className="w-full text-right p-3 rounded-lg border border-border hover:bg-accent transition group">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-muted-foreground nums">{taskNumber(task.number)}</span>
        <div className="flex items-center gap-1.5">
          {showActionBadge && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300 px-1.5 py-0.5 rounded">
              <Flame className="h-3 w-3" /> يتطلب إجراء
            </span>
          )}
          <PriorityBadge priority={task.priority} />
        </div>
      </div>
      <div className="text-sm font-medium line-clamp-1 group-hover:text-primary transition">{task.title}</div>
      <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {st && <StatusBadge label={st.label} color={st.color} />}
          {task.project && <span className="truncate">{task.project.name}</span>}
        </div>
        {task.dueDate && (
          <span className={`flex items-center gap-1 nums ${isOverdue ? "text-red-600 font-medium" : isToday ? "text-orange-600 font-medium" : ""}`}>
            <Clock className="h-3 w-3" />
            {isToday ? "اليوم" : relativeTime(task.dueDate)}
          </span>
        )}
      </div>
      {typeof task.progress === "number" && task.progress > 0 && (
        <Progress value={task.progress} className="h-1 mt-2" />
      )}
    </button>
  );
}
