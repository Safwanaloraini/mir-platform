import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * GET /api/settings
 * - users with settings.manage: كل الإعدادات مجمّعة حسب الفئة.
 * - غير ذلك: فقط فئة "general".
 */
export const GET = apiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const manage = can(user, "settings.manage");
  const where = manage ? {} : { category: "general" };

  const settings = await db.setting.findMany({ where, orderBy: { category: "asc" } });

  const grouped = {
    general: [] as any[],
    approval: [] as any[],
    escalation: [] as any[],
    notification: [] as any[],
  };
  for (const s of settings) {
    if (grouped[s.category as keyof typeof grouped]) {
      grouped[s.category as keyof typeof grouped].push(s);
    }
  }
  return grouped;
});

/**
 * PUT /api/settings
 * Body: { items: [{ key, value }] }
 * تحديث جماعي للإعدادات. الصلاحية: settings.manage.
 */
export const PUT = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "settings.manage")) throw new Error("FORBIDDEN");

  const body = await req.json();
  const items: { key: string; value: string }[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) badRequest("لا توجد عناصر للتحديث");

  const updated: any[] = [];
  for (const item of items) {
    if (!item?.key || typeof item.value !== "string") continue;
    const existing = await db.setting.findUnique({ where: { key: item.key } });
    if (!existing) {
      // إنشاء مفتاح جديد ضمن فئة general افتراضيًا
      const created = await db.setting.create({
        data: {
          key: item.key,
          value: item.value,
          category: "general",
          updatedBy: user.id,
        },
      });
      updated.push(created);
    } else {
      const beforeVal = existing.value;
      const u = await db.setting.update({
        where: { key: item.key },
        data: { value: item.value, updatedBy: user.id },
      });
      updated.push(u);
      // تسجيل تغيير كل قيمة على حدة (قبل/بعد صغير).
      await audit({
        user,
        action: "settings_change",
        entityType: "setting",
        entityId: existing.id,
        before: { key: existing.key, value: beforeVal },
        after: { key: existing.key, value: item.value },
        summary: `تحديث الإعداد «${existing.key}»: ${beforeVal} ← ${item.value}`,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }
  }

  return { ok: true, updated };
});
