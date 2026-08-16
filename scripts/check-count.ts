import { prisma } from "../src/lib/prisma";

async function main() {
  const logCount = await prisma.attendanceLog.count();
  const userCount = await prisma.user.count();
  const slotCount = await prisma.timetableSlot.count();
  const statCount = await prisma.subjectStat.count();

  console.log("-----------------------------------------");
  console.log("AttendanceLog count :", logCount);
  console.log("User count          :", userCount);
  console.log("TimetableSlot count :", slotCount);
  console.log("SubjectStat count   :", statCount);
  console.log("-----------------------------------------");
  await prisma.$disconnect();
}

main();
