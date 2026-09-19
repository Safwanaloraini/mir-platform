import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, getClientIp, getUserAgent } from "@/lib/api";
import { audit, activity, notify } from "@/lib/audit";

/**
 * POST /api/decisions/[id]/convert
 * تحويل قرار إلى مهمة. معاملة ذرّية:
 *   1) توليد رقم مهمة جديد (max + 1)
 *   2) إنشاء المهمة + TaskAssignee رئيسي + TaskStatusHistory
 *   3) ربط القرار بالمهمة وتحديث حالته إلى "converted"
 *   4) كتابة التدقيق والنشاط
 *   5) إشعار المسؤول والمنظِّم
 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "task.create")) throw new Error("FORBIDDEN");

  const { id: decisionId } = await ctx.params;

  const body = await req.json();
  const { assigneeId, dueDate, priority, departmentId } = body || {};

  if (!assigneeId || typeof assigneeId !== "string") throw new Error("VALIDATION");

  const decision = await db.decision.findUnique({
    where: { id: decisionId },
    include: {
      meeting: { include: { organizer: { select: { id: true, name: true, orgId: true } } } },
      decidedBy: { select: { id: true, name: true } },
    },
  });
  if (!decision) throw new Error("NOT_FOUND");
  if (!decision.meeting) throw new Error("VALIDATION");
  if (decision.meeting.organizer.orgId !== user.orgId) throw new Error("FORBIDDEN");
  if (decision.status !== "pending") throw new Error("VALIDATION");

  const meeting = decision.meeting;
  const organizer = meeting.organizer;

  const assignee = await db.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, name: true, orgId: true },
  });
  if (!assignee) throw new Error("VALIDATION");
  if (assignee.orgId !== user.orgId) throw new Error("FORBIDDEN");

  const due = dueDate ? new Date(dueDate) : null;
  if (dueDate && (!due || isNaN(due.getTime()))) throw new Error("VALIDATION");

  const prio = typeof priority === "string" && ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium";
  const title = decision.text.length > 120 ? decision.text.slice(0, 117) + "…" : decision.text;

  // معاملة ذرّية لإنشاء المهمة وربطها بالقرار
  const result = await db.$transaction(async (tx) => {
    // 1) توليد رقم المهمة
    const lastTask = await tx.task.aggregate({ _max: { number: true } });
    const newNumber = (lastTask._max.number ?? 0) + 1;

    // 2) إنشاء المهمة
    const task = await tx.task.create({
      data: {
        number: newNumber,
        title,
        description: decision.text + (decision.rationale ? `\n\nالمبررات: ${decision.rationale}` : ""),
        type: "administrative",
        source: "decision",
        status: "assigned",
        priority: prio,
        progress: 0,
        orgId: user.orgId,
        departmentId: departmentId || null,
        meetingId: decision.meetingId,
        decisionId: decision.id,
        createdById: user.id,
        dueDate: due,
        // إنشاء إسناد رئيسي
        assignees: {
          create: [{ userId: assigneeId, role: "responsible", isMain: true }],
        },
      },
    });

    // تحديث mainAssigneeId بالعلاقة الفريدة
    const mainAssignee = await tx.taskAssignee.findFirst({
      where: { taskId: task.id, userId: assigneeId },
    });
    if (mainAssignee) {
      await tx.task.update({
        where: { id: task.id },
        data: { mainAssigneeId: mainAssignee.id },
      });
    }

    // 3) سجل حالة المهمة
    await tx.taskStatusHistory.create({
      data: {
        taskId: task.id,
        userId: user.id,
        fromStatus: null,
        toStatus: "assigned",
        note: "تحويل قرار إلى مهمة",
      },
    });

    // 4) ربط القرار بالمهمة وتحديث الحالة
    const updatedDecision = await tx.decision.update({
      where: { id: decision.id },
      data: { status: "converted" },
    });

    return { task, decision: updatedDecision, mainAssignee };
  });

  // 5) تدقيق ونشاط وإشعارات (خارج المعاملة)
  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "create",
    entityType: "task",
    entityId: result.task.id,
    after: { number: result.task.number, title: result.task.title, decisionId: decision.id, meetingId: decision.meetingId, assigneeId },
    summary: `تحويل قرار إلى مهمة ${result.task.number} «${result.task.title}» وإسنادها إلى ${assignee.name}`,
    ip,
    userAgent: ua,
  });
  await audit({
    user,
    action: "status_change",
    entityType: "decision",
    entityId: decision.id,
    before: { status: "pending" },
    after: { status: "converted", taskId: result.task.id },
    summary: `تحويل القرار «${decision.text.slice(0, 60)}» إلى مهمة`,
    ip,
    userAgent: ua,
  });

  await activity({
    user,
    action: "decision_converted",
    entityType: "task",
    entityId: result.task.id,
    summary: `حوّل قرارًا إلى مهمة «${result.task.title}» وأسندها إلى ${assignee.name}`,
    ip,
  });

  // إشعار المسؤول بالموكل إليه
  await notify({
    userId: assigneeId,
    actorId: user.id,
    type: "task_assigned",
    title: `تم إسناد مهمة جديدة: ${result.task.title}`,
    body: `مهمة رقم ${result.task.number} — مصدرها قرار من اجتماع «${meeting.title}»`,
    link: `task-detail:${result.task.id}`,
    entityType: "task",
    entityId: result.task.id,
  });

  // إشعار منظِّم الاجتماع أن قراره تحوّل
  if (organizer.id !== user.id) {
    await notify({
      userId: organizer.id,
      actorId: user.id,
      type: "decision_converted",
      title: `تم تحويل قرار من اجتماع «${meeting.title}» إلى مهمة`,
      body: `المهمة رقم ${result.task.number} «${result.task.title}» — المسؤول: ${assignee.name}`,
      link: `task-detail:${result.task.id}`,
      entityType: "decision",
      entityId: decision.id,
    });
  }

  return NextResponse.json({ task: result.task, decision: result.decision }, { status: 201 });
});
