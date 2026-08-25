import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidUuid } from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  if (!isValidUuid(projectId)) {
    return NextResponse.json(
      { code: "INVALID_PROJECT_ID", message: "Project ID is invalid." },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!project) {
    return NextResponse.json(
      { code: "PROJECT_NOT_FOUND", message: "Project not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    project: {
      ...project,
      metadata: project.metadata ?? {},
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
  });
}
