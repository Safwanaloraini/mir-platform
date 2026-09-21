import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { apiHandler } from "@/lib/api";

/**
 * GET /api/tasks/snoozes
 * قائمة تأجيلات التنبيهات الخاصة بالمستخدم الحالي.
 * تُستخدم في واجهة «أعمالي» لعرض المهام المؤجّلة وقسم «مؤجلة».
 *
 * الإرجاع: { items: Array<{ id, taskId, until, reason, createdAt }> }
 * يُستثنى منها التأجيلات المنتهية (حتى تاريخه < now).
 */
export const GET = apiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const now = new Date();
  const snoozes = await db.taskSnooze.findMany({
    where: { userId: user.id, until: { gt: now } },
    select: {
      id: true,
      taskId: true,
      until: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { until: "asc" },
  });

  return { items: snoozes };
});
