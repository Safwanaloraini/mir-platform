"use client";

import { useState } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  ArrowRight, Edit3, CheckCircle2, PauseCircle, MessageSquare, Paperclip,
  ListChecks, GitBranch, Clock, Building2, FolderKanban, Wallet, UserCircle2,
  Calendar, Plus, Link2, AlertTriangle, ShieldCheck, Send, History, ChevronLeft, X, Star, Eye, Users2,
} from "lucide-react";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ["assigned", "in_progress", "cancelled"],
  assigned: ["in_progress", "awaiting_info", "stalled", "cancelled"],
  in_progress: ["awaiting_info", "awaiting_approval", "completed_review", "stalled", "cancelled"],
  awaiting_info: ["in_progress", "stalled", "cancelled"],
  awaiting_approval: ["in_progress", "completed_review", "stalled", "cancelled"],
  completed_review: ["completed_approved", "in_progress", "cancelled"],
  stalled: ["in_progress", "cancelled"],
  completed_approved: [],
  cancelled: [],
};

export function TaskDetailView({ user }: { user: CurrentUser }) {
  const { params, setView } = useNav();
  const id = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<any>("/api/meta"),
  });

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: () => apiFetch<any>(`/api/tasks/${id}`),
    enabled: !!id,
  });

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
  const isAssignee = task.assignees?.some((a: any) => a.userId === user.id);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["task", id] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["mywork"] });
    queryClient.invalidateQueries({ queryKey: ["kanban"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
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
            </div>
            <h1 className="text-xl lg:text-2xl font-black text-foreground">{task.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusChangeButton task={task} canApprove={canApprove} canEdit={canEdit || isAssignee} onChanged={invalidateAll} />
            {canEdit && (
              <EditTaskDialog task={task} meta={meta} onSaved={invalidateAll} />
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
          <ChecklistCard task={task} canEdit={canEdit || isAssignee} onChanged={invalidateAll} />

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
                    body: JSON.stringify({ progress: v[0] }),
                  }).then(() => {
                    invalidateAll();
                    toast({ title: "تم تحديث التقدم" });
                  }).catch(() => toast({ title: "تعذّر تحديث التقدم", variant: "destructive" }));
                }}
              />
            )}
            {task.estimatedHours != null && (
              <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> الساعات المقدّرة: <span className="nums">{task.estimatedHours} س</span>
              </div>
            )}
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
              <DetailRow icon={Calendar} label="تاريخ البدء" value={task.startDate ? formatDate(task.startDate) : "—"} />
              <DetailRow icon={Clock} label="الموعد النهائي" value={task.dueDate ? formatDate(task.dueDate) : "—"} highlight={task.dueDate && new Date(task.dueDate) < new Date() && !["completed_approved", "cancelled"].includes(task.status) ? "red" : undefined} />
              <DetailRow icon={UserCircle2} label="أنشأها" value={task.createdBy?.name} />
              <DetailRow icon={Calendar} label="تاريخ الإنشاء" value={formatDate(task.createdAt)} />
              {task.parent && (
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><GitBranch className="h-3 w-3" /> مهمة أم</span>
                  <button onClick={() => setView("task-detail", { id: task.parent.id })} className="text-xs text-primary hover:underline nums">{taskNumber(task.parent.number)} — {task.parent.title}</button>
                </div>
              )}
            </dl>
          </SectionCard>

          {/* المرفقات */}
          <SectionCard title={`المرفقات (${task.attachments?.length ?? 0})`} action={canEdit ? <AddAttachmentDialog taskId={task.id} onAdded={invalidateAll} /> : undefined}>
            {task.attachments && task.attachments.length > 0 ? (
              <div className="space-y-2">
                {task.attachments.map((a: any) => (
                  <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-accent transition">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium line-clamp-1">{a.fileName}</div>
                      <div className="text-[10px] text-muted-foreground">{a.user?.name ?? "—"} • {relativeTime(a.createdAt)}</div>
                    </div>
                    {a.required && <Badge variant="outline" className="text-[10px] text-red-700 border-red-300">إلزامي</Badge>}
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState icon={Paperclip} title="لا توجد مرفقات" />
            )}
          </SectionCard>

          {/* التبعيات */}
          {(task.dependencies?.length > 0 || task.blockingTasks?.length > 0) && (
            <SectionCard title="التبعيات">
              {task.dependencies?.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">تعتمد على</div>
                  <div className="space-y-1">
                    {task.dependencies.map((d: any) => (
                      <button key={d.id} onClick={() => setView("task-detail", { id: d.dependsOn.id})} className="w-full text-right text-xs p-2 rounded hover:bg-accent flex items-center justify-between gap-2">
                        <span className="nums text-muted-foreground">{taskNumber(d.dependsOn.number)}</span>
                        <span className="line-clamp-1 flex-1">{d.dependsOn.title}</span>
                        <StatusBadge label={TASK_STATUSES[d.dependsOn.status as keyof typeof TASK_STATUSES]?.label ?? d.dependsOn.status} color={TASK_STATUSES[d.dependsOn.status as keyof typeof TASK_STATUSES]?.color ?? "slate"} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {task.blockingTasks?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">تحجب</div>
                  <div className="space-y-1">
                    {task.blockingTasks.map((b: any) => (
                      <button key={b.id} onClick={() => setView("task-detail", { id: b.task.id })} className="w-full text-right text-xs p-2 rounded hover:bg-accent flex items-center justify-between gap-2">
                        <span className="nums text-muted-foreground">{taskNumber(b.task.number)}</span>
                        <span className="line-clamp-1 flex-1">{b.task.title}</span>
                        <StatusBadge label={TASK_STATUSES[b.task.status as keyof typeof TASK_STATUSES]?.label ?? b.task.status} color={TASK_STATUSES[b.task.status as keyof typeof TASK_STATUSES]?.color ?? "slate"} />
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

// ===== زر تغيير الحالة =====
function StatusChangeButton({ task, canApprove, canEdit, onChanged }: { task: any; canApprove: boolean; canEdit: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [stallReason, setStallReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const transitions = STATUS_TRANSITIONS[task.status] ?? [];
  const allowed = transitions.filter((s) => s !== "completed_approved" || canApprove);

  if (allowed.length === 0 || !canEdit) return null;

  const submit = async () => {
    if (!status) return;
    if (status === "stalled" && !stallReason.trim()) {
      toast({ title: "سبب التعثر مطلوب", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${task.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, note: note || undefined, stallReason: stallReason || undefined }),
      });
      toast({ title: "تم تحديث الحالة" });
      setOpen(false);
      setStatus(""); setNote(""); setStallReason("");
      onChanged();
    } catch (e: any) {
      toast({ title: "تعذّر تحديث الحالة", description: e?.message, variant: "destructive" });
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحديث حالة المهمة</DialogTitle>
            <DialogDescription>اختر الحالة الجديدة وأضف ملاحظة اختيارية</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الحالة الجديدة</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full mt-1"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                <SelectContent>
                  {allowed.map((s) => {
                    const st = TASK_STATUSES[s as keyof typeof TASK_STATUSES];
                    return <SelectItem key={s} value={s}>{st?.label ?? s}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            {status === "stalled" && (
              <div>
                <Label>سبب التعثر *</Label>
                <Textarea className="mt-1" value={stallReason} onChange={(e) => setStallReason(e.target.value)} placeholder="اشرح سبب التعثر والإجراء المطلوب…" />
              </div>
            )}
            <div>
              <Label>ملاحظة (اختياري)</Label>
              <Textarea className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة حول تغيير الحالة…" />
            </div>
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
            <Button onClick={submit} disabled={submitting || !status} className="bg-primary hover:bg-primary/90 gap-1.5">
              {submitting ? "جارٍ…" : <><CheckCircle2 className="h-4 w-4" /> تأكيد</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== حوار تعديل المهمة =====
function EditTaskDialog({ task, meta, onSaved }: { task: any; meta: any; onSaved: () => void }) {
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
        }),
      });
      toast({ title: "تم حفظ التعديلات" });
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e?.message, variant: "destructive" });
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
function AssigneesDialog({ task, meta, onSaved }: { task: any; meta: any; onSaved: () => void }) {
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
function ChecklistCard({ task, canEdit, onChanged }: { task: any; canEdit: boolean; onChanged: () => void }) {
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
        <div className="space-y-1.5 mb-3">
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
function CommentsCard({ task, user, onChanged }: { task: any; user: CurrentUser; onChanged: () => void }) {
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
  const [form, setForm] = useState({ fileName: "", fileUrl: "", required: false });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.fileName.trim() || !form.fileUrl.trim()) {
      toast({ title: "الاسم والرابط مطلوبان", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast({ title: "تمت إضافة المرفق" });
      setOpen(false);
      setForm({ fileName: "", fileUrl: "", required: false });
      onAdded();
    } catch (e: any) {
      toast({ title: "تعذّر الإضافة", description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-xs gap-1">
        <Plus className="h-3.5 w-3.5" /> إضافة
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مرفق</DialogTitle>
            <DialogDescription>سجّل بيانات المرفق (سيتم رفعه خارجيًا)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم الملف *</Label>
              <Input className="mt-1" value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="مثال: عقد_التوريد.pdf" />
            </div>
            <div>
              <Label>الرابط *</Label>
              <Input className="mt-1 nums" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="/uploads/…" dir="ltr" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.required} onCheckedChange={(v) => setForm({ ...form, required: !!v })} />
              مرفق إلزامي (مطلوب لاعتماد الإكمال)
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
            <Button onClick={submit} disabled={submitting} className="bg-primary hover:bg-primary/90">
              {submitting ? "جارٍ…" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
