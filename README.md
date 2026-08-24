# Collaborative Task Manager

This repository contains the application bootstrap and the domain/data model foundation for a collaborative task management application.

## Local setup

1. Copy `.env.example` to `.env` if needed.
2. Start PostgreSQL with Docker:
   ```bash
   docker compose up -d db
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Generate Prisma Client:
   ```bash
   npx prisma generate
   ```
5. Apply the database schema and create the migration history:
   ```bash
   npx prisma migrate dev --name init_domain
   ```
6. Seed the development dataset:
   ```bash
   npx prisma db seed
   ```
7. Start the development server:
   ```bash
   npm run dev
   ```
8. Visit `http://localhost:3000`.

## Health check

`GET /api/health` returns the current database connectivity status.

## Database reset

To reset the local development database while keeping the migration history intact:

```bash
npx prisma migrate reset
```

## Notes

This repository intentionally keeps the bootstrap layer and domain model scoped to the database schema and seed data without adding REST APIs, UI features, or realtime behavior.
