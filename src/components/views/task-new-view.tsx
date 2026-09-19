"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui-bits/stat-card";
import { useNav } from "@/lib/store";
import { apiFetch, canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { TASK_TYPES, TASK_SOURCES, TASK_PRIORITIES } from "@/lib/constants";
import {
  ArrowRight, Plus, X, ListChecks, Star, Save, Loader2, ClipboardList,
} from "lucide-react";

interface ChecklistRow {
  id: string;
  text: string;
  required: boolean;
}

export function TaskNewView({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<any>("/api/meta"),
  });
  const { data: parentTasks } = useQuery({
    queryKey: ["parent-tasks"],
    queryFn: () => apiFetch<{ items: any[] }>("/api/tasks?pageSize=50"),
  });

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "operational",
    source: "independent",
    priority: "medium",
    departmentId: "",
    projectId: "",
    costCenterId: "",
    parentId: "",
    assigneeIds: [] as string[],
    mainAssigneeId: "",
    startDate: "",
    dueDate: "",
    estimatedHours: "",
    tags: "",
    isRecurring: false,
    recurrence: "",
  });
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);

  const canSeeFinance = canClient(user, "finance.view");

  const toggleAssignee = (uid: string) => {
    setForm((f) => {
      const has = f.assigneeIds.includes(uid);
      const next = has ? f.assigneeIds.filter((x) => x !== uid) : [...f.assigneeIds, uid];
      const nextMain = has && f.mainAssigneeId === uid ? "" : f.mainAssigneeId;
      return { ...f, assigneeIds: next, mainAssigneeId: nextMain || next[0] || "" };
    });
  };

  const addChecklistRow = () => {
    setChecklist((c) => [...c, { id: crypto.randomUUID(), text: "", required: false }]);
  };
  const updateChecklistRow = (id: string, patch: Partial<ChecklistRow>) => {
    setChecklist((c) => c.map((r) => r.id === id ? { ...r, ...patch } : r));
  };
  const removeChecklistRow = (id: string) => {
    setChecklist((c) => c.filter((r) => r.id !== id));
  };

  const submit = async () => {
    if (!form.title.trim()) {
      toast({ title: "عنوان المهمة مطلوب", variant: "destructive" });
      return;
    }
    if (form.assigneeIds.length === 0) {
      // تحذير، لا منع
      toast({ title: "تنبيه: لم تختر أي مسؤول", description: "يمكن المتابعة لكن يُفضّل إسناد المهمة" });
    }
    setSubmitting(true);
    try {
      const body: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        source: form.source,
        priority: form.priority,
        departmentId: form.departmentId || null,
        projectId: form.projectId || null,
        costCenterId: form.costCenterId || null,
        parentId: form.parentId || null,
        assigneeIds: form.assigneeIds,
        mainAssigneeId: form.mainAssigneeId || (form.assigneeIds[0] ?? null),
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        estimatedHours: form.estimatedHours === "" ? null : Number(form.estimatedHours),
        tags: form.tags.trim() || null,
        isRecurring: form.isRecurring,
        recurrence: form.isRecurring ? form.recurrence : null,
        checklist: checklist.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), required: c.required })),
      };
      const created = await apiFetch<any>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "تم إنشاء المهمة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["mywork"] });
      setView("task-detail", { id: created.id });
    } catch (e: any) {
      toast({ title: "تعذّر إنشاء المهمة", description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => setView("tasks")} className="gap-1.5 text-muted-foreground">
        <ArrowRight className="h-4 w-4" /> إلغاء والعودة
      </Button>

      <PageHeader title="مهمة جديدة" subtitle="أنشئ مهمة جديدة وأسندها للفريق" />

      <Card className="p-4 lg:p-6 space-y-4">
        {/* العنوان والوصف */}
        <div className="space-y-3">
          <div>
            <Label>عنوان المهمة *</Label>
            <Input
              className="mt-1 text-base font-medium"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="مثال: إعداد تقرير المبيعات الشهري"
              autoFocus
            />
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea
              className="mt-1"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="اشرح المهمة، الأهداف، والسياق…"
            />
          </div>
        </div>

        <Separator />

        {/* التصنيف */}
        <div className="grid sm:grid-cols-3 gap-3">
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
        </div>

        <Separator />

        {/* التصنيف الإداري */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>الإدارة</Label>
            <Select value={form.departmentId || "NONE"} onValueChange={(v) => setForm({ ...form, departmentId: v === "NONE" ? "" : v })}>
              <SelectTrigger className="w-full mt-1"><SelectValue placeholder="اختر الإدارة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— بدون —</SelectItem>
                {(meta?.departments ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>المشروع</Label>
            <Select value={form.projectId || "NONE"} onValueChange={(v) => setForm({ ...form, projectId: v === "NONE" ? "" : v })}>
              <SelectTrigger className="w-full mt-1"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— بدون —</SelectItem>
                {(meta?.projects ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {canSeeFinance && (
            <div>
              <Label>مركز التكلفة</Label>
              <Select value={form.costCenterId || "NONE"} onValueChange={(v) => setForm({ ...form, costCenterId: v === "NONE" ? "" : v })}>
                <SelectTrigger className="w-full mt-1"><SelectValue placeholder="اختر مركز التكلفة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— بدون —</SelectItem>
                  {(meta?.costCenters ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>مهمة أم (اختياري)</Label>
            <Select value={form.parentId || "NONE"} onValueChange={(v) => setForm({ ...form, parentId: v === "NONE" ? "" : v })}>
              <SelectTrigger className="w-full mt-1"><SelectValue placeholder="اختر المهمة الأم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— بدون —</SelectItem>
                {(parentTasks?.items ?? []).slice(0, 30).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>م-{String(t.number).padStart(4, "0")} — {t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* المسؤولون */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>المسؤولون</Label>
            <span className="text-xs text-muted-foreground">المحدد بنجمة ★ هو الرئيسي</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto scrollbar-mir p-1">
            {(meta?.users ?? []).map((u: any) => {
              const checked = form.assigneeIds.includes(u.id);
              const isMain = form.mainAssigneeId === u.id;
              return (
                <div key={u.id} className={`flex items-center gap-2 p-2 rounded-lg border ${checked ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Checkbox checked={checked} onCheckedChange={() => toggleAssignee(u.id)} />
                  <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px] bg-primary/10 text-primary">{u.name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-1">{u.name}</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">{u.jobTitle ?? u.department?.name ?? "—"}</div>
                  </div>
                  {checked && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm({ ...form, mainAssigneeId: u.id })}>
                      <Star className={`h-4 w-4 ${isMain ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* التواريخ */}
        <div className="grid sm:grid-cols-3 gap-3">
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
            <Input type="number" className="mt-1 nums" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value as any })} placeholder="مثال: 8" />
          </div>
        </div>

        <Separator />

        {/* الوسوم */}
        <div>
          <Label>الوسوم</Label>
          <Input
            className="mt-1"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="مفصولة بفواصل، مثال: تسويق, حملة_رمضان"
          />
        </div>

        {/* التكرار */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
          <Switch checked={form.isRecurring} onCheckedChange={(v) => setForm({ ...form, isRecurring: v })} />
          <div className="flex-1">
            <Label>مهمة متكررة</Label>
            <div className="text-xs text-muted-foreground">تكرار دوري للمهمة</div>
          </div>
          {form.isRecurring && (
            <Select value={form.recurrence || "weekly"} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
              <SelectTrigger className="w-32"><SelectValue placeholder="التكرار" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">يومي</SelectItem>
                <SelectItem value="weekly">أسبوعي</SelectItem>
                <SelectItem value="monthly">شهري</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <Separator />

        {/* قائمة التحقق */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> قائمة التحقق (اختياري)</Label>
            <Button variant="outline" size="sm" onClick={addChecklistRow} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> إضافة عنصر
            </Button>
          </div>
          {checklist.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 text-center bg-muted/30 rounded-lg border border-dashed border-border">
              لا توجد عناصر. أضف عنصرًا لتحديد خطوات الإنجاز المطلوبة.
            </div>
          ) : (
            <div className="space-y-2">
              {checklist.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    value={row.text}
                    onChange={(e) => updateChecklistRow(row.id, { text: e.target.value })}
                    placeholder="نص عنصر التحقق…"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 cursor-pointer">
                    <Checkbox checked={row.required} onCheckedChange={(v) => updateChecklistRow(row.id, { required: !!v })} />
                    إلزامي
                  </label>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeChecklistRow(row.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* أزرار الإجراء */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setView("tasks")}>إلغاء</Button>
          <Button onClick={submit} disabled={submitting || !form.title.trim()} className="bg-primary hover:bg-primary/90 gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {submitting ? "جارٍ الإنشاء…" : "إنشاء المهمة"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
