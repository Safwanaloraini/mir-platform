"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, EmptyState, SectionCard } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { formatDateTime, formatDate, taskNumber } from "@/lib/constants";
import { toast } from "sonner";
import {
  Plus, Users, Calendar, MapPin, Link2, ChevronDown, Check, Search, Loader2,
  Gavel, ClipboardList, ArrowRight, X,
} from "lucide-react";

interface MeetingListItem {
  id: string;
  title: string;
  date: string;
  location?: string | null;
  linkUrl?: string | null;
  nextMeeting?: string | null;
  organizerId: string;
  organizer: { id: string; name: string; jobTitle?: string | null };
  attendees: { id: string; user: { id: string; name: string } }[];
  _count: { decisions: number; tasks: number };
}

interface MetaUser {
  id: string;
  name: string;
  jobTitle?: string | null;
  role: string;
  department?: { name: string } | null;
  departmentId?: string | null;
}

export function MeetingsView({ user }: { user: CurrentUser }) {
  const { setView, params, openDetail } = useNav();
  const qc = useQueryClient();
  const canCreate = canClient(user, "meeting.create");

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [attendedOnly, setAttendedOnly] = useState(false);

  // فتح نافذة الإنشاء تلقائيًا عند الطلب عبر params.action==="new"
  // نُهيّئ الحالة مرة واحدة فقط عند التركيب تجنّبًا لإعادة الرسم المتسلسلة.
  const [createOpen, setCreateOpen] = useState(() => params.action === "new" && canClient(user, "meeting.create"));
  const [dialogKey, setDialogKey] = useState(0);

  function handleOpenCreate() {
    setDialogKey((k) => k + 1);
    setCreateOpen(true);
  }

  const queryKey = ["meetings", { search, dateFrom, dateTo, attendedOnly }];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (attendedOnly) {
        p.set("attendeeId", "me");
        if (attendedOnly) p.set("attendedOnly", "false");
      }
      return apiFetch<{ items: MeetingListItem[]; total: number }>(`/api/meetings?${p.toString()}`);
    },
  });

  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<{ users: MetaUser[] }>("/api/meta"),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/api/meetings", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم إنشاء الاجتماع بنجاح");
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "فشل إنشاء الاجتماع"),
  });

  const items = data?.items ?? [];
  const now = new Date();

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="الاجتماعات والقرارات"
        subtitle="إدارة الاجتماعات وتوثيق القرارات وتحويلها إلى مهام"
        actions={
          canCreate ? (
            <Button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Plus className="h-4 w-4" /> اجتماع جديد
            </Button>
          ) : undefined
        }
      />

      {/* الفلاتر */}
      <SectionCard>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1">
            <Label className="text-xs mb-1 block">بحث</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="عنوان أو مكان أو جدول الأعمال..."
                className="pr-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <div>
              <Label className="text-xs mb-1 block">من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" />
            </div>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch id="attendedOnly" checked={attendedOnly} onCheckedChange={setAttendedOnly} />
            <Label htmlFor="attendedOnly" className="text-sm cursor-pointer">حضرتها</Label>
          </div>
        </div>
      </SectionCard>

      {/* قائمة الاجتماعات */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="لا توجد اجتماعات"
          description="ابدأ بإنشاء أول اجتماع لتوثيق القرارات وتتبع تنفيذها."
          action={canCreate ? (
            <Button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Plus className="h-4 w-4" /> اجتماع جديد
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((m) => {
            const isUpcoming = new Date(m.date) >= now;
            return (
              <button
                key={m.id}
                onClick={() => openDetail("meeting-detail", m.id)}
                className="w-full text-right p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:shadow-sm transition group"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isUpcoming ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-foreground line-clamp-1">{m.title}</h3>
                        {isUpcoming && <Badge className="bg-primary/10 text-primary border-primary/20">قادم</Badge>}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1 nums">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDateTime(m.date)}
                        </span>
                        {m.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {m.location}
                          </span>
                        )}
                        {m.linkUrl && (
                          <span className="flex items-center gap-1 text-primary">
                            <Link2 className="h-3.5 w-3.5" /> رابط
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 lg:gap-5 text-xs shrink-0">
                    <div className="text-center">
                      <div className="text-muted-foreground mb-0.5">المنظِّم</div>
                      <div className="font-medium">{m.organizer.name}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground mb-0.5">الحضور</div>
                      <div className="font-bold nums flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {m.attendees.length}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground mb-0.5">القرارات</div>
                      <div className="font-bold nums flex items-center gap-1">
                        <Gavel className="h-3.5 w-3.5" />
                        {m._count.decisions}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground mb-0.5">المهام</div>
                      <div className="font-bold nums flex items-center gap-1">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {m._count.tasks}
                      </div>
                    </div>
                    {m.nextMeeting && (
                      <div className="text-center hidden xl:block">
                        <div className="text-muted-foreground mb-0.5">الاجتماع القادم</div>
                        <div className="font-medium nums">{formatDate(m.nextMeeting)}</div>
                      </div>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* نافذة إنشاء اجتماع */}
      <CreateMeetingDialog
        key={dialogKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={meta.data?.users ?? []}
        usersLoading={meta.isLoading}
        onSubmit={(payload) => createMutation.mutate(payload)}
        submitting={createMutation.isPending}
        currentUserId={user.id}
      />
    </div>
  );
}

// ============ نافذة إنشاء اجتماع ============

function CreateMeetingDialog({
  open, onOpenChange, users, usersLoading, onSubmit, submitting, currentUserId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: MetaUser[];
  usersLoading: boolean;
  onSubmit: (payload: any) => void;
  submitting: boolean;
  currentUserId: string;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [agenda, setAgenda] = useState("");
  const [minutes, setMinutes] = useState("");
  const [nextMeeting, setNextMeeting] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");

  // الحالة تُعاد ضبطها تلقائيًا عند كل فتح لأن المكوّن يُعاد تركيبه عبر `key` من الأب.

  const toggle = (id: string) => {
    setAttendeeIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const filteredUsers = users.filter((u) => u.id !== currentUserId && (
    !userSearch || u.name.includes(userSearch) || (u.jobTitle ?? "").includes(userSearch)
  ));

  function handleSubmit() {
    if (!title.trim() || !date) return;
    onSubmit({
      title: title.trim(),
      date,
      location: location.trim() || undefined,
      linkUrl: linkUrl.trim() || undefined,
      agenda: agenda.trim() || undefined,
      minutes: minutes.trim() || undefined,
      nextMeeting: nextMeeting || undefined,
      attendeeIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>اجتماع جديد</DialogTitle>
          <DialogDescription>أنشئ اجتماعًا وادعُ المشاركين ووثّق جدول الأعمال.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">العنوان *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: اجتماع مراجعة أداء الربع الأول" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">التاريخ والوقت *</Label>
              <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">موعد الاجتماع القادم</Label>
              <Input type="datetime-local" value={nextMeeting} onChange={(e) => setNextMeeting(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">المكان</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="قاعة الاجتماعات الرئيسية" />
            </div>
            <div>
              <Label className="mb-1.5 block">رابط الاجتماع (إن وجد)</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." dir="ltr" />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">جدول الأعمال</Label>
            <Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={4} placeholder="بنود جدول الأعمال، كل بند في سطر..." />
          </div>

          <div>
            <Label className="mb-1.5 block">المحضر (ملاحظات أولية)</Label>
            <Textarea value={minutes} onChange={(e) => setMinutes(e.target.value)} rows={3} placeholder="ملاحظات ومحضر الاجتماع..." />
          </div>

          {/* اختيار الحضور */}
          <div>
            <Label className="mb-1.5 block">المدعوون ({attendeeIds.length} مختار)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal" disabled={usersLoading}>
                  {usersLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل...</>
                  ) : attendeeIds.length === 0 ? (
                    "اختر المدعوين..."
                  ) : (
                    <span className="truncate">{attendeeIds.length} مدعو</span>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="بحث عن مدعو..." className="pr-9 h-8" />
                  </div>
                </div>
                <ScrollArea className="h-72">
                  <div className="p-1">
                    {filteredUsers.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">لا يوجد مستخدمون</div>
                    ) : (
                      filteredUsers.map((u) => {
                        const checked = attendeeIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                            onClick={(e) => { e.preventDefault(); toggle(u.id); }}
                          >
                            <Checkbox checked={checked} />
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                                {u.name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{u.name}</div>
                              {u.jobTitle && <div className="text-[11px] text-muted-foreground truncate">{u.jobTitle}</div>}
                            </div>
                            {checked && <Check className="h-4 w-4 text-primary" />}
                          </label>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            {attendeeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {attendeeIds.map((id) => {
                  const u = users.find((x) => x.id === id);
                  if (!u) return null;
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 pl-1 pr-2">
                      {u.name}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggle(id); }}
                        className="hover:bg-background rounded-full p-0.5"
                        aria-label="إزالة"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !date || submitting}
            className="bg-primary hover:bg-primary/90 gap-1.5"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء الاجتماع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
