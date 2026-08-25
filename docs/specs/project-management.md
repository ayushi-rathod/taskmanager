# 03 — Project Management

## 1. Purpose

This specification implements the first user-facing vertical slice on top of the completed architecture, application bootstrap, and domain/data model.

The milestone adds only **Project Management**:

- list projects,
- create a project,
- open a project,
- load persisted project details.

This is the first end-to-end product flow:

```text
React UI
   ↓
REST API
   ↓
Project service
   ↓
Prisma
   ↓
PostgreSQL
```

The implementation must remain intentionally small.

Tasks, comments, dependencies, realtime synchronization, conflict handling, and other later features must not be implemented here.

The following specifications remain authoritative:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
```

---

## 2. Objective

At completion, a user should be able to:

```text
open the application
      ↓
see persisted projects
      ↓
create a project
      ↓
see the new project in the list
      ↓
open the project
      ↓
see its persisted details
      ↓
refresh the browser
      ↓
see the same project loaded from PostgreSQL
```

This milestone proves the first complete application path without introducing Task Management yet.

---

## 3. Prerequisites

Do not begin until the Domain & Data Model milestone is complete.

The repository should already have:

- Next.js App Router
- TypeScript
- PostgreSQL running through Docker Compose
- Prisma
- reusable Prisma client
- committed domain migration
- Project model
- deterministic seed data
- verified database relationships

Before implementation, confirm:

```bash
docker compose up -d db
docker compose ps
npm run db:generate
npm run verify:domain
```

Use the actual verification command defined in `package.json` if it differs.

---

## 4. Scope

### 4.1 In Scope

Implement:

- project server/service functions,
- project request validation,
- `GET /api/projects`,
- `POST /api/projects`,
- `GET /api/projects/:projectId`,
- project list UI,
- create-project UI,
- project detail page,
- loading/error/empty states needed for this flow,
- minimal project-specific verification,
- README updates only if setup or usage instructions materially change.

### 4.2 Out of Scope

Do not implement:

- project update,
- project delete,
- task APIs,
- task UI,
- comments,
- task assignments,
- dependencies,
- status transitions,
- SSE,
- realtime events,
- event broadcaster,
- conflict/version handling,
- authentication,
- authorization,
- current-user selector,
- pagination,
- search,
- filters,
- Redis / NATS / Kafka,
- optimistic UI,
- bonus features.

Do not add placeholder implementations for later milestones.

---

## 5. API Contract

The project API must expose exactly these core operations:

```text
GET  /api/projects
POST /api/projects
GET  /api/projects/:projectId
```

Project responses must contain project-level data only.

Do not embed:

- tasks,
- comments,
- dependencies,
- assignments.

This preserves the architecture's large-payload strategy.

---

## 6. Project Response Shape

Use a stable JSON representation equivalent to:

```json
{
  "id": "uuid",
  "name": "HappyRobot Demo",
  "description": "Collaborative task management demo",
  "metadata": {},
  "createdAt": "2026-08-23T20:00:00.000Z",
  "updatedAt": "2026-08-23T20:00:00.000Z"
}
```

Dates should serialize as ISO-8601 strings in JSON responses.

Do not expose Prisma-specific implementation details to the client.

---

## 7. GET /api/projects

### Responsibility

Return the persisted projects available in the system.

### Request

```http
GET /api/projects
```

No query parameters are required in this milestone.

### Success

```http
200 OK
```

Example:

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "HappyRobot Demo",
      "description": "Collaborative task management demo",
      "metadata": {},
      "createdAt": "2026-08-23T20:00:00.000Z",
      "updatedAt": "2026-08-23T20:00:00.000Z"
    }
  ]
}
```

### Ordering

Return projects in deterministic order.

Recommended:

```text
createdAt DESC
```

Newest projects appear first.

### Empty state

An empty database is valid:

```json
{
  "projects": []
}
```

Do not return `404` for an empty project list.

---

## 8. POST /api/projects

### Responsibility

Validate the request and create one Project in PostgreSQL.

### Request

```http
POST /api/projects
Content-Type: application/json
```

Supported body:

```json
{
  "name": "Realtime Platform",
  "description": "Core collaboration project",
  "metadata": {
    "source": "take-home"
  }
}
```

### Required field

```text
name
```

### Optional fields

```text
description
metadata
```

Defaults:

```text
description → null
metadata    → {}
```

### Validation

At minimum:

- request body must be valid JSON,
- `name` must be a string,
- `name` must remain non-empty after trimming,
- `description`, when supplied, must be a string or `null`,
- `metadata`, when supplied, must be a JSON object.

Do not accept an array as project metadata.

Reasonable defensive length limits may be added, but do not build an elaborate validation framework.

Do not add a new validation dependency solely for this milestone unless one already exists.

Simple, readable validation is preferred.

### Normalization

Trim project name before persistence.

Description may also be trimmed if implemented consistently.

### Success

```http
201 Created
```

Example:

```json
{
  "project": {
    "id": "uuid",
    "name": "Realtime Platform",
    "description": "Core collaboration project",
    "metadata": {
      "source": "take-home"
    },
    "createdAt": "2026-08-23T20:00:00.000Z",
    "updatedAt": "2026-08-23T20:00:00.000Z"
  }
}
```

### Validation failure

Return:

```http
400 Bad Request
```

Use the architecture error shape:

```json
{
  "code": "INVALID_PROJECT",
  "message": "Project name is required."
}
```

Do not leak Prisma/database error objects to the client.

---

## 9. GET /api/projects/:projectId

### Responsibility

Return one Project by ID.

### Request

```http
GET /api/projects/:projectId
```

### Success

```http
200 OK
```

Example:

```json
{
  "project": {
    "id": "uuid",
    "name": "HappyRobot Demo",
    "description": "Collaborative task management demo",
    "metadata": {},
    "createdAt": "2026-08-23T20:00:00.000Z",
    "updatedAt": "2026-08-23T20:00:00.000Z"
  }
}
```

### Missing project

Return:

```http
404 Not Found
```

Example:

```json
{
  "code": "PROJECT_NOT_FOUND",
  "message": "Project not found."
}
```

### Invalid identifier

If the provided identifier cannot represent a valid Project identifier, return:

```http
400 Bad Request
```

with a stable error response rather than exposing a Prisma error.

---

## 10. Error Semantics

Use the architecture-wide error shape:

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
| invalid project ID | 400 |
| project not found | 404 |
| unexpected database/server failure | 500 |

Do not introduce project-specific status conventions that conflict with `00-architecture.md`.

Server logs may include diagnostic details.

Client responses must not expose stack traces, database credentials, or raw Prisma internals.

---

## 11. Project Service Layer

Route handlers should remain thin.

Preferred dependency direction:

```text
Route Handler
     ↓
Project Service
     ↓
Prisma
     ↓
PostgreSQL
```

Create a small server-side module, for example:

```text
src/server/projects/project.service.ts
```

It should own database operations equivalent to:

```ts
listProjects()
getProjectById(projectId)
createProject(input)
```

The exact exported names may vary slightly, but responsibilities must remain clear.

### Service responsibilities

The service may:

- query Prisma,
- create Project rows,
- return project domain data.

### Route responsibilities

Routes should:

- parse HTTP requests,
- validate request shape,
- map expected failures to HTTP responses,
- call the project service.

Do not put all Prisma calls directly into route handlers.

Do not create a repository layer merely for ceremony.

One service layer is sufficient.

---

## 12. Request Validation

Keep validation small and local.

A helper may be created, for example:

```text
src/lib/validation/projects.ts
```

or:

```text
src/server/projects/project.validation.ts
```

Do not introduce a large schema-validation architecture.

The project creation input should conceptually be:

```ts
type CreateProjectInput = {
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
};
```

The API should never trust TypeScript types as runtime validation.

Validate incoming JSON at runtime.

---

## 13. API Route Structure

Use Next.js App Router Route Handlers.

Expected shape:

```text
src/app/api/projects/
├── route.ts
└── [projectId]/
    └── route.ts
```

Responsibilities:

```text
/api/projects/route.ts
   GET
   POST

/api/projects/[projectId]/route.ts
   GET
```

Do not add task routes.

---

## 14. Frontend Route Structure

Use:

```text
/
```

for the project list/create experience.

Use:

```text
/projects/[projectId]
```

for the project detail page.

Expected approximate structure:

```text
src/app/
├── page.tsx
└── projects/
    └── [projectId]/
        └── page.tsx
```

Components may live under:

```text
src/components/projects/
```

Keep the number of components proportional to the feature.

---

## 15. Project List UI

The root page should become the minimal Projects screen.

It must show:

- application title,
- create-project form,
- persisted project list.

Example conceptual UI:

```text
Collaborative Task Manager

Create Project
[ Project name                    ]
[ Description                     ]
[ Create project ]

Projects

HappyRobot Demo
Collaborative task management demo
Open →

Realtime Platform
Core collaboration project
Open →
```

Styling should be clean and usable, but product-polish work is not the purpose of this milestone.

Do not build a dashboard framework.

---

## 16. Create Project UI

The form must support:

```text
name
description
```

`metadata` support is required at the API/database level but does not need an editor in the UI.

On submit:

```text
form
 ↓
POST /api/projects
 ↓
201 response
 ↓
update/refetch project list
 ↓
show created project
```

For this milestone, a simple refetch after successful creation is acceptable.

Optimistic UI is explicitly unnecessary.

### UI behavior

- disable or prevent obviously empty-name submission,
- show API validation error if creation fails,
- prevent accidental double submission while request is in progress,
- clear the form after successful creation.

Do not implement a complex form library solely for this screen.

---

## 17. Project Detail Page

Opening a project should navigate to:

```text
/projects/<projectId>
```

The detail page must load the project from:

```text
GET /api/projects/:projectId
```

and display at minimum:

- name,
- description,
- metadata only if useful,
- a clear way back to the project list.

Example:

```text
← Projects

HappyRobot Demo

Collaborative task management demo

Tasks
Task Management will be implemented in the next milestone.
```

A small neutral placeholder for the future task area is acceptable.

Do not implement fake task data or task CRUD.

---

## 18. Client Data Strategy

Keep client state simple.

Allowed approaches include:

- local React state + `fetch`,
- small custom hooks using `fetch`.

Do not introduce:

- Redux,
- Zustand,
- Apollo Client,
- React Query/TanStack Query

solely for this milestone.

If a data library already exists from prior implementation, do not add a second one.

The architecture deliberately favors minimal state management.

---

## 19. Loading, Empty, and Error States

Implement only the states necessary for a functional vertical slice.

### Project list loading

Show a simple loading state while projects are requested.

### Empty project list

Show something equivalent to:

```text
No projects yet. Create your first project.
```

### List/API failure

Show a visible error with an option to retry if practical.

### Project detail loading

Show a simple loading indicator while the project is fetched.

### Project not found

Display a useful not-found state for `404`.

Do not build a generic notification/toast framework unless one already exists.

---

## 20. Large-Payload Constraint

The source challenge states that Project payloads may eventually become large.

This milestone must preserve that architectural direction.

Therefore:

```text
GET /api/projects
```

returns project-level fields only.

And:

```text
GET /api/projects/:projectId
```

returns project-level fields only.

Do not include:

```text
tasks: [...]
comments: [...]
dependencies: [...]
```

inside project API responses.

Later Task Management will use:

```text
GET /api/projects/:projectId/tasks
```

as a separate resource boundary.

---

## 21. No Realtime Yet

Project creation does not need to propagate live to a second browser in this milestone.

Do not implement:

```text
SSE
EventSource
project.created events
event broadcaster
WebSockets
```

Realtime infrastructure begins in a later Collaboration milestone.

For now, the successful flow is conventional request/response:

```text
Client
  ↓ POST
Server
  ↓
PostgreSQL
  ↓
201
Client
  ↓
refetch/list update
```

---

## 22. Recommended Repository Changes

After this milestone, the relevant structure should approximately be:

```text
src/
├── app/
│   ├── api/
│   │   ├── health/
│   │   │   └── route.ts
│   │   └── projects/
│   │       ├── route.ts
│   │       └── [projectId]/
│   │           └── route.ts
│   │
│   ├── projects/
│   │   └── [projectId]/
│   │       └── page.tsx
│   │
│   └── page.tsx
│
├── components/
│   └── projects/
│       ├── project-list.tsx
│       └── create-project-form.tsx
│
├── lib/
│   └── db.ts
│
└── server/
    └── projects/
        ├── project.service.ts
        └── project.validation.ts
```

Exact component filenames may differ.

Do not create abstractions that are unused.

---

## 23. Verification Procedure

Run from repository root.

### Step A — Infrastructure

```bash
docker compose up -d db
docker compose ps
```

Database must be running.

---

### Step B — Existing Domain Verification

Run:

```bash
npm run verify:domain
```

or the actual domain verification script already defined in `package.json`.

It must continue to pass.

---

### Step C — Start Application

```bash
npm run dev
```

Application must start successfully.

---

### Step D — Verify Project List API

Run:

```bash
curl -i http://localhost:3000/api/projects
```

Expected:

```text
HTTP 200
```

with:

```json
{
  "projects": [...]
}
```

The seeded `HappyRobot Demo` project should appear if the seed is loaded.

---

### Step E — Verify Create Project API

Run a request equivalent to:

```bash
curl -i \
  -X POST http://localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "API Created Project",
    "description": "Created during Project Management verification"
  }'
```

Expected:

```text
HTTP 201
```

The returned project must have:

- UUID ID,
- normalized name,
- description,
- metadata,
- timestamps.

---

### Step F — Verify Validation

Run:

```bash
curl -i \
  -X POST http://localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"   "}'
```

Expected:

```text
HTTP 400
```

with a stable JSON error.

Also verify malformed/invalid project creation input is not persisted.

---

### Step G — Verify Project Detail API

Using a real project ID:

```bash
curl -i http://localhost:3000/api/projects/<project-id>
```

Expected:

```text
HTTP 200
```

and the correct Project.

Using a valid-but-nonexistent UUID:

```bash
curl -i http://localhost:3000/api/projects/00000000-0000-0000-0000-000000000000
```

Expected:

```text
HTTP 404
```

Using a clearly invalid ID should produce:

```text
HTTP 400
```

rather than a raw Prisma failure.

---

### Step H — Verify UI

Open:

```text
http://localhost:3000
```

Confirm:

1. seeded projects render,
2. project creation succeeds,
3. newly created project appears,
4. clicking a project opens `/projects/:projectId`,
5. project details render,
6. browser refresh preserves the project because it is loaded from PostgreSQL,
7. empty/error states do not break the page.

---

### Step I — Build / Static Checks

Run:

```bash
npm run build
npm run lint
```

Both must succeed.

---

## 24. Acceptance Criteria

### API

- [ ] `GET /api/projects` exists.
- [ ] `GET /api/projects` returns `200`.
- [ ] project list is deterministic.
- [ ] `POST /api/projects` exists.
- [ ] valid project creation returns `201`.
- [ ] empty/invalid name returns `400`.
- [ ] metadata is accepted as an object.
- [ ] invalid metadata is rejected.
- [ ] `GET /api/projects/:projectId` exists.
- [ ] existing project returns `200`.
- [ ] nonexistent project returns `404`.
- [ ] invalid ID returns `400`.
- [ ] API errors use stable `{ code, message }` responses.
- [ ] raw Prisma errors are not exposed.

### Architecture

- [ ] Route handlers remain thin.
- [ ] Project data access lives in a server/service module.
- [ ] Prisma remains the database access layer.
- [ ] Project API responses do not embed tasks/comments/dependencies.
- [ ] no repository abstraction was added without need.
- [ ] no realtime infrastructure was added.

### UI

- [ ] root page lists persisted projects.
- [ ] empty state is handled.
- [ ] create-project form exists.
- [ ] creation failure is visible.
- [ ] successful creation updates/refetches the list.
- [ ] duplicate submit while pending is prevented.
- [ ] project can be opened.
- [ ] project detail page loads persisted data.
- [ ] project not-found state is handled.
- [ ] browser refresh still loads persisted project.

### Scope

- [ ] no Task Management was implemented.
- [ ] no Comments were implemented.
- [ ] no Dependencies were implemented.
- [ ] no SSE/EventSource was implemented.
- [ ] no version-conflict behavior was implemented.
- [ ] no authentication was implemented.
- [ ] no bonus feature was implemented.

### Quality

- [ ] existing domain verification still passes.
- [ ] production build succeeds.
- [ ] lint/static checks succeed.
- [ ] application remains runnable.

---

## 25. Definition of Done

Project Management is complete when a reviewer can demonstrate:

```text
Open app
   ↓
See persisted projects
   ↓
Create project
   ↓
Project persists to PostgreSQL
   ↓
Open project
   ↓
Refresh
   ↓
Project still loads correctly
```

and the implementation clearly follows:

```text
UI
 ↓
REST API
 ↓
Project service
 ↓
Prisma
 ↓
PostgreSQL
```

No Task Management or realtime behavior is required for this milestone.

---

## 26. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "feat: add project management"
```

Do not combine Task Management work into this commit.

---

## 27. Handoff: Task Management

Do not begin Task Management until Project Management passes its acceptance criteria.

The next specification will introduce:

```text
GET    /api/projects/:projectId/tasks
POST   /api/projects/:projectId/tasks
GET    /api/tasks/:taskId
PATCH  /api/tasks/:taskId
DELETE /api/tasks/:taskId
```

plus the minimal task UI inside the project page.

It will reuse the existing Project and Task database models rather than redesign them.

Dependencies, realtime synchronization, and conflict/version enforcement remain separate later milestones.

---

## 28. Agent Implementation Prompt

Use this specification together with:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
docs/specs/03-project-management.md
```

Prompt:

> Implement the **Project Management** milestone defined in `docs/specs/03-project-management.md`.
>
> Architecture, Application Bootstrap, and Domain & Data Model are already complete. Preserve them.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract.
>
> Implement only:
> - the project service layer,
> - runtime request validation,
> - `GET /api/projects`,
> - `POST /api/projects`,
> - `GET /api/projects/:projectId`,
> - the minimal project list/create/detail UI,
> - required loading/error/empty states,
> - verification required by this specification.
>
> Do not implement Task Management, Comments, Dependencies, SSE, realtime events, conflict/version behavior, authentication, or any bonus feature.
>
> Keep project API responses project-only; do not embed tasks, comments, assignments, or dependencies.
>
> Keep route handlers thin and use the existing Prisma client through a small Project service.
>
> Run all acceptance checks before finishing, including:
> - existing domain verification,
> - project list/create/detail API checks,
> - invalid-input and not-found behavior,
> - production build,
> - lint/static checks.
>
> At completion report:
> 1. files created or modified,
> 2. API endpoints implemented,
> 3. commands executed,
> 4. API verification results,
> 5. UI verification results,
> 6. build/lint results,
> 7. any deviation from the specification,
> 8. any issue that should be resolved before Task Management begins.
>
> Do not silently redesign the architecture.
> Do not begin the Task Management milestone.
