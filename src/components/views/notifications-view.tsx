"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/ui-bits/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  FileText,
  MessageCircle,
  AtSign,
  Paperclip,
  PauseCircle,
  Banknote,
  TrendingUp,
  ArrowLeftRight,
  RotateCcw,
  ScrollText,
  Loader2,
  BellOff,
} from "lucide-react";
import { useNav } from "@/lib/store";
import { apiFetch, type CurrentUser } from "@/lib/client";
import { NOTIFICATION_TYPES } from "@/lib/constants";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

const TYPE_ICON: Record<string, LucideIcon> = {
  task_assigned: CheckCircle2,
  status_change: ArrowLeftRight,
  due_soon: Clock,
  overdue: Flame,
  approval_required: FileText,
  approved: CheckCircle2,
  rejected: AlertTriangle,
  returned: RotateCcw,
  comment: MessageCircle,
  mention: AtSign,
  attachment_missing: Paperclip,
  stalled: PauseCircle,
  payment_done: Banknote,
  budget_exceeded: TrendingUp,
  decision_converted: ScrollText,
};

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string;
  createdAtISO?: string;
  actor?: { id: string; name: string } | null;
  entityType?: string | null;
  entityId?: string | null;
}

export function NotificationsView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("filter") === "unread" ? "unread" : "all";
  });

  const { data, isLoading } = useQuery<{ items: NotificationItem[] }>({
    queryKey: ["notifications", "list"],
    queryFn: () => apiFetch("/api/notifications?limit=200"),
  });

  const items = data?.items ?? [];
  const visible = filter === "unread" ? items.filter((n) => !n.read) : items;
  const unreadCount = items.filter((n) => !n.read).length;

  const markReadMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: "POST" }),
    onMutate(id) {
      qc.setQueryData<{ items: NotificationItem[] }>(["notifications", "list"], (old) => {
        if (!old) return old;
        return { items: old.items.map((n) => (n.id === id ? { ...n, read: true } : n)) };
      });
    },
    onError: () => toast.error("تعذّر تحديث الإشعار"),
  });

  const readAllMut = useMutation({
    mutationFn: () => apiFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: (d: any) => {
      toast.success(`تم تحديد ${d?.count ?? 0} إشعار كمقروء`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("تعذّر التحديث"),
  });

  function handleClick(n: NotificationItem) {
    if (!n.read) markReadMut.mutate(n.id);
    if (n.link) setView(n.link as any, n.entityId ? { id: n.entityId } : undefined);
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="مركز الإشعارات"
        subtitle={`${unreadCount} إشعار غير مقروء من إجمالي ${items.length}`}
        actions={
          unreadCount > 0 ? (
            <Button
              onClick={() => readAllMut.mutate()}
              disabled={readAllMut.isPending}
              variant="outline"
              className="gap-1.5"
            >
              {readAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              تحديد الكل كمقروء
            </Button>
          ) : undefined
        }
      />

      <Tabs value={filter} onValueChange={(v) => { setFilter(v as "all" | "unread"); updateUrl(v as "all" | "unread"); }}>
        <TabsList>
          <TabsTrigger value="all">
            <Bell className="h-3.5 w-3.5" /> الكل
            <span className="text-xs text-muted-foreground nums mr-1">({items.length})</span>
          </TabsTrigger>
          <TabsTrigger value="unread">
            غير المقروء
            <span className="text-xs text-muted-foreground nums mr-1">({unreadCount})</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          {isLoading ? (
            <NotificationsSkeleton />
          ) : visible.length === 0 ? (
            <Card className="p-0">
              <EmptyState
                icon={BellOff}
                title={filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"}
                description="ستظهر هنا التنبيهات الجديدة عند إسناد مهام أو تحديث طلبات أو مناداتك في تعليقات النظام."
              />
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <ScrollArea className="max-h-[70vh]">
                <ul className="divide-y divide-border">
                  {visible.map((n) => {
                    const Icon = TYPE_ICON[n.type] ?? Bell;
                    const typeLabel = NOTIFICATION_TYPES[n.type as keyof typeof NOTIFICATION_TYPES] ?? n.type;
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => handleClick(n)}
                          className={`w-full text-right px-4 py-3.5 flex items-start gap-3 hover:bg-accent/60 transition ${
                            !n.read ? "bg-orange-50/60 dark:bg-orange-950/15" : ""
                          }`}
                        >
                          <div
                            className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                              !n.read
                                ? "bg-[#ff7f32]/15 text-[#ff7f32]"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-semibold text-foreground line-clamp-1">{n.title}</div>
                              {!n.read && <span className="h-2 w-2 rounded-full bg-[#ff7f32] shrink-0 mt-1.5" />}
                            </div>
                            {n.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="outline" className="text-[10px] font-medium">{typeLabel}</Badge>
                              {n.actor && (
                                <span className="text-[10px] text-muted-foreground">من {n.actor.name}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground/70 nums mr-auto">{n.createdAt}</span>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            </Card>
          )}
        </div>
      </Tabs>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <Card className="p-0 overflow-hidden">
      <ul className="divide-y divide-border">
        {[...Array(5)].map((_, i) => (
          <li key={i} className="px-4 py-3.5 flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 bg-muted animate-pulse rounded" />
              <div className="h-2.5 w-1/2 bg-muted animate-pulse rounded" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function updateUrl(filter: "all" | "unread") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (filter === "all") url.searchParams.delete("filter");
  else url.searchParams.set("filter", filter);
  window.history.replaceState({}, "", url);
}
