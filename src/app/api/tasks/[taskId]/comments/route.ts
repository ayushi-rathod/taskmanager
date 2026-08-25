import { NextResponse } from "next/server";
import {
  createComment,
  listTaskComments,
  TaskNotFoundError,
  UserNotFoundError,
} from "@/server/comments/comment.service";
import { CommentValidationError, validateCreateCommentInput } from "@/server/comments/comment.validation";
import { TaskValidationError, validateTaskId } from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    validateTaskId(taskId);
    const comments = await listTaskComments(taskId);
    return NextResponse.json({ comments });
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

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    validateTaskId(taskId);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ code: "INVALID_COMMENT", message: "Request body must be valid JSON." }, { status: 400 });
    }

    const input = validateCreateCommentInput(payload);
    const comment = await createComment(taskId, input);

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return NextResponse.json({ code: "INVALID_TASK_ID", message: error.message }, { status: 400 });
    }

    if (error instanceof CommentValidationError) {
      return NextResponse.json({ code: "INVALID_COMMENT", message: error.message }, { status: 400 });
    }

    if (error instanceof TaskNotFoundError) {
      return NextResponse.json({ code: "TASK_NOT_FOUND", message: "Task not found." }, { status: 404 });
    }

    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ code: "INVALID_AUTHOR", message: "Selected author does not exist." }, { status: 400 });
    }

    return NextResponse.json({ code: "INTERNAL_ERROR", message: "Unexpected failure." }, { status: 500 });
  }
}
