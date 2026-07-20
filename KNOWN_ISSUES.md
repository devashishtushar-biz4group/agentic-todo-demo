# Known Issues

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
