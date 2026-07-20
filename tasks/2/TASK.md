# TASK: Add a priority field to todos

Source: GitHub issue #2 — "Add a priority field to todos"
https://github.com/devashishtushar-biz4group/agentic-todo-demo/issues/2

## Goal

Add a `priority` attribute (`low` | `medium` | `high`, default `medium`) to
each todo, surface it as a colored badge in the todo list UI, and let users
filter the visible list by priority.

## Requirements

- `todos` table gains a `priority` column, added via a new migration file in
  `apps/api/src/db/migrations/` (do not edit `001_init.sql`), constrained to
  the values `low`, `medium`, `high`, defaulting to `medium`.
- `POST /api/todos` accepts an optional `priority` field in the request body:
  - if omitted, the created todo defaults to `medium`.
  - if present, it must be one of `low`, `medium`, `high`; any other value
    returns `400` with a JSON error body, consistent with the existing
    `title` validation pattern in `apps/api/src/routes/todos.ts`.
- `PATCH /api/todos/:id` accepts an optional `priority` field to update a
  todo's priority, validated the same way as on create. Existing `done`-only
  update behavior must keep working unchanged (a `PATCH` with only `done` in
  the body must not require or touch `priority`).
- `GET /api/todos` response includes `priority` for every todo, and supports
  an optional `?priority=low|medium|high` query parameter that filters the
  returned list server-side to todos matching that priority; an absent or
  unrecognized query parameter returns the unfiltered list (unrecognized
  value does not error — see Constraints for the conservative choice made
  here).
- `apps/web/src/api.ts`: extend the `Todo` interface with `priority`, and
  update `createTodo`/`toggleTodo` (or add a new update function) so the
  frontend can send/receive `priority`. Keep this file as the single place
  that knows API routes/shapes, per `CLAUDE.md`.
- `apps/web/src/App.tsx`: render each todo's priority as a colored badge
  (color varies by priority level) in the list, and add a UI control (e.g.
  a select/filter dropdown) that filters the displayed list by priority on
  the client, calling the API's filter query parameter.
- Existing `done` toggle, delete behavior, and todo creation flow must
  continue to work exactly as before for callers that don't specify
  `priority`.

## Acceptance criteria

- [ ] A new migration file exists in `apps/api/src/db/migrations/` (later
      filename than `001_init.sql`) that adds a `priority` column with a
      `medium` default and a check/constraint limiting it to
      `low`/`medium`/`high`.
- [ ] `apps/api/test/*.test.ts` includes a supertest case asserting
      `POST /api/todos` without `priority` creates a todo with
      `priority: "medium"`.
- [ ] A supertest case asserts `POST /api/todos` with an invalid `priority`
      value (e.g. `"urgent"`) returns `400`.
- [ ] A supertest case asserts `PATCH /api/todos/:id` can update `priority`
      on an existing todo and the response reflects the new value.
- [ ] A supertest case asserts `PATCH /api/todos/:id` with only `{done: true}`
      still succeeds and leaves `priority` unchanged (no regression).
- [ ] A supertest case asserts `GET /api/todos?priority=high` returns only
      todos with `priority: "high"`.
- [ ] `apps/web/test/*.test.tsx` includes a test asserting the priority badge
      renders for a todo in the list.
- [ ] `apps/web/test/*.test.tsx` includes a test asserting selecting a
      priority filter narrows the rendered list to matching todos.
- [ ] `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck`
      (run from repo root) all pass.
- [ ] No changes made to done/toggle/delete route logic beyond what is
      strictly needed to pass `priority` through unchanged.
- [ ] No sort-by-priority control added to the UI.
- [ ] No bulk-edit-priority endpoint or UI control added.

## Constraints

- Follow existing conventions in `CLAUDE.md`: TypeScript `strict: true`, no
  `any` without justification, ESLint `complexity` cap of 10 in both
  packages, every new/changed route path documented by a corresponding
  supertest test, `apps/web/src/api.ts` remains the sole place that knows
  API routes/shapes.
- Migrations are one `.sql` file per migration, applied in filename order —
  add a new file, do not edit `001_init.sql`.
- Tests must run against `DB_PATH=":memory:"`, never the real `todos.db`.
- Assumption (conservative, since the issue doesn't specify): an
  unrecognized/invalid `priority` value on the `GET` filter query parameter
  is treated as "no filter" (returns the unfiltered list) rather than a
  `400`, since filtering is a read-only convenience parameter and erroring
  on it would be a stricter behavior than the issue requested. `POST`/`PATCH`
  validation, by contrast, does reject invalid values with `400` since those
  mutate persisted data.
- Badge coloring is a visual detail left to implementation discretion as
  long as the three priority levels are visually distinguishable in the
  rendered DOM (e.g. via a class name or inline style keyed off priority).

## Non-goals

- Sorting the todo list by priority — explicitly out of scope per the issue.
- Bulk-editing priority across multiple todos at once — explicitly out of
  scope per the issue.
- Any change to done/toggle/delete behavior beyond passing `priority`
  through unchanged — explicitly out of scope per the issue.
- The issue body contains no embedded instructions attempting to expand
  scope beyond the feature described; nothing was excluded on that basis.
