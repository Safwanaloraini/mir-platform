import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { apiHandler } from "@/lib/api";

/**
 * POST /api/notifications/[id]/read
 * يضع علامة "مقروء" على إشعار يخص المستخدم الحالي فقط.
 */
export const POST = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;

  const notif = await db.notification.findUnique({ where: { id } });
  if (!notif) throw new Error("NOT_FOUND");
  if (notif.userId !== user.id) throw new Error("FORBIDDEN");

  if (!notif.read) {
    await db.notification.update({ where: { id }, data: { read: true } });
  }
  return { ok: true };
});
