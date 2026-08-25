import type { DomainEvent, EventSubscriber } from "@/lib/events/types";

class ProjectEventBroadcaster {
  private subscribers = new Map<string, Set<EventSubscriber>>();

  subscribe(projectId: string, subscriber: EventSubscriber): () => void {
    const projectSubscribers = this.subscribers.get(projectId) ?? new Set<EventSubscriber>();
    projectSubscribers.add(subscriber);
    this.subscribers.set(projectId, projectSubscribers);

    return () => {
      this.unsubscribe(projectId, subscriber);
    };
  }

  unsubscribe(projectId: string, subscriber: EventSubscriber): void {
    const projectSubscribers = this.subscribers.get(projectId);
    if (!projectSubscribers) {
      return;
    }

    projectSubscribers.delete(subscriber);

    if (projectSubscribers.size === 0) {
      this.subscribers.delete(projectId);
    }
  }

  publish(event: DomainEvent): void {
    const projectSubscribers = this.subscribers.get(event.projectId);
    if (!projectSubscribers) {
      return;
    }

    for (const subscriber of [...projectSubscribers]) {
      try {
        subscriber(event);
      } catch (error) {
        console.error("Project event subscriber failed", error);
      }
    }
  }
}

const globalForBroadcaster = globalThis as unknown as {
  projectEventBroadcaster?: ProjectEventBroadcaster;
};

export const projectEventBroadcaster =
  globalForBroadcaster.projectEventBroadcaster ?? new ProjectEventBroadcaster();

if (process.env.NODE_ENV !== "production") {
  globalForBroadcaster.projectEventBroadcaster = projectEventBroadcaster;
}
