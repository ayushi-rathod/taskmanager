import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  listProjectTasks,
  createTask,
  ProjectNotFoundError,
  InvalidAssigneeError,
} from "@/server/tasks/task.service";
import { validateCreateTaskInput, validateProjectId, TaskValidationError } from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    validateProjectId(projectId);
    const tasks = await listProjectTasks(projectId);
    return NextResponse.json({ tasks });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_PROJECT_ID", message: error.message }, { status: 400 });
    }

    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ code: "PROJECT_NOT_FOUND", message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    validateProjectId(projectId);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ code: "INVALID_REQUEST", message: "Request body must be valid JSON." }, { status: 400 });
    }

    const input = validateCreateTaskInput(payload);
    const task = await createTask(projectId, input);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_TASK", message: error.message }, { status: 400 });
    }

    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ code: "PROJECT_NOT_FOUND", message: "Project not found." }, { status: 404 });
    }

    if (error instanceof InvalidAssigneeError) {
      return NextResponse.json({ code: "INVALID_ASSIGNEE", message: "One or more assignees do not exist." }, { status: 400 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}
