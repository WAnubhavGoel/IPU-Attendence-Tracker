import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const session = await auth();
    if (!session?.user) return null;

    if (session.user.email) {
      const normalizedEmail = session.user.email.toLowerCase().trim();
      const dbUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (dbUser) return dbUser.id;
    }

    return session.user.id || null;
  } catch (error) {
    console.error("[getAuthenticatedUserId]", error);
    return null;
  }
}
