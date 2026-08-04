import { PrismaClient, DayOfWeek, ClassType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TARGET_EMAIL = "goelanubhav70@gmail.com";

const TIMETABLE_SLOTS = [
  { dayOfWeek: "MONDAY" as DayOfWeek, subjectName: "OS Theory", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "MONDAY" as DayOfWeek, subjectName: "Principles of Management", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "TUESDAY" as DayOfWeek, subjectName: "DBMS", type: "LECTURE" as ClassType, count: 1 },
  { dayOfWeek: "TUESDAY" as DayOfWeek, subjectName: "OS Theory", type: "LECTURE" as ClassType, count: 1 },
  { dayOfWeek: "TUESDAY" as DayOfWeek, subjectName: "Comp Org and Arch", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "WEDNESDAY" as DayOfWeek, subjectName: "DAA Lab", type: "LAB" as ClassType, count: 2 },
  { dayOfWeek: "WEDNESDAY" as DayOfWeek, subjectName: "DBMS Lab", type: "LAB" as ClassType, count: 2 },
  { dayOfWeek: "WEDNESDAY" as DayOfWeek, subjectName: "DBMS", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "WEDNESDAY" as DayOfWeek, subjectName: "Java Theory", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "THURSDAY" as DayOfWeek, subjectName: "DAA Theory", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "THURSDAY" as DayOfWeek, subjectName: "COA Theory", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "FRIDAY" as DayOfWeek, subjectName: "OS Lab", type: "LAB" as ClassType, count: 2 },
  { dayOfWeek: "FRIDAY" as DayOfWeek, subjectName: "Java Lab", type: "LAB" as ClassType, count: 2 },
  { dayOfWeek: "FRIDAY" as DayOfWeek, subjectName: "DAA Theory", type: "LECTURE" as ClassType, count: 2 },
  { dayOfWeek: "FRIDAY" as DayOfWeek, subjectName: "Java Theory", type: "LECTURE" as ClassType, count: 2 },
];

const JS_DAYS: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

async function main() {
  console.log("=== INSPECTING DATABASE USERS ===");

  // 1. Ensure target user exists
  let targetUser = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!targetUser) {
    const hashedPassword = await bcrypt.hash("Password123!", 10);
    targetUser = await prisma.user.create({
      data: {
        email: TARGET_EMAIL,
        name: "Anubhav Goel",
        password: hashedPassword,
        sessionStartDate: new Date(2026, 9, 1),
      },
    });
    console.log(`Created user: ${TARGET_EMAIL}`);
  }

  // 2. Fetch all users in DB
  const allUsers = await prisma.user.findMany();
  console.log(`Total users in DB: ${allUsers.length}`);
  allUsers.forEach(u => console.log(` - ID: ${u.id} | Email: ${u.email} | Name: ${u.name}`));

  const startDate = new Date(2026, 9, 1);  // Oct 1, 2026
  const endDate = new Date(2026, 11, 0);   // Nov 30, 2026 (61 Days)

  const holidayDates = new Set([
    "2026-10-02", // Gandhi Jayanti
    "2026-10-24", // Dussehra
    "2026-11-01", // Diwali
    "2026-11-02", // Goverdhan Puja
  ]);

  // Seed every user in the database so whoever is logged in gets the 2 months data!
  for (const user of allUsers) {
    const userId = user.id;
    console.log(`\n🌱 Seeding 2 months data for: ${user.email} (${user.name})`);

    await prisma.user.update({
      where: { id: userId },
      data: { sessionStartDate: startDate },
    });

    await prisma.$transaction([
      prisma.attendanceLog.deleteMany({ where: { userId } }),
      prisma.subjectStat.deleteMany({ where: { userId } }),
      prisma.timetableSlot.deleteMany({ where: { userId } }),
    ]);

    await prisma.timetableSlot.createMany({
      data: TIMETABLE_SLOTS.map(slot => ({ userId, ...slot })),
    });

    let currentDate = new Date(startDate);
    const logsToCreate = [];
    const subjectAgg: Record<string, { subjectName: string; type: ClassType; totalHeld: number; totalAttended: number }> = {};

    while (currentDate <= endDate) {
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, "0");
      const d = String(currentDate.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const dayOfWeek = JS_DAYS[currentDate.getDay()];

      const isWeekend = dayOfWeek === "SATURDAY" || dayOfWeek === "SUNDAY";
      const isHoliday = holidayDates.has(dateStr);

      if (!isWeekend && !isHoliday) {
        const daySlots = TIMETABLE_SLOTS.filter(s => s.dayOfWeek === dayOfWeek);

        for (const slot of daySlots) {
          let isTeacherAbsent = false;
          let heldCount = slot.count;
          let attendedCount = slot.count;

          // Realistic variations for impressive showcase stats
          if (slot.subjectName === "OS Theory" && dateStr === "2026-10-12") isTeacherAbsent = true;
          if (slot.subjectName === "Java Theory" && dateStr === "2026-10-14") { heldCount = 1; attendedCount = 1; }
          
          // Bunking patterns for Showcase:
          if (slot.subjectName === "DBMS" && (dayOfWeek === "TUESDAY" || dayOfWeek === "WEDNESDAY")) {
            if (currentDate.getDate() % 2 === 0) attendedCount = 0; // Bunked DBMS
          }
          if (slot.subjectName === "Principles of Management" && currentDate.getDate() > 15) {
            attendedCount = 1; // Attended 1 of 2
          }
          if (slot.subjectName === "COA Theory" && currentDate.getDate() % 3 === 0) {
            attendedCount = 1; // Attended 1 of 2
          }

          const finalHeld = isTeacherAbsent ? 0 : heldCount;
          const finalAttended = isTeacherAbsent ? 0 : Math.min(finalHeld, attendedCount);

          logsToCreate.push({
            userId,
            date: new Date(dateStr),
            subjectName: slot.subjectName,
            type: slot.type,
            scheduledCount: slot.count,
            heldCount: finalHeld,
            attendedCount: finalAttended,
            isTeacherAbsent,
          });

          const aggKey = `${slot.subjectName}|||${slot.type}`;
          if (!subjectAgg[aggKey]) subjectAgg[aggKey] = { subjectName: slot.subjectName, type: slot.type, totalHeld: 0, totalAttended: 0 };
          subjectAgg[aggKey].totalHeld += finalHeld;
          subjectAgg[aggKey].totalAttended += finalAttended;
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const log of logsToCreate) {
      await prisma.attendanceLog.create({ data: log });
    }

    for (const stat of Object.values(subjectAgg)) {
      await prisma.subjectStat.create({
        data: {
          userId,
          subjectName: stat.subjectName,
          type: stat.type,
          totalHeld: stat.totalHeld,
          totalAttended: stat.totalAttended,
        },
      });
    }

    console.log(`✅ Seeded ${user.email} with 15 timetable slots, ${logsToCreate.length} attendance logs, and ${Object.keys(subjectAgg).length} subject stats!`);
  }

  console.log("\n🎉 ALL USERS SEEDED SUCCESSFULLY!");
}

main().finally(() => prisma.$disconnect());
