---
name: write-backend-tests
description: Conventions and patterns for unit tests of the Express + Prisma + Zod backend (Vitest, Supertest). Use when creating or updating a test under backend/tests.
---

# Backend unit tests

## Where and how

- One file per source module: `backend/tests/<module>.test.ts` for
  `backend/src/**/<module>.ts`. Extend the existing file if there is one.
- ESM with explicit extensions: import source as `../src/.../module.ts`.
- Import `it`, `expect`, `vi`, `describe` from `vitest` explicitly (no globals).
- Reuse `record` (database row) and `todo` (API shape) from `./fixture.ts`.
  Add a fixture there only when several tests need it.
- Style: two-space indent, single quotes, semicolons, compact tests,
  `it.each` for input tables. Test names state behaviour:
  "rejects invalid id without calling the repository".

## No real IO, ever

Unit tests must pass with no PostgreSQL and no network.

| Layer | How to isolate |
|---|---|
| Router | Mount the router on a bare `express()` app with a `vi.fn()` repository object, drive it with `supertest` (see `router.test.ts`) |
| Repository | `createDatabase('postgresql://test:test@localhost:5432/test')` builds a real Prisma delegate without connecting; stub each call with `vi.spyOn(database.todo, 'findMany')` and `vi.restoreAllMocks()` in `afterEach` |
| App factory | `createApp(database)` with a stubbed database; assert the 404 fallback, the JSON-parse 422, the 413 and the 500 handler (silence `console.error` with a spy and assert it was called) |
| Config | Set and restore `process.env` keys per test (`vi.stubEnv` / `vi.unstubAllEnvs`); never depend on a real `.env` |
| Time | `vi.useFakeTimers()` + `vi.setSystemTime()`, restored in `afterEach` |

## What to assert

- Each branch of the unit: success, every validation failure, not-found,
  and the error path.
- The **contract**, not the implementation: HTTP status and body, the exact
  arguments passed to the collaborator, the returned value.
- That a rejected request never reaches the collaborator
  (`expect(repository.create).not.toHaveBeenCalled()`).
- Boundaries from `validators.ts`: lengths 120 / 2000, calendar-valid dates,
  ids up to `Number.MAX_SAFE_INTEGER`.
- `validators.ts` and `mappers.ts` carry a 100 % per-file coverage threshold:
  any change there must keep every line and branch covered.

## Do not

- Assert on Zod's internal issue text beyond what the API promises.
- Snapshot whole responses.
- Start the HTTP server (`main.ts`, `lifespan.ts` listen calls) — test the
  functions they compose instead.
