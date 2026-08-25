---
name: restart-stack
description: "Use when you need to restart the local app, PostgreSQL, Docker services, or perform a full reset and reseed for this task manager project. Covers stopping running Next.js/dev processes, restarting Docker Compose services, resetting the database volume, reapplying Prisma schema, reseeding domain data, and checking health before continuing."
---

# Restart and reseed local stack

Use this skill whenever the app, database, Docker, or full local environment needs to be restarted or rebuilt after a crash, config change, bad database state, or failed verification.

## Goal

Return the local stack to a known-good, runnable state without changing app code.

## Standard restart flow

```bash
cd /home/ayushi/taskmanager

# stop any app processes
pkill -f "next dev|next start" || true

# stop docker services
docker compose down --remove-orphans || true

# bring DB back up
docker compose up -d db

# health check
docker compose ps

# prisma
npx prisma generate
npx prisma db push
npx prisma db seed

# start the app
npm run dev
```

## Full reset and reseed flow

Use this when you want a clean database and fresh seed data.

```bash
cd /home/ayushi/taskmanager

# stop app processes
pkill -f "next dev|next start" || true

# destroy DB state and recreate from scratch
docker compose down --remove-orphans -v || true
docker compose up -d db

# prisma reset and reseed
npx prisma generate
npx prisma db push --force-reset
npx prisma db seed

# start the app
npm run dev
```

## Verification

After restart or reseed, confirm:

```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/projects
```

Also verify:

- Docker container is running
- PostgreSQL is healthy
- Prisma can connect
- seeded project/task data exists
- the Next.js app starts successfully

## Notes

- `--force-reset` is destructive and wipes the current database contents.
- Use the full reset flow intentionally for recovery or testing a clean database state.
- If Docker is unavailable in the environment, stop and report the blocker explicitly rather than guessing.
- This skill is for local recovery only and does not change product code.
