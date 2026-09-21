import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { apiHandler, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

interface SkippedItem {
  id: string;
  reason: string;
}

interface BulkPayload {
  value: unknown;
  before: Record<string, Record<string, unknown>>;
  versionAfter: Record<string, number>;
}

/**
 * يحوّل قيمة ISO إلى كائن Date آمن.
 */
function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * يبني بيانات استرجاع لكل حقل من حقول الإجراء الجماعي.
 */
function buildRestoreData(
  action: string,
  before: Record<string, unknown>,
  payloadValue: unknown
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  switch (action) {
    case "status":
      data.status = before.status;
      if (before.stallReason !== undefined) data.stallReason = before.stallReason;
      break;
    case "priority":
      data.priority = before.priority;
      break;
    case "dueDate":
      data.dueDate = toDate(before.dueDate);
      break;
    case "department":
      data.departmentId = before.departmentId ?? null;
      break;
    case "tags":
      data.tags = before.tags ?? null;
      break;
    case "assign":
      // الإسناد يُعاد بناؤه عبر معاملة منفصلة (لا يمكن في update عادي)
      break;
    default:
      break;
  }
  return data;
}

/**
 * POST /api/tasks/bulk/[id]/undo
 * التراجع عن إجراء جماعي: استرجاع الحالة السابقة لكل مهمة شملها الإجراء.
 * - يتحقق أن المستخدم هو صاحب الإجراء الأصلي.
 * - يسترجع فقط المهام التي لم تُعدّل بعد (version مطابقة).
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const bulkAction = await db.bulkAction.findUnique({ where: { id } });
  if (!bulkAction) throw new Error("NOT_FOUND");

  if (bulkAction.userId !== user.id) throw new Error("FORBIDDEN");
  if (bulkAction.undone) {
    return { restored: [], skipped: [{ id: "—", reason: "الإجراء مسترجع مسبقًا" }] };
  }

  const payload: BulkPayload = JSON.parse(bulkAction.payloadJson || "{}");
  const taskIds: string[] = JSON.parse(bulkAction.taskIds || "[]");

  const restored: string[] = [];
  const skipped: SkippedItem[] = [];

  const tasks = await db.task.findMany({
    where: { id: { in: taskIds } },
    select: {
      id: true,
      version: true,
      status: true,
      priority: true,
      dueDate: true,
      departmentId: true,
      tags: true,
      stallReason: true,
    },
  });
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  await db.$transaction(async (tx) => {
    // 1. تعليم الإجراء كمسترجَع (لمنع إعادة التراجع)
    await tx.bulkAction.update({
      where: { id },
      data: { undone: true, undoneAt: new Date() },
    });

    for (const tid of taskIds) {
      const task = taskMap.get(tid);
      if (!task) {
        skipped.push({ id: tid, reason: "المهمة لم تعد موجودة" });
        continue;
      }
      const expectedVersion = payload.versionAfter[tid];
      if (typeof expectedVersion !== "number" || task.version !== expectedVersion) {
        skipped.push({ id: tid, reason: "تم تعديل المهمة بعد الإجراء الجماعي ولا يمكن استرجاعها بأمان" });
        continue;
      }

      const before = payload.before[tid] ?? {};
      const restoreData = buildRestoreData(bulkAction.action, before, payload.value);

      if (bulkAction.action === "assign") {
        // استرجاع الإسناد السابق
        const prevAssignees = Array.isArray(before.assigneeIds) ? (before.assigneeIds as string[]) : [];
        // قائمة المهام الفارغة السابقة تعني لم يكن هناك إسناد
        await tx.taskAssignee.deleteMany({ where: { taskId: tid } });
        for (const uid of prevAssignees) {
          await tx.taskAssignee.create({
            data: { taskId: tid, userId: uid, role: "contributor", isMain: false },
          });
        }
        const all = await tx.taskAssignee.findMany({ where: { taskId: tid } });
        if (all.length > 0) {
          await tx.taskAssignee.update({
            where: { id: all[0].id },
            data: { isMain: true, role: "responsible" },
          });
          await tx.task.update({
            where: { id: tid },
            data: { mainAssigneeId: all[0].id, version: { increment: 1 } },
          });
        } else {
          await tx.task.update({
            where: { id: tid },
            data: { mainAssigneeId: null, version: { increment: 1 } },
          });
        }
        restored.push(tid);
        continue;
      }

      if (bulkAction.action === "status") {
        // إغلاق أي انتقالات مفتوحة، وإنشاء انتقال عكسي
        const now = new Date();
        await tx.taskStatusTransition.updateMany({
          where: { taskId: tid, exitedAt: null },
          data: { exitedAt: now },
        });
        await tx.taskStatusTransition.create({
          data: {
            taskId: tid,
            fromStatus: task.status,
            toStatus: String(before.status ?? task.status),
            userId: user.id,
            note: "تراجع عن إجراء جماعي",
            enteredAt: now,
          },
        });
        await tx.taskStatusHistory.create({
          data: {
            taskId: tid,
            userId: user.id,
            fromStatus: task.status,
            toStatus: String(before.status ?? task.status),
            note: "تراجع عن إجراء جماعي",
          },
        });
      }

      await tx.task.update({
        where: { id: tid },
        data: { ...restoreData, version: { increment: 1 } },
      });
      restored.push(tid);
    }
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "bulk_undo",
    entityType: "task",
    entityId: id,
    before: { action: bulkAction.action, restoredCount: restored.length },
    after: { restored, skipped: skipped.length },
    summary: `تراجع عن إجراء جماعي (${bulkAction.action}): استرجاع ${restored.length} مهمة، تجاوز ${skipped.length}`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "bulk_undo",
    entityType: "task",
    entityId: id,
    summary: `تراجع عن إجراء جماعي على ${taskIds.length} مهمة`,
    ip,
  });

  return { restored, skipped };
});
