# 08 — Live Comments

## 1. Purpose

This specification implements the remaining core collaborative Comment capability on top of the completed:

- Architecture Contract
- Application Bootstrap
- Domain & Data Model
- Project Management
- Task Management
- Dependencies & Status Rules
- Realtime Foundation
- Live Task Sync

The milestone adds:

- list Comments for a Task,
- create a Comment,
- associate Comment with a simulated User,
- display a Comment thread,
- publish `comment.created` after successful persistence,
- deliver new Comments to other clients viewing the same Project in near real-time.

The existing Project-scoped SSE connection must be reused.

Do not create a second EventSource connection for Comments.

---

## 2. Objective

At completion, this scenario must work:

```text
Browser A                           Browser B
Project X                           Project X
Task 42 open                        Task 42 open

A adds:
"API contract is ready."
        ↓
POST /api/tasks/42/comments
        ↓
PostgreSQL commit
        ↓
comment.created
        ↓
existing Project SSE stream
                                      ↓
                              Comment appears automatically
```

without Browser B refreshing.

---

## 3. Prerequisites

Do not begin until Live Task Sync is stable.

Before implementation, verify:

```bash
docker compose up -d db
docker compose ps
npm run verify:domain
npm run build
npm run lint
```

Also verify manually:

- Task create sync works,
- Task update sync works,
- Task delete sync works,
- same-client Task event echo is safe,
- reconnect/refetch works,
- Project isolation works.

If the existing Task ID validation bug still exists anywhere in Task or dependency routes, fix it before relying on those routes for Comment work.

---

## 4. Scope

### 4.1 In Scope

Implement:

- Comment service,
- Comment runtime validation,
- `GET /api/tasks/:taskId/comments`,
- `POST /api/tasks/:taskId/comments`,
- Comment thread UI,
- Comment composer UI,
- simulated author selection,
- `comment.created` event publishing,
- reuse of existing Project SSE connection,
- second-browser live Comment propagation,
- duplicate/self-origin event safety,
- reconnect convergence,
- Comment-specific verification.

### 4.2 Out of Scope

Do not implement:

- Comment editing,
- Comment deletion,
- threaded/nested replies,
- @mentions,
- notifications,
- activity feed,
- reactions,
- rich text editor,
- markdown renderer,
- presence,
- live cursors,
- collaborative text editing,
- WebSockets,
- Redis,
- NATS,
- Kafka,
- persistent event replay,
- authentication,
- authorization,
- optimistic UI,
- bonus features.

---

## 5. API Boundaries

Implement:

```text
GET  /api/tasks/:taskId/comments
POST /api/tasks/:taskId/comments
```

Do not add:

```text
PATCH /comments/:id
DELETE /comments/:id
```

Comment editing/deletion is outside the core requirement.

---

## 6. Comment Response Shape

Use a stable JSON representation equivalent to:

```json
{
  "id": "comment-uuid",
  "taskId": "task-uuid",
  "content": "The API contract is ready.",
  "author": {
    "id": "user-uuid",
    "name": "Ayushi"
  },
  "createdAt": "2026-08-24T20:00:00.000Z"
}
```

Do not expose:

- raw `authorId` without author data as the only client representation,
- full User records,
- Project objects,
- Task snapshots.

---

## 7. GET /api/tasks/:taskId/comments

### Responsibility

Return Comments belonging to one Task.

### Request

```http
GET /api/tasks/:taskId/comments
```

### Validation

- `taskId` must be a valid UUID,
- Task must exist.

### Success

```http
200 OK
```

Example:

```json
{
  "comments": [
    {
      "id": "comment-uuid",
      "taskId": "task-uuid",
      "content": "I will review the API contract.",
      "author": {
        "id": "user-uuid",
        "name": "Joaquin"
      },
      "createdAt": "2026-08-24T20:00:00.000Z"
    }
  ]
}
```

### Ordering

Return Comments in deterministic chronological order:

```text
createdAt ASC
```

### Empty state

Valid response:

```json
{
  "comments": []
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

---

## 8. POST /api/tasks/:taskId/comments

### Responsibility

Create one Comment for an existing Task.

### Request

```http
POST /api/tasks/:taskId/comments
Content-Type: application/json
```

Body:

```json
{
  "authorId": "user-uuid",
  "content": "The API contract is ready."
}
```

### Required fields

```text
authorId
content
```

### Validation

Validate at runtime:

- `taskId` is a valid UUID,
- Task exists,
- `authorId` is a valid UUID,
- User exists,
- `content` is a string,
- `content` remains non-empty after trimming.

Reasonable length protection is acceptable.

Do not add a rich-text schema.

### Normalization

Trim Comment content before persistence.

### Success

```http
201 Created
```

Example:

```json
{
  "comment": {
    "id": "comment-uuid",
    "taskId": "task-uuid",
    "content": "The API contract is ready.",
    "author": {
      "id": "user-uuid",
      "name": "Ayushi"
    },
    "createdAt": "2026-08-24T20:00:00.000Z"
  }
}
```

### Errors

Invalid request:

```http
400 Bad Request
```

Missing Task:

```http
404 Not Found
```

Unknown author:

```http
400 Bad Request
```

Suggested error:

```json
{
  "code": "INVALID_COMMENT_AUTHOR",
  "message": "Comment author does not exist."
}
```

---

## 9. Comment Service Layer

Keep Route Handlers thin.

Preferred flow:

```text
Route Handler
      ↓
Comment Service
      ↓
Prisma
      ↓
PostgreSQL
```

Recommended module:

```text
src/server/comments/comment.service.ts
```

Responsibilities equivalent to:

```ts
listTaskComments(taskId)
createComment(taskId, input)
```

The service should return the lightweight Comment representation including author details.

---

## 10. Validation Layer

Use a small runtime validation helper.

Conceptual input:

```ts
type CreateCommentInput = {
  authorId: string;
  content: string;
};
```

TypeScript types do not replace runtime validation.

Do not add a large validation framework solely for Comments.

---

## 11. Author Strategy

Authentication is intentionally out of scope.

Use the existing seeded Users:

```text
Ayushi
Carlos
Joaquin
```

The Comment composer must allow selecting which simulated User is posting.

Preferred UI:

```text
Comment as: [ Ayushi ▼ ]

[ Write a comment... ]

[ Add Comment ]
```

If a current "Viewing as" selector already exists, reuse it.

Do not build authentication.

---

## 12. Comment Thread UI

A Task should expose a simple Comment section.

Example:

```text
Comments

Joaquin · 8:42 PM
I will review the API contract.

Ayushi · 8:45 PM
The endpoint is ready.

--------------------------------
Comment as: Ayushi
[ Add a comment...          ]
[ Add Comment ]
```

Requirements:

- show author name,
- show content,
- show timestamp,
- preserve chronological order,
- show empty state,
- show loading/error states.

Do not build nested threads.

---

## 13. Comment Composer

The composer must:

- require non-empty content,
- require a valid simulated author,
- prevent duplicate submit while request is pending,
- show server validation errors,
- clear the text after successful creation.

Optimistic UI is not required.

Use:

```text
POST
  ↓
201
  ↓
same client updates from HTTP response
```

The same client may later receive the corresponding SSE event; it must not duplicate the Comment.

---

## 14. comment.created Event

After successful Comment persistence, publish:

```json
{
  "id": "event-uuid",
  "type": "comment.created",
  "projectId": "project-uuid",
  "entityId": "comment-uuid",
  "timestamp": "2026-08-24T20:00:00.000Z",
  "data": {
    "taskId": "task-uuid",
    "comment": {
      "id": "comment-uuid",
      "taskId": "task-uuid",
      "content": "The API contract is ready.",
      "author": {
        "id": "user-uuid",
        "name": "Ayushi"
      },
      "createdAt": "2026-08-24T20:00:00.000Z"
    }
  }
}
```

### Requirements

- publish only after database commit succeeds,
- `projectId` must come from authoritative Task data,
- event must remain small,
- include enough Comment data for receiving client to append without another fetch.

Do not send:

- entire Project,
- entire Task,
- entire Comment history.

---

## 15. Commit Before Broadcast

Required order:

```text
validate request
      ↓
load authoritative Task / Project scope
      ↓
persist Comment
      ↓
commit succeeds
      ↓
create comment.created event
      ↓
publish to Project broadcaster
      ↓
return 201
```

If Comment creation fails:

```text
NO comment.created event
```

---

## 16. Project Routing

The server must derive the Comment event's Project from:

```text
Comment → Task → projectId
```

Do not trust a browser-supplied `projectId`.

This prevents cross-Project event leakage.

---

## 17. Reuse Existing SSE Connection

The Project page already has:

```text
GET /api/projects/:projectId/events
```

Reuse it.

Do not add:

```text
/api/tasks/:taskId/comment-events
```

or a second EventSource.

One Project connection carries:

```text
task.created
task.updated
task.deleted
comment.created
```

This is the intended architecture.

---

## 18. Client Handling of comment.created

On incoming:

```text
comment.created
```

the client should:

1. inspect `taskId`,
2. if that Task's Comment thread is loaded/open, append the Comment,
3. deduplicate by Comment ID,
4. preserve chronological order.

If the Comment thread is not currently loaded:

- no immediate UI update is required,
- future opening/refetch will load authoritative data.

Do not maintain every Comment thread for every Task globally.

---

## 19. Same-Client Event Echo

The posting browser receives:

```text
POST response
```

and may also receive:

```text
comment.created SSE
```

Deduplicate by:

```text
comment.id
```

If Comment already exists locally:

```text
no-op
```

Do not add a client-origin ID solely for this.

---

## 20. Duplicate Event Safety

If the same `comment.created` event is received twice:

```text
Comment must appear once
```

Comment IDs provide the idempotency key.

---

## 21. Reconnect Behavior

Keep the established architecture:

```text
disconnect
   ↓
reconnect
   ↓
authoritative refetch
```

If Comments were created while the client was offline, the next Task Comment load/refetch must converge to PostgreSQL state.

Do not implement durable Comment event replay.

---

## 22. Large-Payload Requirement

Comment synchronization must stay incremental.

When one Comment is created, send:

```text
one comment.created event
```

Do not send:

```text
entire Project
all Tasks
all Comments
```

This preserves the challenge's large-project efficiency requirement.

---

## 23. Failure Behavior

### Invalid Comment

If request returns `400`:

```text
no event
```

### Missing Task

If request returns `404`:

```text
no event
```

### Invalid User

If request returns `400`:

```text
no event
```

### Database failure

If persistence fails:

```text
no event
```

### Broadcast failure after commit

PostgreSQL remains authoritative.

If Comment commits but in-memory broadcast fails:

- keep the Comment committed,
- log the broadcast failure,
- client recovery occurs through refetch/reconnect.

Do not roll back a committed Comment solely because in-memory fanout failed afterward.

---

## 24. Timestamp Behavior

Use the database/server `createdAt`.

Do not trust a browser timestamp as authoritative.

UI may format the timestamp for readability.

Keep the API value as ISO-8601.

---

## 25. Recommended Repository Shape

Approximate additions:

```text
src/
├── app/
│   └── api/
│       └── tasks/
│           └── [taskId]/
│               └── comments/
│                   └── route.ts
│
├── components/
│   └── comments/
│       ├── comment-thread.tsx
│       └── comment-composer.tsx
│
└── server/
    └── comments/
        ├── comment.service.ts
        └── comment.validation.ts
```

Existing realtime files should be reused.

Do not create a second broadcaster or EventSource abstraction.

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

### C — Obtain Task and User IDs

Use existing APIs/seed data.

Identify:

```text
Task ID
Ayushi User ID
Carlos User ID
```

### D — List Comments

```bash
curl -i \
  http://localhost:3000/api/tasks/<task-id>/comments
```

Expected:

```text
HTTP 200
```

with:

```json
{
  "comments": [...]
}
```

### E — Create Comment

```bash
curl -i \
  -X POST \
  http://localhost:3000/api/tasks/<task-id>/comments \
  -H 'Content-Type: application/json' \
  -d '{
    "authorId": "<user-id>",
    "content": "Live Comment verification"
  }'
```

Expected:

```text
HTTP 201
```

### F — Invalid Comment

Empty content:

```bash
curl -i \
  -X POST \
  http://localhost:3000/api/tasks/<task-id>/comments \
  -H 'Content-Type: application/json' \
  -d '{
    "authorId": "<user-id>",
    "content": "   "
  }'
```

Expected:

```text
HTTP 400
```

### G — Invalid Author

Use a valid-but-nonexistent User UUID.

Expected:

```text
HTTP 400
INVALID_COMMENT_AUTHOR
```

### H — Invalid Task ID

Expected:

```text
HTTP 400
```

### I — Missing Task

Valid nonexistent Task UUID:

```text
HTTP 404
```

---

## 27. Realtime Verification

### A — Two browsers

Open the same Project in:

```text
Browser A
Browser B
```

Open the same Task Comment thread.

### B — Create in Browser A

Post:

```text
"Realtime comment from Browser A"
```

Expected:

```text
Browser A shows it
Browser B shows it automatically
```

No refresh in Browser B.

### C — Verify event

Confirm SSE event:

```text
type = comment.created
projectId = current Project
entityId = Comment ID
data.taskId = current Task
```

The payload must include only the new Comment, not all Comments.

### D — Same-client echo

Verify Browser A does not show the Comment twice when its own SSE event returns.

### E — Project isolation

Open Browser B on another Project.

Create Comment in Project A.

Project B must not receive/apply the Comment.

### F — Failed mutation

Attempt invalid Comment creation.

Verify no `comment.created` event is emitted.

### G — Reconnect

Disconnect Browser B temporarily.

Create Comment in Browser A.

Reconnect Browser B.

Open/refetch the Task Comment thread.

Verify the missed Comment is present from PostgreSQL.

---

## 28. UI Verification

Verify:

1. open Project,
2. open/select a Task,
3. Comment thread loads,
4. seeded Comments appear if present,
5. empty state works,
6. choose simulated author,
7. create Comment,
8. Comment appears,
9. content input clears,
10. second browser sees Comment automatically,
11. duplicate Comment is not shown,
12. refresh preserves Comments,
13. timestamp/author render correctly.

---

## 29. Quality Verification

Run:

```bash
npm run verify:domain
npm run build
npm run lint
```

All must pass.

Existing functionality must still work:

- Projects,
- Tasks,
- assignees,
- dependencies,
- status rules,
- Live Task Sync.

---

## 30. Acceptance Criteria

### Comment API

- [ ] `GET /api/tasks/:taskId/comments` exists.
- [ ] valid Task returns Comments.
- [ ] empty Comment list returns `200`.
- [ ] invalid Task ID returns `400`.
- [ ] missing Task returns `404`.
- [ ] `POST /api/tasks/:taskId/comments` exists.
- [ ] valid Comment returns `201`.
- [ ] empty Comment content returns `400`.
- [ ] invalid author returns `400`.
- [ ] author relation resolves correctly.
- [ ] Comment timestamp is server/database generated.

### Persistence

- [ ] Comment persists in PostgreSQL.
- [ ] refresh preserves Comment.
- [ ] Comment resolves Task.
- [ ] Comment resolves author.
- [ ] Comment ordering is chronological.

### Realtime

- [ ] successful Comment creation publishes `comment.created`.
- [ ] failed Comment creation publishes no event.
- [ ] event Project ID is derived from authoritative Task data.
- [ ] existing Project SSE stream is reused.
- [ ] no second EventSource is created.
- [ ] Browser B receives Comment without refresh.
- [ ] same-client event echo does not duplicate Comment.
- [ ] duplicate event does not duplicate Comment.
- [ ] Project isolation works.
- [ ] reconnect/refetch recovers missed Comments.

### Payload Efficiency

- [ ] `comment.created` carries only the new lightweight Comment.
- [ ] no full Project payload.
- [ ] no full Task payload.
- [ ] no full Comment history.

### UI

- [ ] Comment thread exists.
- [ ] Comment composer exists.
- [ ] simulated author can be selected/reused.
- [ ] author name is shown.
- [ ] timestamp is shown.
- [ ] empty/loading/error states work.
- [ ] duplicate submit while pending is prevented.
- [ ] API errors are visible.

### Scope

- [ ] no Comment edit.
- [ ] no Comment delete.
- [ ] no nested replies.
- [ ] no @mentions.
- [ ] no notifications.
- [ ] no activity feed.
- [ ] no WebSockets.
- [ ] no Redis/NATS/Kafka.
- [ ] no persistent replay.
- [ ] no authentication.
- [ ] no bonus features.

### Quality

- [ ] Live Task Sync still works.
- [ ] Dependencies & Status Rules still work.
- [ ] Task Management still works.
- [ ] Project Management still works.
- [ ] domain verification passes.
- [ ] production build passes.
- [ ] lint/static checks pass.
- [ ] application remains runnable.

---

## 31. Definition of Done

Live Comments is complete when two clients viewing the same Task can demonstrate:

```text
Browser A creates Comment
      ↓
PostgreSQL commit
      ↓
comment.created
      ↓
existing Project SSE connection
      ↓
Browser B displays Comment
```

without refresh and without receiving an entire Project or Comment history.

At this point, the core challenge requirements are functionally present:

```text
Projects
Tasks
Dependencies
Status transitions
Comments
Near-real-time client synchronization
Cross-client consistency
Incremental update payloads
```

---

## 32. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "feat: add live task comments"
```

Do not combine final cleanup/documentation work into this commit.

---

## 33. Handoff: Reliability & End-to-End Hardening

After this milestone, do not add new product capabilities.

The next phase should focus on:

- verifying two-browser consistency,
- conflict UX,
- reconnect behavior,
- error handling,
- removal of development-only realtime test helpers if appropriate,
- cleanup of dead code,
- final end-to-end demo path,
- README architecture/tradeoff documentation.

No bonus feature should be added unless all core requirements are already stable.

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
docs/specs/08-live-comments.md
```

Prompt:

> Implement the **Live Comments** milestone defined in `docs/specs/08-live-comments.md`.
>
> Architecture, Application Bootstrap, Domain & Data Model, Project Management, Task Management, Dependencies & Status Rules, Realtime Foundation, and Live Task Sync are already complete. Preserve them.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract.
>
> Implement only:
> - Comment service and runtime validation,
> - `GET /api/tasks/:taskId/comments`,
> - `POST /api/tasks/:taskId/comments`,
> - Comment thread UI,
> - Comment composer UI,
> - simulated author selection/reuse,
> - `comment.created` publishing after successful persistence,
> - Project-scoped routing derived from authoritative Task data,
> - handling `comment.created` through the existing Project EventSource,
> - duplicate/self-origin Comment event safety,
> - reconnect/refetch convergence,
> - verification required by this specification.
>
> Reuse the existing Project-scoped SSE connection. Do not create a second EventSource or broadcaster.
>
> Do not implement Comment editing/deletion, nested replies, @mentions, notifications, activity feed, WebSockets, Redis, NATS, Kafka, persistent replay, authentication, optimistic UI, or bonus features.
>
> Preserve commit-before-broadcast ordering.
>
> Never publish `comment.created` for a failed Comment mutation.
>
> Do not send full Project, Task, or Comment-history payloads through SSE.
>
> Run every acceptance check in `08-live-comments.md`.
>
> At completion report:
> 1. files created or modified,
> 2. Comment endpoints implemented,
> 3. commands executed,
> 4. API verification results,
> 5. Comment persistence/author verification,
> 6. `comment.created` payload example,
> 7. two-browser realtime verification,
> 8. same-client duplicate-event verification,
> 9. Project-isolation verification,
> 10. reconnect verification,
> 11. build/lint/domain verification results,
> 12. any deviation from the specification,
> 13. any issue before Reliability & End-to-End Hardening begins.
>
> Do not silently redesign the architecture.
> Do not begin new product features.
