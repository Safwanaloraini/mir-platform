"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import {
  Save,
  Loader2,
  Mail,
  Phone,
  Briefcase,
  Building2,
  KeyRound,
  ShieldCheck,
  History,
  User,
  Eye,
  EyeOff,
} from "lucide-react";
import { apiFetch, type CurrentUser } from "@/lib/client";
import { ROLES, formatDateTime, relativeTime } from "@/lib/constants";
import { toast } from "sonner";

interface ProfileUser {
  id: string;
  name: string;
  nameEn?: string | null;
  email: string;
  role: string;
  phone?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  status: string;
  department?: { id: string; name: string } | null;
}

interface AuditItem {
  id: string;
  action: string;
  entityType?: string | null;
  summary: string;
  createdAt: string;
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  create: "إنشاء",
  update: "تحديث",
  delete: "حذف",
  archive: "أرشفة",
  approve: "اعتماد",
  reject: "رفض",
  status_change: "تغيير حالة",
  permission_change: "تغيير صلاحية",
  export: "تصدير",
  settings_change: "تغيير إعداد",
};

export function ProfileView({ user }: { user: CurrentUser }) {
  const { data: profile, isLoading } = useQuery<{ user: ProfileUser }>({
    queryKey: ["profile", user.id],
    queryFn: () => apiFetch(`/api/users/${user.id}`),
  });

  function initials(name: string) {
    return name.split(" ").slice(0, 2).map((p) => p[0]).join("") || "؟";
  }

  if (isLoading || !profile) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  const u = profile.user;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader title="ملفي الشخصي" subtitle="بياناتك الأساسية وتفضيلات الحساب" />

      {/* بطاقة البيانات */}
      <Card className="p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="h-20 w-20 border-2 border-primary/20">
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-black">
              {initials(u.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-foreground">{u.name}</h2>
            {u.nameEn && <div className="text-sm text-muted-foreground nums" dir="ltr">{u.nameEn}</div>}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="outline" className="gap-1"><User className="h-3 w-3" />{ROLES[u.role as keyof typeof ROLES] ?? u.role}</Badge>
              {u.jobTitle && <Badge variant="outline" className="gap-1"><Briefcase className="h-3 w-3" />{u.jobTitle}</Badge>}
              {u.department && <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{u.department.name}</Badge>}
              <StatusBadge label={u.status === "active" ? "نشط" : "معطل"} color={u.status === "active" ? "green" : "red"} />
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-5 pt-5 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">البريد:</span>
            <span className="font-medium nums" dir="ltr">{u.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">الهاتف:</span>
            <span className="font-medium nums" dir="ltr">{u.phone ?? "—"}</span>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* تعديل البيانات */}
        <ProfileEditForm user={u} />

        {/* تغيير كلمة المرور */}
        <ChangePasswordCard />
      </div>

      {/* نشاطي الأخير */}
      <RecentActivityCard userId={user.id} />
    </div>
  );
}

function ProfileEditForm({ user: u }: { user: ProfileUser }) {
  const qc = useQueryClient();
  const [name, setName] = useState(u.name);
  const [nameEn, setNameEn] = useState(u.nameEn ?? "");
  const [phone, setPhone] = useState(u.phone ?? "");
  const [jobTitle, setJobTitle] = useState(u.jobTitle ?? "");
  const [avatarUrl, setAvatarUrl] = useState(u.avatarUrl ?? "");

  const updateMut = useMutation({
    mutationFn: (body: any) =>
      apiFetch(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("تم حفظ بياناتك");
      qc.invalidateQueries({ queryKey: ["profile", u.id] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذّر الحفظ"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMut.mutate({
      name,
      nameEn: nameEn || null,
      phone: phone || null,
      jobTitle: jobTitle || null,
      avatarUrl: avatarUrl || null,
    });
  }

  return (
    <SectionCard title="تعديل البيانات" className="lg:col-span-2">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">الاسم *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label className="mb-1.5 block">الاسم بالإنجليزية</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label className="mb-1.5 block">الهاتف</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="05xxxxxxxx" />
          </div>
          <div>
            <Label className="mb-1.5 block">المسمى الوظيفي</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">رابط الصورة (URL)</Label>
            <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} dir="ltr" placeholder="https://..." />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMut.isPending} className="gap-1.5 bg-primary hover:bg-primary/90">
            {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ البيانات
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const mut = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/api/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور بنجاح");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e: any) => toast.error(e.message || "تعذّر تغيير كلمة المرور"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    if (next.length < 6) {
      toast.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    mut.mutate({ currentPassword: current, newPassword: next });
  }

  return (
    <SectionCard title="تغيير كلمة المرور" action={<Badge variant="outline" className="text-[10px] gap-1"><ShieldCheck className="h-3 w-3" /> الأمان</Badge>}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label className="mb-1.5 block">كلمة المرور الحالية</Label>
          <div className="relative">
            <Input
              type={showCur ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              dir="ltr"
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowCur(!showCur)}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">كلمة المرور الجديدة</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              dir="ltr"
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">تأكيد كلمة المرور الجديدة</Label>
          <Input
            type={showNew ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            dir="ltr"
          />
        </div>
        <Button type="submit" disabled={mut.isPending} variant="outline" className="w-full gap-1.5">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          تحديث كلمة المرور
        </Button>
      </form>
    </SectionCard>
  );
}

function RecentActivityCard({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<{ items: AuditItem[] }>({
    queryKey: ["my-audit", userId],
    queryFn: () => apiFetch(`/api/audit?userId=me&limit=8`),
  });

  const items = data?.items ?? [];

  return (
    <SectionCard title="نشاطي الأخير" action={<Badge variant="outline" className="text-[10px] gap-1"><History className="h-3 w-3" /> آخر 8 عمليات</Badge>}>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={History} title="لا يوجد نشاط" description="ستظهر هنا آخر العمليات التي قمت بها في النظام." />
      ) : (
        <ul className="space-y-2.5">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold">{AUDIT_ACTION_LABEL[a.action]?.[0] ?? "•"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-medium">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span>
                  <span className="text-muted-foreground"> — {a.summary}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5" title={formatDateTime(a.createdAt)}>
                  {relativeTime(a.createdAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
