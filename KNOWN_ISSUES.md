# Known Issues

## No automated trigger from a filed agent-task issue to the subagent pipeline

`monitor.yml` (Phase 6) closes the monitoring -> new-issue half of the
report's Section 4 loop: a scheduled health check auto-files a labeled
`agent-task` issue on a real production failure, no human involved. What
this repo does **not** have is the other half -- a GitHub Actions job that
reacts to a newly-opened `agent-task` issue and runs it through
`intake -> architect -> ... -> merge` unattended. Phase 2 proved the
subagent chain itself works correctly (including two real reviewer BLOCKs),
but every step there was invoked by a human running
`claude -p --agent <name>` by hand against a ticket the human had also
filed. Building the missing trigger (`on: issues: opened` -> headless
`claude` invocations chained together, with its own retry/failure handling)
is a real, distinct piece of engineering that was out of scope for this
project. Section 4's "closed loop" diagram reads as a single mechanism; in
practice it is at least two independently-built pieces, and only one of
them was built and validated here.

## (Fixed) API had no CORS headers -- deployed web UI failed with "Failed to fetch"

Caught by the user actually loading the deployed app in a browser after
Phase 4 -- not by any of the 5 required CI checks, `smoke-test.mjs`, or the
rollback drill. `apps/web` (a static site) and `apps/api` (a Node service)
are separate Render services on separate origins in production, but the
Express app never set any CORS headers, so the browser silently blocked
every cross-origin request with a network-level "Failed to fetch" (not an
HTTP error status -- nothing for a status-code-based check to catch).
Invisible everywhere the pipeline actually checked: `smoke-test.mjs` uses
Node's `fetch`, which does not enforce CORS at all; local dev proxies
`/api` through Vite (`apps/web/vite.config.ts`), making requests
same-origin. Fixed by adding the `cors` middleware with an explicit
allowlist (the two Render web origins + localhost:5173) in `app.ts`. This
is arguably the most important finding of this whole project: an automated
pipeline that is "green everywhere" -- five required checks, a working
deploy, a working rollback path -- can still ship an app that is completely
broken for its only real user, because none of those checks exercise the
one thing that actually matters (a browser loading the page). The report's
model has no layer that does this.

## (Fixed) First Blueprint-created deploy can be "live" but unroutable

`todo-api-production`'s very first deploy (triggered automatically by
Blueprint creation) built successfully, started successfully (app logs
showed `api listening on :3001`), and Render itself declared `Your service
is live`. Despite that, every request for several minutes returned
`404`/`x-render-routing: no-server` at the edge -- Render's own
"Detected service running on port 3001" log line appeared a full 5 minutes
*after* the "live" declaration, suggesting the edge/routing layer hadn't
finished wiring up to the instance yet. `todo-api-staging`, created at the
same moment from the same commit, worked immediately -- so this wasn't an
application bug. Triggering a second deploy via `scripts/render-deploy.mjs`
(no code change, same commit) resolved it within ~15 seconds. Root cause
not confirmed (platform-side propagation delay is the best guess), but the
practical lesson for the Phase 4 deploy pipeline holds regardless: a
"deploy status: live" API response is not sufficient evidence a service is
actually reachable -- the smoke test's own retry loop caught and rode out
an identical transient 404 on `todo-api-staging` moments later, which is
exactly why the report's plan calls for a real smoke test after every
deploy rather than trusting the deploy API's own status field.

## (Fixed) Production build shipped without migration files -- tsc doesn't copy .sql assets

Caught during Phase 4 by actually running `npm run build && npm start` and
hitting the server (not by any test, lint, or typecheck check -- none of the
five required CI jobs would have caught this). `tsc` only emits compiled
`.js` from `.ts` sources; it silently drops non-TypeScript files like
`apps/api/src/db/migrations/*.sql`. `createDb()` resolves the migrations
directory relative to the running file's own location
(`dist/db/migrations` in production, `src/db/migrations` under
tests/`tsx dev`), so the compiled server crashed on boot with
`ENOENT: no such file or directory, scandir '.../dist/db/migrations'` the
moment it was actually started from a real build — exactly the failure mode
a Render deploy would have hit on first boot. Fixed by adding
`apps/api/scripts/copy-migrations.mjs` (a portable `fs.cpSync`, not a
shell `cp`, so it doesn't depend on a POSIX shell being available on the
deploy runner) and wiring it into `apps/api`'s `build` script. This is the
single best argument in this whole project for the report's "smoke test
before trusting a deploy" step: dev (`tsx watch src/index.ts`) and every
required CI check exercise `src/`, not the actual `dist/` artifact that
ships.

## Self-approval is impossible on a single-account repo — forces an admin bypass

While merging PR #7 (a docs-only Phase 3 finding), `gh pr review 7 --approve`
was rejected outright: `GraphQL: Review Can not approve your own pull request`.
This is a GitHub platform rule, not a repo setting — it applies to the
*account* that authored the PR, regardless of whether a human or an agent
issued the API calls under that account's credentials. Concretely: since
every PR in this repo is opened via `gh` authenticated as
`devashishtushar-biz4group`, **no PR here can ever collect its one required
approving review without a second, genuinely different GitHub account.**

This PR was merged with an explicit, acknowledged `gh pr merge --admin`
bypass (distinct from the earlier *accidental* `enforce_admins` bypass
above — this one is deliberate and logged as such).

Why this matters beyond this one repo: the report's gated architecture
assumes "a human clicks approve" is meaningfully different from "the
pipeline self-certifies," but on a single-maintainer project (a common case,
including this one), the human *is* the same account that would need to
open the PR in the first place — so the only way to get a real second
approval is to add a second collaborator purely to satisfy the platform
rule, which is organizational overhead the report doesn't mention as a
prerequisite for the gated configuration to even function as designed.

## Admin/owner bypass makes branch protection non-absolute (enforce_admins)

Caught live during Phase 3: a routine `git push` of a docs-only commit
directly to `main` succeeded even with all 5 required status checks and
required human review configured, because `enforce_admins` is `false`.
GitHub printed this on the push itself:

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Changes must be made through a pull request.
remote: - 5 of 5 required status checks are expected.
```

This is a real, structural gap in the report's Section 5 framing, not just
this repo's config: **whoever holds repo-owner/admin credentials can always
push straight to the protected branch, skipping every required check and
the review requirement, unless `enforce_admins` is explicitly `true`.** The
report frames "required status checks only, no required human review" as
*the* governance mechanism that makes a pipeline autonomous and safe — but
that framing implicitly assumes nobody with push access ever bypasses it,
which is an operational/credential-hygiene assumption, not something the
branch-protection config itself enforces unless `enforce_admins: true`.

The tension: setting `enforce_admins: true` closes this hole but also
removes the human escape hatch this project deliberately kept for
maintenance work during validation (see DECISIONS.md) — in a real "fully
autonomous, no human intervention" deployment, `enforce_admins: true` would
be the correct setting precisely because there should be no human
maintenance path around the gate, but that also means a genuine emergency
requires reverting this setting first, which is itself a manual step. This
should be a headline point in the Phase 7 findings writeup: the single
governance decision the report names (Section 5) is necessary but not
sufficient — `enforce_admins` is a second, easy-to-overlook setting that
determines whether that decision is actually load-bearing or cosmetic.

## Independent reviewer has no automated CI equivalent

`.claude/agents/reviewer.md` exists and is written to be run as an unattended
process, but no CI job invokes it — see DECISIONS.md. Until a credential path
exists (either a temporary Console trial-credit key, or accepting a real
ongoing API spend), branch protection in this repo cannot literally match the
report's Section 5 configuration for *this specific check* — the reviewer
role is performed by a human running the same prompt by hand, not by an
unattended process. Every other required check (test/lint/typecheck/
complexity/security-scan) is genuinely automated. This is the single largest
gap between what this repo demonstrates and what the report claims for full
autonomy, and it should be the headline caveat in the Phase 7 findings
writeup.

## Security CI job is dependency-scan only

`npm audit` (see DECISIONS.md) doesn't catch SAST-style findings a tool like
Semgrep or CodeQL would (e.g. injection patterns in first-party code). The
`security` subagent's manual diff review is the only first-party-code
security check running.

## Subagent tool scoping is tool/command-level, not file-path-level

Claude Code's subagent `tools:` allowlist (`.claude/agents/*.md`) restricts
which *tools* a role can use — it does not natively restrict `Write`/`Edit`
to a specific directory. `backend.md` cannot be mechanically prevented from
editing `apps/web/src/**`; the boundary is currently a prompt-level
convention (each agent's system prompt states what not to touch), not a hard
tool-layer boundary. This is weaker than the report's Section 3.5 framing
implies for *file-path* separation specifically — it holds for tool-category
separation (`security`/`reviewer` genuinely have no `Write`/`Edit` tools at
all) but not for path separation between builder roles.
