"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/ui-bits/stat-card";
import { StatusBadge } from "@/components/ui-bits/status-badge";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import {
  Plus, Search, Building2, Users, Mail, Phone, Pencil, Archive,
} from "lucide-react";

type VendorRow = {
  id: string; name: string; nameEn?: string | null; kind: "vendor" | "customer";
  type?: string; typeLabel?: string; taxNumber?: string | null;
  email?: string | null; phone?: string | null; active: boolean;
};

type ListResp = { vendors: VendorRow[]; customers: VendorRow[] };

const VENDOR_TYPES = [
  { value: "vendor", label: "مورد عام" },
  { value: "supplier", label: "مورّد توريد" },
  { value: "contractor", label: "مقاول" },
];

export function VendorsView({ user }: { user: CurrentUser }) {
  const canManage = canClient(user, "finance.manage");
  const [tab, setTab] = useState<"vendors" | "customers">("vendors");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<VendorRow | null>(null);

  const qc = useQueryClient();
  const queryKey = ["vendors", search, activeFilter, typeFilter];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (activeFilter) p.set("active", activeFilter);
      if (typeFilter) p.set("type", typeFilter);
      return apiFetch<ListResp>(`/api/vendors?${p.toString()}`);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, active, kind }: { id: string; active: boolean; kind: "vendor" | "customer" }) =>
      apiFetch(`/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ active, kind }) }),
    onSuccess: (_d, vars) => {
      toast.success(vars.active ? "تم إلغاء الأرشفة" : "تمت الأرشفة");
      qc.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e: any) => toast.error(e.message || "فشل"),
  });

  const items = tab === "vendors" ? (data?.vendors || []) : (data?.customers || []);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="الموردون والعملاء"
        subtitle="إدارة الجهات الخارجية للعمليات المالية"
        actions={
          canManage ? (
            <Button className="bg-primary hover:bg-primary/90 gap-1.5" onClick={() => { setEditItem(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" /> {tab === "vendors" ? "مورد جديد" : "عميل جديد"}
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="vendors"><Building2 className="h-4 w-4" /> الموردون</TabsTrigger>
          <TabsTrigger value="customers"><Users className="h-4 w-4" /> العملاء</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">بحث</Label>
                <div className="relative mt-1">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث بالاسم أو الرقم الضريبي أو الهاتف..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-8"
                  />
                </div>
              </div>
              {tab === "vendors" && (
                <div>
                  <Label className="text-xs">النوع</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">الكل</SelectItem>
                      {VENDOR_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">الحالة</Label>
                <Select value={activeFilter} onValueChange={setActiveFilter}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">الكل</SelectItem>
                    <SelectItem value="true">نشط</SelectItem>
                    <SelectItem value="false">مؤرشف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            {isLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : items.length === 0 ? (
              <EmptyState icon={tab === "vendors" ? Building2 : Users} title={tab === "vendors" ? "لا يوجد موردون" : "لا يوجد عملاء"} description="ابدأ بإضافة جهة جديدة" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الرقم الضريبي</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>الحالة</TableHead>
                    {canManage && <TableHead className="text-left">إجراءات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((v) => (
                    <TableRow key={v.id} className={v.active ? "hover:bg-accent/50" : "opacity-60"}>
                      <TableCell>
                        <div className="font-medium">{v.name}</div>
                        {v.nameEn && <div className="text-xs text-muted-foreground">{v.nameEn}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {v.kind === "customer" ? "عميل" : (v.typeLabel ?? v.type ?? "—")}
                      </TableCell>
                      <TableCell className="text-xs nums">{v.taxNumber ?? "—"}</TableCell>
                      <TableCell className="text-xs nums">{v.phone ?? "—"}</TableCell>
                      <TableCell className="text-xs">{v.email ?? "—"}</TableCell>
                      <TableCell>
                        {v.active
                          ? <StatusBadge label="نشط" color="green" />
                          : <StatusBadge label="مؤرشف" color="gray" />}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => { setEditItem(v); setDialogOpen(true); }}
                              className="h-8 w-8 p-0"
                              title="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => archiveMutation.mutate({ id: v.id, active: !v.active, kind: v.kind })}
                              className="h-8 w-8 p-0"
                              title={v.active ? "أرشفة" : "إلغاء الأرشفة"}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {canManage && (
        <VendorFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editItem={editItem}
          kind={tab}
        />
      )}
    </div>
  );
}

function VendorFormDialog({
  open, onOpenChange, editItem, kind,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem: VendorRow | null;
  kind: "vendors" | "customers";
}) {
  // نستخدم key على المكون الابن ليُعاد إنشاؤه عند تغير الهدف
  return (
    <VendorFormInner
      key={editItem?.id ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
      editItem={editItem}
      kind={kind}
    />
  );
}

function VendorFormInner({
  open, onOpenChange, editItem, kind,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem: VendorRow | null;
  kind: "vendors" | "customers";
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(() => ({
    name: editItem?.name ?? "",
    nameEn: editItem?.nameEn ?? "",
    type: editItem?.type ?? "vendor",
    taxNumber: editItem?.taxNumber ?? "",
    email: editItem?.email ?? "",
    phone: editItem?.phone ?? "",
    address: "",
    bankAccount: "",
  }));
  const [saving, setSaving] = useState(false);

  const createMut = useMutation({
    mutationFn: (payload: any) => apiFetch("/api/vendors", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم الإنشاء");
      qc.invalidateQueries({ queryKey: ["vendors"] });
      onOpenChange(false);
      setForm({ name: "", nameEn: "", type: "vendor", taxNumber: "", email: "", phone: "", address: "", bankAccount: "" });
    },
    onError: (e: any) => toast.error(e.message || "فشل"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => apiFetch(`/api/vendors/${editItem!.id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["vendors"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "فشل"),
  });

  const submit = () => {
    if (!form.name.trim()) return toast.error("الاسم مطلوب");
    setSaving(true);
    const payload = {
      kind: kind === "customers" ? "customer" : "vendor",
      name: form.name.trim(),
      nameEn: form.nameEn || undefined,
      ...(kind === "vendors" ? { type: form.type } : {}),
      taxNumber: form.taxNumber || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      bankAccount: form.bankAccount || undefined,
    };
    if (editItem) {
      updateMut.mutate(payload, { onSettled: () => setSaving(false) });
    } else {
      createMut.mutate(payload, { onSettled: () => setSaving(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editItem ? "تعديل" : "إضافة"} {kind === "vendors" ? "مورد" : "عميل"}</DialogTitle>
          <DialogDescription>
            {editItem ? "عدّل بيانات الجهة" : "أدخل بيانات الجهة الجديدة"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">الاسم (عربي) *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">الاسم (إنجليزي)</Label>
            <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className="mt-1" />
          </div>
          {kind === "vendors" && (
            <div className="col-span-2">
              <Label className="text-xs">النوع</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENDOR_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">الرقم الضريبي</Label>
            <Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} className="mt-1 nums" />
          </div>
          <div>
            <Label className="text-xs">الهاتف</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 nums" dir="ltr" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">البريد الإلكتروني</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" dir="ltr" />
          </div>
          {kind === "vendors" && (
            <>
              <div className="col-span-2">
                <Label className="text-xs">العنوان</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">رقم الحساب البنكي</Label>
                <Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} className="mt-1 nums" dir="ltr" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? "جارٍ الحفظ..." : editItem ? "حفظ التعديلات" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
