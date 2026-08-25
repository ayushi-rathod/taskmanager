import { NextResponse } from "next/server";
import { removeDependency, TaskDependencyError, TaskDependencyNotFoundError } from "@/server/dependencies/dependency.service";
import { validateTaskId } from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function DELETE(_: Request, { params }: { params: Promise<{ taskId: string; dependsOnTaskId: string }> }) {
  try {
    const { taskId, dependsOnTaskId } = await params;
    validateTaskId(taskId);
    validateTaskId(dependsOnTaskId);
    await removeDependency(taskId, dependsOnTaskId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof TaskDependencyError) {
      const status = error.code === "TASK_NOT_FOUND" ? 404 : 500;
      return NextResponse.json({ code: error.code, message: error.message }, { status });
    }

    if (error instanceof TaskDependencyNotFoundError) {
      return NextResponse.json({ code: "DEPENDENCY_NOT_FOUND", message: "Task dependency not found." }, { status: 404 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}
