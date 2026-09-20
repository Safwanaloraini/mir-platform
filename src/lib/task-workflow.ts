/**
 * محرّك سير عمل المهام — مصدر الحقيقة الوحيد (Single Source of Truth).
 * يُستخدم في كل من الخادم (API) والعميل (UI) لضمان الاتساق.
 *
 * المبادئ:
 * - الانتقالات معرّفة هنا وليست في client فقط (إصلاح ثغرة أمنية).
 * - لكل انتقال: الصلاحية المطلوبة + الحقول التي يجب استكمالها.
 * - فئات الحالات الأساسية (غير مبدوءة/قيد التنفيذ/منتهية) للتقارير.
 */

import type { Permission } from "@/lib/permissions";

// ============ فئات الحالات الأساسية ============
export type StatusCategory = "not_started" | "in_progress" | "done";

export const STATUS_CATEGORIES: Record<string, StatusCategory> = {
  draft: "not_started",
  new: "not_started",
  assigned: "not_started",
  in_progress: "in_progress",
  awaiting_info: "in_progress",
  awaiting_approval: "in_progress",
  stalled: "in_progress",
  completed_review: "in_progress",
  completed_approved: "done",
  cancelled: "done",
  archived: "done",
};

export function getStatusCategory(status: string): StatusCategory {
  return STATUS_CATEGORIES[status] ?? "not_started";
}

export const CATEGORY_LABELS: Record<StatusCategory, string> = {
  not_started: "غير مبدوءة",
  in_progress: "قيد التنفيذ",
  done: "منتهية",
};

// ============ تعريف الانتقالات ============
export interface TransitionDef {
  /** الصلاحيات المطلوبة لإتمام الانتقال (أي منها يكفي) */
  permissions?: Permission[];
  /** هل يجب أن يكون المستخدم منشئًا أو مسؤولًا؟ */
  creatorOrAssignee?: boolean;
  /** حقول يجب استكمالها قبل الانتقال */
  requiredFields?: string[];
  /** رسالة توضيحية عند الرفض */
  hint?: string;
}

export interface TransitionMap {
  [fromStatus: string]: {
    [toStatus: string]: TransitionDef;
  };
}

/**
 * خريطة الانتقالات المسموحة بين الحالات.
 * المفاتيح: fromStatus → toStatus → التعريف.
 * انتقال غير موجود = غير مسموح.
 */
export const TRANSITIONS: TransitionMap = {
  draft: {
    new: { hint: "تحويل المسودة إلى مهمة جديدة" },
    assigned: { hint: "إسناد المهمة مباشرة" },
    cancelled: { creatorOrAssignee: true },
  },
  new: {
    assigned: { creatorOrAssignee: true, hint: "إسناد المهمة لمسؤول" },
    in_progress: {
      creatorOrAssignee: true,
      requiredFields: ["description"],
      hint: "بدء التنفيذ يتطلب وصفًا أو معيار إنجاز",
    },
    cancelled: { creatorOrAssignee: true },
  },
  assigned: {
    in_progress: {
      creatorOrAssignee: true,
      requiredFields: ["description"],
      hint: "بدء التنفيذ يتطلب وصفًا أو معيار إنجاز",
    },
    awaiting_info: { creatorOrAssignee: true, hint: "طلب معلومات إضافية" },
    stalled: { creatorOrAssignee: true, requiredFields: ["stallReason"] },
    cancelled: { creatorOrAssignee: true },
  },
  in_progress: {
    awaiting_info: { creatorOrAssignee: true },
    awaiting_approval: {
      creatorOrAssignee: true,
      hint: "رفع المهمة للاعتماد بعد إكمال العمل",
    },
    completed_review: {
      creatorOrAssignee: true,
      requiredFields: ["checklistRequired"],
      hint: "إكمال يتطلب إنجاز كل عناصر التحقق الإلزامية",
    },
    stalled: { creatorOrAssignee: true, requiredFields: ["stallReason"] },
    cancelled: { creatorOrAssignee: true },
  },
  awaiting_info: {
    in_progress: { creatorOrAssignee: true, hint: "استئناف التنفيذ" },
    stalled: { creatorOrAssignee: true, requiredFields: ["stallReason"] },
    cancelled: { creatorOrAssignee: true },
  },
  awaiting_approval: {
    in_progress: { creatorOrAssignee: true, hint: "إعادة للتنفيذ بعد المراجعة" },
    completed_review: { hint: "موافقة على المراجعة" },
    stalled: { creatorOrAssignee: true, requiredFields: ["stallReason"] },
    cancelled: { creatorOrAssignee: true },
  },
  completed_review: {
    completed_approved: {
      permissions: ["task.approve_completion"],
      requiredFields: ["checklistRequired", "attachmentsRequired"],
      hint: "الاعتماد النهائي يتطلب إنجاز كل العناصر والمرفقات الإلزامية",
    },
    in_progress: { creatorOrAssignee: true, hint: "إعادة للتنفيذ" },
    cancelled: { creatorOrAssignee: true },
  },
  stalled: {
    in_progress: { creatorOrAssignee: true, hint: "استئناف بعد التعثر" },
    cancelled: { creatorOrAssignee: true },
  },
  completed_approved: {}, // حالة نهائية — لا انتقالات بعدها
  cancelled: {}, // حالة نهائية
};

// ============ فحص الانتقال ============
export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
  def?: TransitionDef;
}

export function canTransition(
  fromStatus: string,
  toStatus: string,
  ctx: {
    isCreator?: boolean;
    isAssignee?: boolean;
    can: (perm: Permission) => boolean;
  }
): TransitionCheck {
  if (fromStatus === toStatus) {
    return { allowed: false, reason: "الحالة الجديدة مطابقة للحالية" };
  }
  const fromMap = TRANSITIONS[fromStatus];
  if (!fromMap) {
    return { allowed: false, reason: `لا توجد انتقالات من الحالة "${fromStatus}"` };
  }
  const def = fromMap[toStatus];
  if (!def) {
    return { allowed: false, reason: `الانتقال من "${fromStatus}" إلى "${toStatus}" غير مسموح` };
  }

  // فحص الصلاحيات
  if (def.permissions && def.permissions.length > 0) {
    const hasPerm = def.permissions.some((p) => ctx.can(p));
    if (!hasPerm) {
      return { allowed: false, reason: "ليست لديك الصلاحية لهذا الانتقال", def };
    }
  }

  // فحص المنشئ/المسؤول
  if (def.creatorOrAssignee && !ctx.isCreator && !ctx.isAssignee) {
    return { allowed: false, reason: "هذا الانتقال مخصص للمنشئ أو المسؤول فقط", def };
  }

  return { allowed: true, def };
}

// ============ الحقول المطلوبة لكل انتقال ============
export const FIELD_LABELS: Record<string, string> = {
  description: "الوصف أو معيار الإنجاز",
  stallReason: "سبب التعثر",
  checklistRequired: "إكمال كل عناصر التحقق الإلزامية",
  attachmentsRequired: "وجود المرفقات الإلزامية",
  assignee: "المسؤول الرئيسي",
  dueDate: "الموعد النهائي",
};

export function getRequiredFields(fromStatus: string, toStatus: string): string[] {
  const def = TRANSITIONS[fromStatus]?.[toStatus];
  return def?.requiredFields ?? [];
}

// ============ الانتقالات المتاحة من حالة معيّنة ============
export function getAvailableTransitions(
  fromStatus: string,
  ctx: { isCreator?: boolean; isAssignee?: boolean; can: (p: Permission) => boolean }
): Array<{ toStatus: string; def: TransitionDef; available: boolean; blockedReason?: string }> {
  const fromMap = TRANSITIONS[fromStatus];
  if (!fromMap) return [];
  return Object.entries(fromMap).map(([toStatus, def]) => {
    const check = canTransition(fromStatus, toStatus, ctx);
    return {
      toStatus,
      def,
      available: check.allowed,
      blockedReason: check.reason,
    };
  });
}

// ============ حالات الإكمال ============
export const COMPLETION_STATUSES = ["completed_review", "completed_approved"];
export const TERMINAL_STATUSES = ["completed_approved", "cancelled", "archived"];
export const OPEN_STATUSES = ["new", "assigned", "in_progress", "awaiting_info", "awaiting_approval", "stalled", "completed_review"];

export function isOpen(status: string): boolean {
  return OPEN_STATUSES.includes(status);
}
export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}
export function isCompletion(status: string): boolean {
  return COMPLETION_STATUSES.includes(status);
}

/**
 * الحالات التي تعني "بدأ التنفيذ" فعليًا (لضبط startedAt).
 */
export const ACTIVE_EXECUTION_STATUSES = ["in_progress", "awaiting_info", "awaiting_approval", "completed_review"];

/**
 * الحالة التالية الموصى بها من حالة معيّنة (للزر السريع).
 */
export function getNextRecommendedStatus(fromStatus: string): string | null {
  const recommendations: Record<string, string> = {
    draft: "new",
    new: "assigned",
    assigned: "in_progress",
    in_progress: "completed_review",
    awaiting_info: "in_progress",
    awaiting_approval: "completed_review",
    stalled: "in_progress",
    completed_review: "completed_approved",
  };
  return recommendations[fromStatus] ?? null;
}
