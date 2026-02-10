# Codexian Development Guide

The primary developer entrypoint for this repository is `AGENTS.md`. It documents the project structure, scripts, and the integration contract with the Codex CLI app-server. Start with `AGENTS.md`.

## 1) Prerequisites

- Node.js: use a version compatible with CI (currently Node 20.x and 22.x).
- Obsidian: this plugin targets Obsidian Desktop.
- Codex CLI: `codex` must be installed and runnable from your environment; the plugin starts the backend via `codex app-server`.

## 2) Install & Build

Install dependencies (as used in CI):

```bash
npm ci
```

Package manager and lockfiles:

- CI uses npm and `npm ci`, which relies on `package-lock.json`.
- The repository may also contain other lockfiles (for example `pnpm-lock.yaml`) from historical or local workflows.

Common scripts (see `package.json`):

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run lint
```

```bash
npm test
```

Implementation notes (based on the current build config):

- `npm run dev`: runs `node esbuild.config.mjs` in watch mode and writes `main.js` at the repo root. In non-production mode it uses an inline sourcemap.
- `npm run build`: runs `tsc -noEmit -skipLibCheck` then `node esbuild.config.mjs production`. Production builds minify and do not generate a sourcemap.

## 3) Run In Obsidian

Place the plugin in your vault and enable/reload it in Obsidian:

1. Location (plugin id is `codexian`):

```text
<YourVault>/.obsidian/plugins/codexian/
```

2. Minimum required files:

```text
manifest.json
main.js
styles.css
```

3. In Obsidian:

- Settings -> Community plugins: enable `Codexian`
- After changing code or rebuilding: reload Obsidian (for example via the command palette "Reload app", or restart Obsidian)

A common dev setup is to keep this repository directly at `Vault/.obsidian/plugins/codexian/` and run `npm run dev` so `main.js` updates on changes.

## 4) Codex CLI Configuration

Plugin settings live in Obsidian Settings (the Codexian settings tab). Key settings:

- `Codex CLI path`
  - Empty: the plugin attempts to discover `codex` from common install locations and `PATH`.
  - You can include arguments; the value is parsed as a command line. Example:

```text
/usr/local/bin/codex --help
```

- `Test CLI path`
  - The `Test` button starts the configured CLI and runs `--version`.
- If the executable cannot be started (ENOENT), the UI shows a "Codex CLI not found..." notice.
  - If the CLI exits non-zero, the UI shows the exit code and a truncated output snippet (up to 1000 characters each from stdout/stderr).

- `Approval mode`
  - `safe`: declines tool/file approval requests initiated by the app-server (no prompts).
  - `yolo`: auto-approves all tool/file approval requests initiated by the app-server.

- `Environment variables`
  - One `key=value` per line.
  - Lines starting with `#` are ignored; lines starting with `export` are ignored.
  - These variables are injected into the child process environment when launching `codex app-server`.

The settings UI also supports `Environment snippets` for saving and applying common environment variable sets.

## 5) Data Locations

Session data is stored inside the vault:

```text
<YourVault>/.claude/sessions/<conversation-id>.jsonl
```

On-disk format (current implementation details):

- The file is JSONL.
- The first record is `type: "meta"`.
- Subsequent records are `type: "message"`.
- The `.claude/sessions` directory is created automatically if it does not exist.

The `meta` record includes fields like `id`, `title`, `model`, `reasoningEffort`, `mode`, timestamps (`createdAt`, `updatedAt`, optional `lastResponseAt`), and optional `threadId`. Each `message` record wraps a single chat message object.

These files may contain sensitive information (for example prompts, model outputs, and user-provided environment variables). Handle them according to your policies.

## 6) Troubleshooting

### 6.1 ENOENT when starting the CLI (executable not found)

Symptom: `Test CLI path` cannot find the CLI, or runtime throws an error like "Codex CLI not found. Set a valid CLI path or add codex to PATH."

What to check:

- Prefer configuring an absolute path in settings to avoid differences between your shell `PATH` and GUI-launched apps.

```text
/full/path/to/codex
```

- If `codex` works in a terminal but not in Obsidian, it is often because Obsidian (as a desktop app) does not inherit the same `PATH` as your shell. Using an absolute CLI path avoids that.

### 6.2 app-server exits with a non-zero code

Symptom: the app-server starts and exits quickly with an error like "App Server exited with code X."

What to check:

- Confirm the installed Codex CLI supports the `app-server` subcommand:

```bash
codex app-server
```

- Confirm `Environment variables` provide whatever your Codex CLI configuration requires (for example API keys).

### 6.3 Model list is empty

Symptom: the model picker shows no available models.

Explanation (current behavior): if the `model/list` response does not include an expected `data` or `models` array, or the server returns an empty array, the plugin will surface an empty list.

What to check:

- Confirm the app-server stays running (see 6.2).
- Confirm your environment is configured for model discovery and access (see `Environment variables`).

### 6.4 Session file is corrupted or cannot be loaded

Symptom: a session cannot be opened or loads as empty.

Explanation (current behavior): JSONL parsing skips lines that fail `JSON.parse`. If no `meta` record is found, loading returns `null`.

What to check:

```text
<YourVault>/.claude/sessions/<conversation-id>.jsonl
```

Inspect whether the first `meta` record is present and valid JSON, and whether subsequent lines are valid JSON objects.

## 7) CI Expectations

The GitHub Actions workflow (`.github/workflows/lint.yml`) runs on Node 20.x and 22.x and executes:

```bash
npm ci
npm run build --if-present
npm run lint
npm test
```

To reproduce CI locally as closely as possible:

```bash
npm ci
npm run build
npm run lint
npm test
```
