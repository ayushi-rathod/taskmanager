import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createDomainEvent } from "@/lib/events/create-event";
import { projectEventBroadcaster } from "@/lib/events/broadcaster";
import { isValidUuid } from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ code: "FORBIDDEN", message: "Development-only route." }, { status: 403 });
  }

  const { projectId } = await params;

  if (!isValidUuid(projectId)) {
    return NextResponse.json({ code: "INVALID_PROJECT_ID", message: "Project ID is invalid." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ code: "PROJECT_NOT_FOUND", message: "Project not found." }, { status: 404 });
  }

  const event = createDomainEvent("system.test", projectId, { message: "Realtime connection verified" });
  projectEventBroadcaster.publish(event);

  return NextResponse.json({ event }, { status: 200 });
}
