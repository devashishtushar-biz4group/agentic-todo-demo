# agentic-todo-demo

A deliberately small full-stack Todo app, built as the target application for
validating "Autonomous Software Development Agent Using Claude Code —
Implementation Architecture" (Devashish Tushar, 17 July 2026). The governance
and pipeline config in this repo (`.claude/agents/`, `.claude/settings.json`,
`.github/workflows/`) is the actual subject under test — the app itself is
intentionally boring.

Status: Phase 5 (fully autonomous) — required status checks only, no
required human review, `enforce_admins: true`, auto-merge enabled. See
PROGRESS.md/DECISIONS.md/KNOWN_ISSUES.md for the full rollout and every
real finding along the way.
