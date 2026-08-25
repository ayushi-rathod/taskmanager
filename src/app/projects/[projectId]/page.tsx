import { TaskManager } from "@/components/tasks/task-manager";

export default function ProjectTaskPage({ params }: { params: { projectId: string } }) {
  return (
    <main style={{ padding: "2rem", maxWidth: "1100px", margin: "0 auto" }}>
      <TaskManager projectId={params.projectId} />
    </main>
  );
}
