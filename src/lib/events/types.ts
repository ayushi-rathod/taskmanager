export type DomainEvent<TData = unknown> = {
  id: string;
  type: string;
  projectId: string;
  entityId: string | null;
  timestamp: string;
  data: TData;
};

export type EventSubscriber = (event: DomainEvent) => void;

export type EventType =
  | "system.test"
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "dependency.created"
  | "dependency.deleted"
  | "comment.created";

export const EVENT_TYPES: EventType[] = [
  "system.test",
  "task.created",
  "task.updated",
  "task.deleted",
  "dependency.created",
  "dependency.deleted",
  "comment.created",
];
