import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can, canApproveRequest } from "@/lib/permissions";
import { apiHandler, badRequest, notFound, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";

const PENDING_STATUSES = ["under_review", "preliminarily_approved", "awaiting_final"];

function requestNumber(n: number): string {
  return `ط-${String(n).padStart(4, "0")}`;
}

/**
 * POST /api/requests/[id]/action
 * اتخاذ إجراء اعتماد: approve | reject | return | forward
 */
export const POST = apiHandler(async (req: Request, ctx: any) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { action, note, rejectionReason } = body as any;

  if (!action || !["approve", "reject", "return", "forward"].includes(action)) {
    badRequest("إجراء غير صالح");
  }

  const request = await db.request.findUnique({
    where: { id },
    include: {
      requestType: true,
      workflow: { include: { steps: { orderBy: { order: "asc" } } } },
      currentStep: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!request) { notFound(); return; }

  const fromStatus = request.status;
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  // ============== الاعتماد / الرفض / الإعادة ==============
  if (action === "approve" || action === "reject" || action === "return") {
    // صلاحية الاعتماد + فصل الصلاحيات (لا يحق للمستخدم اعتماد طلب أنشأه)
    if (!can(user, "request.approve")) throw new Error("FORBIDDEN");
    if (!canApproveRequest(user, request.createdById)) {
      throw new Error("FORBIDDEN");
    }
    // التأكد أن المستخدم هو الجهة الحالية للاعتماد
    if (request.currentApproverRole !== user.role) {
      throw new Error("FORBIDDEN");
    }
    // التأكد من أن الطلب في حالة قابلة للإجراء
    if (!PENDING_STATUSES.includes(request.status)) {
      badRequest("الطلب ليس في حالة قابلة للاعتماد");
    }
  }

  let toStatus: string = request.status;
  let newStepId: string | null = request.currentStepId;
  let newApproverRole: string | null = request.currentApproverRole;
  let assignedToId: string | null = request.assignedToId;

  if (action === "reject") {
    if (!rejectionReason || !rejectionReason.trim()) {
      badRequest("سبب الرفض مطلوب");
    }
    toStatus = "rejected";
    newStepId = request.currentStepId; // نبقى على نفس الخطوة كمرجع
    newApproverRole = null;
    await db.request.update({
      where: { id },
      data: {
        status: toStatus,
        rejectionReason: rejectionReason.trim(),
        currentApproverRole: null,
      },
    });
    // إشعار المنشئ
    await notify({
      userId: request.createdById,
      actorId: user.id,
      type: "rejected",
      title: `تم رفض طلبك: ${request.title}`,
      body: rejectionReason.trim(),
      link: `request-detail:${request.id}`,
      entityType: "request",
      entityId: request.id,
    });
  } else if (action === "return") {
    if (!note || !note.trim()) badRequest("ملاحظة الإعادة للاستكمال مطلوبة");
    toStatus = "needs_completion";
    newApproverRole = null;
    await db.request.update({
      where: { id },
      data: {
        status: toStatus,
        currentApproverRole: null,
      },
    });
    await notify({
      userId: request.createdById,
      actorId: user.id,
      type: "returned",
      title: `أُعيد طلبك للاستكمال: ${request.title}`,
      body: note.trim(),
      link: `request-detail:${request.id}`,
      entityType: "request",
      entityId: request.id,
    });
  } else if (action === "approve") {
    const currentStep = request.currentStep;
    const steps = request.workflow?.steps ?? [];
    const isFinal = currentStep?.isFinal || steps.length === 0 || (currentStep?.order ?? 0) >= steps[steps.length - 1].order;

    if (isFinal || steps.length === 0) {
      // الاعتماد النهائي → تحويل تلقائي للمحاسب
      const accountant = await db.user.findFirst({
        where: { role: "accountant", orgId: user.orgId, status: "active" },
      });
      toStatus = "forwarded_accountant";
      assignedToId = accountant?.id ?? null;
      newApproverRole = "accountant";
      // لاحفظ الـ status معتمد أولاً (للسجل) ثم حول للمحاسب
      await db.request.update({
        where: { id },
        data: {
          status: toStatus,
          assignedToId: accountant?.id ?? null,
          currentApproverRole: "accountant",
          currentStepId: null,
        },
      });
      // إشعار المحاسب
      if (accountant) {
        await notify({
          userId: accountant.id,
          actorId: user.id,
          type: "approval_required",
          title: `طلب محوّل إليك للتنفيذ: ${request.title}`,
          body: `${requestNumber(request.number)} — ${request.refCode ?? ""}`,
          link: `request-detail:${request.id}`,
          entityType: "request",
          entityId: request.id,
        });
      }
      // إشعار المنشئ بالاعتماد
      await notify({
        userId: request.createdById,
        actorId: user.id,
        type: "approved",
        title: `تم اعتماد طلبك: ${request.title}`,
        body: `تم تحويله للمحاسب للتنفيذ.`,
        link: `request-detail:${request.id}`,
        entityType: "request",
        entityId: request.id,
      });
    } else {
      // الانتقال للخطوة التالية
      const nextStep = steps.find((s) => s.order > (currentStep?.order ?? 0));
      if (!nextStep) { badRequest("لا توجد خطوة تالية في مسار الاعتماد"); return; }
      toStatus = nextStep.isFinal ? "awaiting_final" : "preliminarily_approved";
      newStepId = nextStep.id;
      newApproverRole = nextStep.approverRole;
      await db.request.update({
        where: { id },
        data: {
          status: toStatus,
          currentStepId: nextStep.id,
          currentApproverRole: nextStep.approverRole,
        },
      });
      // إشعار المعتمد التالي
      const nextApprovers = await db.user.findMany({
        where: { role: nextStep.approverRole, orgId: user.orgId, status: "active" },
      });
      for (const ap of nextApprovers) {
        if (ap.id !== request.createdById) {
          await notify({
            userId: ap.id,
            actorId: user.id,
            type: "approval_required",
            title: `طلب بانتظار اعتمادك: ${request.title}`,
            body: `${requestNumber(request.number)} — ${request.refCode ?? ""}`,
            link: `request-detail:${request.id}`,
            entityType: "request",
            entityId: request.id,
          });
        }
      }
      // إشعار المنشئ بالاعتماد المبدئي
      await notify({
        userId: request.createdById,
        actorId: user.id,
        type: "approved",
        title: `تم اعتماد طلبك مبدئيًا: ${request.title}`,
        body: `تم الانتقال للخطوة التالية في مسار الاعتماد.`,
        link: `request-detail:${request.id}`,
        entityType: "request",
        entityId: request.id,
      });
    }
  } else if (action === "forward") {
    // التنفيذ (للمحاسب فقط)
    if (!can(user, "request.execute")) throw new Error("FORBIDDEN");
    if (user.role !== "accountant") throw new Error("FORBIDDEN");
    if (request.assignedToId !== user.id) throw new Error("FORBIDDEN");

    if (request.status === "forwarded_accountant") {
      toStatus = "in_execution";
    } else if (request.status === "in_execution") {
      toStatus = "fully_executed";
    } else if (request.status === "fully_executed") {
      toStatus = "closed";
    } else {
      badRequest("لا يمكن اتخاذ إجراء تنفيذ على الطلب في حالته الحالية");
    }

    await db.request.update({
      where: { id },
      data: { status: toStatus },
    });

    // إشعار المنشئ بتقدم التنفيذ
    const statusLabel: Record<string, string> = {
      in_execution: "بدء التنفيذ",
      fully_executed: "إتمام التنفيذ",
      closed: "إغلاق الطلب",
    };
    await notify({
      userId: request.createdById,
      actorId: user.id,
      type: "status_change",
      title: `تحديث تنفيذ طلبك: ${request.title}`,
      body: statusLabel[toStatus] ?? toStatus,
      link: `request-detail:${request.id}`,
      entityType: "request",
      entityId: request.id,
    });
  }

  // تسجيل الإجراء
  await db.approvalAction.create({
    data: {
      requestId: id,
      stepId: action === "approve" || action === "reject" ? request.currentStepId : null,
      userId: user.id,
      action,
      note: note?.trim() || rejectionReason?.trim() || null,
      fromStatus,
      toStatus,
    },
  });

  await activity({
    user,
    action: action === "approve" ? "approve" : action === "reject" ? "reject" : action === "return" ? "status_change" : "status_change",
    entityType: "request",
    entityId: id,
    summary: `${actionLabel(action)} على الطلب «${request.title}» (${requestNumber(request.number)})`,
    ip,
  });

  await audit({
    user,
    action: action === "approve" ? "approve" : action === "reject" ? "reject" : action === "return" ? "status_change" : "status_change",
    entityType: "request",
    entityId: id,
    before: { status: fromStatus },
    after: { status: toStatus },
    summary: `${actionLabel(action)} على ${request.refCode ?? requestNumber(request.number)}`,
    ip,
    userAgent: ua,
  });

  // إرجاع الطلب محدّثًا
  const updated = await db.request.findUnique({
    where: { id },
    include: {
      requestType: true,
      workflow: { include: { steps: { orderBy: { order: "asc" } } } },
      currentStep: true,
      costCenter: true,
      vendor: true,
      project: true,
      createdBy: { select: { id: true, name: true, nameEn: true, role: true, jobTitle: true, department: { select: { name: true } } } },
      assignedTo: { select: { id: true, name: true, role: true, jobTitle: true } },
      attachments: true,
      actions: { include: { user: { select: { id: true, name: true, role: true } }, step: true }, orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      task: { select: { id: true, number: true, title: true, status: true } },
    },
  });

  // إرفاق بيانات مستخدمي الملاحظات (لا توجد علاقة مباشرة في المخطط)
  let notesWithUser: any[] = [];
  if (updated) {
    const noteUserIds = [...new Set(updated.notes.map((n) => n.userId))];
    const noteUsers = noteUserIds.length
      ? await db.user.findMany({ where: { id: { in: noteUserIds } }, select: { id: true, name: true, role: true } })
      : [];
    const userMap = new Map(noteUsers.map((u) => [u.id, u]));
    notesWithUser = updated.notes.map((n) => ({ ...n, user: userMap.get(n.userId) ?? null }));
  }

  return updated ? { ...updated, notes: notesWithUser } : null;
});

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    approve: "اعتماد",
    reject: "رفض",
    return: "إعادة للاستكمال",
    forward: "تنفيذ",
  };
  return map[action] ?? action;
}
