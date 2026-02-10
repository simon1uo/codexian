# Contributing

Thanks for contributing to Codexian.

The primary developer entrypoint for this repository is [`AGENTS.md`](AGENTS.md). It documents the project structure, scripts, and the integration contract with the Codex CLI app-server.

## 1) Quick Start

- Developer entrypoint and repo conventions: [`AGENTS.md`](AGENTS.md)
- Local development and troubleshooting: [`DEVELOPMENT.md`](DEVELOPMENT.md)

Suggested flow: read `AGENTS.md` first to understand the architecture and scripts, then follow `DEVELOPMENT.md` to set up your environment and validate changes in Obsidian.

## 2) Local Verification

Before opening a pull request, run the same checks locally that CI runs:

```bash
npm ci
npm run build
npm run lint
npm test
```

CI tip: `.github/workflows/lint.yml` runs on Node 20.x and 22.x and executes `npm ci`, `npm run build --if-present`, `npm run lint`, and `npm test`.

## 3) Scope Rules

Keep changes focused to reduce review time and avoid regressions:

- Prefer small, goal-oriented pull requests.
- Avoid unrelated refactors/renames/format-only changes mixed into feature or bugfix work.
- Avoid adding dependencies unless necessary and clearly justified.

## 4) Commit/PR Guidance

Aim for changes that are easy to review and reproduce.

- Commit messages: describe intent and impact (avoid vague messages).
- PR description: include motivation, key implementation notes, and verification steps (local and/or CI).
- If behavior or UI changes: validate in Obsidian Desktop.

Optional PR checklist:

- [ ] I reviewed relevant conventions in [`AGENTS.md`](AGENTS.md)
- [ ] Scope is focused and avoids unrelated changes
- [ ] I ran: `npm run build`, `npm run lint`, `npm test`
- [ ] If applicable, I validated behavior in Obsidian Desktop
- [ ] I reviewed logs/artifacts for sensitive information before sharing

## 5) Reporting Bugs

When filing an issue, include as much reproducible detail as possible:

- OS and version (Windows/macOS/Linux)
- Obsidian version (Desktop)
- Plugin version (from `manifest.json`)
- Codex CLI installation method and the configured path (the "Codex CLI path" setting; if empty, mention how `codex` is available in your environment)
- Minimal reproduction steps, expected behavior, and actual behavior
- Relevant error output/log snippets (trim to the smallest useful excerpt and keep context)
- If related to models or environment variables: mention whether you configured "Environment variables" (avoid sharing secret values)

## 6) Security/Privacy

Some local data and logs may contain sensitive information (for example prompts, model outputs, and user-provided environment variables). Handle them according to your policies.

When sharing diagnostics in public issues or pull requests:

- Avoid including API keys, tokens, or account details.
- Prefer redacted, minimal excerpts over full logs.
- Treat vault-local session data (for example `.claude/sessions/*.jsonl`) as potentially sensitive.
