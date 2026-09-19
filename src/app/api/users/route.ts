import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";

/**
 * GET /api/users
 * - users.manage: يرى كل المستخدمين.
 * - غير ذلك: يرى نفسه فقط (للملف الشخصي).
 * فلاتر: role, status, departmentId, search (اسم/بريد).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const manage = can(user, "users.manage");
  const url = new URL(req.url);
  const sp = url.searchParams;

  // من لا يملك صلاحية الإدارة: يُعاد له سجلّه فقط.
  if (!manage) {
    const me = await db.user.findUnique({
      where: { id: user.id },
      include: { department: true },
    });
    return { items: me ? [me] : [] };
  }

  const role = sp.get("role") || undefined;
  const status = sp.get("status") || undefined;
  const departmentId = sp.get("departmentId") || undefined;
  const search = sp.get("search")?.trim() || undefined;

  const where: any = { orgId: user.orgId };
  if (role) where.role = role;
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { nameEn: { contains: search } },
      { jobTitle: { contains: search } },
    ];
  }

  const items = await db.user.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { department: true },
  });

  // إزالة passwordHash من الإخراج
  return { items: items.map(({ passwordHash: _ph, ...u }) => u) };
});

/**
 * POST /api/users
 * إنشاء مستخدم جديد. الصلاحية: users.manage.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "users.manage")) throw new Error("FORBIDDEN");

  const body = await req.json();
  const { email, name, nameEn, password, phone, jobTitle, role, departmentId, status } = body as {
    email: string;
    name: string;
    nameEn?: string;
    password: string;
    phone?: string;
    jobTitle?: string;
    role: string;
    departmentId?: string;
    status?: string;
  };

  if (!email || !name || !password) {
    badRequest("الاسم والبريد وكلمة المرور مطلوبة");
  }
  if (password.length < 6) {
    badRequest("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
  }
  if (!(role in ROLES)) {
    badRequest("الدور غير صالح");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    badRequest("البريد الإلكتروني مستخدم مسبقًا");
  }

  const passwordHash = await hashPassword(password);

  const created = await db.user.create({
    data: {
      email: normalizedEmail,
      name: name.trim(),
      nameEn: nameEn?.trim() || null,
      passwordHash,
      phone: phone?.trim() || null,
      jobTitle: jobTitle?.trim() || null,
      role,
      departmentId: departmentId || null,
      status: status === "disabled" ? "disabled" : "active",
      orgId: user.orgId,
    },
    include: { department: true },
  });

  await audit({
    user,
    action: "create",
    entityType: "user",
    entityId: created.id,
    after: { ...created, passwordHash: "[hidden]" },
    summary: `إنشاء مستخدم: ${created.name} (${created.email}) — الدور: ${ROLES[created.role as keyof typeof ROLES]}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  const { passwordHash: _ph, ...safe } = created;
  return { user: safe };
});
