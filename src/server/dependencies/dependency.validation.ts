import { isValidUuid } from "@/server/tasks/task.validation";

export type AddDependencyInput = {
  dependsOnTaskId: string;
};

export class DependencyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DependencyValidationError";
  }
}

export function validateAddDependencyInput(payload: unknown): AddDependencyInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new DependencyValidationError("Dependency payload must be a JSON object.");
  }

  const record = payload as Record<string, unknown>;
  const dependsOnTaskId = typeof record.dependsOnTaskId === "string" ? record.dependsOnTaskId : "";

  if (!dependsOnTaskId || !isValidUuid(dependsOnTaskId)) {
    throw new DependencyValidationError("dependsOnTaskId must be a valid UUID.");
  }

  return { dependsOnTaskId };
}
