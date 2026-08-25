"use client";

import { useEffect, useRef, useState } from "react";

export function ProjectEventStream({ projectId }: { projectId: string }) {
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    const eventSource = new EventSource(`/api/projects/${projectId}/events`);

    const handleIncomingEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; projectId?: string; entityId?: string | null; data?: unknown };

        if (payload.type === "system.test") {
          console.info("[realtime] system.test received", payload);
        }

        window.dispatchEvent(
          new CustomEvent("project-task-event", {
            detail: payload,
          })
        );
      } catch (error) {
        console.warn("[realtime] invalid event payload", error);
      }
    };

    eventSource.onopen = () => {
      if (hasConnectedRef.current) {
        window.location.reload();
      }
      hasConnectedRef.current = true;
      setConnectionState("connected");
    };

    eventSource.onmessage = handleIncomingEvent;
    eventSource.onerror = () => {
      setConnectionState(eventSource.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
    };

    return () => {
      eventSource.close();
    };
  }, [projectId]);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 999,
        padding: "0.4rem 0.75rem",
        color: "#0f172a",
        fontSize: 12,
        marginBottom: 12,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background:
            connectionState === "connected"
              ? "#16a34a"
              : connectionState === "reconnecting"
                ? "#f59e0b"
                : connectionState === "offline"
                  ? "#ef4444"
                  : "#94a3b8",
        }}
      />
      Realtime: {connectionState}
    </div>
  );
}
