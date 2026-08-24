import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        database: "unavailable",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Database connection failed",
      },
      { status: 503 }
    );
  }
}
