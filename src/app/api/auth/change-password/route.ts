import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { verifyPassword, hashPassword } from "@/lib/password";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * يتحقق من كلمة المرور الحالية، ثم يحدّثها. مفتوح لأي مستخدم مسجّل.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const body = await req.json();
  const currentPassword: string | undefined = body?.currentPassword;
  const newPassword: string | undefined = body?.newPassword;

  if (!currentPassword || !newPassword) {
    badRequest("كلمة المرور الحالية والجديدة مطلوبة");
    return; // unreachable — badRequest يرمي استثناء — لكنه يُطمئن المُحقّق.
  }
  if (newPassword.length < 6) {
    badRequest("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
    return;
  }
  if (currentPassword === newPassword) {
    badRequest("كلمة المرور الجديدة يجب أن تختلف عن الحالية");
    return;
  }

  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (!fresh) throw new Error("UNAUTHORIZED");

  const ok = await verifyPassword(currentPassword, fresh.passwordHash);
  if (!ok) {
    badRequest("كلمة المرور الحالية غير صحيحة");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  await audit({
    user,
    action: "update",
    entityType: "user",
    entityId: user.id,
    summary: `تغيير كلمة المرور: ${user.name}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return { ok: true };
});
