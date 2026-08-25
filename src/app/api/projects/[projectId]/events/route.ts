import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatSseEvent } from "@/lib/events/create-event";
import { projectEventBroadcaster } from "@/lib/events/broadcaster";
import { isValidUuid } from "@/server/tasks/task.validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  if (!isValidUuid(projectId)) {
    return NextResponse.json({ code: "INVALID_PROJECT_ID", message: "Project ID is invalid." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ code: "PROJECT_NOT_FOUND", message: "Project not found." }, { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let heartbeatTimer: NodeJS.Timeout | null = null;
      const sendKeepalive = () => {
        controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
      };

      const subscriber = (event: { id: string; type: string; projectId: string; entityId: string | null; timestamp: string; data: unknown }) => {
        try {
          controller.enqueue(new TextEncoder().encode(formatSseEvent(event)));
        } catch (error) {
          console.error("SSE subscriber delivery failed", error);
        }
      };

      const unsubscribe = projectEventBroadcaster.subscribe(projectId, subscriber);
      heartbeatTimer = setInterval(sendKeepalive, 20000);

      const abortHandler = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
        unsubscribe();
        controller.close();
      };

      request.signal.addEventListener("abort", abortHandler, { once: true });
      sendKeepalive();
    },
    cancel() {
      // Close any remaining stream resources when the client disconnects.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
