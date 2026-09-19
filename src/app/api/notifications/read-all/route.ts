import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { apiHandler } from "@/lib/api";

/**
 * POST /api/notifications/read-all
 * يضع علامة "مقروء" على كل إشعارات المستخدم الحالي غير المقروءة.
 */
export const POST = apiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const result = await db.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  return { ok: true, count: result.count };
});
