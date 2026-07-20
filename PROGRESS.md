# Progress

Log of completed tasks, newest first. Each entry should be added by the
pipeline once a task's PR merges — not written speculatively before that
happens.

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
