import { prisma } from "@/lib/db";
import { createDomainEvent } from "@/lib/events/create-event";
import { projectEventBroadcaster } from "@/lib/events/broadcaster";
import type { CreateCommentInput } from "./comment.validation";

export type SerializedComment = {
  id: string;
  taskId: string;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
};

export class TaskNotFoundError extends Error {
  constructor() {
    super("Task not found.");
    this.name = "TaskNotFoundError";
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("Author not found.");
    this.name = "UserNotFoundError";
  }
}

function serializeComment(comment: {
  id: string;
  taskId: string;
  content: string;
  author: { id: string; name: string };
  createdAt: Date;
}): SerializedComment {
  return {
    id: comment.id,
    taskId: comment.taskId,
    content: comment.content,
    author: {
      id: comment.author.id,
      name: comment.author.name,
    },
    createdAt: comment.createdAt.toISOString(),
  };
}

export async function listTaskComments(taskId: string): Promise<SerializedComment[]> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new TaskNotFoundError();
  }

  const comments = await prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { author: true },
  });

  return comments.map((comment) => serializeComment(comment));
}

export async function createComment(taskId: string, input: CreateCommentInput): Promise<SerializedComment> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new TaskNotFoundError();
  }

  const author = await prisma.user.findUnique({ where: { id: input.authorId } });
  if (!author) {
    throw new UserNotFoundError();
  }

  const comment = await prisma.comment.create({
    data: {
      taskId,
      content: input.content,
      authorId: input.authorId,
    },
    include: { author: true },
  });

  const serialized = serializeComment(comment);
  projectEventBroadcaster.publish(
    createDomainEvent("comment.created", task.projectId, { taskId, comment: serialized }, serialized.id)
  );

  return serialized;
}
