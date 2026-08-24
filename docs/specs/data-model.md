# 02 — Domain & Data Model

## 1. Purpose

This specification implements the persistent domain model defined by [`00-architecture.md`](./00-architecture.md) on top of the application foundation established by [`01-application-bootstrap.md`](./01-application-bootstrap.md).

The purpose of this milestone is to make the core domain **real in PostgreSQL** before APIs, UI, realtime synchronization, or business workflows are added.

At completion, the database must represent:

- Projects
- simulated Users
- Tasks
- task assignees
- Comments
- task dependencies
- task status
- task priority
- task versioning
- project metadata
- task tags
- task custom fields

This milestone is database-focused.

It must **not** implement REST APIs, UI features, SSE, event broadcasting, conflict responses, or dependency/status business-rule enforcement.

The architecture contract remains authoritative.

---

## 2. Objective

At completion, a developer should be able to:

```text
start PostgreSQL
      ↓
apply committed Prisma migrations
      ↓
generate Prisma Client
      ↓
run the database seed
      ↓
query the seeded domain graph
      ↓
verify Projects / Tasks / Users /
Assignments / Comments / Dependencies
```

The result should be a clean relational foundation that later implementation milestones can build on without redesigning the database.

---

## 3. Prerequisites

Do not begin this implementation until Application Bootstrap is functional.

The following must already exist:

- Next.js App Router application
- TypeScript
- PostgreSQL
- Docker Compose
- Prisma
- `DATABASE_URL`
- reusable Prisma client in `src/lib/db.ts`
- working database connectivity

Expected verification before implementation:

```bash
docker compose up -d db
docker compose ps
npx prisma generate
```

The database-backed health check from Application Bootstrap should be healthy before this milestone is considered ready to implement.

---

## 4. Scope

### 4.1 In Scope

Implement:

- Prisma enums
- Prisma domain models
- relations
- foreign keys
- composite keys / uniqueness
- essential indexes
- deletion behavior
- initial domain migration
- deterministic development seed data
- database-level verification
- minimal README updates for migration/seed commands

### 4.2 Out of Scope

Do not implement:

- project REST endpoints
- task REST endpoints
- comment REST endpoints
- dependency REST endpoints
- React project/task/comment UI
- SSE endpoints
- realtime event types
- event broadcaster
- task version conflict handling
- `409 Conflict`
- dependency completion validation
- self-dependency validation in service code
- dependency cycle detection
- cross-project dependency validation
- authentication
- authorization
- optimistic UI
- Redis / NATS / Kafka
- pagination
- search
- filtering
- bonus features

The schema should support later milestones, but this milestone must not build them.

---

## 5. Source Model Mapping

The challenge describes:

```text
Projects
- id
- name
- description
- metadata

Tasks
- id
- projectId
- title
- status
- assignedTo[]
- configuration:
  - priority
  - description
  - tags[]
  - customFields
- dependencies[]

Comments
- id
- taskId
- content
- author
- timestamp
```

The relational implementation intentionally maps that conceptual model as follows:

```text
assignedTo[]
        ↓
TaskAssignee join table

dependencies[]
        ↓
TaskDependency self-relation join table

configuration.priority
        ↓
Task.priority

configuration.description
        ↓
Task.description

configuration.tags[]
        ↓
Task.tags

configuration.customFields
        ↓
Task.customFields

Comment.author
        ↓
Comment.authorId → User

Comment.timestamp
        ↓
Comment.createdAt
```

This flattening is intentional.

Do not create one large JSON `configuration` column for the entire task configuration.

---

## 6. Identifier Strategy

Use UUID identifiers for persisted entities.

Recommended Prisma shape:

```prisma
id String @id @default(uuid()) @db.Uuid
```

Use UUIDs for:

- Project
- User
- Task
- Comment

Foreign-key fields referencing those models should also use:

```prisma
@db.Uuid
```

Join tables use composite primary keys rather than separate synthetic IDs.

---

## 7. Enums

### 7.1 TaskStatus

Define:

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}
```

Default:

```text
TODO
```

No workflow engine is required.

Status business rules are implemented in a later milestone.

---

### 7.2 TaskPriority

Define:

```prisma
enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}
```

Default:

```text
MEDIUM
```

---

## 8. Project Model

Required conceptual shape:

```text
Project
- id
- name
- description
- metadata
- createdAt
- updatedAt
```

Recommended Prisma design:

```prisma
model Project {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  description String?
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tasks       Task[]
}
```

### Decisions

- `name` is required.
- `description` is optional.
- `metadata` is JSON and defaults to an empty object.
- Project names are **not** required to be globally unique.
- Tasks belong to exactly one project.

Do not store nested task data inside `metadata`.

---

## 9. User Model

Authentication is intentionally not implemented.

Users exist only so task assignments and comment authors have proper relations.

Required conceptual shape:

```text
User
- id
- name
```

Recommended Prisma design:

```prisma
model User {
  id          String         @id @default(uuid()) @db.Uuid
  name        String         @unique
  assignments TaskAssignee[]
  comments    Comment[]
}
```

### Decisions

- `name` is unique for the take-home demo.
- No email is required.
- No password is required.
- No authentication fields are required.
- No role/permission model is required.
- User CRUD is not required.

Seed at least:

```text
Ayushi
Carlos
Joaquin
```

---

## 10. Task Model

Required conceptual shape:

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

Recommended Prisma design:

```prisma
model Task {
  id           String       @id @default(uuid()) @db.Uuid
  projectId    String       @db.Uuid
  title        String
  status       TaskStatus   @default(TODO)
  priority     TaskPriority @default(MEDIUM)
  description  String?
  tags         String[]     @default([])
  customFields Json         @default("{}")
  version      Int          @default(1)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  project      Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignees    TaskAssignee[]
  comments     Comment[]
  dependencies TaskDependency[] @relation("TaskDependencies")
  dependents   TaskDependency[] @relation("TaskDependents")

  @@index([projectId])
}
```

### Decisions

- Every task belongs to exactly one project.
- `title` is required.
- `description` is optional.
- `status` defaults to `TODO`.
- `priority` defaults to `MEDIUM`.
- `tags` uses PostgreSQL string-array support.
- `customFields` is JSON and defaults to `{}`.
- `version` starts at `1`.
- `version` is not automatically incremented in this milestone.
- Later task mutation logic is responsible for incrementing version atomically.

Do not store:

- comments as JSON inside Task
- assignee IDs as comma-separated strings
- dependency IDs as a string array
- the complete task configuration as one opaque JSON object

---

## 11. TaskAssignee Model

A task may have multiple assignees.

A user may be assigned to multiple tasks.

Required conceptual shape:

```text
TaskAssignee
- taskId
- userId
```

Recommended Prisma design:

```prisma
model TaskAssignee {
  taskId String @db.Uuid
  userId String @db.Uuid

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([taskId, userId])
  @@index([userId])
}
```

### Decisions

The composite primary key guarantees:

```text
a user cannot be assigned to the same task twice
```

No additional join-table ID is required.

No assignment metadata is required.

---

## 12. Comment Model

Required conceptual shape:

```text
Comment
- id
- taskId
- content
- authorId
- createdAt
```

Recommended Prisma design:

```prisma
model Comment {
  id        String   @id @default(uuid()) @db.Uuid
  taskId    String   @db.Uuid
  content   String
  authorId  String   @db.Uuid
  createdAt DateTime @default(now())

  task      Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author    User @relation(fields: [authorId], references: [id], onDelete: Restrict)

  @@index([taskId, createdAt])
  @@index([authorId])
}
```

### Decisions

- Comment content is required.
- Comment editing/deletion is not part of the core requirement.
- `createdAt` represents the challenge's comment timestamp.
- Deleting a task should remove its comments.
- User deletion is not in scope; comments should not silently lose their author.

---

## 13. TaskDependency Model

Dependencies are modeled relationally because a task can depend on multiple other tasks and can itself be a dependency of multiple tasks.

Required conceptual shape:

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
Build Backend depends on Design API
```

Stored as:

```text
taskId          = Build Backend
dependsOnTaskId = Design API
```

Recommended Prisma design:

```prisma
model TaskDependency {
  taskId          String @db.Uuid
  dependsOnTaskId String @db.Uuid

  task      Task @relation(
    "TaskDependencies",
    fields: [taskId],
    references: [id],
    onDelete: Cascade
  )

  dependsOn Task @relation(
    "TaskDependents",
    fields: [dependsOnTaskId],
    references: [id],
    onDelete: Cascade
  )

  @@id([taskId, dependsOnTaskId])
  @@index([dependsOnTaskId])
}
```

Format the actual Prisma schema according to Prisma syntax requirements; the multiline example above is conceptual.

### Database guarantees

The schema must guarantee:

- both task IDs reference valid tasks
- duplicate dependency edges cannot exist
- deleting either task removes affected dependency edges

### Business guarantees deferred to later milestones

The database schema alone does **not** need to guarantee:

- a task cannot depend on itself
- both tasks belong to the same project
- no indirect cycles exist

Those validations belong in the Dependencies & Status Rules service layer.

Do not add complicated database triggers for these rules.

---

## 14. Relationship Overview

The resulting model should behave conceptually as:

```text
Project
   │
   └──< Task
          │
          ├──< TaskAssignee >── User
          │
          ├──< Comment >──────── User
          │
          ├──< dependencies
          │       │
          │       └── another Task
          │
          └──< dependents
                  │
                  └── another Task
```

Cardinality:

```text
Project 1 ─── * Task

Task    * ─── * User       through TaskAssignee

Task    1 ─── * Comment
User    1 ─── * Comment

Task    * ─── * Task       through TaskDependency
```

---

## 15. Deletion Semantics

Use explicit relational deletion behavior.

### Project deletion

Conceptual behavior:

```text
Project deleted
      ↓
its Tasks deleted
      ↓
task Comments deleted
task Assignments deleted
task Dependency edges deleted
```

Project deletion is not yet exposed through an API, but the relational model should remain internally consistent if it occurs.

### Task deletion

Deleting a task must remove:

- comments attached to the task
- task-assignee join rows
- dependency rows where the task is the dependent task
- dependency rows where the task is the prerequisite task

### User deletion

User deletion is not part of the core product.

If a user is deleted directly:

- TaskAssignee rows may cascade
- Comments should restrict deletion while authored comments exist

Do not add soft deletion in this project.

---

## 16. Essential Indexes

Do not perform speculative performance tuning.

Add only indexes justified by expected access patterns.

Required indexes:

```text
Task(projectId)

TaskAssignee(userId)

Comment(taskId, createdAt)

Comment(authorId)

TaskDependency(dependsOnTaskId)
```

Composite primary keys already index:

```text
TaskAssignee(taskId, userId)

TaskDependency(taskId, dependsOnTaskId)
```

Do not add many unproven indexes.

Index strategy may be expanded later if actual query patterns require it.

---

## 17. Prisma Migration Strategy

Application Bootstrap may have used `prisma db push` only to prove connectivity.

From this milestone onward, the canonical schema workflow is **committed Prisma migrations**.

Create the first domain migration using the installed Prisma version's supported migration command, conceptually:

```bash
npx prisma migrate dev --name init_domain
```

The resulting migration must be committed to the repository.

Expected shape:

```text
prisma/
├── schema.prisma
├── migrations/
│   └── <timestamp>_init_domain/
│       └── migration.sql
└── seed.ts
```

Do not manually maintain production tables outside the migration history.

Do not use `db push` as the normal schema-change workflow after this milestone.

---

## 18. Seed Data

Create deterministic development seed data.

The seed must be safe to run repeatedly.

At minimum seed these users:

```text
Ayushi
Carlos
Joaquin
```

Also seed a small representative domain graph so relationships can be verified without waiting for later UI/API work.

Recommended sample:

```text
Project:
HappyRobot Demo

Tasks:
1. Design API
   status = DONE
   priority = HIGH

2. Build Backend
   status = IN_PROGRESS
   priority = HIGH
   depends on Design API

3. Build Frontend
   status = TODO
   priority = MEDIUM
```

Recommended assignments:

```text
Design API
→ Ayushi

Build Backend
→ Carlos

Build Frontend
→ Ayushi
→ Joaquin
```

Recommended comment:

```text
Task: Build Backend
Author: Joaquin
Content: "I will review the API contract."
```

The exact demo wording is not architecturally important.

The important requirement is that seed data exercises:

- Project → Task
- Task ↔ User assignment
- Task → Comment → User
- Task → Task dependency

### Seed requirements

- deterministic
- idempotent
- readable
- small
- no random bulk data
- no 10,000-task generation
- no product-feature logic

Use the seed mechanism supported by the installed stable Prisma version.

If a small seed runtime helper such as `tsx` is required, it may be added as a development dependency.

---

## 19. Database Verification

The milestone must include a reproducible way to verify the relational model.

This may be:

- a small verification script, or
- a temporary development script committed under an appropriate `scripts/` location

Do not depend only on manually opening Prisma Studio.

Recommended verification output should prove:

```text
1 project exists

3 simulated users exist

project has tasks

task has expected assignee(s)

Build Backend depends on Design API

Build Backend has a comment

comment resolves its author

task version defaults to 1

task status/priority defaults work where applicable
```

A verification script should exit non-zero if expected relationships are missing.

Do not create API routes solely to verify the database.

---

## 20. Recommended Repository Changes

After this milestone, the relevant repository shape should approximately be:

```text
.
├── docs/
│   └── specs/
│       ├── 00-architecture.md
│       ├── 01-application-bootstrap.md
│       └── 02-domain-data-model.md
│
├── prisma/
│   ├── migrations/
│   │   └── <timestamp>_init_domain/
│   │       └── migration.sql
│   ├── schema.prisma
│   └── seed.ts
│
├── scripts/
│   └── verify-domain.ts        # optional but recommended
│
├── src/
│   └── lib/
│       └── db.ts
│
├── docker-compose.yml
├── package.json
└── README.md
```

Do not add:

```text
src/app/api/projects
src/app/api/tasks
src/app/api/.../events
```

during this milestone.

Those belong to later specifications.

---

## 21. README Update

Update the bootstrap README only enough to explain the database lifecycle.

Document commands equivalent to:

```bash
docker compose up -d db
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Also document how to reset a local development database if necessary using the installed Prisma version's supported command.

Do not write the final architecture/scaling submission README yet.

---

## 22. Implementation Constraints

### Required

- Follow `00-architecture.md`.
- Preserve the existing bootstrap implementation.
- Use PostgreSQL.
- Use Prisma.
- Use UUIDs.
- Use relations rather than encoded ID strings.
- Use a relational join table for assignees.
- Use a relational self-join table for dependencies.
- Use migrations.
- Keep seed data deterministic.
- Keep changes scoped to the domain/data layer.

### Forbidden

Do not:

- implement APIs
- implement React feature UI
- implement SSE
- add WebSockets
- add Redis
- add authentication
- add business-service abstractions that are not yet needed
- add repositories merely for architectural ceremony
- add GraphQL
- add tRPC
- replace Prisma
- replace PostgreSQL
- redesign the architecture
- build bonus requirements

---

## 23. Expected Prisma Schema

The final schema should be semantically equivalent to the following.

Exact formatting and generated Prisma syntax may differ based on the installed stable Prisma version.

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

model Project {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  description String?
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tasks Task[]
}

model User {
  id          String         @id @default(uuid()) @db.Uuid
  name        String         @unique
  assignments TaskAssignee[]
  comments    Comment[]
}

model Task {
  id           String       @id @default(uuid()) @db.Uuid
  projectId    String       @db.Uuid
  title        String
  status       TaskStatus   @default(TODO)
  priority     TaskPriority @default(MEDIUM)
  description  String?
  tags         String[]     @default([])
  customFields Json         @default("{}")
  version      Int          @default(1)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  project      Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignees    TaskAssignee[]
  comments     Comment[]
  dependencies TaskDependency[] @relation("TaskDependencies")
  dependents   TaskDependency[] @relation("TaskDependents")

  @@index([projectId])
}

model TaskAssignee {
  taskId String @db.Uuid
  userId String @db.Uuid

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([taskId, userId])
  @@index([userId])
}

model Comment {
  id        String   @id @default(uuid()) @db.Uuid
  taskId    String   @db.Uuid
  content   String
  authorId  String   @db.Uuid
  createdAt DateTime @default(now())

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id], onDelete: Restrict)

  @@index([taskId, createdAt])
  @@index([authorId])
}

model TaskDependency {
  taskId          String @db.Uuid
  dependsOnTaskId String @db.Uuid

  task      Task @relation(
    "TaskDependencies",
    fields: [taskId],
    references: [id],
    onDelete: Cascade
  )

  dependsOn Task @relation(
    "TaskDependents",
    fields: [dependsOnTaskId],
    references: [id],
    onDelete: Cascade
  )

  @@id([taskId, dependsOnTaskId])
  @@index([dependsOnTaskId])
}
```

If the installed Prisma parser requires relation declarations on one line or different formatting, use syntactically valid equivalent Prisma schema.

Do not change the data semantics without an explicit architecture discussion.

---

## 24. Verification Procedure

Run from the repository root.

### Step A — Start PostgreSQL

```bash
docker compose up -d db
docker compose ps
```

The `db` service must be running and reachable.

---

### Step B — Install / Generate

```bash
npm install
npx prisma generate
```

Both must succeed.

---

### Step C — Create / Apply Migration

For initial implementation:

```bash
npx prisma migrate dev --name init_domain
```

For subsequent clean verification, use the installed Prisma version's supported migration/reset workflow.

Migration must complete successfully.

---

### Step D — Seed

Run the configured seed command, conceptually:

```bash
npx prisma db seed
```

It must succeed.

Run it a second time.

It must succeed again without creating duplicate simulated users or duplicate relationship rows.

---

### Step E — Verify Domain Graph

Run the project's verification command.

Recommended:

```bash
npm run db:verify
```

Expected result should clearly confirm the core relationships.

Example conceptual output:

```text
✓ users: 3
✓ demo project found
✓ project tasks found
✓ task assignments resolve
✓ task dependency resolves
✓ task comment resolves
✓ comment author resolves
✓ task version defaults verified
```

---

### Step F — Build / Static Checks

Run:

```bash
npm run build
npm run lint
```

or the equivalent static-check commands supported by the installed framework version.

Both must succeed.

---

## 25. Acceptance Criteria

This milestone is complete only when all of the following are true.

### Schema

- [ ] `TaskStatus` enum exists with `TODO`, `IN_PROGRESS`, `DONE`.
- [ ] `TaskPriority` enum exists with `LOW`, `MEDIUM`, `HIGH`.
- [ ] `Project` model exists.
- [ ] `User` model exists.
- [ ] `Task` model exists.
- [ ] `TaskAssignee` model exists.
- [ ] `Comment` model exists.
- [ ] `TaskDependency` model exists.
- [ ] UUID strategy is consistent.
- [ ] required foreign keys exist.
- [ ] required composite keys exist.
- [ ] essential indexes exist.
- [ ] deletion semantics match this specification.

### Task representation

- [ ] task status defaults to `TODO`.
- [ ] task priority defaults to `MEDIUM`.
- [ ] task version defaults to `1`.
- [ ] task tags support multiple strings.
- [ ] task custom fields use JSON.
- [ ] project metadata uses JSON.
- [ ] task assignments are relational.
- [ ] dependencies are relational.

### Migration

- [ ] domain migration is generated.
- [ ] migration is committed.
- [ ] migration applies successfully to PostgreSQL.
- [ ] Prisma Client generates successfully.

### Seed

- [ ] Ayushi is seeded.
- [ ] Carlos is seeded.
- [ ] Joaquin is seeded.
- [ ] representative project/task data is seeded.
- [ ] at least one assignment is seeded.
- [ ] at least one comment is seeded.
- [ ] at least one dependency is seeded.
- [ ] seed can run repeatedly without duplicate relationship failures.

### Verification

- [ ] database verification confirms relations resolve correctly.
- [ ] no REST product APIs were implemented.
- [ ] no React product features were implemented.
- [ ] no realtime infrastructure was implemented.
- [ ] production build succeeds.
- [ ] lint/static checks succeed.

---

## 26. Definition of Done

The milestone is done when PostgreSQL contains a migrated, seeded, verified relational domain model and the repository remains runnable.

The important proof is:

```text
Project
   │
   └── Tasks
          │
          ├── Assignees → Users
          ├── Comments → Users
          └── Dependencies → Tasks
```

with:

```text
status
priority
tags
customFields
version
```

persisted correctly.

No HTTP product behavior is required yet.

---

## 27. Suggested Commit

After all acceptance criteria pass:

```bash
git add .
git commit -m "feat: establish domain data model"
```

Do not combine Project Management API/UI work into this commit.

---

## 28. Handoff: Project Management

Do not begin the Project Management implementation until this milestone's acceptance criteria pass.

The next specification should introduce only the first product vertical slice:

```text
GET  /api/projects
POST /api/projects
GET  /api/projects/:projectId

project list UI
create project UI
open project
```

It should consume the models created here rather than redesign them.

---

## 29. Agent Implementation Prompt

Use the following instruction with the coding agent together with:

```text
docs/specs/00-architecture.md
docs/specs/01-application-bootstrap.md
docs/specs/02-domain-data-model.md
```

Prompt:

> Implement the **Domain & Data Model** specification in `docs/specs/02-domain-data-model.md`.
>
> Treat `docs/specs/00-architecture.md` as the authoritative architecture contract and preserve the completed Application Bootstrap.
>
> Implement only the database/domain scope defined in this specification.
>
> Create the Prisma enums, models, relations, indexes, deletion semantics, committed migration, deterministic seed data, and database verification required by the spec.
>
> Do not implement Project/Task/Comment REST APIs, React product UI, SSE, realtime events, conflict handling, dependency workflow validation, authentication, or any later milestone.
>
> Use committed Prisma migrations as the canonical schema workflow from this point onward.
>
> Run and verify every acceptance criterion before finishing.
>
> Report:
> - files created or modified
> - migration created
> - commands executed
> - seed verification results
> - relationship verification results
> - build/lint results
> - any deviation from the specification
> - any issue that should be resolved before Project Management begins
>
> If the installed Prisma version requires a small syntax/configuration adjustment, make the smallest compatible change without altering the locked data semantics.
>
> Do not silently redesign the architecture.
