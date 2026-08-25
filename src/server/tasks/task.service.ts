import { prisma } from "@/lib/db";
import { createDomainEvent } from "@/lib/events/create-event";
import { projectEventBroadcaster } from "@/lib/events/broadcaster";
import { Prisma } from "@prisma/client";
import { getTaskDependencies, TaskDependencyError } from "@/server/dependencies/dependency.service";
import type { CreateTaskInput, TaskPriority, TaskStatus, UpdateTaskInput } from "./task.validation";

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Project not found.");
    this.name = "ProjectNotFoundError";
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super("Task not found.");
    this.name = "TaskNotFoundError";
  }
}

export class InvalidAssigneeError extends Error {
  constructor() {
    super("One or more assignees do not exist.");
    this.name = "InvalidAssigneeError";
  }
}

export class TaskVersionConflictError extends Error {
  constructor() {
    super("Task was modified by another client.");
    this.name = "TaskVersionConflictError";
  }
}

export type SerializedTask = {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  description: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  version: number;
  assignees: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
};

function serializeTask(task: {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  description: string | null;
  tags: string[];
  customFields: Prisma.JsonValue;
  version: number;
  assignees: Array<{ user: { id: string; name: string } }>;
  createdAt: Date;
  updatedAt: Date;
}): SerializedTask {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: task.description,
    tags: task.tags ?? [],
    customFields: (task.customFields && typeof task.customFields === "object" && !Array.isArray(task.customFields) ? task.customFields : {}) as Record<string, unknown>,
    version: task.version,
    assignees: (task.assignees ?? []).map((entry) => ({
      id: entry.user.id,
      name: entry.user.name,
    })),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function sameAssigneeList(left: SerializedTask["assignees"], right: SerializedTask["assignees"]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((assignee, index) => assignee.id === right[index]?.id && assignee.name === right[index]?.name);
}

function sameTagList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((tag, index) => tag === right[index]);
}

function buildTaskChanges(previousTask: SerializedTask, nextTask: SerializedTask): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (previousTask.title !== nextTask.title) {
    changes.title = nextTask.title;
  }

  if (previousTask.status !== nextTask.status) {
    changes.status = nextTask.status;
  }

  if (previousTask.priority !== nextTask.priority) {
    changes.priority = nextTask.priority;
  }

  if (previousTask.description !== nextTask.description) {
    changes.description = nextTask.description;
  }

  if (!sameTagList(previousTask.tags, nextTask.tags)) {
    changes.tags = nextTask.tags;
  }

  if (JSON.stringify(previousTask.customFields) !== JSON.stringify(nextTask.customFields)) {
    changes.customFields = nextTask.customFields;
  }

  if (!sameAssigneeList(previousTask.assignees, nextTask.assignees)) {
    changes.assignees = nextTask.assignees;
  }

  return changes;
}

async function validateAssigneeIds(assigneeIds: string[], tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  if (assigneeIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(assigneeIds)];
  const users = await tx.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });

  const userIds = new Set(users.map((user) => user.id));
  const missing = uniqueIds.filter((id) => !userIds.has(id));

  if (missing.length > 0) {
    throw new InvalidAssigneeError();
  }
}

export async function listProjectTasks(projectId: string): Promise<SerializedTask[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    throw new ProjectNotFoundError();
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: {
      assignees: { include: { user: true } },
    },
  });

  return tasks.map((task) => serializeTask(task));
}

export async function getTaskById(taskId: string): Promise<SerializedTask> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { include: { user: true } } },
  });

  if (!task) {
    throw new TaskNotFoundError();
  }

  return serializeTask(task);
}

export async function createTask(projectId: string, input: CreateTaskInput): Promise<SerializedTask> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    throw new ProjectNotFoundError();
  }

  const task = await prisma.$transaction(async (tx) => {
    await validateAssigneeIds(input.assigneeIds, tx);

    return tx.task.create({
      data: {
        projectId,
        title: input.title,
        status: input.status,
        priority: input.priority,
        description: input.description,
        tags: input.tags,
        customFields: input.customFields as Prisma.InputJsonValue,
        version: 1,
        assignees: input.assigneeIds.length
          ? {
              create: input.assigneeIds.map((userId) => ({
                user: { connect: { id: userId } },
              })),
            }
          : undefined,
      },
      include: {
        assignees: { include: { user: true } },
      },
    });
  });

  const createdTask = serializeTask(task);
  projectEventBroadcaster.publish(
    createDomainEvent("task.created", createdTask.projectId, { task: createdTask }, createdTask.id)
  );

  return createdTask;
}

export async function updateTask(taskId: string, expectedVersion: number, input: UpdateTaskInput): Promise<SerializedTask> {
  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { include: { user: true } } },
  });

  if (!existingTask) {
    throw new TaskNotFoundError();
  }

  if (existingTask.version !== expectedVersion) {
    throw new TaskVersionConflictError();
  }

  if (input.status === "DONE") {
    const dependencies = await getTaskDependencies(taskId);
    const incompleteDependencies = dependencies.filter((dependency) => dependency.dependsOnTask.status !== "DONE");

    if (incompleteDependencies.length > 0) {
      throw new TaskDependencyError(
        "Task cannot be completed while dependencies are incomplete.",
        "INCOMPLETE_DEPENDENCIES"
      );
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    if (input.assigneeIds !== undefined) {
      await validateAssigneeIds(input.assigneeIds, tx);
    }

    const taskUpdateData: Prisma.TaskUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.customFields !== undefined ? { customFields: input.customFields as Prisma.InputJsonValue } : {}),
      version: { increment: 1 },
    };

    try {
      const updatedTask = await tx.task.update({
        where: { id: taskId, version: expectedVersion },
        data: {
          ...taskUpdateData,
          ...(input.assigneeIds !== undefined
            ? {
                assignees: {
                  deleteMany: {},
                  create: input.assigneeIds.map((userId) => ({
                    user: { connect: { id: userId } },
                  })),
                },
              }
            : {}),
        },
        include: { assignees: { include: { user: true } } },
      });

      return updatedTask;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new TaskVersionConflictError();
      }

      throw error;
    }
  });

  const previousTask = serializeTask(existingTask);
  const updatedTask = serializeTask(task);
  const changes = buildTaskChanges(previousTask, updatedTask);

  projectEventBroadcaster.publish(
    createDomainEvent(
      "task.updated",
      updatedTask.projectId,
      { version: updatedTask.version, changes },
      updatedTask.id
    )
  );

  return updatedTask;
}

export async function deleteTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { include: { user: true } } },
  });

  if (!task) {
    throw new TaskNotFoundError();
  }

  await prisma.task.delete({ where: { id: taskId } });

  const deletedTask = serializeTask(task);
  projectEventBroadcaster.publish(
    createDomainEvent("task.deleted", deletedTask.projectId, { taskId: deletedTask.id }, deletedTask.id)
  );
}
