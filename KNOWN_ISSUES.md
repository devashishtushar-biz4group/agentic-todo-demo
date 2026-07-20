# Known Issues

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
