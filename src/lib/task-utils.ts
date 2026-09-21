/**
 * دوال مساعدة لإدارة المهام — حساب التقدم، كشف الحجب، تجميع، ترتيب.
 * تُستخدم في الخادم والعميل.
 */
import { db } from "@/lib/db";
import { canTransition, type TransitionDef } from "@/lib/task-workflow";
import type { Permission } from "@/lib/permissions";

// ============ حساب التقدم المحسوب ============
/**
 * يحسب نسبة التقدم من المهام الفرعية أو قائمة التحقق.
 * - إن كانت هناك مهام فرعية: متوسط تقدمها
 * - وإلا إن كان هناك checklist: نسبة المنجزة منها (مع وزن مضاعف للإلزامية)
 * - وإلا يُرجع التقدم اليدوي الحالي
 */
export function computeProgress(task: {
  progress: number;
  subtasks?: Array<{ progress: number }>;
  checklist?: Array<{ done: boolean; required: boolean }>;
}): number {
  if (task.subtasks && task.subtasks.length > 0) {
    const sum = task.subtasks.reduce((s, st) => s + (st.progress || 0), 0);
    return Math.round(sum / task.subtasks.length);
  }
  if (task.checklist && task.checklist.length > 0) {
    const done = task.checklist.filter((c) => c.done).length;
    return Math.round((done / task.checklist.length) * 100);
  }
  return task.progress || 0;
}

// ============ كشف الحجب ============
export interface BlockingInfo {
  isBlocked: boolean;
  blockingTasks: Array<{ id: string; title: string; number: number; status: string }>;
  blockedByCount: number;
}

/**
 * يفحص هل المهمة محجوبة بتبعيات غير مكتملة.
 * المهمة المحجوبة = لها تبعية finish_to_start (افتراضيًا) على مهمة غير مكتملة.
 */
export async function getBlockingInfo(taskId: string): Promise<BlockingInfo> {
  const deps = await db.taskDependency.findMany({
    where: { taskId },
    include: {
      dependsOn: { select: { id: true, title: true, number: true, status: true } },
    },
  });
  const blocking = deps
    .filter((d) => d.type === "finish_to_start" && !["completed_approved", "cancelled", "archived"].includes(d.dependsOn.status))
    .map((d) => ({
      id: d.dependsOn.id,
      title: d.dependsOn.title,
      number: d.dependsOn.number,
      status: d.dependsOn.status,
    }));
  return {
    isBlocked: blocking.length > 0,
    blockingTasks: blocking,
    blockedByCount: blocking.length,
  };
}

// ============ كشف الدورات في التبعيات ============
/**
 * يفحص إن كان إضافة تبعية (taskId → dependsOnId) سيُنشئ دورة.
 * نتبع سلسلة dependsOnId صعودًا.
 */
export async function wouldCreateCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  if (taskId === dependsOnId) return true;
  const seen = new Set<string>([taskId]);
  let current: string | null = dependsOnId;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    const dep = await db.taskDependency.findFirst({
      where: { taskId: current },
      select: { dependsOnId: true },
    });
    current = dep?.dependsOnId ?? null;
  }
  return false;
}

// ============ التحقق من الحقول المطلوبة ============
/**
 * يتحقق من استكمال الحقول المطلوبة لانتقال معيّن.
 * يعيد قائمة الحقول الناقصة.
 */
export function checkRequiredFields(
  task: {
    description?: string | null;
    definitionOfDone?: string | null;
    stallReason?: string | null;
    checklist?: Array<{ done: boolean; required: boolean }>;
    attachments?: Array<{ required: boolean }>;
    assignees?: unknown[];
    dueDate?: Date | null;
  },
  requiredFields: string[]
): string[] {
  const missing: string[] = [];
  for (const field of requiredFields) {
    switch (field) {
      case "description":
        if (!task.description?.trim() && !task.definitionOfDone?.trim()) {
          missing.push("الوصف أو معيار الإنجاز");
        }
        break;
      case "stallReason":
        if (!task.stallReason?.trim()) missing.push("سبب التعثر");
        break;
      case "checklistRequired": {
        const reqItems = task.checklist?.filter((c) => c.required) ?? [];
        if (reqItems.length === 0) {
          missing.push("إضافة عنصر تحقق إلزامي واحد على الأقل");
        } else {
          const undone = reqItems.filter((c) => !c.done);
          if (undone.length > 0) {
            missing.push(`إكمال ${undone.length} عنصر تحقق إلزامي`);
          }
        }
        break;
      }
      case "attachmentsRequired": {
        const required = task.attachments?.filter((a) => a.required) ?? [];
        if (required.length === 0) {
          missing.push("إضافة مرفق إلزامي واحد على الأقل");
        }
        break;
      }
      case "assignee":
        if (!task.assignees || task.assignees.length === 0) missing.push("المسؤول الرئيسي");
        break;
      case "dueDate":
        if (!task.dueDate) missing.push("الموعد النهائي");
        break;
    }
  }
  return missing;
}

// ============ ترتيب المهام ============
export type SortField = "createdAt" | "dueDate" | "priority" | "status" | "title" | "updatedAt" | "progress";
export type SortDir = "asc" | "desc";

export interface SortOption {
  field: SortField;
  dir: SortDir;
}

export const PRIORITY_ORDER: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
export const STATUS_ORDER: Record<string, number> = {
  draft: 0, new: 1, assigned: 2, in_progress: 3, awaiting_info: 4, awaiting_approval: 5, completed_review: 6, completed_approved: 7, stalled: 8, cancelled: 9, archived: 10,
};

/**
 * يحوّل سلسلة الترتيب "field:dir" إلى كائن.
 */
export function parseSort(sortStr: string | undefined | null): SortOption {
  if (!sortStr) return { field: "createdAt", dir: "desc" };
  const [field, dir] = sortStr.split(":");
  return {
    field: (field as SortField) || "createdAt",
    dir: dir === "asc" ? "asc" : "desc",
  };
}

/**
 * يبني orderBy لـ Prisma من خيار الترتيب.
 */
export function buildOrderBy(sort: SortOption): Record<string, "asc" | "desc"> {
  // الترتيب المنطقي للأولوية والحالة يتطلب تحويلًا
  if (sort.field === "priority" || sort.field === "status") {
    // هذه حقول نصية لكن نريد ترتيبًا منطقيًا — نُرجع ترتيبًا ثانويًا
    return { createdAt: sort.dir === "asc" ? "asc" : "desc" };
  }
  return { [sort.field]: sort.dir };
}

// ============ تجميع المهام ============
export type GroupBy = "status" | "assignee" | "department" | "project" | "priority" | "dueDate" | "type" | "none";

export const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "none", label: "بدون تجميع" },
  { value: "status", label: "الحالة" },
  { value: "priority", label: "الأولوية" },
  { value: "assignee", label: "المسؤول" },
  { value: "department", label: "الإدارة" },
  { value: "project", label: "المشروع" },
  { value: "dueDate", label: "الموعد النهائي" },
  { value: "type", label: "النوع" },
];

/**
 * يجمع المهام حسب حقل معيّن (في الذاكرة — للقوائم الصغيرة).
 */
export function groupTasks(tasks: any[], groupBy: GroupBy): Record<string, any[]> {
  if (groupBy === "none") return { "الكل": tasks };
  const groups: Record<string, any[]> = {};
  for (const t of tasks) {
    let key = "بدون";
    switch (groupBy) {
      case "status": key = t.status; break;
      case "priority": key = t.priority; break;
      case "department": key = t.department?.name ?? "بدون إدارة"; break;
      case "project": key = t.project?.name ?? "بدون مشروع"; break;
      case "assignee": key = t.assignees?.[0]?.user?.name ?? "غير مسند"; break;
      case "dueDate": key = t.dueDate ? new Date(t.dueDate).toLocaleDateString("ar-SA") : "بدون موعد"; break;
      case "type": key = t.type; break;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

// ============ الترتيب الذكي لأعمالي ============
/**
 * يرتب المهام حسب: التعثر → الأولوية → قرب الموعد → الحالة.
 */
export function smartSort(tasks: any[]): any[] {
  const now = Date.now();
  return [...tasks].sort((a, b) => {
    // 1. المتعثرة أولًا
    const aStalled = a.status === "stalled" ? 1 : 0;
    const bStalled = b.status === "stalled" ? 1 : 0;
    if (aStalled !== bStalled) return bStalled - aStalled;
    // 2. الأولوية
    const aP = PRIORITY_ORDER[a.priority] ?? 0;
    const bP = PRIORITY_ORDER[b.priority] ?? 0;
    if (aP !== bP) return bP - aP;
    // 3. قرب الموعد
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() - now : Infinity;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() - now : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    // 4. الحالة
    const aS = STATUS_ORDER[a.status] ?? 99;
    const bS = STATUS_ORDER[b.status] ?? 99;
    return aS - bS;
  });
}

// ============ نسخة العميل من canTransition ============
export function canTransitionClient(
  fromStatus: string,
  toStatus: string,
  ctx: { isCreator?: boolean; isAssignee?: boolean; can: (p: Permission) => boolean }
) {
  return canTransition(fromStatus, toStatus, ctx);
}
