import { NextResponse } from "next/server";
import {
  getTaskById,
  updateTask,
  deleteTask,
  TaskNotFoundError,
  TaskVersionConflictError,
  InvalidAssigneeError,
} from "@/server/tasks/task.service";
import {
  TaskValidationError,
  validateTaskId,
  validateUpdateTaskInput,
} from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { taskId: string } }) {
  try {
    validateTaskId(params.taskId);
    const task = await getTaskById(params.taskId);
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_TASK_ID", message: error.message }, { status: 400 });
    }

    if (error instanceof TaskNotFoundError) {
      return NextResponse.json({ code: "TASK_NOT_FOUND", message: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { taskId: string } }) {
  try {
    validateTaskId(params.taskId);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ code: "INVALID_REQUEST", message: "Request body must be valid JSON." }, { status: 400 });
    }

    const input = validateUpdateTaskInput(payload);
    const task = await updateTask(params.taskId, input.version, input);
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_TASK", message: error.message }, { status: 400 });
    }

    if (error instanceof TaskNotFoundError) {
      return NextResponse.json({ code: "TASK_NOT_FOUND", message: "Task not found." }, { status: 404 });
    }

    if (error instanceof TaskVersionConflictError) {
      return NextResponse.json({ code: "VERSION_CONFLICT", message: "Task was modified by another client." }, { status: 409 });
    }

    if (error instanceof InvalidAssigneeError) {
      return NextResponse.json({ code: "INVALID_ASSIGNEE", message: "One or more assignees do not exist." }, { status: 400 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { taskId: string } }) {
  try {
    validateTaskId(params.taskId);
    await deleteTask(params.taskId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_TASK_ID", message: error.message }, { status: 400 });
    }

    if (error instanceof TaskNotFoundError) {
      return NextResponse.json({ code: "TASK_NOT_FOUND", message: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}
