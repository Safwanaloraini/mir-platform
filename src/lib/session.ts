import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { db } from "@/lib/db";

export type SessionUser = Awaited<ReturnType<typeof getSessionUser>>;

async function getSessionUser() {
  const token = await getSessionToken();
  if (!token) return null;
  const userId = verify(token);
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { department: true, org: true },
  });
  if (!user || user.status !== "active") return null;
  return user;
}

const SESSION_COOKIE = "mir_session";
const SECRET = process.env.MIR_SECRET || "mir-default-secret-change-in-production-9f2k4";

/**
 * يوقّع معرّف المستخدم بتوقيع HMAC لمنع العبث.
 */
function sign(userId: string): string {
  const sig = createHmac("sha256", SECRET).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

function verify(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", SECRET).update(userId).digest("hex");
  if (sig === expected) return userId;
  return null;
}

export async function createSession(userId: string) {
  const token = sign(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // أسبوع
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/**
 * يحمل المستخدم الحالي من الجلسة (مع الإدارة والمؤسسة).
 */
export async function getCurrentUser() {
  return getSessionUser();
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

/**
 * يتطلب صلاحية دور معينة. يُستخدم في API routes.
 */
export async function requireRole(...roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
