# WorkHub — Gestor de Empleados

> A production-ready **Employee Management System** built with **Next.js 14**, **TypeScript**, **PostgreSQL**, **Prisma ORM**, and **Docker**, following strict **Clean Architecture** principles.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Clean Architecture Layers](#clean-architecture-layers)
5. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Local Development](#local-development)
   - [Docker (Full Stack)](#docker-full-stack)
6. [Environment Variables](#environment-variables)
7. [Database](#database)
8. [API Reference](#api-reference)
9. [Testing](#testing)
10. [Linting & Formatting](#linting--formatting)
11. [Scripts Reference](#scripts-reference)

---

## Overview

WorkHub is a full-stack employee management platform that allows organisations to:

- **Create, read, update and delete employees** with full validation.
- **Organise employees into departments**.
- **Search and filter** the employee directory by name, email, status or department.
- **Paginate** large result sets cleanly via the REST API.

The project is intentionally structured as a **learning and production reference** for Clean Architecture applied to a Next.js + Prisma codebase.

---

## Tech Stack

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Framework      | [Next.js 14](https://nextjs.org/) (App Router)|
| Language       | [TypeScript 5](https://www.typescriptlang.org/)|
| ORM            | [Prisma 5](https://www.prisma.io/)            |
| Database       | [PostgreSQL 16](https://www.postgresql.org/)  |
| Containerisation| [Docker](https://www.docker.com/) + Compose  |
| Validation     | [Zod](https://zod.dev/)                       |
| Testing        | [Jest](https://jestjs.io/) + ts-jest          |
| Linting        | ESLint + `@typescript-eslint`                 |
| Formatting     | Prettier                                      |

---

## Project Structure

```
workhub-gestor-de-empleados/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Development seed data
│
├── src/
│   ├── app/                   # Next.js App Router (pages + API routes)
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Home page
│   │   ├── employees/
│   │   ├── departments/
│   │   └── api/
│   │       ├── employees/     # GET, POST, PATCH, DELETE
│   │       ├── departments/   # GET, POST
│   │       └── health/        # GET
│   │
│   ├── domain/                # ◀ innermost layer
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── repositories/      # interfaces only
│   │   ├── services/
│   │   └── errors/
│   │
│   ├── application/           # ◀ orchestration
│   │   ├── use-cases/
│   │   ├── dtos/
│   │   ├── mappers/
│   │   └── utils/
│   │
│   ├── infrastructure/        # ◀ I/O implementations
│   │   ├── database/          # Prisma client singleton
│   │   ├── repositories/      # Prisma implementations
│   │   └── container/         # DI wiring
│   │
│   ├── interfaces/            # ◀ HTTP adapters
│   │   └── http/
│   │       ├── helpers/       # response builders
│   │       └── validation/    # Zod schemas
│   │
│   ├── styles/
│   └── lib/
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── jest.config.ts
├── .eslintrc.json
└── .prettierrc
```

---

## Clean Architecture Layers

The project enforces the **Dependency Rule**: source code dependencies point **inward only**.

```
  ┌──────────────────────────────────────────┐
  │             interfaces/                  │  HTTP controllers, route handlers
  │  (Next.js route handlers, Zod validation)│
  └────────────────────┬─────────────────────┘
                       │ calls
  ┌────────────────────▼─────────────────────┐
  │             application/                 │  Use cases, DTOs, mappers
  │   (CreateEmployeeUseCase, etc.)           │
  └────────────────────┬─────────────────────┘
                       │ uses interfaces from
  ┌────────────────────▼─────────────────────┐
  │               domain/                   │  Entities, Value Objects,
  │  (Employee, Money, IEmployeeRepository)  │  Domain Services, Repository Interfaces
  └──────────────────────────────────────────┘
                       ▲
  ┌────────────────────┴─────────────────────┐
  │            infrastructure/              │  Prisma repos, DB client, DI container
  │  (PrismaEmployeeRepository, prisma)      │
  └──────────────────────────────────────────┘
```

### `src/domain/`
The **heart** of the application. Contains all business rules and has **zero external dependencies**.

- **Entities** (`Employee`, `Department`) — classes with identity and lifecycle, enforcing invariants in their constructors.
- **Value Objects** (`Email`, `Money`, `EmployeeStatus`) — immutable, equality by value.
- **Repository Interfaces** (`IEmployeeRepository`, `IDepartmentRepository`) — describe *what* can be done with persistence; *how* is infrastructure's job.
- **Domain Services** (`SalaryCalculatorService`) — logic that spans multiple entities.
- **Domain Errors** (`DomainValidationError`, `DomainNotFoundError`) — typed exceptions for business rule violations.

### `src/application/`
**Orchestrates** domain objects to fulfil use cases. Knows *what* to do, not *how*.

- **Use Cases** (one class per operation) — each has a single `execute(dto)` method.
- **DTOs** — plain input/output contracts; domain types never escape this layer.
- **Mappers** — translate domain entities → response DTOs.
- **No infrastructure imports** — uses only the interfaces defined in domain.

### `src/infrastructure/`
All **I/O** lives here. Implements the interfaces defined in domain/application.

- **PrismaClient singleton** — prevents multiple connections during Next.js hot-reload.
- **Repository implementations** — map Prisma rows ↔ domain entities; ORM types never leak outward.
- **DI Container** — the single place where concrete implementations are wired up and use cases are assembled.

### `src/interfaces/`
**Entry points** into the application. Translates HTTP requests into use case calls, and use case results into HTTP responses.

- **Next.js Route Handlers** — validate input with Zod, call use case, return JSON.
- **Response helpers** — consistent `200/201/204/400/404/500` shapes.
- **No business logic** — controllers stay under ~30 lines.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **Docker** + **Docker Compose** (for the DB or full-stack run)
- **PostgreSQL 16** (if running without Docker)

### Local Development

```bash
# 1. Clone and install
git clone <repo-url>
cd workhub-gestor-de-empleados
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL to point at your PostgreSQL instance

# 3. Run migrations and generate Prisma client
npm run prisma:migrate:dev
npm run prisma:generate

# 4. (Optional) Seed the database
npm run prisma:seed

# 5. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker (Full Stack)

Spin up PostgreSQL + the Next.js app in one command:

```bash
# Build and start all services
docker compose up --build

# Run migrations against the containerised database
docker compose --profile migrate up migrate

# Seed (optional — run inside the builder container)
docker compose exec app npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

Services:

| Service    | URL                        |
|------------|----------------------------|
| App        | http://localhost:3000       |
| PostgreSQL | localhost:5432             |
| API Health | http://localhost:3000/api/health |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable          | Description                              | Example                                |
|-------------------|------------------------------------------|----------------------------------------|
| `DATABASE_URL`    | Prisma connection string                 | `postgresql://user:pass@host:5432/db`  |
| `NEXTAUTH_SECRET` | Secret for session signing               | (random 32-char string)                |
| `NEXTAUTH_URL`    | Public app URL                           | `http://localhost:3000`                |
| `NODE_ENV`        | Runtime environment                      | `development` / `production`           |

---

## Database

### Migrations

```bash
# Create and apply a new migration
npm run prisma:migrate:dev -- --name <migration-name>

# Apply existing migrations in production
npm run prisma:migrate:deploy

# Reset (WARNING: destroys all data)
npm run prisma:migrate:reset
```

### Prisma Studio

```bash
npm run prisma:studio
# Opens a visual DB editor at http://localhost:5555
```

### Schema overview

| Table         | Key columns                                                  |
|---------------|--------------------------------------------------------------|
| `departments` | `id`, `name`, `description`                                  |
| `employees`   | `id`, `first_name`, `last_name`, `email`, `position`, `salary`, `status`, `hire_date`, `department_id` |

---

## API Reference

All routes return `application/json`.

### Employees

| Method   | Path                    | Description                   |
|----------|-------------------------|-------------------------------|
| `GET`    | `/api/employees`        | List employees (paginated)    |
| `POST`   | `/api/employees`        | Create an employee            |
| `GET`    | `/api/employees/:id`    | Get a single employee         |
| `PATCH`  | `/api/employees/:id`    | Partial update                |
| `DELETE` | `/api/employees/:id`    | Delete an employee            |

**Query parameters for `GET /api/employees`:**

| Param          | Type             | Description                         |
|----------------|------------------|-------------------------------------|
| `departmentId` | `uuid`           | Filter by department                |
| `status`       | `ACTIVE \| INACTIVE \| ON_LEAVE` | Filter by status   |
| `searchTerm`   | `string`         | Search name / email                 |
| `page`         | `number`         | Page number (default: 1)            |
| `pageSize`     | `number` (≤100)  | Items per page (default: 20)        |

**Create employee body:**

```json
{
  "firstName":    "Ana",
  "lastName":     "García",
  "email":        "ana@workhub.com",
  "phone":        "+34 600 111 222",
  "position":     "Senior Engineer",
  "salary":       3000,
  "currency":     "EUR",
  "hireDate":     "2022-03-15",
  "departmentId": "<uuid>"
}
```

### Departments

| Method | Path                | Description           |
|--------|---------------------|-----------------------|
| `GET`  | `/api/departments`  | List all departments  |
| `POST` | `/api/departments`  | Create a department   |

### Health

| Method | Path          | Description           |
|--------|---------------|-----------------------|
| `GET`  | `/api/health` | Liveness check        |

---

## Role-Based Permissions

WorkHub gates mutation endpoints behind a three-tier role model. The role of
the caller is carried via a JWT-stub `X-Role` HTTP header (intended to be
replaced by a real JWT claim in the future) — the value MUST be one of
`admin`, `manager`, or `employee`. Every employee record also persists a
`role` column (default `employee`), so the same vocabulary is used end-to-end.

### Roles

| Role       | Granted access                                                       |
|------------|----------------------------------------------------------------------|
| `admin`    | Everything: full CRUD on employees, areas, vacations, reports, audit |
| `manager`  | Areas / vacations / reports (but **not** employee CRUD or audit)     |
| `employee` | Read-only access to non-gated endpoints                              |

### Endpoint matrix

| Method · Endpoint                          | Required role(s)    |
|--------------------------------------------|---------------------|
| `POST   /api/employees`                    | `admin`             |
| `PATCH  /api/employees/:id`                | `admin`             |
| `DELETE /api/employees/:id`                | `admin`             |
| `POST   /api/areas`                        | `admin` · `manager` |
| `POST   /api/vacations`                    | `admin` · `manager` |
| `POST   /api/vacations/:id/approve`        | `admin` · `manager` |
| `POST   /api/vacations/:id/reject`         | `admin` · `manager` |
| `GET    /api/audit`                        | `admin`             |
| `GET    /api/reports/hours-by-area`        | `admin` · `manager` |
| `GET    /api/reports/vacations-summary`    | `admin` · `manager` |
| `GET    /api/reports/employee/:id/monthly` | `admin` · `manager` |

Endpoints not listed above (e.g. `GET /api/employees`, `GET /api/areas`,
`POST /api/time-entries`, `GET /api/vacations/calendar`, `GET /api/health`)
are intentionally not role-gated yet.

### 403 response shape

When the caller's role is missing or not in the allow-list, the server
returns HTTP `403` with the following JSON body:

```json
{
  "error": "forbidden",
  "required_roles": ["admin"],
  "your_role": "employee"
}
```

`your_role` is `null` when the `X-Role` header was missing, empty, or held
an unrecognised value.

### Applying the middleware

Route handlers wrap themselves with the `withRole(allowedRoles)` HOC from
`src/interfaces/http/helpers/withRole.ts`:

```ts
import { withRole } from '@/interfaces/http/helpers/withRole';

export const POST = withRole(['admin'])(async (request) => {
  // …handler body — guaranteed to only run when X-Role ∈ ['admin']
});
```

The wrapper is transparent to Next.js dynamic-segment context (it forwards
the second `{ params }` argument untouched).

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report (outputs to ./coverage)
npm run test:coverage
```

Tests are co-located with source files in `__tests__/` directories within each layer.  
**Domain and application tests use in-memory fakes** — no real database required.

---

## Linting & Formatting

```bash
# Lint (errors fail CI)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format all files
npm run format

# Check formatting without writing
npm run format:check

# Full type-check without emitting
npm run type-check
```

The ESLint config enforces:
- `import/no-cycle` — prevents circular dependencies between layers.
- `@typescript-eslint/no-explicit-any` — no `any` shortcuts.
- `import/order` — consistent import grouping by layer.

---

## Scripts Reference

| Script                      | Description                                  |
|-----------------------------|----------------------------------------------|
| `npm run dev`               | Start Next.js dev server                     |
| `npm run build`             | Production build                             |
| `npm run start`             | Start production server                      |
| `npm test`                  | Run test suite                               |
| `npm run lint`              | Lint all TypeScript files                    |
| `npm run format`            | Format all files with Prettier               |
| `npm run type-check`        | TypeScript type-check (no emit)              |
| `npm run prisma:generate`   | Regenerate Prisma client                     |
| `npm run prisma:migrate:dev`| Create + apply migration (dev)               |
| `npm run prisma:migrate:deploy` | Apply migrations (production)            |
| `npm run prisma:studio`     | Open Prisma Studio UI                        |
| `npm run prisma:seed`       | Seed the database with sample data           |

---

## Architecture Decision Record

> **Why Clean Architecture?**
>
> Clean Architecture decouples business rules from framework choices.  
> Swapping Next.js for Express, or Prisma for TypeORM, would only affect the `infrastructure/` and `interfaces/` layers — the domain and application layers remain untouched.
>
> **Why Prisma over raw SQL?**
>
> Prisma provides type-safe query generation, automatic migrations, and an excellent DX.  
> Its types are deliberately contained within `src/infrastructure/` to prevent ORM coupling from spreading inward.
>
> **Why Zod for validation in the interfaces layer?**
>
> Structural/format validation (valid UUID, non-empty string) belongs at the HTTP boundary.  
> Business-rule validation (e.g. "email must be unique") belongs in the domain, enforced by value objects and use cases.
