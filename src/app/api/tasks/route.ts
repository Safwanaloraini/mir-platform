import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";

/**
 * GET /api/tasks
 * قائمة المهام مع فلاتر متقدمة.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const url = new URL(req.url);
  const sp = url.searchParams;

  const statusRaw = sp.get("status");
  const priority = sp.get("priority");
  const type = sp.get("type");
  const departmentId = sp.get("departmentId");
  const assigneeId = sp.get("assigneeId");
  const projectId = sp.get("projectId");
  const overdue = sp.get("overdue") === "true";
  const stalled = sp.get("stalled") === "true";
  const search = sp.get("search") || undefined;
  const mine = sp.get("mine") === "true";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(sp.get("pageSize") || "20", 10) || 20));

  const viewAll = can(user, "task.view.all");

  // النطاق حسب الصلاحية
  const scopeWhere = viewAll
    ? { orgId: user.orgId }
    : {
        OR: [
          { createdById: user.id },
          { assignees: { some: { userId: user.id } } },
        ],
      };

  // مكوّنات الفلتر
  const where: any = { ...scopeWhere };

  if (statusRaw) {
    const statuses = statusRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };
  }
  if (priority) where.priority = priority;
  if (type) where.type = type;
  if (departmentId) where.departmentId = departmentId;
  if (projectId) where.projectId = projectId;
  if (assigneeId) where.assignees = { some: { userId: assigneeId } };
  if (stalled) where.status = "stalled";
  if (overdue) {
    where.dueDate = { lt: new Date() };
    where.status = where.status
      ? Array.isArray(where.status?.in)
        ? { in: (where.status.in as string[]).filter((s) => !["completed_approved", "cancelled", "archived"].includes(s)) }
        : where.status
      : { notIn: ["completed_approved", "cancelled", "archived"] };
  }
  if (search) {
    where.title = { contains: search };
  }
  if (mine) {
    where.OR = [...(where.OR || []), { createdById: user.id }, { assignees: { some: { userId: user.id } } }];
  }

  const [items, total] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        department: true,
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true, jobTitle: true, department: { select: { name: true } } } } } },
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        project: { select: { id: true, name: true, code: true } },
        costCenter: { select: { id: true, name: true, code: true } },
        subtasks: { select: { id: true, title: true, number: true, status: true, progress: true }, take: 50 },
        _count: { select: { comments: true, attachments: true, checklist: true } },
      },
    }),
    db.task.count({ where }),
  ]);

  return { items, total, page, pageSize };
});

/**
 * POST /api/tasks
 * إنشاء مهمة جديدة (مع generate number, assignees, checklist, statusHistory, notifications).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "task.create")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").toString().trim();
  if (!title) badRequest("عنوان المهمة مطلوب");

  const description = (body.description || "").toString().trim() || null;
  const type = body.type || "operational";
  const source = body.source || "independent";
  const priority = body.priority || "medium";
  const departmentId = body.departmentId || null;
  const projectId = body.projectId || null;
  const costCenterId = body.costCenterId || null;
  const parentId = body.parentId || null;
  const assigneeIds: string[] = Array.isArray(body.assigneeIds) ? body.assigneeIds.filter(Boolean) : [];
  const mainAssigneeId = body.mainAssigneeId || null;
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  const estimatedHours = body.estimatedHours != null ? Number(body.estimatedHours) : null;
  const tags = (body.tags || "").toString().trim() || null;
  const checklist: { text: string; required: boolean }[] = Array.isArray(body.checklist) ? body.checklist.filter((c: any) => c && c.text) : [];
  const isRecurring = !!body.isRecurring;
  const recurrence = body.recurrence || null;

  if (mainAssigneeId && !assigneeIds.includes(mainAssigneeId)) {
    badRequest("المسؤول الرئيسي يجب أن يكون ضمن قائمة المسندين");
  }

  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  // معاملة ذرية: توليد الرقم + الإنشاء + الإسناد + الـ checklist + سجل الحالة
  const task = await db.$transaction(async (tx) => {
    const last = await tx.task.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
    const number = (last?.number ?? 0) + 1;

    const hasAssignees = assigneeIds.length > 0;
    const status = hasAssignees ? "assigned" : "new";

    const created = await tx.task.create({
      data: {
        number,
        title,
        description,
        type,
        source,
        status,
        priority,
        progress: 0,
        orgId: user.orgId,
        departmentId,
        projectId,
        costCenterId,
        parentId,
        createdById: user.id,
        startDate,
        dueDate,
        estimatedHours,
        tags,
        isRecurring,
        recurrence,
      },
    });

    // إنشاء الإسنادات
    const createdAssignees: any[] = [];
    for (const userId of assigneeIds) {
      const isMain = mainAssigneeId ? userId === mainAssigneeId : false;
      const role = isMain ? "responsible" : "contributor";
      const ta = await tx.taskAssignee.create({
        data: { taskId: created.id, userId, role, isMain },
      });
      createdAssignees.push(ta);
    }

    // ربط المسؤول الرئيسي بالحقل المخصّص على المهمة
    if (createdAssignees.length > 0) {
      const mainTA = createdAssignees.find((t) => t.isMain) ?? createdAssignees[0];
      if (!mainTA.isMain) {
        await tx.taskAssignee.update({ where: { id: mainTA.id }, data: { isMain: true, role: "responsible" } });
      }
      await tx.task.update({ where: { id: created.id }, data: { mainAssigneeId: mainTA.id } });
    }

    // إنشاء عناصر checklist
    if (checklist.length > 0) {
      await tx.taskChecklistItem.createMany({
        data: checklist.map((c, i) => ({
          taskId: created.id,
          text: c.text,
          required: !!c.required,
          order: i,
          createdById: user.id,
        })),
      });
    }

    // سجل الحالة الأولي
    await tx.taskStatusHistory.create({
      data: {
        taskId: created.id,
        userId: user.id,
        fromStatus: null,
        toStatus: status,
        note: "تم إنشاء المهمة",
      },
    });

    return tx.task.findUnique({ where: { id: created.id }, include: { assignees: { include: { user: true } } } });
  });

  // إشعار المسندين
  if (task?.assignees) {
    for (const a of task.assignees) {
      if (a.userId !== user.id) {
        await notify({
          userId: a.userId,
          actorId: user.id,
          type: "task_assigned",
          title: `تم إسناد مهمة جديدة: ${title}`,
          body: `المهمة م-${String(task.number).padStart(4, "0")}`,
          link: `task-detail:${task.id}`,
          entityType: "task",
          entityId: task.id,
        });
      }
    }
  }

  // سجل التدقيق والنشاط
  await audit({
    user,
    action: "create",
    entityType: "task",
    entityId: task?.id,
    summary: `إنشاء مهمة: ${title}`,
    after: { title, type, priority, status: task?.status, number: task?.number },
    ip,
    userAgent: ua,
  });
  await activity({
    user,
    action: "create",
    entityType: "task",
    entityId: task?.id,
    summary: `أنشأ مهمة ${title} (#${task?.number})`,
    ip,
  });

  return task;
});
