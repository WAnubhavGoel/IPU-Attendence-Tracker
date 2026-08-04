import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    include: { timetableSlots: true, attendanceLogs: true, subjectStats: true },
  });

  console.log("=== USERS IN DATABASE ===");
  users.forEach((u) => {
    console.log({
      id: u.id,
      email: u.email,
      name: u.name,
      sessionStartDate: u.sessionStartDate,
      slotsCount: u.timetableSlots.length,
      logsCount: u.attendanceLogs.length,
      statsCount: u.subjectStats.length,
    });
  });
}

check().finally(() => prisma.$disconnect());
