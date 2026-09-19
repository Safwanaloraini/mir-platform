import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, notFound, getClientIp, getUserAgent } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/users/[id]
 * - users.manage: يصل لأي مستخدم.
 * - غير ذلك: يصل لسجله فقط.
 */
export const GET = apiHandler(async (_req: Request, ctx: Ctx) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  if (user.id !== id && !can(user, "users.manage")) throw new Error("FORBIDDEN");

  const target = await db.user.findUnique({
    where: { id },
    include: {
      department: true,
      _count: {
        select: {
          createdTasks: true,
          createdRequests: true,
          assignedTasks: true,
        },
      },
    },
  });
  if (!target) { notFound(); return; }

  const { passwordHash: _ph, ...safe } = target;
  return { user: safe };
});

/**
 * PATCH /api/users/[id]
 * تحديث حقول مستخدم. الصلاحية: users.manage، أو المستخدم يعدّل سجله (حقول محدودة فقط).
 */
export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const isSelf = user.id === id;
  const manage = can(user, "users.manage");
  if (!isSelf && !manage) throw new Error("FORBIDDEN");

  const target = await db.user.findUnique({ where: { id } });
  if (!target) { notFound(); return; }

  const body = await req.json();
  const before = { ...target, passwordHash: "[hidden]" };

  // الحقول المسموح بتعديلها:
  // - الموظف على نفسه: name, nameEn, phone, jobTitle, avatarUrl.
  // - مدير المستخدمين على أي مستخدم: كل ما سبق + email, role, departmentId, status, password.
  const data: any = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.nameEn === "string") data.nameEn = body.nameEn.trim() || null;
  if (typeof body.phone === "string") data.phone = body.phone.trim() || null;
  if (typeof body.jobTitle === "string") data.jobTitle = body.jobTitle.trim() || null;
  if (typeof body.avatarUrl === "string") data.avatarUrl = body.avatarUrl.trim() || null;

  if (manage) {
    if (typeof body.email === "string" && body.email.trim()) {
      const newEmail = body.email.trim().toLowerCase();
      if (newEmail !== target.email) {
        const taken = await db.user.findUnique({ where: { email: newEmail } });
        if (taken) badRequest("البريد مستخدم بالفعل");
        data.email = newEmail;
      }
    }
    if (typeof body.role === "string" && body.role in ROLES) data.role = body.role;
    if (typeof body.departmentId === "string") data.departmentId = body.departmentId || null;
    if (typeof body.status === "string") data.status = body.status === "disabled" ? "disabled" : "active";

    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 6) badRequest("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      data.passwordHash = await hashPassword(body.password);
    }
  }

  // منع الموظف من رفع صلاحيات نفسه
  if (isSelf && !manage && (data.role || data.status)) {
    throw new Error("FORBIDDEN");
  }

  if (Object.keys(data).length === 0) {
    badRequest("لا توجد حقول للتحديث");
  }

  const updated = await db.user.update({
    where: { id },
    data,
    include: { department: true },
  });

  const roleChanged = data.role && data.role !== target.role;
  const action = roleChanged ? "permission_change" : "update";

  await audit({
    user,
    action,
    entityType: "user",
    entityId: id,
    before,
    after: { ...updated, passwordHash: "[hidden]" },
    summary: roleChanged
      ? `تغيير دور ${updated.name} من «${ROLES[target.role as keyof typeof ROLES] ?? target.role}» إلى «${ROLES[updated.role as keyof typeof ROLES] ?? updated.role}»`
      : `تحديث بيانات المستخدم: ${updated.name}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  const { passwordHash: _ph, ...safe } = updated;
  return { user: safe };
});
