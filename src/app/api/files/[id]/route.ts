import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * GET /api/files/[id]
 * يُرجع الملف الثنائي (binary) مع ترويسات مناسبة للمعاينة/التنزيل.
 * يتطلب تسجيل دخول (أي مستخدم مسجّل يمكنه رؤية الملفات داخل المنصة).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("غير مصرح", { status: 401 });

  const { id } = await ctx.params;
  const asset = await db.fileAsset.findUnique({ where: { id } });
  if (!asset) return new Response("غير موجود", { status: 404 });

  // فك base64 إلى Buffer
  const buffer = Buffer.from(asset.data, "base64");

  const isImage = asset.mimeType.startsWith("image/");
  const isPdf = asset.mimeType === "application/pdf";
  const isText = asset.mimeType.startsWith("text/");

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.size),
      // للمعاينة داخل المتصفح (الصور، PDF، النصوص)، للتنزيل للأنواع الأخرى
      "Content-Disposition": `${isImage || isPdf || isText ? "inline" : "attachment"}; filename="${encodeURIComponent(asset.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
