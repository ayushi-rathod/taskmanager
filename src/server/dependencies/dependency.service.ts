import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export class TaskDependencyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "TaskDependencyError";
  }
}

export class TaskDependencyNotFoundError extends Error {
  constructor() {
    super("Task dependency not found.");
    this.name = "TaskDependencyNotFoundError";
  }
}

export type DependencySummary = {
  taskId: string;
  dependsOnTask: {
    id: string;
    title: string;
    status: string;
  };
};

export async function getTaskDependencies(taskId: string): Promise<DependencySummary[]> {
  const edges = await prisma.taskDependency.findMany({
    where: { taskId },
    include: {
      dependsOn: {
        select: { id: true, title: true, status: true },
      },
    },
    orderBy: { dependsOn: { title: "asc" } },
  });

  return edges.map((edge) => ({
    taskId: edge.taskId,
    dependsOnTask: {
      id: edge.dependsOn.id,
      title: edge.dependsOn.title,
      status: edge.dependsOn.status,
    },
  }));
}

export async function getProjectDependencyState(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      dependencies: {
        select: {
          dependsOn: {
            select: { id: true, title: true, status: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    dependencies: task.dependencies.map((dependency) => ({
      id: dependency.dependsOn.id,
      title: dependency.dependsOn.title,
      status: dependency.dependsOn.status,
    })),
  }));
}

async function hasPath(startTaskId: string, targetTaskId: string, projectId: string): Promise<boolean> {
  const edges = await prisma.taskDependency.findMany({
    where: { task: { projectId } },
    select: { taskId: true, dependsOnTaskId: true },
  });

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.taskId) ?? [];
    list.push(edge.dependsOnTaskId);
    adjacency.set(edge.taskId, list);
  }

  const seen = new Set<string>();
  const queue = [startTaskId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (current === targetTaskId) {
      return true;
    }

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!seen.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return false;
}

export async function validateNoCycle(taskId: string, dependsOnTaskId: string, projectId: string): Promise<void> {
  const wouldCreateCycle = await hasPath(dependsOnTaskId, taskId, projectId);
  if (wouldCreateCycle) {
    throw new TaskDependencyError("This dependency would create a cycle.", "DEPENDENCY_CYCLE");
  }
}

export async function addDependency(taskId: string, dependsOnTaskId: string) {
  const dependentTask = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });

  if (!dependentTask) {
    throw new TaskDependencyError("Task not found.", "TASK_NOT_FOUND");
  }

  const prerequisiteTask = await prisma.task.findUnique({
    where: { id: dependsOnTaskId },
    include: { project: true },
  });

  if (!prerequisiteTask) {
    throw new TaskDependencyError("Dependency task not found.", "DEPENDENCY_TASK_NOT_FOUND");
  }

  if (taskId === dependsOnTaskId) {
    throw new TaskDependencyError("A task cannot depend on itself.", "SELF_DEPENDENCY");
  }

  if (dependentTask.projectId !== prerequisiteTask.projectId) {
    throw new TaskDependencyError("Task dependencies must belong to the same project.", "CROSS_PROJECT_DEPENDENCY");
  }

  if (dependentTask.status === "DONE" && prerequisiteTask.status !== "DONE") {
    throw new TaskDependencyError(
      "A completed task cannot depend on an incomplete task.",
      "INCOMPLETE_DEPENDENCY_FOR_DONE_TASK"
    );
  }

  const existing = await prisma.taskDependency.findUnique({
    where: {
      taskId_dependsOnTaskId: {
        taskId,
        dependsOnTaskId,
      },
    },
  });

  if (existing) {
    throw new TaskDependencyError("This dependency already exists.", "DEPENDENCY_EXISTS");
  }

  await validateNoCycle(taskId, dependsOnTaskId, dependentTask.projectId);

  const created = await prisma.$transaction(async (tx) => {
    const result = await tx.taskDependency.create({
      data: {
        taskId,
        dependsOnTaskId,
      },
      include: {
        dependsOn: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    return {
      taskId: result.taskId,
      dependsOnTask: {
        id: result.dependsOn.id,
        title: result.dependsOn.title,
        status: result.dependsOn.status,
      },
    };
  });

  return created;
}

export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
  if (!(await prisma.task.findUnique({ where: { id: taskId } }))) {
    throw new TaskDependencyError("Task not found.", "TASK_NOT_FOUND");
  }

  const deleted = await prisma.taskDependency.deleteMany({
    where: {
      taskId,
      dependsOnTaskId,
    },
  });

  if (deleted.count === 0) {
    throw new TaskDependencyNotFoundError();
  }
}
