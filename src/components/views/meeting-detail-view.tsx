"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge, PriorityBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import {
  formatDateTime, formatDate, taskNumber, TASK_STATUSES, TASK_PRIORITIES,
} from "@/lib/constants";
import { toast } from "sonner";
import {
  ArrowRight, Calendar, MapPin, Link2, Users, Gavel, ClipboardList,
  ExternalLink, Loader2, Plus, ListChecks, FileText, CheckCircle2, Clock, XCircle,
} from "lucide-react";

interface MeetingDetail {
  id: string;
  title: string;
  date: string;
  location?: string | null;
  linkUrl?: string | null;
  agenda?: string | null;
  minutes?: string | null;
  nextMeeting?: string | null;
  organizerId: string;
  organizer: { id: string; name: string; jobTitle?: string | null; avatarUrl?: string | null };
  attendees: {
    id: string;
    attended: boolean;
    userId: string;
    user: {
      id: string; name: string; jobTitle?: string | null; avatarUrl?: string | null;
      department?: { name: string } | null;
    };
  }[];
  decisions: {
    id: string;
    text: string;
    rationale?: string | null;
    dueDate?: string | null;
    status: string;
    decidedById: string;
    decidedBy: { id: string; name: string };
    task?: { id: string; number: number; title: string; status: string; priority: string } | null;
    createdAt: string;
  }[];
  tasks: {
    id: string; number: number; title: string; status: string; priority: string;
    dueDate?: string | null;
    assignees: { user: { id: string; name: string } }[];
    department?: { name: string } | null;
  }[];
  createdAt: string;
  updatedAt: string;
}

const DECISION_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "amber" },
  converted: { label: "محوَّلة", color: "teal" },
  implemented: { label: "مُنفَّذة", color: "green" },
  cancelled: { label: "ملغاة", color: "gray" },
};

export function MeetingDetailView({ user }: { user: CurrentUser }) {
  const { params, setView } = useNav();
  const id = params.id;
  const qc = useQueryClient();
  const [convertDecisionId, setConvertDecisionId] = useState<string | null>(null);

  const { data: meeting, isLoading } = useQuery({
    queryKey: ["meeting", id],
    queryFn: () => apiFetch<MeetingDetail>(`/api/meetings/${id}`),
    enabled: !!id,
  });

  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">معرّف الاجتماع مفقود</div>;
  }

  if (isLoading || !meeting) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-xl" />
        <div className="h-40 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  const canEdit = meeting.organizerId === user.id || canClient(user, "meeting.edit");
  const isUpcoming = new Date(meeting.date) >= new Date();

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      {/* الترويسة */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => setView("meetings")} className="gap-1.5 mb-2 -mr-2 text-muted-foreground">
          <ArrowRight className="h-4 w-4" /> رجوع للاجتماعات
        </Button>
        <PageHeader
          title={meeting.title}
          subtitle={`منظِّم: ${meeting.organizer.name}${meeting.organizer.jobTitle ? ` — ${meeting.organizer.jobTitle}` : ""}`}
          actions={
            canEdit ? (
              <Button variant="outline" size="sm" onClick={() => setView("meetings")} className="gap-1.5">
                <Plus className="h-4 w-4" /> تعديل
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* بطاقة معلومات الاجتماع */}
      <SectionCard>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCell icon={Calendar} label="التاريخ" value={formatDateTime(meeting.date)} />
          <InfoCell
            icon={MapPin}
            label="المكان"
            value={meeting.location || "غير محدد"}
          />
          <InfoCell
            icon={Link2}
            label="الرابط"
            value={
              meeting.linkUrl ? (
                <a
                  href={meeting.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 truncate"
                  dir="ltr"
                >
                  فتح الرابط <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : "—"
            }
          />
          <InfoCell
            icon={Calendar}
            label="الاجتماع القادم"
            value={meeting.nextMeeting ? formatDate(meeting.nextMeeting) : "غير محدد"}
          />
        </div>
        {isUpcoming && (
          <div className="mt-3 pt-3 border-t border-border">
            <Badge className="bg-primary/10 text-primary border-primary/20">اجتماع قادم</Badge>
          </div>
        )}
      </SectionCard>

      {/* تبويبات المحتوى */}
      <Tabs defaultValue="agenda">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="agenda" className="gap-1.5"><FileText className="h-4 w-4" /> بيانات الاجتماع</TabsTrigger>
          <TabsTrigger value="attendees" className="gap-1.5"><Users className="h-4 w-4" /> الحضور ({meeting.attendees.length})</TabsTrigger>
          <TabsTrigger value="decisions" className="gap-1.5"><Gavel className="h-4 w-4" /> القرارات ({meeting.decisions.length})</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5"><ClipboardList className="h-4 w-4" /> المهام ({meeting.tasks.length})</TabsTrigger>
        </TabsList>

        {/* بيانات الاجتماع */}
        <TabsContent value="agenda" className="space-y-4 mt-4">
          <SectionCard title="جدول الأعمال">
            {meeting.agenda ? (
              <div className="text-sm whitespace-pre-line leading-relaxed text-foreground/90">{meeting.agenda}</div>
            ) : (
              <div className="text-sm text-muted-foreground">لم يُحدَّد جدول أعمال بعد</div>
            )}
          </SectionCard>
          <SectionCard title="محضر الاجتماع">
            {meeting.minutes ? (
              <div className="text-sm whitespace-pre-line leading-relaxed text-foreground/90">{meeting.minutes}</div>
            ) : (
              <div className="text-sm text-muted-foreground">لم يُسجَّل المحضر بعد</div>
            )}
          </SectionCard>
        </TabsContent>

        {/* الحضور */}
        <TabsContent value="attendees" className="mt-4">
          <SectionCard title="قائمة المدعوين">
            {meeting.attendees.length === 0 ? (
              <EmptyState icon={Users} title="لا يوجد مدعوون" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {meeting.attendees.map((a) => (
                  <AttendeeRow key={a.id} attendee={a} />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* القرارات */}
        <TabsContent value="decisions" className="mt-4">
          <DecisionsSection meeting={meeting} canEdit={canEdit} onConvert={(decisionId) => setConvertDecisionId(decisionId)} />
        </TabsContent>

        {/* المهام المرتبطة */}
        <TabsContent value="tasks" className="mt-4">
          <SectionCard title="المهام المرتبطة بالاجتماع">
            {meeting.tasks.length === 0 ? (
              <EmptyState icon={ClipboardList} title="لا توجد مهام مرتبطة" description="المهام الناتجة عن تحويل القرارات ستظهر هنا." />
            ) : (
              <div className="space-y-2">
                {meeting.tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setView("task-detail", { id: t.id })}
                    className="w-full text-right p-3 rounded-lg border border-border hover:bg-accent/50 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground nums">{taskNumber(t.number)}</span>
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={t.priority} />
                        <StatusBadge
                          label={TASK_STATUSES[t.status as keyof typeof TASK_STATUSES]?.label ?? t.status}
                          color={TASK_STATUSES[t.status as keyof typeof TASK_STATUSES]?.color ?? "slate"}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-medium mt-1 line-clamp-1">{t.title}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {t.assignees[0]?.user?.name && <span>• {t.assignees[0].user.name}</span>}
                      {t.dueDate && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(t.dueDate)}</span>}
                      {t.department && <span>• {t.department.name}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* نافذة تحويل قرار إلى مهمة */}
      <ConvertDialog
        key={convertDecisionId ?? "closed"}
        decisionId={convertDecisionId}
        decisions={meeting.decisions}
        open={!!convertDecisionId}
        onOpenChange={(o) => !o && setConvertDecisionId(null)}
        onConverted={(taskId) => {
          qc.invalidateQueries({ queryKey: ["meeting", id] });
          qc.invalidateQueries({ queryKey: ["meetings"] });
          setConvertDecisionId(null);
          toast.success("تم تحويل القرار إلى مهمة بنجاح");
          setView("task-detail", { id: taskId });
        }}
      />
    </div>
  );
}

function InfoCell({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function AttendeeRow({ attendee }: { attendee: MeetingDetail["attendees"][number] }) {
  const u = attendee.user;
  const attended = attendee.attended;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${attended ? "border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800" : "border-border"}`}>
      <Avatar className="h-9 w-9">
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
          {u.name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{u.name}</div>
        {u.jobTitle && <div className="text-[11px] text-muted-foreground truncate">{u.jobTitle}</div>}
        {u.department?.name && <div className="text-[11px] text-muted-foreground truncate">{u.department.name}</div>}
      </div>
      {attended ? (
        <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800 gap-1">
          <CheckCircle2 className="h-3 w-3" /> حضر
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground gap-1">
          <XCircle className="h-3 w-3" /> لم يحضر
        </Badge>
      )}
    </div>
  );
}

// ============ قسم القرارات ============
function DecisionsSection({
  meeting, canEdit, onConvert,
}: {
  meeting: MeetingDetail;
  canEdit: boolean;
  onConvert: (decisionId: string) => void;
}) {
  if (meeting.decisions.length === 0) {
    return (
      <SectionCard title="القرارات">
        <EmptyState icon={Gavel} title="لا توجد قرارات" description="أضف القرارات المتخذة في هذا الاجتماع لتحويلها لاحقًا إلى مهام." />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="القرارات المتخذة">
      <div className="space-y-3">
        {meeting.decisions.map((d, i) => {
          const ds = DECISION_STATUSES[d.status] ?? DECISION_STATUSES.pending;
          return (
            <div key={d.id} className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 nums">
                    {i + 1}
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{d.text}</p>
                </div>
                <StatusBadge label={ds.label} color={ds.color} />
              </div>

              {d.rationale && (
                <div className="text-xs text-muted-foreground pr-9 mb-2">
                  <span className="font-medium">المبررات: </span>
                  {d.rationale}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 flex-wrap pr-9">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>بقرار من: {d.decidedBy.name}</span>
                  {d.dueDate && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> استحقاق: {formatDate(d.dueDate)}
                    </span>
                  )}
                </div>

                {/* الإجراءات */}
                <div className="flex items-center gap-2">
                  {d.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => onConvert(d.id)}
                    >
                      <ListChecks className="h-3.5 w-3.5" /> تحويل إلى مهمة
                    </Button>
                  )}
                  {d.task && (
                    <ConvertResultBadge taskId={d.task.id} taskNumber={d.task.number} taskTitle={d.task.title} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!canEdit && meeting.decisions.length > 0 && meeting.decisions.every((d) => d.status !== "pending") && (
        <p className="text-xs text-muted-foreground mt-3 text-center">جميع القرارات محوّلة أو منفذة</p>
      )}
    </SectionCard>
  );
}

function ConvertResultBadge({ taskId, taskNumber: n, taskTitle }: { taskId: string; taskNumber: number; taskTitle: string }) {
  const { setView } = useNav();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setView("task-detail", { id: taskId }); }}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-300 transition"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span className="nums">{`م-${String(n).padStart(4, "0")}`}</span>
      <span className="truncate max-w-32">{taskTitle}</span>
    </button>
  );
}

// ============ نافذة تحويل قرار إلى مهمة ============
function ConvertDialog({
  decisionId, decisions, open, onOpenChange, onConverted,
}: {
  decisionId: string | null;
  decisions: MeetingDetail["decisions"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConverted: (taskId: string) => void;
}) {
  const decision = decisions.find((d) => d.id === decisionId);
  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<{ users: any[]; departments: any[] }>("/api/meta"),
    enabled: open,
  });

  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [departmentId, setDepartmentId] = useState("");

  // الحالة تُعاد ضبطها عند كل فتح عبر `key={decisionId}` من الأب، فلا حاجة لتأثير.

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch(`/api/decisions/${decisionId}/convert`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (data: any) => onConverted(data.task.id),
    onError: (e: any) => toast.error(e?.message || "فشل تحويل القرار"),
  });

  if (!decision) return null;

  const users = (meta.data?.users ?? []) as any[];
  const departments = (meta.data?.departments ?? []) as any[];

  function submit() {
    if (!assigneeId) {
      toast.error("اختر المسؤول");
      return;
    }
    mutation.mutate({
      assigneeId,
      dueDate: dueDate || undefined,
      priority,
      departmentId: departmentId || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تحويل القرار إلى مهمة</DialogTitle>
          <DialogDescription>سيتم إنشاء مهمة جديدة مرتبطة بالقرار والاجتماع، وإسنادها للمسؤول المختار.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <div className="text-xs text-muted-foreground mb-1">نص القرار:</div>
            <div className="text-sm font-medium leading-relaxed">{decision.text}</div>
          </div>

          <div>
            <Label className="mb-1.5 block">المسؤول *</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="اختر المسؤول..." /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}{u.jobTitle ? ` — ${u.jobTitle}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">تاريخ الاستحقاق</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">الأولوية</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">الإدارة</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="بدون إدارة" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={mutation.isPending || !assigneeId} className="bg-primary hover:bg-primary/90 gap-1.5">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            تحويل إلى مهمة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
