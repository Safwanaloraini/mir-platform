import { db } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * يكتب سجل تدقيق لا يمكن للمستخدمين العاديين تعديله.
 */
export async function audit(params: {
  user?: User | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  summary: string;
  ip?: string;
  userAgent?: string;
}) {
  const { user, action, entityType, entityId, before, after, summary, ip, userAgent } = params;
  try {
    await db.auditLog.create({
      data: {
        userId: user?.id ?? null,
        action,
        entityType,
        entityId,
        before: before ? JSON.stringify(before) : null,
        after: after ? JSON.stringify(after) : null,
        summary,
        ip,
        userAgent,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write audit log:", e);
  }
}

/**
 * يكتب سجل نشاط (للعرض للمستخدم، أقل رسمية من التدقيق).
 */
export async function activity(params: {
  user: User;
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  ip?: string;
}) {
  const { user, action, entityType, entityId, summary, ip } = params;
  try {
    await db.activityLog.create({
      data: {
        userId: user.id,
        action,
        entityType,
        entityId,
        summary,
        ip,
      },
    });
  } catch (e) {
    console.error("[activity] failed:", e);
  }
}

/**
 * ينشئ إشعارًا للمستخدم.
 */
export async function notify(params: {
  userId: string;
  actorId?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    await db.notification.create({ data: params });
  } catch (e) {
    console.error("[notify] failed:", e);
  }
}
