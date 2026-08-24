# 01 — Application Bootstrap

## 1. Purpose

This specification establishes the application foundation defined by [`00-architecture.md`](./00-architecture.md).

It creates a clean, reproducible development environment where:

1. the Next.js App Router application starts successfully,
2. PostgreSQL runs locally through Docker Compose,
3. Prisma connects successfully to PostgreSQL,
4. database connectivity can be verified through a health endpoint,
5. a minimal application shell renders successfully, and
6. the repository is ready for the **Domain & Data Model** implementation.

This specification does **not** implement Projects, Tasks, Comments, Dependencies, realtime synchronization, or business rules.

The architecture decisions in [`00-architecture.md`](./00-architecture.md) are authoritative.

---

## 2. Objective

At completion, a new developer should be able to clone the repository, follow the setup instructions, and reach:

```text
Docker PostgreSQL running
        ↓
Next.js development server running
        ↓
Prisma successfully connected
        ↓
GET /api/health returns database connected
        ↓
minimal browser page renders
```

This is an infrastructure milestone, not a product-feature milestone.

---

## 3. Locked Decisions

This specification must use:

| Area | Decision |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Next.js App Router |
| Package manager | npm |
| Database | PostgreSQL |
| Local database | Docker Compose |
| ORM | Prisma ORM |
| Styling | Keep generated/default setup minimal |
| Authentication | None |
| Application deployment | Not part of this specification |

Use a **stable generally available Prisma release**, not a release candidate, preview, or early-access major version.

Do not introduce alternative database libraries such as:

- Drizzle
- Sequelize
- TypeORM
- Knex

Do not introduce a managed database.

---

## 4. Expected Repository Shape

After this milestone, the repository should approximately contain:

```text
.
├── docs/
│   └── specs/
│       ├── 00-architecture.md
│       └── 01-bootstrap.md
│
├── prisma/
│   └── schema.prisma
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── health/
│   │   │       └── route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   └── lib/
│       └── db.ts
│
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
├── package-lock.json
├── prisma.config.ts        # if required by the installed stable Prisma version
├── next.config.ts
├── tsconfig.json
└── README.md               # minimal bootstrap instructions only for now
```

Exact generated filenames may vary slightly with the current stable Next.js/Prisma tooling.

Do not reorganize the project unnecessarily.

---

## 5. Next.js Bootstrap

Create a standard Next.js application with:

- App Router
- TypeScript
- ESLint
- `src/` directory
- standard import alias (`@/*`)
- no Pages Router
- no custom server
- no separate backend service

The application must run using:

```bash
npm run dev
```

The browser root page should render a deliberately minimal shell, for example:

```text
Collaborative Task Manager

Core real-time task management take-home
```

Do not spend meaningful time styling this page.

The purpose is only to prove that the frontend application boots successfully.

---

## 6. Node Version

Use a Node.js version supported by both the installed stable Next.js and stable Prisma releases.

Prefer a current LTS version.

Document the selected version in one of:

```text
.nvmrc
```

or:

```text
package.json -> engines.node
```

Prefer `.nvmrc` if the environment already uses nvm.

Do not add a version manager solely for this project.

---

## 7. PostgreSQL via Docker Compose

Only PostgreSQL should run in Docker during development.

The Next.js application should run directly on the developer machine.

Use a simple local Docker Compose configuration.

Recommended service:

```yaml
services:
  db:
    image: postgres:16-alpine
```

Use environment variables for:

```text
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
```

Recommended local-only defaults:

```text
POSTGRES_USER=app
POSTGRES_PASSWORD=app
POSTGRES_DB=happyrobot
```

Expose:

```text
5432:5432
```

Persist database data using a named Docker volume.

Conceptual configuration:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: happyrobot
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

A health check is recommended but not required if it adds unnecessary setup complexity.

---

## 8. Environment Variables

Create:

```text
.env.example
```

containing the required database variable:

```env
DATABASE_URL="postgresql://app:app@localhost:5432/happyrobot?schema=public"
```

The local developer creates:

```text
.env
```

from the example.

`.env` must be ignored by Git.

Do not commit credentials beyond these clearly local demo defaults.

No other environment variables should be introduced in this specification unless required by the framework/tooling.

---

## 9. Prisma Initialization

Initialize Prisma for PostgreSQL.

At the end of this milestone:

```text
prisma/schema.prisma
```

must exist and be valid for PostgreSQL.

Do **not** define the final Project/Task/User/Comment/Dependency models yet.

Those belong to the **Domain & Data Model** specification.

The schema only needs enough configuration to allow:

- Prisma Client generation
- successful connection to PostgreSQL
- future migrations

If the installed stable Prisma version uses:

```text
prisma.config.ts
```

include and configure it according to that stable version.

Do not use:

- Prisma Postgres managed hosting
- Prisma Data Platform as the database
- Prisma 8 RC or another prerelease major version

The database for this project remains the local Dockerized PostgreSQL instance.

---

## 10. Prisma Client Setup

Create:

```text
src/lib/db.ts
```

This module is the single application entry point for Prisma Client.

Requirements:

- create/configure Prisma Client according to the installed stable Prisma version,
- read database configuration from `DATABASE_URL`,
- avoid creating unnecessary duplicate Prisma clients during Next.js development hot reload,
- export one reusable database client.

Application code in later implementation milestones should import the database client from:

```ts
@/lib/db
```

rather than constructing Prisma Client throughout the application.

---

## 11. Database Connectivity Health Check

Create:

```http
GET /api/health
```

The route exists only to verify infrastructure.

When the application can reach PostgreSQL, return:

```http
200 OK
```

with a response similar to:

```json
{
  "status": "ok",
  "database": "connected"
}
```

The route should perform a lightweight database check through Prisma, conceptually equivalent to:

```sql
SELECT 1
```

Do not create a fake response that always says the database is connected.

If the database cannot be reached, return:

```http
503 Service Unavailable
```

with a small safe response such as:

```json
{
  "status": "error",
  "database": "unavailable"
}
```

Do not expose:

- database passwords,
- full connection strings,
- raw stack traces,
- internal driver details

in the API response.

Logging the server-side error during local development is acceptable.

---

## 12. npm Scripts

Keep scripts small and useful.

Expected baseline:

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "start": "...",
    "lint": "..."
  }
}
```

Add convenient database scripts if they work cleanly with the selected stable Prisma version:

```text
db:generate
db:migrate
db:studio
```

Optionally:

```text
db:up
db:down
```

may wrap Docker Compose commands.

Avoid introducing script-management tools.

---

## 13. Minimal README Update

The README at this stage should contain only enough setup information to bootstrap the project.

It must include:

## Prerequisites

- Node.js
- npm
- Docker / Docker Compose

## Local Setup

Conceptually:

```bash
cp .env.example .env
docker compose up -d db
npm install
# Prisma setup/generate command if needed
npm run dev
```

## Verification

Document:

```text
http://localhost:3000
```

and:

```text
http://localhost:3000/api/health
```

The expected health response should be stated.

Do not write the final architecture/scaling submission README yet.

That belongs to the **Delivery — Documentation & Demo** milestone.

---

## 14. What Must NOT Be Implemented

This specification must not add:

## Product Features

- Project database model
- Project APIs
- Task database model
- Task APIs
- User data model beyond anything absolutely required by tooling
- Comments
- Dependencies
- task statuses
- task versioning
- assignees

## Realtime

- SSE
- WebSockets
- event broadcaster
- domain events
- pub/sub

## UI Features

- project list
- task list
- task editor
- comment thread
- user selector
- realtime UI

## Bonus Infrastructure

- Redis
- Kafka
- NATS
- authentication
- authorization
- CI/CD
- deployment configuration
- monitoring
- tracing
- complex logging
- test frameworks beyond what Next.js generates
- UI component libraries

If an implementation agent begins creating these, stop and remove them unless they are required solely for successful framework initialization.

---

## 15. Verification Procedure

This milestone is complete only after the following sequence succeeds from a clean environment.

## Step A — Install

```bash
npm install
```

must succeed.

## Step B — Start PostgreSQL

```bash
docker compose up -d db
```

must succeed.

Verify the database container remains healthy/running.

## Step C — Generate Prisma Client

Run the appropriate script/command, for example:

```bash
npm run db:generate
```

It must succeed.

## Step D — Run Development Server

```bash
npm run dev
```

must start the application successfully.

## Step E — Browser Check

Open:

```text
http://localhost:3000
```

The minimal application shell must render.

## Step F — Database Health Check

Open:

```text
http://localhost:3000/api/health
```

Expected:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Step G — Failure Check

Stop PostgreSQL:

```bash
docker compose stop db
```

Call `/api/health` again.

The endpoint must not continue claiming that the database is connected.

Restart the database after verification.

## Step H — Production Build

Run:

```bash
npm run build
```

The project must build without TypeScript or framework errors.

## Step I — Lint

Run:

```bash
npm run lint
```

It must complete successfully.

If the generated Next.js version has changed its default lint command/tooling, use its supported lint mechanism and document it rather than forcing an outdated command.

---

## 16. Acceptance Criteria

All items below must be true.

### Application

- [ ] Next.js App Router project exists.
- [ ] TypeScript is enabled.
- [ ] `src/` layout is used.
- [ ] `npm run dev` works.
- [ ] root page renders.
- [ ] `npm run build` succeeds.

### PostgreSQL

- [ ] PostgreSQL runs through Docker Compose.
- [ ] database data uses a persistent named volume.
- [ ] `.env.example` documents `DATABASE_URL`.
- [ ] `.env` is ignored.

### Prisma

- [ ] stable Prisma version is installed.
- [ ] Prisma targets PostgreSQL.
- [ ] Prisma Client can be generated.
- [ ] reusable DB client exists at `src/lib/db.ts`.
- [ ] no Domain & Data Model entities have been implemented.

### Connectivity

- [ ] `/api/health` queries PostgreSQL through Prisma.
- [ ] healthy DB returns HTTP 200.
- [ ] unavailable DB returns a failure response rather than a false positive.

### Scope

- [ ] no project feature exists.
- [ ] no task feature exists.
- [ ] no comments feature exists.
- [ ] no dependencies feature exists.
- [ ] no realtime implementation exists.
- [ ] no bonus infrastructure has been introduced.

---

## 17. Definition of Done

This milestone is done when a reviewer can clone the repository, follow the README, and verify:

```text
Next.js boots
+
PostgreSQL boots
+
Prisma connects
+
health check proves the connection
+
production build passes
```

Nothing more is required.

The repository must remain small and boring at this stage.

That is intentional.

---

## 18. Suggested Commit

Once all acceptance criteria pass:

```text
chore: bootstrap Next.js, PostgreSQL and Prisma
```

Do not combine Domain & Data Model work into this commit.

---

## 19. Agent Instructions

Give the coding agent:

1. `docs/specs/00-architecture.md`
2. `docs/specs/01-bootstrap.md`

Then use the following instruction:

> Implement the **Application Bootstrap** specification in `docs/specs/01-bootstrap.md`, following all architectural constraints in `docs/specs/00-architecture.md`.
>
> Implement only the scope defined in this specification. Do not begin the Domain & Data Model or any product/realtime functionality.
>
> Use Next.js App Router, TypeScript, npm, Dockerized PostgreSQL, and a stable generally available Prisma release.
>
> Keep the repository runnable and verify all acceptance criteria in this specification, including the database health endpoint, production build, and lint/static checks supported by the installed framework version.
>
> Do not silently redesign the architecture. If a current framework/tooling requirement conflicts with the specification, make the smallest compatible adjustment and document it.

---

## 20. Handoff: Domain & Data Model

Do not begin the Domain & Data Model implementation until all Application Bootstrap acceptance criteria pass.

The next specification will define and implement:

```text
Project
User
Task
TaskAssignee
Comment
TaskDependency
```

along with:

- enums,
- foreign keys,
- uniqueness constraints,
- indexes,
- migrations,
- seed data.

Domain & Data Model implementation should be able to start without revisiting application bootstrap decisions.
