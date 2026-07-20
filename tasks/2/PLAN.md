# PLAN: Add a priority field to todos (issue #2)

Layers touched: **db** (new migration), **backend** (routes), **frontend**
(api client + UI). No changes needed outside `apps/api` and `apps/web`.

## New API contract

These shapes are the single source of truth for both the backend and
frontend subagents — implement independently against this, do not
renegotiate ad hoc.

**Todo resource (response shape, all endpoints):**
```jsonc
{
  "id": 1,
  "title": "Write the report",
  "done": false,
  "createdAt": "2026-07-20T00:00:00Z",
  "priority": "low" | "medium" | "high"
}
```

**`POST /api/todos`**
- Request body: `{ "title": string, "priority"?: "low" | "medium" | "high" }`
- `priority` omitted → stored/returned value is `"medium"`.
- `priority` present but not one of the three values → `400 { "error": string }`, same pattern as the existing `title` validation.
- Success → `201` with the Todo shape above (unchanged otherwise).

**`PATCH /api/todos/:id`**
- Request body: `{ "done"?: boolean, "priority"?: "low" | "medium" | "high" }`.
- At least one of `done` / `priority` must be present (this mirrors the current requirement that `done` be present — see Open Questions below).
- If `done` is present, it must be a boolean, else `400` (unchanged from current behavior).
- If `priority` is present, it must be one of the three values, else `400`.
- A request containing only `done` must not read, validate, or modify `priority` (it stays at its current stored value).
- A request containing only `priority` must not read, validate, or modify `done`.
- Success → `200` with the full updated Todo shape (unchanged id/title/createdAt).
- `404` for a nonexistent id — unchanged.

**`GET /api/todos?priority=low|medium|high`**
- No query param, or a param that isn't one of the three values → unfiltered list, `200`, no error (per TASK.md Constraints — read-only convenience parameter, conservative choice, does not 400).
- Recognized value → `200` with only todos whose stored `priority` matches, filtered server-side (SQL `WHERE`, not filtered in JS after fetching all rows).
- Every returned todo object includes `priority`.

**`DELETE /api/todos/:id`** — unchanged, not touched by this ticket.

## File-by-file plan

### 1. `apps/api/src/db/migrations/002_add_priority.sql` (new file)
- `ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'));`
- Do not edit `001_init.sql`.
- Applied automatically by `createDb` in `apps/api/src/db/client.ts` (filename-order execution) — no change needed to `client.ts` itself.
- Satisfies acceptance criterion: "A new migration file exists ... adds a `priority` column with a `medium` default and a check/constraint limiting it to low/medium/high."

### 2. `apps/api/src/routes/todos.ts` (modify)
- Add a `Priority` type: `type Priority = "low" | "medium" | "high"` and a small guard `function isPriority(value: unknown): value is Priority` (reused by POST and PATCH validation — keep it as one shared helper to avoid duplicating the enum check and to help keep `complexity` ≤ 10 in each route handler).
- `TodoRow` interface: add `priority: string`.
- `serialize()`: include `priority: row.priority` (cast through `Priority` when read from DB) in the returned object.
- All existing `SELECT ...` statements in this file must add `priority` to the selected columns.
- `GET /api/todos`:
  - Read `req.query.priority`.
  - If it's a string and `isPriority(...)` is true, run the `SELECT` with `WHERE priority = ?` bound to that value.
  - Otherwise (missing, non-string, or unrecognized value) run the existing unfiltered `SELECT` — no error response.
- `POST /api/todos`:
  - Keep existing `title` validation unchanged (order: validate title first, matching current behavior/tests).
  - Read `priority` from body. If `undefined`, use `"medium"`. If present and `isPriority(...)` is false, return `400 { error: "priority must be one of low, medium, high" }` (mirror the wording style of the existing title error). If present and valid, use it.
  - `INSERT INTO todos (title, priority) VALUES (?, ?)`.
- `PATCH /api/todos/:id`:
  - Keep the existing id-parsing and 404-lookup logic unchanged.
  - Read both `done` and `priority` from the body as `unknown`.
  - If neither key is present in the body → `400` (preserves current strictness — see Open Questions).
  - If `done` is present and not a `boolean` → `400` (unchanged message/behavior).
  - If `priority` is present and `isPriority(...)` is false → `400`.
  - Build the `UPDATE` dynamically (or run two conditional single-column updates) so that a `{ done: true }`-only request never touches the `priority` column, and a `{ priority: "high" }`-only request never touches `done`. This is required by acceptance criterion "PATCH with only `{done: true}` still succeeds and leaves priority unchanged."
  - Re-`SELECT` and return the full serialized row as today.
- `DELETE /api/todos/:id`: no changes.
- Keep each handler's cyclomatic complexity ≤ 10; extract the shared `isPriority` guard and, if the PATCH handler grows too branchy, a small `buildPatchUpdate(id, fields)` helper.

### 3. `apps/api/test/todos.test.ts` (extend — for the testing subagent, listed here for traceability)
Add cases (do not remove/alter existing passing cases for done/delete beyond what's needed to keep them green with the new column present):
- `POST /api/todos` without `priority` → `201`, `priority: "medium"` in response.
- `POST /api/todos` with `priority: "urgent"` → `400`.
- `PATCH /api/todos/:id` with `{ priority: "high" }` on an existing todo → `200`, response `priority: "high"`.
- `PATCH /api/todos/:id` with only `{ done: true }` → `200`, response `priority` equals whatever it was created with (unchanged) — regression check.
- `GET /api/todos?priority=high` with a mix of priorities seeded → response contains only `priority: "high"` todos.
- (Optional but recommended for symmetry) `PATCH` with invalid `priority` → `400`.

### 4. `apps/web/src/api.ts` (modify)
- Add `export type Priority = "low" | "medium" | "high";`
- `Todo` interface: add `priority: Priority`.
- `createTodo(title: string, priority?: Priority): Promise<Todo>` — include `priority` in the JSON body only when provided (so omitted calls behave exactly as before against the unchanged default-on-server behavior). Existing call sites that pass only `title` keep compiling and working.
- Add `export async function updatePriority(id: number, priority: Priority): Promise<Todo>` — `PATCH` with body `{ priority }`, following the same pattern as `toggleTodo`. (Chosen over overloading `toggleTodo` to keep each function's request body single-purpose, matching the backend contract above where a PATCH body may carry `done` and/or `priority` independently.)
- `listTodos(priority?: Priority): Promise<Todo[]>` — append `?priority=...` to the URL only when a valid filter value is passed; no param → current unfiltered behavior, unchanged for existing callers that call `listTodos()` with no arguments.
- This file remains the only place in `apps/web` that knows the route paths/shapes, per `CLAUDE.md`.

### 5. `apps/web/src/App.tsx` (modify)
- Add local state: `priorityFilter: Priority | "all"` (default `"all"`).
- On priority-filter change, call `listTodos(priorityFilter === "all" ? undefined : priorityFilter)` and replace `todos` state with the result (server-side filtering, per contract — do not filter client-side in JS).
- Add a `<select aria-label="Filter by priority">` (or similar labeled control) with options `All`, `Low`, `Medium`, `High`, wired to the state above and triggering the refetch.
- In the todo `<li>`, render a badge for `todo.priority`, e.g. a `<span>` with `data-priority={todo.priority}` and an inline `style` (or class) whose color varies by level (e.g. low = green, medium = amber, high = red) — exact colors are implementation discretion per TASK.md Constraints, but the three levels must be visually distinguishable in the DOM (distinct class name or style per level, testable via `data-priority` attribute or visible text).
- Do not add a sort-by-priority control or any bulk-priority-edit control (explicit non-goals).
- Creation flow (`handleSubmit`) is unchanged — no priority selector is added at creation time; new todos continue to be created via `createTodo(trimmed)` with no `priority` argument, so they default to `"medium"` server-side, satisfying "todo creation flow must continue to work exactly as before."

### 6. `apps/web/test/App.test.tsx` (extend — for the testing subagent, listed here for traceability)
Add cases:
- Renders a priority badge for a todo returned by `listTodos` (assert the badge's `data-priority` attribute or visible text matches the todo's `priority`).
- Selecting a priority option in the filter control calls `listTodos` with that priority and re-renders only the todos returned by the (mocked) filtered response.
- Existing four tests (render on load, add, toggle, delete) must still pass with `priority` present on the `makeTodo()` fixture — update `makeTodo()`'s default fixture to include `priority: "medium"` so existing assertions keep compiling/passing.

## Acceptance-criteria → file mapping

| Acceptance criterion | Satisfied by |
|---|---|
| Migration adds `priority` column w/ default + check constraint | `apps/api/src/db/migrations/002_add_priority.sql` |
| `POST` without `priority` → `medium` (test) | `apps/api/src/routes/todos.ts` (POST logic) + `apps/api/test/todos.test.ts` |
| `POST` with invalid `priority` → `400` (test) | `apps/api/src/routes/todos.ts` (POST validation) + `apps/api/test/todos.test.ts` |
| `PATCH` updates `priority`, response reflects it (test) | `apps/api/src/routes/todos.ts` (PATCH logic) + `apps/api/test/todos.test.ts` |
| `PATCH` with only `{done:true}` leaves `priority` unchanged (test) | `apps/api/src/routes/todos.ts` (PATCH conditional update) + `apps/api/test/todos.test.ts` |
| `GET ?priority=high` returns only matching todos (test) | `apps/api/src/routes/todos.ts` (GET filter) + `apps/api/test/todos.test.ts` |
| Priority badge renders (frontend test) | `apps/web/src/App.tsx` (badge markup) + `apps/web/test/App.test.tsx` |
| Priority filter narrows rendered list (frontend test) | `apps/web/src/App.tsx` (filter control) + `apps/web/src/api.ts` (`listTodos` filter param) + `apps/web/test/App.test.tsx` |
| `npm run build/test/lint/typecheck` all pass | all files above, written to satisfy `strict: true`, `complexity ≤ 10`, no unjustified `any` |
| No unrelated changes to done/toggle/delete route logic | `apps/api/src/routes/todos.ts` — DELETE untouched; done-handling in PATCH only reworked enough to be conditional on presence of `priority` |
| No sort-by-priority control | `apps/web/src/App.tsx` — not added |
| No bulk-edit-priority endpoint/control | `apps/api/src/routes/todos.ts` / `apps/web/src/App.tsx` — not added |

## Build order

1. `apps/api/src/db/migrations/002_add_priority.sql`
2. `apps/api/src/routes/todos.ts`
3. `apps/api/test/todos.test.ts`
4. `apps/web/src/api.ts`
5. `apps/web/src/App.tsx`
6. `apps/web/test/App.test.tsx`

(DB before route, route before its tests and before the frontend client that
calls it; frontend api client before the component that consumes it.)

## Open questions (not decided unilaterally — flagging per architect scope)

- TASK.md doesn't state what `PATCH /api/todos/:id` should do if the body
  contains **neither** `done` nor `priority` (empty body). This plan
  preserves current behavior (`400`, since the existing implementation
  requires `done` to be present and boolean) by requiring at least one of
  the two fields to be present. If a reviewer wants a different behavior
  (e.g. `200` no-op), that's a divergence from what's specified here and
  should be confirmed before merge.
- TASK.md doesn't specify whether the UI should let users set `priority` at
  todo-creation time. This plan deliberately does **not** add a
  priority-selector to the creation form, since only "badge" and "filter"
  UI are named requirements — new todos are created with the server default
  (`medium`). Flagging in case this was an implicit expectation.
