import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * GET /api/meetings/[id]
 * تفاصيل اجتماع كاملة: المنظِّم، الحضور، القرارات (مع المسؤول والقرار المُحوَّل)،
 * والمهام المرتبطة بالاجتماع.
 */
export const GET = apiHandler(async (req, ctx) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const { id } = await ctx.params;
  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, name: true, jobTitle: true, avatarUrl: true, orgId: true } },
      attendees: { include: { user: { select: { id: true, name: true, jobTitle: true, avatarUrl: true, department: { select: { name: true } } } } } },
      decisions: {
        orderBy: { createdAt: "asc" },
        include: {
          decidedBy: { select: { id: true, name: true } },
          task: { select: { id: true, number: true, title: true, status: true, priority: true } },
        },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        include: {
          assignees: { include: { user: { select: { id: true, name: true } } } },
          department: { select: { name: true } },
        },
      },
    },
  });

  if (!meeting) throw new Error("NOT_FOUND");
  if (meeting.organizer.orgId !== user.orgId) throw new Error("FORBIDDEN");

  return meeting;
});

/**
 * PATCH /api/meetings/[id]
 * تحديث اجتماع. يتطلب meeting.edit (المنظِّم أو من يملك الصلاحية).
 * يحدّث الحقول ويعيد ضبط قائمة الحضور.
 */
export const PATCH = apiHandler(async (req, ctx) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const { id } = await ctx.params;

  const existing = await db.meeting.findUnique({
    where: { id },
    include: { attendees: true, organizer: { select: { orgId: true } } },
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.organizer.orgId !== user.orgId) throw new Error("FORBIDDEN");

  // المنظِّم أو من يملك صلاحية meeting.edit
  const isOrganizer = existing.organizerId === user.id;
  const hasEditPerm = can(user, "meeting.edit");
  if (!isOrganizer && !hasEditPerm) throw new Error("FORBIDDEN");

  const body = await req.json();
  const {
    title, date, location, linkUrl, agenda, minutes, nextMeeting,
    attendeeIds,
  } = body || {};

  const data: any = {};
  if (typeof title === "string" && title.trim()) data.title = title.trim();
  if (date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) throw new Error("VALIDATION");
    data.date = d;
  }
  if (location !== undefined) data.location = (location as string)?.trim() || null;
  if (linkUrl !== undefined) data.linkUrl = (linkUrl as string)?.trim() || null;
  if (agenda !== undefined) data.agenda = (agenda as string)?.trim() || null;
  if (minutes !== undefined) data.minutes = (minutes as string)?.trim() || null;
  if (nextMeeting !== undefined) {
    if (nextMeeting === null) data.nextMeeting = null;
    else {
      const d = new Date(nextMeeting as string);
      if (isNaN(d.getTime())) throw new Error("VALIDATION");
      data.nextMeeting = d;
    }
  }

  // إعادة ضبط قائمة الحضور إن وُجدت
  let attendeesUpdated = false;
  if (Array.isArray(attendeeIds)) {
    const newIds = Array.from(new Set(attendeeIds.filter((x: any) => typeof x === "string"))) as string[];
    const existingIds = existing.attendees.map((a) => a.userId);
    const toAdd = newIds.filter((x) => !existingIds.includes(x));
    const toRemove = existingIds.filter((x) => !newIds.includes(x));
    if (toRemove.length) {
      await db.meetingAttendee.deleteMany({ where: { meetingId: id, userId: { in: toRemove } } });
    }
    if (toAdd.length) {
      await db.meetingAttendee.createMany({
        data: toAdd.map((userId) => ({ meetingId: id, userId })),
      });
    }
    attendeesUpdated = true;
  }

  const updated = await db.meeting.update({
    where: { id },
    data,
    include: {
      organizer: { select: { id: true, name: true, jobTitle: true } },
      attendees: { include: { user: { select: { id: true, name: true, jobTitle: true } } } },
      _count: { select: { decisions: true, tasks: true } },
    },
  });

  const ip = getClientIp(req);
  const ua = getUserAgent(req);
  await audit({
    user,
    action: "update",
    entityType: "meeting",
    entityId: id,
    before: { title: existing.title, date: existing.date, location: existing.location, linkUrl: existing.linkUrl },
    after: { title: updated.title, date: updated.date, location: updated.location, linkUrl: updated.linkUrl, attendeesUpdated },
    summary: `تحديث اجتماع «${updated.title}»${attendeesUpdated ? " (مع تحديث قائمة الحضور)" : ""}`,
    ip,
    userAgent: ua,
  });

  return updated;
});
