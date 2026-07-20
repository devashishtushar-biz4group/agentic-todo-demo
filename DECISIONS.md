# Decisions

Architecture choices and the reasoning behind them, newest first.

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
