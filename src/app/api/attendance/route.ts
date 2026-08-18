import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";
import { ClassType, DayOfWeek } from "@prisma/client";

const JS_DAY_MAP: DayOfWeek[] = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];

function getDayOfWeekFromDateStr(dateStr: string): DayOfWeek {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return JS_DAY_MAP[date.getDay()];
}

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionStartDate: true },
    });

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") || getTodayDateStr();
    const dayOfWeek = getDayOfWeekFromDateStr(dateStr);

    const sessionStartDateStr = user?.sessionStartDate
      ? user.sessionStartDate.toISOString().split("T")[0]
      : null;

    const isBeforeSessionStart = Boolean(
      sessionStartDateStr && dateStr < sessionStartDateStr
    );

    const scheduledSlots = await prisma.timetableSlot.findMany({
      where: { userId, dayOfWeek },
      orderBy: { type: "asc" },
    });

    const existingLogs = await prisma.attendanceLog.findMany({
      where: { userId, date: new Date(dateStr) },
    });

    const isHoliday =
      existingLogs.length > 0 &&
      existingLogs.every(
        (l) => l.heldCount === 0 && l.attendedCount === 0 && !l.isTeacherAbsent
      );

    return NextResponse.json({
      date: dateStr,
      dayOfWeek,
      sessionStartDate: sessionStartDateStr,
      isBeforeSessionStart,
      scheduledSlots,
      logs: existingLogs,
      alreadySubmitted: existingLogs.length > 0,
      isHoliday,
    });
  } catch (error) {
    console.error("[GET /api/attendance]", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { date: dateStr, isFullDayHoliday, logs } = await req.json();
    if (!dateStr) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    const targetDate = new Date(dateStr);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionStartDate: true },
    });

    if (user?.sessionStartDate) {
      const startStr = user.sessionStartDate.toISOString().split("T")[0];
      if (dateStr < startStr) {
        return NextResponse.json({ error: `Cannot log attendance before session start date (${startStr})` }, { status: 400 });
      }
    }

    if (isFullDayHoliday) {
      const dayOfWeek = getDayOfWeekFromDateStr(dateStr);
      const daySlots = await prisma.timetableSlot.findMany({
        where: { userId, dayOfWeek },
      });

      if (daySlots.length > 0) {
        for (const slot of daySlots) {
          const type: ClassType = slot.type;
          await prisma.attendanceLog.upsert({
            where: {
              userId_date_subjectName_type: {
                userId,
                date: targetDate,
                subjectName: slot.subjectName,
                type,
              },
            },
            update: {
              scheduledCount: slot.count,
              heldCount: 0,
              attendedCount: 0,
              isTeacherAbsent: false,
            },
            create: {
              userId,
              date: targetDate,
              subjectName: slot.subjectName,
              type,
              scheduledCount: slot.count,
              heldCount: 0,
              attendedCount: 0,
              isTeacherAbsent: false,
            },
          });
        }
      }

      await recomputeSubjectStats(userId);
      return NextResponse.json({ message: "Day marked as holiday. No classes counted.", isHoliday: true });
    }

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ error: "logs array is required" }, { status: 400 });
    }

    for (const log of logs) {
      const type: ClassType = log.type === "LAB" ? ClassType.LAB : ClassType.LECTURE;
      const isTeacherAbsent = Boolean(log.isTeacherAbsent);
      const finalHeldCount = isTeacherAbsent ? 0 : Math.max(0, Number(log.heldCount));
      const finalAttendedCount = isTeacherAbsent ? 0 : Math.min(finalHeldCount, Math.max(0, Number(log.attendedCount)));

      await prisma.attendanceLog.upsert({
        where: { userId_date_subjectName_type: { userId, date: targetDate, subjectName: log.subjectName, type } },
        update: { scheduledCount: Number(log.scheduledCount), heldCount: finalHeldCount, attendedCount: finalAttendedCount, isTeacherAbsent },
        create: { userId, date: targetDate, subjectName: log.subjectName, type, scheduledCount: Number(log.scheduledCount), heldCount: finalHeldCount, attendedCount: finalAttendedCount, isTeacherAbsent },
      });
    }

    await recomputeSubjectStats(userId);
    return NextResponse.json({ message: "Attendance saved successfully" });
  } catch (error) {
    console.error("[POST /api/attendance]", error);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}

async function recomputeSubjectStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionStartDate: true },
  });

  const whereClause: { userId: string; date?: { gte: Date } } = { userId };
  if (user?.sessionStartDate) {
    whereClause.date = { gte: user.sessionStartDate };
  }

  const allLogs = await prisma.attendanceLog.findMany({ where: whereClause });
  const agg: Record<string, { subjectName: string; type: ClassType; totalHeld: number; totalAttended: number }> = {};

  for (const log of allLogs) {
    const key = `${log.subjectName}|||${log.type}`;
    if (!agg[key]) agg[key] = { subjectName: log.subjectName, type: log.type, totalHeld: 0, totalAttended: 0 };
    agg[key].totalHeld += log.heldCount;
    agg[key].totalAttended += log.attendedCount;
  }

  for (const stat of Object.values(agg)) {
    await prisma.subjectStat.upsert({
      where: { userId_subjectName_type: { userId, subjectName: stat.subjectName, type: stat.type } },
      update: { totalHeld: stat.totalHeld, totalAttended: stat.totalAttended },
      create: { userId, subjectName: stat.subjectName, type: stat.type, totalHeld: stat.totalHeld, totalAttended: stat.totalAttended },
    });
  }

  const validKeys = new Set(Object.values(agg).map((s) => `${s.subjectName}|||${s.type}`));
  const allStats = await prisma.subjectStat.findMany({ where: { userId } });
  const toDelete = allStats.filter((s) => !validKeys.has(`${s.subjectName}|||${s.type}`));
  if (toDelete.length > 0) {
    await prisma.subjectStat.deleteMany({ where: { id: { in: toDelete.map((s) => s.id) } } });
  }
}
