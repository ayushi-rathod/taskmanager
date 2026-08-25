# 05 — Dependencies & Status Rules

## 1. Purpose

This specification implements the core **Task Dependencies & Status Rules** capability on top of the completed:

- Architecture Contract
- Application Bootstrap
- Domain & Data Model
- Project Management
- Task Management

The milestone adds:

- create a dependency between two Tasks,
- remove a dependency,
- display/manage dependencies in the Project/Task UI,
- reject invalid dependency relationships,
- prevent a Task from becoming `DONE` while any direct dependency is incomplete.

The implementation flow is:

```text
Task UI
   ↓
Dependency REST API / Task PATCH
   ↓
Dependency + Task services
   ↓
Prisma transaction
   ↓
PostgreSQL
```

This milestone does **not** implement Comments, SSE, realtime synchronization, presence, notifications, or bonus features.

Authoritative specifications:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
docs/specs/04-task-management.md
```

---

## 2. Objective

At completion, a user should be able to:

```text
open a Project
      ↓
choose a Task
      ↓
add another Task as a dependency
      ↓
see the dependency persisted
      ↓
attempt to mark the dependent Task DONE
      ↓
receive a clear rejection while dependency is incomplete
      ↓
complete the dependency
      ↓
mark the dependent Task DONE successfully
      ↓
remove the dependency when needed
```

This milestone should make task dependencies meaningful domain behavior rather than merely stored IDs.

---

## 3. Prerequisites

Do not begin until Task Management passes its acceptance criteria.

Verify:

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
npm run build
npm run lint
```

Also manually confirm:

- Task list works,
- Task create/edit/delete works,
- Task version increments on successful PATCH,
- stale Task version returns `409`.

---

## 4. Scope

### 4.1 In Scope

Implement:

- dependency service logic,
- dependency request validation,
- `POST /api/tasks/:taskId/dependencies`,
- `DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId`,
- dependency read/query support for the UI through the server/service layer,
- dependency display in the Task UI,
- add-dependency UI,
- remove-dependency UI,
- self-dependency rejection,
- same-Project dependency validation,
- duplicate dependency handling,
- cycle detection,
- `DONE` transition validation,
- transactional validation/write behavior,
- clear domain errors,
- verification of dependency rules.

### 4.2 Out of Scope

Do not implement:

- Comments,
- comment threads,
- SSE,
- EventSource,
- realtime events,
- task synchronization across browsers,
- presence,
- live cursors,
- notifications,
- activity feed,
- optimistic UI,
- Redis / NATS / Kafka,
- authentication,
- authorization,
- advanced workflow engines,
- custom status definitions,
- dependency types such as "blocks", "relates to", or "soft dependency",
- Gantt/Kanban extensions,
- bonus features.

---

## 5. Domain Semantics

A dependency row:

```text
taskId = B
dependsOnTaskId = A
```

means:

```text
Task B depends on Task A
```

or:

```text
A must be complete before B can be completed.
```

Example:

```text
Design API          DONE
      ↓
Build Backend       IN_PROGRESS
```

Stored as:

```text
Build Backend depends on Design API
```

---

## 6. Core Dependency Rules

A dependency edge is valid only when all of the following are true:

1. the dependent Task exists,
2. the prerequisite Task exists,
3. the Task does not depend on itself,
4. both Tasks belong to the same Project,
5. the same dependency edge does not already exist,
6. adding the edge does not introduce a dependency cycle.

These validations belong in the server/domain layer.

Do not implement database triggers for this milestone.

---

## 7. Self-Dependency Rule

Reject:

```text
Task A depends on Task A
```

Response:

```http
400 Bad Request
```

Example:

```json
{
  "code": "SELF_DEPENDENCY",
  "message": "A task cannot depend on itself."
}
```

---

## 8. Same-Project Rule

Dependencies must remain inside one Project.

Reject:

```text
Project 1 / Task A
depends on
Project 2 / Task B
```

Response:

```http
422 Unprocessable Entity
```

Example:

```json
{
  "code": "CROSS_PROJECT_DEPENDENCY",
  "message": "Task dependencies must belong to the same project."
}
```

This keeps Project boundaries predictable and avoids cross-Project graph complexity.

---

## 9. Duplicate Dependency Rule

The database composite key already prevents duplicate edges.

The service should detect or map duplicate creation to a stable API response.

Recommended:

```http
409 Conflict
```

Example:

```json
{
  "code": "DEPENDENCY_EXISTS",
  "message": "This dependency already exists."
}
```

Do not expose the raw Prisma unique-constraint error.

---

## 10. Cycle Detection

Dependency graphs must not contain cycles.

Reject:

```text
A depends on B
B depends on A
```

Also reject indirect cycles:

```text
A depends on B
B depends on C
attempt:
C depends on A
```

### Required behavior

Before inserting:

```text
taskId = X
dependsOnTaskId = Y
```

determine whether `Y` already depends directly or indirectly on `X`.

If yes, adding the edge would create a cycle.

Return:

```http
422 Unprocessable Entity
```

Example:

```json
{
  "code": "DEPENDENCY_CYCLE",
  "message": "This dependency would create a cycle."
}
```

### Implementation guidance

The dataset is small in the take-home.

A clear server-side graph traversal is sufficient.

Possible approach:

```text
load dependency edges for the Project
        ↓
build adjacency map
        ↓
DFS/BFS from dependsOnTaskId
        ↓
if taskId is reachable
        ↓
reject
```

Do not introduce a graph database.

Do not optimize prematurely.

---

## 11. Completion Rule

The locked architecture defines:

> A Task cannot transition to `DONE` while any Task it directly depends on is not `DONE`.

Example:

```text
Design API      IN_PROGRESS

Build Backend   IN_PROGRESS
depends on Design API
```

Attempt:

```text
Build Backend → DONE
```

must fail.

Recommended response:

```http
422 Unprocessable Entity
```

Example:

```json
{
  "code": "INCOMPLETE_DEPENDENCIES",
  "message": "Task cannot be completed while dependencies are incomplete."
}
```

The response may optionally include a small list of incomplete dependency IDs/names if useful for the UI.

Do not return the entire Project or dependency graph.

---

## 12. Status Transition Integration

The existing endpoint remains:

```http
PATCH /api/tasks/:taskId
```

Do not create a separate status endpoint.

When PATCH contains:

```json
{
  "version": 4,
  "status": "DONE"
}
```

the Task service must:

```text
validate request
      ↓
validate expected Task version
      ↓
load direct dependencies
      ↓
confirm every dependency is DONE
      ↓
update Task
      ↓
increment version
```

If a dependency is incomplete:

- Task must remain unchanged,
- version must remain unchanged,
- return `422`.

If the expected Task version is stale:

- preserve the existing `409 VERSION_CONFLICT` contract.

Do not weaken the concurrency behavior implemented in Task Management.

---

## 13. Transactional Correctness

Complex dependency/status operations should use database transactions where appropriate.

### Add dependency

Conceptually:

```text
transaction
  ├── load both Tasks
  ├── validate same Project
  ├── validate no duplicate
  ├── validate no cycle
  └── insert TaskDependency
commit
```

### Transition to DONE

Conceptually:

```text
transaction
  ├── validate expected version
  ├── inspect direct dependencies
  ├── ensure dependencies are DONE
  └── update Task + increment version
commit
```

Use the strongest simple Prisma/PostgreSQL pattern already compatible with the existing implementation.

Do not introduce distributed locks.

For this take-home, clarity and correctness are more important than elaborate concurrency infrastructure.

---

## 14. POST /api/tasks/:taskId/dependencies

### Responsibility

Add one prerequisite Task.

### Request

```http
POST /api/tasks/:taskId/dependencies
Content-Type: application/json
```

Body:

```json
{
  "dependsOnTaskId": "task-uuid"
}
```

### Validation

Validate:

- `taskId` is a valid UUID,
- `dependsOnTaskId` is a valid UUID,
- both Tasks exist,
- not self dependency,
- same Project,
- edge not already present,
- no cycle.

### Success

Recommended:

```http
201 Created
```

Example:

```json
{
  "dependency": {
    "taskId": "dependent-task-uuid",
    "dependsOnTask": {
      "id": "prerequisite-task-uuid",
      "title": "Design API",
      "status": "DONE"
    }
  }
}
```

Keep the response small.

### Errors

| Situation | Status | Code |
|---|---:|---|
| invalid UUID/body | 400 | `INVALID_DEPENDENCY` |
| dependent Task missing | 404 | `TASK_NOT_FOUND` |
| prerequisite Task missing | 404 | `DEPENDENCY_TASK_NOT_FOUND` |
| self dependency | 400 | `SELF_DEPENDENCY` |
| different Projects | 422 | `CROSS_PROJECT_DEPENDENCY` |
| duplicate edge | 409 | `DEPENDENCY_EXISTS` |
| cycle | 422 | `DEPENDENCY_CYCLE` |

---

## 15. DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId

### Responsibility

Remove one dependency edge.

### Request

```http
DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId
```

### Validation

- both route parameters must be valid UUIDs,
- dependent Task should exist.

### Success

Recommended:

```http
204 No Content
```

### Missing edge

Choose one stable behavior and keep it consistent.

Recommended:

```http
404 Not Found
```

Example:

```json
{
  "code": "DEPENDENCY_NOT_FOUND",
  "message": "Task dependency not found."
}
```

Do not silently delete unrelated rows.

---

## 16. Dependency Read Strategy

The locked API architecture does not require a public dependency-list endpoint.

For this milestone, prefer server-side loading through a Dependency service for the Project/Task UI.

Example service operation:

```ts
getTaskDependencies(taskId)
```

or:

```ts
getProjectDependencyState(projectId)
```

The server-rendered Project page may pass lightweight dependency data into interactive client components.

After add/remove mutations, the UI may use:

```text
router.refresh()
```

or a targeted refetch.

Do not add a new public GET endpoint unless the existing implementation structure makes server-side loading impractical.

If a GET dependency endpoint is genuinely required, document the small deviation before adding it.

---

## 17. Dependency Service Layer

Create a small module, for example:

```text
src/server/dependencies/dependency.service.ts
```

Responsibilities may include:

```ts
getTaskDependencies(taskId)
addDependency(taskId, dependsOnTaskId)
removeDependency(taskId, dependsOnTaskId)
validateNoCycle(...)
```

Do not put graph traversal logic directly inside Route Handlers.

Preferred direction:

```text
Route Handler
      ↓
Dependency Service
      ↓
Prisma
      ↓
PostgreSQL
```

Task completion validation may remain in the existing Task service, possibly using a shared dependency helper.

Avoid circular module dependencies.

---

## 18. Dependency Validation Layer

Create a small validation helper if useful.

Runtime request shape:

```ts
type AddDependencyInput = {
  dependsOnTaskId: string;
};
```

Validate UUIDs at runtime.

Do not add a large validation framework solely for this milestone.

---

## 19. Dependency UI

On the Project page, Tasks should expose a small dependency section or edit control.

Example:

```text
Build Backend
IN_PROGRESS · HIGH

Depends on:
- Design API · DONE
- Define DB Schema · IN_PROGRESS

[ Add dependency ]
```

### Add dependency interaction

A user should be able to select another Task from the same Project.

Candidate list must:

- exclude the current Task,
- preferably exclude already-added dependencies.

The server remains authoritative; client filtering is only convenience.

### Remove dependency

Each dependency should have a simple remove action.

Do not implement drag-and-drop dependency creation.

Do not build a graph visualization.

---

## 20. DONE Validation UI

When a user tries:

```text
Task → DONE
```

and the server returns:

```text
422 INCOMPLETE_DEPENDENCIES
```

the UI must:

- not show the Task as DONE,
- display a clear error,
- keep/refetch authoritative Task state.

Example message:

```text
Cannot complete this task until all dependencies are done.
```

If incomplete dependency names are returned, they may be shown.

No optimistic status change is required.

---

## 21. Version Behavior

Dependency creation/removal does not need to increment the Task `version` in this milestone.

The Task version represents Task-row mutations used by the existing PATCH concurrency contract.

Status changes through PATCH continue to increment the Task version.

Do not silently redefine version semantics.

If later realtime requirements need dependency revision/versioning, that can be handled through dependency events rather than changing this contract.

---

## 22. Domain Rule Edge Cases

### Case A — No dependencies

```text
Task status → DONE
```

Allowed.

### Case B — All direct dependencies DONE

Allowed.

### Case C — One direct dependency incomplete

Rejected with `422`.

### Case D — Dependency added to an already-DONE Task

Allow the dependency edge to be created only if the prerequisite Task is already `DONE`.

This preserves the completion invariant at the time the dependency is added.

If the dependent Task is `DONE` and the proposed prerequisite is not `DONE`, reject:

```http
422 Unprocessable Entity
```

Suggested code:

```json
{
  "code": "INCOMPLETE_DEPENDENCY_FOR_DONE_TASK",
  "message": "A completed task cannot depend on an incomplete task."
}
```

### Case E — Previously DONE prerequisite is reopened later

The locked architecture only requires validation when a Task transitions to `DONE`.

Do not add a cascading status update or automatically reopen dependent Tasks.

Document this as a tradeoff for the take-home if necessary.

No hidden state mutation should occur.

---

## 23. Error Semantics

Use:

```json
{
  "code": "SOME_ERROR_CODE",
  "message": "Human-readable explanation."
}
```

Do not expose:

- Prisma errors,
- SQL details,
- stack traces,
- internal graph structures.

Expected statuses:

| Situation | Status |
|---|---:|
| invalid request | 400 |
| invalid UUID | 400 |
| self dependency | 400 |
| missing Task | 404 |
| missing dependency edge | 404 |
| duplicate dependency | 409 |
| cross-Project dependency | 422 |
| dependency cycle | 422 |
| incomplete dependency status rule | 422 |
| stale Task version | 409 |
| unexpected failure | 500 |

---

## 24. No Realtime Yet

Do not implement:

```text
dependency.created
dependency.deleted
task.updated broadcasts
SSE
EventSource
event broadcaster
```

After mutations, the same client may refresh/refetch.

Realtime dependency/task propagation belongs to later Collaboration milestones.

---

## 25. Recommended Repository Shape

Approximate additions:

```text
src/
├── app/
│   └── api/
│       └── tasks/
│           └── [taskId]/
│               ├── route.ts
│               └── dependencies/
│                   ├── route.ts
│                   └── [dependsOnTaskId]/
│                       └── route.ts
│
├── components/
│   └── tasks/
│       └── task-dependencies.tsx
│
└── server/
    ├── tasks/
    │   └── task.service.ts
    │
    └── dependencies/
        ├── dependency.service.ts
        └── dependency.validation.ts
```

Exact filenames may vary.

Do not add Collaboration/Comments modules yet.

---

## 26. API Verification Procedure

### A — Infrastructure

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
```

### B — Start app

```bash
npm run dev
```

### C — Identify Tasks

Use the existing Project/Task endpoints to obtain:

```text
Task A
Task B
Task C
```

in the same Project.

Prefer known statuses:

```text
A = DONE
B = IN_PROGRESS
C = TODO
```

### D — Add valid dependency

Make B depend on A:

```bash
curl -i \
  -X POST \
  http://localhost:3000/api/tasks/<B-id>/dependencies \
  -H 'Content-Type: application/json' \
  -d '{
    "dependsOnTaskId": "<A-id>"
  }'
```

Expected:

```text
HTTP 201
```

### E — Duplicate dependency

Repeat the same request.

Expected:

```text
HTTP 409
DEPENDENCY_EXISTS
```

### F — Self dependency

```bash
curl -i \
  -X POST \
  http://localhost:3000/api/tasks/<B-id>/dependencies \
  -H 'Content-Type: application/json' \
  -d '{
    "dependsOnTaskId": "<B-id>"
  }'
```

Expected:

```text
HTTP 400
SELF_DEPENDENCY
```

### G — Cycle detection

Create:

```text
B depends on A
C depends on B
```

Then attempt:

```text
A depends on C
```

Expected:

```text
HTTP 422
DEPENDENCY_CYCLE
```

### H — Same-Project validation

Attempt to add a Task from another Project.

Expected:

```text
HTTP 422
CROSS_PROJECT_DEPENDENCY
```

### I — Incomplete dependency completion

Ensure:

```text
C depends on B
B = IN_PROGRESS
```

Attempt to PATCH C to DONE with its current version.

Expected:

```text
HTTP 422
INCOMPLETE_DEPENDENCIES
```

Verify:

- C remains not DONE,
- C version remains unchanged.

### J — Complete prerequisite

PATCH B to DONE using its current version.

If B's own dependencies are complete, expect:

```text
HTTP 200
```

Then PATCH C to DONE.

Expected:

```text
HTTP 200
```

### K — Remove dependency

```bash
curl -i \
  -X DELETE \
  http://localhost:3000/api/tasks/<C-id>/dependencies/<B-id>
```

Expected:

```text
HTTP 204
```

Repeat deletion.

Expected:

```text
HTTP 404
DEPENDENCY_NOT_FOUND
```

---

## 27. UI Verification

Open the application.

Verify:

1. open a Project,
2. open/edit a Task,
3. add another Task from the same Project as a dependency,
4. dependency appears after persistence,
5. remove dependency,
6. removed dependency disappears,
7. self Task is not presented as a valid candidate,
8. an incomplete dependency blocks transition to `DONE`,
9. the UI displays the domain error,
10. after prerequisite becomes DONE, dependent Task can become DONE,
11. browser refresh preserves dependency state.

No second-browser synchronization is expected yet.

---

## 28. Quality Verification

Run:

```bash
npm run verify:domain
npm run build
npm run lint
```

All must pass.

Task Management and Project Management must continue to work.

---

## 29. Acceptance Criteria

### Dependency API

- [ ] `POST /api/tasks/:taskId/dependencies` exists.
- [ ] valid dependency returns `201`.
- [ ] invalid UUID returns `400`.
- [ ] missing dependent Task returns `404`.
- [ ] missing prerequisite Task returns `404`.
- [ ] self dependency returns `400`.
- [ ] duplicate dependency returns `409`.
- [ ] cross-Project dependency returns `422`.
- [ ] direct cycle is rejected.
- [ ] indirect cycle is rejected.
- [ ] `DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId` exists.
- [ ] valid removal returns `204`.
- [ ] missing edge returns stable `404`.

### Status Rules

- [ ] Task with no dependencies can become DONE.
- [ ] Task with all dependencies DONE can become DONE.
- [ ] Task with any incomplete dependency cannot become DONE.
- [ ] rejected completion does not mutate Task status.
- [ ] rejected completion does not increment Task version.
- [ ] stale version still returns `409`.
- [ ] successful status update still increments version.
- [ ] adding an incomplete prerequisite to an already-DONE Task is rejected.

### Persistence

- [ ] dependency survives browser refresh.
- [ ] dependency rows are relational.
- [ ] removing an edge persists.
- [ ] no duplicate dependency rows are created.

### Architecture

- [ ] Route Handlers remain thin.
- [ ] dependency logic lives in a service/domain module.
- [ ] Task status validation integrates with existing Task service.
- [ ] graph validation does not live in React components.
- [ ] Project boundaries remain intact.
- [ ] no graph database added.
- [ ] no unnecessary repository layer added.
- [ ] no realtime infrastructure added.

### UI

- [ ] dependencies are visible.
- [ ] dependency can be added.
- [ ] dependency can be removed.
- [ ] current Task is not a dependency candidate.
- [ ] domain validation errors are visible.
- [ ] incomplete dependencies prevent false DONE UI state.
- [ ] refresh preserves authoritative state.

### Scope

- [ ] no Comments implemented.
- [ ] no SSE/EventSource implemented.
- [ ] no event broadcaster implemented.
- [ ] no authentication implemented.
- [ ] no bonus features implemented.

### Quality

- [ ] domain verification passes.
- [ ] Project Management still works.
- [ ] Task Management still works.
- [ ] production build passes.
- [ ] lint/static checks pass.
- [ ] application remains runnable.

---

## 30. Definition of Done

Dependencies & Status Rules is complete when this scenario works:

```text
Task A = IN_PROGRESS

Task B = IN_PROGRESS
B depends on A

B → DONE
     ↓
422 rejected

A → DONE
     ↓
200

B → DONE
     ↓
200
```

and invalid dependency graphs are prevented:

```text
self dependency       ❌
cross-Project edge    ❌
duplicate edge        ❌
cycle                 ❌
```

No realtime behavior is required yet.

---

## 31. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "feat: add task dependencies and status rules"
```

Do not combine realtime infrastructure into this commit.

---

## 32. Handoff: Realtime Foundation

After this milestone, the core persistent product behavior is available:

```text
Projects
Tasks
Assignments
Dependencies
Status rules
```

The next milestone should introduce the collaboration transport only:

```text
GET /api/projects/:projectId/events

SSE connection
domain event envelope
in-memory project broadcaster
subscription lifecycle
reconnect/refetch behavior
```

It should not yet add all Task and Comment event publishing at once.

---

## 33. Agent Implementation Prompt

Use this specification with:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
docs/specs/04-task-management.md
docs/specs/05-dependencies-status-rules.md
```

Prompt:

> Implement the **Dependencies & Status Rules** milestone defined in `docs/specs/05-dependencies-status-rules.md`.
>
> Architecture, Application Bootstrap, Domain & Data Model, Project Management, and Task Management are already complete. Preserve them.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract.
>
> Implement only:
> - dependency service and runtime validation,
> - `POST /api/tasks/:taskId/dependencies`,
> - `DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId`,
> - server-side dependency read support needed by the UI,
> - dependency add/remove UI,
> - self-dependency validation,
> - same-Project validation,
> - duplicate-edge handling,
> - direct and indirect cycle detection,
> - Task `DONE` validation against direct dependency statuses,
> - rejection of adding an incomplete dependency to an already-DONE Task,
> - transactional validation/write behavior,
> - required verification from this specification.
>
> Preserve the existing Task expected-version contract:
> - stale Task PATCH returns `409`,
> - successful Task mutation increments version,
> - rejected dependency/status validation must not mutate status or increment version.
>
> Do not implement Comments, SSE, EventSource, realtime events, event broadcasting, authentication, notifications, presence, or bonus features.
>
> Keep Route Handlers thin.
> Keep dependency graph logic in the server/domain layer.
> Do not add a graph database or unnecessary repository abstraction.
>
> Run every acceptance check in `05-dependencies-status-rules.md`.
>
> At completion report:
> 1. files created or modified,
> 2. endpoints implemented,
> 3. commands executed,
> 4. dependency API verification results,
> 5. self/cross-project/duplicate/cycle verification,
> 6. DONE-transition verification,
> 7. Task-version verification,
> 8. UI verification results,
> 9. build/lint/domain verification results,
> 10. any deviation from the specification,
> 11. any issue before Realtime Foundation begins.
>
> Do not silently redesign the architecture.
> Do not begin Realtime Foundation.
