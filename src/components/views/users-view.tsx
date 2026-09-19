"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StatCard, PageHeader, SectionCard, EmptyState } from "@/components/ui-bits/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Pencil,
  Search,
  Loader2,
  Check,
  X,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { apiFetch, type CurrentUser } from "@/lib/client";
import { ROLES, ROLE_KEYS } from "@/lib/constants";
import { toast } from "sonner";

interface UserItem {
  id: string;
  email: string;
  name: string;
  nameEn?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  role: string;
  status: string;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
}

interface MetaData {
  departments: { id: string; name: string; code?: string | null }[];
}

// الصلاحيات المعروضة في المصفوفة (مفاتيح)
const MATRIX_PERMS: { key: string; label: string }[] = [
  { key: "task.create", label: "إنشاء مهمة" },
  { key: "task.view.all", label: "رؤية كل المهام" },
  { key: "task.assign", label: "إسناد المهام" },
  { key: "task.approve_completion", label: "اعتماد الإنجاز" },
  { key: "request.create", label: "إنشاء طلب" },
  { key: "request.view.all", label: "رؤية كل الطلبات" },
  { key: "request.approve", label: "اعتماد الطلبات" },
  { key: "finance.view", label: "رؤية المالية" },
  { key: "finance.manage", label: "إدارة المالية" },
  { key: "meeting.create", label: "إنشاء اجتماع" },
  { key: "report.view", label: "عرض التقارير" },
  { key: "users.manage", label: "إدارة المستخدمين" },
  { key: "audit.view", label: "عرض التدقيق" },
  { key: "settings.manage", label: "الإعدادات" },
];

const ROLE_PERMS_MATRIX: Record<string, string[]> = {
  ceo: ["task.create","task.view.all","task.assign","task.approve_completion","request.create","request.view.all","request.approve","finance.view","finance.manage","meeting.create","report.view","users.manage","audit.view","settings.manage"],
  ops_manager: ["task.create","task.view.all","task.assign","task.approve_completion","request.create","request.view.all","meeting.create","report.view","audit.view"],
  finance_manager: ["task.create","task.view.all","task.assign","request.create","request.view.all","request.approve","finance.view","finance.manage","meeting.create","report.view","audit.view"],
  accountant: ["task.create","task.view.all","request.view.all","finance.view","finance.manage","report.view","audit.view"],
  employee: ["task.create","report.view"],
};

export function UsersView({ user }: { user: CurrentUser }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);

  const { data: meta } = useQuery<MetaData>({
    queryKey: ["meta"],
    queryFn: () => apiFetch("/api/meta"),
  });

  const qs = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(deptFilter ? { departmentId: deptFilter } : {}),
  }).toString();

  const { data, isLoading } = useQuery<{ items: UserItem[] }>({
    queryKey: ["users", qs],
    queryFn: () => apiFetch(`/api/users?${qs}`),
  });

  const items = data?.items ?? [];
  const total = items.length;
  const activeCount = items.filter((u) => u.status === "active").length;
  const disabledCount = total - activeCount;
  const roleCount = ROLE_KEYS.map((r) => ({ role: r, label: ROLES[r], count: items.filter((u) => u.role === r).length }));

  const createMut = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("تم إنشاء المستخدم بنجاح");
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message || "تعذّر إنشاء المستخدم"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("تم تحديث المستخدم");
      qc.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message || "تعذّر التحديث"),
  });

  const toggleStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذّر التحديث"),
  });

  function openEdit(u: UserItem) {
    setEditing(u);
    setDialogOpen(true);
  }
  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function initials(name: string) {
    return name.split(" ").slice(0, 2).map((p) => p[0]).join("") || "؟";
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="المستخدمون والصلاحيات"
        subtitle="إدارة حسابات المستخدمين والأدوار الوظيفية في المنصة"
        actions={
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-1.5">
            <UserPlus className="h-4 w-4" /> مستخدم جديد
          </Button>
        }
      />

      {/* بطاقات المؤشرات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="إجمالي المستخدمين" value={total} icon={Users} color="primary" />
        <StatCard label="نشطون" value={activeCount} icon={UserCheck} color="green" />
        <StatCard label="معطلون" value={disabledCount} icon={UserX} color="red" />
        <StatCard
          label="أكبر إدارة"
          value={(() => {
            const counts = new Map<string, number>();
            items.forEach((u) => {
              const k = u.department?.name ?? "بدون إدارة";
              counts.set(k, (counts.get(k) ?? 0) + 1);
            });
            const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
            return top ? top[0] : "—";
          })()}
          icon={Building2}
          color="orange"
        />
      </div>

      {/* الفلاتر */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <Label className="mb-1.5 block">بحث</Label>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اسم، بريد، مسمى وظيفي..."
                className="pr-8"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">الدور</Label>
            <Select value={roleFilter || "all"} onValueChange={(v) => setRoleFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="كل الأدوار" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأدوار</SelectItem>
                {ROLE_KEYS.map((r) => (
                  <SelectItem key={r} value={r}>{ROLES[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">الحالة</Label>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="disabled">معطل</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label className="mb-1.5 block">الإدارة</Label>
          <Select value={deptFilter || "all"} onValueChange={(v) => setDeptFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="كل الإدارات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإدارات</SelectItem>
              {(meta?.departments ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* جدول المستخدمين */}
      <Card className="p-0">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={Users} title="لا يوجد مستخدمون" description="جرّب تعديل الفلاتر أو أنشئ مستخدمًا جديدًا." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>البريد</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>المسمى الوظيفي</TableHead>
                <TableHead>الإدارة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.name}</div>
                        {u.nameEn && <div className="text-[10px] text-muted-foreground nums truncate" dir="ltr">{u.nameEn}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs nums" dir="ltr">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">{ROLES[u.role as keyof typeof ROLES] ?? u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{u.jobTitle ?? "—"}</TableCell>
                  <TableCell className="text-xs">{u.department?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={u.status === "active" ? "نشط" : "معطل"}
                      color={u.status === "active" ? "green" : "red"}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {u.status === "active" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-red-600 hover:text-red-700"
                          disabled={u.id === user.id || toggleStatusMut.isPending}
                          onClick={() => toggleStatusMut.mutate({ id: u.id, status: "disabled" })}
                        >
                          <UserX className="h-3.5 w-3.5" /> تعطيل
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-green-600 hover:text-green-700"
                          disabled={toggleStatusMut.isPending}
                          onClick={() => toggleStatusMut.mutate({ id: u.id, status: "active" })}
                        >
                          <UserCheck className="h-3.5 w-3.5" /> تفعيل
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* مصفوفة الصلاحيات */}
      <SectionCard title="الأدوار والصلاحيات" action={<Badge variant="outline" className="text-[10px] gap-1"><ShieldCheck className="h-3 w-3" /> قاعدة بيانات نظام RBAC</Badge>}>
        <p className="text-xs text-muted-foreground mb-3">
          هذه مصفوفة الصلاحيات الافتراضية المعرّفة على مستوى النظام (RBAC). الصلاحيات تُطبَّق على مستوى API وتُمنع تلقائيًا للأدوار غير المخوّلة. لا يمكن تعديلها يدويًا — لتفعيل صلاحية إضافية يرجى التواصل مع مدير النظام.
        </p>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="text-right font-medium text-muted-foreground p-2 sticky right-0 bg-background">الدور / الصلاحية</th>
                {MATRIX_PERMS.map((p) => (
                  <th key={p.key} className="p-2 text-center font-medium text-muted-foreground min-w-[90px]">
                    <span className="block leading-tight">{p.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_KEYS.map((r, idx) => (
                <tr key={r} className={idx % 2 === 1 ? "bg-muted/30" : ""}>
                  <td className="p-2 font-bold sticky right-0 bg-inherit">
                    <Badge variant="outline" className="bg-primary/5">{ROLES[r]}</Badge>
                  </td>
                  {MATRIX_PERMS.map((p) => {
                    const allowed = ROLE_PERMS_MATRIX[r]?.includes(p.key) ?? false;
                    return (
                      <td key={p.key} className="p-2 text-center">
                        {allowed ? (
                          <Check className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* توزيع المستخدمين حسب الدور */}
        <div className="mt-5 pt-4 border-t border-border">
          <h4 className="text-sm font-bold mb-2">توزيع المستخدمين حسب الدور</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {roleCount.map((r) => (
              <div key={r.role} className="p-3 rounded-lg border border-border bg-muted/30">
                <div className="text-[10px] text-muted-foreground">{r.label}</div>
                <div className="text-lg font-bold text-foreground nums">{r.count}</div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Dialog: إنشاء/تحرير مستخدم */}
      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        departments={meta?.departments ?? []}
        currentUserId={user.id}
        onSubmit={(body) => {
          if (editing) updateMut.mutate({ id: editing.id, body });
          else createMut.mutate(body);
        }}
        submitting={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: UserItem | null;
  departments: { id: string; name: string; code?: string | null }[];
  currentUserId: string;
  onSubmit: (body: any) => void;
  submitting: boolean;
}

function UserFormDialog({ open, onOpenChange, editing, departments, currentUserId, onSubmit, submitting }: UserFormDialogProps) {
  const isEdit = !!editing;
  // remount via key when target changes so the inner form re-initializes its useState.
  const formKey = `${editing?.id ?? "new"}-${open}`;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "تحرير مستخدم" : "إنشاء مستخدم جديد"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "يمكنك تحديث الحقول الأساسية. كلمة المرور اختيارية عند التحرير."
              : "أدخل بيانات المستخدم الأساسية. سيُنشأ حساب فور الإرسال."}
          </DialogDescription>
        </DialogHeader>
        <UserFormBody
          key={formKey}
          editing={editing}
          departments={departments}
          currentUserId={currentUserId}
          onSubmit={onSubmit}
          submitting={submitting}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function UserFormBody({
  editing,
  departments,
  currentUserId,
  onSubmit,
  submitting,
  onCancel,
}: {
  editing: UserItem | null;
  departments: { id: string; name: string; code?: string | null }[];
  currentUserId: string;
  onSubmit: (body: any) => void;
  submitting: boolean;
  onCancel: () => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(editing?.jobTitle ?? "");
  const [role, setRole] = useState<string>(editing?.role ?? "employee");
  const [departmentId, setDepartmentId] = useState<string>(editing?.departmentId ?? "");
  const [status, setStatus] = useState<string>(editing?.status ?? "active");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: any = {
      name,
      email,
      nameEn: nameEn || undefined,
      phone: phone || undefined,
      jobTitle: jobTitle || undefined,
      role,
      departmentId: departmentId || undefined,
    };
    if (isEdit) {
      body.status = status;
      if (password) body.password = password;
    } else {
      body.password = password;
      body.status = status;
    }
    onSubmit(body);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 block">الاسم *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="مثال: أحمد محمد" />
        </div>
        <div>
          <Label className="mb-1.5 block">الاسم بالإنجليزية</Label>
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder="Ahmed Mohammed" />
        </div>
        <div>
          <Label className="mb-1.5 block">البريد الإلكتروني *</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" placeholder="name@mir.sa" />
        </div>
        <div>
          <Label className="mb-1.5 block">{isEdit ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور *"}</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            placeholder="6 أحرف على الأقل"
            dir="ltr"
          />
        </div>
        <div>
          <Label className="mb-1.5 block">الهاتف</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="05xxxxxxxx" />
        </div>
        <div>
          <Label className="mb-1.5 block">المسمى الوظيفي</Label>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="مثال: محلل أنظمة" />
        </div>
        <div>
          <Label className="mb-1.5 block">الدور *</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_KEYS.map((r) => (
                <SelectItem key={r} value={r}>{ROLES[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">الإدارة</Label>
          <Select value={departmentId || "none"} onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="بدون إدارة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون إدارة</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">الحالة</Label>
          <Select value={status} onValueChange={setStatus} disabled={editing?.id === currentUserId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="disabled">معطل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>إلغاء</Button>
        <Button type="submit" disabled={submitting} className="gap-1.5 bg-primary hover:bg-primary/90">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "حفظ التغييرات" : "إنشاء المستخدم"}
        </Button>
      </DialogFooter>
    </form>
  );
}
