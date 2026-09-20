import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { apiHandler, badRequest } from "@/lib/api";
import { audit } from "@/lib/audit";

const MAX_SIZE = 100 * 1024 * 1024; // 100 ميجابايت

/**
 * قائمة أنواع الملفات المدعومة (تسامحية — أي صورة أو PDF أو مستند مقبول).
 * نعتمد بشكل أساسي على البادئة image/ و application/ و text/.
 */
function isAllowedType(mimeType: string): boolean {
  // أي صورة مدعومة (PNG, JPEG, GIF, WebP, BMP, SVG, TIFF, HEIC, AVIF, إلخ)
  if (mimeType.startsWith("image/")) return true;
  // أي نص مدعوم
  if (mimeType.startsWith("text/")) return true;
  // المستندات والمكتبية الشائعة
  const docTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/rtf",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/json",
    "application/xml",
    "application/octet-stream", // أحيانًا المتصفح يعطي هذا النوع للملفات غير المعروفة
  ];
  return docTypes.includes(mimeType);
}

/**
 * POST /api/files/upload
 * يرفع ملفًا من الجهاز (multipart/form-data) ويُخزّنه في قاعدة البيانات.
 * الحقول المتوقعة: file (الملف الفعلي)
 * يعيد: { id, url, fileName, fileSize, fileType }
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const formData = await req.formData();
  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    badRequest("لم يتم استلام ملف");
  }
  const file = fileEntry as File;

  if (file.size > MAX_SIZE) {
    badRequest(`حجم الملف يتجاوز الحد المسموح (100 ميجابايت). حجم ملفك: ${(file.size / 1024 / 1024).toFixed(2)} ميجابايت`);
  }

  if (file.size === 0) {
    badRequest("الملف فارغ");
  }

  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedType(mimeType)) {
    badRequest(`نوع الملف غير مدعوم: ${mimeType}. الأنواع المدعومة: الصور (PNG/JPEG/GIF/WebP)، PDF، Word، Excel، PowerPoint، نصوص، ZIP`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Data = buffer.toString("base64");

  const asset = await db.fileAsset.create({
    data: {
      fileName: file.name,
      mimeType,
      size: file.size,
      data: base64Data,
      uploadedById: user.id,
    },
  });

  await audit({
    user,
    action: "create",
    entityType: "file",
    entityId: asset.id,
    summary: `رفع ملف: ${asset.fileName} (${(asset.size / 1024).toFixed(1)} ك.ب)`,
  });

  return {
    id: asset.id,
    url: `/api/files/${asset.id}`,
    fileName: asset.fileName,
    fileSize: asset.size,
    fileType: asset.mimeType,
  };
});
