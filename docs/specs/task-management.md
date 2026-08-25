# 04 — Task Management

## 1. Purpose

This specification implements the core **Task Management** vertical slice on top of the completed Architecture Contract, Application Bootstrap, Domain & Data Model, and Project Management milestones.

It adds:

- list tasks within a project,
- create a task,
- read/open a task,
- edit a task,
- delete a task,
- manage task status, priority, description, tags, custom fields, and assignees,
- persist task changes in PostgreSQL.

The implementation flow is:

```text
Project page
    ↓
Task UI
    ↓
REST API
    ↓
Task service
    ↓
Prisma
    ↓
PostgreSQL
```

This milestone must not implement task dependencies, comments, SSE, realtime propagation, authentication, or bonus features.

Authoritative specifications:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
```

---

## 2. Objective

At completion, a user should be able to:

```text
open a project
      ↓
see persisted tasks
      ↓
create a task
      ↓
edit task fields
      ↓
assign simulated users
      ↓
change status / priority
      ↓
refresh the page
      ↓
see persisted changes
      ↓
delete the task
```

This milestone proves a complete Task CRUD flow while preserving separate resource boundaries for Projects, Tasks, Comments, Dependencies, and realtime events.

---

## 3. Prerequisites

Do not begin until Project Management is complete.

Verify:

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
```

Also confirm the existing Project Management flow still works.

---

## 4. Scope

### 4.1 In Scope

Implement:

- Task service functions,
- runtime Task validation,
- `GET /api/projects/:projectId/tasks`,
- `POST /api/projects/:projectId/tasks`,
- `GET /api/tasks/:taskId`,
- `PATCH /api/tasks/:taskId`,
- `DELETE /api/tasks/:taskId`,
- TaskAssignee persistence,
- task list UI,
- create-task UI,
- edit-task UI,
- delete-task UI,
- status editing,
- priority editing,
- description editing,
- tags editing,
- assignee editing,
- API support for `customFields`,
- task version increment,
- stale task version rejection,
- minimal loading/error/empty states.

### 4.2 Out of Scope

Do not implement:

- dependency APIs,
- dependency UI,
- dependency completion validation,
- self-dependency validation,
- cycle detection,
- Comments,
- SSE,
- EventSource,
- event broadcaster,
- realtime task propagation,
- advanced conflict merging/retry,
- authentication,
- authorization,
- pagination,
- virtual scrolling,
- search,
- filters,
- drag-and-drop Kanban,
- optimistic UI,
- Redis / NATS / Kafka,
- bonus features.

A basic `409 Conflict` is in scope because the locked Task API requires an expected task version. Advanced conflict UX remains for the later Reliability milestone.

---

## 5. API Boundaries

Implement:

```text
GET    /api/projects/:projectId/tasks
POST   /api/projects/:projectId/tasks

GET    /api/tasks/:taskId
PATCH  /api/tasks/:taskId
DELETE /api/tasks/:taskId
```

Do not add dependency or comment endpoints.

---

## 6. Task Response Shape

Return a stable shape equivalent to:

```json
{
  "id": "task-uuid",
  "projectId": "project-uuid",
  "title": "Build backend",
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "description": "Implement the task APIs.",
  "tags": ["backend", "api"],
  "customFields": {},
  "version": 3,
  "assignees": [
    {
      "id": "user-uuid",
      "name": "Carlos"
    }
  ],
  "createdAt": "2026-08-24T12:00:00.000Z",
  "updatedAt": "2026-08-24T12:05:00.000Z"
}
```

Do not embed:

- Comments,
- dependency graphs,
- full Project objects.

Lightweight assignee objects are allowed.

---

## 7. GET /api/projects/:projectId/tasks

### Responsibility

Return Tasks belonging to one Project.

### Success

```http
200 OK
```

```json
{
  "tasks": []
}
```

or populated Tasks.

### Ordering

Use deterministic ordering.

Recommended:

```text
createdAt ASC
```

### Errors

Invalid project UUID:

```http
400 Bad Request
```

Missing Project:

```http
404 Not Found
```

Do not return `404` merely because the Project has zero Tasks.

---

## 8. POST /api/projects/:projectId/tasks

### Request

```http
POST /api/projects/:projectId/tasks
Content-Type: application/json
```

Supported body:

```json
{
  "title": "Build backend",
  "status": "TODO",
  "priority": "HIGH",
  "description": "Implement the task APIs.",
  "tags": ["backend", "api"],
  "customFields": {
    "estimate": 3
  },
  "assigneeIds": [
    "user-uuid"
  ]
}
```

### Required

```text
title
```

### Optional

```text
status
priority
description
tags
customFields
assigneeIds
```

Defaults must align with the Prisma schema:

```text
status       → TODO
priority     → MEDIUM
description  → null
tags         → []
customFields → {}
assigneeIds  → []
version      → 1
```

### Validation

Validate at runtime:

- valid project UUID,
- Project exists,
- valid JSON body,
- non-empty trimmed title,
- status is `TODO`, `IN_PROGRESS`, or `DONE`,
- priority is `LOW`, `MEDIUM`, or `HIGH`,
- description is string or null,
- tags is an array of strings,
- customFields is a JSON object and not an array,
- assigneeIds is an array of valid UUID strings,
- all supplied assignee IDs exist.

Do not accept dependency IDs in this request.

### Atomicity

Task creation and TaskAssignee creation must be one logical mutation.

Use a Prisma nested write or transaction.

Do not persist a Task if supplied assignees are invalid.

### Success

```http
201 Created
```

```json
{
  "task": {
    "...": "task response"
  }
}
```

### Errors

Invalid input:

```http
400 Bad Request
```

Missing Project:

```http
404 Not Found
```

Unknown assignee:

```http
400 Bad Request
```

Suggested error:

```json
{
  "code": "INVALID_ASSIGNEE",
  "message": "One or more assignees do not exist."
}
```

---

## 9. GET /api/tasks/:taskId

### Success

```http
200 OK
```

```json
{
  "task": {
    "...": "task response"
  }
}
```

### Errors

Invalid UUID:

```http
400 Bad Request
```

Missing Task:

```http
404 Not Found
```

```json
{
  "code": "TASK_NOT_FOUND",
  "message": "Task not found."
}
```

---

## 10. PATCH /api/tasks/:taskId

Every mutation must include the client's expected `version`.

Example:

```json
{
  "version": 3,
  "status": "IN_PROGRESS",
  "priority": "HIGH"
}
```

### Mutable fields

Allow:

```text
title
status
priority
description
tags
customFields
assigneeIds
```

Do not allow clients to change:

```text
id
projectId
createdAt
updatedAt
version directly
dependencies
comments
```

The incoming `version` is the expected current version, not the desired new version.

### Partial updates

PATCH may contain any subset of mutable fields plus `version`.

Example:

```json
{
  "version": 3,
  "priority": "LOW"
}
```

Require at least one mutable field in addition to `version`.

### Version behavior

If the database Task has:

```text
version = 3
```

and the request contains:

```text
version = 3
```

the successful mutation must return:

```text
version = 4
```

The version increment must be part of the successful mutation.

### Stale version

If the current database version is `3` and the client sends `2`, return:

```http
409 Conflict
```

```json
{
  "code": "VERSION_CONFLICT",
  "message": "Task was modified by another client."
}
```

Do not silently overwrite newer state.

### Atomic expected-version check

Do not implement concurrency as:

```text
read current version
        ↓
later perform unrelated update
```

where another write can happen between those operations.

Use an atomic conditional update / transaction pattern supported by Prisma and PostgreSQL.

If assignees change in the same request, the Task update, version increment, and assignment replacement must behave as one logical mutation.

### UI behavior for 409

Advanced conflict resolution is not required yet.

Acceptable behavior:

```text
show stale-data message
      ↓
refetch latest Task/list
```

Do not automatically merge or replay the user's edit.

---

## 11. DELETE /api/tasks/:taskId

### Success

Recommended:

```http
204 No Content
```

### Errors

Invalid UUID:

```http
400 Bad Request
```

Missing Task:

```http
404 Not Found
```

### Relational cleanup

Use the existing database relations/cascades so deleting the Task removes dependent relation rows such as:

- TaskAssignee rows,
- Comments if any exist,
- TaskDependency edges if any exist.

Do not implement dependency product behavior here.

---

## 12. Task Service Layer

Keep Route Handlers thin.

Preferred direction:

```text
Route Handler
      ↓
Task Service
      ↓
Prisma
      ↓
PostgreSQL
```

Recommended module:

```text
src/server/tasks/task.service.ts
```

Responsibilities equivalent to:

```ts
listProjectTasks(projectId)
getTaskById(taskId)
createTask(projectId, input)
updateTask(taskId, expectedVersion, input)
deleteTask(taskId)
```

The Task service owns:

- Task persistence,
- assignee relation persistence,
- expected-version mutation,
- response queries.

Routes own:

- HTTP parsing,
- UUID validation,
- request validation,
- HTTP status mapping.

Do not add a repository layer merely for ceremony.

---

## 13. Validation Layer

Use a small task validation module, such as:

```text
src/server/tasks/task.validation.ts
```

Conceptual inputs:

```ts
type CreateTaskInput = {
  title: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  assigneeIds?: string[];
};

type UpdateTaskInput = {
  version: number;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  assigneeIds?: string[];
};
```

TypeScript types do not replace runtime validation.

---

## 14. User Data for Assignees

The seeded `User` rows exist for assignments/comments.

Task forms need read-only access to those Users.

Preferred approach:

- load Users through a small server-side service and pass them to the Task UI.

A minimal read-only:

```http
GET /api/users
```

is acceptable only if the existing client architecture makes server-side loading awkward.

If added, it must:

- be read-only,
- return only `id` and `name`,
- not introduce User Management.

Do not add User create/update/delete behavior.

---

## 15. Task List UI

The Project detail page should display Tasks for that Project.

A simple list/table/card layout is enough.

At minimum show:

- title,
- status,
- priority,
- assignee names.

Example:

```text
Tasks

[ + Create Task ]

Design API
DONE · HIGH
Ayushi

Build Backend
IN_PROGRESS · HIGH
Carlos
```

Do not build Kanban drag-and-drop.

---

## 16. Create Task UI

Support:

- title,
- status,
- priority,
- description,
- tags,
- assignees.

`customFields` must work through the API/database but does not require a rich dynamic editor.

A basic JSON editor is optional, not required.

### Flow

```text
Create Task form
      ↓
POST /api/projects/:projectId/tasks
      ↓
201
      ↓
refetch/update Task list
```

Requirements:

- prevent empty title,
- prevent duplicate submit while pending,
- display API errors,
- clear/close form on success.

Optimistic creation is not required.

---

## 17. Edit Task UI

Allow editing:

- title,
- status,
- priority,
- description,
- tags,
- assignees.

The edit request must send the current Task `version`.

On success, use the Task returned by the server, including its new version.

Do not increment version locally before the response.

If `409` occurs:

- do not show the edit as successful,
- show a clear stale-data message,
- refetch latest Task/list.

---

## 18. Delete Task UI

Provide a clear delete action.

A browser confirmation or lightweight confirmation UI is acceptable.

On successful deletion:

```text
DELETE
  ↓
204
  ↓
remove/refetch Task list
```

Do not implement undo/redo.

---

## 19. Status Behavior

Allow:

```text
TODO
IN_PROGRESS
DONE
```

Dependency-aware restrictions are deliberately deferred to the next milestone: **Dependencies & Status Rules**.

Do not implement fake dependency logic now.

---

## 20. Assignee Behavior

A Task may have zero, one, or many assignees.

Persist through `TaskAssignee`.

Do not store assignees as:

- comma-separated text,
- JSON on Task,
- a string array field on Task.

Update semantics:

- if `assigneeIds` is omitted, existing assignments remain unchanged,
- if `assigneeIds: []`, clear all assignments,
- if supplied with IDs, replace assignments with that set.

---

## 21. Tags and Custom Fields

### Tags

API example:

```json
{
  "tags": ["backend", "urgent"]
}
```

A comma-separated UI input that converts to `string[]` is sufficient.

Normalize basic whitespace.

### Custom Fields

API example:

```json
{
  "customFields": {
    "estimate": 3,
    "team": "platform"
  }
}
```

Top-level arrays are invalid.

Do not build a custom-field schema editor.

---

## 22. Error Semantics

Use:

```json
{
  "code": "SOME_ERROR_CODE",
  "message": "Human-readable explanation."
}
```

Expected statuses:

| Situation | Status |
|---|---:|
| invalid request | 400 |
| invalid UUID | 400 |
| invalid assignee | 400 |
| project not found | 404 |
| task not found | 404 |
| stale task version | 409 |
| unexpected failure | 500 |

Do not expose Prisma errors, stack traces, or credentials.

---

## 23. Large-Project Boundary

Keep:

```text
GET /api/projects/:projectId
```

for Project-level data.

Keep:

```text
GET /api/projects/:projectId/tasks
```

for Task-level data.

Do not change Project responses to embed all Tasks.

This preserves the architecture's large-payload direction.

Pagination is deferred.

---

## 24. No Realtime Yet

Do not implement:

- SSE,
- EventSource,
- `task.created`,
- `task.updated`,
- `task.deleted`,
- broadcaster logic.

For now:

```text
HTTP mutation
      ↓
HTTP response
      ↓
same client updates/refetches
```

Realtime Task synchronization is a later Collaboration milestone.

---

## 25. Recommended Repository Shape

```text
src/
├── app/
│   ├── api/
│   │   ├── projects/
│   │   │   └── [projectId]/
│   │   │       └── tasks/
│   │   │           └── route.ts
│   │   └── tasks/
│   │       └── [taskId]/
│   │           └── route.ts
│   │
│   └── projects/
│       └── [projectId]/
│           └── page.tsx
│
├── components/
│   └── tasks/
│       ├── task-list.tsx
│       ├── create-task-form.tsx
│       └── edit-task-form.tsx
│
└── server/
    └── tasks/
        ├── task.service.ts
        └── task.validation.ts
```

Exact filenames may vary.

A small read-only user service is acceptable if required for assignee options.

---

## 26. Verification Procedure

### A — Infrastructure

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
```

Existing domain verification must still pass.

### B — Start application

```bash
npm run dev
```

### C — Get a Project ID

```bash
curl -s http://localhost:3000/api/projects
```

### D — List Tasks

```bash
curl -i http://localhost:3000/api/projects/<project-id>/tasks
```

Expected:

```text
HTTP 200
```

### E — Create Task

```bash
curl -i   -X POST   http://localhost:3000/api/projects/<project-id>/tasks   -H 'Content-Type: application/json'   -d '{
    "title": "Task Management Verification",
    "priority": "HIGH",
    "description": "Created through the Task API",
    "tags": ["verification"]
  }'
```

Expected:

```text
HTTP 201
version = 1
```

Save Task ID and version.

### F — Invalid create

```bash
curl -i   -X POST   http://localhost:3000/api/projects/<project-id>/tasks   -H 'Content-Type: application/json'   -d '{"title":"   "}'
```

Expected:

```text
HTTP 400
```

### G — Read Task

```bash
curl -i http://localhost:3000/api/tasks/<task-id>
```

Expected:

```text
HTTP 200
```

### H — Update Task

```bash
curl -i   -X PATCH   http://localhost:3000/api/tasks/<task-id>   -H 'Content-Type: application/json'   -d '{
    "version": 1,
    "status": "IN_PROGRESS",
    "priority": "MEDIUM"
  }'
```

Expected:

```text
HTTP 200
version = 2
```

### I — Stale version

Repeat using old version `1`:

```bash
curl -i   -X PATCH   http://localhost:3000/api/tasks/<task-id>   -H 'Content-Type: application/json'   -d '{
    "version": 1,
    "priority": "LOW"
  }'
```

Expected:

```text
HTTP 409
```

with `VERSION_CONFLICT`.

### J — Verify assignees

Create/update using valid seeded User IDs.

Verify:

- returned Task includes assignee names,
- persisted assignments reload,
- omitted `assigneeIds` preserves assignments,
- `assigneeIds: []` clears assignments.

### K — Delete Task

```bash
curl -i -X DELETE http://localhost:3000/api/tasks/<task-id>
```

Expected:

```text
HTTP 204
```

A following GET must return `404`.

### L — UI

Open the app and verify:

1. open a Project,
2. seeded Tasks appear,
3. create a Task,
4. edit title/status/priority/description/tags,
5. assign Users,
6. refresh and confirm persistence,
7. delete the Task.

No second-browser realtime behavior is expected yet.

### M — Quality

```bash
npm run build
npm run lint
npm run verify:domain
```

All must pass.

---

## 27. Acceptance Criteria

### API

- [ ] Task list endpoint exists.
- [ ] valid Project returns Tasks.
- [ ] missing Project returns `404`.
- [ ] invalid Project ID returns `400`.
- [ ] Task create endpoint exists.
- [ ] valid Task returns `201`.
- [ ] new Task version is `1`.
- [ ] invalid title/status/priority/tags/customFields return `400`.
- [ ] invalid assignees are rejected.
- [ ] Task detail endpoint exists.
- [ ] missing Task returns `404`.
- [ ] invalid Task ID returns `400`.
- [ ] PATCH endpoint exists.
- [ ] PATCH requires expected version.
- [ ] successful PATCH increments version.
- [ ] stale version returns `409`.
- [ ] DELETE endpoint exists.
- [ ] successful DELETE returns `204`.
- [ ] deleted Task is no longer readable.

### Persistence

- [ ] Task persists after refresh.
- [ ] status persists.
- [ ] priority persists.
- [ ] description persists.
- [ ] tags persist.
- [ ] customFields persist through API.
- [ ] TaskAssignee relations persist.
- [ ] assignees can be replaced.
- [ ] assignees can be cleared.
- [ ] Task deletion leaves no invalid assignment rows.

### Architecture

- [ ] Route Handlers remain thin.
- [ ] Task service owns Prisma Task operations.
- [ ] runtime validation exists.
- [ ] Project API remains Project-only.
- [ ] Task API does not embed Comments.
- [ ] Task API does not embed dependency graphs.
- [ ] no unnecessary repository layer.
- [ ] no realtime infrastructure.

### UI

- [ ] Project page lists Tasks.
- [ ] empty state works.
- [ ] create Task works.
- [ ] edit Task works.
- [ ] status/priority/description/tags can be edited.
- [ ] assignees can be edited.
- [ ] duplicate submit while pending is prevented.
- [ ] API errors are visible.
- [ ] delete Task works.
- [ ] refresh preserves persisted Task state.
- [ ] `409` is not shown as a successful save.

### Scope

- [ ] no Dependency APIs/UI.
- [ ] no dependency completion rule.
- [ ] no Comments.
- [ ] no SSE/EventSource.
- [ ] no realtime broadcast.
- [ ] no authentication.
- [ ] no bonus features.

### Quality

- [ ] domain verification passes.
- [ ] Project Management still works.
- [ ] production build passes.
- [ ] lint/static checks pass.
- [ ] application remains runnable.

---

## 28. Definition of Done

Task Management is complete when a reviewer can demonstrate:

```text
Open Project
    ↓
See persisted Tasks
    ↓
Create Task
    ↓
Edit Task
    ↓
Assign Users
    ↓
Change status / priority
    ↓
Refresh
    ↓
Changes remain
    ↓
Delete Task
```

The server must also preserve:

```text
expected version N
      ↓
successful mutation
      ↓
version N + 1
```

and reject stale writes.

Dependencies, Comments, and realtime synchronization are intentionally absent.

---

## 29. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "feat: add task management"
```

Do not include Dependencies & Status Rules work in this commit.

---

## 30. Handoff: Dependencies & Status Rules

The next milestone will add:

```text
POST   /api/tasks/:taskId/dependencies
DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId
```

and enforce:

```text
a Task cannot depend on itself

dependency Tasks must belong to the intended Project

a Task cannot become DONE while a dependency is incomplete
```

Cycle detection should be evaluated in that specification.

Realtime remains separate.

---

## 31. Agent Implementation Prompt

Use this specification with:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
docs/specs/04-task-management.md
```

Prompt:

> Implement the **Task Management** milestone defined in `docs/specs/04-task-management.md`.
>
> Architecture, Application Bootstrap, Domain & Data Model, and Project Management are already complete. Preserve them.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract.
>
> Implement only:
> - Task service and runtime validation,
> - `GET /api/projects/:projectId/tasks`,
> - `POST /api/projects/:projectId/tasks`,
> - `GET /api/tasks/:taskId`,
> - `PATCH /api/tasks/:taskId`,
> - `DELETE /api/tasks/:taskId`,
> - TaskAssignee persistence,
> - task-level version increment and stale-version rejection,
> - minimal Task list/create/edit/delete UI,
> - status, priority, description, tags, and assignee editing,
> - API support for `customFields`,
> - required loading/error/empty states.
>
> Do not implement Dependencies, dependency completion rules, Comments, SSE, realtime events, event broadcasting, advanced conflict recovery, authentication, or bonus features.
>
> Keep Project API responses Project-only.
>
> Keep Route Handlers thin and put Task persistence/version logic in a Task service using the existing Prisma client.
>
> Ensure Task creation and assignment persistence are atomic.
>
> Ensure PATCH uses an atomic expected-version check and increments version on success.
>
> Run every acceptance check in `04-task-management.md`.
>
> At completion report:
> 1. files created or modified,
> 2. endpoints implemented,
> 3. commands executed,
> 4. API verification results,
> 5. version/stale-write verification results,
> 6. assignee verification results,
> 7. UI verification results,
> 8. build/lint/domain verification results,
> 9. any deviation from the specification,
> 10. any issue before Dependencies & Status Rules begins.
>
> Do not silently redesign the architecture.
> Do not begin the Dependencies & Status Rules milestone.
