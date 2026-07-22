# Decisions

Architecture choices and the reasoning behind them, newest first.

## 2026-07-22 — two safeguards added after a real accidental-rollback incident

While testing `monitor.yml` (2026-07-20), `RENDER_API_PRODUCTION_URL` was
temporarily pointed at a fake URL to simulate a failure. That secret is also
read by `deploy.yml`'s own `health-check-and-rollback` job -- two unrelated
PR merges during that window each triggered a real `deploy.yml` run, each
saw the fake URL as unhealthy, and each fired a **real rollback against real
production**. No lasting damage (a later normal deploy landed production
back on the correct commit, confirmed via smoke test), but on a system with
real persistent data this would have caused real disruption, twice, from a
testing mistake rather than an actual incident.

Two fixes, addressing the two independent causes:

1. **Secret isolation**: `monitor.yml` now reads its own `MONITOR_PRODUCTION_URL`
   secret instead of sharing `RENDER_API_PRODUCTION_URL` with `deploy.yml`.
   Testing the monitor can now never influence the deploy pipeline's own
   health check, by construction, not by discipline.
2. **Rollback cooldown**: `render-deploy.mjs`'s rollback path now refuses to
   fire if a prior rollback (a deploy with `trigger: "api"`) happened within
   the last 10 minutes, and fails loudly instead, on the reasoning that
   repeated rollbacks in a short window are far more likely to mean the
   health *signal* is wrong than that production keeps failing in new ways.
   This is the safeguard that would have caught the actual incident: the
   second rollback fired ~2.5 minutes after the first, well inside the
   cooldown window.

Neither fix depends on the other -- secret isolation prevents this specific
class of mistake from recurring; the cooldown limits the blast radius of
*any* bad health signal, however it happens to arise, which is a genuine
gap the report's rollback story doesn't address: an automated pipeline's
mistakes execute unattended and fast, so a safeguard against firing the
same destructive action repeatedly is not optional polish.

## 2026-07-20 — monitor.yml needs explicit `permissions: issues: write`

Once the YAML parsed correctly, the health-check step failed exactly as
intended (the deliberately-broken URL), but `gh issue create` then failed
with `GraphQL: Resource not accessible by integration (createIssue)`. The
default `GITHUB_TOKEN` GitHub Actions provisions per-run does not carry
issue-creation permission unless the workflow explicitly requests it. Added
a top-level `permissions: issues: write` block. Worth calling out in the
findings writeup: every other job in this repo's workflows only reads
repo contents or talks to an external API (Render), so this is the first
place a workflow needed write access to a GitHub-native resource, and the
default-deny posture caught that immediately rather than silently no-op'ing.

## 2026-07-20 — monitor.yml's first version had a real YAML block-scalar bug

The very failure mode the sibling `claude-agent-poc` proof of concept
documented (an unquoted colon breaking `verify.yml`'s YAML) recurred here in
a different shape: `monitor.yml`'s issue-body text was written as a literal
multi-line string inside a `run: |` block, with several lines at zero
indentation while the block scalar requires every content line indented at
least as much as its first line. GitHub Actions failed the run instantly
with the same generic, job-level-output-free message ("This run likely
failed because of a workflow file issue") -- confirming, first-hand this
time rather than by reading about it, that a malformed workflow file fails
silently and unhelpfully regardless of which job or step the mistake is
actually in. Fixed by building the issue body with `printf '...\n...'`
instead of a literal multi-line quoted string, keeping every YAML line at a
consistent indentation.

## 2026-07-20 — fixed a real rollback-selection bug found by the drill itself

The corrected (delayed-failure) drill run worked exactly as designed:
`health-check-and-rollback` correctly detected production's `/healthz`
degrading after Render's own promotion had already passed, and triggered
`render-deploy.mjs --rollback` -- but that script itself then failed with
`no prior successful ('live') deploy found to roll back to`. Root cause: my
own logic assumed a "prior good" deploy would also carry status `"live"`,
but Render only ever marks the *current* deploy `live` -- every deploy it
cleanly superseded becomes `"deactivated"`, not `"live"`, so a second
`"live"` entry can never exist and the search always failed. Fixed by
searching for the next `"live"` **or** `"deactivated"` entry instead (a
`"deactivated"` deploy is one that genuinely served traffic before being
replaced; `build_failed`/`update_failed`/`canceled` deploys, which never
served anything, are correctly still excluded). Re-ran the corrected logic
directly: it found the right prior commit and successfully triggered a
Render deploy pinned to that `commitId` -- confirming the one previously
"NOT YET VERIFIED" assumption in this file actually holds.

## 2026-07-20 — a code-only rollback doesn't fix an environment-caused incident

The immediate re-run of the fixed rollback (above) still didn't restore
production -- it redeployed the right prior *commit*, but that commit's
process still read the same `SIMULATE_HEALTH_FAILURE=true` environment
variable left set on the Render service from staging the drill, so it
failed its health check too and Render's own promotion refused it (stuck
`update_in_progress`, exactly like the very first drill attempt). Resolved
by clearing the environment variable directly and redeploying. This is a
genuine, general limitation worth carrying into the report's findings, not
specific to this bug: **"roll back to the last known-good commit" only
restores service if the incident's root cause actually traveled with the
commit.** An incident caused by environment/config drift, a bad manual
change, or external state persists across a code rollback -- the report's
rollback story implicitly assumes code is the only thing that changes
between a good deploy and a bad one, which is not true in general.

## 2026-07-20 — rollback drill hook made delayed, not immediate

First attempt at the rollback drill set `SIMULATE_HEALTH_FAILURE=true` on
`todo-api-production` (via the Render API directly, not committed to
render.yaml) so `/healthz` failed immediately on every request. Result: the
new deploy sat in `update_in_progress` for 4+ minutes and never reached
`live` -- **Render's own deploy-time health check refused to promote it**,
so the old, good instance kept serving traffic the entire time (confirmed
via direct curl: production never actually went down). This is a genuinely
important finding, not a bug in this project: Render's platform-level
health-gated promotion already prevents a deploy that fails health
immediately from ever seeing real traffic, which makes this project's
custom `health-check-and-rollback` CI job **redundant for that specific
failure class** -- it only adds value for deploys that pass Render's own
initial check and degrade *afterward* (a slow leak, a delayed crash, an
external dependency that fails only under real traffic). Canceled the stuck
deploy (`POST /deploys/:id/cancel`) and redesigned the hook to delay the
failure past Render's own promotion window (default 90s after boot, see
`SIMULATE_HEALTH_FAILURE_DELAY_MS`), so the drill actually exercises the
failure class this project's rollback path exists for, instead of a
failure class Render already handles on its own.

## 2026-07-20 — render-deploy.mjs waits for Render's auto-deploy instead of triggering one

The first real `deploy.yml` run failed immediately:
`DEPLOY FAILED: Unexpected end of JSON input`. Cause, confirmed via the
Render API's own deploy history: `todo-api-staging` is a Blueprint service
with `autoDeploy: "yes"` -- Render started its own deploy for the push the
instant it saw it (trigger `new_commit`), 9 seconds before our workflow's
`POST /services/:id/deploys` call landed (trigger `api`) and asked Render to
deploy the exact same commit a second time. The second, redundant request is
what returned the malformed/empty response.

Fixed by changing the forward-deploy path from "trigger a deploy" to "wait
for the commit Render already auto-deployed to reach live" (poll deploy
history for an entry matching `github.sha`, per the CI job). Rollback is
unaffected and still explicitly triggers a new deploy via the API --
redeploying an *older* commit is not something auto-deploy-on-push would
ever do by itself, so that path has no equivalent race to avoid.

This is a real instance of the report's own "build-test-fix loop" claim:
the failure was legible (a real HTTP-level error, not a silent hang) and
fixable directly from the error plus one API query, without needing Render
support or documentation beyond what the deploy-history endpoint already
returned.

## 2026-07-20 — no rootDir in render.yaml; workspace-scoped commands instead

The sibling `claude-agent-poc` proof of concept uses `rootDir: server` /
`rootDir: client` in its `render.yaml` because its `server/`/`client/` are
independent npm projects. This repo is an npm-workspaces monorepo instead
(hoisted root `node_modules`), so `rootDir` would break dependency
resolution if `npm install` ran scoped to just `apps/api` or `apps/web`.
Each Render service instead builds from the repo root using
`--workspace=<name>` (`npm ci && npm run build --workspace=api`, etc.),
matching the pattern already used by CI's `verify.yml`.

## 2026-07-20 — deploy.yml only wires the API services' rollback path

`todo-web-{staging,production}` (static sites) deploy on push via Render's
own Blueprint auto-deploy with no CI involvement — there's no runtime health
check that can fail for a static bundle, so "rollback" isn't a meaningful
concept for them in this demo. The Phase 4 rollback drill targets
`todo-api-production`, the one service with an actual runtime and a real
failure mode a health check can catch.

## 2026-07-20 — wired up the per-item priority control (reviewer's 2nd BLOCK on PR #3)

The reviewer subagent's second pass BLOCKed PR #3 because `updatePriority()`
existed in `api.ts` but was never called — there was no way for a real user
to ever set a todo's priority to anything but the default `medium`, making
the badge and filter permanently inert. This traced back to `PLAN.md`'s
"Open questions" section, where the `architect` subagent explicitly flagged
"should the UI let users set priority?" rather than deciding it unilaterally
— and it fell through unresolved into backend/frontend implementation.
Fixed by adding a per-item priority `<select>` in `TodoItem`, using the
already-built `updatePriority` function; no creation-time selector, sort, or
bulk-edit added, keeping the fix scoped to what the reviewer identified.

## 2026-07-20 — reverted the max-lines-per-function loosening; refactored instead

The reviewer subagent's first pass BLOCKed PR #3 for bundling an
80->150 `max-lines-per-function` gate change into the feature PR —
correctly, since it directly contradicted `CLAUDE.md`'s "refactor rather
than disable" rule and had nothing to do with issue #2. Reverted the gate
change and instead extracted `todosRouter`'s handlers into named functions
and `App`'s list item/filter into `TodoItem`/`PriorityFilterSelect`
components, bringing both back under the original 80-line cap with no
behavior change. This is the review loop working as the report describes: a
reviewer with no memory of the in-the-moment reasoning that produced the
gate change caught a shortcut that a continuation of the same context might
have kept.

## 2026-07-20 — verify.yml pins Node 24, not 20

The `test` job failed on PR #1 with `Error: No such built-in module:
node:sqlite` even though all 14 tests passed locally — because
`actions/setup-node@v4` with `node-version: "20"` installs Node 20 for script
execution, and `node:sqlite` doesn't exist on Node 20/21 at all (it landed in
22.5). The local dev machine already had Node 24 installed, so this was
completely invisible until a real CI run — the same category of gap the
sibling `claude-agent-poc` proof of concept flagged about workflow YAML bugs
never reproducing outside GitHub Actions. Fixed by pinning `node-version:
"24"` in all five jobs and bumping root `package.json`'s `engines.node` to
`>=22.5.0` to match. Confirms the report's "build-test-fix loop" claim in a
narrow but real way: the failure was legible (clear error, not a silent
hang) and fixable from the CI log alone.

## 2026-07-20 — no automated `independent-review` CI job at all

Unlike a typical setup where this job would be stubbed-to-pass pending a
credential, we decided not to stub it — a stubbed check that always exits 0
would let `verify.yml` claim a rigor it doesn't have. Instead, the
`independent-review` step is simply absent from CI. Reviewer grading happens
by a human running `.claude/agents/reviewer.md` in an interactive session
(see CLAUDE.md's governance notes and KNOWN_ISSUES.md). This is a scope
limitation on the autonomy claim being tested here, not a report gap: the
report's design requires this to be an unattended process, and it doesn't
have a genuinely free way to run one in CI (a fresh Anthropic Console
account's one-time trial credit would work but isn't a standing free tier;
`claude setup-token`/`ant auth login` need an interactive browser login this
project chose not to depend on for CI).

## 2026-07-20 — npm audit instead of semgrep for the security-scan job

Same reasoning as the sibling `claude-agent-poc` proof of concept: the
report's Appendix A example uses `semgrep ci`, which needs a Semgrep
account/token for full CI mode. `npm audit --audit-level=high` needs no
signup. Weaker coverage (dependency vulnerabilities only, not SAST) — the
`security` subagent's manual diff review is the only first-party-code
security check running.

## 2026-07-20 — bumped vitest to ^4.1.10 and vite to ^6.4.3 immediately

`npm install` with the originally-planned vitest ^2.1.4 / vite ^5.4.10
reported 5 vulnerabilities (up to critical) purely from a transitive esbuild
dev-server issue — none of it reachable in CI or production, but it would
have failed `npm audit --audit-level=high` on a freshly bootstrapped app,
before any real code existed. Bumped both to their patched major versions
rather than loosening the audit gate or scoping it to `--omit=dev`; `npm
audit` now reports 0 vulnerabilities. Worth flagging in the eventual findings
writeup: an out-of-the-box `npm audit --audit-level=high` gate is fragile
against normal devDependency churn, not just against real first-party
security bugs.

## 2026-07-20 — node:sqlite instead of better-sqlite3

Used Node's built-in `node:sqlite` (`DatabaseSync`) rather than
`better-sqlite3`. Same synchronous, prepared-statement API shape, but zero
native dependency — avoids requiring node-gyp/build tools on whatever machine
or CI runner executes the pipeline. Confirmed working on Node v24 without an
experimental flag before committing to it.

## 2026-07-20 — TypeScript everywhere, one toolchain for both packages

Node + Express (api) and React + Vite (web), both TypeScript, sharing one
root ESLint flat config and one Vitest setup shape. Keeps all five CI jobs to
a single `npm ci` + one command each — no polyglot toolchain tax for a
demo whose actual subject is the governance config, not the app.
