# Collaborative Task Manager

This repository is the bootstrap milestone for a collaborative task management application.

## Local setup

1. Copy `.env.example` to `.env`.
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
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Visit `http://localhost:3000`.

## Health check

`GET /api/health` returns the current database connectivity status.

## Notes

This repository intentionally contains only the application bootstrap: Next.js App Router shell, PostgreSQL via Docker Compose, Prisma configuration, and a health endpoint. Domain and data model features are intentionally omitted.
