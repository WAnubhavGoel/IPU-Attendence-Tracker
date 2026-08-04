import { ClassType, DayOfWeek } from "@prisma/client";

/**
 * ----------------------------------------------------------------------
 * CORE BUSINESS MATH FORMULAS (Extracted from src/app/api/analytics/route.ts)
 * ----------------------------------------------------------------------
 */
export function calculateSubjectAnalytics(totalHeld: number, totalAttended: number) {
  const percentage = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 100;
  const roundedPct = Math.round(percentage * 10) / 10;

  // Bunk Margin (>= 50%): floor(2 * Attended - Held)
  const bunkMargin = roundedPct >= 50 ? Math.max(0, Math.floor(2 * totalAttended - totalHeld)) : 0;

  // Recovery Count (< 50%): ceil(Held - 2 * Attended)
  const recoveryCount = roundedPct < 50 ? Math.max(0, Math.ceil(totalHeld - 2 * totalAttended)) : 0;

  const status: "SAFE" | "WARNING" | "CRITICAL" =
    roundedPct < 50 ? "CRITICAL" : roundedPct < 60 ? "WARNING" : "SAFE";

  return { percentage: roundedPct, bunkMargin, recoveryCount, status };
}

/**
 * ----------------------------------------------------------------------
 * 3-MONTH SIMULATION ENGINE
 * ----------------------------------------------------------------------
 */
export interface DayLogInput {
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  isFullDayHoliday: boolean;
  classes: Array<{
    subjectName: string;
    type: ClassType;
    scheduledCount: number;
    heldCount: number;
    attendedCount: number;
    isTeacherAbsent: boolean;
  }>;
}

export function runQuarterlySimulation(logs: DayLogInput[]) {
  // Cumulative aggregate map: subjectName + type -> { totalHeld, totalAttended }
  const stats: Record<string, { subjectName: string; type: ClassType; totalHeld: number; totalAttended: number }> = {};

  for (const dayLog of logs) {
    // Rule 1: If Full Day Holiday or Weekend Off, skip calculation completely
    if (dayLog.isFullDayHoliday || dayLog.dayOfWeek === "SATURDAY" || dayLog.dayOfWeek === "SUNDAY") {
      continue;
    }

    for (const cls of dayLog.classes) {
      const key = `${cls.subjectName}|||${cls.type}`;
      if (!stats[key]) {
        stats[key] = { subjectName: cls.subjectName, type: cls.type, totalHeld: 0, totalAttended: 0 };
      }

      // Rule 2: If Teacher Absent, final Held = 0, Attended = 0
      const finalHeld = cls.isTeacherAbsent ? 0 : Math.max(0, cls.heldCount);
      const finalAttended = cls.isTeacherAbsent ? 0 : Math.min(finalHeld, Math.max(0, cls.attendedCount));

      stats[key].totalHeld += finalHeld;
      stats[key].totalAttended += finalAttended;
    }
  }

  // Calculate final metrics for each subject
  const result: Record<string, ReturnType<typeof calculateSubjectAnalytics> & { totalHeld: number; totalAttended: number }> = {};
  for (const [key, val] of Object.entries(stats)) {
    const analytics = calculateSubjectAnalytics(val.totalHeld, val.totalAttended);
    result[key] = {
      totalHeld: val.totalHeld,
      totalAttended: val.totalAttended,
      ...analytics,
    };
  }

  return result;
}
