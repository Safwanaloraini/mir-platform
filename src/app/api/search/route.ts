import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can, canAny } from "@/lib/permissions";
import { apiHandler } from "@/lib/api";
import { taskNumber, requestNumber } from "@/lib/constants";

/**
 * GET /api/search?q=
 * بحث شامل عبر: المهام، الطلبات، الاجتماعات، القرارات.
 * - المهام:    view.all أو view.own (creator/assignee).
 * - الطلبات:   view.all أو view.own (creator).
 * - الاجتماعات: meeting.create أو كان حاضرًا.
 * - القرارات:  تُعاد فقط ضمن الاجتماعات التي يحق له رؤيتها.
 *
 * الحد الأقصى: 5 نتائج لكل نوع.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) return { results: [] };

  const contains = { contains: q };

  const results: Array<{
    type: "task" | "request" | "meeting" | "decision";
    typeLabel: string;
    id: string;
    title: string;
    ref: string;
  }> = [];

  // المهام
  const canViewAllTasks = can(user, "task.view.all");
  if (canViewAllTasks || can(user, "task.view.own")) {
    const tasks = await db.task.findMany({
      where: {
        ...(canViewAllTasks ? { orgId: user.orgId } : { OR: [{ createdById: user.id }, { assignees: { some: { userId: user.id } } }] }),
        AND: [{ OR: [{ title: contains }, { description: contains }, { tags: contains }] }],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, number: true, title: true },
    });
    for (const t of tasks) {
      results.push({
        type: "task",
        typeLabel: "مهمة",
        id: t.id,
        title: t.title,
        ref: taskNumber(t.number),
      });
    }
  }

  // الطلبات
  const canViewAllReq = can(user, "request.view.all");
  if (canViewAllReq || can(user, "request.view.own")) {
    const requests = await db.request.findMany({
      where: {
        ...(canViewAllReq ? {} : { createdById: user.id }),
        AND: [{ OR: [{ title: contains }, { purpose: contains }, { refCode: contains }, { beneficiary: contains }] }],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, number: true, refCode: true, title: true },
    });
    for (const r of requests) {
      results.push({
        type: "request",
        typeLabel: "طلب",
        id: r.id,
        title: r.title,
        ref: r.refCode || requestNumber(r.number),
      });
    }
  }

  // الاجتماعات
  if (can(user, "meeting.create") || canAny(user, ["meeting.edit"])) {
    const meetings = await db.meeting.findMany({
      where: {
        OR: [
          { organizerId: user.id },
          { attendees: { some: { userId: user.id } } },
          ...(can(user, "meeting.edit") ? [{ id: { not: undefined } }] : []),
        ],
        AND: [{ OR: [{ title: contains }, { agenda: contains }, { minutes: contains }, { location: contains }] }],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, date: true },
    });
    for (const m of meetings) {
      results.push({
        type: "meeting",
        typeLabel: "اجتماع",
        id: m.id,
        title: m.title,
        ref: "—",
      });
    }
  }

  // القرارات — تُعاد ضمن الاجتماعات التي يحق رؤيتها فقط
  if (can(user, "meeting.create")) {
    const decisions = await db.decision.findMany({
      where: {
        OR: [
          { decidedById: user.id },
          { meeting: { organizerId: user.id } },
          { meeting: { attendees: { some: { userId: user.id } } } },
        ],
        AND: [{ OR: [{ text: contains }, { rationale: contains }] }],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, text: true },
    });
    for (const d of decisions) {
      results.push({
        type: "decision",
        typeLabel: "قرار",
        id: d.id,
        title: d.text.length > 80 ? d.text.slice(0, 80) + "…" : d.text,
        ref: "—",
      });
    }
  }

  return { results };
});
