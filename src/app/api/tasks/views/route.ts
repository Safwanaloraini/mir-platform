import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

const VALID_VIEW_MODES = ["list", "kanban", "calendar", "timeline"];

/**
 * GET /api/tasks/views
 * قائمة العروض المحفوظة للمستخدم الحالي + العروض المشتركة.
 * الترتيب: المثبّتة أولًا، ثم الأحدث تحديثًا.
 */
export const GET = apiHandler(async (_req: Request, _ctx: { params: Promise<Record<string, string>> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const views = await db.taskView.findMany({
    where: {
      OR: [{ ownerId: user.id }, { isShared: true }],
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });

  return { items: views };
});

/**
 * POST /api/tasks/views
 * إنشاء عرض محفوظ جديد.
 * - إنشاء عرض شخصي لأي مستخدم مسجّل دخول.
 * - إصدار عرض مشترك يتطلب صلاحية task.manage_views.
 */
export const POST = apiHandler(async (req: Request, _ctx: { params: Promise<Record<string, string>> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const body = await req.json().catch(() => ({}));

  const name = String(body.name || "").trim();
  if (!name) badRequest("اسم العرض مطلوب");
  if (name.length > 80) badRequest("اسم العرض طويل جدًا (الحد الأقصى 80 حرفًا)");

  const isShared = !!body.isShared;
  if (isShared && !can(user, "task.manage_views")) throw new Error("FORBIDDEN");

  const filtersJson = JSON.stringify(body.filtersJson ?? {});
  if (filtersJson.length > 10000) badRequest("حجم الفلاتر كبير جدًا");

  const sortBy = body.sortBy ? String(body.sortBy) : "createdAt:desc";
  const groupBy = body.groupBy ? String(body.groupBy) : null;
  const columnsJson = body.columnsJson ? JSON.stringify(body.columnsJson) : null;
  const viewMode = body.viewMode ? String(body.viewMode) : "list";
  if (!VALID_VIEW_MODES.includes(viewMode)) badRequest(`نمط العرض غير صالح: ${viewMode}`);
  const isPinned = !!body.isPinned;

  const created = await db.taskView.create({
    data: {
      name,
      ownerId: user.id,
      isShared,
      isPinned,
      filtersJson,
      sortBy,
      groupBy,
      columnsJson,
      viewMode,
    },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "create",
    entityType: "task_view",
    entityId: created.id,
    after: { name, isShared, isPinned, viewMode },
    summary: `إنشاء عرض محفوظ «${name}»${isShared ? " (مشترك)" : ""}`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "create",
    entityType: "task_view",
    entityId: created.id,
    summary: `أنشأ عرضًا محفوظًا «${name}»`,
    ip,
  });

  return created;
});
