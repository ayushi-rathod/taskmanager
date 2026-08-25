import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
    },
  });

  return (
    <main style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1>Collaborative Task Manager</h1>
        <p style={{ color: "#475569" }}>Open a project to review and manage tasks.</p>
      </header>

      {projects.length === 0 ? (
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.5rem" }}>
          <p>No projects found yet.</p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: "1rem" }}>
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              style={{
                display: "block",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "1.25rem 1.5rem",
                textDecoration: "none",
                color: "#111827",
              }}
            >
              <h2 style={{ margin: "0 0 0.5rem" }}>{project.name}</h2>
              <p style={{ margin: 0, color: "#475569" }}>{project.description || "No description"}</p>
              <small style={{ color: "#64748b" }}>{new Date(project.createdAt).toLocaleDateString()}</small>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
