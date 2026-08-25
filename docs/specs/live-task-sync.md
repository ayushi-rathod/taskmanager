# 07 — Live Task Sync

## 1. Purpose

This specification connects the completed Task Management flows to the completed Realtime Foundation.

Previous milestones already provide:

- Project Management
- Task CRUD
- Task assignments
- Task versioning
- Dependencies and status rules
- project-scoped SSE
- a DomainEvent envelope
- an in-memory Project broadcaster
- EventSource connection/reconnect behavior

This milestone adds live propagation for Task mutations only.

Successful Task mutations must publish:

```text
task.created
task.updated
task.deleted
```

Connected clients viewing the same Project must update in near real-time without receiving the entire Project payload.

This milestone does not implement Comments or live Comment sync.

---

## 2. Objective

At completion, this scenario must work:

```text
Browser A                           Browser B
Project X                           Project X

Task 1: TODO                        Task 1: TODO

A updates Task 1 → IN_PROGRESS
        ↓
PATCH /api/tasks/:taskId
        ↓
PostgreSQL commit
        ↓
task.updated event
        ↓
SSE Project X stream
                                      ↓
                                  Task 1: IN_PROGRESS
```

without Browser B manually refreshing.

The same must work for:

```text
task creation
task update
task deletion
```

---

## 3. Prerequisites

Do not begin until Realtime Foundation is verified.

Before implementation, confirm:

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
npm run build
npm run lint
```

Also manually verify:

- one SSE connection opens per Project page,
- `system.test` events are received,
- Project isolation works,
- multiple subscribers work,
- disconnect/reconnect cleanup works,
- Task CRUD still works,
- dependency/status rules still work.

Do not continue if the SSE foundation itself is unstable.

---

## 4. Scope

### 4.1 In Scope

Implement:

- `task.created` event publishing,
- `task.updated` event publishing,
- `task.deleted` event publishing,
- publish only after successful persistence,
- small incremental event payloads,
- Project-scoped event fanout,
- browser handling of Task events,
- second-browser synchronization,
- stale/local-state reconciliation,
- duplicate/self-origin event safety,
- verification for multi-client behavior.

### 4.2 Out of Scope

Do not implement:

- Comments,
- comment realtime events,
- presence,
- live cursors,
- notifications,
- activity feed,
- WebSockets,
- Redis,
- NATS,
- Kafka,
- durable event replay,
- persistent event log,
- CRDT,
- Operational Transform,
- optimistic UI,
- authentication,
- bonus features.

Dependency event publishing is not required in this milestone unless already needed for Task state correctness. Keep the scope centered on Task create/update/delete.

---

## 5. Core Rule: Commit Before Broadcast

Never publish an event before the database mutation succeeds.

Required order:

```text
validate request
      ↓
validate domain rules
      ↓
perform database mutation
      ↓
commit succeeds
      ↓
create DomainEvent
      ↓
publish to Project broadcaster
      ↓
SSE subscribers receive event
```

Forbidden:

```text
publish event
      ↓
database write
```

because clients could observe a state change that never committed.

---

## 6. Event Types

Use the existing DomainEvent envelope from Realtime Foundation.

Required event types:

```text
task.created
task.updated
task.deleted
```

Do not create a new incompatible event format.

---

## 7. task.created Event

After successful Task creation, publish:

```json
{
  "id": "event-uuid",
  "type": "task.created",
  "projectId": "project-uuid",
  "entityId": "task-uuid",
  "timestamp": "2026-08-24T20:00:00.000Z",
  "data": {
    "task": {
      "id": "task-uuid",
      "projectId": "project-uuid",
      "title": "Build backend",
      "status": "TODO",
      "priority": "HIGH",
      "description": "Implement API",
      "tags": ["backend"],
      "customFields": {},
      "version": 1,
      "assignees": [
        {
          "id": "user-uuid",
          "name": "Carlos"
        }
      ],
      "createdAt": "2026-08-24T20:00:00.000Z",
      "updatedAt": "2026-08-24T20:00:00.000Z"
    }
  }
}
```

### Decision

For `task.created`, include the newly created lightweight Task representation.

Reason:

- the receiving client can insert it immediately,
- no full Project payload is needed,
- no extra fetch is required for the common case.

Do not include:

- Project object,
- Comments,
- dependency graph.

---

## 8. task.updated Event

After successful Task PATCH, publish a small event.

Preferred shape:

```json
{
  "id": "event-uuid",
  "type": "task.updated",
  "projectId": "project-uuid",
  "entityId": "task-uuid",
  "timestamp": "2026-08-24T20:05:00.000Z",
  "data": {
    "version": 4,
    "changes": {
      "status": "IN_PROGRESS",
      "priority": "HIGH"
    }
  }
}
```

### Payload Strategy

Prefer incremental fields rather than the full Task whenever practical.

The event should include:

```text
version
changes
```

The `changes` object should contain only fields changed by that mutation.

If assignees changed, it is acceptable for `changes.assignees` to contain the resulting lightweight assignee list.

Example:

```json
{
  "version": 5,
  "changes": {
    "assignees": [
      {
        "id": "user-uuid",
        "name": "Ayushi"
      }
    ]
  }
}
```

Do not send the entire Project.

---

## 9. task.deleted Event

After successful Task deletion, publish:

```json
{
  "id": "event-uuid",
  "type": "task.deleted",
  "projectId": "project-uuid",
  "entityId": "task-uuid",
  "timestamp": "2026-08-24T20:10:00.000Z",
  "data": {
    "taskId": "task-uuid"
  }
}
```

The receiving client should remove that Task from local state.

Do not send deleted Task snapshots unless genuinely necessary.

---

## 10. Task Service Integration

The existing Task service should remain the owner of Task persistence.

Realtime publishing should be integrated cleanly without moving persistence back into Route Handlers.

Preferred flow:

```text
Route Handler
      ↓
Task Service
      ↓
Prisma transaction
      ↓
Task result
      ↓
publish event
      ↓
HTTP response
```

Two acceptable designs:

### Option A — Service publishes after successful mutation

```ts
createTask(...)
updateTask(...)
deleteTask(...)
```

publish directly after the committed operation.

### Option B — Service returns mutation result + domain event data

Route/application layer publishes after success.

Use whichever produces the clearest code with the existing architecture.

Do not duplicate business rules.

---

## 11. Broadcast Failure Tradeoff

PostgreSQL remains the source of truth.

If:

```text
database commit succeeds
      ↓
in-memory broadcast unexpectedly fails
```

the committed Task must remain committed.

Do not roll back a successful database write because an in-memory notification failed after commit.

For the take-home:

- log the broadcast failure,
- return the appropriate successful mutation result if persistence succeeded,
- connected clients can recover via reconnect/refetch.

Document this tradeoff.

A production event-outbox design may solve this more robustly, but it is out of scope.

---

## 12. Project Routing

Every Task event must publish using the Task's actual:

```text
projectId
```

Do not trust an arbitrary Project ID supplied by the browser for event routing.

For:

```text
PATCH /api/tasks/:taskId
DELETE /api/tasks/:taskId
```

the server must derive Project scope from persisted Task data.

This prevents cross-Project event leakage.

---

## 13. Client Task State

The Project page already displays Tasks.

Refactor only as much as necessary so the client can apply incoming Task events.

The Task list must have a clear local state owner.

Examples:

- existing client Task list state,
- a small Project Task client component.

Do not introduce Redux or another global state library solely for realtime.

---

## 14. Handling task.created

On incoming:

```text
task.created
```

for the current Project:

1. validate event shape,
2. inspect Task ID,
3. if Task does not already exist, add it,
4. preserve deterministic ordering.

If the Task already exists, do not duplicate it.

This makes event delivery idempotent enough for the take-home.

---

## 15. Handling task.updated

On incoming:

```text
task.updated
```

for Task T:

1. locate T in local state,
2. compare event `version` with local version,
3. apply the event only if it is newer.

Recommended rule:

```text
event.version > local.version
      ↓
apply changes

event.version <= local.version
      ↓
ignore as duplicate/stale
```

### Missing local Task

If the Task is not present locally:

- perform a targeted Task refetch, or
- refresh the Task list.

Do not fabricate a partial Task from an update event.

---

## 16. Handling task.deleted

On incoming:

```text
task.deleted
```

remove the matching Task from local state.

If the Task is already absent:

```text
no-op
```

Do not treat duplicate delete events as an error.

---

## 17. Same-Client Event Echo

The browser that performs a mutation may also receive the resulting SSE event.

Example:

```text
Browser A PATCHes Task
      ↓
HTTP 200 updates Browser A state
      ↓
SSE task.updated returns to Browser A
```

This must not duplicate or corrupt state.

The existing version rule solves this:

```text
HTTP response gives version 6
SSE event gives version 6

event.version <= local.version
      ↓
ignore
```

For create:

- deduplicate by Task ID.

For delete:

- removing an already-removed Task is a no-op.

Do not add client IDs solely to suppress event echo unless clearly needed.

---

## 18. Version Semantics

Preserve the existing Task version contract.

Every successful Task PATCH:

```text
version N
   ↓
version N + 1
```

The corresponding `task.updated` event must contain the committed new version.

Never publish:

```text
expected old version
```

as the event version.

If Task PATCH fails with:

```text
409 VERSION_CONFLICT
```

do not publish a Task event.

If Task PATCH fails with:

```text
422 domain validation
```

do not publish a Task event.

---

## 19. Create Failure Behavior

If Task creation fails because of:

- invalid input,
- missing Project,
- invalid assignee,
- database error,

no `task.created` event may be published.

Only committed mutations generate events.

---

## 20. Delete Failure Behavior

If Task deletion returns:

```text
400
404
500
```

no `task.deleted` event may be published.

Only successful deletion generates an event.

---

## 21. Dependency Interaction

Task status changes already respect dependency rules.

Example:

```text
Task B depends on incomplete Task A

PATCH B → DONE
      ↓
422
```

Because no Task mutation committed:

```text
NO task.updated event
```

When A becomes DONE successfully:

```text
task.updated(A)
```

When B later becomes DONE successfully:

```text
task.updated(B)
```

Do not bypass dependency validation for realtime.

---

## 22. Reconnect Behavior

Keep the Realtime Foundation rule:

```text
disconnect
   ↓
reconnect
   ↓
authoritative refetch
```

This is important because in-memory SSE does not provide durable replay.

If Task events were missed while offline, the reconnect refetch must converge the UI to PostgreSQL state.

Do not implement persistent event replay here.

---

## 23. Event Ordering

For one server process, events are expected to be delivered in publication order.

However, client correctness should rely primarily on:

```text
Task version
```

for Task updates.

Do not build a distributed ordering system.

For create/delete, Task ID provides simple idempotency.

---

## 24. Incremental Payload Requirement

This milestone directly addresses the source challenge's large-Project requirement.

When one Task changes:

```text
DO
task.updated with small changes payload
```

Do not:

```text
send entire Project
send all Tasks
send all Comments
```

Example:

```json
{
  "type": "task.updated",
  "entityId": "task-42",
  "data": {
    "version": 8,
    "changes": {
      "status": "DONE"
    }
  }
}
```

is preferred over a multi-megabyte Project snapshot.

---

## 25. UI Behavior

The visible result should be immediate enough to demonstrate collaboration.

Example:

```text
Browser A:
Task status TODO → IN_PROGRESS

Browser B:
TODO automatically becomes IN_PROGRESS
```

No page refresh.

The same applies to:

- Task creation,
- Task deletion,
- title changes,
- priority changes,
- description changes,
- tag changes,
- assignee changes.

---

## 26. No Optimistic UI Requirement

The current client may continue using:

```text
mutation
   ↓
wait for server success
   ↓
update local state
```

Do not add optimistic mutation/rollback logic just for this milestone.

The core objective is cross-client synchronization.

---

## 27. Development system.test

The `system.test` verification mechanism from Realtime Foundation may remain development-only.

Do not make the production UI depend on it.

Live Task Sync must use actual Task mutation events.

---

## 28. Recommended Repository Changes

Approximate areas changed:

```text
src/
├── lib/
│   └── events/
│       ├── broadcaster.ts
│       ├── create-event.ts
│       └── types.ts
│
├── server/
│   └── tasks/
│       └── task.service.ts
│
├── components/
│   ├── realtime/
│   │   └── project-event-stream.tsx
│   └── tasks/
│       └── task-list.tsx
│
└── hooks/
    └── use-project-events.ts
```

Exact structure may differ.

Do not create duplicate realtime layers.

---

## 29. Verification Procedure

### A — Infrastructure

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
```

### B — Start application

```bash
npm run dev
```

### C — Open two browsers

Open the same Project in:

```text
Browser A
Browser B
```

Using normal + incognito windows is sufficient.

Verify each has one EventSource connection.

### D — Create Task

In Browser A:

```text
Create "Realtime Create Test"
```

Expected:

```text
Browser A shows Task
Browser B shows Task automatically
```

No refresh in Browser B.

Verify browser/network payload is a `task.created` event, not a Project snapshot.

### E — Update status

In Browser A:

```text
TODO → IN_PROGRESS
```

Expected:

```text
Browser B changes to IN_PROGRESS automatically
```

Verify event:

```text
type = task.updated
version = committed new Task version
changes.status = IN_PROGRESS
```

### F — Update other fields

Verify at least:

- title,
- priority,
- description,
- tags,
- assignees.

Browser B should converge without refresh.

### G — Delete Task

Delete in Browser A.

Expected:

```text
Browser B removes Task automatically
```

### H — Same-client echo

Perform an update in Browser A.

Verify Browser A does not:

- duplicate Task,
- regress version,
- duplicate assignees,
- throw state errors

when its own SSE event arrives.

### I — Stale event protection

If practical through a small test/helper, deliver or simulate an older `task.updated` version.

Verify it does not overwrite newer local state.

### J — Project isolation

Open:

```text
Browser A → Project A
Browser B → Project B
```

Mutate Task in Project A.

Project B must not receive/apply the event.

### K — Failed mutation

Attempt a Task update that fails, for example:

- stale version (`409`), or
- incomplete dependency → DONE (`422`).

Verify no corresponding `task.updated` event is delivered.

### L — Reconnect convergence

Disconnect Browser B temporarily if practical.

Mutate one or more Tasks from Browser A.

Reconnect Browser B.

Verify authoritative refetch causes Browser B to show current PostgreSQL state even though events were missed.

### M — Existing functionality

Verify:

- Project Management,
- Task CRUD,
- assignees,
- dependencies,
- status rules

still work.

### N — Quality

```bash
npm run build
npm run lint
npm run verify:domain
```

All must pass.

---

## 30. Acceptance Criteria

### Publishing

- [ ] successful Task create publishes `task.created`.
- [ ] successful Task update publishes `task.updated`.
- [ ] successful Task delete publishes `task.deleted`.
- [ ] events publish only after successful database persistence.
- [ ] failed Task mutations do not publish events.
- [ ] event Project ID comes from authoritative server data.

### Payloads

- [ ] `task.created` contains lightweight created Task.
- [ ] `task.updated` contains committed version.
- [ ] `task.updated` uses incremental `changes`.
- [ ] `task.deleted` contains Task ID.
- [ ] no full Project snapshot is sent.
- [ ] no Comments are embedded.
- [ ] no large dependency graph is embedded.

### Client Sync

- [ ] Browser B receives Task create without refresh.
- [ ] Browser B receives Task update without refresh.
- [ ] Browser B receives Task delete without refresh.
- [ ] title sync works.
- [ ] status sync works.
- [ ] priority sync works.
- [ ] description sync works.
- [ ] tags sync works.
- [ ] assignee sync works.
- [ ] duplicate create event does not duplicate Task.
- [ ] duplicate/stale update does not regress Task.
- [ ] duplicate delete is safe.
- [ ] same-client event echo is safe.

### Consistency

- [ ] Task update event version matches committed version.
- [ ] stale PATCH still returns `409`.
- [ ] stale PATCH publishes no event.
- [ ] domain-rule rejection publishes no event.
- [ ] reconnect/refetch converges missed state.
- [ ] PostgreSQL remains the source of truth.

### Project Isolation

- [ ] Project A Task events reach Project A subscribers.
- [ ] Project A Task events do not reach Project B subscribers.

### Scope

- [ ] no Comments implementation.
- [ ] no comment realtime events.
- [ ] no WebSockets.
- [ ] no Redis/NATS/Kafka.
- [ ] no persistent event log.
- [ ] no durable replay.
- [ ] no optimistic UI.
- [ ] no authentication.
- [ ] no bonus features.

### Quality

- [ ] Realtime Foundation still works.
- [ ] Project Management still works.
- [ ] Task Management still works.
- [ ] Dependencies & Status Rules still work.
- [ ] domain verification passes.
- [ ] production build passes.
- [ ] lint/static checks pass.
- [ ] application remains runnable.

---

## 31. Definition of Done

Live Task Sync is complete when two clients on the same Project can demonstrate:

```text
Browser A creates Task
      ↓
Browser B sees Task

Browser A edits Task
      ↓
Browser B sees change

Browser A deletes Task
      ↓
Browser B removes Task
```

with:

```text
small incremental SSE events
```

rather than full Project payloads.

The database remains authoritative, and reconnect refetch handles missed events.

---

## 32. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "feat: add live task synchronization"
```

Do not combine Comments into this commit.

---

## 33. Handoff: Live Comments

The next milestone will implement the remaining core Comment requirement:

```text
GET  /api/tasks/:taskId/comments
POST /api/tasks/:taskId/comments
```

plus:

```text
comment thread UI
comment.created event
realtime comment propagation
```

That milestone should reuse the existing SSE foundation rather than creating another connection.

---

## 34. Agent Implementation Prompt

Use this specification with:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
docs/specs/04-task-management.md
docs/specs/05-dependencies-status-rules.md
docs/specs/06-realtime-foundation.md
docs/specs/07-live-task-sync.md
```

Prompt:

> Implement the **Live Task Sync** milestone defined in `docs/specs/07-live-task-sync.md`.
>
> Architecture, Application Bootstrap, Domain & Data Model, Project Management, Task Management, Dependencies & Status Rules, and Realtime Foundation are already complete. Preserve them.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract.
>
> Implement only:
> - `task.created` publishing after successful Task creation,
> - `task.updated` publishing after successful Task update,
> - `task.deleted` publishing after successful Task deletion,
> - small incremental event payloads,
> - Project-scoped event routing,
> - client handling for Task create/update/delete events,
> - Task version checks for incoming update events,
> - duplicate/self-origin event safety,
> - two-browser Task synchronization,
> - reconnect/refetch convergence verification.
>
> Do not implement Comments, comment events, WebSockets, Redis, NATS, Kafka, persistent event logs, durable replay, optimistic UI, authentication, or bonus features.
>
> Preserve commit-before-broadcast ordering.
>
> Never publish an event for a failed Task mutation.
>
> Derive Project routing from authoritative Task/Project data on the server.
>
> Do not send full Project payloads through SSE.
>
> Keep the existing Task version and dependency/status-rule contracts intact.
>
> Run every acceptance check in `07-live-task-sync.md`.
>
> At completion report:
> 1. files created or modified,
> 2. Task event publishing integration,
> 3. event payload examples,
> 4. commands executed,
> 5. two-browser create verification,
> 6. two-browser update verification,
> 7. two-browser delete verification,
> 8. same-client echo/stale-event verification,
> 9. failed-mutation/no-event verification,
> 10. Project-isolation verification,
> 11. reconnect convergence verification,
> 12. build/lint/domain verification results,
> 13. any deviation from the specification,
> 14. any issue before Live Comments begins.
>
> Do not silently redesign the architecture.
> Do not begin Live Comments.
