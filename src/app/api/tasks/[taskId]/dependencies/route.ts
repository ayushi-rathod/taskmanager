import { NextResponse } from "next/server";
import {
  addDependency,
  getTaskDependencies,
  TaskDependencyError,
} from "@/server/dependencies/dependency.service";
import { DependencyValidationError, validateAddDependencyInput } from "@/server/dependencies/dependency.validation";
import { TaskNotFoundError } from "@/server/tasks/task.service";
import { TaskValidationError, validateTaskId } from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    validateTaskId(taskId);
    const dependencies = await getTaskDependencies(taskId);
    return NextResponse.json({ dependencies });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_TASK_ID", message: error.message }, { status: 400 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    validateTaskId(taskId);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ code: "INVALID_DEPENDENCY", message: "Request body must be valid JSON." }, { status: 400 });
    }

    const input = validateAddDependencyInput(payload);
    const dependency = await addDependency(taskId, input.dependsOnTaskId);

    return NextResponse.json({ dependency }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_DEPENDENCY", message: error.message }, { status: 400 });
    }

    if (error instanceof DependencyValidationError) {
      return NextResponse.json({ code: "INVALID_DEPENDENCY", message: error.message }, { status: 400 });
    }

    if (error instanceof TaskNotFoundError) {
      return NextResponse.json({ code: "TASK_NOT_FOUND", message: "Task not found." }, { status: 404 });
    }

    if (error instanceof TaskDependencyError) {
      const status = error.code === "DEPENDENCY_EXISTS" ? 409 : error.code === "CROSS_PROJECT_DEPENDENCY" || error.code === "DEPENDENCY_CYCLE" || error.code === "INCOMPLETE_DEPENDENCY_FOR_DONE_TASK" ? 422 : error.code === "SELF_DEPENDENCY" ? 400 : 404;
      return NextResponse.json({ code: error.code, message: error.message }, { status });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}
