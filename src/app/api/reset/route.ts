import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.$transaction([
      prisma.attendanceLog.deleteMany({ where: { userId } }),
      prisma.subjectStat.deleteMany({ where: { userId } }),
    ]);

    return NextResponse.json({ message: "Attendance logs and statistics reset successfully" });
  } catch (error) {
    console.error("[POST /api/reset]", error);
    return NextResponse.json({ error: "Failed to reset attendance" }, { status: 500 });
  }
}
