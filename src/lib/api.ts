import { NextResponse } from "next/server";

/**
 * يلفّ دالة API route ويعالج الأخطاء بشكل موحد (بما في ذلك الصلاحيات).
 */
export function apiHandler(handler: (req: Request, ctx: any) => Promise<any>) {
  return async (req: Request, ctx: any) => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result);
    } catch (e: any) {
      const msg = e?.message ?? "internal_error";
      if (msg === "UNAUTHORIZED") {
        return NextResponse.json({ error: "غير مصرح", code: "UNAUTHORIZED" }, { status: 401 });
      }
      if (msg === "FORBIDDEN") {
        return NextResponse.json({ error: "ليست لديك صلاحية لتنفيذ هذا الإجراء", code: "FORBIDDEN" }, { status: 403 });
      }
      if (msg === "NOT_FOUND") {
        return NextResponse.json({ error: "غير موجود", code: "NOT_FOUND" }, { status: 404 });
      }
      if (msg === "VALIDATION") {
        return NextResponse.json({ error: e?.cause ?? "بيانات غير صحيحة", code: "VALIDATION" }, { status: 400 });
      }
      console.error("[apiHandler] error:", e);
      return NextResponse.json(
        { error: msg || "حدث خطأ غير متوقع", code: "INTERNAL" },
        { status: 500 }
      );
    }
  };
}

export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return undefined;
}

export function getUserAgent(req: Request): string | undefined {
  return req.headers.get("user-agent") ?? undefined;
}

/**
 * يتحقق من أن المستخدم لديه صلاحية، وإلا يرمي FORBIDDEN.
 */
export function assertCan(user: { role: string } | null, perm: (user: any) => boolean) {
  if (!user || !perm(user as any)) {
    const err = new Error("FORBIDDEN");
    throw err;
  }
}

export function badRequest(message: string) {
  const e = new Error("VALIDATION");
  (e as any).cause = message;
  throw e;
}

export function notFound() {
  throw new Error("NOT_FOUND");
}
