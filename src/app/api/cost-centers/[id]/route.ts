import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, notFound, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * تعديل مركز تكلفة (PATCH) — أرشفة عبر active=false
 */
export const PATCH = apiHandler(async (req: Request, ctx: any) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.manage") && !can(user, "settings.manage")) throw new Error("FORBIDDEN");

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { code, name, parentId, managerId, active } = body || {};

  const cc = await db.costCenter.findUnique({ where: { id } });
  if (!cc) notFound();
  const before = { ...cc };

  if (code !== undefined) {
    if (typeof code !== "string" || !code.trim()) badRequest("رمز مركز التكلفة غير صحيح");
    const dup = await db.costCenter.findFirst({ where: { code: code.trim(), NOT: { id } } });
    if (dup) badRequest("الرمز مستخدم من قبل مركز آخر");
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim())) badRequest("الاسم غير صحيح");
  if (parentId === id) badRequest("لا يمكن أن يكون المركز أبًا لنفسه");

  if (parentId) {
    // منع الدورات في الشجرة
    const parent = await db.costCenter.findUnique({ where: { id: parentId } });
    if (!parent) badRequest("مركز الأب غير موجود");
    let cur: typeof parent | null = parent;
    const seen = new Set<string>([id]);
    while (cur) {
      if (seen.has(cur.id)) badRequest("تتسبب في دورة في شجرة مراكز التكلفة");
      seen.add(cur.id);
      if (!cur.parentId) break;
      cur = await db.costCenter.findUnique({ where: { id: cur.parentId } });
    }
  }

  const updated = await db.costCenter.update({
    where: { id },
    data: {
      ...(code !== undefined ? { code: code.trim() } : {}),
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(parentId !== undefined ? { parentId: parentId || null } : {}),
      ...(managerId !== undefined ? { managerId: managerId || null } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
    },
    include: {
      manager: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, code: true } },
    },
  });

  await audit({
    user,
    action: active === false ? "archive" : "update",
    entityType: "cost_center",
    entityId: id,
    before,
    after: updated,
    summary: active === false ? `أرشفة مركز تكلفة: ${updated.name}` : `تعديل مركز تكلفة: ${updated.name}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return updated;
});
