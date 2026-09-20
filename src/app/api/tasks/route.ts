import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";
import {
  parseSort,
  buildOrderBy,
  PRIORITY_ORDER,
  STATUS_ORDER,
  type SortOption,
} from "@/lib/task-utils";

const TASK_INCLUDE = {
  department: true,
  assignees: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          jobTitle: true,
          department: { select: { name: true } },
        },
      },
    },
  },
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  project: { select: { id: true, name: true, code: true } },
  costCenter: { select: { id: true, name: true, code: true } },
  subtasks: { select: { id: true, title: true, number: true, status: true, progress: true }, take: 50 },
  // V1: التبعيات لتمكين حساب isBlocked من جانب العميل (في الكانبان)
  dependencies: {
    include: {
      dependsOn: { select: { id: true, title: true, number: true, status: true } },
    },
    take: 50,
  },
  _count: { select: { comments: true, attachments: true, checklist: true } },
};

const TERMINAL_STATUSES = ["completed_approved", "cancelled", "archived"];

/**
 * GET /api/tasks
 * قائمة المهام مع فلاتر متقدمة + ترتيب ذكي + تجميع + صفقات.
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
  const mineParam = sp.get("mine");
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(sp.get("pageSize") || "20", 10) || 20));

  // V1: فلترة تاريخية
  const dueBefore = sp.get("dueBefore");
  const dueAfter = sp.get("dueAfter");

  // V1: فلترة المرفقات
  const hasAttachments = sp.get("hasAttachments") === "true";
  const missingAttachments = sp.get("missingAttachments") === "true";

  // V1: فلترة الوسوم (comma separated, match ANY)
  const tagsParam = sp.get("tags");

  // V1: ترتيب وتجميع
  const sortParam = sp.get("sort") || undefined;
  const groupBy = sp.get("groupBy") || undefined;

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
  if (priority) {
    const priorities = priority.split(",").map((s) => s.trim()).filter(Boolean);
    if (priorities.length === 1) where.priority = priorities[0];
    else if (priorities.length > 1) where.priority = { in: priorities };
  }
  if (type) {
    const types = type.split(",").map((s) => s.trim()).filter(Boolean);
    if (types.length === 1) where.type = types[0];
    else if (types.length > 1) where.type = { in: types };
  }
  if (departmentId) where.departmentId = departmentId;
  if (projectId) where.projectId = projectId;
  if (assigneeId) where.assignees = { some: { userId: assigneeId } };

  // overdue + stalled معًا — لا يطغى أحدهما على الآخر
  if (overdue && stalled) {
    where.status = "stalled";
    where.dueDate = { lt: new Date() };
  } else if (stalled) {
    where.status = "stalled";
  } else if (overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { notIn: TERMINAL_STATUSES };
  }

  // dueBefore / dueAfter
  if (dueBefore || dueAfter) {
    const range: any = {};
    if (dueBefore) {
      const d = new Date(dueBefore);
      if (!isNaN(d.getTime())) range.lt = d;
    }
    if (dueAfter) {
      const d = new Date(dueAfter);
      if (!isNaN(d.getTime())) range.gte = d;
    }
    where.dueDate = where.dueDate ? { ...where.dueDate, ...range } : range;
  }

  if (search) {
    where.title = { contains: search };
  }

  // mine: assigned/created/following/all (true = all for backward compat)
  if (mineParam) {
    if (mineParam === "true" || mineParam === "all") {
      where.OR = [
        ...(where.OR || []),
        { createdById: user.id },
        { assignees: { some: { userId: user.id } } },
      ];
    } else if (mineParam === "assigned") {
      where.assignees = where.assignees
        ? { ...where.assignees, some: { userId: user.id } }
        : { some: { userId: user.id } };
    } else if (mineParam === "created") {
      where.createdById = user.id;
    } else if (mineParam === "following") {
      where.assignees = where.assignees
        ? { ...where.assignees, some: { userId: user.id, role: "follower" } }
        : { some: { userId: user.id, role: "follower" } };
    }
  }

  // hasAttachments / missingAttachments
  if (hasAttachments) {
    where.attachments = { some: {} };
  } else if (missingAttachments) {
    where.attachments = { none: {} };
  }

  // tags (comma separated, match ANY via contains)
  if (tagsParam) {
    const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length === 1) {
      where.tags = { contains: tags[0] };
    } else if (tags.length > 1) {
      where.OR = [...(where.OR || []), ...tags.map((t) => ({ tags: { contains: t } }))];
    }
  }

  const sort: SortOption = parseSort(sortParam);
  const orderBy = buildOrderBy(sort);

  // للترتيب المنطقي للأولوية/الحالة: نأخذ كل النتائج ونرتب في الذاكرة ثم نقسّم الصفحات
  let items: any[];
  let total: number;

  if (sort.field === "priority" || sort.field === "status") {
    // نأخذ كل المهام المطابقة (مع حد معقول للأداء) ونرتبها منطقيًا
    const allItems = await db.task.findMany({
      where,
      orderBy,
      take: 2000,
      include: TASK_INCLUDE,
    });
    total = allItems.length;
    const dirMul = sort.dir === "asc" ? 1 : -1;
    const sorted = [...allItems].sort((a, b) => {
      const av =
        sort.field === "priority"
          ? PRIORITY_ORDER[a.priority] ?? 0
          : STATUS_ORDER[a.status] ?? 99;
      const bv =
        sort.field === "priority"
          ? PRIORITY_ORDER[b.priority] ?? 0
          : STATUS_ORDER[b.status] ?? 99;
      if (av !== bv) return (av - bv) * dirMul;
      // ترتيب ثانوي
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    items = sorted.slice((page - 1) * pageSize, page * pageSize);
  } else {
    [items, total] = await Promise.all([
      db.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: TASK_INCLUDE,
      }),
      db.task.count({ where }),
    ]);
  }

  return { items, total, page, pageSize, sort: sortParam ?? "createdAt:desc", groupBy: groupBy ?? null };
});

/**
 * POST /api/tasks
 * إنشاء مهمة جديدة (مع generate number, assignees, checklist, statusHistory, notifications).
 *
 * V1: تحقق إضافي — للمهام الجدية (operational/financial/administrative/followup)
 * يجب توفير assigneeIds و priority و dueDate.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "task.create")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").toString().trim();
  if (!title) badRequest("عنوان المهمة مطلوب");

  const description = (body.description || "").toString().trim() || null;
  const type = (body.type || "operational").toString();
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
  const checklist: { text: string; required: boolean }[] = Array.isArray(body.checklist)
    ? body.checklist.filter((c: any) => c && c.text)
    : [];
  const isRecurring = !!body.isRecurring;
  const recurrence = body.recurrence || null;

  // V1: حقول جديدة
  const definitionOfDone =
    body.definitionOfDone != null ? String(body.definitionOfDone).trim() || null : null;
  const storyPoints =
    body.storyPoints != null ? Math.max(0, parseInt(body.storyPoints, 10) || 0) || null : null;
  const waitingReason =
    body.waitingReason != null ? String(body.waitingReason).trim() || null : null;

  // التحقق: المهام الجدية (غير المسودات والاستراتيجية) تتطلب مسؤولًا وأولوية وموعدًا
  const SERIOUS_TYPES = ["operational", "financial", "administrative", "followup"];
  if (SERIOUS_TYPES.includes(type)) {
    if (assigneeIds.length === 0) {
      badRequest("المهام الجدية تتطلب إسناد مسؤول واحد على الأقل");
    }
    if (!priority) {
      badRequest("المهام الجدية تتطلب تحديد الأولوية");
    }
    if (!dueDate) {
      badRequest("المهام الجدية تتطلب تحديد الموعد النهائي");
    }
  }

  if (mainAssigneeId && !assigneeIds.includes(mainAssigneeId)) {
    badRequest("المسؤول الرئيسي يجب أن يكون ضمن قائمة المسندين");
  }

  // V1: التحقق من parentId — يجب أن يكون موجودًا وفي نفس المؤسسة
  if (parentId) {
    const parent = await db.task.findUnique({
      where: { id: parentId },
      select: { id: true, orgId: true },
    });
    if (!parent) {
      badRequest("المهمة الأب غير موجودة");
      return;
    }
    if (parent.orgId !== user.orgId) {
      badRequest("المهمة الأب يجب أن تكون في نفس المؤسسة");
      return;
    }
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
        version: 1,
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
        definitionOfDone,
        storyPoints,
        waitingReason,
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

    // سجل الحالة الأولي (TaskStatusHistory)
    await tx.taskStatusHistory.create({
      data: {
        taskId: created.id,
        userId: user.id,
        fromStatus: null,
        toStatus: status,
        note: "تم إنشاء المهمة",
      },
    });

    // V1: سجل TaskStatusTransition الأولي
    await tx.taskStatusTransition.create({
      data: {
        taskId: created.id,
        fromStatus: null,
        toStatus: status,
        userId: user.id,
        note: "تم إنشاء المهمة",
        enteredAt: created.createdAt ?? new Date(),
        exitedAt: null,
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
    after: {
      title,
      type,
      priority,
      status: task?.status,
      number: task?.number,
      definitionOfDone,
      storyPoints,
      hasAssignees: assigneeIds.length > 0,
    },
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
