import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit, notify } from "@/lib/audit";

/**
 * GET /api/meetings
 * قائمة الاجتماعات مع فلاتر: dateFrom, dateTo, organizerId, attendeeId,
 * search, attendedOnly. تُرتّب حسب التاريخ تنازليًا وتدعم التصفّح.
 */
export const GET = apiHandler(async (req) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const organizerId = url.searchParams.get("organizerId");
  const attendeeId = url.searchParams.get("attendeeId") === "me"
    ? user.id
    : url.searchParams.get("attendeeId");
  const attendedOnly = url.searchParams.get("attendedOnly") === "true";
  const search = url.searchParams.get("search")?.trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));

  const where: any = { organizer: { orgId: user.orgId } };
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }
  if (organizerId) where.organizerId = organizerId;
  if (attendeeId) {
    where.attendees = { some: { userId: attendeeId } };
    if (attendedOnly) where.attendees.some.attended = true;
  }
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { location: { contains: search } },
      { agenda: { contains: search } },
      { minutes: { contains: search } },
    ];
  }

  const [total, meetings] = await Promise.all([
    db.meeting.count({ where }),
    db.meeting.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        organizer: { select: { id: true, name: true, jobTitle: true } },
        attendees: { include: { user: { select: { id: true, name: true, jobTitle: true } } } },
        _count: { select: { decisions: true, tasks: true } },
      },
    }),
  ]);

  return { items: meetings, total, page, pageSize };
});

/**
 * POST /api/meetings
 * إنشاء اجتماع جديد. يتطلب صلاحية meeting.create.
 * ينشئ سجلات الحضور للمدعوين، ويكتب سجل تدقيق، ويُرسل إشعارات للحضور.
 */
export const POST = apiHandler(async (req) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "meeting.create")) throw new Error("FORBIDDEN");

  const body = await req.json();
  const { title, date, location, linkUrl, agenda, minutes, nextMeeting, attendeeIds } = body || {};
  if (!title || typeof title !== "string" || !title.trim()) badRequest("العنوان مطلوب");
  if (!date) badRequest("تاريخ الاجتماع مطلوب");

  const meetingDate = new Date(date);
  if (isNaN(meetingDate.getTime())) badRequest("تاريخ غير صالح");

  const next = nextMeeting ? new Date(nextMeeting) : null;
  if (nextMeeting && (!next || isNaN(next.getTime()))) badRequest("تاريخ الاجتماع القادم غير صالح");

  const cleanAttendeeIds = Array.isArray(attendeeIds)
    ? Array.from(new Set(attendeeIds.filter((id: any) => typeof id === "string" && id !== user.id)))
    : [];

  const meeting = await db.meeting.create({
    data: {
      title: title.trim(),
      date: meetingDate,
      location: location?.trim() || null,
      linkUrl: linkUrl?.trim() || null,
      agenda: agenda?.trim() || null,
      minutes: minutes?.trim() || null,
      nextMeeting: next,
      organizerId: user.id,
      attendees: cleanAttendeeIds.length
        ? { createMany: { data: cleanAttendeeIds.map((id: string) => ({ userId: id })) } }
        : undefined,
    },
    include: {
      organizer: { select: { id: true, name: true } },
      attendees: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "create",
    entityType: "meeting",
    entityId: meeting.id,
    after: { title: meeting.title, date: meeting.date, attendees: cleanAttendeeIds.length },
    summary: `إنشاء اجتماع «${meeting.title}» بتاريخ ${meeting.date.toISOString().slice(0, 10)}`,
    ip,
    userAgent: ua,
  });

  // إشعار الحضور بدعوتهم للاجتماع
  await Promise.all(
    cleanAttendeeIds.map((id: string) =>
      notify({
        userId: id,
        actorId: user.id,
        type: "task_assigned",
        title: `دعوة لحضور اجتماع: ${meeting.title}`,
        body: `بتاريخ ${meetingDate.toLocaleDateString("ar-SA-u-ca-gregory")}${meeting.location ? ` — ${meeting.location}` : ""}`,
        link: `meeting-detail:${meeting.id}`,
        entityType: "meeting",
        entityId: meeting.id,
      })
    )
  );

  return NextResponse.json(meeting, { status: 201 });
});
