import { isValidUuid } from "@/server/tasks/task.validation";

export class CommentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentValidationError";
  }
}

export type CreateCommentInput = {
  content: string;
  authorId: string;
};

export function validateCreateCommentInput(payload: unknown): CreateCommentInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CommentValidationError("Request body must be a JSON object.");
  }

  const input = payload as Record<string, unknown>;

  if (typeof input.content !== "string") {
    throw new CommentValidationError("Comment content is required.");
  }

  const content = input.content.trim();
  if (!content) {
    throw new CommentValidationError("Comment content cannot be empty.");
  }

  if (typeof input.authorId !== "string" || !isValidUuid(input.authorId)) {
    throw new CommentValidationError("authorId must be a valid UUID.");
  }

  return { content, authorId: input.authorId };
}
