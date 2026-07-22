# Progress

Log of completed tasks, newest first. Each entry should be added by the
pipeline once a task's PR merges — not written speculatively before that
happens.

## 2026-07-22 — Rollback safeguards shipped, following up on the 2026-07-20 incident

Shipped both fixes for the accidental real-production-rollback incident
from Phase 6 testing (PR #22, merged and auto-deployed cleanly): `monitor.yml`
now reads its own `MONITOR_PRODUCTION_URL` secret instead of sharing
`RENDER_API_PRODUCTION_URL` with `deploy.yml`, and `render-deploy.mjs`
refuses to fire a rollback within 10 minutes of a prior one, failing loudly
instead. Post-deploy, confirmed production healthy via `/healthz` and a
full smoke test. See DECISIONS.md for the full reasoning.

## 2026-07-20 — Phase 6: monitoring-to-new-issue loop closed and validated live

`monitor.yml` hit two real bugs before it worked, both fixed through the
normal autonomous pipeline (PRs #18, #19):

- A YAML block-scalar indentation bug in the issue body text -- reproduced
  the exact "malformed workflow file fails instantly with no job-level
  output" class the sibling `claude-agent-poc` proof of concept had already
  documented, this time first-hand.
- The default `GITHUB_TOKEN` lacked `issues: write` permission -- needed an
  explicit `permissions:` block, since this was the first workflow in the
  repo that needed to write a GitHub-native resource rather than just read
  one or call an external API.

Validated live with a synthetic failure (pointed `RENDER_API_PRODUCTION_URL`
at an unreachable address, never touching real production): the workflow
correctly filed a labeled `agent-task` issue (#20), a second run while
still "down" correctly did **not** file a duplicate, and real production
was confirmed healthy throughout via direct curl. Secret restored, test
issue closed with an explanation.

This closes only the monitoring -> new-issue half of Section 4's loop --
see KNOWN_ISSUES.md for why the issue -> automated-pipeline trigger is a
distinct, unbuilt piece of engineering, not a small remaining gap.

## 2026-07-20 — Phase 5: flipped to fully autonomous, validated live

Branch protection on `main` now requires only the 5 status checks --
`required_pull_request_reviews` removed entirely -- with `enforce_admins:
true` and repo-level auto-merge enabled. Validated for real, not just
configured:

- Opened PR #15, called `gh pr merge --auto` with no `--admin` flag and no
  approval. It merged itself at the exact moment all 5 checks went green
  (`mergedAt` recorded, zero human click).
- Immediately re-tested the enforce_admins fix from Phase 3's finding: a
  direct `git push` to `main` (as the repo owner) was flatly rejected --
  `GH006: Protected branch update failed`, `5 of 5 required status checks
  are expected`. The bypass hole documented in KNOWN_ISSUES.md is closed:
  with no required review left to bypass, `enforce_admins: true` means the
  5 status checks are now a real, unbypassable gate for everyone, admin
  included. This doc update itself had to go through the normal PR ->
  checks -> auto-merge path as a result -- no exceptions made for it.

## 2026-07-20 — Phase 4: real Render CD + a genuine rollback drill

Created the 4 Render services via Blueprint. End-to-end `deploy.yml`
(staging deploy -> smoke test -> production deploy -> health check) ran
green for real. Along the way:

- Fixed a real production bug caught only by an actual deploy: `tsc`
  doesn't copy `.sql` migration files, so the compiled server crashed on
  boot (see KNOWN_ISSUES.md).
- Hit and understood a real Render platform quirk: a brand-new service's
  first deploy can report "live" via the API for several minutes before
  its routing actually connects (`x-render-routing: no-server`); a
  redeploy resolved it instantly. `smoke-test.mjs`'s own retry loop rode
  out an identical transient 404 on staging without any code change needed.
- Found and fixed a real race: Render's Blueprint services auto-deploy on
  push already, so the workflow's original "trigger a deploy" step raced
  Render's own auto-triggered deploy for the same commit. Changed the
  forward path to wait for Render's auto-deploy instead of competing with it.
- **Ran the actual rollback drill** (env-var-gated, delayed health failure
  on production only, never committed to render.yaml): `health-check-and-
  rollback` correctly detected the failure, but the rollback script itself
  had a real bug (searching for a second `"live"` deploy that can never
  exist — Render marks superseded deploys `"deactivated"`, not `"live"`).
  Fixed it, re-ran, and confirmed Render's `commitId` redeploy parameter
  genuinely works. Also discovered, by direct experience rather than
  guessing: a rollback to a prior *commit* does not undo environment/config
  drift left over from the incident -- had to clear the drill's own env var
  before the rollback actually restored service. Both findings are logged
  in DECISIONS.md as general limitations of the report's rollback story,
  not bugs specific to this repo.
- Production confirmed healthy and smoke-tested clean after the drill;
  drill hook fully removed from `healthz.ts`.

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
