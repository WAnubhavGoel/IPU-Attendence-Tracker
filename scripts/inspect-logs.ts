import { prisma } from "../src/lib/prisma";

async function main() {
  const logs = await prisma.attendanceLog.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, userId: true, date: true, subjectName: true, heldCount: true, attendedCount: true, updatedAt: true }
  });

  console.log("Most recent 10 AttendanceLogs:");
  console.log(JSON.stringify(logs, null, 2));

  await prisma.$disconnect();
}

main();
