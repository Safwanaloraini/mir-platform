"use client";

import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import {
  TASK_STATUSES, TASK_TYPES, TASK_SOURCES, TASK_PRIORITIES, taskNumber, formatDateTime, formatDate, relativeTime,
} from "@/lib/constants";
import { FIELD_LABELS, COMPLETION_STATUSES, type TransitionDef, getStatusCategory } from "@/lib/task-workflow";
import {
  ArrowRight, Edit3, CheckCircle2, PauseCircle, MessageSquare, Paperclip,
  ListChecks, GitBranch, Clock, Building2, FolderKanban, Wallet, UserCircle2,
  Calendar as CalendarIcon, Plus, Link2, AlertTriangle, ShieldCheck, Send, History, ChevronLeft, X, Star, Eye, Users2,
  Upload, Loader2, BellOff, Lock, ClipboardCheck, Sparkles, Trash2,
} from "lucide-react";
import { arSA } from "date-fns/locale";

// ============ أنواع ============
interface AvailableTransition {
  toStatus: string;
  def: TransitionDef;
  available: boolean;
  blockedReason?: string;
}

interface SnoozeRecord {
  id: string;
  until: string;
  reason?: string | null;
}

interface TaskDetail {
  id: string;
  number: number;
  title: string;
  description?: string | null;
  definitionOfDone?: string | null;
  storyPoints?: number | null;
  status: string;
  priority: string;
  type: string;
  source: string;
  progress: number;
  estimatedHours?: number | null;
  version: number;
  stallReason?: string | null;
  waitingReason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  isRecurring?: boolean;
  tags?: string | null;
  createdAt?: string;
  departmentId?: string | null;
  projectId?: string | null;
  costCenterId?: string | null;
  isBlocked: boolean;
  blockingTasks: Array<{ id: string; title: string; number: number; status: string }>;
  blockedByCount: number;
  computedProgress: number;
  availableTransitions: AvailableTransition[];
  snoozes: SnoozeRecord[];
  createdBy?: { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null } | null;
  createdById: string;
  department?: { id: string; name: string } | null;
  project?: { id: string; name: string; code: string } | null;
  costCenter?: { id: string; name: string; code: string } | null;
  parent?: { id: string; title: string; number: number; status: string } | null;
  subtasks?: any[];
  assignees?: any[];
  dependencies?: any[];
  blockingTasksRel?: any[];
  checklist?: any[];
  comments?: any[];
  attachments?: any[];
  statusHistory?: any[];
  request?: any;
  meeting?: any;
  decision?: any;
}

// ============ أيقونة تأجيل مساعدة ============
function BellOffIcon(props: any) {
  return <BellOff {...props} />;
}

export function TaskDetailView({ user }: { user: CurrentUser }) {
  const { params, setView } = useNav();
  const id = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<any>("/api/meta"),
  });

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ["task", id],
    queryFn: () => apiFetch<TaskDetail>(`/api/tasks/${id}`),
    enabled: !!id,
  });

  // التأجيل النشط الحالي
  const activeSnooze = useMemo(() => {
    const now = Date.now();
    const list = task?.snoozes ?? [];
    return list.find((s) => new Date(s.until).getTime() > now) ?? null;
  }, [task?.snoozes]);

  if (!id) {
    return <div className="p-6"><EmptyState icon={AlertTriangle} title="لم يتم تحديد مهمة" /></div>;
  }

  if (isLoading || !task) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-96 bg-muted animate-pulse rounded-xl" />
          <div className="h-96 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  const st = TASK_STATUSES[task.status as keyof typeof TASK_STATUSES];
  const tt = TASK_TYPES[task.type as keyof typeof TASK_TYPES];
  const ts = TASK_SOURCES[task.source as keyof typeof TASK_SOURCES];
  const canEdit = canClient(user, "task.edit") || task.createdById === user.id;
  const canAssign = canClient(user, "task.assign") || task.createdById === user.id;
  const canApprove = canClient(user, "task.approve_completion");
  const isAssignee = !!(task.assignees?.some((a: any) => a.userId === user.id));
  const canChangeStatus = canEdit || isAssignee;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["task", id] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["mywork"] });
    queryClient.invalidateQueries({ queryKey: ["kanban"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  // كشف خطأ القفل المتفائل (409 MODIFIED)
  const handleMutationError = (e: any, fallbackMsg = "تعذّر التحديث") => {
    const msg = String(e?.message ?? "");
    if (msg === "MODIFIED" || msg.includes("MODIFIED")) {
      toast({
        title: "تم تعديل المهمة من مستخدم آخر",
        description: "أعد المحاولة بعد تحديث الصفحة",
        variant: "destructive",
      });
      invalidateAll();
      return true;
    }
    // فحص الحجب (VALIDATION + cause JSON)
    if (msg.startsWith("{")) {
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.code === "BLOCKED") {
          toast({
            title: "المهمة محجوبة",
            description: parsed.message ?? "تعذّر الانتقال بسبب التبعيات غير المكتملة",
            variant: "destructive",
          });
          return true;
        }
      } catch {
        // ignore parse errors
      }
    }
    toast({ title: fallbackMsg, description: msg, variant: "destructive" });
    return false;
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      {/* لافتة الحجب */}
      {task.isBlocked && (
        <BlockingBanner
          blockingTasks={task.blockingTasks ?? []}
          onOpen={(tid) => setView("task-detail", { id: tid })}
        />
      )}

      {/* الترويسة */}
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" onClick={() => setView("tasks")} className="w-fit text-muted-foreground gap-1.5">
          <ArrowRight className="h-4 w-4" /> العودة لقائمة المهام
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-bold text-muted-foreground nums">{taskNumber(task.number)}</span>
              {st && <StatusBadge label={st.label} color={st.color} />}
              <PriorityBadge priority={task.priority} />
              {tt && <Badge variant="secondary" className="text-xs">{tt}</Badge>}
              {ts && <Badge variant="outline" className="text-xs">{ts}</Badge>}
              {task.isRecurring && <Badge variant="outline" className="text-xs gap-1"><History className="h-3 w-3" /> متكررة</Badge>}
              {task.isBlocked && (
                <Badge variant="outline" className="text-xs gap-1 text-red-700 border-red-300 bg-red-50 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
                  <Lock className="h-3 w-3" /> محجوبة
                </Badge>
              )}
              {activeSnooze && (
                <Badge variant="outline" className="text-xs gap-1 text-orange-700 border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800">
                  <BellOffIcon className="h-3 w-3" /> مؤجلة حتى {formatDateTime(activeSnooze.until)}
                </Badge>
              )}
            </div>
            <h1 className="text-xl lg:text-2xl font-black text-foreground">{task.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <SnoozeButton
              taskId={task.id}
              activeSnooze={activeSnooze}
              onChanged={invalidateAll}
              onError={handleMutationError}
            />
            <StatusChangeButton
              task={task}
              canApprove={canApprove}
              canEdit={canChangeStatus}
              isBlocked={task.isBlocked}
              onChanged={invalidateAll}
              onError={handleMutationError}
              onOpenTask={(tid) => setView("task-detail", { id: tid })}
            />
            {canEdit && (
              <EditTaskDialog task={task} meta={meta} onSaved={invalidateAll} onError={handleMutationError} />
            )}
            {(task.createdById === user.id || canClient(user, "task.delete") || canClient(user, "task.edit")) && (
              <DeleteTaskButton task={task} user={user} onDone={() => setView("tasks")} onChanged={invalidateAll} />
            )}
          </div>
        </div>
      </div>

      {/* المحتوى: عمودان */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* العمود الرئيسي */}
        <div className="lg:col-span-2 space-y-4">
          {/* الوصف */}
          <SectionCard title="الوصف">
            {task.description ? (
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{task.description}</p>
            ) : (
              <EmptyState icon={Edit3} title="لا يوجد وصف" />
            )}
            {task.tags && (
              <div className="mt-3 flex flex-wrap gap-1">
                {task.tags.split(",").map((t: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">#{t.trim()}</Badge>
                ))}
              </div>
            )}
          </SectionCard>

          {/* معيار الإنجاز (DoD) */}
          <DoDCard
            task={task}
            canEdit={!!(canEdit || isAssignee)}
            onChanged={invalidateAll}
            onError={handleMutationError}
          />

          {/* المهام الفرعية */}
          {task.subtasks && task.subtasks.length > 0 && (
            <SectionCard title={`المهام الفرعية (${task.subtasks.length})`}>
              <div className="space-y-2">
                {task.subtasks.map((st: any) => {
                  const sst = TASK_STATUSES[st.status as keyof typeof TASK_STATUSES];
                  return (
                    <button key={st.id} onClick={() => setView("task-detail", { id: st.id })} className="w-full text-right p-3 rounded-lg border border-border hover:bg-accent transition flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground nums">{taskNumber(st.number)}</span>
                          {sst && <StatusBadge label={sst.label} color={sst.color} />}
                        </div>
                        <div className="text-sm font-medium mt-0.5 line-clamp-1">{st.title}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Progress value={st.progress || 0} className="h-1.5 w-20" />
                        <span className="text-xs text-muted-foreground nums">{st.progress || 0}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* قائمة التحقق */}
          <ChecklistCard task={task} canEdit={!!(canEdit || isAssignee)} onChanged={invalidateAll} />

          {/* التعليقات */}
          <CommentsCard task={task} user={user} onChanged={invalidateAll} />

          {/* سجل الحالة / الخط الزمني */}
          <SectionCard title="الخط الزمني للحالة">
            {task.statusHistory && task.statusHistory.length > 0 ? (
              <div className="relative pr-4">
                <div className="absolute right-[7px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-4">
                  {[...task.statusHistory].reverse().map((h: any) => {
                    const from = TASK_STATUSES[h.fromStatus as keyof typeof TASK_STATUSES];
                    const to = TASK_STATUSES[h.toStatus as keyof typeof TASK_STATUSES];
                    return (
                      <div key={h.id} className="relative pr-6">
                        <div className="absolute right-0 top-1 h-3.5 w-3.5 rounded-full bg-primary border-2 border-background" />
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{h.user?.name ?? "—"}</span>
                          <span className="text-muted-foreground">{relativeTime(h.createdAt)}</span>
                        </div>
                        <div className="text-sm mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {from && <StatusBadge label={from.label} color={from.color} />}
                          {from && <ChevronLeft className="h-3 w-3 text-muted-foreground" />}
                          {to && <StatusBadge label={to.label} color={to.color} />}
                        </div>
                        {h.note && <div className="text-xs text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1">{h.note}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState icon={History} title="لا يوجد سجل حالة بعد" />
            )}
          </SectionCard>
        </div>

        {/* العمود الجانبي */}
        <div className="space-y-4">
          {/* التقدم */}
          <SectionCard title="التقدم">
            <div className="flex items-center gap-3">
              <Progress value={task.progress || 0} className="h-2.5 flex-1" />
              <span className="text-sm font-bold nums w-10 text-left">{task.progress || 0}%</span>
            </div>
            {canEdit && (
              <Slider
                className="mt-3"
                defaultValue={[task.progress || 0]}
                max={100}
                step={5}
                onValueCommit={(v) => {
                  apiFetch(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ progress: v[0], version: task.version }),
                  }).then(() => {
                    invalidateAll();
                    toast({ title: "تم تحديث التقدم" });
                  }).catch((e) => handleMutationError(e, "تعذّر تحديث التقدم"));
                }}
              />
            )}
            {task.computedProgress != null && task.computedProgress !== (task.progress || 0) && (
              <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> التقدم المحسوب: <span className="nums font-bold">{task.computedProgress}%</span>
              </div>
            )}
            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              {task.estimatedHours != null && (
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> الساعات: <span className="nums">{task.estimatedHours} س</span></span>
              )}
              {task.storyPoints != null && (
                <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> النقاط: <span className="nums">{task.storyPoints}</span></span>
              )}
              {task.startedAt && (
                <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> بدأ: <span className="nums">{formatDate(task.startedAt)}</span></span>
              )}
              {task.completedAt && (
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> أُكمل: <span className="nums">{formatDate(task.completedAt)}</span></span>
              )}
            </div>
          </SectionCard>

          {/* المسؤولون */}
          <SectionCard title="المسؤولون" action={canAssign ? <AssigneesDialog task={task} meta={meta} onSaved={invalidateAll} /> : undefined}>
            {task.assignees && task.assignees.length > 0 ? (
              <div className="space-y-2">
                {task.assignees.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{a.user?.name?.[0] ?? "؟"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium line-clamp-1">{a.user?.name}</div>
                      <div className="text-[10px] text-muted-foreground">{a.user?.jobTitle ?? a.user?.department?.name ?? "—"}</div>
                    </div>
                    {a.isMain && <Badge className="bg-primary text-primary-foreground text-[10px] gap-1"><Star className="h-3 w-3" /> رئيسي</Badge>}
                    {!a.isMain && <Badge variant="outline" className="text-[10px]">{a.role === "follower" ? "متابع" : "مساهم"}</Badge>}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={UserCircle2} title="لا يوجد مسؤولون" />
            )}
          </SectionCard>

          {/* التفاصيل */}
          <SectionCard title="التفاصيل">
            <dl className="space-y-2 text-sm">
              <DetailRow icon={Building2} label="الإدارة" value={task.department?.name} />
              <DetailRow icon={FolderKanban} label="المشروع" value={task.project?.name} />
              {task.costCenter && <DetailRow icon={Wallet} label="مركز التكلفة" value={`${task.costCenter.code} — ${task.costCenter.name}`} />}
              <DetailRow icon={CalendarIcon} label="تاريخ البدء" value={task.startDate ? formatDate(task.startDate) : "—"} />
              <DetailRow icon={Clock} label="الموعد النهائي" value={task.dueDate ? formatDate(task.dueDate) : "—"} highlight={task.dueDate && new Date(task.dueDate) < new Date() && !["completed_approved", "cancelled"].includes(task.status) ? "red" : undefined} />
              <DetailRow icon={UserCircle2} label="أنشأها" value={task.createdBy?.name} />
              <DetailRow icon={CalendarIcon} label="تاريخ الإنشاء" value={formatDate(task.createdAt)} />
              {task.parent && (
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><GitBranch className="h-3 w-3" /> مهمة أم</span>
                  <button onClick={() => setView("task-detail", { id: task.parent!.id })} className="text-xs text-primary hover:underline nums">{taskNumber(task.parent.number)} — {task.parent.title}</button>
                </div>
              )}
            </dl>
          </SectionCard>

          {/* المرفقات */}
          <SectionCard title={`المرفقات (${task.attachments?.length ?? 0})`} action={canEdit ? <AddAttachmentDialog taskId={task.id} onAdded={invalidateAll} /> : undefined}>
            {task.attachments && task.attachments.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-mir">
                {task.attachments.map((a: any) => (
                  <div key={a.id} className="relative flex items-center gap-2 p-2 pe-2 rounded-lg border border-border hover:bg-accent transition">
                    <a
                      href={a.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 min-w-0 flex-1"
                      aria-label={`فتح المرفق ${a.fileName}`}
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium line-clamp-1">{a.fileName}</div>
                        <div className="text-[10px] text-muted-foreground">{a.user?.name ?? "—"} • {relativeTime(a.createdAt)}</div>
                      </div>
                    </a>
                    {a.required && <Badge variant="outline" className="text-[10px] text-red-700 border-red-300">إلزامي</Badge>}
                    {canEdit && (
                      <AttachmentDeleteButton
                        taskId={task.id}
                        attachmentId={a.id}
                        fileName={a.fileName}
                        onDeleted={invalidateAll}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Paperclip} title="لا توجد مرفقات" />
            )}
          </SectionCard>

          {/* التبعيات */}
          {((task.dependencies?.length ?? 0) > 0 || (task.blockingTasks?.length ?? 0) > 0) && (
            <SectionCard title="التبعيات">
              {task.dependencies && task.dependencies.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">تعتمد على</div>
                  <div className="space-y-1">
                    {task.dependencies.map((d: any) => (
                      <button key={d.id} onClick={() => setView("task-detail", { id: d.dependsOn.id })} className="w-full text-right text-xs p-2 rounded hover:bg-accent flex items-center justify-between gap-2">
                        <span className="nums text-muted-foreground">{taskNumber(d.dependsOn.number)}</span>
                        <span className="line-clamp-1 flex-1">{d.dependsOn.title}</span>
                        <StatusBadge label={TASK_STATUSES[d.dependsOn.status as keyof typeof TASK_STATUSES]?.label ?? d.dependsOn.status} color={TASK_STATUSES[d.dependsOn.status as keyof typeof TASK_STATUSES]?.color ?? "slate"} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {task.blockingTasks && task.blockingTasks.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">تحجب</div>
                  <div className="space-y-1">
                    {task.blockingTasks.map((b: any) => (
                      <button key={b.id} onClick={() => setView("task-detail", { id: b.task?.id ?? b.id })} className="w-full text-right text-xs p-2 rounded hover:bg-accent flex items-center justify-between gap-2">
                        <span className="nums text-muted-foreground">{taskNumber(b.task?.number ?? b.number)}</span>
                        <span className="line-clamp-1 flex-1">{b.task?.title ?? b.title}</span>
                        <StatusBadge label={TASK_STATUSES[(b.task?.status ?? b.status) as keyof typeof TASK_STATUSES]?.label ?? (b.task?.status ?? b.status)} color={TASK_STATUSES[(b.task?.status ?? b.status) as keyof typeof TASK_STATUSES]?.color ?? "slate"} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* روابط (طلب/اجتماع/قرار) */}
          {(task.request || task.meeting || task.decision) && (
            <SectionCard title="الروابط">
              <div className="space-y-2 text-sm">
                {task.request && (
                  <div className="flex items-center gap-2 p-2 rounded-lg border border-border">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">طلب:</span>
                    <span className="nums">ط-{String(task.request.number).padStart(4, "0")}</span>
                    <span className="line-clamp-1 flex-1">{task.request.title}</span>
                  </div>
                )}
                {task.meeting && (
                  <div className="flex items-center gap-2 p-2 rounded-lg border border-border">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">اجتماع:</span>
                    <span className="line-clamp-1 flex-1">{task.meeting.title}</span>
                  </div>
                )}
                {task.decision && (
                  <div className="flex items-center gap-2 p-2 rounded-lg border border-border">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">قرار:</span>
                    <span className="line-clamp-1 flex-1">{task.decision.text}</span>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, highlight }: { icon: any; label: string; value?: string | null; highlight?: "red" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className={`text-xs font-medium ${highlight === "red" ? "text-red-600" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

// ===== لافتة الحجب =====
function BlockingBanner({ blockingTasks, onOpen }: { blockingTasks: Array<{ id: string; title: string; number: number; status: string }>; onOpen: (id: string) => void }) {
  return (
    <div role="alert" className="rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
          <Lock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-orange-800 dark:text-orange-200">
            ⚠️ هذه المهمة محجوبة بـ <span className="nums">{blockingTasks.length}</span> مهمة غير مكتملة
          </div>
          <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">لا يمكن اعتمادها حتى تكتمل التبعيات التالية أو تتجاوزها قسرًا:</div>
          <div className="mt-2 flex flex-col gap-1">
            {blockingTasks.map((b) => (
              <button
                key={b.id}
                onClick={() => onOpen(b.id)}
                className="text-right text-xs px-2 py-1.5 rounded bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition flex items-center gap-2 border border-orange-200 dark:border-orange-800"
              >
                <span className="nums text-orange-700 dark:text-orange-300">{taskNumber(b.number)}</span>
                <span className="line-clamp-1 flex-1 text-orange-900 dark:text-orange-100">{b.title}</span>
                <StatusBadge label={TASK_STATUSES[b.status as keyof typeof TASK_STATUSES]?.label ?? b.status} color={TASK_STATUSES[b.status as keyof typeof TASK_STATUSES]?.color ?? "slate"} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== بطاقة معيار الإنجاز =====
function DoDCard({ task, canEdit, onChanged, onError }: { task: TaskDetail; canEdit: boolean; onChanged: () => void; onError: (e: any, msg?: string) => boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(task.definitionOfDone ?? "");
  const [submitting, setSubmitting] = useState(false);

  const isSeriousType = ["operational", "financial", "administrative", "followup"].includes(task.type);
  const showHint = !task.definitionOfDone && isSeriousType;

  const save = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${task.id}/dod`, {
        method: "PATCH",
        body: JSON.stringify({ definitionOfDone: text.trim() || null, version: task.version }),
      });
      toast({ title: "تم حفظ معيار الإنجاز" });
      setOpen(false);
      onChanged();
    } catch (e: any) {
      onError(e, "تعذّر حفظ معيار الإنجاز");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard
      title="معيار الإنجاز (DoD)"
      action={canEdit ? (
        <Button variant="ghost" size="sm" onClick={() => { setText(task.definitionOfDone ?? ""); setOpen(true); }} className="text-xs gap-1">
          <Edit3 className="h-3.5 w-3.5" /> تعديل
        </Button>
      ) : undefined}
    >
      {task.definitionOfDone ? (
        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-lg p-3 border border-border">
          {task.definitionOfDone}
        </div>
      ) : (
        <EmptyState icon={ClipboardCheck} title="لم يُحدّد معيار الإنجاز بعد" />
      )}
      {showHint && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            يُنصح بتعريف معيار الإنجاز قبل بدء التنفيذ لتوضيح متى تُعتبر المهمة مكتملة.
          </div>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل معيار الإنجاز</DialogTitle>
            <DialogDescription>
              اصف الشروط الواضحة التي تُعتبر المهمة مكتملة عند تحقيقها. مثال: «التقرير مُعتمد من المدير، الأرقام محقّقة، الملف منشور».
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="مثال:&#10;- رفع التقرير النهائي معتمدًا&#10;- مطابقة الأرقام مع النظام المالي&#10;- إشعار جميع المعنيين"
          />
          <div className="text-xs text-muted-foreground">عدد الأحرف: <span className="nums">{text.length}</span> / 5000</div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
            <Button onClick={save} disabled={submitting} className="bg-primary hover:bg-primary/90 gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {submitting ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ===== زر التأجيل =====
function SnoozeButton({ taskId, activeSnooze, onChanged, onError }: {
  taskId: string;
  activeSnooze: SnoozeRecord | null;
  onChanged: () => void;
  onError: (e: any, msg?: string) => boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");

  const snooze = async (until: Date, label: string) => {
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${taskId}/snooze`, {
        method: "POST",
        body: JSON.stringify({ until: until.toISOString(), reason: reason.trim() || undefined }),
      });
      toast({ title: `تم التأجيل حتى ${label}` });
      setOpen(false);
      setReason("");
      onChanged();
    } catch (e: any) {
      onError(e, "تعذّر التأجيل");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelSnooze = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${taskId}/snooze`, { method: "DELETE" });
      toast({ title: "تم إلغاء التأجيل" });
      onChanged();
    } catch (e: any) {
      onError(e, "تعذّر إلغاء التأجيل");
    } finally {
      setSubmitting(false);
    }
  };

  const now = new Date();
  const inHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);
  const inDays = (d: number) => inHours(d * 24);

  return (
    <div className="flex items-center gap-1">
      {activeSnooze && (
        <Button
          variant="ghost"
          size="sm"
          onClick={cancelSnooze}
          disabled={submitting}
          className="text-xs gap-1 text-orange-700 dark:text-orange-300 hover:text-orange-800"
          aria-label="إلغاء التأجيل"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          إلغاء التأجيل
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-label="تأجيل التنبيهات"
          >
            <BellOffIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">تأجيل</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3" dir="rtl">
          <div className="space-y-2">
            <div className="text-sm font-bold">تأجيل تنبيهات المهمة</div>
            <p className="text-xs text-muted-foreground">لن يصلك تنبيه عن اقتراب موعد هذه المهمة حتى انتهاء فترة التأجيل.</p>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <Button variant="outline" size="sm" onClick={() => snooze(inHours(1), "بعد ساعة")} disabled={submitting} className="text-xs">ساعة</Button>
              <Button variant="outline" size="sm" onClick={() => snooze(inDays(1), "غدًا")} disabled={submitting} className="text-xs">غدًا</Button>
              <Button variant="outline" size="sm" onClick={() => snooze(inDays(7), "بعد أسبوع")} disabled={submitting} className="text-xs">أسبوع</Button>
            </div>
            <Separator className="my-2" />
            <Label className="text-xs">سبب التأجيل (اختياري)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: بانتظار رد العميل"
              className="text-xs"
            />
            <Separator className="my-2" />
            <div className="text-xs font-medium text-muted-foreground">مخصص (اختر يومًا):</div>
            <Calendar
              mode="single"
              locale={arSA}
              selected={customDate}
              onSelect={(d) => d && setCustomDate(d)}
              disabled={(d) => d < now}
              className="rounded border p-2"
            />
            <Button
              size="sm"
              onClick={() => customDate && snooze(customDate, formatDate(customDate.toISOString()))}
              disabled={!customDate || submitting}
              className="w-full bg-primary hover:bg-primary/90 gap-1.5 text-xs"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              تأجيل حتى المحدد
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ===== زر تغيير الحالة (محسّن) =====
function StatusChangeButton({ task, canApprove, canEdit, isBlocked, onChanged, onError, onOpenTask }: {
  task: TaskDetail;
  canApprove: boolean;
  canEdit: boolean;
  isBlocked: boolean;
  onChanged: () => void;
  onError: (e: any, msg?: string) => boolean;
  onOpenTask: (id: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [stallReason, setStallReason] = useState(task.stallReason ?? "");
  const [waitingReason, setWaitingReason] = useState(task.waitingReason ?? "");
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // V1: استخدم availableTransitions من الخادم بدل STATUS_TRANSITIONS المحلي
  const transitions = task.availableTransitions ?? [];

  // اعرض فقط الانتقالات المسموحة (ولكن أظهر غير المسموحة معطّلة مع tooltip)
  const allShown = transitions;
  const allowed = transitions.filter((t) => t.available);
  if (allShown.length === 0 || !canEdit) return null;

  // الحصول على def للحالة المختارة حاليًا
  const selected = transitions.find((t) => t.toStatus === status);
  const requiredFields = selected?.def?.requiredFields ?? [];
  const willBeCompletion = COMPLETION_STATUSES.includes(status);
  const requiresForce = willBeCompletion && isBlocked;
  const needsStallReason = requiredFields.includes("stallReason");
  const needsWaitingReason = status === "awaiting_info";

  // هل يمكن الإرسال؟
  const canSubmit = (() => {
    if (!status) return false;
    if (needsStallReason && !stallReason.trim()) return false;
    if (needsWaitingReason && !waitingReason.trim()) return false;
    if (requiresForce && !force) return false;
    return true;
  })();

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${task.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          status,
          note: note.trim() || undefined,
          stallReason: needsStallReason ? stallReason.trim() : undefined,
          waitingReason: needsWaitingReason ? waitingReason.trim() : undefined,
          force: requiresForce ? true : undefined,
          version: task.version,
        }),
      });
      toast({ title: "تم تحديث الحالة" });
      setOpen(false);
      setStatus(""); setNote(""); setStallReason(""); setWaitingReason(""); setForce(false);
      onChanged();
    } catch (e: any) {
      onError(e, "تعذّر تحديث الحالة");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90 gap-1.5">
        <PauseCircle className="h-4 w-4" /> تحديث الحالة
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تحديث حالة المهمة</DialogTitle>
            <DialogDescription>اختر الحالة الجديدة من الانتقالات المسموحة وأضف ملاحظة اختيارية</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الحالة الجديدة</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full mt-1"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                <SelectContent>
                  {allShown.map((t) => {
                    const stLabel = TASK_STATUSES[t.toStatus as keyof typeof TASK_STATUSES]?.label ?? t.toStatus;
                    return (
                      <SelectItem
                        key={t.toStatus}
                        value={t.toStatus}
                        disabled={!t.available}
                        className={t.available ? "" : "opacity-50"}
                      >
                        <span className="flex items-center gap-2">
                          {stLabel}
                          {!t.available && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[10px]">!</span>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  <span className="text-xs">{t.blockedReason ?? "غير مسموح"}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {allowed.length === 0 && (
                <div className="mt-2 text-xs text-muted-foreground">لا توجد انتقالات مسموحة من الحالة الحالية.</div>
              )}
            </div>

            {/* قائمة الحقول المطلوبة كـ checklist */}
            {requiredFields.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
                <div className="text-xs font-bold text-amber-800 dark:text-amber-200 mb-1.5">هذا الانتقال يتطلب:</div>
                <ul className="space-y-1">
                  {requiredFields.map((f) => (
                    <li key={f} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      {FIELD_LABELS[f] ?? f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* stallReason */}
            {needsStallReason && (
              <div>
                <Label>سبب التعثر *</Label>
                <Textarea className="mt-1" value={stallReason} onChange={(e) => setStallReason(e.target.value)} placeholder="اشرح سبب التعثر والإجراء المطلوب…" />
              </div>
            )}

            {/* waitingReason */}
            {needsWaitingReason && (
              <div>
                <Label>سبب الانتظار *</Label>
                <Textarea className="mt-1" value={waitingReason} onChange={(e) => setWaitingReason(e.target.value)} placeholder="ما المعلومات أو الإجراء المنتظر؟" />
              </div>
            )}

            <div>
              <Label>ملاحظة (اختياري)</Label>
              <Textarea className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة حول تغيير الحالة…" />
            </div>

            {/* تحذير الحجب للاكمال */}
            {requiresForce && (
              <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-red-800 dark:text-red-200">
                      المهمة محجوبة بـ <span className="nums">{task.blockingTasks?.length ?? 0}</span> تبعية غير مكتملة
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {(task.blockingTasks ?? []).slice(0, 5).map((b) => (
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
                      تجاوز الحجب (سيسمح بالانتقال رغم عدم اكتمال التبعيات)
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* تحذير الاعتماد النهائي */}
            {status === "completed_approved" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800">
                <ShieldCheck className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                <div className="text-xs text-orange-700 dark:text-orange-300">
                  اعتماد الإكمال يتطلب اكتمال جميع عناصر التحقق الإلزامية وتوفر المرفقات الإلزامية.
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
            <Button onClick={submit} disabled={submitting || !canSubmit} className="bg-primary hover:bg-primary/90 gap-1.5">
              {submitting ? "جارٍ…" : <><CheckCircle2 className="h-4 w-4" /> تأكيد</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== حوار تعديل المهمة =====
function EditTaskDialog({ task, meta, onSaved, onError }: { task: TaskDetail; meta: any; onSaved: () => void; onError: (e: any, msg?: string) => boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    type: task.type,
    source: task.source,
    priority: task.priority,
    departmentId: task.departmentId || "",
    projectId: task.projectId || "",
    costCenterId: task.costCenterId || "",
    startDate: task.startDate ? task.startDate.slice(0, 10) : "",
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
    estimatedHours: task.estimatedHours ?? "",
    storyPoints: task.storyPoints ?? "",
    tags: task.tags || "",
  });
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          startDate: form.startDate || null,
          dueDate: form.dueDate || null,
          estimatedHours: form.estimatedHours === "" ? null : Number(form.estimatedHours),
          storyPoints: form.storyPoints === "" ? null : Number(form.storyPoints),
          version: task.version,
        }),
      });
      toast({ title: "تم حفظ التعديلات" });
      setOpen(false);
      onSaved();
    } catch (e: any) {
      onError(e, "تعذّر الحفظ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Edit3 className="h-4 w-4" /> تعديل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-mir">
          <DialogHeader>
            <DialogTitle>تعديل المهمة</DialogTitle>
            <DialogDescription>عدّل تفاصيل المهمة الأساسية</DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>العنوان *</Label>
              <Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>الوصف</Label>
              <Textarea className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>النوع</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المصدر</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الأولوية</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_PRIORITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الإدارة</Label>
              <Select value={form.departmentId || "NONE"} onValueChange={(v) => setForm({ ...form, departmentId: v === "NONE" ? "" : v })}>
                <SelectTrigger className="w-full mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون —</SelectItem>
                  {(meta?.departments ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المشروع</Label>
              <Select value={form.projectId || "NONE"} onValueChange={(v) => setForm({ ...form, projectId: v === "NONE" ? "" : v })}>
                <SelectTrigger className="w-full mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون —</SelectItem>
                  {(meta?.projects ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ البدء</Label>
              <Input type="date" className="mt-1 nums" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <Label>الموعد النهائي</Label>
              <Input type="date" className="mt-1 nums" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <Label>الساعات المقدّرة</Label>
              <Input type="number" className="mt-1 nums" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value as any })} />
            </div>
            <div>
              <Label>نقاط القصة (Story Points)</Label>
              <Input type="number" min={0} step={1} className="mt-1 nums" value={form.storyPoints} onChange={(e) => setForm({ ...form, storyPoints: e.target.value as any })} placeholder="مثال: 3، 5، 8" />
            </div>
            <div className="sm:col-span-2">
              <Label>الوسوم (مفصولة بفواصل)</Label>
              <Input className="mt-1" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="مثال: تسويق, حملة_رمضان" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
            <Button onClick={save} disabled={submitting || !form.title.trim()} className="bg-primary hover:bg-primary/90 gap-1.5">
              {submitting ? "جارٍ الحفظ…" : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== حوار إدارة المسؤولين =====
function AssigneesDialog({ task, meta, onSaved }: { task: TaskDetail; meta: any; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(task.assignees?.map((a: any) => a.userId) ?? []);
  const [mainId, setMainId] = useState<string>(task.assignees?.find((a: any) => a.isMain)?.userId ?? "");
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          assigneeIds: selected,
          mainAssigneeId: mainId || (selected[0] ?? null),
          version: task.version,
        }),
      });
      toast({ title: "تم تحديث المسؤولين" });
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast({ title: "تعذّر التحديث", description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (uid: string) => {
    setSelected((s) => s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]);
    if (mainId === uid) setMainId("");
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-xs gap-1">
        <Users2 className="h-3.5 w-3.5" /> تعديل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto scrollbar-mir">
          <DialogHeader>
            <DialogTitle>إدارة المسؤولين</DialogTitle>
            <DialogDescription>اختر المسؤولين وحدد الرئيسي</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-mir">
            {(meta?.users ?? []).map((u: any) => {
              const checked = selected.includes(u.id);
              return (
                <div key={u.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent">
                  <Checkbox checked={checked} onCheckedChange={() => toggle(u.id)} />
                  <Avatar className="h-7 w-7"><AvatarFallback className="text-xs bg-primary/10 text-primary">{u.name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-1">{u.name}</div>
                    <div className="text-[10px] text-muted-foreground">{u.jobTitle ?? u.department?.name ?? "—"}</div>
                  </div>
                  {checked && (
                    <Button size="sm" variant={mainId === u.id ? "default" : "outline"} onClick={() => setMainId(u.id)} className="h-7 text-xs">
                      {mainId === u.id ? "رئيسي" : "تعيين رئيسي"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
            <Button onClick={save} disabled={submitting} className="bg-primary hover:bg-primary/90">
              {submitting ? "جارٍ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== بطاقة قائمة التحقق =====
function ChecklistCard({ task, canEdit, onChanged }: { task: TaskDetail; canEdit: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [newText, setNewText] = useState("");
  const [newRequired, setNewRequired] = useState(false);

  const items = task.checklist ?? [];
  const doneCount = items.filter((i: any) => i.done).length;
  const requiredTotal = items.filter((i: any) => i.required).length;
  const requiredDone = items.filter((i: any) => i.required && i.done).length;

  const toggle = async (item: any) => {
    try {
      await apiFetch(`/api/tasks/${task.id}/checklist`, {
        method: "POST",
        body: JSON.stringify({ id: item.id, done: !item.done }),
      });
      onChanged();
    } catch (e: any) {
      toast({ title: "تعذّر التحديث", description: e?.message, variant: "destructive" });
    }
  };

  const add = async () => {
    if (!newText.trim()) return;
    try {
      await apiFetch(`/api/tasks/${task.id}/checklist`, {
        method: "POST",
        body: JSON.stringify({ text: newText, required: newRequired }),
      });
      setNewText(""); setNewRequired(false);
      onChanged();
    } catch (e: any) {
      toast({ title: "تعذّر الإضافة", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <SectionCard
      title={`قائمة التحقق (${doneCount}/${items.length})`}
      action={requiredTotal > 0 ? <Badge variant="outline" className="text-xs">إلزامي: {requiredDone}/{requiredTotal}</Badge> : undefined}
    >
      {items.length > 0 ? (
        <div className="space-y-1.5 mb-3 max-h-96 overflow-y-auto scrollbar-mir">
          {items.map((item: any) => (
            <div key={item.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent group">
              <Checkbox checked={item.done} onCheckedChange={() => toggle(item)} />
              <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.text}</span>
              {item.required && (
                <Badge variant="outline" className={`text-[10px] ${item.done ? "text-green-700 border-green-300" : "text-red-700 border-red-300"}`}>
                  {item.done ? "منجز" : "إلزامي"}
                </Badge>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground mb-3">لا توجد عناصر تحقق بعد</div>
      )}
      {canEdit && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input
            placeholder="أضف عنصر تحقق…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 cursor-pointer">
            <Checkbox checked={newRequired} onCheckedChange={(v) => setNewRequired(!!v)} />
            إلزامي
          </label>
          <Button size="sm" onClick={add} className="bg-primary hover:bg-primary/90 gap-1 shrink-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

// ===== بطاقة التعليقات =====
function CommentsCard({ task, user, onChanged }: { task: TaskDetail; user: CurrentUser; onChanged: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await apiFetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setText("");
      onChanged();
    } catch (e: any) {
      toast({ title: "تعذّر إرسال التعليق", description: e?.message, variant: "destructive" });
    }
  };

  const comments = task.comments ?? [];

  return (
    <SectionCard title={`التعليقات (${comments.length})`}>
      {comments.length > 0 ? (
        <div className="space-y-3 mb-3 max-h-80 overflow-y-auto scrollbar-mir pl-1">
          {comments.map((c: any) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-[10px] bg-primary/10 text-primary">{c.user?.name?.[0] ?? "؟"}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.user?.name ?? "—"}</span>
                  <span className="text-[10px] text-muted-foreground">{relativeTime(c.createdAt)}</span>
                </div>
                <div className="text-sm text-foreground mt-0.5 whitespace-pre-wrap bg-muted/40 rounded-lg px-2.5 py-1.5">{c.text}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground mb-3">لا توجد تعليقات</div>
      )}
      <div className="flex items-end gap-2 pt-2 border-t border-border">
        <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-[10px] bg-primary/10 text-primary">{user.name?.[0]}</AvatarFallback></Avatar>
        <Textarea
          placeholder="اكتب تعليقًا… (استخدم @ للإشارة)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="text-sm flex-1"
        />
        <Button size="sm" onClick={submit} disabled={!text.trim()} className="bg-primary hover:bg-primary/90 gap-1.5 self-end">
          <Send className="h-4 w-4" /> إرسال
        </Button>
      </div>
    </SectionCard>
  );
}

// ===== حوار إضافة مرفق =====
function AddAttachmentDialog({ taskId, onAdded }: { taskId: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [required, setRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // تحقق من الحجم (100 ميجابايت)
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "حجم الملف كبير جدًا", description: "الحد الأقصى 100 ميجابايت", variant: "destructive" });
      e.target.value = "";
      return;
    }

    setSubmitting(true);
    setUploadProgress(`جارٍ رفع: ${file.name}…`);

    try {
      // 1) ارفع الملف إلى /api/files/upload
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/files/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData?.error || "فشل الرفع");

      // 2) أنشئ سجل المرفق مرتبطًا بالملف المرفوع
      await apiFetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          fileName: uploadData.fileName,
          fileUrl: uploadData.url,
          fileType: uploadData.fileType,
          fileSize: uploadData.fileSize,
          required,
        }),
      });

      toast({ title: "تم رفع المرفق بنجاح", description: uploadData.fileName });
      setOpen(false);
      setRequired(false);
      onAdded();
    } catch (err: any) {
      toast({ title: "تعذّر رفع الملف", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploadProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-xs gap-1">
        <Plus className="h-3.5 w-3.5" /> إضافة
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setRequired(false); setUploadProgress(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفع مرفق من الجهاز</DialogTitle>
            <DialogDescription>اختر ملفًا من جهازك (صور PNG/JPEG/GIF/WebP، PDF، Word، Excel) — الحد الأقصى 100 ميجابايت</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* منطقة اختيار الملف */}
            <div
              onClick={() => !submitting && fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/50 transition"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              {submitting ? (
                <div className="space-y-2">
                  <Loader2 className="h-5 w-5 mx-auto animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{uploadProgress}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">اضغط لاختيار ملف</p>
                  <p className="text-xs text-muted-foreground mt-1">أو اسحب الملف هنا</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-2">
                    الأنواع المدعومة: جميع الصور (PNG, JPEG, GIF, WebP, SVG)، PDF، Word، Excel، PowerPoint، نصوص، ZIP
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.rtf,.odt,.ods,.odp"
                onChange={handleFileChange}
                disabled={submitting}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={required} onCheckedChange={(v) => setRequired(!!v)} />
              مرفق إلزامي (مطلوب لاعتماد الإكمال)
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost" disabled={submitting}>إلغاء</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== زر حذف مرفق =====
function AttachmentDeleteButton({
  taskId,
  attachmentId,
  fileName,
  onDeleted,
}: {
  taskId: string;
  attachmentId: string;
  fileName: string;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    // منع إغلاق الحوار التلقائي (AlertDialogAction يغلق افتراضيًا)
    e.preventDefault();
    setDeleting(true);
    try {
      await apiFetch(`/api/tasks/${taskId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      toast({ title: "تم حذف المرفق", description: fileName });
      setOpen(false);
      onDeleted();
    } catch (err: any) {
      toast({
        title: "تعذّر حذف المرفق",
        description: String(err?.message ?? ""),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
        aria-label="حذف المرفق"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setDeleting(false);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              حذف المرفق
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المرفق «<span className="font-medium text-foreground">{fileName}</span>»؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ الحذف…
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ===== زر حذف المهمة (أرشفة / حذف نهائي) =====
function DeleteTaskButton({
  task,
  user,
  onDone,
  onChanged,
}: {
  task: TaskDetail;
  user: CurrentUser;
  onDone: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "archive" | "hard">(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const category = getStatusCategory(task.status);
  const hasSubtasks = !!(task.subtasks && task.subtasks.length > 0);
  const hasComments = !!(task.comments && task.comments.length > 0);
  const requiresConfirm = hasSubtasks || hasComments;
  const confirmMatches =
    confirmText.trim() === task.title.trim() || confirmText.trim() === "تأكيد";

  let description: string;
  if (category === "not_started") {
    description = "سيتم حذف المهمة نهائيًا. لا يمكن التراجع.";
  } else if (category === "in_progress") {
    description =
      "سيتم أرشفة المهمة أولًا (حذف ناعم). للحذف النهائي استخدم خيار «الحذف النهائي».";
  } else {
    description =
      "سيتم حذف المهمة نهائيًا وجميع بياناتها (تعليقات، مرفقات، سجل).";
  }

  const reset = () => {
    setErrorMsg(null);
    setConfirmText("");
    setBusy(null);
  };

  const runDelete = async (mode: "archive" | "hard") => {
    setBusy(mode);
    setErrorMsg(null);
    try {
      const url =
        mode === "hard"
          ? `/api/tasks/${task.id}?hard=true`
          : `/api/tasks/${task.id}`;
      const res = await apiFetch<{
        ok: boolean;
        mode: string;
        message?: string;
      }>(url, { method: "DELETE" });
      if (mode === "hard") {
        toast({ title: "تم حذف المهمة نهائيًا" });
      } else {
        toast({
          title: "تمت أرشفة المهمة",
          description: res?.message,
        });
      }
      setOpen(false);
      reset();
      onChanged();
      onDone();
    } catch (err: any) {
      const msg = String(err?.message ?? "").trim();
      setErrorMsg(msg || "تعذّر إتمام العملية. حاول مرة أخرى.");
      // نُبقي الحوار مفتوحًا لعرض الخطأ وإتاحة إعادة المحاولة
    } finally {
      setBusy(null);
    }
  };

  const canHard =
    task.createdById === user.id || canClient(user, "task.delete");

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="gap-1.5"
        aria-label="حذف المهمة"
      >
        <Trash2 className="h-4 w-4" /> حذف المهمة
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              حذف المهمة
            </AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>

          {requiresConfirm && (
            <div className="space-y-1.5">
              <Label htmlFor="delete-task-confirm">
                للتأكيد، اكتب عنوان المهمة (أو «تأكيد»):
              </Label>
              <Input
                id="delete-task-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={task.title}
                autoComplete="off"
                disabled={busy !== null}
              />
              <p className="text-xs text-muted-foreground">
                هذا التأكيد يلزم لتفعيل زر «الحذف النهائي» فقط؛ الأرشفة لا تتطلب تأكيدًا.
              </p>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap break-words min-w-0 flex-1">
                {errorMsg}
              </span>
            </div>
          )}

          <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <AlertDialogCancel disabled={busy !== null}>إلغاء</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => runDelete("archive")}
              disabled={busy !== null}
              className="gap-1.5"
            >
              {busy === "archive" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              أرشفة فقط
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => runDelete("hard")}
              disabled={
                busy !== null ||
                (requiresConfirm && !confirmMatches) ||
                !canHard
              }
              className="gap-1.5"
            >
              {busy === "hard" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              الحذف النهائي
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
