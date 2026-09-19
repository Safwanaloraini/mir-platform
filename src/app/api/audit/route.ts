import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler } from "@/lib/api";

/**
 * GET /api/audit
 * فلترة: action, entityType, entityId, userId, dateFrom, dateTo, search, page, pageSize
 * الصلاحية: audit.view (مع استثناء: المستخدم يستطيع رؤية سجلاته الخاصة عبر ?userId=me).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const url = new URL(req.url);
  const sp = url.searchParams;

  const action = sp.get("action") || undefined;
  const entityType = sp.get("entityType") || undefined;
  const entityId = sp.get("entityId") || undefined;
  const search = sp.get("search")?.trim() || undefined;
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");

  // دعم ?userId=me لاستخدام الملف الشخصي
  let userId = sp.get("userId") || undefined;
  if (userId === "me") userId = user.id;

  const page = Math.max(parseInt(sp.get("page") || "1", 10) || 1, 1);
  const pageSize = Math.min(parseInt(sp.get("pageSize") || "20", 10) || 20, 100);

  // التحقق من الصلاحية: إن لم يملك audit.view فيجب أن يكون الاستعلام عن سجلاته فقط.
  const hasAuditPerm = can(user, "audit.view");
  if (!hasAuditPerm && userId !== user.id) {
    throw new Error("FORBIDDEN");
  }

  const where: any = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (userId) where.userId = userId;
  if (search) {
    where.summary = { contains: search };
  }
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  return { items, total, page, pageSize };
});
