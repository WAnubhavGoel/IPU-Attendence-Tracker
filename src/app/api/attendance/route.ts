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

    return NextResponse.json({
      date: dateStr,
      dayOfWeek,
      sessionStartDate: sessionStartDateStr,
      isBeforeSessionStart,
      scheduledSlots,
      logs: existingLogs,
      alreadySubmitted: existingLogs.length > 0,
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
        return NextResponse.json(
          { error: `Cannot log attendance before session start date (${startStr})` },
          { status: 400 }
        );
      }
    }

    // Holiday: upsert sentinel rows (heldCount=0, attendedCount=0) for every timetable slot
    // on that day. This marks the date as "logged" in loggedDateSet so analytics does NOT
    // apply the 7PM auto-penalty. Since heldCount=0, the day contributes 0 to all totals.
    if (isFullDayHoliday) {
      const dayOfWeek = getDayOfWeekFromDateStr(dateStr);
      const daySlots = await prisma.timetableSlot.findMany({
        where: { userId, dayOfWeek },
      });

      if (daySlots.length > 0) {
        for (const slot of daySlots) {
          const type: ClassType = slot.type;
          await prisma.attendanceLog.upsert({
            where: { userId_date_subjectName_type: { userId, date: targetDate, subjectName: slot.subjectName, type } },
            update: { scheduledCount: slot.count, heldCount: 0, attendedCount: 0, isTeacherAbsent: false },
            create: { userId, date: targetDate, subjectName: slot.subjectName, type, scheduledCount: slot.count, heldCount: 0, attendedCount: 0, isTeacherAbsent: false },
          });
        }
      } else {
        // No timetable slots for this day (e.g. manually chosen holiday on a no-class day)
        // Nothing to write — day stays absent from loggedDateSet which is fine since
        // there are no timetable slots to penalise anyway.
      }

      return NextResponse.json({ message: "Day marked as holiday. No classes counted.", isHoliday: true });
    }

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ error: "logs array is required" }, { status: 400 });
    }

    // Upsert each subject's attendance log for this date
    for (const log of logs) {
      const type: ClassType = log.type === "LAB" ? ClassType.LAB : ClassType.LECTURE;
      const isTeacherAbsent = Boolean(log.isTeacherAbsent);
      const finalHeldCount = isTeacherAbsent ? 0 : Math.max(0, Number(log.heldCount));
      const finalAttendedCount = isTeacherAbsent
        ? 0
        : Math.min(finalHeldCount, Math.max(0, Number(log.attendedCount)));

      await prisma.attendanceLog.upsert({
        where: { userId_date_subjectName_type: { userId, date: targetDate, subjectName: log.subjectName, type } },
        update: { scheduledCount: Number(log.scheduledCount), heldCount: finalHeldCount, attendedCount: finalAttendedCount, isTeacherAbsent },
        create: { userId, date: targetDate, subjectName: log.subjectName, type, scheduledCount: Number(log.scheduledCount), heldCount: finalHeldCount, attendedCount: finalAttendedCount, isTeacherAbsent },
      });
    }

    // No recomputeSubjectStats needed — analytics calculates fresh from AttendanceLog directly
    return NextResponse.json({ message: "Attendance saved successfully" });
  } catch (error) {
    console.error("[POST /api/attendance]", error);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}
