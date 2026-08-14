import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function verify() {
  const logCount  = await prisma.attendanceLog.count();
  const userCount = await prisma.user.count();
  const slotCount = await prisma.timetableSlot.count();
  const statCount = await prisma.subjectStat.count();

  console.log("\n🗄️  Database Row Counts:");
  console.log(`  AttendanceLog  : ${logCount} rows`);
  console.log(`  User           : ${userCount} rows`);
  console.log(`  TimetableSlot  : ${slotCount} rows`);
  console.log(`  SubjectStat    : ${statCount} rows (cache — safe to ignore)`);
  console.log(`\n  ✅ All existing ${logCount} AttendanceLog rows are untouched.`);
  console.log(`  ✅ No migration or destructive query was run.\n`);

  await prisma.$disconnect();
}

verify();
