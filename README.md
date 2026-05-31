# Team Task Tracker API

A REST API for a team-based task tracker: JWT authentication with refresh-token
rotation, role-based access control, a server-enforced task state machine,
Redis-cached task lists, and one-command containerized deployment.

Built with **NestJS (TypeScript) · PostgreSQL · Prisma · Redis · Docker**.

---

## Quick start

The only prerequisite is **Docker** (Desktop or Engine + Compose).

```bash
docker compose up --build
```

This builds the API image and starts three services — `postgres`, `redis`, and
`api`. On boot the API container applies database migrations and seeds demo data
automatically. When you see `Nest application successfully started`, it's ready.

| What | Where |
|------|-------|
| API base URL | `http://localhost:3000/api` |
| Swagger / OpenAPI UI | `http://localhost:3000/api/docs` |
| Health check | `http://localhost:3000/api/health` |

To stop: `Ctrl+C`, then `docker compose down` (add `-v` to also drop the data volumes).

### Demo accounts (seeded)

All three share the password **`Password123!`**:

| Email | Role |
|-------|------|
| `admin@acme.com` | ADMIN |
| `manager@acme.com` | MANAGER |
| `member@acme.com` | MEMBER |

The seed also creates a sample project and two tasks assigned to the member.

### Trying it in Swagger

1. Open `http://localhost:3000/api/docs`.
2. `POST /api/auth/login` → **Try it out** with one of the accounts above → copy the `accessToken`.
3. Click **Authorize** (top-right), paste the token (no `Bearer ` prefix) → now the protected endpoints are callable.

### Example walkthrough (curl)

A full flow a reviewer can run end-to-end. Replace the `<...>` placeholders with
values from the previous responses.

```bash
# 1. Log in as the seeded admin -> returns accessToken + refreshToken
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"Password123!"}'

TOKEN="<accessToken from step 1>"

# 2. Create a project
curl -s -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Q3 Launch","description":"Launch workstream"}'

# 3. Create a task in that project (assigneeId optional)
curl -s -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Draft brief","priority":"HIGH","projectId":"<projectId>"}'

# 4. List tasks with filters + pagination
curl -s "http://localhost:3000/api/tasks?status=TODO&priority=HIGH&page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# 5. Advance status through the state machine
curl -s -X PATCH http://localhost:3000/api/tasks/<taskId>/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS"}'

# 6. Rotate the refresh token (old one is single-use afterwards)
curl -s -X POST http://localhost:3000/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken from step 1>"}'
```

**Verify RBAC** — log in as `member@acme.com` / `Password123!` and try an
ADMIN/MANAGER-only action; it returns `403`:

```bash
# get a MEMBER token, then attempt to create a task
curl -s -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer <member accessToken>" -H 'Content-Type: application/json' \
  -d '{"title":"x","projectId":"<projectId>"}'
# -> { "status": 403, "code": "FORBIDDEN", "message": "..." }
```

An invalid status jump (e.g. `TODO` → `DONE`) returns
`422 INVALID_STATUS_TRANSITION`, and a past `dueDate` returns
`400 VALIDATION_ERROR`.

---

## Architecture

Feature-module layout — each module owns its controller, service, DTOs, and guards:

```
backend/src/
  common/        # cross-cutting: exception filter, guards, decorators, validators, security
  prisma/        # PrismaService (DB lifecycle, global)
  redis/         # RedisService (single ioredis connection, global)
  health/        # GET /health — pings Postgres + Redis
  auth/          # register, login, refresh rotation, logout, JWT strategy + guard
  users/         # ADMIN-only user provisioning (org-scoped)
  projects/      # project CRUD
  tasks/         # task CRUD, state machine, ownership guard, cached list
```

Authentication and authorization are enforced **globally and declaratively**, so
controllers contain no auth branching (see [RBAC](#rbac)).

---

## Authentication

- **Register** (`POST /api/auth/register`) bootstraps a new tenant: it creates an
  Organization and its first **ADMIN**. Additional MANAGER/MEMBER users are then
  provisioned by an ADMIN via `POST /api/users` — they don't self-register.
- **Passwords** are hashed with **argon2id** (memory-hard, OWASP-recommended).
- **Access token**: a short-lived JWT (15m) carrying `sub`, `organizationId`, and
  `role`, so guards authorize without a DB round-trip.
- **Refresh token**: an opaque random string, stored only as a **sha-256 hash**.
  - On `POST /api/auth/refresh` it is **rotated** — the old token is revoked and a
    new one issued in the same `family`. Each refresh token is single-use.
  - **Reuse detection**: presenting an already-revoked token (a replay/theft
    signal) **revokes the entire family**, forcing re-authentication.
  - `POST /api/auth/logout` revokes the family.

Refresh tokens are deliberately opaque-and-persisted rather than JWTs, because
refresh tokens must be **revocable** and support **reuse detection** — properties
a stateless JWT cannot provide. Access tokens stay JWTs for stateless authz.

---

## RBAC

Two global guards run on every request:

1. **`JwtAuthGuard`** — requires a valid access token unless the route is `@Public`
   (only auth + health). Secure-by-default.
2. **`RolesGuard`** — enforces `@Roles(...)` metadata.

Authorization therefore lives in **guards + metadata, never in controller bodies**.

| Capability | ADMIN | MANAGER | MEMBER |
|------------|:----:|:------:|:-----:|
| Manage users | ✅ | ❌ | ❌ |
| Manage projects | ✅ | ✅ | ❌ (read-only) |
| Create / delete tasks, assign | ✅ | ✅ | ❌ |
| View / update tasks | all in org | all in org | **only assigned to them** |
| Advance task status | any | any | only if assignee |

The row-level rule ("a MEMBER may only touch their own tasks") is handled by a
dedicated **`TaskAccessGuard`** that loads the task, scopes it to the caller's
organization (cross-org → `404`, never leaking existence), and checks ownership.
Everything is org-scoped via the JWT, so tenants can never see each other's data.

---

## Task status state machine

Status changes only through `PATCH /api/tasks/:id/status` and are validated
against an explicit transition map (one source of truth, O(1) check):

```
TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE
  │           │              │
  └───────────┴──────────────┴────► BLOCKED  (from any active state; can return)
```

DONE is terminal; IN_REVIEW can fall back to IN_PROGRESS. Illegal transitions
return `422 INVALID_STATUS_TRANSITION`. Reaching DONE stamps `completedAt` (used
by analytics-style queries). Only the assignee or a MANAGER/ADMIN may advance a
task (enforced by `TaskAccessGuard`).

---

## Listing, pagination & filtering

`GET /api/tasks` supports offset pagination (`page`, `limit`) and filters
(`status`, `priority`, `assigneeId`). MEMBERs are always scoped to their own
tasks. Response:

```json
{ "data": [ ... ], "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

---

## Database design

Models: `Organization`, `User`, `Project`, `Task`, `RefreshToken`
(`backend/prisma/schema.prisma` is the schema "diagram"). Relations:
`Organization 1─∞ User`, `Organization 1─∞ Project 1─∞ Task`,
`Task ∞─1 User (assignee)`, `User 1─∞ RefreshToken`.

### Indexes

- `Task(assigneeId, status)` — composite, for the hot "my tasks by status" query
- `Task(dueDate)` — range scans for overdue/deadline queries
- `Task(organizationId, status)` — org-scoped listings
- plus `RefreshToken(tokenHash unique)`, `RefreshToken(family)`, FK indexes

### Documented design decision

**`organizationId` is denormalized onto `Task`** even though it's reachable via
`Task → Project → Organization`. The single hottest access path — "list tasks for
an assignee within an org, filtered by status" — then resolves from one B-tree on
`(assigneeId, status)` (or `(organizationId, status)`) with **no join**, and the
org-isolation check in guards stays a cheap column comparison rather than a join
on every request. The small write-time cost of carrying the extra column is worth
the read-path simplicity and the cleaner authorization model.

The composite index column order also matters: the **equality** column
(`assigneeId` / `organizationId`) comes before the frequently-filtered `status`,
which a single index can serve directly — better than making the planner
intersect two single-column indexes.

---

## Caching strategy

The per-assignee task list is cached in Redis using **cache-aside**:

- **Read** (`GET /api/tasks`): check Redis → on miss, query Postgres, then store
  the result with a short TTL (default 60s).
- **Keys**:
  - `tasks:org:{org}:assignee:{assignee}:{filter}` → a cached list page
  - `tasks:keys:assignee:{assignee}` → a Redis **SET** tracking that assignee's keys
- **Scope**: only assignee-scoped lists are cached (a MEMBER's own list, or an
  ADMIN/MANAGER filtering by `assigneeId`). This keeps invalidation precise — a
  task write touches at most two assignees.

### Invalidation

On every write (`create` / `update` / `transition` / `delete`) the affected
assignee's cache is invalidated; a **reassignment invalidates both the old and
new assignee**. Invalidation reads the tracking SET and deletes exactly those
keys — deliberately **avoiding `KEYS tasks:*`**, which is O(N) over the whole
keyspace and blocks Redis in production. TTL is only a safety net; correctness
comes from explicit invalidation. All cache operations are **best-effort**: if
Redis is unavailable, requests fall back to the database rather than erroring.

---

## Error format

Every error returns a consistent envelope (via a global exception filter):

```json
{ "status": 400, "code": "VALIDATION_ERROR", "message": "due_date must be a future date" }
```

Validation runs on all endpoints through a global `ValidationPipe`
(whitelist + transform). Unknown/internal errors are logged in full but returned
as a generic `500` so internals never leak.

---

## Local development (without Docker for the API)

Run the data stores in Docker and the API on the host for fast hot-reload:

```bash
docker compose up -d postgres redis     # host ports 5433 (pg) / 6380 (redis)
cd backend
npm install
cp .env.example .env
npx prisma migrate dev                   # apply migrations
npm run seed                             # optional: demo data
npm run start:dev
```

### Environment variables (`backend/.env.example`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis location |
| `JWT_ACCESS_SECRET` / `JWT_ACCESS_TTL` | access token signing + lifetime (15m) |
| `JWT_REFRESH_SECRET` / `JWT_REFRESH_TTL` | refresh token signing + lifetime (7d) |
| `PORT` | API port (3000) |
| `TASK_CACHE_TTL` | task-list cache TTL in seconds (60) |

---

## Tech choices & notable tradeoffs

- **NestJS** — modules/guards/DI/pipes map cleanly onto the requirements
  (middleware-level RBAC, consistent validation/errors) and keep boundaries clear.
- **Prisma pinned to v6** (not v7) — v7 dropped `url` in the schema for driver
  adapters; v6 is the stable, widely-understood version and matches our schema.
- **Docker host ports remapped** to `5433`/`6380` so the stack never clashes with
  a local Postgres/Redis. Inside the network, services use their default ports.
- **Demo data is auto-seeded** on container start (idempotent upserts) purely for
  reviewer convenience.

## What I'd improve with more time

- **Cursor (keyset) pagination** for very large task lists — offset pagination is
  what the brief asked for, but degrades on deep pages.
- **Automated tests** — unit tests for the state machine and refresh-rotation, and
  e2e tests for the RBAC matrix (the manual flows are documented but not codified).
- **Refresh-token cleanup job** to prune expired/revoked rows.
- **Rate limiting** on auth endpoints, and rotating secrets via a real secrets manager.
- **Observability** — structured logging, request tracing, and cache hit/miss metrics.
- **Analytics + real-time (WebSocket) notifications** — designed for but not yet built.

---

## API reference

Full interactive documentation (request/response schemas, every endpoint) is at
**`/api/docs`**. Summary:

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/refresh` | public |
| POST | `/api/auth/logout` | public |
| POST | `/api/users` | ADMIN |
| GET | `/api/users` | ADMIN |
| PATCH / DELETE | `/api/users/:id` | ADMIN |
| POST | `/api/projects` | ADMIN, MANAGER |
| GET | `/api/projects` · `/api/projects/:id` | any authenticated |
| PATCH / DELETE | `/api/projects/:id` | ADMIN, MANAGER |
| POST | `/api/tasks` | ADMIN, MANAGER |
| GET | `/api/tasks` | any (MEMBER sees own) |
| GET | `/api/tasks/:id` | assignee or ADMIN/MANAGER |
| PATCH | `/api/tasks/:id` | assignee or ADMIN/MANAGER |
| PATCH | `/api/tasks/:id/status` | assignee or ADMIN/MANAGER |
| DELETE | `/api/tasks/:id` | ADMIN, MANAGER |
| GET | `/api/health` | public |
