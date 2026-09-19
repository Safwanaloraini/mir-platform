// ثوابت وتسميات عربية للمنصة

export const ROLES = {
  ceo: "مدير الشركة",
  ops_manager: "مدير التشغيل",
  finance_manager: "المدير المالي",
  accountant: "محاسب",
  employee: "موظف",
} as const;

export const ROLE_KEYS = Object.keys(ROLES) as (keyof typeof ROLES)[];

export const TASK_TYPES = {
  strategic: "استراتيجية",
  operational: "تشغيلية",
  financial: "مالية",
  accounting: "محاسبية",
  administrative: "إدارية",
  followup: "متابعة",
} as const;

export const TASK_SOURCES = {
  decision: "قرار إداري",
  meeting: "اجتماع",
  financial_request: "طلب مالي",
  recurring: "إجراء دوري",
  independent: "مهمة مستقلة",
} as const;

export const TASK_STATUSES = {
  draft: { label: "مسودة", color: "slate" },
  new: { label: "جديدة", color: "sky" },
  assigned: { label: "مسندة", color: "teal" },
  in_progress: { label: "قيد التنفيذ", color: "amber" },
  awaiting_info: { label: "بانتظار معلومات", color: "violet" },
  awaiting_approval: { label: "بانتظار اعتماد", color: "purple" },
  stalled: { label: "متعثرة", color: "red" },
  completed_review: { label: "مكتملة بانتظار المراجعة", color: "indigo" },
  completed_approved: { label: "مكتملة ومعتمدة", color: "green" },
  cancelled: { label: "ملغاة", color: "gray" },
  archived: { label: "مؤرشفة", color: "zinc" },
} as const;

export const TASK_PRIORITIES = {
  low: { label: "منخفضة", color: "slate" },
  medium: { label: "متوسطة", color: "sky" },
  high: { label: "عالية", color: "amber" },
  urgent: { label: "عاجلة", color: "red" },
} as const;

export const REQUEST_TYPES = {
  purchase: { label: "طلب شراء", icon: "ShoppingCart", category: "financial" },
  disbursement: { label: "طلب صرف", icon: "Banknote", category: "financial" },
  payment: { label: "طلب دفعة", icon: "CreditCard", category: "financial" },
  reimbursement: { label: "طلب تعويض", icon: "Receipt", category: "financial" },
  custody: { label: "طلب عهدة", icon: "Wallet", category: "financial" },
  transfer: { label: "طلب تحويل", icon: "ArrowLeftRight", category: "financial" },
  contract: { label: "طلب تعاقد", icon: "FileSignature", category: "financial" },
  budget: { label: "طلب ميزانية", icon: "PiggyBank", category: "financial" },
  operational: { label: "طلب إجراء تشغيلي", icon: "Settings", category: "operational" },
  exception: { label: "طلب استثناء/موافقة إدارية", icon: "ShieldAlert", category: "operational" },
} as const;

export const REQUEST_STATUSES = {
  draft: { label: "مسودة", color: "slate" },
  submitted: { label: "مقدم", color: "sky" },
  under_review: { label: "تحت المراجعة", color: "teal" },
  needs_completion: { label: "يحتاج استكمال", color: "amber" },
  preliminarily_approved: { label: "معتمد مبدئيًا", color: "cyan" },
  awaiting_final: { label: "بانتظار الاعتماد النهائي", color: "purple" },
  approved: { label: "معتمد", color: "green" },
  rejected: { label: "مرفوض", color: "red" },
  forwarded_accountant: { label: "محول للمحاسب", color: "indigo" },
  in_execution: { label: "قيد التنفيذ", color: "amber" },
  partially_executed: { label: "منفذ جزئيًا", color: "yellow" },
  fully_executed: { label: "منفذ بالكامل", color: "green" },
  closed: { label: "مغلق", color: "emerald" },
  cancelled: { label: "ملغى", color: "gray" },
} as const;

export const EXPENSE_CATEGORIES = {
  supplies: "مستلزمات",
  services: "خدمات",
  utilities: "مرافق",
  rent: "إيجارات",
  travel: "سفر وانتقال",
  maintenance: "صيانة",
  marketing: "تسويق",
  salaries: "رواتب",
  other: "أخرى",
} as const;

export const PAYMENT_METHODS = {
  bank_transfer: "تحويل بنكي",
  cheque: "شيك",
  cash: "نقدي",
  card: "بطاقة",
} as const;

export const INVOICE_STATUSES = {
  unpaid: "غير مدفوعة",
  partial: "مدفوعة جزئيًا",
  paid: "مدفوعة",
  overdue: "متأخرة",
  cancelled: "ملغاة",
} as const;

export const NOTIFICATION_TYPES = {
  task_assigned: "إسناد مهمة",
  status_change: "تغيير حالة",
  due_soon: "اقتراب الموعد",
  overdue: "تأخر مهمة",
  approval_required: "طلب اعتماد",
  approved: "اعتماد طلب",
  rejected: "رفض طلب",
  returned: "إعادة طلب",
  comment: "تعليق جديد",
  mention: "إشارة",
  attachment_missing: "مرفق ناقص",
  stalled: "تعثر مهمة",
  payment_done: "اكتمال دفعة",
  budget_exceeded: "تجاوز ميزانية",
  decision_converted: "تحويل قرار",
} as const;

// خريطة الألوان (tailwind classes) للحالات
export const STATUS_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
  sky: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800",
  teal: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800",
  amber: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800",
  violet: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800",
  purple: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
  red: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800",
  green: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  cyan: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800",
  gray: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700",
  zinc: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700",
};

export function statusBadgeClass(color: string): string {
  return STATUS_COLOR_CLASSES[color] ?? STATUS_COLOR_CLASSES.slate;
}

export function formatCurrency(amount: number | null | undefined, currency = "SAR"): string {
  if (amount == null) return "—";
  const symbol = currency === "SAR" ? "ر.س" : currency;
  return `${amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ${symbol}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("ar-SA");
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  return rtf.format(-months, "month");
}

export function taskNumber(n: number): string {
  return `م-${String(n).padStart(4, "0")}`;
}

export function requestNumber(n: number): string {
  return `ط-${String(n).padStart(4, "0")}`;
}
