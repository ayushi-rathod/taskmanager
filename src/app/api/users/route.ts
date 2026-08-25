import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
    })),
  });
}
