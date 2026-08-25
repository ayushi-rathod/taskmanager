import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    projects: projects.map((project) => ({
      ...project,
      metadata: project.metadata ?? {},
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json(
        { code: "INVALID_PROJECT", message: "Project payload must be a JSON object." },
        { status: 400 }
      );
    }

    const record = payload as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { code: "INVALID_PROJECT", message: "Project name is required." },
        { status: 400 }
      );
    }

    const description = typeof record.description === "string" ? record.description : null;
    const metadata: Prisma.InputJsonValue =
      record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? (record.metadata as Prisma.InputJsonValue)
        : {};

    const project = await prisma.project.create({
      data: { name, description, metadata },
    });

    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          metadata: project.metadata ?? {},
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { code: "PROJECT_CREATE_FAILED", message: "Unable to create project." },
      { status: 500 }
    );
  }
}
