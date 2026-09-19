import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, notFound, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

const VENDOR_TYPES: Record<string, string> = {
  vendor: "vendor",
  supplier: "supplier",
  contractor: "contractor",
};

/**
 * تعديل مورد/عميل (PATCH) — لا حذف صلب، الأرشفة عبر active=false.
 */
export const PATCH = apiHandler(async (req: Request, ctx: any) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.manage")) throw new Error("FORBIDDEN");

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { kind, name, nameEn, type, taxNumber, email, phone, address, bankAccount, active } = body || {};

  // تحديد الكيان المطلوب
  let entity: any = null;
  let entityType: "vendor" | "customer" = kind === "customer" ? "customer" : "vendor";

  if (entityType === "vendor") {
    entity = await db.vendor.findUnique({ where: { id } });
    if (!entity) {
      // ربما هو عميل محفوظ بنفس المعرف (نادر) لكننا نتحقق
      const c = await db.customer.findUnique({ where: { id } });
      if (c) {
        entityType = "customer";
        entity = c;
      }
    }
  } else {
    entity = await db.customer.findUnique({ where: { id } });
    if (!entity) {
      const v = await db.vendor.findUnique({ where: { id } });
      if (v) {
        entityType = "vendor";
        entity = v;
      }
    }
  }
  if (!entity) notFound();

  const before = { ...entity };

  if (entityType === "vendor") {
    if (type && !(type in VENDOR_TYPES)) badRequest("نوع المورد غير صحيح");
    if (name !== undefined && (typeof name !== "string" || !name.trim())) badRequest("الاسم غير صحيح");
    const updated = await db.vendor.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(nameEn !== undefined ? { nameEn: nameEn || null } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(taxNumber !== undefined ? { taxNumber: taxNumber || null } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(bankAccount !== undefined ? { bankAccount: bankAccount || null } : {}),
        ...(active !== undefined ? { active: !!active } : {}),
      },
    });
    await audit({
      user,
      action: active === false ? "archive" : "update",
      entityType: "vendor",
      entityId: id,
      before,
      after: updated,
      summary: active === false ? `أرشفة مورد: ${updated.name}` : `تعديل مورد: ${updated.name}`,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    return { kind: "vendor", ...updated };
  }

  // customer
  if (name !== undefined && (typeof name !== "string" || !name.trim())) badRequest("الاسم غير صحيح");
  const updated = await db.customer.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(nameEn !== undefined ? { nameEn: nameEn || null } : {}),
      ...(taxNumber !== undefined ? { taxNumber: taxNumber || null } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
    },
  });
  await audit({
    user,
    action: active === false ? "archive" : "update",
    entityType: "customer",
    entityId: id,
    before,
    after: updated,
    summary: active === false ? `أرشفة عميل: ${updated.name}` : `تعديل عميل: ${updated.name}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return { kind: "customer", ...updated };
});
