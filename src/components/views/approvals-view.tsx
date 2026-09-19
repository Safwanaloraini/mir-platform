"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { StatCard, PageHeader, EmptyState, SectionCard } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import {
  REQUEST_STATUSES, ROLES, formatCurrency, formatDate, relativeTime, requestNumber,
} from "@/lib/constants";
import {
  CheckCircle2, XCircle, RotateCcw, Inbox, FileText, Loader2, Clock,
  Ban, Check, X, AlertTriangle, ChevronLeft, Banknote, Send, FileCheck,
  ClipboardCheck, History,
} from "lucide-react";

interface ApprovalItem {
  id: string;
  number: number;
  refCode: string | null;
  title: string;
  status: string;
  totalAmount: number | null;
  currency: string;
  dueDate: string | null;
  createdAt: string;
  requestType: { id: string; nameAr: string; code: string };
  createdBy: { id: string; name: string; role: string; department: { name: string } | null };
  currentStep: { id: string; approverLabel: string | null; approverRole: string; isFinal: boolean } | null;
  currentApproverRole: string | null;
}

interface ApprovalActionHistory {
  id: string;
  action: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
  request: {
    id: string;
    number: number;
    refCode: string | null;
    title: string;
    status: string;
  };
}

export function ApprovalsView({ user }: { user: CurrentUser }) {
  const { openDetail } = useNav();
  const canApprove = canClient(user, "request.approve");
  const canExecute = canClient(user, "request.execute");
  const canSeeAmounts = canClient(user, "finance.view.amounts");

  const [tab, setTab] = useState<"pending" | "execution" | "history">("pending");

  if (!canApprove && !canExecute) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={Ban}
          title="ليست لديك صلاحية الوصول"
          description="هذه الصفحة متاحة فقط لمن يملك صلاحية الاعتماد أو التنفيذ."
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="صندوق الاعتمادات"
        subtitle="الطلبات بانتظار إجراءاتك ومتابعتها"
      />

      {/* بطاقات المؤشرات */}
      <ApprovalStats canApprove={canApprove} canExecute={canExecute} canSeeAmounts={canSeeAmounts} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex-wrap h-auto">
          {canApprove && (
            <TabsTrigger value="pending" className="gap-1.5">
              <Inbox className="h-4 w-4" /> بانتظار اعتمادي
            </TabsTrigger>
          )}
          {canExecute && (
            <TabsTrigger value="execution" className="gap-1.5">
              <Banknote className="h-4 w-4" /> محولة لي للتنفيذ
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> أنجزتها
          </TabsTrigger>
        </TabsList>

        {canApprove && (
          <TabsContent value="pending" className="mt-4">
            <PendingApprovalList canSeeAmounts={canSeeAmounts} onOpen={(id) => openDetail("request-detail", id)} />
          </TabsContent>
        )}

        {canExecute && (
          <TabsContent value="execution" className="mt-4">
            <ExecutionList canSeeAmounts={canSeeAmounts} onOpen={(id) => openDetail("request-detail", id)} />
          </TabsContent>
        )}

        <TabsContent value="history" className="mt-4">
          <HistoryList canSeeAmounts={canSeeAmounts} onOpen={(id) => openDetail("request-detail", id)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== مؤشرات الاعتماد ==============
function ApprovalStats({ canApprove, canExecute, canSeeAmounts }: { canApprove: boolean; canExecute: boolean; canSeeAmounts: boolean }) {
  const { data } = useQuery({
    queryKey: ["approvals", "stats"],
    queryFn: () => apiFetch<{ pendingApproval: number; pendingExecution: number; approvedThisMonth: number; rejectedThisMonth: number; avgHours: number | null }>("/api/requests?pending_my_approval=true&pageSize=1"),
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: monthStats } = useQuery({
    queryKey: ["approvals", "monthStats"],
    queryFn: async () => {
      const [approved, rejected] = await Promise.all([
        apiFetch<{ total: number }>(`/api/requests?status=approved,forwarded_accountant,in_execution,fully_executed,closed&pageSize=1`),
        apiFetch<{ total: number }>(`/api/requests?status=rejected&pageSize=1`),
      ]);
      return { approved: approved.total, rejected: rejected.total };
    },
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      {canApprove && (
        <StatCard
          label="بانتظار اعتمادي"
          value={data?.pendingApproval ?? 0}
          icon={Inbox}
          color="amber"
          subtitle="طلبات تنتظر إجراءك"
        />
      )}
      {canExecute && (
        <StatCard
          label="محولة لي للتنفيذ"
          value={data?.pendingExecution ?? 0}
          icon={Banknote}
          color="orange"
          subtitle="طلبات معتمدة بانتظار التنفيذ"
        />
      )}
      <StatCard
        label="معتمدة (إجمالي)"
        value={monthStats?.approved ?? 0}
        icon={CheckCircle2}
        color="green"
      />
      <StatCard
        label="مرفوضة (إجمالي)"
        value={monthStats?.rejected ?? 0}
        icon={XCircle}
        color="red"
      />
    </div>
  );
}

// ============== قائمة الطلبات بانتظار الاعتماد ==============
function PendingApprovalList({ canSeeAmounts, onOpen }: { canSeeAmounts: boolean; onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectTarget, setRejectTarget] = useState<{ id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => apiFetch<{ items: ApprovalItem[]; total: number }>(`/api/requests?pending_my_approval=true&pageSize=50`),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, payload }: { id: string; action: string; payload?: any }) =>
      apiFetch(`/api/requests/${id}/action`, { method: "POST", body: JSON.stringify({ action, ...payload }) }),
    onSuccess: () => {
      toast({ title: "تم تنفيذ الإجراء" });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => {
      toast({ title: "تعذّر تنفيذ الإجراء", description: e.message, variant: "destructive" });
    },
  });

  const items = data?.items ?? [];

  return (
    <>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="لا توجد طلبات بانتظار اعتمادك"
          description="عندما يصل طلب يحتاج موافقتك، سيظهر هنا."
        />
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Card key={r.id} className="p-3 lg:p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <button
                  onClick={() => onOpen(r.id)}
                  className="flex items-start gap-3 flex-1 min-w-0 text-right"
                >
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-primary nums">{requestNumber(r.number)}</span>
                      {r.refCode && <span className="text-[10px] text-muted-foreground nums">{r.refCode}</span>}
                      <StatusBadge
                        label={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.label ?? r.status}
                        color={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.color ?? "slate"}
                      />
                    </div>
                    <div className="font-medium text-sm mt-0.5 line-clamp-1">{r.title}</div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                      <span>{r.requestType.nameAr}</span>
                      <span>•</span>
                      <span>{r.createdBy.name}</span>
                      {r.createdBy.department && (
                        <>
                          <span>•</span>
                          <span>{r.createdBy.department.name}</span>
                        </>
                      )}
                      {canSeeAmounts && r.totalAmount != null && (
                        <>
                          <span>•</span>
                          <span className="nums font-bold text-foreground">{formatCurrency(r.totalAmount, r.currency)}</span>
                        </>
                      )}
                      {r.dueDate && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{relativeTime(r.dueDate)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => actionMutation.mutate({ id: r.id, action: "approve" })}
                    disabled={actionMutation.isPending}
                    className="gap-1.5 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4" /> اعتماد
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectTarget({ id: r.id, title: r.title });
                      setRejectReason("");
                    }}
                    className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" /> رفض
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)} className="gap-1">
                    تفاصيل <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* نافذة الرفض */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => !v && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" /> رفض الطلب
            </DialogTitle>
            <DialogDescription>{rejectTarget?.title}</DialogDescription>
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
            <Button variant="outline" onClick={() => setRejectTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || actionMutation.isPending}
              onClick={() => {
                if (rejectTarget) {
                  actionMutation.mutate(
                    { id: rejectTarget.id, action: "reject", payload: { rejectionReason: rejectReason.trim() } },
                  );
                  setRejectTarget(null);
                }
              }}
              className="gap-1.5"
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============== قائمة الطلبات بانتظار التنفيذ ==============
function ExecutionList({ canSeeAmounts, onOpen }: { canSeeAmounts: boolean; onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // المحاسب: الطلبات المعتمدة المحولة له
  const { data, isLoading } = useQuery({
    queryKey: ["approvals", "execution"],
    queryFn: () => apiFetch<{ items: ApprovalItem[]; total: number }>(`/api/requests?status=forwarded_accountant,in_execution&pageSize=50`),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiFetch(`/api/requests/${id}/action`, { method: "POST", body: JSON.stringify({ action }) }),
    onSuccess: () => {
      toast({ title: "تم تحديث حالة التنفيذ" });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => {
      toast({ title: "تعذّر تنفيذ الإجراء", description: e.message, variant: "destructive" });
    },
  });

  const items = data?.items ?? [];

  return (
    <>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="لا توجد طلبات بانتظار تنفيذك"
          description="عندما يحوّل طلب معتمد إليك للتنفيذ، سيظهر هنا."
        />
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const isInExecution = r.status === "in_execution";
            return (
              <Card key={r.id} className="p-3 lg:p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <button
                    onClick={() => onOpen(r.id)}
                    className="flex items-start gap-3 flex-1 min-w-0 text-right"
                  >
                    <div className="h-10 w-10 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                      <Banknote className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-primary nums">{requestNumber(r.number)}</span>
                        {r.refCode && <span className="text-[10px] text-muted-foreground nums">{r.refCode}</span>}
                        <StatusBadge
                          label={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.label ?? r.status}
                          color={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.color ?? "slate"}
                        />
                      </div>
                      <div className="font-medium text-sm mt-0.5 line-clamp-1">{r.title}</div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        <span>{r.requestType.nameAr}</span>
                        <span>•</span>
                        <span>{r.createdBy.name}</span>
                        {canSeeAmounts && r.totalAmount != null && (
                          <>
                            <span>•</span>
                            <span className="nums font-bold text-foreground">{formatCurrency(r.totalAmount, r.currency)}</span>
                          </>
                        )}
                        {r.dueDate && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{relativeTime(r.dueDate)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isInExecution ? (
                      <Button
                        size="sm"
                        onClick={() => actionMutation.mutate({ id: r.id, action: "forward" })}
                        disabled={actionMutation.isPending}
                        className="gap-1.5 bg-orange-600 hover:bg-orange-700"
                      >
                        {actionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                        بدء التنفيذ
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => actionMutation.mutate({ id: r.id, action: "forward" })}
                        disabled={actionMutation.isPending}
                        className="gap-1.5 bg-green-600 hover:bg-green-700"
                      >
                        {actionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                        إتمام التنفيذ
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)} className="gap-1">
                      تفاصيل <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// ============== سجل الإجراءات التي قمت بها ==============
function HistoryList({ onOpen }: { canSeeAmounts: boolean; onOpen: (id: string) => void }) {
  // لا يوجد API مخصص، نستخدم قائمة الطلبات بحالة rejected/approved/etc ونفترض أن المستخدم الحالي هو الفاعل.
  // الحل البديل: عرض الطلبات التي تظهر في سجل النشاط الخاص بالمستخدم — لكن نعرض هنا أحدث الطلبات
  const { data, isLoading } = useQuery({
    queryKey: ["approvals", "history"],
    queryFn: () => apiFetch<{ items: ApprovalItem[]; total: number }>(`/api/requests?status=approved,forwarded_accountant,in_execution,fully_executed,closed,rejected,needs_completion&pageSize=30`),
  });

  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="لا يوجد سجل بعد"
        description="ستظهر هنا الطلبات التي أنجزت عليها إجراءات."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((r) => (
        <button
          key={r.id}
          onClick={() => onOpen(r.id)}
          className="w-full text-right p-3 rounded-lg border hover:bg-accent transition flex items-center gap-3"
        >
          <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-primary nums">{requestNumber(r.number)}</span>
              <StatusBadge
                label={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.label ?? r.status}
                color={REQUEST_STATUSES[r.status as keyof typeof REQUEST_STATUSES]?.color ?? "slate"}
              />
            </div>
            <div className="text-sm font-medium line-clamp-1">{r.title}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {r.createdBy.name} • {relativeTime(r.createdAt)}
            </div>
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}
