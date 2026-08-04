import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name: name?.trim() || "Student", email: normalizedEmail, password: hashedPassword },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return NextResponse.json({ message: "Account created successfully", user }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/register]", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}