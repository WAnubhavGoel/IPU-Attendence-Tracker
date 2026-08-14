import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";
import { ClassType } from "@prisma/client";

// ── Pure math helpers ──────────────────────────────────────────────────────

function calcMetrics(totalHeld: number, totalAttended: number) {
  const pct = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 100;
  const percentage = Math.round(pct * 10) / 10;
  const bunkMargin =
    percentage >= 50 ? Math.max(0, Math.floor(2 * totalAttended - totalHeld)) : 0;
  const recoveryCount =
    percentage < 50 ? Math.max(0, Math.ceil(totalHeld - 2 * totalAttended)) : 0;
  const status: "SAFE" | "WARNING" | "CRITICAL" =
    pct < 50 ? "CRITICAL" : pct < 60 ? "WARNING" : "SAFE";
  return { percentage, bunkMargin, recoveryCount, status };
}

const r = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : 100;

// ── IST helpers ────────────────────────────────────────────────────────────

/** Convert any UTC Date → "YYYY-MM-DD" string in IST */
function toISTDateStr(date: Date): string {
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Current IST hour (0-23) */
function getISTHour(): number {
  return new Date(new Date().getTime() + (5 * 60 + 30) * 60 * 1000).getUTCHours();
}

/** 0=Sun,1=Mon..6=Sat → "MONDAY" etc., or null for weekend */
const DOW_NAME: Record<number, string> = {
  1: "MONDAY", 2: "TUESDAY", 3: "WEDNESDAY", 4: "THURSDAY", 5: "FRIDAY",
};

/** Parse "YYYY-MM-DD" to a UTC midnight Date (avoids local-tz shift) */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Advance a "YYYY-MM-DD" string by one day */
function nextDay(dateStr: string): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return toISTDateStr(d);
}

// ── Main GET handler ───────────────────────────────────────────────────────

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionStartDate: true },
    });

    // If no session start date set, return empty analytics
    if (!user?.sessionStartDate) {
      return NextResponse.json({
        sessionStartDate: null,
        overview: {
          overallPercentage: 100, theoryPercentage: 100, labPercentage: 100,
          totalHeld: 0, totalAttended: 0,
          theoryHeld: 0, theoryAttended: 0,
          labHeld: 0, labAttended: 0,
          percentage: 100, bunkMargin: 0, recoveryCount: 0, status: "SAFE",
        },
        theory: { subjects: [], totalHeld: 0, totalAttended: 0, percentage: 100, bunkMargin: 0, recoveryCount: 0, status: "SAFE" },
        labs:   { subjects: [], totalHeld: 0, totalAttended: 0, percentage: 100, bunkMargin: 0, recoveryCount: 0, status: "SAFE" },
        subjects: [],
      });
    }

    const istToday = toISTDateStr(new Date());
    const sessionStartStr = toISTDateStr(user.sessionStartDate);
    const istHour = getISTHour();

    // Fetch all timetable slots once (indexed by dayOfWeek)
    const allSlots = await prisma.timetableSlot.findMany({ where: { userId } });
    const slotsByDay: Record<string, typeof allSlots> = {};
    for (const slot of allSlots) {
      if (!slotsByDay[slot.dayOfWeek]) slotsByDay[slot.dayOfWeek] = [];
      slotsByDay[slot.dayOfWeek].push(slot);
    }

    // Fetch all attendance logs from session start date, indexed by "YYYY-MM-DD|||subjectName|||type"
    const allLogs = await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: user.sessionStartDate } },
    });
    const logMap: Record<string, { heldCount: number; attendedCount: number }> = {};
    const loggedDateSet = new Set<string>();
    for (const log of allLogs) {
      const dateStr = toISTDateStr(log.date);
      loggedDateSet.add(dateStr);
      const key = `${dateStr}|||${log.subjectName}|||${log.type}`;
      logMap[key] = { heldCount: log.heldCount, attendedCount: log.attendedCount };
    }

    // Per-subject accumulator: key = "subjectName|||type"
    const agg: Record<string, { subjectName: string; type: ClassType; totalHeld: number; totalAttended: number }> = {};

    // ── Day-by-day loop from sessionStartDate to today (inclusive if past 7 PM) ──
    let cursor = sessionStartStr;
    while (cursor <= istToday) {
      const dateObj = parseDate(cursor);
      const dow = dateObj.getUTCDay(); // 0=Sun .. 6=Sat
      const dayName = DOW_NAME[dow];   // undefined for Sat/Sun

      const isWeekday = Boolean(dayName);
      const isToday = cursor === istToday;
      const isPast = cursor < istToday;

      // Only process weekdays
      if (isWeekday) {
        const slotsForDay = slotsByDay[dayName] || [];

        if (slotsForDay.length > 0) {
          const dayIsLogged = loggedDateSet.has(cursor);

          // Determine if this day should contribute to stats:
          // - Past days: always included (either logged or penalty)
          // - Today: only included if past 7 PM IST
          const shouldCount = isPast || (isToday && istHour >= 19);

          if (shouldCount) {
            for (const slot of slotsForDay) {
              const aggKey = `${slot.subjectName}|||${slot.type}`;
              if (!agg[aggKey]) {
                agg[aggKey] = {
                  subjectName: slot.subjectName,
                  type: slot.type,
                  totalHeld: 0,
                  totalAttended: 0,
                };
              }

              if (dayIsLogged) {
                // Use real logged data for this subject on this day
                const logKey = `${cursor}|||${slot.subjectName}|||${slot.type}`;
                const log = logMap[logKey];
                if (log) {
                  // Real data: heldCount + attendedCount from log
                  agg[aggKey].totalHeld += log.heldCount;
                  agg[aggKey].totalAttended += log.attendedCount;
                }
                // If no log entry for this specific subject on a logged day
                // (e.g. holiday — all entries deleted), heldCount = 0, skip
              } else {
                // Auto-penalty: day not logged → all scheduled held, 0 attended
                agg[aggKey].totalHeld += slot.count;
                // attendedCount stays 0
              }
            }
          }
        }
      }

      // Advance to next day
      if (cursor === istToday) break;
      cursor = nextDay(cursor);
    }

    // ── Build response ──────────────────────────────────────────────────────
    let theoryHeld = 0, theoryAttended = 0, labHeld = 0, labAttended = 0;
    const theorySubjects: object[] = [];
    const labSubjects: object[] = [];

    // Sort subjects alphabetically for consistent ordering
    const sortedSubjects = Object.values(agg).sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName)
    );

    for (const stat of sortedSubjects) {
      const metrics = calcMetrics(stat.totalHeld, stat.totalAttended);
      const item = {
        subjectName: stat.subjectName,
        type: stat.type,
        totalHeld: stat.totalHeld,
        totalAttended: stat.totalAttended,
        ...metrics,
      };

      if (stat.type === "LAB") {
        labHeld += stat.totalHeld;
        labAttended += stat.totalAttended;
        labSubjects.push(item);
      } else {
        theoryHeld += stat.totalHeld;
        theoryAttended += stat.totalAttended;
        theorySubjects.push(item);
      }
    }

    const totalHeld = theoryHeld + labHeld;
    const totalAttended = theoryAttended + labAttended;
    const overallMetrics = calcMetrics(totalHeld, totalAttended);

    return NextResponse.json({
      sessionStartDate: sessionStartStr,
      overview: {
        overallPercentage: r(totalAttended, totalHeld),
        theoryPercentage: r(theoryAttended, theoryHeld),
        labPercentage: r(labAttended, labHeld),
        totalHeld, totalAttended,
        theoryHeld, theoryAttended,
        labHeld, labAttended,
        ...overallMetrics,
      },
      theory: {
        subjects: theorySubjects,
        totalHeld: theoryHeld,
        totalAttended: theoryAttended,
        ...calcMetrics(theoryHeld, theoryAttended),
      },
      labs: {
        subjects: labSubjects,
        totalHeld: labHeld,
        totalAttended: labAttended,
        ...calcMetrics(labHeld, labAttended),
      },
      subjects: [...theorySubjects, ...labSubjects],
    });
  } catch (error) {
    console.error("[GET /api/analytics]", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
