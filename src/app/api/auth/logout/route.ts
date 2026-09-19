import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/api";

export const POST = apiHandler(async () => {
  const user = await getCurrentUser();
  await destroySession();
  if (user) {
    await audit({ user, action: "logout", summary: `تسجيل خروج: ${user.name}` });
  }
  return NextResponse.json({ ok: true });
});
