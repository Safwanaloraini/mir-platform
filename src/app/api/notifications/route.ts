import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { apiHandler } from "@/lib/api";
import { relativeTime } from "@/lib/constants";

/**
 * GET /api/notifications
 * - ?count=true → { unread: number }
 * - ?limit=50 ?unread=true ?type= → { items: Notification[] }
 * ملاحظة: نُعيد createdAt كنص نسبي عربي لأن التوب‌بار يعرضه مباشرة.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const url = new URL(req.url);
  const countMode = url.searchParams.get("count") === "true";

  if (countMode) {
    const unread = await db.notification.count({
      where: { userId: user.id, read: false },
    });
    return { unread };
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
  const onlyUnread = url.searchParams.get("unread") === "true";
  const type = url.searchParams.get("type") || undefined;

  const items = await db.notification.findMany({
    where: {
      userId: user.id,
      ...(onlyUnread ? { read: false } : {}),
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { id: true, name: true } },
    },
  });

  return {
    items: items.map((n) => ({
      ...n,
      createdAt: relativeTime(n.createdAt),
      createdAtISO: n.createdAt,
    })),
  };
});
