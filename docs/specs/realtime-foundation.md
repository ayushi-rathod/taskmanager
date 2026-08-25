# 06 — Realtime Foundation

## 1. Purpose

This specification introduces the realtime transport foundation for the collaborative task management system.

Completed milestones already provide:

- Projects
- Tasks
- Task assignments
- Dependencies
- Status rules
- PostgreSQL persistence
- REST APIs

This milestone adds only the infrastructure required for future live synchronization:

- project-scoped Server-Sent Events (SSE),
- a shared domain-event envelope,
- an in-memory project broadcaster,
- subscriber lifecycle management,
- heartbeat/keepalive behavior,
- reconnect-safe client handling,
- authoritative refetch after reconnect.

This milestone does **not** yet publish Task, Dependency, or Comment mutation events.

The goal is to prove that:

```text
Server
  ↓
SSE event
  ↓
Connected browser
```

works reliably before mutation flows are connected to it.

Authoritative specifications:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
docs/specs/04-task-management.md
docs/specs/05-dependencies-status-rules.md
```

---

## 2. Objective

At completion:

```text
Browser opens Project
      ↓
one SSE connection opens for that Project
      ↓
server registers subscriber
      ↓
test/domain event is published internally
      ↓
subscriber receives event
      ↓
connection can disconnect/reconnect safely
      ↓
client refetches authoritative Project/Task state after reconnect
```

The important outcome is a clean transport boundary that later milestones can reuse.

---

## 3. Prerequisites

Do not begin until Dependencies & Status Rules is complete and existing functionality is stable.

Verify:

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
npm run build
npm run lint
```

Also verify manually:

- Project Management works,
- Task Management works,
- Task editing uses valid Task IDs,
- Dependency add/remove works,
- incomplete dependencies block `DONE`,
- stale Task updates still return `409`.

Do not use realtime work to mask or bypass an existing REST/API bug.

---

## 4. Scope

### 4.1 In Scope

Implement:

- domain event TypeScript types,
- stable event envelope,
- in-memory event broadcaster,
- project-scoped subscriptions,
- `GET /api/projects/:projectId/events`,
- SSE headers and streaming response,
- subscriber cleanup on disconnect,
- keepalive/heartbeat messages,
- one `EventSource` connection per open Project,
- client connection lifecycle,
- reconnect handling,
- authoritative refetch after reconnect,
- development-only/manual verification mechanism for publishing a test event,
- basic connection-status visibility if useful.

### 4.2 Out of Scope

Do not implement:

- `task.created` publishing from Task API,
- `task.updated` publishing from Task API,
- `task.deleted` publishing from Task API,
- dependency mutation event publishing,
- Comment APIs,
- Comment realtime events,
- activity feed,
- notifications,
- presence,
- live cursors,
- WebSockets,
- Redis,
- NATS,
- Kafka,
- persistent event log,
- durable replay,
- `Last-Event-ID` replay semantics,
- optimistic UI,
- authentication,
- bonus features.

The broadcaster may support future event types, but product mutation services must not be wired to it yet.

---

## 5. Transport Decision

Use:

```text
Client → Server mutations
REST / HTTP

Server → Client notifications
SSE
```

The realtime stream is:

```http
GET /api/projects/:projectId/events
```

One open Project should use one SSE connection.

Do not create:

- one SSE connection per Task,
- one SSE connection per event type,
- one SSE connection per Comment thread.

---

## 6. Domain Event Envelope

Create a reusable event type equivalent to:

```ts
type DomainEvent<TData = unknown> = {
  id: string;
  type: string;
  projectId: string;
  entityId: string | null;
  timestamp: string;
  data: TData;
};
```

Example:

```json
{
  "id": "event-uuid",
  "type": "system.test",
  "projectId": "project-uuid",
  "entityId": null,
  "timestamp": "2026-08-24T20:00:00.000Z",
  "data": {
    "message": "Realtime connection verified"
  }
}
```

### Requirements

- event IDs must be unique,
- timestamp is server-generated ISO-8601,
- `projectId` determines fanout scope,
- `entityId` may be null for infrastructure/test events,
- `data` must remain small,
- events must be JSON serializable.

Do not include entire Project snapshots.

---

## 7. Event Types

For this milestone, define the type system so future milestones can use:

```text
task.created
task.updated
task.deleted

dependency.created
dependency.deleted

comment.created
```

However, only a development/infrastructure test event needs to be published now:

```text
system.test
```

Defining future string constants/types is acceptable.

Do not wire product mutations to those events yet.

---

## 8. Event Broadcaster

Create a small abstraction such as:

```text
src/lib/events/
├── broadcaster.ts
└── types.ts
```

Conceptual interface:

```ts
publish(event: DomainEvent): void

subscribe(
  projectId: string,
  subscriber: EventSubscriber
): () => void
```

A subscriber may conceptually be:

```ts
(event: DomainEvent) => void
```

### Requirements

The broadcaster must:

- maintain subscribers by `projectId`,
- send Project A events only to Project A subscribers,
- support multiple subscribers for the same Project,
- return or provide an unsubscribe mechanism,
- remove disconnected subscribers,
- avoid throwing when one subscriber disconnects,
- remain in-memory for this take-home.

Conceptual structure:

```text
Map<ProjectId, Set<Subscriber>>
```

Do not add Redis or another external broker.

---

## 9. Single-Instance Limitation

The current broadcaster is intentionally process-local.

Document the limitation:

```text
Browser A ── Server Process A
Browser B ── Server Process A
```

works.

But:

```text
Browser A ── Server Process A
Browser B ── Server Process B
```

would require shared pub/sub.

Production evolution:

```text
Server A
Server B
Server C
   │
   └──── Shared Pub/Sub
          Redis / NATS / Kafka
```

Do not implement this production layer now.

---

## 10. SSE Endpoint

Implement:

```http
GET /api/projects/:projectId/events
```

Recommended location:

```text
src/app/api/projects/[projectId]/events/route.ts
```

### Validation

Before opening the stream:

- `projectId` must be a valid UUID,
- Project must exist.

### Invalid ID

Return:

```http
400 Bad Request
```

### Missing Project

Return:

```http
404 Not Found
```

Do not open a stream for a nonexistent Project.

---

## 11. SSE Response Headers

The streaming response must use SSE-compatible headers equivalent to:

```text
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

Use only headers appropriate to the actual Next.js runtime.

Do not set a normal JSON content type.

The endpoint must remain a streaming response.

---

## 12. SSE Message Format

A domain event should be emitted in valid SSE form.

Conceptually:

```text
id: event-uuid
event: system.test
data: {"id":"...","type":"system.test",...}

```

The terminating blank line is required.

### Recommendation

Use:

```text
id:
event:
data:
```

fields.

The complete domain-event JSON should be carried in `data`.

Do not invent a custom delimiter protocol.

---

## 13. Keepalive / Heartbeat

Long-lived connections may be closed by proxies or infrastructure if completely idle.

Send a lightweight keepalive periodically.

Preferred form:

```text
: keepalive

```

SSE comments are appropriate because clients do not need to process them as domain events.

A reasonable interval for the take-home is approximately:

```text
15–30 seconds
```

Do not send large heartbeat objects.

Do not emit heartbeats as Task events.

---

## 14. Connection Cleanup

When the browser closes the Project, navigates away, refreshes, or loses the connection:

```text
request aborts
      ↓
unsubscribe Project subscriber
      ↓
clear heartbeat timer
      ↓
close stream safely
```

No stale subscriber should remain indefinitely.

Use the request's abort signal / streaming lifecycle supported by Next.js.

The implementation must not accumulate subscribers after repeated page reloads.

---

## 15. Project Isolation

This is a required correctness check.

If:

```text
Client A subscribes to Project A
Client B subscribes to Project B
```

and the server publishes:

```text
projectId = Project A
```

then:

```text
Client A receives event
Client B does not
```

The broadcaster must filter by Project before delivery.

Do not broadcast every event globally and ask the browser to filter it.

---

## 16. Client EventSource

When a Project page is open, the client should establish:

```ts
new EventSource(`/api/projects/${projectId}/events`)
```

Use a small hook/component, for example:

```text
src/hooks/use-project-events.ts
```

or:

```text
src/components/realtime/project-event-stream.tsx
```

Exact naming is flexible.

### Requirements

- one EventSource per open Project page,
- close the previous EventSource on unmount/project change,
- handle `open`,
- handle transport error/reconnect lifecycle,
- parse domain event JSON safely,
- do not create a connection per Task.

---

## 17. Reconnect Strategy

Native `EventSource` automatically attempts reconnection.

However, an SSE client may miss domain changes while disconnected.

The locked architecture chooses:

```text
disconnect
   ↓
reconnect
   ↓
refetch authoritative state
```

instead of durable replay.

### Required behavior

Track whether the connection has previously opened.

On a connection that successfully opens **after a disconnect/error**, trigger authoritative refresh of Project/Task data.

A simple approach may use:

```text
router.refresh()
```

if the current Project page is server-driven.

A targeted Project/Task refetch is also acceptable.

Do not build:

- durable event replay,
- event persistence,
- client event offset tracking.

---

## 18. Initial Connection Behavior

The initial EventSource connection does not replace normal page loading.

The page must still load authoritative Project/Task data through existing request/server paths.

Sequence:

```text
load Project/Tasks
      ↓
open SSE stream
      ↓
listen for future events
```

Do not rely on SSE to deliver the initial Project snapshot.

---

## 19. Test Event Mechanism

Because product mutations are not wired to the broadcaster yet, provide a safe verification mechanism.

Preferred options:

### Option A — Development-only API route

For example:

```http
POST /api/dev/projects/:projectId/test-event
```

only available when:

```text
NODE_ENV !== "production"
```

It publishes:

```text
system.test
```

to the broadcaster.

### Option B — Small verification script

A server-side test/helper that subscribes and publishes directly.

### Recommendation

Use whichever is simplest and easiest to verify manually.

If a development-only API route is added:

- clearly name it as dev/test-only,
- reject access in production mode,
- do not expose product mutation semantics through it.

This route must be removed or remain development-guarded before final delivery.

---

## 20. Test Event Payload

Example:

```json
{
  "type": "system.test",
  "projectId": "project-uuid",
  "entityId": null,
  "data": {
    "message": "Realtime connection verified"
  }
}
```

The broadcaster/event factory should generate:

- unique event ID,
- timestamp.

Do not let callers provide arbitrary event IDs/timestamps unless needed internally.

---

## 21. Optional Connection Indicator

A small development-friendly indicator is acceptable:

```text
Realtime: Connected
```

or:

```text
Realtime: Reconnecting
```

This is not a major product feature.

Keep it subtle.

Do not build presence indicators or online-user lists.

---

## 22. Event Handling in This Milestone

The client must be capable of receiving and parsing a domain event.

For:

```text
system.test
```

it may:

- log the event in development,
- update a tiny verification state,
- display a non-intrusive test indicator.

Do not mutate Task/Project state from product events yet.

That behavior belongs to Live Task Sync.

---

## 23. Error Handling

### Invalid Project URL

SSE endpoint returns normal JSON error before streaming.

### Runtime stream error

The server should clean up the subscriber.

### Client parse failure

Malformed event data must not crash the Project page.

Log appropriately in development.

### Transport disconnect

Allow EventSource reconnect behavior.

Do not show a permanent fatal error immediately for a transient disconnect.

---

## 24. Memory / Backpressure Boundary

For the take-home:

- events are small,
- broadcaster is in-memory,
- no durable queue exists,
- no large buffering strategy is required.

Do not implement an unbounded per-client event queue.

If a stream is no longer writable, unsubscribe/close it rather than retaining events indefinitely.

Document that production high-volume fanout would require stronger backpressure and pub/sub infrastructure.

Do not implement it here.

---

## 25. Runtime Considerations

SSE requires a server runtime capable of maintaining long-lived streaming responses.

Use the runtime compatible with the existing Next.js application and Prisma setup.

Do not move the database-backed SSE route to an incompatible edge runtime merely for novelty.

The route may explicitly use the Node.js runtime if necessary for compatibility.

Document any required runtime declaration.

---

## 26. No Managed Realtime Database

The source challenge explicitly prohibits relying on Firebase, Supabase, or another managed realtime database.

This implementation must use:

```text
Next.js server
      ↓
in-memory broadcaster
      ↓
SSE
      ↓
browser
```

PostgreSQL remains the persistent source of truth.

No managed realtime database should be introduced.

---

## 27. Recommended Repository Shape

Approximate additions:

```text
src/
├── app/
│   └── api/
│       ├── projects/
│       │   └── [projectId]/
│       │       └── events/
│       │           └── route.ts
│       │
│       └── dev/
│           └── projects/
│               └── [projectId]/
│                   └── test-event/
│                       └── route.ts
│
├── components/
│   └── realtime/
│       └── project-event-stream.tsx
│
├── hooks/
│   └── use-project-events.ts
│
└── lib/
    └── events/
        ├── broadcaster.ts
        ├── create-event.ts
        └── types.ts
```

Do not create all files if fewer are sufficient.

Avoid duplicate abstractions.

---

## 28. Verification Procedure

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

### C — Obtain Project IDs

Use:

```bash
curl -s http://localhost:3000/api/projects
```

Identify at least two Project IDs if possible.

### D — Inspect SSE response

Run:

```bash
curl -N \
  -H "Accept: text/event-stream" \
  http://localhost:3000/api/projects/<project-a-id>/events
```

The command should remain open.

Verify:

- response is streaming,
- connection does not close immediately,
- heartbeat comments arrive periodically.

### E — Publish test event

Using the implemented development verification mechanism, publish:

```text
system.test
```

for Project A.

The open Project A stream must receive a valid SSE event.

Conceptual output:

```text
id: <event-id>
event: system.test
data: {"id":"...","type":"system.test","projectId":"..."...}
```

### F — Project isolation

Open a second terminal:

```bash
curl -N \
  http://localhost:3000/api/projects/<project-b-id>/events
```

Publish a test event for Project A.

Expected:

```text
Project A stream receives it
Project B stream does not
```

### G — Multiple subscribers

Open two streams to the same Project.

Publish one test event.

Both subscribers must receive it.

### H — Disconnect cleanup

Close one curl/EventSource subscriber.

Publish again.

Remaining subscribers still work and server does not throw.

Repeat connect/disconnect several times.

No visible subscriber leak/error should occur.

### I — Browser connection

Open:

```text
http://localhost:3000/projects/<project-id>
```

Verify browser DevTools shows one open SSE request for the Project.

Navigate away.

Verify connection closes.

Navigate back.

Verify one new connection opens.

### J — Reconnect / refetch behavior

Temporarily interrupt the server/network if practical.

Restore connection.

Verify the Project page reconnects and performs authoritative refresh/reconciliation.

No durable replay is expected.

### K — Invalid Project

```bash
curl -i \
  http://localhost:3000/api/projects/not-a-uuid/events
```

Expected:

```text
HTTP 400
```

For a valid nonexistent UUID:

```bash
curl -i \
  http://localhost:3000/api/projects/00000000-0000-0000-0000-000000000000/events
```

Expected:

```text
HTTP 404
```

### L — Existing functionality

Verify:

- Project Management works,
- Task Management works,
- Dependencies work,
- status rules work.

### M — Quality

```bash
npm run build
npm run lint
npm run verify:domain
```

All must pass.

---

## 29. Acceptance Criteria

### Event Model

- [ ] shared DomainEvent type exists.
- [ ] event IDs are unique.
- [ ] timestamps are server-generated.
- [ ] events carry Project scope.
- [ ] event payloads remain small.
- [ ] future Task/Dependency/Comment event types can use the same envelope.

### Broadcaster

- [ ] in-memory broadcaster exists.
- [ ] subscribers are grouped by Project.
- [ ] multiple subscribers per Project are supported.
- [ ] unsubscribe/cleanup is supported.
- [ ] Project A events are not sent to Project B subscribers.
- [ ] one disconnected subscriber does not break others.
- [ ] no Redis/NATS/Kafka is introduced.

### SSE Endpoint

- [ ] `GET /api/projects/:projectId/events` exists.
- [ ] valid Project opens streaming response.
- [ ] invalid UUID returns `400`.
- [ ] missing Project returns `404`.
- [ ] SSE content type is correct.
- [ ] valid SSE framing is used.
- [ ] heartbeat/keepalive exists.
- [ ] disconnect cleanup occurs.

### Client

- [ ] Project page opens one EventSource connection.
- [ ] EventSource closes on unmount/navigation.
- [ ] domain-event JSON is parsed safely.
- [ ] transient errors do not crash page.
- [ ] reconnect is supported.
- [ ] reconnect triggers authoritative state refresh.
- [ ] initial Project/Task loading does not depend on SSE.

### Verification

- [ ] system.test event can be published safely in development.
- [ ] Project A receives its test event.
- [ ] Project B does not receive Project A event.
- [ ] two subscribers to one Project both receive event.
- [ ] connect/disconnect cycle remains stable.

### Scope

- [ ] Task APIs do not publish realtime events yet.
- [ ] Dependency APIs do not publish realtime events yet.
- [ ] Comments are not implemented.
- [ ] no WebSockets.
- [ ] no managed realtime database.
- [ ] no persistent event log.
- [ ] no durable replay.
- [ ] no authentication.
- [ ] no bonus features.

### Quality

- [ ] Project Management still works.
- [ ] Task Management still works.
- [ ] Dependencies & Status Rules still work.
- [ ] domain verification passes.
- [ ] production build passes.
- [ ] lint/static checks pass.
- [ ] application remains runnable.

---

## 30. Definition of Done

Realtime Foundation is complete when this works reliably:

```text
Project A browser
      ↓
opens one SSE stream
      ↓
server registers subscription
      ↓
system.test event published to Project A
      ↓
Project A receives event
```

while:

```text
Project B browser
      ↓
does NOT receive Project A event
```

and:

```text
disconnect
    ↓
cleanup
    ↓
reconnect
    ↓
authoritative refetch
```

works without corrupting existing product behavior.

No Task mutation needs to broadcast yet.

---

## 31. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "feat: add realtime SSE foundation"
```

Do not combine Live Task Sync into this commit.

---

## 32. Handoff: Live Task Sync

The next milestone will connect existing Task mutations to the realtime foundation.

It will publish:

```text
task.created
task.updated
task.deleted
```

only after successful database commits.

Connected Project clients will apply or reconcile those incremental Task events without receiving an entire Project payload.

Dependency event publishing can also be integrated deliberately according to the next specification's scope.

Comments remain a later milestone.

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
docs/specs/06-realtime-foundation.md
```

Prompt:

> Implement the **Realtime Foundation** milestone defined in `docs/specs/06-realtime-foundation.md`.
>
> Architecture, Application Bootstrap, Domain & Data Model, Project Management, Task Management, and Dependencies & Status Rules are already complete. Preserve them.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract.
>
> Implement only:
> - shared DomainEvent types/envelope,
> - event creation helper if useful,
> - in-memory Project-scoped broadcaster,
> - subscriber/unsubscribe lifecycle,
> - `GET /api/projects/:projectId/events`,
> - correct SSE streaming/framing/headers,
> - heartbeat/keepalive,
> - disconnect cleanup,
> - one Project EventSource connection in the client,
> - reconnect handling with authoritative refetch,
> - a development-only/manual mechanism to publish `system.test`,
> - verification required by this specification.
>
> Do not wire Task, Dependency, or Comment mutations to realtime events yet.
>
> Do not implement Comments, WebSockets, Redis, NATS, Kafka, persistent event storage, durable replay, presence, notifications, authentication, or bonus features.
>
> Keep PostgreSQL as the source of truth.
> Do not send entire Project snapshots through SSE.
> Ensure Project A events are delivered only to Project A subscribers.
>
> Run every acceptance check in `06-realtime-foundation.md`.
>
> At completion report:
> 1. files created or modified,
> 2. SSE endpoint implemented,
> 3. broadcaster design,
> 4. commands executed,
> 5. SSE header/framing verification,
> 6. heartbeat verification,
> 7. Project-isolation verification,
> 8. multiple-subscriber verification,
> 9. disconnect/reconnect verification,
> 10. browser EventSource verification,
> 11. build/lint/domain verification results,
> 12. any deviation from the specification,
> 13. any issue before Live Task Sync begins.
>
> Do not silently redesign the architecture.
> Do not begin Live Task Sync.
