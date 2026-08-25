# 09 — Reliability & End-to-End Hardening

## 1. Purpose

This specification hardens the completed core system before final delivery.

No new product capability should be added.

Completed functionality already includes:

- Project Management
- Task Management
- Task assignments
- Dependencies
- Status rules
- Comments
- Project-scoped SSE
- Live Task Sync
- Live Comments
- Task versioning and stale-write rejection

This milestone focuses on making the system reliable, internally consistent, and predictable during the final demo.

Authoritative specifications:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
docs/specs/04-task-management.md
docs/specs/05-dependencies-status-rules.md
docs/specs/06-realtime-foundation.md
docs/specs/07-live-task-sync.md
docs/specs/08-live-comments.md
```

---

## 2. Objective

At completion, the application should survive the complete demo flow repeatedly without:

- invalid dynamic route IDs,
- stale UI state,
- duplicate realtime events,
- incorrect cross-project broadcasts,
- silent failed writes,
- broken reconnect behavior,
- raw Prisma errors,
- inconsistent Task versions,
- duplicate Comments,
- broken dependency rules.

The expected result is:

```text
core functionality
      ↓
repeatable two-browser verification
      ↓
fix all discovered defects
      ↓
build/lint/domain verification
      ↓
demo-ready application
```

---

## 3. Scope

### 3.1 In Scope

Implement only reliability and correctness work:

- audit all dynamic Next.js route parameters,
- fix remaining `Task ID is invalid` defects,
- verify UUID validation remains strict,
- verify Task version behavior,
- verify `409 VERSION_CONFLICT`,
- improve stale-data recovery,
- verify dependency validation,
- verify failed mutations do not emit realtime events,
- verify Project-scoped event isolation,
- verify duplicate/self-origin event safety,
- verify SSE reconnect/refetch convergence,
- verify Comment deduplication,
- verify Task create/update/delete synchronization,
- verify Comment synchronization,
- improve necessary loading/error states,
- remove dead/debug-only code,
- remove or production-guard development-only realtime test helpers,
- verify no giant Project payloads are sent,
- verify all core APIs return stable error shapes,
- run the complete end-to-end demo scenario,
- fix any core regression found during verification.

### 3.2 Out of Scope

Do not implement:

- new product features,
- authentication,
- authorization,
- notifications,
- presence,
- live cursors,
- activity feeds,
- @mentions,
- CRDT,
- Operational Transform,
- WebSockets,
- Redis,
- NATS,
- Kafka,
- persistent event log,
- durable replay,
- optimistic UI,
- virtual scrolling,
- pagination unless required to fix a core bug,
- AI features,
- Kanban/Gantt,
- analytics,
- integrations,
- bonus requirements.

If a new feature is not required to make the existing core system correct, do not add it.

---

## 4. Dynamic Route Parameter Audit

The application previously exhibited:

```text
Task ID is invalid
```

This milestone must audit every dynamic App Router route.

Inspect at minimum:

```text
/api/projects/[projectId]
/api/projects/[projectId]/tasks
/api/projects/[projectId]/events

/api/tasks/[taskId]
/api/tasks/[taskId]/dependencies
/api/tasks/[taskId]/dependencies/[dependsOnTaskId]
/api/tasks/[taskId]/comments
```

For current Next.js App Router route handlers, resolve asynchronous params before validation where required.

Conceptual pattern:

```ts
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
}
```

Do not weaken UUID validation.

Verify the frontend generates URLs containing the real entity UUID rather than:

```text
undefined
[object Object]
task.id
empty string
```

---

## 5. Task Version Consistency

Preserve the existing contract:

```text
Task version N
      ↓
successful PATCH
      ↓
Task version N + 1
```

Verify:

- every successful Task PATCH increments exactly once,
- rejected `400` does not increment,
- rejected `409` does not increment,
- rejected `422` does not increment,
- corresponding `task.updated` event uses the committed new version.

Stale request:

```text
client version < database version
```

must return:

```http
409 Conflict
```

with:

```json
{
  "code": "VERSION_CONFLICT",
  "message": "Task was modified by another client."
}
```

---

## 6. Conflict Recovery

When a client receives `409 VERSION_CONFLICT`:

```text
do not show save as successful
      ↓
display a clear stale-data message
      ↓
refetch authoritative Task state
```

Do not implement automatic merge.

Do not implement CRDT.

Correctness is preferred over sophisticated conflict resolution.

---

## 7. Dependency Correctness

Re-verify:

```text
self dependency             → rejected
cross-project dependency    → rejected
duplicate dependency        → rejected
dependency cycle            → rejected
```

Also verify:

```text
Task with incomplete dependency → cannot become DONE
```

Rejected completion must:

- leave status unchanged,
- leave version unchanged,
- publish no `task.updated` event.

Successful completion must:

- update status,
- increment version,
- publish one `task.updated` event.

---

## 8. Commit-Before-Broadcast Verification

For every realtime mutation:

```text
Task create
Task update
Task delete
Comment create
```

verify:

```text
database commit succeeds
      ↓
event publishes
```

Never:

```text
event publishes
      ↓
database write fails
```

Failed mutations must emit no product event.

---

## 9. Project Isolation

Verify realtime routing is Project-scoped.

Scenario:

```text
Browser A → Project A
Browser B → Project B
```

Mutating Project A must not update Project B.

Verify this for:

- `task.created`,
- `task.updated`,
- `task.deleted`,
- `comment.created`.

The server must route using authoritative Project IDs from persisted data.

Do not trust arbitrary browser-supplied Project IDs for fanout.

---

## 10. Same-Client Event Echo

The mutating browser may receive its own SSE event.

Verify this does not cause:

- duplicate Tasks,
- duplicate Comments,
- Task version regression,
- duplicate assignees,
- stale fields overwriting newer state.

Expected Task behavior:

```text
event.version <= local.version
      ↓
ignore
```

Expected Comment behavior:

```text
comment ID already exists
      ↓
ignore
```

Expected delete behavior:

```text
Task already absent
      ↓
no-op
```

---

## 11. Reconnect / Missed Event Recovery

SSE does not have durable replay in this take-home.

Required strategy:

```text
SSE disconnects
      ↓
events may be missed
      ↓
EventSource reconnects
      ↓
authoritative refetch
      ↓
UI converges to PostgreSQL
```

Verify this behavior with Tasks and Comments.

Do not implement persistent replay.

---

## 12. SSE Lifecycle

Verify:

- one EventSource per open Project,
- EventSource closes on unmount/navigation,
- reconnect does not create multiple simultaneous streams,
- heartbeat remains lightweight,
- disconnected subscribers are cleaned up,
- no visible subscriber leak occurs after repeated navigation.

---

## 13. Realtime Payload Efficiency

Inspect realtime payloads.

A one-field Task update should look conceptually like:

```json
{
  "type": "task.updated",
  "entityId": "task-id",
  "data": {
    "version": 8,
    "changes": {
      "status": "DONE"
    }
  }
}
```

It must not include:

- the entire Project,
- every Task,
- all Comments,
- large unrelated objects.

`comment.created` must contain only the new lightweight Comment.

---

## 14. API Error Audit

All core APIs should use stable responses equivalent to:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable explanation."
}
```

Audit at minimum:

```text
400 invalid request / UUID
404 missing entity
409 version/duplicate conflict
422 domain rule violation
500 unexpected failure
```

Do not expose:

- raw Prisma errors,
- SQL,
- stack traces,
- secrets,
- connection strings.

---

## 15. Loading and Error State Audit

Fix only states that make the core demo unreliable.

Verify:

- Project list loading,
- Project list error,
- empty Projects,
- Project not found,
- Task list loading,
- empty Tasks,
- Task mutation errors,
- `409` stale Task message,
- dependency rule error,
- Comment list loading,
- empty Comments,
- Comment creation error,
- SSE reconnect indicator if present.

Do not build a new design system.

---

## 16. Development-Only Realtime Helper

If Realtime Foundation added:

```text
system.test
```

or a development-only test endpoint:

- keep it guarded by `NODE_ENV !== "production"`, or
- remove it if no longer useful.

The final product UI must not depend on it.

Do not leave an unrestricted debug mutation endpoint exposed in production mode.

---

## 17. Dead Code / Duplicate File Cleanup

Remove only clearly unnecessary code.

Examples to inspect:

- duplicate verification `.js` and `.ts` scripts,
- unused realtime helpers,
- abandoned Task components,
- unused imports,
- dead validation helpers,
- stale debug logging.

Do not perform broad refactoring merely for aesthetics.

Reliability work should not destabilize completed features.

---

## 18. Database Verification

Existing domain verification must continue to pass.

Run:

```bash
npm run verify:domain
```

or the actual equivalent defined in `package.json`.

The verification must still confirm:

- seeded Users,
- Project,
- Tasks,
- assignees,
- Comments,
- dependencies,
- version defaults.

---

## 19. Complete Two-Browser Demo Scenario

This is the primary acceptance scenario.

### Setup

Open the same Project in two browser windows:

```text
Browser A → Ayushi
Browser B → Carlos
```

### Scenario

1. Browser A creates a Task.
2. Browser B sees it without refresh.
3. Browser A edits title/priority/status.
4. Browser B sees changes without refresh.
5. Browser B edits the same Task using an up-to-date version.
6. Browser A sees the update.
7. Trigger a stale version attempt and verify `409`.
8. Add a dependency.
9. Attempt to mark dependent Task DONE while prerequisite is incomplete.
10. Verify `422` and no realtime false update.
11. Complete prerequisite.
12. Complete dependent Task.
13. Browser B sees status changes.
14. Browser A adds a Comment.
15. Browser B sees the Comment without refresh.
16. Browser B adds a Comment.
17. Browser A sees it.
18. Delete a Task.
19. Other browser removes it automatically.
20. Refresh both browsers.
21. Both match PostgreSQL state.

Repeat this scenario at least twice.

---

## 20. Reconnect Demo Scenario

1. Open Project in Browser A and Browser B.
2. Disconnect Browser B from the server/network if practical.
3. In Browser A:
   - create/update a Task,
   - create a Comment.
4. Reconnect Browser B.
5. Verify Browser B refetches and converges to current state.

No event replay is expected.

---

## 21. Failure Scenario

Verify failed writes do not create false realtime state.

At minimum test:

### Stale write

```text
PATCH with stale version
      ↓
409
      ↓
no task.updated event
```

### Dependency rule

```text
Task → DONE with incomplete dependency
      ↓
422
      ↓
no task.updated event
```

### Invalid Comment

```text
POST empty Comment
      ↓
400
      ↓
no comment.created event
```

---

## 22. Regression Verification

After all fixes, verify existing functionality:

### Projects

- list,
- create,
- open,
- refresh persistence.

### Tasks

- list,
- create,
- edit,
- delete,
- assignees,
- tags,
- customFields API behavior,
- versioning.

### Dependencies

- add,
- remove,
- validation,
- status rules.

### Comments

- list,
- create,
- author,
- persistence.

### Realtime

- Task create/update/delete,
- Comment create,
- Project isolation,
- reconnect.

---

## 23. Quality Commands

Run:

```bash
npm run build
npm run lint
npm run verify:domain
```

All must pass.

Also run any project-specific verification scripts already present.

Do not introduce a large test framework if none exists solely for this milestone.

Small targeted tests/scripts are acceptable if they materially improve confidence.

---

## 24. Acceptance Criteria

### Dynamic Routes

- [ ] valid Project IDs work.
- [ ] valid Task IDs work.
- [ ] valid dependency IDs work.
- [ ] Comment Task IDs work.
- [ ] invalid UUIDs still return `400`.
- [ ] no valid Task edit returns "Task ID is invalid".
- [ ] frontend requests contain real UUIDs.

### Versioning

- [ ] successful Task PATCH increments version exactly once.
- [ ] stale Task PATCH returns `409`.
- [ ] stale Task PATCH does not mutate data.
- [ ] stale Task PATCH publishes no event.
- [ ] `422` domain rejection does not increment version.

### Dependencies

- [ ] self dependency rejected.
- [ ] cross-Project dependency rejected.
- [ ] duplicate dependency rejected.
- [ ] cycles rejected.
- [ ] incomplete dependencies block DONE.
- [ ] successful completion emits correct Task update.

### Realtime

- [ ] Task create syncs across two browsers.
- [ ] Task update syncs across two browsers.
- [ ] Task delete syncs across two browsers.
- [ ] Comment create syncs across two browsers.
- [ ] same-client echo is safe.
- [ ] duplicate events are safe.
- [ ] Project isolation works.
- [ ] failed mutations publish no product event.
- [ ] reconnect/refetch converges state.
- [ ] one EventSource exists per open Project.

### Payload Efficiency

- [ ] no Task event sends entire Project.
- [ ] no Comment event sends full history.
- [ ] update events contain incremental changes.

### Errors

- [ ] APIs return stable `{ code, message }` responses.
- [ ] no raw Prisma errors exposed.
- [ ] UI displays core errors clearly.

### Cleanup

- [ ] production debug/test endpoints are removed or guarded.
- [ ] obvious dead code removed.
- [ ] no unnecessary refactor introduced.

### Quality

- [ ] Project Management works.
- [ ] Task Management works.
- [ ] Dependencies & Status Rules work.
- [ ] Live Task Sync works.
- [ ] Live Comments works.
- [ ] domain verification passes.
- [ ] production build passes.
- [ ] lint/static checks pass.
- [ ] application remains runnable.

---

## 25. Definition of Done

Reliability & End-to-End Hardening is complete when the complete two-browser demo can be run repeatedly without a blocking defect.

The system should clearly demonstrate:

```text
correct persistence
+
valid domain rules
+
version-based stale-write protection
+
near-real-time Task sync
+
near-real-time Comment sync
+
Project-scoped isolation
+
reconnect convergence
+
incremental payloads
```

No new feature is required.

---

## 26. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "fix: harden collaborative task workflows"
```

Do not combine final README/video content unless the changes are tiny and directly related to verification.

---

## 27. Handoff: Delivery

After this milestone, stop changing product behavior unless a final critical bug is found.

The final milestone should focus on:

- README,
- architecture decisions,
- sync strategy,
- scaling explanation,
- tradeoffs,
- setup instructions,
- final repository cleanup,
- architecture diagram if useful,
- walkthrough/demo script,
- video preparation.

---

## 28. Agent Implementation Prompt

Use this specification with all existing specs through:

```text
docs/specs/09-reliability-hardening.md
```

Prompt:

> Implement the **Reliability & End-to-End Hardening** milestone defined in `docs/specs/09-reliability-hardening.md`.
>
> All core product milestones are already implemented. Do not add new product features.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract.
>
> Focus only on:
> - auditing/fixing dynamic Next.js route params,
> - resolving any remaining "Task ID is invalid" defects without weakening UUID validation,
> - verifying Task version and `409 VERSION_CONFLICT` behavior,
> - improving stale-state refetch behavior,
> - verifying dependency/status rules,
> - ensuring failed mutations emit no realtime event,
> - verifying Project-scoped realtime isolation,
> - verifying duplicate/self-origin event safety,
> - verifying SSE disconnect/reconnect/refetch convergence,
> - verifying Comment deduplication,
> - auditing incremental realtime payloads,
> - cleaning production-unsafe dev/test realtime helpers,
> - fixing only necessary loading/error states,
> - removing clearly dead/debug-only code,
> - running the complete two-browser demo and fixing any core regression found.
>
> Do NOT implement authentication, WebSockets, Redis, NATS, Kafka, CRDT, Operational Transform, notifications, presence, @mentions, activity feeds, optimistic UI, AI features, pagination, virtual scrolling, or other bonus capabilities.
>
> Preserve the existing architecture and API contracts unless a verified correctness defect requires the smallest compatible correction.
>
> Run every acceptance check in `09-reliability-hardening.md`.
>
> At completion report:
> 1. root causes of defects found,
> 2. files created or modified,
> 3. dynamic-route audit results,
> 4. Task ID fix verification,
> 5. version/conflict verification,
> 6. dependency/status-rule verification,
> 7. Task realtime verification,
> 8. Comment realtime verification,
> 9. failed-mutation/no-event verification,
> 10. Project-isolation verification,
> 11. reconnect/refetch verification,
> 12. payload-efficiency findings,
> 13. cleanup performed,
> 14. build/lint/domain verification results,
> 15. any remaining blocker before final Delivery.
>
> Do not silently redesign the architecture.
> Do not begin new product features.
