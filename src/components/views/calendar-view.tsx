"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { PageHeader, EmptyState, SectionCard } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { TASK_STATUSES, taskNumber, formatDate, relativeTime } from "@/lib/constants";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, format,
} from "date-fns";
import { ar } from "date-fns/locale";
import {
  ChevronRight, ChevronLeft, Plus, Calendar as CalendarIcon, Clock, ListTodo,
} from "lucide-react";

const WEEKDAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const PRIORITY_BAR: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-sky-400",
  high: "bg-amber-500",
  urgent: "bg-red-500",
};

export function CalendarView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  // للأسبوع الذي يبدأ يوم السبت (السبت هو أول أيام الأسبوع في التقويم العربي)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 6 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // جلب مهام الشهر (تاريخ الاستحقاق ضمن النطاق)
  const from = gridStart.toISOString();
  const to = gridEnd.toISOString();
  const { data, isLoading } = useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () => apiFetch<{ items: any[] }>(`/api/tasks?pageSize=200`),
  });

  const tasks = (data?.items ?? []).filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= gridStart && d <= gridEnd;
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of tasks) {
      const key = format(new Date(t.dueDate), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const today = new Date();
  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedTasks = selectedKey ? (tasksByDay.get(selectedKey) ?? []) : [];

  const canCreate = canClient(user, "task.create");

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="تقويم المهام"
        subtitle="استحقاق المهام عبر الشهر"
        actions={
          canCreate ? (
            <Button onClick={() => setView("task-new")} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Plus className="h-4 w-4" /> مهمة جديدة
            </Button>
          ) : null
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* التقويم */}
        <Card className="lg:col-span-2 p-3 lg:p-4">
          {/* رأس التقويم */}
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <div className="text-base font-bold capitalize">
                {format(cursor, "MMMM yyyy", { locale: ar })}
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-6 mt-0.5" onClick={() => { setCursor(new Date()); setSelectedDay(new Date()); }}>
                اليوم
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>

          {/* أيام الأسبوع */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-bold text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          {/* الشبكة */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const isToday = isSameDay(day, today);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  className={`relative aspect-square sm:aspect-[4/3] min-h-[60px] p-1.5 rounded-lg border text-right transition flex flex-col
                    ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/40"}
                    ${!inMonth ? "opacity-40" : ""}
                    ${isToday ? "ring-1 ring-primary" : ""}
                  `}
                >
                  <div className={`text-xs font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    <span className="nums">{format(day, "d")}</span>
                  </div>
                  {dayTasks.length > 0 && (
                    <div className="flex-1 mt-1 space-y-0.5 overflow-hidden">
                      {dayTasks.slice(0, 2).map((t) => (
                        <div key={t.id} className="flex items-center gap-1 text-[10px] truncate">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_BAR[t.priority] ?? PRIORITY_BAR.medium}`} />
                          <span className="truncate text-muted-foreground">{t.title}</span>
                        </div>
                      ))}
                      {dayTasks.length > 2 && (
                        <div className="text-[9px] text-muted-foreground nums">+{dayTasks.length - 2} أخرى</div>
                      )}
                    </div>
                  )}
                  {dayTasks.length > 0 && (
                    <div className="absolute bottom-1 left-1 flex gap-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <span key={t.id} className={`h-1 w-1 rounded-full ${PRIORITY_BAR[t.priority] ?? PRIORITY_BAR.medium}`} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* مفتاح الألوان */}
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${PRIORITY_BAR.urgent}`} /> عاجلة</span>
            <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${PRIORITY_BAR.high}`} /> عالية</span>
            <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${PRIORITY_BAR.medium}`} /> متوسطة</span>
            <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${PRIORITY_BAR.low}`} /> منخفضة</span>
          </div>
        </Card>

        {/* لوحة اليوم المحدد */}
        <div className="space-y-4">
          <SectionCard
            title={selectedDay ? `مهام ${format(selectedDay, "d MMMM yyyy", { locale: ar })}` : "اختر يومًا"}
            action={selectedDay ? <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)} className="text-xs">إغلاق</Button> : undefined}
          >
            {!selectedDay ? (
              <EmptyState icon={CalendarIcon} title="انقر على يوم" description="لعرض المهام المستحقة فيه" />
            ) : selectedTasks.length === 0 ? (
              <EmptyState icon={ListTodo} title="لا توجد مهام" description="لا توجد مهام مستحقة في هذا اليوم" />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-mir pl-1">
                {selectedTasks.map((t) => {
                  const st = TASK_STATUSES[t.status as keyof typeof TASK_STATUSES];
                  const mainAssignee = t.assignees?.find((a: any) => a.isMain) ?? t.assignees?.[0];
                  return (
                    <button
                      key={t.id}
                      onClick={() => setView("task-detail", { id: t.id })}
                      className="w-full text-right p-3 rounded-lg border border-border hover:bg-accent transition"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs text-muted-foreground nums">{taskNumber(t.number)}</span>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <div className="text-sm font-medium line-clamp-2 mb-1.5">{t.title}</div>
                      <div className="flex items-center justify-between gap-2">
                        {st && <StatusBadge label={st.label} color={st.color} />}
                        {mainAssignee && (
                          <div className="flex items-center gap-1">
                            <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px] bg-primary/10 text-primary">{mainAssignee.user?.name?.[0] ?? "؟"}</AvatarFallback></Avatar>
                            <span className="text-[10px] text-muted-foreground line-clamp-1 max-w-[80px]">{mainAssignee.user?.name}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ملخص الشهر */}
          <SectionCard title="ملخص الشهر">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">إجمالي المهام المستحقة</span>
                <span className="font-bold nums">{tasks.length}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">عاجلة</span>
                <Badge variant="outline" className="text-red-700 border-red-300 text-xs nums">{tasks.filter((t) => t.priority === "urgent").length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">عالية</span>
                <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs nums">{tasks.filter((t) => t.priority === "high").length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">مكتملة</span>
                <Badge variant="outline" className="text-green-700 border-green-300 text-xs nums">{tasks.filter((t) => t.status === "completed_approved").length}</Badge>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
