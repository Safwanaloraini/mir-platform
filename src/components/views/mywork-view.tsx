"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatCard, PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import {
  TASK_STATUSES, taskNumber, relativeTime, formatDate,
} from "@/lib/constants";
import { smartSort } from "@/lib/task-utils";
import { useToast } from "@/hooks/use-toast";
import {
  ListTodo, Clock, CheckCircle2, AlertTriangle, CalendarClock,
  Sparkles, Eye, Flame, ClipboardList, BellOff,
  Ban, ChevronDown, RotateCw, Hand,
} from "lucide-react";

// الحالات المفتوحة (غير المنتهية)
const OPEN_STATUSES = ["new", "assigned", "in_progress", "awaiting_info", "awaiting_approval", "stalled", "completed_review"];
const TERMINAL_STATUSES = ["completed_approved", "cancelled", "archived"];

interface TaskItem {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  dueDate: string | null;
  progress: number;
  completedAt?: string | null;
  createdById: string;
  department?: { id: string; name: string } | null;
  project?: { id: string; name: string; code?: string | null } | null;
  assignees?: Array<{
    id: string;
    userId: string;
    isMain: boolean;
    role: string;
    user: { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null };
  }>;
  subtasks?: Array<{ id: string; title: string; status: string; progress: number }>;
  _count?: { comments?: number; attachments?: number; checklist?: number };
  snoozes?: Array<{ id: string; until: string; reason?: string | null }>;
}

interface SnoozeInfo {
  id: string;
  taskId: string;
  until: string;
  reason?: string | null;
  createdAt: string;
}

// ============ Main component ============
export function MyWorkView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // جلب كل مهامي (المنشأة + المسندة)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["mywork", user.id],
    queryFn: () => apiFetch<{ items: TaskItem[] }>("/api/tasks?mine=all&pageSize=200"),
  });

  // جلب تأجيلاتي
  const { data: snoozesData, refetch: refetchSnoozes } = useQuery({
    queryKey: ["mywork-snoozes", user.id],
    queryFn: () => apiFetch<{ items: SnoozeInfo[] }>("/api/tasks/snoozes"),
  });

  const tasks = data?.items ?? [];
  const snoozes = snoozesData?.items ?? [];
  const snoozeMap = new Map(snoozes.map((s) => [s.taskId, s]));

  // ============ Mutation: snooze ============
  const snoozeMut = useMutation({
    mutationFn: ({ taskId, until, reason }: { taskId: string; until: string; reason?: string }) =>
      apiFetch<{ ok: true; until: string }>(`/api/tasks/${taskId}/snooze`, {
        method: "POST",
        body: JSON.stringify({ until, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mywork-snoozes"] });
      toast({ title: "تم تأجيل التنبيهات" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطأ غير معروف";
      toast({ title: "تعذّر تأجيل التنبيهات", description: msg, variant: "destructive" });
    },
  });

  const unsnoozeMut = useMutation({
    mutationFn: (taskId: string) =>
      apiFetch<{ ok: true }>(`/api/tasks/${taskId}/snooze`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mywork-snoozes"] });
      toast({ title: "تم إلغاء التأجيل" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطأ غير معروف";
      toast({ title: "تعذّر إلغاء التأجيل", description: msg, variant: "destructive" });
    },
  });

  const handleSnooze = useCallback((taskId: string, until: Date, reason?: string) => {
    snoozeMut.mutate({ taskId, until: until.toISOString(), reason });
  }, [snoozeMut]);

  const handleUnsnooze = useCallback((taskId: string) => {
    unsnoozeMut.mutate(taskId);
  }, [unsnoozeMut]);

  // ============ Compute sections ============
  const sections = useMemo(() => {
    const snoozedTaskIds = new Set(snoozes.map((s) => s.taskId));
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const isOpen = (t: TaskItem) => OPEN_STATUSES.includes(t.status);
    const isTerminal = (t: TaskItem) => TERMINAL_STATUSES.includes(t.status);
    const isOverdue = (t: TaskItem) =>
      !!t.dueDate && new Date(t.dueDate) < todayStart && !isTerminal(t);
    // Suppress unused-var lint
    void isOpen;

    // Tasks that are NOT snoozed (active)
    const activeTasks = tasks.filter((t) => !snoozedTaskIds.has(t.id));
    // Snoozed tasks
    const snoozedTasks = tasks.filter((t) => snoozedTaskIds.has(t.id));

    // Helper: is user the creator?
    const isCreator = (t: TaskItem) => t.createdById === user.id;
    // Helper: is user an assignee?
    const isAssignee = (t: TaskItem) => !!t.assignees?.some((a) => a.userId === user.id);
    // Helper: is user a follower?
    const isFollower = (t: TaskItem) => !!t.assignees?.some((a) => a.userId === user.id && a.role === "follower");
    // Helper: is user the main assignee?
    const isMainAssignee = (t: TaskItem) => !!t.assignees?.some((a) => a.userId === user.id && a.isMain);
    // Helper: can approve completion?
    const canApprove = canClient(user, "task.approve_completion");

    // 1. عاجل ومتأخر — priority=urgent OR overdue (not completed)
    const urgentOrOverdue = smartSort(activeTasks.filter((t) =>
      (t.priority === "urgent" || isOverdue(t)) && !isTerminal(t)
    ));

    // 2. مستحق اليوم
    const dueToday = smartSort(activeTasks.filter((t) =>
      t.dueDate &&
      new Date(t.dueDate) >= todayStart &&
      new Date(t.dueDate) <= todayEnd &&
      !isTerminal(t)
    ));

    // 3. مستحق هذا الأسبوع
    const dueThisWeek = smartSort(activeTasks.filter((t) =>
      t.dueDate &&
      new Date(t.dueDate) > todayEnd &&
      new Date(t.dueDate) <= weekEnd &&
      !isTerminal(t)
    ));

    // 4. محجوبة أو متعثرة — status=stalled (list API doesn't return isBlocked)
    const blockedOrStalled = smartSort(activeTasks.filter((t) => t.status === "stalled"));

    // 5. تنتظر إجراءك
    const awaitingMyAction = smartSort(activeTasks.filter((t) => {
      if (t.status === "in_progress" && isAssignee(t)) return true;
      if (t.status === "awaiting_info" && isAssignee(t)) return true;
      if (t.status === "awaiting_approval" && isCreator(t)) return true;
      if (t.status === "completed_review" && (isCreator(t) || canApprove)) return true;
      return false;
    }));

    // 6. أسندتها للآخرين — created by me, has assignees, I'm NOT the main assignee
    const delegatedByMe = smartSort(activeTasks.filter((t) =>
      isCreator(t) &&
      (t.assignees?.length ?? 0) > 0 &&
      !isMainAssignee(t) &&
      !isTerminal(t)
    ));

    // 7. أنشأتها — created by me, not completed
    const createdByMe = smartSort(activeTasks.filter((t) => isCreator(t) && !isTerminal(t)));

    // 8. أتابعها — assignee with role=follower
    const following = smartSort(activeTasks.filter((t) => isFollower(t)));

    // 9. مكتملة حديثًا — completed_approved within last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyCompleted = smartSort(tasks.filter((t) =>
      t.status === "completed_approved" &&
      t.completedAt &&
      new Date(t.completedAt) >= sevenDaysAgo
    ));

    // Snoozed tasks section
    const snoozed = smartSort(snoozedTasks);

    return {
      urgentOrOverdue,
      dueToday,
      dueThisWeek,
      blockedOrStalled,
      awaitingMyAction,
      delegatedByMe,
      createdByMe,
      following,
      recentlyCompleted,
      snoozed,
    };
  }, [tasks, snoozes, user]);

  // ============ Stat cards data ============
  const stats = {
    urgent: sections.urgentOrOverdue.filter((t) => t.priority === "urgent").length,
    overdue: sections.urgentOrOverdue.filter((t) =>
      t.dueDate && new Date(t.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) &&
      !TERMINAL_STATUSES.includes(t.status)
    ).length,
    dueToday: sections.dueToday.length,
    awaitingAction: sections.awaitingMyAction.length,
  };

  // ============ Loading state ============
  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
        <PageHeader title="أعمالي" subtitle="مهامي ومسؤولياتي الحالية" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ============ Error state ============
  if (isError) {
    return (
      <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
        <PageHeader title="أعمالي" subtitle="تعذّر تحميل البيانات" />
        <Card className="p-6">
          <EmptyState
            icon={AlertTriangle}
            title="تعذّر تحميل مهامك"
            description={error?.message || "حدث خطأ غير متوقع"}
            action={
              <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1.5">
                <RotateCw className="h-4 w-4" /> إعادة المحاولة
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

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
        <StatCard label="عاجلة" value={stats.urgent} icon={Flame} color="orange" />
        <StatCard
          label="متأخرة"
          value={stats.overdue}
          icon={AlertTriangle}
          color="red"
          trend={stats.overdue > 0 ? { value: "تحتاج تدخل", up: false } : undefined}
        />
        <StatCard label="مستحقة اليوم" value={stats.dueToday} icon={CalendarClock} color="amber" />
        <StatCard label="تنتظر إجراء" value={stats.awaitingAction} icon={Hand} color="primary" />
      </div>

      {/* 1. عاجل ومتأخر */}
      <SectionCard
        title="عاجل ومتأخر"
        action={
          <Badge variant="secondary" className="nums">{sections.urgentOrOverdue.length}</Badge>
        }
        className={sections.urgentOrOverdue.length > 0 ? "border-orange-200 dark:border-orange-900/40" : undefined}
      >
        {sections.urgentOrOverdue.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="لا توجد مهام عاجلة أو متأخرة" description="كل شيء تحت السيطرة" />
        ) : (
          <TaskList
            tasks={sections.urgentOrOverdue.slice(0, 8)}
            onOpen={(id) => setView("task-detail", { id })}
            onSnooze={handleSnooze}
            onUnsnooze={handleUnsnooze}
            snoozeMap={snoozeMap}
            highlight="urgent"
          />
        )}
      </SectionCard>

      {/* 2 & 3. أجندة اليوم وهذا الأسبوع */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard
          title="مستحق اليوم"
          action={
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="nums">{sections.dueToday.length}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setView("calendar")} className="h-7">
                <CalendarClock className="h-3.5 w-3.5 ml-1" /> التقويم
              </Button>
            </div>
          }
        >
          {sections.dueToday.length === 0 ? (
            <EmptyState icon={CalendarClock} title="لا توجد مهام مستحقة اليوم" description="استمتع بيوم هادئ!" />
          ) : (
            <TaskList
              tasks={sections.dueToday}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
              highlight="today"
            />
          )}
        </SectionCard>

        <SectionCard
          title="مستحق هذا الأسبوع"
          action={<Badge variant="secondary" className="nums">{sections.dueThisWeek.length}</Badge>}
        >
          {sections.dueThisWeek.length === 0 ? (
            <EmptyState icon={CalendarClock} title="لا توجد مهام مستحقة هذا الأسبوع" />
          ) : (
            <TaskList
              tasks={sections.dueThisWeek}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
            />
          )}
        </SectionCard>
      </div>

      {/* 4 & 5. محجوبة / تنتظر إجراءك */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard
          title="محجوبة أو متعثرة"
          action={<Badge variant="secondary" className="nums">{sections.blockedOrStalled.length}</Badge>}
          className={sections.blockedOrStalled.length > 0 ? "border-red-200 dark:border-red-900/40" : undefined}
        >
          {sections.blockedOrStalled.length === 0 ? (
            <EmptyState icon={Ban} title="لا توجد مهام محجوبة أو متعثرة" description="أحسنت! لا حجب ولا تعثر" />
          ) : (
            <TaskList
              tasks={sections.blockedOrStalled}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
              highlight="blocked"
            />
          )}
        </SectionCard>

        <SectionCard
          title="تنتظر إجراءك"
          action={
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="nums">{sections.awaitingMyAction.length}</Badge>
              <Sparkles className="h-4 w-4 text-orange-500" />
            </div>
          }
        >
          {sections.awaitingMyAction.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="لا يوجد ما يحتاج تدخلك الآن" description="كل شيء تحت السيطرة" />
          ) : (
            <TaskList
              tasks={sections.awaitingMyAction}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
              showActionBadge
            />
          )}
        </SectionCard>
      </div>

      {/* 6 & 7. أسندتها للآخرين / أنشأتها */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard
          title="أسندتها للآخرين"
          action={<Badge variant="secondary" className="nums">{sections.delegatedByMe.length}</Badge>}
        >
          {sections.delegatedByMe.length === 0 ? (
            <EmptyState icon={Eye} title="لم تُسند أي مهمة للآخرين" />
          ) : (
            <TaskList
              tasks={sections.delegatedByMe}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
            />
          )}
        </SectionCard>

        <SectionCard
          title="أنشأتها"
          action={<Badge variant="secondary" className="nums">{sections.createdByMe.length}</Badge>}
        >
          {sections.createdByMe.length === 0 ? (
            <EmptyState icon={ClipboardList} title="لم تنشئ أي مهمة بعد" />
          ) : (
            <TaskList
              tasks={sections.createdByMe}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
            />
          )}
        </SectionCard>
      </div>

      {/* 8 & 9. أتابعها / مكتملة حديثًا */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard
          title="أتابعها"
          action={<Badge variant="secondary" className="nums">{sections.following.length}</Badge>}
        >
          {sections.following.length === 0 ? (
            <EmptyState icon={Eye} title="لا تتابع أي مهمة" description="يمكنك متابعة أي مهمة لإضافتها هنا" />
          ) : (
            <TaskList
              tasks={sections.following}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
            />
          )}
        </SectionCard>

        <SectionCard
          title="مكتملة حديثًا"
          action={<Badge variant="secondary" className="nums">{sections.recentlyCompleted.length}</Badge>}
        >
          {sections.recentlyCompleted.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="لا توجد مهام مكتملة حديثًا" description="ستظهر هنا خلال 7 أيام من إكمالها" />
          ) : (
            <TaskList
              tasks={sections.recentlyCompleted}
              onOpen={(id) => setView("task-detail", { id })}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
              snoozeMap={snoozeMap}
              highlight="completed"
            />
          )}
        </SectionCard>
      </div>

      {/* مؤجّلة */}
      {sections.snoozed.length > 0 && (
        <SectionCard
          title="مؤجّلة"
          action={<Badge variant="secondary" className="nums">{sections.snoozed.length}</Badge>}
          className="border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20"
        >
          <div className="space-y-2">
            {sections.snoozed.map((t) => (
              <SnoozedTaskRow
                key={t.id}
                task={t}
                snooze={snoozeMap.get(t.id)}
                onOpen={() => setView("task-detail", { id: t.id })}
                onUnsnooze={() => handleUnsnooze(t.id)}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ============ Task list (with smartSort applied) ============
function TaskList({
  tasks, onOpen, onSnooze, onUnsnooze, snoozeMap, highlight, showActionBadge,
}: {
  tasks: TaskItem[];
  onOpen: (id: string) => void;
  onSnooze: (taskId: string, until: Date, reason?: string) => void;
  onUnsnooze: (taskId: string) => void;
  snoozeMap: Map<string, SnoozeInfo>;
  highlight?: "today" | "overdue" | "urgent" | "blocked" | "completed";
  showActionBadge?: boolean;
}) {
  if (tasks.length === 0) {
    return <EmptyState icon={ListTodo} title="لا توجد مهام" />;
  }
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-mir pl-1">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          highlight={highlight}
          showActionBadge={showActionBadge}
          onOpen={() => onOpen(t.id)}
          onSnooze={onSnooze}
          onUnsnooze={onUnsnooze}
          isSnoozed={snoozeMap.has(t.id)}
        />
      ))}
    </div>
  );
}

// ============ Single task row ============
function TaskRow({
  task, highlight, showActionBadge, onOpen, onSnooze, onUnsnooze, isSnoozed,
}: {
  task: TaskItem;
  highlight?: "today" | "overdue" | "urgent" | "blocked" | "completed";
  showActionBadge?: boolean;
  onOpen: () => void;
  onSnooze: (taskId: string, until: Date, reason?: string) => void;
  onUnsnooze: (taskId: string) => void;
  isSnoozed: boolean;
}) {
  const st = TASK_STATUSES[task.status as keyof typeof TASK_STATUSES];
  const isOverdue =
    highlight === "overdue" ||
    highlight === "urgent" ||
    (task.dueDate && new Date(task.dueDate) < new Date() && !TERMINAL_STATUSES.includes(task.status));
  const isToday = highlight === "today";
  const isCompleted = highlight === "completed";
  const isBlocked = highlight === "blocked" || task.status === "stalled";
  const mainAssignee = task.assignees?.find((a) => a.isMain) ?? task.assignees?.[0];

  return (
    <div className="rounded-lg border border-border hover:bg-accent transition group p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <button onClick={onOpen} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition">
          <span className="nums font-medium">{taskNumber(task.number)}</span>
          {task.subtasks && task.subtasks.length > 0 && (
            <span className="nums text-[10px]">({task.subtasks.length} فرعية)</span>
          )}
        </button>
        <div className="flex items-center gap-1.5">
          {showActionBadge && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300 px-1.5 py-0.5 rounded">
              <Flame className="h-3 w-3" /> يتطلب إجراء
            </span>
          )}
          {isBlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0.5 rounded">
              <Ban className="h-3 w-3" /> محجوبة
            </span>
          )}
          <PriorityBadgeWithDot priority={task.priority} />
          <SnoozeButton
            taskId={task.id}
            isSnoozed={isSnoozed}
            onSnooze={onSnooze}
            onUnsnooze={onUnsnooze}
          />
        </div>
      </div>
      <button onClick={onOpen} className="block w-full text-right">
        <div className="text-sm font-medium line-clamp-1 group-hover:text-primary transition">{task.title}</div>
      </button>
      <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 min-w-0">
          {st && <StatusBadge label={st.label} color={st.color} />}
          {task.project && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate">{task.project.name}</span>
              </TooltipTrigger>
              <TooltipContent>{task.project.name}{task.project.code ? ` (${task.project.code})` : ""}</TooltipContent>
            </Tooltip>
          )}
          {mainAssignee && (
            <div className="flex items-center gap-1">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                  {mainAssignee.user?.name?.[0] ?? "؟"}
                </AvatarFallback>
              </Avatar>
              <span className="truncate max-w-[80px]">{mainAssignee.user?.name}</span>
            </div>
          )}
        </div>
        {task.dueDate && (
          <span
            className={`flex items-center gap-1 nums whitespace-nowrap ${
              isCompleted ? "text-green-600 font-medium" :
              isOverdue ? "text-red-600 font-medium" :
              isToday ? "text-orange-600 font-medium" :
              ""
            }`}
          >
            <Clock className="h-3 w-3" />
            {isToday ? "اليوم" : relativeTime(task.dueDate)}
          </span>
        )}
      </div>
      {typeof task.progress === "number" && task.progress > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <Progress value={task.progress} className="h-1 flex-1" />
          <span className="text-[10px] text-muted-foreground nums">{task.progress}%</span>
        </div>
      )}
    </div>
  );
}

// ============ Snoozed task row ============
function SnoozedTaskRow({
  task, snooze, onOpen, onUnsnooze,
}: {
  task: TaskItem;
  snooze?: SnoozeInfo;
  onOpen: () => void;
  onUnsnooze: () => void;
}) {
  const st = TASK_STATUSES[task.status as keyof typeof TASK_STATUSES];
  const until = snooze ? new Date(snooze.until) : null;
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 flex items-center justify-between gap-2">
      <button onClick={onOpen} className="flex-1 text-right min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <BellOff className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground nums">{taskNumber(task.number)}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300 px-1.5 py-0.5 rounded">
            <BellOff className="h-3 w-3" /> مؤجّلة
          </span>
        </div>
        <div className="text-sm font-medium line-clamp-1">{task.title}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {st && <StatusBadge label={st.label} color={st.color} />}
          {until && (
            <span className="nums flex items-center gap-1">
              <Clock className="h-3 w-3" />
              حتى {formatDate(until)}
            </span>
          )}
        </div>
      </button>
      <Button
        variant="outline"
        size="sm"
        onClick={onUnsnooze}
        className="gap-1.5 shrink-0"
        aria-label="إلغاء التأجيل"
      >
        <RotateCw className="h-3.5 w-3.5" />
        إلغاء التأجيل
      </Button>
    </div>
  );
}

// ============ Snooze button with quick options ============
function SnoozeButton({
  taskId, isSnoozed, onSnooze, onUnsnooze,
}: {
  taskId: string;
  isSnoozed: boolean;
  onSnooze: (taskId: string, until: Date, reason?: string) => void;
  onUnsnooze: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");

  const quickSnooze = (hours: number, label: string) => {
    const until = new Date();
    until.setHours(until.getHours() + hours);
    onSnooze(taskId, until, label);
    setOpen(false);
  };

  const submitCustom = () => {
    if (!customDate) return;
    const d = new Date(customDate);
    if (isNaN(d.getTime()) || d.getTime() <= Date.now()) return;
    onSnooze(taskId, d, "مخصص");
    setCustomDate("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`p-1 rounded transition ${
            isSnoozed
              ? "text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30"
              : "text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover:opacity-100"
          }`}
          aria-label={isSnoozed ? "إلغاء التأجيل" : "تأجيل التنبيهات"}
          onClick={(e) => {
            if (isSnoozed) {
              e.preventDefault();
              onUnsnooze(taskId);
            }
          }}
          type="button"
        >
          <BellOff className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="space-y-1">
          <div className="text-xs font-bold text-muted-foreground px-1 py-1">تأجيل التنبيهات</div>
          <button
            onClick={() => quickSnooze(1, "ساعة")}
            className="w-full text-right px-2 py-1.5 text-sm rounded hover:bg-accent transition flex items-center gap-2"
          >
            <Clock className="h-3.5 w-3.5" /> ساعة
          </button>
          <button
            onClick={() => quickSnooze(24, "غدًا")}
            className="w-full text-right px-2 py-1.5 text-sm rounded hover:bg-accent transition flex items-center gap-2"
          >
            <CalendarClock className="h-3.5 w-3.5" /> غدًا
          </button>
          <button
            onClick={() => quickSnooze(24 * 7, "أسبوع")}
            className="w-full text-right px-2 py-1.5 text-sm rounded hover:bg-accent transition flex items-center gap-2"
          >
            <CalendarClock className="h-3.5 w-3.5" /> أسبوع
          </button>
          <div className="pt-2 border-t border-border mt-1">
            <Label className="text-xs text-muted-foreground">تاريخ مخصص</Label>
            <div className="flex gap-1 mt-1">
              <Input
                type="datetime-local"
                className="nums h-8 text-xs"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
              <Button size="sm" className="h-8 px-2" onClick={submitCustom} aria-label="تأجيل للتاريخ المخصص">
                <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============ Priority badge with colored dot (accessibility) ============
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
