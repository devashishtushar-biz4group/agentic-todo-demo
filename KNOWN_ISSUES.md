# Known Issues

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
