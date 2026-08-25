"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

export type TaskAssignee = { id: string; name: string };

export type TaskItem = {
  id: string;
  projectId: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  description: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  version: number;
  assignees: TaskAssignee[];
  createdAt: string;
  updatedAt: string;
};

type UserOption = { id: string; name: string };

type DependencyItem = {
  taskId: string;
  dependsOnTask: {
    id: string;
    title: string;
    status: string;
  };
};

type TaskFormState = {
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  tags: string;
  customFields: string;
  assigneeIds: string[];
};

const emptyForm = (): TaskFormState => ({
  title: "",
  status: "TODO",
  priority: "MEDIUM",
  description: "",
  tags: "",
  customFields: "{}",
  assigneeIds: [],
});

function parseTaskForm(form: TaskFormState) {
  let parsedCustomFields: Record<string, unknown> = {};

  if (form.customFields.trim()) {
    try {
      const parsed = JSON.parse(form.customFields);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("customFields must be an object");
      }
      parsedCustomFields = parsed as Record<string, unknown>;
    } catch {
      throw new Error("customFields must be valid JSON object text.");
    }
  }

  return {
    title: form.title.trim(),
    status: form.status,
    priority: form.priority,
    description: form.description.trim() ? form.description.trim() : null,
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    customFields: parsedCustomFields,
    assigneeIds: form.assigneeIds,
  };
}

function taskToForm(task: TaskItem): TaskFormState {
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: task.description ?? "",
    tags: task.tags.join(", "),
    customFields: JSON.stringify(task.customFields ?? {}, null, 2),
    assigneeIds: task.assignees.map((assignee) => assignee.id),
  };
}

export function TaskManager({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createForm, setCreateForm] = useState<TaskFormState>(emptyForm());
  const [createPending, setCreatePending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<TaskFormState>(emptyForm());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [staleMessage, setStaleMessage] = useState("");
  const [dependencyForm, setDependencyForm] = useState<Record<string, string>>({});
  const [dependencyMap, setDependencyMap] = useState<Record<string, DependencyItem[]>>({});

  const loadTaskDependencies = useCallback(async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}/dependencies`);
    if (!response.ok) {
      return [] as DependencyItem[];
    }
    const payload = await response.json();
    return payload.dependencies ?? [];
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [tasksResponse, usersResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/tasks`),
        fetch("/api/users"),
      ]);

      if (!tasksResponse.ok) {
        throw new Error("Unable to load tasks.");
      }

      const tasksPayload = await tasksResponse.json();
      const usersPayload = await usersResponse.json();
      const resolvedTasks = tasksPayload.tasks ?? [];

      const dependencyEntries = await Promise.all(
        resolvedTasks.map(async (task: TaskItem) => ({
          taskId: task.id,
          dependencies: await loadTaskDependencies(task.id),
        }))
      );

      const nextDependencyMap = dependencyEntries.reduce<Record<string, DependencyItem[]>>((accumulator, entry) => {
        accumulator[entry.taskId] = entry.dependencies;
        return accumulator;
      }, {});

      setTasks(resolvedTasks);
      setDependencyMap(nextDependencyMap);
      setUsers(usersPayload.users ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [loadTaskDependencies, projectId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const handleProjectTaskEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type?: string;
        projectId?: string;
        entityId?: string | null;
        data?: {
          task?: TaskItem;
          version?: number;
          changes?: Record<string, unknown>;
          taskId?: string;
        };
      }>;

      const payload = customEvent.detail;
      if (!payload || payload.projectId !== projectId) {
        return;
      }

      if (payload.type === "task.created") {
        const task = payload.data?.task;
        if (!task || !task.id) {
          return;
        }

        setTasks((currentTasks) => {
          if (currentTasks.some((existingTask) => existingTask.id === task.id)) {
            return currentTasks;
          }

          return [...currentTasks, task].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        });
        return;
      }

      if (payload.type === "task.updated") {
        const taskId = payload.entityId ?? payload.data?.taskId;
        if (!taskId) {
          return;
        }

        const incomingVersion = payload.data?.version;

        setTasks((currentTasks) => {
          const index = currentTasks.findIndex((existingTask) => existingTask.id === taskId);
          if (index === -1) {
            return currentTasks;
          }

          const currentTask = currentTasks[index];
          const version = typeof incomingVersion === "number" ? incomingVersion : currentTask.version;
          if (version <= currentTask.version) {
            return currentTasks;
          }

          const nextTask = { ...currentTask };
          const changes = payload.data?.changes ?? {};

          if (typeof changes.title === "string") nextTask.title = changes.title;
          if (typeof changes.status === "string") nextTask.status = changes.status as TaskItem["status"];
          if (typeof changes.priority === "string") nextTask.priority = changes.priority as TaskItem["priority"];
          if (changes.description !== undefined) nextTask.description = changes.description as string | null;
          if (Array.isArray(changes.tags)) nextTask.tags = changes.tags as string[];
          if (changes.customFields && typeof changes.customFields === "object") nextTask.customFields = changes.customFields as Record<string, unknown>;
          if (Array.isArray(changes.assignees)) nextTask.assignees = changes.assignees as TaskAssignee[];

          nextTask.version = version;
          nextTask.updatedAt = new Date().toISOString();

          return currentTasks.map((existingTask) => (existingTask.id === taskId ? nextTask : existingTask));
        });
        return;
      }

      if (payload.type === "task.deleted") {
        const taskId = payload.data?.taskId ?? payload.entityId;
        if (!taskId) {
          return;
        }

        setTasks((currentTasks) => currentTasks.filter((existingTask) => existingTask.id !== taskId));
      }
    };

    window.addEventListener("project-task-event", handleProjectTaskEvent);
    return () => window.removeEventListener("project-task-event", handleProjectTaskEvent);
  }, [projectId]);

  const projectLabel = useMemo(() => {
    if (tasks.length === 0) {
      return "Project Tasks";
    }

    return `Project Tasks (${tasks.length})`;
  }, [tasks.length]);

  const handleCreateSubmit = async (form: TaskFormState) => {
    setCreatePending(true);
    setError("");

    try {
      const payload = parseTaskForm(form);
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || "Task could not be created.");
      }

      setCreateForm(emptyForm());
      await loadTasks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Task could not be created.");
    } finally {
      setCreatePending(false);
    }
  };

  const handleUpdate = async (task: TaskItem) => {
    setSavingId(task.id);
    setError("");
    setStaleMessage("");

    try {
      const payload = parseTaskForm(editingForm);
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: task.version, ...payload }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setStaleMessage("Task was modified by another client. Refreshing the latest version...");
          await loadTasks();
          setEditingId(null);
          return;
        }

        if (response.status === 422) {
          setError(result?.message || "Task cannot be completed while dependencies are incomplete.");
          await loadTasks();
          setEditingId(null);
          return;
        }

        throw new Error(result?.message || "Task could not be updated.");
      }

      setEditingId(null);
      await loadTasks();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Task could not be updated.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDependencyAdd = async (taskId: string) => {
    if (!dependencyForm[taskId]) return;

    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnTaskId: dependencyForm[taskId] }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Dependency could not be added.");
      }

      setDependencyForm((current) => ({ ...current, [taskId]: "" }));
      await loadTasks();
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : "Dependency could not be added.");
    }
  };

  const handleDependencyRemove = async (taskId: string, dependsOnTaskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies/${dependsOnTaskId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Dependency could not be removed.");
      }

      await loadTasks();
    } catch (dependencyError) {
      setError(dependencyError instanceof Error ? dependencyError.message : "Dependency could not be removed.");
    }
  };

  const handleDelete = async (taskId: string) => {
    setDeleteId(taskId);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error("Task could not be deleted.");
      }

      setEditingId(null);
      await loadTasks();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Task could not be deleted.");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{projectLabel}</h2>
        <a href="/" style={{ color: "#1d4ed8" }}>Back to projects</a>
      </div>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>Create task</h3>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <label>
            <div>Title</div>
            <input
              value={createForm.title}
              onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
              style={inputStyle}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
            <label>
              <div>Status</div>
              <select
                value={createForm.status}
                onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value as TaskFormState["status"] }))}
                style={inputStyle}
              >
                <option value="TODO">TODO</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="DONE">DONE</option>
              </select>
            </label>
            <label>
              <div>Priority</div>
              <select
                value={createForm.priority}
                onChange={(event) => setCreateForm((current) => ({ ...current, priority: event.target.value as TaskFormState["priority"] }))}
                style={inputStyle}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </label>
          </div>

          <label>
            <div>Description</div>
            <textarea
              value={createForm.description}
              onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
              style={{ ...inputStyle, minHeight: 90 }}
            />
          </label>

          <label>
            <div>Tags</div>
            <input
              value={createForm.tags}
              onChange={(event) => setCreateForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="backend, api"
              style={inputStyle}
            />
          </label>

          <label>
            <div>Custom fields (JSON)</div>
            <textarea
              value={createForm.customFields}
              onChange={(event) => setCreateForm((current) => ({ ...current, customFields: event.target.value }))}
              style={{ ...inputStyle, minHeight: 80, fontFamily: "monospace" }}
            />
          </label>

          <div>
            <div style={{ marginBottom: 8 }}>Assignees</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {users.map((user) => {
                const checked = createForm.assigneeIds.includes(user.id);
                return (
                  <label key={user.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setCreateForm((current) => ({
                          ...current,
                          assigneeIds: checked
                            ? current.assigneeIds.filter((value) => value !== user.id)
                            : [...current.assigneeIds, user.id],
                        }))
                      }
                    />
                    {user.name}
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => handleCreateSubmit(createForm)}
            disabled={createPending || !createForm.title.trim()}
            style={primaryButtonStyle}
          >
            {createPending ? "Creating..." : "Create task"}
          </button>
        </div>
      </section>

      {staleMessage ? <div style={warningBoxStyle}>{staleMessage}</div> : null}
      {error ? <div style={errorBoxStyle}>{error}</div> : null}

      {loading ? (
        <div style={emptyBoxStyle}>Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <div style={emptyBoxStyle}>No tasks yet for this project.</div>
      ) : (
        <section style={{ display: "grid", gap: "1rem" }}>
          {tasks.map((task) => {
            const isEditing = editingId === task.id;

            return (
              <article key={task.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem" }}>
                {isEditing ? (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <label>
                      <div>Title</div>
                      <input
                        value={editingForm.title}
                        onChange={(event) => setEditingForm((current) => ({ ...current, title: event.target.value }))}
                        style={inputStyle}
                      />
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
                      <label>
                        <div>Status</div>
                        <select
                          value={editingForm.status}
                          onChange={(event) => setEditingForm((current) => ({ ...current, status: event.target.value as TaskFormState["status"] }))}
                          style={inputStyle}
                        >
                          <option value="TODO">TODO</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="DONE">DONE</option>
                        </select>
                      </label>
                      <label>
                        <div>Priority</div>
                        <select
                          value={editingForm.priority}
                          onChange={(event) => setEditingForm((current) => ({ ...current, priority: event.target.value as TaskFormState["priority"] }))}
                          style={inputStyle}
                        >
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                        </select>
                      </label>
                    </div>

                    <label>
                      <div>Description</div>
                      <textarea
                        value={editingForm.description}
                        onChange={(event) => setEditingForm((current) => ({ ...current, description: event.target.value }))}
                        style={{ ...inputStyle, minHeight: 90 }}
                      />
                    </label>

                    <label>
                      <div>Tags</div>
                      <input
                        value={editingForm.tags}
                        onChange={(event) => setEditingForm((current) => ({ ...current, tags: event.target.value }))}
                        style={inputStyle}
                      />
                    </label>

                    <label>
                      <div>Custom fields (JSON)</div>
                      <textarea
                        value={editingForm.customFields}
                        onChange={(event) => setEditingForm((current) => ({ ...current, customFields: event.target.value }))}
                        style={{ ...inputStyle, minHeight: 80, fontFamily: "monospace" }}
                      />
                    </label>

                    <div>
                      <div style={{ marginBottom: 8 }}>Assignees</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {users.map((user) => {
                          const checked = editingForm.assigneeIds.includes(user.id);
                          return (
                            <label key={user.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setEditingForm((current) => ({
                                    ...current,
                                    assigneeIds: checked
                                      ? current.assigneeIds.filter((value) => value !== user.id)
                                      : [...current.assigneeIds, user.id],
                                  }))
                                }
                              />
                              {user.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      <button
                        onClick={() => handleUpdate(task)}
                        disabled={savingId === task.id}
                        style={primaryButtonStyle}
                      >
                        {savingId === task.id ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setError("");
                        }}
                        style={secondaryButtonStyle}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <h3 style={{ margin: "0 0 0.5rem" }}>{task.title}</h3>
                        <div style={{ color: "#475569", marginBottom: 8 }}>
                          {task.status} · {task.priority} · v{task.version}
                        </div>
                        {task.description ? <p style={{ margin: 0 }}>{task.description}</p> : null}
                        {task.tags.length > 0 ? (
                          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {task.tags.map((tag) => (
                              <span key={tag} style={{ background: "#e2e8f0", borderRadius: 999, padding: "0.2rem 0.5rem", fontSize: 12 }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {Object.keys(task.customFields ?? {}).length > 0 ? (
                          <pre style={{ marginTop: 8, background: "#f8fafc", padding: "0.5rem", borderRadius: 8, overflowX: "auto" }}>
                            {JSON.stringify(task.customFields, null, 2)}
                          </pre>
                        ) : null}

                        <div style={{ marginTop: 10 }}>
                          <strong>Dependencies:</strong>
                          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                            {(dependencyMap[task.id] ?? []).length > 0 ? (
                              (dependencyMap[task.id] ?? []).map((dependency) => (
                                <div key={dependency.taskId + dependency.dependsOnTask.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                  <span>
                                    {dependency.dependsOnTask.title} ({dependency.dependsOnTask.status})
                                  </span>
                                  <button
                                    onClick={() => handleDependencyRemove(task.id, dependency.dependsOnTask.id)}
                                    style={dangerButtonStyle}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))
                            ) : (
                              <span style={{ color: "#64748b" }}>No dependencies</span>
                            )}
                          </div>

                          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                            {tasks
                              .filter((candidate) => candidate.id !== task.id)
                              .filter((candidate) => !(dependencyMap[task.id] ?? []).some((dependency) => dependency.dependsOnTask.id === candidate.id))
                              .map((candidate) => (
                                <label key={candidate.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input
                                    type="radio"
                                    name={`dependency-${task.id}`}
                                    checked={dependencyForm[task.id] === candidate.id}
                                    onChange={() => setDependencyForm((current) => ({ ...current, [task.id]: candidate.id }))}
                                  />
                                  {candidate.title} ({candidate.status})
                                </label>
                              ))}
                            {tasks.filter((candidate) => candidate.id !== task.id).filter((candidate) => !(dependencyMap[task.id] ?? []).some((dependency) => dependency.dependsOnTask.id === candidate.id)).length === 0 ? (
                              <span style={{ color: "#64748b" }}>No remaining dependency candidates</span>
                            ) : null}
                          </div>

                          {dependencyForm[task.id] ? (
                            <button onClick={() => handleDependencyAdd(task.id)} style={{ ...secondaryButtonStyle, marginTop: 8 }}>
                              Add dependency
                            </button>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <strong>Assignees:</strong> {task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.name).join(", ") : "Unassigned"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                          onClick={() => {
                            setEditingId(task.id);
                            setEditingForm(taskToForm(task));
                            setError("");
                          }}
                          style={secondaryButtonStyle}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete "${task.title}"?`)) {
                              handleDelete(task.id);
                            }
                          }}
                          style={dangerButtonStyle}
                          disabled={deleteId === task.id}
                        >
                          {deleteId === task.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "0.65rem 0.75rem",
  fontSize: 14,
  boxSizing: "border-box",
};

const primaryButtonStyle: CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.7rem 1rem",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  background: "#e2e8f0",
  color: "#0f172a",
  border: "none",
  borderRadius: 8,
  padding: "0.7rem 1rem",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  background: "#dc2626",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.7rem 1rem",
  fontWeight: 600,
  cursor: "pointer",
};

const emptyBoxStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "1.25rem",
  color: "#475569",
};

const errorBoxStyle: CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fee2e2",
  color: "#991b1b",
  borderRadius: 8,
  padding: "0.75rem 1rem",
};

const warningBoxStyle: CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  color: "#92400e",
  borderRadius: 8,
  padding: "0.75rem 1rem",
};
