"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { SectionCard } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import {
  REQUEST_STATUSES, REQUEST_TYPES, ROLES,
  formatCurrency, formatDate, formatDateTime, relativeTime, requestNumber,
} from "@/lib/constants";
import {
  ArrowRight, ArrowLeft, Building2, Wallet, Calendar as CalIcon, User, FileText,
  Paperclip, MessageSquare, CheckCircle2, XCircle, RotateCcw, ChevronLeft, ChevronRight,
  Download, Clock, Check, X, AlertTriangle, Banknote, ShieldCheck, Loader2, Send,
  Pencil, Tag, ClipboardList, FileCheck, CircleDollarSign, UserCog,
} from "lucide-react";

interface RequestAction {
  id: string;
  action: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
  user: { id: string; name: string; role: string };
  step: { id: string; approverLabel: string | null; approverRole: string; order: number; isFinal: boolean } | null;
}

interface RequestNote {
  id: string;
  text: string;
  createdAt: string;
  user: { id: string; name: string; role: string };
}

interface RequestAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  required: boolean;
}

interface RequestDetail {
  id: string;
  number: number;
  refCode: string | null;
  status: string;
  title: string;
  purpose: string | null;
  amount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string;
  beneficiary: string | null;
  dueDate: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  currentApproverRole: string | null;
  requestType: { id: string; code: string; nameAr: string; category: string };
  workflow: { id: string; name: string; steps: { id: string; order: number; approverRole: string; approverLabel: string | null; isFinal: boolean }[] } | null;
  currentStep: { id: string; order: number; approverRole: string; approverLabel: string | null; isFinal: boolean } | null;
  costCenter: { id: string; name: string; code: string } | null;
  vendor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  createdBy: { id: string; name: string; nameEn: string | null; role: string; jobTitle: string | null; department: { name: string } | null };
  assignedTo: { id: string; name: string; role: string; jobTitle: string | null } | null;
  attachments: RequestAttachment[];
  actions: RequestAction[];
  notes: RequestNote[];
  task: { id: string; number: number; title: string; status: string } | null;
  _canTakeAction: boolean;
  _canExecute: boolean;
  _isCreator: boolean;
}

export function RequestDetailView({ user }: { user: CurrentUser }) {
  const { params, setView, openDetail } = useNav();
  const id = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canSeeAmounts = canClient(user, "finance.view.amounts");
  const canEdit = canClient(user, "request.edit");

  const { data: req, isLoading } = useQuery({
    queryKey: ["request", id],
    queryFn: () => apiFetch<RequestDetail>(`/api/requests/${id}`),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["request", id] });
    queryClient.invalidateQueries({ queryKey: ["requests"] });
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const actionMutation = useMutation({
    mutationFn: (data: { action: string; note?: string; rejectionReason?: string }) =>
      apiFetch(`/api/requests/${id}/action`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "تم تنفيذ الإجراء بنجاح" });
      invalidate();
    },
    onError: (e: any) => {
      toast({ title: "تعذّر تنفيذ الإجراء", description: e.message, variant: "destructive" });
    },
  });

  const noteMutation = useMutation({
    mutationFn: (text: string) =>
      apiFetch(`/api/requests/${id}/notes`, { method: "POST", body: JSON.stringify({ text }) }),
    onSuccess: () => {
      toast({ title: "تمت إضافة الملاحظة" });
      invalidate();
    },
    onError: (e: any) => {
      toast({ title: "تعذّر إضافة الملاحظة", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading || !req) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setView("requests")} className="gap-1">
          <ArrowRight className="h-4 w-4" /> عودة للقائمة
        </Button>
        <div className="h-8 w-72 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-xl" />
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-64 bg-muted animate-pulse rounded-xl" />
          <div className="h-64 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  const statusMeta = REQUEST_STATUSES[req.status as keyof typeof REQUEST_STATUSES];
  const typeMeta = REQUEST_TYPES[req.requestType.code as keyof typeof REQUEST_TYPES];

  // تقدم مسار الاعتماد
  const steps = req.workflow?.steps ?? [];
  const stepStatusMap = computeStepStatuses(steps, req);

  // مكان الطلب الآن
  const currentLocation = getCurrentLocation(req);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      {/* الرأس */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("requests")} className="gap-1 shrink-0">
            <ArrowRight className="h-4 w-4" /> القائمة
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-black text-foreground">{req.title}</h1>
              <StatusBadge label={statusMeta?.label ?? req.status} color={statusMeta?.color ?? "slate"} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="font-bold text-primary nums">{requestNumber(req.number)}</span>
              {req.refCode && <span className="nums">• {req.refCode}</span>}
              <span>• {typeMeta?.label ?? req.requestType.nameAr}</span>
              <span>• أُنشئ {relativeTime(req.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {req._isCreator && canEdit && ["draft", "needs_completion"].includes(req.status) && (
            <Button variant="outline" size="sm" className="gap-1.5">
              <Pencil className="h-4 w-4" /> تعديل
            </Button>
          )}
        </div>
      </div>

      {/* سبب الرفض (إن وجد) */}
      {req.status === "rejected" && req.rejectionReason && (
        <Card className="p-4 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0">
              <XCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-red-700 dark:text-red-300">سبب الرفض</div>
              <p className="text-sm text-red-800 dark:text-red-200 mt-1">{req.rejectionReason}</p>
            </div>
          </div>
        </Card>
      )}

      {/* مكان الطلب الآن (بانر) */}
      {currentLocation && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">عند من الآن؟</div>
              <div className="text-sm font-bold text-primary">{currentLocation}</div>
            </div>
          </div>
        </Card>
      )}

      {/* محتوى رئيسي */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* العمود الأيمن: التفاصيل الرئيسية */}
        <div className="lg:col-span-2 space-y-4">
          {/* الغرض */}
          <SectionCard title="الغرض من الطلب">
            {req.purpose ? (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{req.purpose}</p>
            ) : (
              <p className="text-sm text-muted-foreground">لم يُحدد الغرض.</p>
            )}
          </SectionCard>

          {/* التفاصيل المالية */}
          <SectionCard title="التفاصيل المالية والإدارية">
            <div className="grid sm:grid-cols-2 gap-3">
              {canSeeAmounts && req.amount != null && (
                <DetailField icon={Wallet} label="المبلغ قبل الضريبة" value={formatCurrency(req.amount, req.currency)} mono />
              )}
              {canSeeAmounts && req.taxAmount != null && (
                <DetailField icon={CircleDollarSign} label="ضريبة القيمة المضافة" value={formatCurrency(req.taxAmount, req.currency)} mono />
              )}
              {canSeeAmounts && req.totalAmount != null && (
                <div className="sm:col-span-2 p-3 rounded-lg bg-primary/5 border border-primary/15 flex items-center justify-between">
                  <span className="text-sm font-bold">الإجمالي</span>
                  <span className="text-lg font-black text-primary nums">{formatCurrency(req.totalAmount, req.currency)}</span>
                </div>
              )}
              {req.costCenter && (
                <DetailField icon={Building2} label="مركز التكلفة" value={`${req.costCenter.name} (${req.costCenter.code})`} />
              )}
              {req.project && (
                <DetailField icon={Tag} label="المشروع" value={req.project.name} />
              )}
              {req.vendor && (
                <DetailField icon={UserCog} label="المورد" value={req.vendor.name} />
              )}
              {req.beneficiary && (
                <DetailField icon={User} label="المستفيد" value={req.beneficiary} />
              )}
              {req.dueDate && (
                <DetailField icon={CalIcon} label="الموعد النهائي" value={`${formatDate(req.dueDate)} (${relativeTime(req.dueDate)})`} />
              )}
            </div>
          </SectionCard>

          {/* المرفقات */}
          <SectionCard title={`المرفقات (${req.attachments.length})`}>
            {req.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p>
            ) : (
              <div className="space-y-2">
                {req.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-accent transition group"
                  >
                    <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{a.fileName}</div>
                      <div className="text-[10px] text-muted-foreground">{a.fileType || "ملف"}</div>
                    </div>
                    {a.required && <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[10px]">إلزامي</Badge>}
                    <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  </a>
                ))}
              </div>
            )}
          </SectionCard>

          {/* مسار الاعتماد (الـ Stepper) */}
          {steps.length > 0 && (
            <SectionCard title="مسار الاعتماد">
              <div className="space-y-1">
                <WorkflowStepper
                  steps={steps}
                  stepStatusMap={stepStatusMap}
                  actions={req.actions}
                />
              </div>
            </SectionCard>
          )}

          {/* سجل الإجراءات */}
          <SectionCard title={`سجل الإجراءات (${req.actions.length})`}>
            {req.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد إجراءات بعد.</p>
            ) : (
              <div className="space-y-3">
                {req.actions.map((a) => (
                  <ActionHistoryItem key={a.id} action={a} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* العمود الأيسر: الإجراءات + معلومات */}
        <div className="space-y-4">
          {/* لوحة الإجراء */}
          <ActionPanel
            req={req}
            user={user}
            onAction={(action, payload) => actionMutation.mutate({ action, ...payload })}
            pending={actionMutation.isPending}
          />

          {/* معلومات الطلب */}
          <SectionCard title="معلومات">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">مقدم الطلب</span>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{req.createdBy.name[0]}</AvatarFallback></Avatar>
                  <span className="font-medium">{req.createdBy.name}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">الدور</span>
                <span className="text-xs">{ROLES[req.createdBy.role as keyof typeof ROLES] ?? req.createdBy.role}</span>
              </div>
              {req.createdBy.department && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الإدارة</span>
                  <span className="text-xs">{req.createdBy.department.name}</span>
                </div>
              )}
              {req.assignedTo && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">المسند إلى</span>
                  <span className="text-xs font-medium">{req.assignedTo.name}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">تاريخ الإنشاء</span>
                <span className="text-xs nums">{formatDateTime(req.createdAt)}</span>
              </div>
              {req.updatedAt !== req.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">آخر تحديث</span>
                  <span className="text-xs nums">{relativeTime(req.updatedAt)}</span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* المهمة المرتبطة */}
          {req.task && (
            <SectionCard title="المهمة المرتبطة">
              <button
                onClick={() => openDetail("task-detail", req.task!.id)}
                className="w-full text-right p-3 rounded-lg border hover:bg-accent transition flex items-center gap-3"
              >
                <div className="h-9 w-9 rounded-md bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground nums">م-{String(req.task.number).padStart(4, "0")}</div>
                  <div className="text-sm font-medium line-clamp-1">{req.task.title}</div>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            </SectionCard>
          )}

          {/* الملاحظات */}
          <SectionCard title={`الملاحظات (${req.notes.length})`}>
            <AddNote onAdd={(text) => noteMutation.mutate(text)} pending={noteMutation.isPending} />
            <div className="mt-3 space-y-3 max-h-80 overflow-y-auto pr-1">
              {req.notes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">لا توجد ملاحظات.</p>
              ) : (
                req.notes.slice().reverse().map((n) => (
                  <div key={n.id} className="flex items-start gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-[10px]">{n.user.name[0]}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1 p-2.5 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{n.user.name}</span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="text-xs mt-1 text-foreground whitespace-pre-wrap">{n.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ============== محوّر مسار الاعتماد ==============
function WorkflowStepper({
  steps,
  stepStatusMap,
  actions,
}: {
  steps: { id: string; order: number; approverRole: string; approverLabel: string | null; isFinal: boolean }[];
  stepStatusMap: Record<string, "done" | "current" | "pending" | "rejected" | "returned">;
  actions: RequestAction[];
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-stretch gap-2 min-w-fit">
        {steps.map((step, i) => {
          const status = stepStatusMap[step.id] ?? "pending";
          const label = step.approverLabel ?? ROLES[step.approverRole as keyof typeof ROLES] ?? step.approverRole;
          const relatedAction = actions.find((a) => a.step?.id === step.id);
          return (
            <div key={step.id} className="flex items-stretch gap-2">
              <div
                className={`flex-1 min-w-[140px] p-3 rounded-lg border-2 transition ${
                  status === "done"
                    ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800"
                    : status === "current"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : status === "rejected"
                    ? "border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800"
                    : status === "returned"
                    ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800"
                    : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] nums">خطوة {step.order}</Badge>
                  {step.isFinal && (
                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                      نهائية
                    </Badge>
                  )}
                  {status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {status === "current" && <Clock className="h-4 w-4 text-primary animate-pulse" />}
                  {status === "rejected" && <XCircle className="h-4 w-4 text-red-600" />}
                  {status === "returned" && <RotateCcw className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="text-sm font-bold">{label}</div>
                {relatedAction && (
                  <div className="mt-1.5 text-[10px] text-muted-foreground space-y-0.5">
                    <div>{relatedAction.user.name}</div>
                    <div>{relativeTime(relatedAction.createdAt)}</div>
                    {relatedAction.note && <div className="line-clamp-2 italic">«{relatedAction.note}»</div>}
                  </div>
                )}
                {status === "current" && (
                  <div className="mt-1.5 text-[10px] text-primary font-bold">بانتظار الاعتماد</div>
                )}
                {status === "pending" && (
                  <div className="mt-1.5 text-[10px] text-muted-foreground">بانتظار الدور</div>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className="flex items-center justify-center self-center">
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== عنصر سجل الإجراءات ==============
function ActionHistoryItem({ action }: { action: RequestAction }) {
  const iconMap: Record<string, any> = {
    approve: CheckCircle2,
    reject: XCircle,
    return: RotateCcw,
    forward: Banknote,
  };
  const colorMap: Record<string, string> = {
    approve: "text-green-600 bg-green-50 dark:bg-green-900/20",
    reject: "text-red-600 bg-red-50 dark:bg-red-900/20",
    return: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
    forward: "text-primary bg-primary/5",
  };
  const labelMap: Record<string, string> = {
    approve: "اعتماد",
    reject: "رفض",
    return: "إعادة للاستكمال",
    forward: "تنفيذ",
  };
  const Icon = iconMap[action.action] ?? Clock;
  return (
    <div className="flex items-start gap-3">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${colorMap[action.action] ?? ""}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm">
            <span className="font-bold">{action.user.name}</span>
            <span className="text-muted-foreground"> — {labelMap[action.action] ?? action.action}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{formatDateTime(action.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
          {action.fromStatus && <span>{REQUEST_STATUSES[action.fromStatus as keyof typeof REQUEST_STATUSES]?.label ?? action.fromStatus}</span>}
          <ArrowLeft className="h-3 w-3" />
          <span>{REQUEST_STATUSES[action.toStatus as keyof typeof REQUEST_STATUSES]?.label ?? action.toStatus}</span>
        </div>
        {action.note && <p className="text-xs mt-1 text-foreground bg-muted/40 p-2 rounded">{action.note}</p>}
      </div>
    </div>
  );
}

// ============== لوحة الإجراء ==============
function ActionPanel({
  req, user, onAction, pending,
}: {
  req: RequestDetail;
  user: CurrentUser;
  onAction: (action: string, payload?: { note?: string; rejectionReason?: string }) => void;
  pending: boolean;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [returnNote, setReturnNote] = useState("");

  // إجراءات الاعتماد للمعتمد الحالي
  if (req._canTakeAction) {
    return (
      <>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold">بانتظار إجراءك</div>
              <div className="text-xs text-muted-foreground">أنت الجهة المعتمدة الحالية</div>
            </div>
          </div>
          <div className="space-y-2">
            <Button
              onClick={() => onAction("approve")}
              disabled={pending}
              className="w-full gap-1.5 bg-green-600 hover:bg-green-700"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              اعتماد
            </Button>
            <Button
              onClick={() => setReturnOpen(true)}
              disabled={pending}
              variant="outline"
              className="w-full gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <RotateCcw className="h-4 w-4" /> إعادة للاستكمال
            </Button>
            <Button
              onClick={() => setRejectOpen(true)}
              disabled={pending}
              variant="outline"
              className="w-full gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4" /> رفض
            </Button>
          </div>
        </Card>

        {/* نافذة الرفض */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <XCircle className="h-5 w-5" /> رفض الطلب
              </DialogTitle>
              <DialogDescription>سيتم إشعار مقدم الطلب بقرار الرفض. يجب تقديم سبب واضح.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs font-bold">سبب الرفض *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="اشرح سبب الرفض بوضوح..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>إلغاء</Button>
              <Button
                variant="destructive"
                disabled={!rejectReason.trim() || pending}
                onClick={() => {
                  onAction("reject", { rejectionReason: rejectReason.trim() });
                  setRejectOpen(false);
                  setRejectReason("");
                }}
                className="gap-1.5"
              >
                تأكيد الرفض
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* نافذة الإعادة للاستكمال */}
        <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <RotateCcw className="h-5 w-5" /> إعادة الطلب للاستكمال
              </DialogTitle>
              <DialogDescription>سيُعاد الطلب لمقدمه لاستكمال النواقص.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs font-bold">ملاحظة للاستكمال *</Label>
              <Textarea
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                placeholder="حدد ما يحتاج استكماله..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReturnOpen(false)}>إلغاء</Button>
              <Button
                disabled={!returnNote.trim() || pending}
                onClick={() => {
                  onAction("return", { note: returnNote.trim() });
                  setReturnOpen(false);
                  setReturnNote("");
                }}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700"
              >
                تأكيد الإعادة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // إجراءات التنفيذ للمحاسب
  if (req._canExecute) {
    let nextLabel = "";
    let NextIcon: any = Banknote;
    if (req.status === "forwarded_accountant") { nextLabel = "بدء التنفيذ"; NextIcon = Banknote; }
    else if (req.status === "in_execution") { nextLabel = "إتمام التنفيذ"; NextIcon = FileCheck; }
    else if (req.status === "fully_executed") { nextLabel = "إغلاق"; NextIcon = CheckCircle2; }

    return (
      <Card className="p-4 border-orange-300/40 bg-orange-50/50 dark:bg-orange-900/10">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-lg bg-orange-500 text-white flex items-center justify-center">
            <Banknote className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold">إجراء التنفيذ</div>
            <div className="text-xs text-muted-foreground">المحاسب مسند إليه هذا الطلب</div>
          </div>
        </div>
        <Button
          onClick={() => onAction("forward")}
          disabled={pending || !nextLabel}
          className="w-full gap-1.5 bg-orange-600 hover:bg-orange-700"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <NextIcon className="h-4 w-4" />}
          {nextLabel}
        </Button>
      </Card>
    );
  }

  // لا إجراء متاح: إظهار حالة الطلب الحالية
  return (
    <Card className="p-4 bg-muted/30">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold">لا إجراء متاح</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {req.status === "draft" && "الطلب في حالة مسودة، بانتظار الإرسال."}
            {req.status === "submitted" && "الطلب قيد الانتظار لإسناد المعتمد."}
            {req.status === "needs_completion" && "أُعيد الطلب للاستكمال من قبل مقدمه."}
            {req.status === "rejected" && "تم رفض الطلب ولا يمكن اتخاذ مزيد من الإجراءات."}
            {req.status === "approved" && "تم اعتماد الطلب."}
            {req.status === "forwarded_accountant" && "بانتظار تنفيذ المحاسب."}
            {req.status === "in_execution" && "الطلب قيد التنفيذ."}
            {req.status === "fully_executed" && "تم تنفيذ الطلب بالكامل."}
            {req.status === "closed" && "تم إغلاق الطلب."}
            {req.status === "under_review" && req.currentApproverRole !== user.role && "بانتظار اعتماد جهة أخرى."}
            {req.status === "preliminarily_approved" && req.currentApproverRole !== user.role && "بانتظار اعتماد جهة أخرى."}
            {req.status === "awaiting_final" && req.currentApproverRole !== user.role && "بانتظار الاعتماد النهائي من جهة أخرى."}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============== إضافة ملاحظة ==============
function AddNote({ onAdd, pending }: { onAdd: (text: string) => void; pending: boolean }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="أضف ملاحظة..."
        rows={2}
        className="text-sm"
      />
      <Button size="sm" onClick={submit} disabled={!text.trim() || pending} className="gap-1 w-full">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        إضافة الملاحظة
      </Button>
    </div>
  );
}

// ============== حقل تفصيل ==============
function DetailField({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-md bg-muted/30">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className={`text-sm font-medium ${mono ? "nums" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

// ============== مساعدات ==============
function computeStepStatuses(
  steps: { id: string; order: number; approverRole: string; approverLabel: string | null; isFinal: boolean }[],
  req: RequestDetail,
): Record<string, "done" | "current" | "pending" | "rejected" | "returned"> {
  const map: Record<string, "done" | "current" | "pending" | "rejected" | "returned"> = {};
  if (steps.length === 0) return map;
  const currentStepId = req.currentStep?.id;
  const rejected = req.status === "rejected";
  const returned = req.status === "needs_completion";
  const approvedStages = ["approved", "forwarded_accountant", "in_execution", "fully_executed", "closed"];

  for (const step of steps) {
    if (rejected) {
      // الخطوة الحالية مرفوضة، ما قبلها منجزة
      map[step.id] = step.id === currentStepId ? "rejected" : step.order < (req.currentStep?.order ?? 0) ? "done" : "pending";
    } else if (returned) {
      map[step.id] = step.id === currentStepId ? "returned" : step.order < (req.currentStep?.order ?? 0) ? "done" : "pending";
    } else if (approvedStages.includes(req.status)) {
      map[step.id] = "done";
    } else if (step.id === currentStepId) {
      map[step.id] = "current";
    } else if (step.order < (req.currentStep?.order ?? 0)) {
      map[step.id] = "done";
    } else {
      map[step.id] = "pending";
    }
  }
  return map;
}

function getCurrentLocation(req: RequestDetail): string | null {
  const status = req.status;
  if (status === "draft") return "مسودة — لم تُرسل بعد";
  if (status === "submitted") return "تم الإرسال — بانتظار الإسناد";
  if (status === "needs_completion") return "أُعيد لمقدمه للاستكمال";
  if (status === "rejected") return "مرفوض";
  if (status === "approved") return "معتمد";
  if (status === "forwarded_accountant") return "محوّل للمحاسب للتنفيذ";
  if (status === "in_execution") return "قيد التنفيذ";
  if (status === "fully_executed") return "منفذ بالكامل";
  if (status === "closed") return "مغلق";
  if (req.currentStep) {
    const label = req.currentStep.approverLabel ?? ROLES[req.currentStep.approverRole as keyof typeof ROLES] ?? req.currentStep.approverRole;
    if (status === "awaiting_final") return `بانتظار الاعتماد النهائي — ${label}`;
    if (status === "preliminarily_approved") return `معتمد مبدئيًا — بانتظار ${label}`;
    return `بانتظار اعتماد — ${label}`;
  }
  return null;
}
