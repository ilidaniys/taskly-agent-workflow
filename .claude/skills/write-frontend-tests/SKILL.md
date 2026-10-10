---
name: write-frontend-tests
description: Conventions and patterns for unit tests of the React frontend (Vitest, React Testing Library, user-event, TanStack Query). Use when creating or updating a *.test.ts(x) file under frontend/src.
---

# Frontend unit tests

## Where and how

- Colocated: `Component.tsx` → `Component.test.tsx`, `useThing.ts` →
  `useThing.test.ts` (use `.tsx` only when the test renders JSX).
- Import `it`, `expect`, `vi`, `describe` from `vitest` explicitly.
- Style is Prettier: no semicolons, single quotes, trailing commas. After
  writing, format the file with the `verify-tests` script (`--format`).
- Reuse `todoFixture` from `src/test/todoFixture.ts`; override per test with
  spread: `{ ...todoFixture, completed: true }`.

## Patterns by unit type

| Unit | Pattern |
|---|---|
| Component | Mock the design system: `vi.mock('<relative>/design-system', () => import('<relative>/design-system/mocks'))`. Render, then query by role and accessible name; `userEvent.setup()` for interaction |
| Page / container | Mock child components and hooks with `vi.mock`, set return values with `vi.mocked(hook).mockReturnValue(...)` (see `TodosPage.test.tsx`) |
| Query / mutation hook | `renderHook` with a wrapper providing a **fresh** `QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })` per test; mock `../api/todos`; assert cache effects through `queryClient.getQueryData(todoKeys.list)` |
| Plain hook | `renderHook` + `act`; fake timers for timeouts |
| API module | `vi.mock('<relative>/lib/http', () => ({ request: vi.fn() }))`, assert path, method and serialised body |
| `lib/http.ts` | `vi.stubGlobal('fetch', vi.fn())` returning `new Response(...)`; cover network failure, abort, 422, string `detail`, non-JSON error body and 204 |
| Pure utils | Table tests with `it.each`; cover every sort, filter and edge value |

## What to assert

- What the user sees and can do: text, roles, enabled/disabled, focus.
- Callbacks: called with which arguments, and **not** called on invalid input.
- Every branch: empty, loading, error, success; optional props absent.
- Async: `await user.click(...)`, `findBy*` or `waitFor`. Never `setTimeout`
  sleeps.

## Do not

- Query by class name or DOM structure; `getByTestId` only where the
  design-system mock offers nothing else.
- Assert styled-components output or snapshot markup.
- Share a `QueryClient` or mock state between tests (`vi.clearAllMocks()` in
  `beforeEach` when a module mock is reused).
- Test files under `design-system/` — out of scope by project convention.
