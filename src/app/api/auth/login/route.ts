import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { apiHandler, getClientIp, getUserAgent } from "@/lib/api";

export const POST = apiHandler(async (req: Request) => {
  const { email, password } = await req.json();
  if (!email || !password) {
    const e = new Error("VALIDATION");
    (e as any).cause = "البريد الإلكتروني وكلمة المرور مطلوبان";
    throw e;
  }
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { org: true, department: true },
  });
  if (!user) {
    const e = new Error("VALIDATION");
    (e as any).cause = "بيانات الدخول غير صحيحة";
    throw e;
  }
  if (user.status !== "active") {
    const e = new Error("VALIDATION");
    (e as any).cause = "الحساب غير مفعّل";
    throw e;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const e = new Error("VALIDATION");
    (e as any).cause = "بيانات الدخول غير صحيحة";
    throw e;
  }
  await createSession(user.id);
  await audit({
    user,
    action: "login",
    summary: `تسجيل دخول: ${user.name}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  const { passwordHash, ...safe } = user;
  return NextResponse.json({ user: safe });
});
