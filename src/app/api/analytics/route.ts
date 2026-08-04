import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";

function calcMetrics(totalHeld: number, totalAttended: number) {
  const pct = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 100;
  const percentage = Math.round(pct * 10) / 10;
  const bunkMargin = percentage >= 50 ? Math.max(0, Math.floor(2 * totalAttended - totalHeld)) : 0;
  const recoveryCount = percentage < 50 ? Math.max(0, Math.ceil(totalHeld - 2 * totalAttended)) : 0;
  const status: "SAFE" | "WARNING" | "CRITICAL" = pct < 50 ? "CRITICAL" : pct < 60 ? "WARNING" : "SAFE";
  return { percentage, bunkMargin, recoveryCount, status };
}

const r = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 100;

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionStartDate: true },
    });

    const stats = await prisma.subjectStat.findMany({
      where: { userId },
      orderBy: [{ subjectName: "asc" }],
    });

    let theoryHeld = 0, theoryAttended = 0, labHeld = 0, labAttended = 0;

    const theorySubjects = [];
    const labSubjects = [];

    for (const stat of stats) {
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
      ? user.sessionStartDate.toISOString().split("T")[0]
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
