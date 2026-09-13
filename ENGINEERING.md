# Engineering Notes

## 1. System Overview

The Job Automation Platform is a TypeScript monorepo containing four main layers:

1. Next.js frontend
2. Express REST API
3. PostgreSQL database
4. PostgreSQL-backed pg-boss worker system

The API is responsible for authentication, job configuration, scheduling, and execution creation.

Workers are responsible for performing outbound HTTP requests and updating execution state.

PostgreSQL is the durable source of truth for application state.

pg-boss uses PostgreSQL as its queue backend, so Redis is not required.

---

## 2. Repository Architecture

```text
job-automation-platform/
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   └── jobs.ts
│   │   │   ├── app.ts
│   │   │   ├── auth.ts
│   │   │   ├── config.ts
│   │   │   ├── cron.ts
│   │   │   ├── db.ts
│   │   │   ├── queue.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── security.ts
│   │   │   └── url-security.ts
│   │   └── Dockerfile
│   │
│   ├── worker/
│   │   ├── src/
│   │   │   ├── execution-service.ts
│   │   │   ├── execution-types.ts
│   │   │   ├── worker-registry.ts
│   │   │   ├── url-security.ts
│   │   │   └── index.ts
│   │   └── Dockerfile
│   │
│   └── web/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── layout.tsx
│       │   └── globals.css
│       └── Dockerfile
│
├── packages/
│   └── shared/
│       └── src/
│           ├── schemas.ts
│           ├── state-machine.ts
│           └── index.ts
│
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
│
├── docker-compose.yml
├── prisma.config.ts
├── vitest.config.mts
└── package.json