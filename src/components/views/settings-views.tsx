"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, SectionCard } from "@/components/ui-bits/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Save,
  Loader2,
  Building2,
  Coins,
  Workflow,
  Bell,
  AlertTriangle,
  Clock,
  TrendingUp,
  Info,
} from "lucide-react";
import { apiFetch, type CurrentUser } from "@/lib/client";
import { ROLES, formatCurrency } from "@/lib/constants";
import { toast } from "sonner";

interface SettingItem {
  id: string;
  key: string;
  value: string;
  category: string;
  description?: string | null;
}

interface SettingsGroup {
  general: SettingItem[];
  approval: SettingItem[];
  escalation: SettingItem[];
  notification: SettingItem[];
}

interface ApprovalStep {
  id: string;
  order: number;
  approverRole: string;
  approverUserId?: string | null;
  approverLabel?: string | null;
  isFinal: boolean;
}

interface ApprovalWorkflow {
  id: string;
  name: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  active: boolean;
  requestType?: { id: string; nameAr: string; code: string } | null;
  steps: ApprovalStep[];
}

interface MetaData {
  approvalWorkflows: ApprovalWorkflow[];
}

export function SettingsGeneralView({ user }: { user: CurrentUser }) {
  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="الإعدادات"
        subtitle="إعدادات النظام العامة ومسارات الاعتماد والتنبيهات"
      />
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="general" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> عام</TabsTrigger>
          <TabsTrigger value="approval" className="gap-1.5"><Workflow className="h-3.5 w-3.5" /> مسارات الاعتماد</TabsTrigger>
          <TabsTrigger value="escalation" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> التنبيهات والتصعيد</TabsTrigger>
          <TabsTrigger value="notification" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> الإشعارات</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4"><GeneralTab user={user} /></TabsContent>
        <TabsContent value="approval" className="mt-4"><ApprovalTab user={user} /></TabsContent>
        <TabsContent value="escalation" className="mt-4"><EscalationTab /></TabsContent>
        <TabsContent value="notification" className="mt-4"><NotificationTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// =================== عام ===================
function GeneralTab({ user }: { user: CurrentUser }) {
  const { data, isLoading } = useQuery<SettingsGroup>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/api/settings"),
  });

  if (isLoading || !data) return <CenteredLoader />;

  // المكون الفرعي يأخذ القيم الأولية كـ props — عند إعادة الجلب يُعاد تركيبه بقيم محدّثة.
  return (
    <GeneralForm
      key={data.general.map((s) => `${s.key}:${s.value}`).join("|") || `org:${user.org.name}`}
      user={user}
      initialOrgName={data.general.find((s) => s.key === "general.org_name")?.value ?? user.org.name}
      initialOrgNameEn={data.general.find((s) => s.key === "general.org_name_en")?.value ?? user.org.nameEn ?? ""}
      initialCurrency={data.general.find((s) => s.key === "general.currency")?.value ?? user.org.currency}
      otherGeneral={data.general.filter((s) => !s.key.startsWith("general."))}
    />
  );
}

function GeneralForm({
  user,
  initialOrgName,
  initialOrgNameEn,
  initialCurrency,
  otherGeneral,
}: {
  user: CurrentUser;
  initialOrgName: string;
  initialOrgNameEn: string;
  initialCurrency: string;
  otherGeneral: SettingItem[];
}) {
  const qc = useQueryClient();
  const [orgName, setOrgName] = useState(initialOrgName);
  const [orgNameEn, setOrgNameEn] = useState(initialOrgNameEn);
  const [currency, setCurrency] = useState(initialCurrency);

  const saveMut = useMutation({
    mutationFn: (items: { key: string; value: string }[]) =>
      apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ items }) }),
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات العامة");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذّر الحفظ"),
  });

  function handleSave() {
    saveMut.mutate([
      { key: "general.org_name", value: orgName },
      { key: "general.org_name_en", value: orgNameEn },
      { key: "general.currency", value: currency },
    ]);
  }

  return (
    <SectionCard
      title="بيانات المؤسسة"
      action={<Badge variant="outline" className="text-[10px] gap-1"><Info className="h-3 w-3" /> تُحفظ كإعدادات عامة</Badge>}
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">اسم المؤسسة (عربي)</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">اسم المؤسسة (إنجليزي)</Label>
            <Input value={orgNameEn} onChange={(e) => setOrgNameEn(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label className="mb-1.5 block">العملة</Label>
            <div className="flex items-center gap-2">
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="max-w-32" dir="ltr" />
              <Coins className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                العملة الحالية المعروضة: <span className="font-medium nums">{user.org.currency}</span>
              </span>
            </div>
          </div>
        </div>

        {otherGeneral.length > 0 && (
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs font-bold text-muted-foreground mb-2">إعدادات عامة إضافية</h4>
            <div className="space-y-2">
              {otherGeneral.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground nums">{s.key}</span>
                  <span className="font-medium nums">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saveMut.isPending} className="gap-1.5 bg-primary hover:bg-primary/90">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ التغييرات
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// =================== مسارات الاعتماد ===================
function ApprovalTab({ user }: { user: CurrentUser }) {
  const { data: settingsData, isLoading: settingsLoading } = useQuery<SettingsGroup>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/api/settings"),
  });
  const { data: metaData, isLoading: metaLoading } = useQuery<MetaData>({
    queryKey: ["meta"],
    queryFn: () => apiFetch("/api/meta"),
  });

  if (settingsLoading || metaLoading || !settingsData || !metaData) return <CenteredLoader />;

  const financeLimitSetting = settingsData.approval.find((s) => s.key === "approval.finance_limit");

  return (
    <ApprovalContent
      key={financeLimitSetting?.value ?? "default"}
      user={user}
      financeLimitInitial={financeLimitSetting?.value ?? "50000"}
      financeLimitValueText={financeLimitSetting?.value}
      workflows={metaData.approvalWorkflows}
    />
  );
}

function ApprovalContent({
  user,
  financeLimitInitial,
  financeLimitValueText,
  workflows,
}: {
  user: CurrentUser;
  financeLimitInitial: string;
  financeLimitValueText?: string;
  workflows: ApprovalWorkflow[];
}) {
  const qc = useQueryClient();
  const [financeLimit, setFinanceLimit] = useState<string>(financeLimitInitial);

  const saveMut = useMutation({
    mutationFn: (items: { key: string; value: string }[]) =>
      apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ items }) }),
    onSuccess: () => {
      toast.success("تم تحديث حد الاعتماد المالي");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذّر الحفظ"),
  });

  function handleSaveLimit() {
    const num = parseFloat(financeLimit);
    if (isNaN(num) || num < 0) {
      toast.error("أدخل قيمة رقمية موجبة");
      return;
    }
    saveMut.mutate([{ key: "approval.finance_limit", value: String(num) }]);
  }

  return (
    <div className="space-y-4">
      <SectionCard title="حد الاعتماد المالي للمدير المالي" action={<Badge variant="outline" className="text-[10px] gap-1"><Coins className="h-3 w-3" /> يتحكم بمسار التصعيد</Badge>}>
        <p className="text-xs text-muted-foreground mb-3">
          الطلبات المالية التي يتجاوز إجماليها هذا الحد تُصعَّد تلقائيًا من المدير المالي إلى مدير الشركة للاعتماد النهائي.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1.5 block">الحد (بالعملة الحالية)</Label>
            <Input
              type="number"
              min="0"
              value={financeLimit}
              onChange={(e) => setFinanceLimit(e.target.value)}
              className="w-48 nums"
              dir="ltr"
            />
          </div>
          <Button onClick={handleSaveLimit} disabled={saveMut.isPending} className="gap-1.5 bg-primary hover:bg-primary/90">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ الحد
          </Button>
          {financeLimitValueText && (
            <div className="text-xs text-muted-foreground mr-auto">
              القيمة المحفوظة: <span className="font-bold text-foreground nums">{formatCurrency(parseFloat(financeLimitValueText), user.org.currency)}</span>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="مسارات الاعتماد المعرّفة" action={<Badge variant="outline" className="text-[10px] gap-1"><Workflow className="h-3 w-3" /> للقراءة فقط</Badge>}>
        {workflows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد مسارات اعتماد مهيّأة.</p>
        ) : (
          <div className="space-y-3">
            {workflows.map((w) => (
              <div key={w.id} className="border border-border rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <h4 className="font-bold text-sm">{w.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {w.requestType && <span>{w.requestType.nameAr}</span>}
                      {(w.minAmount != null || w.maxAmount != null) && (
                        <span className="nums">
                          ({w.minAmount != null ? formatCurrency(w.minAmount, user.org.currency) : "0"} — {w.maxAmount != null ? formatCurrency(w.maxAmount, user.org.currency) : "∞"})
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px]">{w.active ? "نشط" : "متوقف"}</Badge>
                    </div>
                  </div>
                </div>
                <ol className="space-y-1.5">
                  {w.steps.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold nums shrink-0">
                        {s.order}
                      </span>
                      <span className="font-medium">{s.approverLabel || ROLES[s.approverRole as keyof typeof ROLES] || s.approverRole}</span>
                      {s.isFinal && <Badge variant="outline" className="text-[10px] text-primary border-primary/30">نهائي</Badge>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// =================== التنبيهات والتصعيد ===================
function EscalationTab() {
  const { data, isLoading } = useQuery<SettingsGroup>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/api/settings"),
  });

  if (isLoading || !data) return <CenteredLoader />;

  const w = data.escalation.find((s) => s.key === "escalation.warning_before_due_hours")?.value ?? "24";
  const m = data.escalation.find((s) => s.key === "escalation.overdue_notify_manager_hours")?.value ?? "12";
  const c = data.escalation.find((s) => s.key === "escalation.ceo_escalation_days")?.value ?? "3";

  return <EscalationForm key={`${w}|${m}|${c}`} initialW={w} initialM={m} initialC={c} />;
}

function EscalationForm({ initialW, initialM, initialC }: { initialW: string; initialM: string; initialC: string }) {
  const qc = useQueryClient();
  const [warningHours, setWarningHours] = useState(initialW);
  const [managerHours, setManagerHours] = useState(initialM);
  const [ceoDays, setCeoDays] = useState(initialC);

  const saveMut = useMutation({
    mutationFn: (items: { key: string; value: string }[]) =>
      apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ items }) }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات التصعيد");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذّر الحفظ"),
  });

  function handleSave() {
    const items = [
      { key: "escalation.warning_before_due_hours", value: String(parseInt(warningHours || "0", 10) || 0) },
      { key: "escalation.overdue_notify_manager_hours", value: String(parseInt(managerHours || "0", 10) || 0) },
      { key: "escalation.ceo_escalation_days", value: String(parseInt(ceoDays || "0", 10) || 0) },
    ];
    saveMut.mutate(items);
  }

  return (
    <SectionCard title="إعدادات التصعيد والتنبيه" action={<Badge variant="outline" className="text-[10px] gap-1"><Clock className="h-3 w-3" /> يقود التنبيهات التلقائية</Badge>}>
      <div className="space-y-4">
        <EscalationRow
          icon={Clock}
          label="تنبيه قبل الموعد النهائي (ساعة)"
          desc="يرسل النظام إشعارًا للمستخدم المسؤول قبل موعد التسليم بهذا العدد من الساعات."
          value={warningHours}
          onChange={setWarningHours}
          unit="ساعة"
        />
        <EscalationRow
          icon={AlertTriangle}
          label="تنبيه المدير بعد التأخير (ساعة)"
          desc="عند تجاوز الموعد النهائي، يُشعَر المدير المباشر بعد هذه المدة من التأخير."
          value={managerHours}
          onChange={setManagerHours}
          unit="ساعة"
        />
        <EscalationRow
          icon={TrendingUp}
          label="تصعيد لمدير الشركة (يوم)"
          desc="يُصعَّد الموقف إلى مدير الشركة بعد هذه المدة من الاستمرار دون حل."
          value={ceoDays}
          onChange={setCeoDays}
          unit="يوم"
        />
        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleSave} disabled={saveMut.isPending} className="gap-1.5 bg-primary hover:bg-primary/90">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ إعدادات التصعيد
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function EscalationRow({
  icon: Icon,
  label,
  desc,
  value,
  onChange,
  unit,
}: {
  icon: typeof Clock;
  label: string;
  desc: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-border">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 nums"
          dir="ltr"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

// =================== الإشعارات ===================
function NotificationTab() {
  const { data, isLoading } = useQuery<SettingsGroup>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/api/settings"),
  });

  if (isLoading || !data) return <CenteredLoader />;

  const emailVal = data.notification.find((s) => s.key === "notification.enable_email")?.value === "true";

  return <NotificationForm key={String(emailVal)} initialEmail={emailVal} />;
}

function NotificationForm({ initialEmail }: { initialEmail: boolean }) {
  const qc = useQueryClient();
  const [enableEmail, setEnableEmail] = useState(initialEmail);

  const saveMut = useMutation({
    mutationFn: (items: { key: string; value: string }[]) =>
      apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ items }) }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الإشعارات");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذّر الحفظ"),
  });

  function toggleEmail(checked: boolean) {
    setEnableEmail(checked);
    saveMut.mutate([{ key: "notification.enable_email", value: String(checked) }]);
  }

  return (
    <SectionCard title="إعدادات الإشعارات" action={<Badge variant="outline" className="text-[10px] gap-1"><Bell className="h-3 w-3" /> تتحكم بقنوات الإرسال</Badge>}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">إشعارات داخل التطبيق</div>
              <div className="text-xs text-muted-foreground mt-0.5">الإشعارات تُعرض داخل المنصة افتراضيًا لجميع المستخدمين.</div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">مفعّلة دائمًا</Badge>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">إشعارات البريد الإلكتروني</div>
              <div className="text-xs text-muted-foreground mt-0.5">إرسال نسخة من الإشعارات المهمة إلى البريد الإلكتروني للمستخدم (قريبًا).</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">قريبًا</span>
            <Switch checked={enableEmail} onCheckedChange={toggleEmail} disabled={saveMut.isPending} />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function CenteredLoader() {
  return (
    <Card className="p-12 flex justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </Card>
  );
}
