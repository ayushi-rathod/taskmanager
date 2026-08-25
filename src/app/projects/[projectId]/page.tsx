import { ProjectEventStream } from "@/components/realtime/project-event-stream";
import { TaskManager } from "@/components/tasks/task-manager";

export default async function ProjectTaskPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return (
    <main style={{ padding: "2rem", maxWidth: "1100px", margin: "0 auto" }}>
      <ProjectEventStream projectId={projectId} />
      <TaskManager projectId={projectId} />
    </main>
  );
}
