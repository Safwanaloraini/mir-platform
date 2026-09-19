import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * GET /api/decisions?meetingId=...
 * قائمة قرارات اجتماع معيّن.
 */
export const GET = apiHandler(async (req) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const url = new URL(req.url);
  const meetingId = url.searchParams.get("meetingId");
  if (!meetingId) throw new Error("VALIDATION");

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    include: { organizer: { select: { orgId: true } } },
  });
  if (!meeting) throw new Error("NOT_FOUND");
  if (meeting.organizer.orgId !== user.orgId) throw new Error("FORBIDDEN");

  const decisions = await db.decision.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    include: {
      decidedBy: { select: { id: true, name: true } },
      task: { select: { id: true, number: true, title: true, status: true } },
    },
  });
  return { items: decisions };
});

/**
 * POST /api/decisions
 * إضافة قرار لاجتماع. يتطلب meeting.create.
 */
export const POST = apiHandler(async (req) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "meeting.create")) throw new Error("FORBIDDEN");

  const body = await req.json();
  const { meetingId, text, rationale, dueDate } = body || {};
  if (!meetingId || typeof meetingId !== "string") throw new Error("VALIDATION");
  if (!text || typeof text !== "string" || !text.trim()) throw new Error("VALIDATION");

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    include: { organizer: { select: { orgId: true } } },
  });
  if (!meeting) throw new Error("NOT_FOUND");
  if (meeting.organizer.orgId !== user.orgId) throw new Error("FORBIDDEN");

  const due = dueDate ? new Date(dueDate) : null;
  if (dueDate && (!due || isNaN(due.getTime()))) throw new Error("VALIDATION");

  const decision = await db.decision.create({
    data: {
      meetingId,
      text: text.trim(),
      rationale: typeof rationale === "string" ? (rationale.trim() || null) : null,
      dueDate: due,
      decidedById: user.id,
      status: "pending",
    },
    include: {
      decidedBy: { select: { id: true, name: true } },
    },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "create",
    entityType: "decision",
    entityId: decision.id,
    after: { meetingId, text: decision.text },
    summary: `إضافة قرار للاجتماع «${meeting.title}»: ${decision.text.slice(0, 80)}`,
    ip,
    userAgent: ua,
  });

  return NextResponse.json(decision, { status: 201 });
});
