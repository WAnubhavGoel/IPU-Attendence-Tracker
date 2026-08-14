/**
 * Unit tests for the new analytics calculation engine.
 * Tests the pure math logic (calcMetrics, IST helpers, day-by-day loop)
 * without hitting the database.
 *
 * Run with: npx tsx scripts/test-analytics-logic.ts
 */

// ── Helpers copied from analytics/route.ts ────────────────────────────────

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

function toISTDateStr(date: Date): string {
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function nextDay(dateStr: string): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return toISTDateStr(d);
}

const DOW_NAME: Record<number, string> = {
  1: "MONDAY", 2: "TUESDAY", 3: "WEDNESDAY", 4: "THURSDAY", 5: "FRIDAY",
};

// ── Simulated analytics engine (mirrors analytics/route.ts logic) ──────────

interface Slot { dayOfWeek: string; subjectName: string; type: "LECTURE" | "LAB"; count: number; }
interface LogEntry { dateStr: string; subjectName: string; type: "LECTURE" | "LAB"; heldCount: number; attendedCount: number; }

function runAnalytics(
  sessionStartStr: string,
  istTodayStr: string,
  istHourOverride: number,
  slots: Slot[],
  logs: LogEntry[]
): Record<string, { totalHeld: number; totalAttended: number }> {
  const slotsByDay: Record<string, Slot[]> = {};
  for (const slot of slots) {
    if (!slotsByDay[slot.dayOfWeek]) slotsByDay[slot.dayOfWeek] = [];
    slotsByDay[slot.dayOfWeek].push(slot);
  }

  const logMap: Record<string, { heldCount: number; attendedCount: number }> = {};
  const loggedDateSet = new Set<string>();
  for (const log of logs) {
    loggedDateSet.add(log.dateStr);
    const key = `${log.dateStr}|||${log.subjectName}|||${log.type}`;
    logMap[key] = { heldCount: log.heldCount, attendedCount: log.attendedCount };
  }

  const agg: Record<string, { totalHeld: number; totalAttended: number }> = {};

  let cursor = sessionStartStr;
  while (cursor <= istTodayStr) {
    const dateObj = parseDate(cursor);
    const dow = dateObj.getUTCDay();
    const dayName = DOW_NAME[dow];
    const isWeekday = Boolean(dayName);
    const isToday = cursor === istTodayStr;
    const isPast = cursor < istTodayStr;

    if (isWeekday) {
      const slotsForDay = slotsByDay[dayName] || [];
      if (slotsForDay.length > 0) {
        const dayIsLogged = loggedDateSet.has(cursor);
        const shouldCount = isPast || (isToday && istHourOverride >= 19);

        if (shouldCount) {
          for (const slot of slotsForDay) {
            const aggKey = `${slot.subjectName}|||${slot.type}`;
            if (!agg[aggKey]) agg[aggKey] = { totalHeld: 0, totalAttended: 0 };

            if (dayIsLogged) {
              const logKey = `${cursor}|||${slot.subjectName}|||${slot.type}`;
              const log = logMap[logKey];
              if (log) {
                agg[aggKey].totalHeld += log.heldCount;
                agg[aggKey].totalAttended += log.attendedCount;
              }
            } else {
              // Auto-penalty
              agg[aggKey].totalHeld += slot.count;
            }
          }
        }
      }
    }

    if (cursor === istTodayStr) break;
    cursor = nextDay(cursor);
  }

  return agg;
}

// ── Test helpers ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`     ${(e as Error).message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label = "") {
  if (actual !== expected) {
    throw new Error(`${label} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Define a simple Mon/Tue timetable (2 OS slots per day) ────────────────

const SLOTS: Slot[] = [
  { dayOfWeek: "MONDAY",    subjectName: "OS Theory", type: "LECTURE", count: 2 },
  { dayOfWeek: "TUESDAY",   subjectName: "OS Theory", type: "LECTURE", count: 2 },
  { dayOfWeek: "WEDNESDAY", subjectName: "OS Theory", type: "LECTURE", count: 2 },
  { dayOfWeek: "THURSDAY",  subjectName: "DAA Lab",   type: "LAB",     count: 2 },
  { dayOfWeek: "FRIDAY",    subjectName: "OS Theory", type: "LECTURE", count: 1 },
];

// ── Tests ──────────────────────────────────────────────────────────────────

console.log("\n📐 calcMetrics() Tests:");

test("50% exactly → bunkMargin=0, status=WARNING (pct < 60)", () => {
  const m = calcMetrics(10, 5);
  assertEqual(m.percentage, 50, "percentage");
  assertEqual(m.bunkMargin, 0, "bunkMargin");
  assertEqual(m.recoveryCount, 0, "recoveryCount");
  assertEqual(m.status, "WARNING", "status"); // 50 >= 50 but < 60 → WARNING
});

test("100% attended → bunkMargin = totalAttended", () => {
  const m = calcMetrics(10, 10);
  assertEqual(m.percentage, 100, "percentage");
  assertEqual(m.bunkMargin, 10, "bunkMargin");
  assertEqual(m.status, "SAFE", "status");
});

test("0 held → percentage 100, bunkMargin 0 (edge case)", () => {
  const m = calcMetrics(0, 0);
  assertEqual(m.percentage, 100, "percentage");
  assertEqual(m.bunkMargin, 0, "bunkMargin");
  assertEqual(m.status, "SAFE", "status");
});

test("40% → CRITICAL, recoveryCount > 0", () => {
  const m = calcMetrics(10, 4);
  assertEqual(m.percentage, 40, "percentage");
  assertEqual(m.status, "CRITICAL", "status");
  assertEqual(m.bunkMargin, 0, "bunkMargin should be 0 when critical");
  if (m.recoveryCount <= 0) throw new Error("recoveryCount should be > 0");
});

test("59% → WARNING", () => {
  const m = calcMetrics(100, 59);
  assertEqual(m.status, "WARNING", "status");
});

test("60% → SAFE", () => {
  const m = calcMetrics(100, 60);
  assertEqual(m.status, "SAFE", "status");
});

console.log("\n📅 Day-by-Day Loop Tests:");

// 2026-08-11 is a Tuesday
// 2026-08-14 is a Thursday

test("Weekend days (Sat/Sun) contribute 0 to totals", () => {
  // 2026-08-15 = Saturday, 2026-08-16 = Sunday (verified)
  const agg = runAnalytics("2026-08-15", "2026-08-16", 20, SLOTS, []);
  // Saturday and Sunday: no slots, so agg should be empty
  assertEqual(Object.keys(agg).length, 0, "agg should be empty for weekend-only range");
});

test("Unlogged weekday before today → auto-penalty applied", () => {
  // 2026-08-11=Tue, 2026-08-12=Wed, 2026-08-13=Thu — all past unlogged weekdays
  // today = 2026-08-14 (Fri), past 7PM → also counts
  // Slots: Tue(2 OS), Wed(2 OS), Thu(2 DAA Lab), Fri(1 OS) — all unlogged
  const agg = runAnalytics("2026-08-11", "2026-08-14", 20, SLOTS, []);
  const os = agg["OS Theory|||LECTURE"];
  const daa = agg["DAA Lab|||LAB"];
  if (!os) throw new Error("OS Theory not found in agg");
  // Tue=2 + Wed=2 + Fri=1 = 5 OS held, 0 attended
  assertEqual(os.totalHeld, 5, "OS totalHeld (Tue=2, Wed=2, Fri=1)");
  assertEqual(os.totalAttended, 0, "OS totalAttended (auto-penalty)");
  if (!daa) throw new Error("DAA Lab not found in agg");
  // Thu=2 DAA Lab held, 0 attended
  assertEqual(daa.totalHeld, 2, "DAA Lab totalHeld");
  assertEqual(daa.totalAttended, 0, "DAA Lab totalAttended");
});

test("Logged weekday → real data used, not penalty", () => {
  const logs: LogEntry[] = [
    // 2026-08-11 = Tuesday: logged with real data (2 held, 2 attended)
    { dateStr: "2026-08-11", subjectName: "OS Theory", type: "LECTURE", heldCount: 2, attendedCount: 2 },
  ];
  // Tue is logged (real); Wed, Fri are unlogged → penalty
  const agg = runAnalytics("2026-08-11", "2026-08-14", 20, SLOTS, logs);
  const os = agg["OS Theory|||LECTURE"];
  // Tue: 2 held, 2 attended (real logged)
  // Wed: 2 held, 0 attended (penalty)
  // Fri: 1 held, 0 attended (penalty)
  if (!os) throw new Error("OS Theory not found");
  assertEqual(os.totalHeld, 5, "totalHeld = 2+2+1");
  assertEqual(os.totalAttended, 2, "totalAttended = 2 (only Tue logged)");
});

test("Today before 7 PM → not counted", () => {
  // 2026-08-14 = Friday, istHour = 10 (before 7 PM) → today should NOT be included
  const agg = runAnalytics("2026-08-14", "2026-08-14", 10, SLOTS, []);
  // Today (Fri) is the only day in range but hour < 19, so nothing counted
  assertEqual(Object.keys(agg).length, 0, "Should not count today before 7 PM");
});

test("Today after 7 PM with no log → auto-penalty for today", () => {
  // 2026-08-14 = Friday, istHour = 20 (after 7 PM) → today IS included with penalty
  // Friday slot: OS Theory count=1
  const agg = runAnalytics("2026-08-14", "2026-08-14", 20, SLOTS, []);
  const os = agg["OS Theory|||LECTURE"];
  if (!os) throw new Error("OS Theory not found (Fri has 1 OS slot)");
  assertEqual(os.totalHeld, 1, "OS held = 1 (penalty for Friday)");
  assertEqual(os.totalAttended, 0, "OS attended = 0 (penalty)");
});

test("Today after 7 PM WITH log → real data, no penalty", () => {
  // 2026-08-14 = Friday. Log OS Theory with real data (1 held, 1 attended)
  const logs: LogEntry[] = [
    { dateStr: "2026-08-14", subjectName: "OS Theory", type: "LECTURE", heldCount: 1, attendedCount: 1 },
  ];
  const agg = runAnalytics("2026-08-14", "2026-08-14", 20, SLOTS, logs);
  const os = agg["OS Theory|||LECTURE"];
  if (!os) throw new Error("OS Theory not found");
  assertEqual(os.totalHeld, 1, "OS held = 1 (real logged data, not penalty)");
  assertEqual(os.totalAttended, 1, "OS attended = 1 (real logged data)");
});

test("Teacher absent day (heldCount=0, attendedCount=0) → does not affect percentage", () => {
  // 2026-08-11=Tue, 2026-08-12=Wed — both past 7PM
  const logs: LogEntry[] = [
    // Tue: attended 2/2
    { dateStr: "2026-08-11", subjectName: "OS Theory", type: "LECTURE", heldCount: 2, attendedCount: 2 },
    // Wed: teacher absent (held=0, attended=0)
    { dateStr: "2026-08-12", subjectName: "OS Theory", type: "LECTURE", heldCount: 0, attendedCount: 0 },
  ];
  const agg = runAnalytics("2026-08-11", "2026-08-12", 20, SLOTS, logs);
  const os = agg["OS Theory|||LECTURE"];
  if (!os) throw new Error("OS Theory not found");
  // Tue: 2 held, 2 attended. Wed: teacher absent (0+0). Total: 2 held, 2 attended.
  assertEqual(os.totalHeld, 2, "Teacher absent day should NOT add to held");
  assertEqual(os.totalAttended, 2, "Attended stays at 2");
  const metrics = calcMetrics(os.totalHeld, os.totalAttended);
  assertEqual(metrics.percentage, 100, "Should still be 100% after teacher absent day");
});

test("Holiday day (sentinel rows written: heldCount=0) → contributes 0 to totals, NO penalty", () => {
  // 2026-08-11=Tuesday. Holiday = attendance POST writes sentinel rows:
  // { heldCount: 0, attendedCount: 0 } for every slot on that day.
  // So loggedDateSet DOES contain 2026-08-11, and logMap has heldCount=0.
  // Analytics reads real data (0+0) — no auto-penalty applied. ✅
  const logs: LogEntry[] = [
    // Sentinel rows written by holiday handler
    { dateStr: "2026-08-11", subjectName: "OS Theory", type: "LECTURE", heldCount: 0, attendedCount: 0 },
  ];
  const agg = runAnalytics("2026-08-11", "2026-08-11", 20, SLOTS, logs);
  // Day IS in loggedDateSet → real data used (heldCount=0, attendedCount=0)
  // OS Theory slot exists but log has heldCount=0 → contributes 0 to totals
  const os = agg["OS Theory|||LECTURE"];
  if (!os) throw new Error("OS Theory should exist in agg (slot defined for Tue)");
  assertEqual(os.totalHeld, 0, "Holiday: heldCount should be 0 (not penalised)");
  assertEqual(os.totalAttended, 0, "Holiday: attendedCount should be 0");
  const metrics = calcMetrics(os.totalHeld, os.totalAttended);
  assertEqual(metrics.percentage, 100, "0 held → defaults to 100% (no penalty impact)");
});

test("calcMetrics bunk margin formula: floor(2*attended - held)", () => {
  // attended=8, held=10 → 2*8-10=6 → bunkMargin=6
  const m = calcMetrics(10, 8);
  assertEqual(m.bunkMargin, 6, "bunkMargin");
});

test("calcMetrics recovery formula: ceil(held - 2*attended)", () => {
  // attended=3, held=10 → 10-6=4 → recoveryCount=4
  const m = calcMetrics(10, 3);
  assertEqual(m.recoveryCount, 4, "recoveryCount");
  assertEqual(m.status, "CRITICAL", "status");
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}`);
console.log(`${"─".repeat(50)}\n`);

if (failed > 0) process.exit(1);
