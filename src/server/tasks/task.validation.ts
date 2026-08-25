export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type CreateTaskInput = {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  description: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  assigneeIds: string[];
};

export type UpdateTaskInput = {
  version: number;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  assigneeIds?: string[];
};

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validateProjectId(projectId: string): void {
  if (!isValidUuid(projectId)) {
    throw new TaskValidationError("Project ID is invalid.");
  }
}

export function validateTaskId(taskId: string): void {
  if (!isValidUuid(taskId)) {
    throw new TaskValidationError("Task ID is invalid.");
  }
}

function parseStatus(value: unknown, defaultValue: TaskStatus = "TODO"): TaskStatus {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !TASK_STATUSES.includes(value as TaskStatus)) {
    throw new TaskValidationError("Task status must be TODO, IN_PROGRESS, or DONE.");
  }

  return value as TaskStatus;
}

function parsePriority(value: unknown, defaultValue: TaskPriority = "MEDIUM"): TaskPriority {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !TASK_PRIORITIES.includes(value as TaskPriority)) {
    throw new TaskValidationError("Task priority must be LOW, MEDIUM, or HIGH.");
  }

  return value as TaskPriority;
}

function parseDescription(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new TaskValidationError("Description must be a string or null.");
  }

  return value;
}

function parseTags(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TaskValidationError("Tags must be an array of strings.");
  }

  const normalized = value.map((item) => {
    if (typeof item !== "string") {
      throw new TaskValidationError("Tags must be an array of strings.");
    }

    return item.trim();
  });

  return [...new Set(normalized.filter(Boolean))];
}

function parseCustomFields(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TaskValidationError("customFields must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

function parseAssigneeIds(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TaskValidationError("assigneeIds must be an array of valid UUID strings.");
  }

  const assigneeIds = value.map((item) => {
    if (typeof item !== "string" || !isValidUuid(item)) {
      throw new TaskValidationError("assigneeIds must be an array of valid UUID strings.");
    }

    return item;
  });

  return [...new Set(assigneeIds)];
}

export function validateCreateTaskInput(payload: unknown): CreateTaskInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TaskValidationError("Request body must be a JSON object.");
  }

  const input = payload as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";

  if (!title) {
    throw new TaskValidationError("Task title is required.");
  }

  return {
    title,
    status: parseStatus(input.status, "TODO"),
    priority: parsePriority(input.priority, "MEDIUM"),
    description: parseDescription(input.description),
    tags: parseTags(input.tags),
    customFields: parseCustomFields(input.customFields),
    assigneeIds: parseAssigneeIds(input.assigneeIds),
  };
}

export function validateUpdateTaskInput(payload: unknown): UpdateTaskInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TaskValidationError("Request body must be a JSON object.");
  }

  const input = payload as Record<string, unknown>;
  const version = input.version;

  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new TaskValidationError("Task version is required and must be a positive integer.");
  }

  const hasMutableField = [
    "title",
    "status",
    "priority",
    "description",
    "tags",
    "customFields",
    "assigneeIds",
  ].some((key) => Object.prototype.hasOwnProperty.call(input, key));

  if (!hasMutableField) {
    throw new TaskValidationError("At least one task field must be provided.");
  }

  const update: UpdateTaskInput = { version };

  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    const value = typeof input.title === "string" ? input.title.trim() : "";
    if (!value) {
      throw new TaskValidationError("Task title cannot be empty.");
    }
    update.title = value;
  }

  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    update.status = parseStatus(input.status, "TODO");
  }

  if (Object.prototype.hasOwnProperty.call(input, "priority")) {
    update.priority = parsePriority(input.priority, "MEDIUM");
  }

  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    update.description = parseDescription(input.description);
  }

  if (Object.prototype.hasOwnProperty.call(input, "tags")) {
    update.tags = parseTags(input.tags);
  }

  if (Object.prototype.hasOwnProperty.call(input, "customFields")) {
    update.customFields = parseCustomFields(input.customFields);
  }

  if (Object.prototype.hasOwnProperty.call(input, "assigneeIds")) {
    update.assigneeIds = parseAssigneeIds(input.assigneeIds);
  }

  return update;
}
