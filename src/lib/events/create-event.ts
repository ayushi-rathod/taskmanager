import type { DomainEvent } from "@/lib/events/types";

export function createDomainEvent<TData = unknown>(
  type: string,
  projectId: string,
  data: TData,
  entityId: string | null = null
): DomainEvent<TData> {
  return {
    id: crypto.randomUUID(),
    type,
    projectId,
    entityId,
    timestamp: new Date().toISOString(),
    data,
  };
}

export function formatSseEvent(event: DomainEvent): string {
  const payload = JSON.stringify(event);
  return [`id: ${event.id}`, `event: ${event.type}`, `data: ${payload}`, ""].join("\n") + "\n";
}
