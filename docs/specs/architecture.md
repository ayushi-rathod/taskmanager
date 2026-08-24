# 00 — Architecture Contract

## 1. Purpose

This document is the source of truth for the take-home implementation.

All later implementation specs and coding agents must follow the decisions in this file unless a genuine blocker is discovered.

The goal is to build the **core requirements only** for a collaborative task management system with:

- Projects
- Tasks
- Task dependencies
- Status transitions
- Comments
- Near real-time multi-client synchronization
- Efficient incremental updates
- Cross-client consistency

The application is intentionally scoped for a two-day implementation.

---

## 2. Core Product Goal

Build a small collaborative task management system similar to a simplified Linear/Jira experience.

The important system behavior is:

1. Multiple clients may open the same project.
2. A client may create, update, or delete tasks.
3. A client may add or remove dependencies.
4. A client may add comments to a task.
5. Changes committed by one client must become visible to other connected clients in near real-time.
6. Realtime updates must be incremental; the server must not resend an entire large project for every small change.
7. The database is the source of truth.
8. Concurrent stale writes must not silently overwrite newer data.

---

## 3. Scope

### 3.1 In Scope

#### Projects
- Create a project
- List projects
- Open a project
- Store:
  - name
  - description
  - metadata

#### Tasks
- Create a task
- List project tasks
- Read a task
- Update a task
- Delete a task
- Store:
  - title
  - status
  - assignees
  - priority
  - description
  - tags
  - custom fields
  - version
  - dependencies

#### Task Dependencies
- Add a dependency
- Remove a dependency
- Prevent invalid dependency relationships where practical
- Enforce the agreed completion rule

#### Status Transitions
Supported statuses:

- `TODO`
- `IN_PROGRESS`
- `DONE`

All transitions are allowed except:

> A task cannot transition to `DONE` while any task it depends on is not `DONE`.

#### Comments
- List comments for a task
- Add a comment
- Associate comments with a simulated user
- Show newly created comments to connected clients in near real-time

#### Realtime Collaboration
Realtime events must support:

- task created
- task updated
- task deleted
- comment created
- dependency created
- dependency deleted

#### Consistency
- Server-authoritative state
- Task-level version number
- Stale writes rejected with `409 Conflict`
- Client refetches latest task state after a version conflict

#### Multi-client Demo
The finished demo must support opening the same project in two browser windows and showing that changes in one window propagate to the other without manual refresh.

---

## 4. Explicit Non-Goals

The following are intentionally out of scope for the core submission:

- Authentication
- Authorization
- OAuth
- CRDT
- Operational Transform
- Undo/Redo
- Presence indicators
- Live cursors
- Collaborative character-by-character text editing
- Optimistic UI
- Redis implementation
- Kafka implementation
- NATS implementation
- Persistent event log
- Event replay
- Virtual scrolling
- 10,000-task performance implementation
- Load testing
- AI features
- Kanban/Gantt extensions unless needed for the minimal UI
- CI/CD
- Production deployment architecture
- Offline support
- PWA features
- External integrations

These may be mentioned in the README as future extensions, but they must not delay the core implementation.

---

## 5. Locked Technology Stack

| Area | Decision |
|---|---|
| Language | TypeScript |
| Frontend | Next.js App Router + React |
| Backend | Next.js Route Handlers / server-side modules |
| Database | PostgreSQL |
| Database access | Prisma ORM |
| Client → Server writes | REST-style HTTP APIs |
| Server → Client realtime | Server-Sent Events (SSE) |
| Realtime payload model | Small entity-level domain events |
| Consistency | Server authoritative + task versioning |
| Dependency storage | Relational join table |
| Frontend state | Simple React/local cache strategy |
| Local database setup | Dockerized PostgreSQL |
| Authentication | None; simulated users |
| Current realtime fanout | In-memory broadcaster |
| Production-scale fanout | Shared pub/sub such as Redis, NATS, or Kafka |

---

## 6. Architectural Principles

### 6.1 PostgreSQL Is the Source of Truth

Clients may cache data for UI purposes, but persistent truth lives in PostgreSQL.

A realtime event never becomes authoritative merely because it was received.

### 6.2 Commit Before Broadcast

Never broadcast an event before the corresponding database transaction succeeds.

Required order:

```text
validate request
    ↓
validate domain rules
    ↓
write database transaction
    ↓
commit succeeds
    ↓
create domain event
    ↓
broadcast event
```

### 6.3 Incremental Realtime Updates

A small task change must produce a small realtime message.

Do not resend:

- the whole project
- all project tasks
- all task comments

for a single entity update.

### 6.4 Separate Domain Events From Transport

Business logic should produce domain events such as:

```text
task.updated
comment.created
```

SSE is only the current delivery transport.

The domain layer must not depend directly on SSE-specific APIs.

This keeps a future migration to WebSockets or another transport possible without rewriting core business logic.

---

## 7. High-Level System Architecture

```text
┌──────────────────────────────────────────────┐
│                Next.js App                   │
│                                              │
│  React Client                                │
│      │                                       │
│      │ REST / HTTP                           │
│      ▼                                       │
│  Route Handlers                              │
│      │                                       │
│      ▼                                       │
│  Server / Domain Services                    │
│      │                 │                     │
│      │                 └── Domain Events     │
│      │                          │             │
│      ▼                          ▼             │
│   Prisma                 Event Broadcaster   │
│      │                          │             │
└──────┼──────────────────────────┼─────────────┘
       │                          │
       ▼                          │ SSE
  PostgreSQL                      ▼
                         Connected Browsers
```

---

## 8. Domain Model

### 8.1 Project

```text
Project
- id
- name
- description
- metadata
- createdAt
- updatedAt
```

Notes:

- `metadata` is JSON.
- Project responses should not automatically embed every task and comment.

---

### 8.2 User

Authentication is not part of the assignment, but tasks and comments need user references.

Use a simple seeded user model:

```text
User
- id
- name
```

Seed at least:

- Ayushi
- Carlos
- Joaquin

The UI may expose a simple "Viewing as" selector for demo purposes.

---

### 8.3 Task

```text
Task
- id
- projectId
- title
- status
- priority
- description
- tags
- customFields
- version
- createdAt
- updatedAt
```

Notes:

- `projectId` is a foreign key.
- `status` is an enum.
- `priority` may be an enum such as:
  - `LOW`
  - `MEDIUM`
  - `HIGH`
- `tags` may use PostgreSQL string-array support.
- `customFields` is JSON.
- `version` starts at `1` and increments on every successful task mutation.

---

### 8.4 TaskAssignee

Because a task may have multiple assignees:

```text
TaskAssignee
- taskId
- userId
```

Recommended uniqueness:

```text
UNIQUE(taskId, userId)
```

---

### 8.5 Comment

```text
Comment
- id
- taskId
- content
- authorId
- createdAt
```

Relations:

```text
Task    1 ─── * Comment
User    1 ─── * Comment
```

---

### 8.6 TaskDependency

```text
TaskDependency
- taskId
- dependsOnTaskId
```

Meaning:

```text
taskId depends on dependsOnTaskId
```

Example:

```text
Task B depends on Task A
```

Stored as:

```text
taskId = B
dependsOnTaskId = A
```

Recommended uniqueness:

```text
UNIQUE(taskId, dependsOnTaskId)
```

A task must not depend on itself.

If time permits, direct or indirect dependency cycles should be rejected. If cycle detection is not implemented, this limitation must be documented clearly.

---

## 9. Domain Rules

### 9.1 Task Status

Allowed values:

```text
TODO
IN_PROGRESS
DONE
```

Transitions are generally flexible.

Examples:

```text
TODO → IN_PROGRESS
IN_PROGRESS → DONE
DONE → TODO
TODO → DONE
```

### 9.2 Dependency Completion Rule

Before setting a task to `DONE`:

1. Load all direct dependencies.
2. Verify every dependency has status `DONE`.
3. If any dependency is incomplete, reject the mutation.

Recommended response:

```http
422 Unprocessable Entity
```

Example body:

```json
{
  "code": "INCOMPLETE_DEPENDENCIES",
  "message": "Task cannot be completed while dependencies are incomplete."
}
```

### 9.3 Self Dependency

Reject:

```text
Task A depends on Task A
```

Recommended response:

```http
400 Bad Request
```

---

## 10. REST API Contract

Exact request/response field details may be refined in implementation specs, but endpoint responsibilities are fixed here.

### 10.1 Projects

#### List Projects

```http
GET /api/projects
```

#### Create Project

```http
POST /api/projects
```

#### Read Project

```http
GET /api/projects/:projectId
```

A project response should contain project-level data only or a deliberately small summary.

Do not automatically return every comment or giant nested project payload.

---

### 10.2 Tasks

#### List Project Tasks

```http
GET /api/projects/:projectId/tasks
```

#### Create Task

```http
POST /api/projects/:projectId/tasks
```

#### Read Task

```http
GET /api/tasks/:taskId
```

#### Update Task

```http
PATCH /api/tasks/:taskId
```

Task updates must include the client's expected version.

Example:

```json
{
  "version": 5,
  "status": "IN_PROGRESS"
}
```

#### Delete Task

```http
DELETE /api/tasks/:taskId
```

Deletion behavior for dependencies must be handled transactionally.

---

### 10.3 Dependencies

#### Add Dependency

```http
POST /api/tasks/:taskId/dependencies
```

Body:

```json
{
  "dependsOnTaskId": "task-id"
}
```

#### Remove Dependency

```http
DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId
```

---

### 10.4 Comments

#### List Comments

```http
GET /api/tasks/:taskId/comments
```

#### Create Comment

```http
POST /api/tasks/:taskId/comments
```

Example body:

```json
{
  "authorId": "user-id",
  "content": "The API contract is ready."
}
```

---

### 10.5 Realtime Events

One SSE connection per open project:

```http
GET /api/projects/:projectId/events
```

Do not create:

- one connection per task
- one connection per comment thread
- one connection per event type

The project stream carries all realtime events relevant to that project.

---

## 11. Realtime Event Contract

### 11.1 Common Event Envelope

All realtime events should follow the same conceptual envelope:

```json
{
  "id": "event-id",
  "type": "task.updated",
  "projectId": "project-id",
  "entityId": "entity-id",
  "timestamp": "ISO-8601 timestamp",
  "data": {}
}
```

Fields:

- `id`: unique event identifier for debugging and future replay support
- `type`: domain event type
- `projectId`: project whose clients should receive the event
- `entityId`: main affected entity
- `timestamp`: server-generated event time
- `data`: small event-specific payload

---

### 11.2 Supported Event Types

```text
task.created
task.updated
task.deleted

comment.created

dependency.created
dependency.deleted
```

---

### 11.3 Example — Task Updated

```json
{
  "id": "event-123",
  "type": "task.updated",
  "projectId": "project-1",
  "entityId": "task-42",
  "timestamp": "2026-08-23T20:00:00Z",
  "data": {
    "version": 6,
    "changes": {
      "status": "IN_PROGRESS"
    }
  }
}
```

The event should contain only enough data for connected clients to apply or reconcile the change.

---

### 11.4 Example — Comment Created

```json
{
  "id": "event-124",
  "type": "comment.created",
  "projectId": "project-1",
  "entityId": "comment-88",
  "timestamp": "2026-08-23T20:01:00Z",
  "data": {
    "taskId": "task-42",
    "comment": {
      "id": "comment-88",
      "content": "I will review this.",
      "authorId": "user-2",
      "createdAt": "2026-08-23T20:01:00Z"
    }
  }
}
```

---

## 12. Consistency Model

### 12.1 Server-Authoritative State

The server validates and commits every mutation.

Clients do not resolve concurrent writes independently.

### 12.2 Task-Level Optimistic Concurrency Control

Every task contains:

```text
version: Integer
```

Example initial state:

```json
{
  "id": "task-42",
  "status": "TODO",
  "priority": "MEDIUM",
  "version": 5
}
```

Two clients both read version `5`.

Client A sends:

```json
{
  "version": 5,
  "status": "IN_PROGRESS"
}
```

The server updates only if the current database version is still `5`.

Successful state:

```json
{
  "status": "IN_PROGRESS",
  "version": 6
}
```

Client B later sends:

```json
{
  "version": 5,
  "priority": "HIGH"
}
```

The database now contains version `6`, so the mutation is rejected.

Response:

```http
409 Conflict
```

Example body:

```json
{
  "code": "VERSION_CONFLICT",
  "message": "Task was modified by another client."
}
```

### 12.3 Conflict Recovery

On `409 Conflict`:

1. Client refetches the latest task state.
2. UI displays the current server state.
3. The rejected stale mutation is not silently reapplied.

For this project, correctness is preferred over automatic field merging.

---

## 13. Mutation + Broadcast Flow

Required task update flow:

```text
User edits task
      ↓
PATCH /api/tasks/:taskId
      ↓
Validate request
      ↓
Check expected version
      ↓
Validate domain rules
      ↓
Database transaction
      ↓
Commit succeeds
      ↓
Increment task version
      ↓
Create domain event
      ↓
In-memory broadcaster
      ↓
Project SSE stream
      ↓
Connected clients
      ↓
Update/reconcile UI
```

The same principle applies to create/delete/comment/dependency operations.

---

## 14. Realtime Reconnection Strategy

SSE connections may disconnect because of:

- browser sleep
- network interruption
- local server restart
- proxy timeout

For the take-home:

```text
SSE disconnects
      ↓
browser reconnects
      ↓
client refetches authoritative project/task data
      ↓
UI reconciles with PostgreSQL state
```

No persistent replay log is required.

A production evolution may add:

- durable event IDs
- `Last-Event-ID`
- persistent event storage
- event replay

These are not part of the core implementation.

---

## 15. Current Event Broadcaster

For the local take-home implementation:

```text
Next.js server instance
       ↓
in-memory project subscriber registry
       ↓
SSE connections
```

Conceptually:

```text
projectId
   └── connected SSE subscribers
```

When an event for `project-1` is committed, only subscribers to `project-1` receive it.

The event broadcaster should live behind a small abstraction so business services do not depend on its implementation.

Example conceptual interface:

```ts
publish(event)
subscribe(projectId)
unsubscribe(projectId)
```

Exact implementation is deferred to the realtime implementation spec.

---

## 16. Horizontal Scale Strategy

The implementation is single-instance, but the architecture must have a clear production evolution.

At horizontal scale:

```text
                      Load Balancer
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Server A     Server B     Server C
              │            │            │
              └────────────┼────────────┘
                           │
                    Shared Pub/Sub
                  Redis / NATS / Kafka
                           │
                      PostgreSQL
```

Flow:

1. Server A commits a task mutation.
2. Server A publishes a domain event to shared pub/sub.
3. Servers B and C receive the event.
4. Each instance forwards it to locally connected SSE clients for the relevant project.

SSE remains viable in this architecture.

If future requirements introduce high-frequency bidirectional features such as live cursors or collaborative text editing, WebSockets should be reevaluated.

---

## 17. Large Project Strategy

The source challenge explicitly warns that project payloads may eventually exceed 2 MB.

Therefore:

### Do

```text
GET /api/projects/:projectId
GET /api/projects/:projectId/tasks
GET /api/tasks/:taskId/comments
```

and send incremental realtime events.

### Do Not

Return an indefinitely growing nested object such as:

```text
Project
  ├── every task
  │     ├── every dependency
  │     └── every comment
  └── all other project data
```

for every read or realtime mutation.

The core implementation does not need advanced pagination, but API boundaries must make future pagination possible without redesigning the domain.

---

## 18. Database Transactions

Use transactions for mutations that affect multiple related records or require atomic validation/write behavior.

Examples:

- task deletion with dependency cleanup
- status completion validation + task update
- dependency creation where validation is required

The system must not leave partially updated relational state.

---

## 19. Validation and Error Semantics

Use predictable HTTP semantics.

Recommended mapping:

| Situation | Status |
|---|---:|
| Invalid request | 400 |
| Entity not found | 404 |
| Version conflict | 409 |
| Domain rule violation | 422 |
| Unexpected server failure | 500 |

Error bodies should follow a consistent format:

```json
{
  "code": "SOME_ERROR_CODE",
  "message": "Human-readable explanation."
}
```

---

## 20. Frontend State Strategy

Do not introduce Redux or another global state library by default.

Use the simplest approach that supports:

- project list
- current project
- current task list
- selected task/comments
- SSE event application
- targeted refetch after conflicts/reconnects

Realtime handlers should update only affected entities where practical.

If applying an event safely becomes ambiguous, prefer a targeted refetch rather than implementing complex client-side reconciliation.

---

## 21. Suggested Repository Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── projects/
│   │   └── tasks/
│   │
│   ├── projects/
│   │   └── [projectId]/
│   │
│   └── page.tsx
│
├── components/
│   ├── projects/
│   ├── tasks/
│   └── comments/
│
├── lib/
│   ├── db.ts
│   ├── events/
│   │   ├── broadcaster.ts
│   │   └── types.ts
│   └── validation/
│
├── server/
│   ├── projects/
│   ├── tasks/
│   └── comments/
│
└── types/

prisma/
├── schema.prisma
└── seed.ts

docs/
└── specs/
    └── 00-architecture.md
```

The exact folder layout may evolve slightly for Next.js routing conventions, but responsibilities must remain separated.

Preferred dependency direction:

```text
Route Handler
      ↓
Server / Domain Service
      ↓
Prisma
```

Business rules should not be scattered across React components or embedded entirely inside route handlers.

---

## 22. Agent Implementation Rules

Every implementation agent must receive this file together with the specific milestone spec.

Agents must follow these rules:

1. Do not change architectural decisions in `00-architecture.md`.
2. Implement only the current spec.
3. Do not add bonus features.
4. Do not refactor unrelated code.
5. Do not introduce new infrastructure unless the spec requires it.
6. Do not add Redis, WebSockets, authentication, CRDT, or state-management libraries without an explicit architecture update.
7. Preserve existing API and event contracts.
8. If the requested implementation conflicts with this architecture, report the conflict instead of silently redesigning the system.
9. Prefer simple, readable code over speculative abstractions.
10. Keep the application runnable after every milestone.

---

## 23. Build Order

Implementation should proceed in small verified milestones.

### Chunk 1
Architecture contract — this document.

### Chunk 2
Project bootstrap:
- Next.js
- TypeScript
- Dockerized PostgreSQL
- Prisma
- environment setup
- app shell

### Chunk 3
Database/domain model:
- Prisma schema
- migrations
- seed users/data
- basic database verification

### Chunk 4
Projects vertical slice:
- project APIs
- project list
- create project
- open project

### Chunk 5
Tasks vertical slice:
- task APIs
- create
- list
- edit
- delete
- basic UI

### Chunk 6
Dependencies + status rules:
- add/remove dependencies
- dependency validation
- completion rule

### Chunk 7
Realtime infrastructure:
- project SSE stream
- event types
- in-memory broadcaster
- reconnect handling

### Chunk 8
Realtime tasks:
- task create/update/delete events
- second-browser synchronization

### Chunk 9
Realtime comments:
- comment list/create
- comment realtime events

### Chunk 10
Consistency:
- version-aware task updates
- `409 Conflict`
- targeted refetch/recovery

### Chunk 11
End-to-end cleanup:
- loading/error states
- two-browser verification
- bug fixing
- remove dead code

### Chunk 12
Submission package:
- README
- architecture explanation
- synchronization explanation
- scaling discussion
- tradeoffs
- setup instructions
- video demo path

---

## 24. Core Demo Scenario

The final system must be able to demonstrate this flow:

### Setup

Open the same project in two browser windows:

```text
Browser A: viewing as Ayushi
Browser B: viewing as Carlos
```

### Demo

1. Ayushi creates a task.
2. Carlos sees the task appear without refresh.
3. Ayushi changes its status.
4. Carlos sees the new status without refresh.
5. Carlos adds a comment.
6. Ayushi sees the comment without refresh.
7. A dependency is added.
8. Attempting to complete a task with an incomplete dependency is rejected.
9. Two clients attempt stale concurrent updates.
10. The stale update receives `409 Conflict` and refreshes from server state.

If this sequence works reliably, the core technical requirements are demonstrated.

---

## 25. Architecture Tradeoffs to Explain in README / Video

### Next.js Full Stack vs Separate Go Backend

Chosen:

```text
Next.js App Router full stack
```

Reason:

- one repository
- one language
- less infrastructure
- faster two-day implementation

A separate Go service could offer stronger backend isolation and excellent concurrency characteristics, but it would add setup and integration overhead that does not materially improve this take-home's core demonstration.

### Prisma vs Raw SQL

Chosen:

```text
Prisma
```

Reason:

- fast schema iteration
- migrations
- type-safe application access
- reduced CRUD boilerplate
- PostgreSQL remains the underlying database
- raw SQL remains available if specialized queries are needed

### SSE vs WebSockets

Chosen:

```text
REST mutations + SSE notifications
```

Reason:

The core collaboration pattern is asymmetric:

```text
Client command  → Server via HTTP
Server event    → Clients via SSE
```

This keeps command validation, error handling, and conflict responses in conventional HTTP while still supporting near real-time updates.

WebSockets should be reconsidered if future functionality becomes highly bidirectional and high frequency.

### In-Memory Broadcaster vs Shared Pub/Sub

Chosen for take-home:

```text
in-memory broadcaster
```

Reason:

- minimal infrastructure
- sufficient for one application instance
- demonstrates event boundaries

Production evolution:

```text
shared pub/sub
```

such as Redis, NATS, or Kafka for cross-instance fanout.

### Version Rejection vs Automatic Merge

Chosen:

```text
task-level version conflict rejection
```

Reason:

- simple
- deterministic
- easy to demonstrate
- prevents lost updates
- avoids implementing partial merge semantics or CRDTs

Tradeoff:

Two clients editing different fields may still conflict if one uses a stale task version.

For the core challenge, correctness and clarity are preferred over automatic concurrent field merging.

---

## 26. Definition of Done for Architecture

This architecture phase is complete when all of the following are fixed:

- [x] Core scope
- [x] Explicit non-goals
- [x] Technology stack
- [x] Domain entities
- [x] Relationships
- [x] Status model
- [x] Dependency completion rule
- [x] REST responsibilities
- [x] SSE endpoint strategy
- [x] Realtime event envelope
- [x] Event types
- [x] Version conflict behavior
- [x] Reconnect behavior
- [x] Current event broadcaster
- [x] Production scaling direction
- [x] Large-project update strategy
- [x] Suggested repository structure
- [x] Agent implementation rules
- [x] Build order
- [x] Core demo scenario

Architecture is now considered **locked**.

Any change to these decisions should be explicit and documented rather than introduced silently during implementation.
