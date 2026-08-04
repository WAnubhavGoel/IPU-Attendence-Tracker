import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";
import { ClassType, DayOfWeek } from "@prisma/client";

const DAY_ORDER: DayOfWeek[] = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"];

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionStartDate: true },
    });

    const slots = await prisma.timetableSlot.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
    });

    const grouped: Record<string, { lectures: typeof slots; labs: typeof slots }> = {};
    for (const day of DAY_ORDER) {
      grouped[day] = {
        lectures: slots.filter((s) => s.dayOfWeek === day && s.type === ClassType.LECTURE),
        labs: slots.filter((s) => s.dayOfWeek === day && s.type === ClassType.LAB),
      };
    }

    const sessionStartDateStr = user?.sessionStartDate
      ? user.sessionStartDate.toISOString().split("T")[0]
      : null;

    return NextResponse.json({
      hasTimetable: slots.length > 0,
      sessionStartDate: sessionStartDateStr,
      slots,
      grouped,
    });
  } catch (error) {
    console.error("[GET /api/timetable]", error);
    return NextResponse.json({ error: "Failed to fetch timetable" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slots, sessionStartDate } = await req.json();
    if (!Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: "At least one slot is required" }, { status: 400 });
    }

    for (const slot of slots) {
      if (!slot.subjectName?.trim()) return NextResponse.json({ error: "Each slot must have a subject name" }, { status: 400 });
      if (!DAY_ORDER.includes(slot.dayOfWeek)) return NextResponse.json({ error: `Invalid day: ${slot.dayOfWeek}` }, { status: 400 });
      if (!["LECTURE", "LAB"].includes(slot.type)) return NextResponse.json({ error: `Invalid type: ${slot.type}` }, { status: 400 });
      if (!Number.isInteger(Number(slot.count)) || Number(slot.count) < 1) return NextResponse.json({ error: "Count must be a positive integer" }, { status: 400 });
    }

    const startDateObj = sessionStartDate ? new Date(sessionStartDate) : new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { sessionStartDate: startDateObj },
      }),
      prisma.timetableSlot.deleteMany({ where: { userId } }),
      prisma.timetableSlot.createMany({
        data: slots.map((s: { dayOfWeek: DayOfWeek; subjectName: string; type: ClassType; count: number }) => ({
          userId,
          dayOfWeek: s.dayOfWeek,
          subjectName: s.subjectName.trim(),
          type: s.type,
          count: Number(s.count),
        })),
      }),
    ]);

    const saved = await prisma.timetableSlot.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
    });

    const grouped: Record<string, { lectures: typeof saved; labs: typeof saved }> = {};
    for (const day of DAY_ORDER) {
      grouped[day] = {
        lectures: saved.filter((s) => s.dayOfWeek === day && s.type === ClassType.LECTURE),
        labs: saved.filter((s) => s.dayOfWeek === day && s.type === ClassType.LAB),
      };
    }

    return NextResponse.json({
      message: "Timetable saved successfully",
      sessionStartDate: startDateObj.toISOString().split("T")[0],
      slots: saved,
      grouped,
    });
  } catch (error) {
    console.error("[POST /api/timetable]", error);
    return NextResponse.json({ error: "Failed to save timetable" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slotId, subjectName, type, count, dayOfWeek, sessionStartDate } = await req.json();

    if (sessionStartDate) {
      await prisma.user.update({
        where: { id: userId },
        data: { sessionStartDate: new Date(sessionStartDate) },
      });
    }

    if (slotId) {
      const slot = await prisma.timetableSlot.findFirst({ where: { id: slotId, userId } });
      if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

      const updated = await prisma.timetableSlot.update({
        where: { id: slotId },
        data: {
          ...(subjectName && { subjectName: subjectName.trim() }),
          ...(type && { type: type as ClassType }),
          ...(count && { count: Number(count) }),
          ...(dayOfWeek && { dayOfWeek: dayOfWeek as DayOfWeek }),
        },
      });

      return NextResponse.json({ message: "Slot updated", slot: updated });
    }

    return NextResponse.json({ message: "Session start date updated" });
  } catch (error) {
    console.error("[PATCH /api/timetable]", error);
    return NextResponse.json({ error: "Failed to update slot" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { sessionStartDate: null } }),
      prisma.attendanceLog.deleteMany({ where: { userId } }),
      prisma.subjectStat.deleteMany({ where: { userId } }),
      prisma.timetableSlot.deleteMany({ where: { userId } }),
    ]);

    return NextResponse.json({ message: "Timetable and all attendance records deleted successfully" });
  } catch (error) {
    console.error("[DELETE /api/timetable]", error);
    return NextResponse.json({ error: "Failed to delete timetable" }, { status: 500 });
  }
}
