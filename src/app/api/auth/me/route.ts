import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { apiHandler } from "@/lib/api";

export const GET = apiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  const { passwordHash, ...safe } = user as any;
  return NextResponse.json({ user: safe });
});
