# Progress

Log of completed tasks, newest first. Each entry should be added by the
pipeline once a task's PR merges — not written speculatively before that
happens.

## 2026-07-20 — Phase 3: branch protection wired incrementally, each check verified live

Enabled branch protection on `main` in three rounds (required human review
still on — this repo is still in its gated posture; enforce_admins left
`false` as a deliberate escape hatch during validation, same reasoning as the
sibling `claude-agent-poc` proof of concept):

1. `test` + `lint` required.
2. `typecheck` + `complexity` added.
3. `security-scan` added (all 5 now required).

For each round, pushed a deliberately broken PR isolating exactly the
newly-added check(s) (a failing assertion + unused var for round 1, a
type-only error for round 2, a known-vulnerable `minimist@0.0.8`
devDependency for round 3), confirmed via `gh pr checks` that only the
intended check(s) failed, and confirmed via `gh pr merge` that GitHub
actually refused the merge each time ("the base branch policy prohibits the
merge") — not just that the check showed red in the UI. All three test PRs
closed without merging, branches deleted, local tree resynced. Branch
protection now requires all 5 real checks plus 1 human approval.

## 2026-07-20 — Phase 2: priority-field ticket run through the real subagent
pipeline (PR #3, not yet merged — awaiting human merge decision)

Ran issue #2 through real headless `claude -p --agent <name>` invocations
(not role-played) for every step: intake -> architect -> db -> backend ->
frontend -> testing -> security -> reviewer. All subagents ran locally
against this machine's already-authenticated Claude Code login — no CI
credential needed, since this phase never touches GitHub Actions.

**Two real BLOCK verdicts from the reviewer subagent, both fixed before
merge:**

1. A CI-gate change (`max-lines-per-function` 80->150) had been bundled into
   the feature PR to unblock a failing `complexity` check. The reviewer,
   running in a fresh context with no memory of that reasoning, caught that
   this contradicted `CLAUDE.md`'s own "refactor rather than disable" rule
   and flagged it as scope creep independent of whether the number was
   reasonable. Fixed by reverting the gate and refactoring
   `todosRouter`/`App` into smaller functions instead (re-invoked `backend`/
   `frontend` for this).
2. The feature had no UI path to ever set a non-default priority —
   `updatePriority()` was defined in `api.ts` but never called from `App.tsx`.
   Traced back to an "open question" the `architect` subagent explicitly
   flagged in `PLAN.md` and left unresolved rather than guessing. The
   reviewer read the issue's own non-goals ("no bulk-edit... at once") as
   implying single-item edit was assumed in scope, and blocked until a
   per-item priority control was wired up. Fixed via `frontend`.

Both are logged in DECISIONS.md. The reviewer approved on the third pass.
Also confirmed real, positive tool-scoping behavior: the `testing` and
`reviewer` subagents each correctly could not run commands outside their
declared `tools:` allowlist (e.g. `npm run lint`) and said so honestly
rather than fabricating a result or working around the restriction.

## 2026-07-20 — Phase 1 validated on a real PR, merged (#1)

Opened PR #1 with the baseline app + governance config. First CI run showed
4/5 jobs green but `test` failed with `Error: No such built-in module:
node:sqlite` — a bug invisible in local testing because the dev machine
already had Node 24, while `verify.yml` had pinned `node-version: "20"`
(`node:sqlite` doesn't exist before Node 22.5). Fixed by pinning Node 24 in
all five jobs and bumping `package.json`'s `engines.node` to match (see
DECISIONS.md). Re-ran: all 5 jobs green. Squash-merged into `main`.

## 2026-07-20 — Phase 1: baseline Todo app + governance config

- Authored `CLAUDE.md`, all nine `.claude/agents/*.md` files, and
  `.claude/settings.json` (deny rules: no direct push to `main`, no reading
  `.env*`/`*.pem`/`*.key`, no writing `.github/workflows/**`).
- Built the v1 Todo app by hand (not through the subagent pipeline — that
  starts in Phase 2): Express + `node:sqlite` API (`GET/POST/PATCH/DELETE
  /api/todos`, `GET /healthz`) and a React + Vite UI (list/add/toggle/delete).
- 14 tests passing (10 API via Vitest + supertest, 4 UI via Vitest +
  @testing-library/react). Build, typecheck, lint, and the stricter
  complexity lint all clean. `npm audit --audit-level=high` clean after the
  vitest/vite version bump (see DECISIONS.md).
- Added `.github/workflows/verify.yml` with five required jobs — no
  automated `independent-review` job (see DECISIONS.md / KNOWN_ISSUES.md).

## 2026-07-20 — Phase 0: Repo bootstrap

- Created `devashishtushar-biz4group/agentic-todo-demo` (public), pushed the
  npm-workspaces skeleton (`apps/api`, `apps/web`), created the `agent-task`
  label, added `.github/ISSUE_TEMPLATE/agent-task.md`.
