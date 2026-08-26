# Collaborative Task Manager

This is a small collaborative task manager — Projects, Tasks, dependencies between tasks, status rules, assignees, and comments, all kept in sync across multiple browser tabs in near real time. Postgres holds the real state, REST handles anything a client wants to change, and Server-Sent Events push the small, incremental updates back out to everyone else looking at the same project.

I built this as a scoped take-home, not a production system, so I want to be upfront about that going in. What I was actually trying to prove out here is realtime collaboration that stays consistent across clients, sane API boundaries, updates that don't get more expensive as a project grows, and tradeoffs that are made on purpose and written down — not features I ran out of time for.

---

## 1. The actual problem

CRUD on its own isn't the hard part of this. The hard part is everything downstream of "more than one person has this project open at once":

```text
multiple clients
      ↓
shared project state
      ↓
concurrent mutations
      ↓
near-real-time sync
      ↓
consistent server state
      ↓
projects that eventually get big
```

Two things drove most of the design choices below:

- **Two people shouldn't be able to silently stomp on each other's edits.** If a write is stale, it needs to fail loudly, not just lose.
- **A one-field change shouldn't cost a full project resend.** If updating a task's status pushes down the entire project payload, that's fine at 3 tasks and a real problem at 3,000.

---

## 2. What's actually here

### Projects
Create, list, and open a project. The homepage lists what's in Postgres and links into each one. Creation works fine through the API (`POST /api/projects`) — I just never got around to wiring up a form for it in the UI, so right now that's a curl/Postman thing, not a button. Called that out explicitly in the limitations section rather than pretending it's finished.

### Tasks
Full CRUD, plus status, priority, description, tags, custom fields, and assignees. Every task carries a `version` number that gets checked on every write, which is what makes the conflict handling below possible.

### Dependencies
You can add or remove a dependency between two tasks in the same project. Self-dependencies, cross-project edges, duplicate edges, and cycles (direct or indirect) all get rejected server-side. A task can't be marked `DONE` while something it depends on isn't.

### Comments
List and post comments on a task, attributed to whichever seeded user you're "logged in" as (there's a simple "Comment as" picker — no real auth here).

### Realtime
One SSE connection per open project page. Task creates/updates/deletes and new comments all show up on every other tab looking at that project, without anyone hitting refresh. If a connection drops and comes back, the client just refetches current state instead of trying to replay whatever it missed.

### Consistency
Postgres is the source of truth, full stop. Every task has a version number, and a write against a stale version gets bounced with a `409` instead of quietly overwriting someone else's change.

That's the whole list. No auth, no WebSockets, no Redis/Kafka/NATS, no CRDT or operational transform, no notifications or presence, no pagination or virtualized lists, no AI anything. All of that is a deliberate line I drew, not something I meant to build and didn't — more on why in [Tradeoffs & Known Limitations](#10-tradeoffs--known-limitations).

---

## 3. How it fits together

```text
 Browser A                                   Browser B
    │                                            ▲
    │ REST (mutations)                           │ SSE (notifications)
    ▼                                            │
┌───────────────────────────────────────────────────────────┐
│                         Next.js                            │
│                                                              │
│  Route Handlers                                             │
│        │                                                    │
│        ▼                                                    │
│  Domain Services (tasks / dependencies / comments)          │
│        │                          │                         │
│        ▼                          └── Domain Event          │
│      Prisma                              │                  │
│        │                        In-memory Broadcaster       │
└────────┼─────────────────────────────┼──────────────────────┘
         ▼                             └────────► SSE clients
    PostgreSQL
```

And what actually happens on a mutation, step by step:

```text
client sends a mutation over REST
      ↓
route handler checks the HTTP shape is even valid
      ↓
domain service checks the business rules
      ↓
postgres transaction commits
      ↓
a domain event gets created
      ↓
in-memory, project-scoped broadcaster picks it up
      ↓
every SSE subscriber for that project gets it
      ↓
other clients reconcile their local state
```

Route handlers stay thin on purpose — they parse the request and translate errors to status codes. All the actual persistence and rule-checking lives in `src/server/*`. Prisma is the only thing that talks to the database.

---

## 4. Why I made the choices I did

### Next.js, one repo, one stack
One language, one deploy target, route handlers and the React UI living side by side. For a two-day scope that's just less to wire up. A separate Go service or similar would give you cleaner isolation, sure, but the integration tax isn't worth it here — it wouldn't make the actual demo any more convincing.

### Postgres
The data is relational in an obvious way — project has tasks, tasks have users attached (assignees), tasks have comments, tasks depend on other tasks. Foreign keys and transactions are exactly the right tool for that shape of data. This wasn't a hard call.

### Prisma instead of hand-rolled SQL
Mostly a speed decision. Generated types, migrations that are actually tracked, and I didn't have to write the same CRUD query five times with slightly different shapes. Prisma is still generating SQL underneath — it's not replacing SQL, it's saving me from writing the boring 90% of it by hand. If a query ever needed to be hand-tuned, raw SQL is still an option; I just never hit that need at this scale.

### REST for anything that changes state
Creates, updates, deletes — plain HTTP request/response. Validation, error handling, and status codes (`400`/`404`/`409`/`422`) all behave the way anyone would expect them to. Nothing clever here on purpose.

### SSE for the server pushing updates back
The traffic pattern is lopsided: clients send commands, the server pushes notifications one direction. SSE matches that shape directly and rides on plain HTTP — no upgrade handshake, no extra protocol to reason about. If this were growing toward live cursors, presence, or people typing into the same field at once, I'd reach for WebSockets instead. That's not the shape of this problem, so I didn't.

### Task-level version numbers
Every task has a `version`. A PATCH has to say which version it thinks it's editing, and the update is an atomic `UPDATE ... WHERE id = ? AND version = ?`. If someone else already changed the row, that conditional update matches nothing, and the request comes back as `409 VERSION_CONFLICT` instead of silently overwriting a newer write. It's simple and it's easy to demo in two tabs. The honest tradeoff: this is task-level, not field-level, so two people editing *different* fields on the same task can still collide with each other even though their changes don't actually overlap. I didn't build field-level merging or a CRDT for this — correctness and being able to explain the behavior in one sentence mattered more than smarter conflict resolution.

### Dependencies as a real relational table
`TaskDependency` is a self-join table (`taskId`, `dependsOnTaskId`), not an array column bolted onto Task. That gets you many-to-many dependencies for free, a composite key stops duplicate edges automatically, and cascading deletes stay sane. Cycle detection is just a BFS over the project's dependency edges at write time — the graphs here are small enough that reaching for an actual graph database would be solving a problem I don't have.

### Commit first, broadcast second
The server never fires a realtime event before the database transaction it describes has actually committed. Always: validate, mutate, commit, *then* build the event, *then* broadcast it. That way a client can never see something over SSE that didn't really happen. If the write fails, nothing goes out — no exceptions.

### Refetch on reconnect instead of replaying missed events
SSE connections drop — laptop sleeps, wifi hiccups, dev server restarts. Instead of building a durable event log with replay, a client that reconnects just refetches the current state of whatever it was looking at. Less to build, and it's correct here because Postgres is the source of truth, not the event stream. A system with stronger delivery guarantees would want durable event IDs and real replay; I didn't need that for this.

### In-memory broadcaster, with a stated path off of it
Realtime fanout right now is one `Map<projectId, Set<subscriber>>` living in the Next.js process. No Redis, no external broker. That's genuinely all this needs for one process, and it demonstrates the event boundary cleanly. It does not survive multiple server instances as-is — see [Scaling Strategy](#9-scaling-strategy) for what changes when it needs to.

### Scope, cut on purpose
Auth, notifications, presence, pagination — all of it is real work, and none of it was necessary to show the actual thing being tested here: consistent, near-real-time, incrementally-synced state across clients. I'd rather ship those cleanly cut than half-built.

---

## 5. Realtime sync, in more detail

Each open project page opens exactly one `EventSource` against:

```http
GET /api/projects/:projectId/events
```

The server keeps subscribers grouped by project id in memory, so an event for project A only ever reaches project A's subscribers — project B's connections never see it. The project id used for routing always comes from what's actually persisted on the entity being changed, never from anything the client sent, so there's no way to leak an event across projects by supplying the wrong id.

### Keeping payloads small

This is the part that directly answers the "what happens when projects get big" question. A few rules:

- `task.created` ships the new task as-is, so the receiving client can just drop it in without a follow-up fetch.
- `task.updated` ships the new `version` and a `changes` object with **only the fields that actually changed** — not the whole task.
- `task.deleted` ships just the id.
- `comment.created` ships just the one new comment, never the thread's full history.

A single status flip looks like this over the wire:

```json
{
  "type": "task.updated",
  "entityId": "task-42",
  "data": {
    "version": 8,
    "changes": { "status": "DONE" }
  }
}
```

Nothing ever sends the whole project, the whole task list, or a whole comment thread down the socket.

### The client seeing its own event

Whoever makes a change is also subscribed to the same SSE stream, so they'll typically see their own event come back around. Rather than trying to detect "this event came from me" and suppress it, I just let the normal rules handle it:

- Task updates only apply if `event.version > local.version` — your own echo carries a version you already have, so it's a no-op.
- New tasks are deduped by id.
- Deleting an already-gone task is a no-op.
- Comments are deduped by id.

No client-origin tagging needed — the existing idempotency rules cover it for free.

### Reconnecting

```text
connection drops
      ↓
EventSource reconnects on its own
      ↓
client refetches whatever it was looking at
      ↓
UI matches Postgres again
```

There's no attempt to figure out exactly what was missed while disconnected — the refetch just re-reads current state, which is fine precisely because the event stream was never the authority in the first place.

---

## 6. How consistency actually works

Postgres is the only thing treated as ground truth. Whatever the client has cached is just a cache, and an incoming realtime event isn't trusted on its own — it's a nudge to go reconcile with what the server actually committed.

Every task's version starts at 1 and goes up by exactly one on every successful write:

```text
Client A reads task version 5
Client B reads task version 5

A PATCHes with version 5   → succeeds, task is now version 6
B PATCHes with version 5   → 409 VERSION_CONFLICT (server is already at 6)
```

When a client gets that 409, it doesn't show the edit as saved — it shows a "this changed under you" message and goes and fetches the current task. No merge attempt, no silent retry.

A rejected write (`400`, `409`, `422`) never touches the row and never fires an event. Only a write that actually committed produces a `task.updated`, and that event always carries the version that was actually written — never the version the client was hoping for.

---

## 7. How dependencies behave

A row in `TaskDependency` — `(taskId, dependsOnTaskId)` — just means "taskId can't be done until dependsOnTaskId is." Every add goes through a handful of checks server-side before it's allowed to land:

| What you tried | What happens |
|---|---|
| Task depends on itself | `400 SELF_DEPENDENCY` |
| The two tasks are in different projects | `422 CROSS_PROJECT_DEPENDENCY` |
| That edge already exists | `409 DEPENDENCY_EXISTS` |
| Adding it would create a cycle, direct or indirect | `422 DEPENDENCY_CYCLE` |
| Adding an incomplete prerequisite to a task that's already `DONE` | `422 INCOMPLETE_DEPENDENCY_FOR_DONE_TASK` |
| Trying to mark something `DONE` while a direct dependency isn't | `422 INCOMPLETE_DEPENDENCIES` |

Cycle checking is a BFS from the proposed prerequisite to see whether it can already reach the dependent task — small enough graphs that this is genuinely fine, no need for anything fancier.

One thing worth calling out honestly: if you reopen a task that was previously `DONE`, nothing cascades to reopen the tasks that depended on it. The completion rule only fires at the moment something transitions *to* `DONE`. That's a real simplification, and I'd rather say so than have someone find it by surprise.

---

## 8. Data model

```text
Project
   │
   └──< Task
          │
          ├──< TaskAssignee >── User
          ├──< Comment >──────── User
          ├──< dependencies ──── another Task
          └──< dependents ────── another Task
```

A few notes that aren't obvious from the diagram:

- Project, User, Task, and Comment all use UUID primary keys.
- `TaskAssignee` and `TaskDependency` are pure join tables — composite primary key, no extra synthetic id.
- `Task.tags` is a real Postgres string array; `customFields` and `Project.metadata` are JSON columns.
- `Task.version` starts at 1 and only the task service is allowed to bump it.
- Deleting a task cascades to its assignees, comments, and both directions of its dependency edges — no orphaned rows left behind.

The actual schema lives in [`prisma/schema.prisma`](prisma/schema.prisma), and [`prisma/seed.js`](prisma/seed.js) has the seed data: 3 users, 1 project, 3 tasks (one dependency between two of them), some assignees, and one comment.

---

## 9. What scaling this further would look like

**Right now:** one Next.js process, one in-memory broadcaster, Postgres as the only durable store.

```text
Browser A ──┐
Browser B ──┼── Server Process A ── PostgreSQL
Browser C ──┘
```

That's fine as long as every client happens to land on the same process. It breaks as soon as you add a second one — an event published on Server A has no way to reach a client sitting on Server B.

**Where this goes next:**

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

The shape of the fix is: instead of (or in addition to) publishing to its own local subscriber map, a server publishes the domain event to shared pub/sub. Every instance picks it up and forwards it only to its own locally-connected SSE clients for that project. SSE itself doesn't need to change — the only thing that changes is how instances tell each other an event happened. I haven't built this layer; it's the obvious next step once there's more than one server process.

Separately, on the "projects get big" front: the API already avoids one giant nested payload — project, tasks, and comments are three separate endpoints instead of one deeply nested blob. Pagination, virtualized rendering, and caching would all sit naturally on top of that boundary later; none of them exist yet.

---

## 10. Tradeoffs & known limitations

| Area | Where it stands today | What I'd do in production |
|---|---|---|
| Realtime fanout | In-memory, single process | Shared pub/sub across instances |
| Missed events | Reconnect and refetch | Durable event ids + real replay |
| Conflict detection | Whole-task version, not per-field | Field-level or CRDT-based merge |
| Auth | None — just seeded users | Actual authentication/authorization |
| Large datasets | No pagination or virtualization | Cursor pagination, virtualized lists, caching |
| Collaborative text | Discrete task/comment writes | CRDT/OT — not actually needed for this domain |
| Reopening a dependency | Doesn't cascade to dependents | Optional re-check when a prerequisite reopens |
| Creating a project | API only, no UI form | Add the form — API's already there |

Every row here is a decision I made on purpose, not a bug I didn't get to.

---

## 11. How this was actually built

I didn't sit down and ask an agent to build "a collaborative task manager" in one shot. The process looked more like this:

```text
understand the actual problem
      ↓
lock the architecture decisions first (docs/specs/architecture.md)
      ↓
write one milestone spec at a time
      ↓
each spec says explicitly what's in and what's out
      ↓
implement just that milestone
      ↓
check it against its own acceptance criteria
      ↓
commit
      ↓
move to the next one
```

Architecture came first — stack, domain model, API shapes, the event envelope, the consistency model, and an explicit non-goals list — all locked in [`docs/specs/architecture.md`](docs/specs/architecture.md) before any code got written. Every milestone after that had its own written scope, and I didn't move on until its acceptance criteria actually passed.

The specs are still in the repo, in order:

| Milestone | What it covers |
|---|---|
| [Architecture Contract](docs/specs/architecture.md) | Lock scope and technical decisions |
| [Application Bootstrap](docs/specs/bootstrap.md) | Next.js + Postgres + Prisma |
| [Domain & Data Model](docs/specs/data-model.md) | The relational core |
| [Project Management](docs/specs/project-management.md) | First vertical slice |
| [Task Management](docs/specs/task-management.md) | Task CRUD + versioning |
| [Dependencies & Status Rules](docs/specs/dependencies-status-rules.md) | Domain constraints |
| [Realtime Foundation](docs/specs/realtime-foundation.md) | SSE + broadcaster |
| [Live Task Sync](docs/specs/live-task-sync.md) | Cross-client task updates |
| [Live Comments](docs/specs/live-comments.md) | Cross-client comments |
| [Reliability Hardening](docs/specs/reliability-hardening.md) | End-to-end correctness pass |
| [Delivery](docs/specs/delivery.md) | This document, basically |

**Why bother with all this instead of just prompting for the whole thing:** I used AI tooling to move faster *inside* boundaries I'd already set, not to decide what those boundaries should be. Because scope and acceptance criteria existed before any code got generated, each milestone stayed small enough to actually review, and stayed runnable the whole way through — instead of ending up with one huge pile of generated code I'd have to reverse-engineer my own trust in. Every milestone here ends at a checkpoint that actually works, not a checkpoint that compiles.

---

## 12. Running it locally

You'll need Node (see [`.nvmrc`](.nvmrc) — `18.20.8`), npm, and Docker.

```bash
git clone <repo>
cd taskmanager

cp .env.example .env

npm install

docker compose up -d db

npx prisma generate
npx prisma migrate dev
npx prisma db seed

npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### If you want a clean database

```bash
npx prisma migrate reset
```

Drops it, reapplies every migration, reseeds. Useful if things get into a weird state during a demo.

---

## 13. Checking it actually works

```bash
npm run verify:domain   # confirms seeded users/project/tasks/assignees/dependency/comment all resolve
npm run build            # production build
npm run lint              # next lint
```

And two quick manual checks:

```text
GET http://localhost:3000/api/health     → { "status": "ok", "database": "connected" }
GET http://localhost:3000/api/projects   → the seeded "HappyRobot Demo" project
```

---

## 14. Two-browser demo, step by step

1. Open the same project (`http://localhost:3000/projects/<project-id>`) in two windows side by side — a normal window and an incognito one works fine, and gives each its own "Comment as" identity.
2. Create a task in Window A. It should show up in Window B right away, no refresh.
3. Change that task's status in Window A (`TODO → IN_PROGRESS`). Window B picks it up automatically.
4. Add a dependency — make one task depend on another that isn't `DONE` yet.
5. Try to mark the dependent task `DONE`. It gets rejected (`422 INCOMPLETE_DEPENDENCIES`), and neither window shows it as done.
6. Complete the prerequisite, then complete the dependent task — this time it goes through, and both windows agree.
7. Add a comment in Window A. It shows up in Window B without a refresh.
8. Add a comment in Window B. It shows up in Window A.
9. Delete a task in Window A — it disappears from Window B on its own.
10. Refresh both windows. Both still match what's in Postgres.

To see the stale-write rejection specifically: open the same task in both windows, save an edit in Window A, then try to save a different edit in Window B using the version it originally loaded. Window B should come back with `409 Conflict` instead of quietly clobbering A's change.

---

## 15. A ~5-minute walkthrough, roughly

**0:00–0:30 — the problem.** Not CRUD — keeping multiple clients consistent in near real time without resending whole projects as they grow.

**0:30–1:15 — architecture.** The diagram in [§3](#3-how-it-fits-together): REST in, SSE out, Postgres as the only source of truth, commit-then-broadcast, the in-memory broadcaster.

**1:15–1:45 — how it was built.** Pull up `docs/specs/`. Architecture and scope were locked before any implementation, then it went milestone by milestone with its own acceptance criteria each time — AI-assisted, but inside boundaries that were already decided.

**1:45–3:15 — live demo.** The two-browser walkthrough above: task sync, dependency rejection, comment sync.

**3:15–4:15 — a few code spots worth showing.** The version check in `task.service.ts`, the cycle/validation logic in `dependency.service.ts`, the event envelope and broadcaster in `lib/events/`, the SSE route, comment event publishing.

**4:15–4:50 — scaling and tradeoffs.** In-memory broadcaster → shared pub/sub, refetch → real replay if it's ever needed, SSE vs. WebSockets, task-level vs. field-level conflicts.

**4:50–5:00 — wrap.** Incremental updates, consistent state, a real path to scale it, and scope that was cut on purpose.

---

## 16. Where things live

```text
docs/specs/                    the milestone specs — the actual build history

prisma/
├── schema.prisma               the schema
├── migrations/                 committed migration history
└── seed.js                     seed data

scripts/
└── verify-domain.js            sanity-checks the seeded relationships

src/
├── app/
│   ├── api/
│   │   ├── health/
│   │   ├── projects/                 GET, POST /api/projects; GET /api/projects/:id
│   │   │   └── [projectId]/
│   │   │       ├── tasks/            GET, POST tasks for a project
│   │   │       └── events/           GET — the SSE stream
│   │   ├── tasks/[taskId]/           GET, PATCH, DELETE
│   │   │   ├── dependencies/         POST; DELETE /:dependsOnTaskId
│   │   │   └── comments/             GET, POST
│   │   ├── users/                    GET, read-only, for assignee/author pickers
│   │   └── dev/projects/[projectId]/test-event/   dev-only SSE smoke test, 403s in production
│   ├── page.tsx                      project list
│   └── projects/[projectId]/page.tsx project detail — tasks, dependencies, comments
│
├── components/
│   ├── realtime/project-event-stream.tsx   the EventSource client
│   └── tasks/task-manager.tsx              task list/create/edit/delete + dependency + comment UI
│
├── server/
│   ├── tasks/           task.service.ts, task.validation.ts
│   ├── dependencies/    dependency.service.ts, dependency.validation.ts
│   └── comments/        comment.service.ts, comment.validation.ts
│
└── lib/
    ├── db.ts                the Prisma client
    └── events/              domain event type, event factory, the broadcaster
```

---

## 17. What I'd add next

Not implemented, but on the list if this kept going:

- Shared pub/sub (Redis/NATS/Kafka) so realtime works across more than one server instance.
- Durable event ids and real replay, instead of leaning on refetch after reconnect.
- Field-level conflict detection, or something CRDT-based, for edits that touch different fields on the same task.
- Real authentication instead of picking a name from a dropdown.
- Cursor pagination and virtualized rendering once projects get large.
- An actual create-project form in the UI — the API's already sitting there waiting for it.
- Cascading re-validation for dependents when a completed prerequisite gets reopened.
