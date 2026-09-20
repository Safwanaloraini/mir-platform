import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity } from "@/lib/audit";

const VALID_VIEW_MODES = ["list", "kanban", "calendar", "timeline"];

async function loadViewOr404(id: string) {
  const view = await db.taskView.findUnique({ where: { id } });
  if (!view) throw new Error("NOT_FOUND");
  return view;
}

/**
 * يتحقق من حق المستخدم في تعديل/حذف العرض.
 * - المالك يملك حق التعديل دائمًا على عرضه الشخصي.
 * - العرض المشترك يتطلب task.manage_views لغير المالك.
 */
function assertCanMutateView(
  user: { id: string },
  view: { ownerId: string; isShared: boolean },
  hasManageViews: boolean
) {
  if (view.ownerId === user.id) return;
  if (view.isShared && hasManageViews) return;
  throw new Error("FORBIDDEN");
}

/**
 * PATCH /api/tasks/views/[id]
 * تحديث عرض محفوظ. يتحقق من الملكية أو صلاحية إدارة العروض المشتركة.
 */
export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const existing = await loadViewOr404(id);
  const hasManageViews = can(user, "task.manage_views");
  assertCanMutateView(user, existing, hasManageViews);

  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) badRequest("اسم العرض لا يمكن أن يكون فارغًا");
    if (name.length > 80) badRequest("اسم العرض طويل جدًا");
    if (name !== existing.name) {
      data.name = name;
      changes.push("name");
    }
  }
  if (body.filtersJson !== undefined) {
    const filters = JSON.stringify(body.filtersJson ?? {});
    if (filters.length > 10000) badRequest("حجم الفلاتر كبير جدًا");
    if (filters !== existing.filtersJson) {
      data.filtersJson = filters;
      changes.push("filtersJson");
    }
  }
  if (body.sortBy !== undefined) {
    const sortBy = String(body.sortBy);
    if (sortBy !== existing.sortBy) {
      data.sortBy = sortBy;
      changes.push("sortBy");
    }
  }
  if (body.groupBy !== undefined) {
    const groupBy = body.groupBy ? String(body.groupBy) : null;
    if (groupBy !== existing.groupBy) {
      data.groupBy = groupBy;
      changes.push("groupBy");
    }
  }
  if (body.columnsJson !== undefined) {
    const cols = body.columnsJson ? JSON.stringify(body.columnsJson) : null;
    if (cols !== existing.columnsJson) {
      data.columnsJson = cols;
      changes.push("columnsJson");
    }
  }
  if (body.viewMode !== undefined) {
    const viewMode = String(body.viewMode);
    if (!VALID_VIEW_MODES.includes(viewMode)) badRequest(`نمط العرض غير صالح: ${viewMode}`);
    if (viewMode !== existing.viewMode) {
      data.viewMode = viewMode;
      changes.push("viewMode");
    }
  }
  if (body.isShared !== undefined) {
    // تحويل عرض شخصي إلى مشترك يتطلب task.manage_views
    const newShared = !!body.isShared;
    if (newShared && !existing.isShared && !hasManageViews) throw new Error("FORBIDDEN");
    if (newShared !== existing.isShared) {
      data.isShared = newShared;
      changes.push("isShared");
    }
  }
  if (body.isPinned !== undefined) {
    const newPinned = !!body.isPinned;
    if (newPinned !== existing.isPinned) {
      data.isPinned = newPinned;
      changes.push("isPinned");
    }
  }

  if (changes.length === 0) {
    return existing;
  }

  const updated = await db.taskView.update({ where: { id }, data });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "update",
    entityType: "task_view",
    entityId: id,
    before: {
      name: existing.name,
      isShared: existing.isShared,
      isPinned: existing.isPinned,
    },
    after: { updated: changes, ...data },
    summary: `تعديل العرض المحفوظ «${existing.name}» (${changes.join("، ")})`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "update",
    entityType: "task_view",
    entityId: id,
    summary: `عدّل عرضًا محفوظًا «${existing.name}»`,
    ip,
  });

  return updated;
});

/**
 * DELETE /api/tasks/views/[id]
 * حذف عرض محفوظ. المالك يحذف عرضه، أو من يملك task.manage_views للعروض المشتركة.
 */
export const DELETE = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const existing = await loadViewOr404(id);
  const hasManageViews = can(user, "task.manage_views");
  assertCanMutateView(user, existing, hasManageViews);

  await db.taskView.delete({ where: { id } });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "delete",
    entityType: "task_view",
    entityId: id,
    before: { name: existing.name, isShared: existing.isShared },
    summary: `حذف العرض المحفوظ «${existing.name}»`,
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "delete",
    entityType: "task_view",
    entityId: id,
    summary: `حذف عرضًا محفوظًا «${existing.name}»`,
    ip,
  });

  return { ok: true };
});
