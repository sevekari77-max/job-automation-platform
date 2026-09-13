# Job Automation Platform

A production-oriented job automation platform built as a full-stack TypeScript monorepo.

The platform allows authenticated users to create HTTP jobs, execute them manually or on a cron schedule, inspect execution history, handle retries with backoff, and recover executions from stale workers.

## Features

- JWT-based authentication with HTTP-only cookies
- User registration, login, logout, and session validation
- HTTP jobs supporting:
  - GET
  - POST
  - PUT
  - PATCH
  - DELETE
- Manual "Run Now" execution
- Cron-based scheduled execution
- Pause, resume, and archive jobs
- Execution history and execution details
- Attempt-level execution records
- Configurable timeout
- Configurable retry count
- Configurable exponential backoff
- PostgreSQL-backed job queue using pg-boss
- No Redis dependency
- Multiple worker support
- Worker heartbeat tracking
- Stale-worker recovery
- PostgreSQL advisory locks for concurrency protection
- Duplicate active-execution protection
- SSRF protection for outbound HTTP requests
- Redirects disabled for protected outbound requests
- Request validation using Zod
- Security headers using Helmet
- Rate limiting on authentication endpoints
- Structured server-side logging
- Automated API/security/cron tests
- Docker Compose deployment
- Prisma migrations and database seed
- TypeScript across frontend, API, worker, and shared packages

## Architecture

```text
                         ┌─────────────────────┐
                         │      Next.js Web     │
                         │   React + TypeScript │
                         └──────────┬──────────┘
                                    │
                                    │ HTTP / JSON
                                    ▼
                         ┌─────────────────────┐
                         │   Express REST API  │
                         │ Authentication      │
                         │ Job Management      │
                         │ Scheduling          │
                         └───────┬─────┬───────┘
                                 │     │
                         Prisma  │     │ pg-boss
                                 │     ▼
                                 │  PostgreSQL
                                 │  Job Queues
                                 │
                                 ▼
                         ┌─────────────────────┐
                         │      PostgreSQL     │
                         │ Users               │
                         │ Jobs                │
                         │ Executions          │
                         │ Attempts            │
                         │ Workers             │
                         └──────────┬──────────┘
                                    ▲
                                    │
                              pg-boss│
                                    │
                         ┌──────────┴──────────┐
                         │   Worker Processes  │
                         │ HTTP execution      │
                         │ Retry handling      │
                         │ Heartbeats          │
                         │ Stale recovery      │
                         └─────────────────────┘