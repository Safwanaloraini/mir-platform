"use client";

import { useState, useMemo } from "react";
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
  Alert, AlertDescription, AlertTitle,
} from "@/components/ui/alert";
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
  ClipboardCheck, Sparkles, AlertTriangle, Info,
} from "lucide-react";

interface ChecklistRow {
  id: string;
  text: string;
  required: boolean;
}

const SERIOUS_TYPES = ["operational", "financial", "administrative", "followup"];

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
    definitionOfDone: "",
    storyPoints: "",
    waitingReason: "",
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

  // V1: التحقق للمهام الجدية
  const isSeriousType = SERIOUS_TYPES.includes(form.type);

  // فحص الأخطاء (لا يمنع، فقط للعرض)
  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!form.title.trim()) errs.push("العنوان مطلوب");
    if (isSeriousType) {
      if (form.assigneeIds.length === 0) errs.push("المسؤول الرئيسي مطلوب للمهام الجدية");
      if (!form.priority) errs.push("الأولوية مطلوبة للمهام الجدية");
      if (!form.dueDate) errs.push("الموعد النهائي مطلوب للمهام الجدية");
    }
    return errs;
  }, [form.title, isSeriousType, form.assigneeIds, form.priority, form.dueDate]);

  // فحص التحذيرات (لا يمنع)
  const warnings = useMemo(() => {
    const ws: string[] = [];
    if (!form.description.trim() && !form.definitionOfDone.trim()) {
      ws.push("يُنصح بتعبئة الوصف أو معيار الإنجاز لتجنب الغموض");
    }
    return ws;
  }, [form.description, form.definitionOfDone]);

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
    if (errors.length > 0) {
      toast({
        title: "تعذّر الإنشاء — الحقول التالية ناقصة",
        description: errors.join("، "),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        definitionOfDone: form.definitionOfDone.trim() || null,
        storyPoints: form.storyPoints === "" ? null : Number(form.storyPoints),
        waitingReason: form.waitingReason.trim() || null,
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
      const created = await apiFetch<{ id: string }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "تم إنشاء المهمة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["mywork"] });
      queryClient.invalidateQueries({ queryKey: ["kanban"] });
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

          {/* V1: معيار الإنجاز */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <Label className="mb-0">معيار الإنجاز (DoD)</Label>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">اختياري لكن مُوصى به</Badge>
            </div>
            <Textarea
              className="mt-1"
              rows={3}
              value={form.definitionOfDone}
              onChange={(e) => setForm({ ...form, definitionOfDone: e.target.value })}
              placeholder="متى تُعتبر المهمة مكتملة؟ مثال:&#10;- التقرير معتمد من المدير&#10;- الأرقام متطابقة مع النظام المالي"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              وضوح معيار الإنجاز يقلّل الجدل حول الاكتمال ويسرّع الاعتماد.
            </p>
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
            {isSeriousType && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> هذا النوع يتطلب مسؤولًا وأولوية وموعدًا
              </p>
            )}
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
            <Label>الأولوية {isSeriousType && "*"}</Label>
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
          <div className="flex items-center justify-between mb-1">
            <Label>المسؤولون {isSeriousType && "*"}</Label>
            <span className="text-[11px] text-muted-foreground">المسؤول الرئيسي = أول مسند (يمكن تغييره لاحقًا)</span>
          </div>
          {isSeriousType && form.assigneeIds.length === 0 && (
            <Alert className="mb-2 py-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
              <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                هذا النوع من المهام يتطلب إسناد مسؤول واحد على الأقل قبل الإنشاء.
              </AlertDescription>
            </Alert>
          )}
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
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm({ ...form, mainAssigneeId: u.id })} aria-label="تعيين كمسؤول رئيسي">
                      <Star className={`h-4 w-4 ${isMain ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* التواريخ والجهد */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>تاريخ البدء</Label>
            <Input type="date" className="mt-1 nums" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <Label>الموعد النهائي {isSeriousType && "*"}</Label>
            <Input type="date" className="mt-1 nums" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            {isSeriousType && !form.dueDate && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">مطلوب للمهام الجدية</p>
            )}
          </div>
          <div>
            <Label>الساعات المقدّرة</Label>
            <Input type="number" className="mt-1 nums" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value as any })} placeholder="مثال: 8" />
          </div>
          <div>
            <Label>نقاط القصة (Story Points)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              className="mt-1 nums"
              value={form.storyPoints}
              onChange={(e) => setForm({ ...form, storyPoints: e.target.value as any })}
              placeholder="مثال: 3، 5، 8"
            />
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> بديل للساعات المقدّرة (طريقة أجايل)
            </p>
          </div>
        </div>

        {/* V1: سبب الانتظار (يُستخدم لاحقًا إذا بدأت بحالة awaiting_info) */}
        <div>
          <Label>سبب الانتظار (اختياري)</Label>
          <Input
            className="mt-1"
            value={form.waitingReason}
            onChange={(e) => setForm({ ...form, waitingReason: e.target.value })}
            placeholder="يُستخدم لاحقًا عند تحويل المهمة لحالة بانتظار معلومات"
          />
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Info className="h-3 w-3" /> لا يؤثر في الإنشاء — يُحفظ لاستخدامه في تغيير الحالة لاحقًا
          </p>
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
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeChecklistRow(row.id)} aria-label="حذف">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* تنبيهات التحقق */}
        {warnings.length > 0 && errors.length === 0 && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">تنبيه</AlertTitle>
            <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
              {warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </AlertDescription>
          </Alert>
        )}
        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>حقول ناقصة</AlertTitle>
            <AlertDescription className="text-xs">
              {errors.map((e, i) => <div key={i}>• {e}</div>)}
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* أزرار الإجراء */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setView("tasks")}>إلغاء</Button>
          <Button
            onClick={submit}
            disabled={submitting || errors.length > 0}
            className="bg-primary hover:bg-primary/90 gap-1.5"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {submitting ? "جارٍ الإنشاء…" : "إنشاء المهمة"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
