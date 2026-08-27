# Collaborative Task Manager

Projects, tasks, dependencies, assignees, and comments — synced across browser tabs in near real time. Postgres holds state, REST handles writes, SSE pushes updates.

---

## Setup

Requires Node ([`.nvmrc`](.nvmrc) — `18.20.8`), npm, and Docker (Postgres runs in Docker; the app runs locally).

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

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run verify:domain   # confirms seeded data resolves
npm run build
npm run lint
```

Reset the local DB if needed: `npx prisma migrate reset` (drops, reapplies migrations, reseeds).

To see sync live: open the same project in two browser windows and edit/comment in one — it appears in the other without a refresh.

---

## Architecture

One Next.js app for both API and UI, Postgres for storage, Prisma as the ORM. Route handlers stay thin (parse request, map errors to status codes); business rules live in `src/server/*` services; only Prisma touches the DB.

```text
 Browser A                                   Browser B
    │ REST (mutations)                           ▲ SSE (notifications)
    ▼                                            │
┌───────────────────────────────────────────────────────────┐
│  Route Handlers → Domain Services → Prisma → Postgres      │
│                         └── Domain Event → Broadcaster ────┼──► SSE clients
└───────────────────────────────────────────────────────────┘
```

Each task has a `version`, incremented on every write, used for stale-write detection (optimistic concurrency — a `PATCH` with an outdated version gets a `409`, not silently overwritten). Task dependencies are a real join table (`TaskDependency`), so cycle/duplicate-edge checks are simple graph queries, not array bookkeeping.

## Sync strategy

Mutations go through one path: **HTTP validation → business rules → Postgres commit → domain event → broadcast → SSE clients reconcile.** Events only fire after commit, so nothing goes out over the wire that didn't actually happen.

One `EventSource` per open project page, routed by an in-memory `Map<projectId, Set<subscriber>>`. Payloads are small and incremental — `task.updated` ships only the changed fields plus new version, not the whole task.

A client that echoes its own event back is handled for free by existing idempotency rules: updates only apply if `event.version > local.version`, creates/comments dedupe by id, deletes on a missing task are no-ops. On disconnect, the client just refetches on reconnect rather than replaying missed events — no durable event log.

## Scaling

Today's broadcaster is in-memory and single-process — it breaks across multiple server instances. The fix: publish domain events to shared pub/sub (Redis/NATS/Kafka); each instance forwards only to its own locally-connected SSE clients. For large projects: the API already keeps project/tasks/comments as separate endpoints (not one nested blob), so cursor pagination and virtualization can sit on top later.

## Technology choices

- **Next.js, one repo** — API and UI together; not worth a separate backend for this scope.
- **Postgres** — the data (projects → tasks → comments/dependencies) is relational; foreign keys and transactions fit.
- **Prisma** — generated types and tracked migrations over hand-written CRUD SQL; raw queries remain an escape hatch.
- **REST for mutations, SSE for updates** — traffic is one-directional (commands in, state out), and SSE fits that over plain HTTP without a protocol upgrade. WebSockets would only earn their cost if this grew live cursors or concurrent field editing.

## Tradeoffs

| Area | Today | Production version |
|---|---|---|
| Realtime fanout | In-memory, single process | Shared pub/sub across instances |
| Missed events | Reconnect and refetch | Durable event ids + replay |
| Conflict detection | Whole-task version | Field-level or CRDT-based merge |
| Auth | None — seeded users | Real authentication/authorization |
| Large datasets | No pagination/virtualization | Cursor pagination, virtualized lists, caching |
| Reopening a dependency | Doesn't cascade to dependents | Optional re-check on prerequisite reopen |
| Creating a project | API only, no UI form | Add the form |

Task-level (not field-level) conflict detection is the one most worth flagging: two edits to *different* fields on the same task can still collide. Chosen for simplicity and explainability over smarter auto-merge.
