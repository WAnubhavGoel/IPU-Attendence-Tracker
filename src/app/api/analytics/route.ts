import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";
import { ClassType } from "@prisma/client";

function calcMetrics(totalHeld: number, totalAttended: number) {
  const pct = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 100;
  const percentage = Math.round(pct * 10) / 10;
  const bunkMargin = percentage >= 50 ? Math.max(0, Math.floor(2 * totalAttended - totalHeld)) : 0;
  const recoveryCount = percentage < 50 ? Math.max(0, Math.ceil(totalHeld - 2 * totalAttended)) : 0;
  const status: "SAFE" | "WARNING" | "CRITICAL" = pct < 50 ? "CRITICAL" : pct < 60 ? "WARNING" : "SAFE";
  return { percentage, bunkMargin, recoveryCount, status };
}

const r = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 100;

// Get IST date string (YYYY-MM-DD) for any UTC Date
function toISTDateStr(date: Date): string {
  // IST = UTC + 5:30
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Get current IST hour (0-23)
function getISTHour(): number {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.getUTCHours();
}

// Returns all days (Mon-Sat) between startDate and yesterday (inclusive)
// that are eligible for auto-penalty (i.e., we only penalise fully past days)
function getPastWeekdays(startDateStr: string, todayStr: string): string[] {
  const days: string[] = [];
  const current = new Date(startDateStr + "T00:00:00Z");
  const today = new Date(todayStr + "T00:00:00Z");

  while (current < today) {
    // getUTCDay: 0=Sun, 1=Mon ... 5=Fri, 6=Sat
    const dow = current.getUTCDay();
    if (dow >= 1 && dow <= 6) {
      const y = current.getUTCFullYear();
      const m = String(current.getUTCMonth() + 1).padStart(2, "0");
      const d = String(current.getUTCDate()).padStart(2, "0");
      days.push(`${y}-${m}-${d}`);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  // Also include today if IST hour >= 19 (7 PM) and today is Mon-Sat
  const todayDow = today.getUTCDay();
  if (todayDow >= 1 && todayDow <= 6 && getISTHour() >= 19) {
    days.push(todayStr);
  }

  return days;
}

const DAY_MAP: Record<number, string> = {
  1: "MONDAY", 2: "TUESDAY", 3: "WEDNESDAY",
  4: "THURSDAY", 5: "FRIDAY", 6: "SATURDAY",
};

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionStartDate: true },
    });

    // Fetch saved subject stats from DB (from days the user DID log)
    const stats = await prisma.subjectStat.findMany({
      where: { userId },
      orderBy: [{ subjectName: "asc" }],
    });

    // Build a mutable aggregation map starting from saved stats
    const agg: Record<string, { subjectName: string; type: ClassType; totalHeld: number; totalAttended: number }> = {};
    for (const stat of stats) {
      const key = `${stat.subjectName}|||${stat.type}`;
      agg[key] = {
        subjectName: stat.subjectName,
        type: stat.type,
        totalHeld: stat.totalHeld,
        totalAttended: stat.totalAttended,
      };
    }

    // ── AUTO-PENALTY LOGIC ─────────────────────────────────────────────────
    if (user?.sessionStartDate) {
      const istToday = toISTDateStr(new Date());
      const sessionStartStr = toISTDateStr(user.sessionStartDate);

      const eligibleDays = getPastWeekdays(sessionStartStr, istToday);

      if (eligibleDays.length > 0) {
        // Fetch all dates that the user HAS logged attendance for
        const loggedDates = await prisma.attendanceLog.findMany({
          where: { userId },
          select: { date: true },
          distinct: ["date"],
        });
        const loggedDateSet = new Set(loggedDates.map(l => toISTDateStr(l.date)));

        // Fetch all timetable slots once
        const allSlots = await prisma.timetableSlot.findMany({ where: { userId } });

        for (const dateStr of eligibleDays) {
          // Skip if user already logged this day (real data wins)
          if (loggedDateSet.has(dateStr)) continue;

          // Get day of week for this date
          const dateParts = dateStr.split("-").map(Number);
          const dateObj = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
          const dow = dateObj.getUTCDay(); // 1=Mon..5=Fri
          const dayName = DAY_MAP[dow];
          if (!dayName) continue;

          // Get timetable slots for that day
          const daySlots = allSlots.filter(s => s.dayOfWeek === dayName);
          if (daySlots.length === 0) continue;

          // Add penalty: all classes held, 0 attended
          for (const slot of daySlots) {
            const key = `${slot.subjectName}|||${slot.type}`;
            if (!agg[key]) {
              agg[key] = { subjectName: slot.subjectName, type: slot.type, totalHeld: 0, totalAttended: 0 };
            }
            agg[key].totalHeld += slot.count;
            // totalAttended stays 0 — full penalty
          }
        }
      }
    }
    // ── END AUTO-PENALTY ───────────────────────────────────────────────────

    let theoryHeld = 0, theoryAttended = 0, labHeld = 0, labAttended = 0;
    const theorySubjects = [];
    const labSubjects = [];

    for (const stat of Object.values(agg)) {
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

    const sessionStartDateStr = user?.sessionStartDate
      ? toISTDateStr(user.sessionStartDate)
      : null;

    return NextResponse.json({
      sessionStartDate: sessionStartDateStr,
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
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
