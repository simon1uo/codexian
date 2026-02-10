# AGENTS.md

## 1) Project Overview

Codexian is an Obsidian plugin that embeds an agent/chat UI backed by the OpenAI Codex CLI. It spawns `codex app-server` and communicates with it using JSON-RPC over stdio (newline-delimited JSON), while persisting conversation history inside the vault.

## 2) Commands

These scripts are defined in `package.json`:

```bash
npm run dev      # node esbuild.config.mjs
npm run build    # tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
npm run lint     # eslint .
npm test         # jest
npm run test:watch     # jest --watch
npm run test:coverage  # jest --coverage
npm run version  # node version-bump.mjs && git add manifest.json versions.json
```

## 3) Architecture Map

Primary entrypoint:

- `src/main.ts` (Obsidian `Plugin` lifecycle; wires settings, storage, runtime, and the view)

Core modules (`src/core/`):

- Runtime: `src/core/runtime/index.ts`
  - Spawns the Codex CLI app server and implements a minimal JSON-RPC client.
  - Exposes thread/model/turn operations used by the UI.
- Storage: `src/core/storage/SessionStorage.ts`
  - Vault-local session persistence in `.claude/sessions/{threadId}.jsonl` (JSONL).
- Security: `src/core/security/ApprovalManager.ts`
  - Maps `approvalMode` to auto-approve/decline decisions.
- Types: `src/core/types/index.ts`
  - Shared types for settings, conversations/messages, and app-server shapes.

Feature modules (`src/features/`):

- Chat UI: `src/features/chat/`
  - View: `src/features/chat/CodexianView.ts`
  - Controller: `src/features/chat/controllers/ConversationController.ts`
  - State: `src/features/chat/state/ChatState.ts`
  - Rendering: `src/features/chat/rendering/MessageRenderer.ts`
- Settings UI: `src/features/settings/CodexianSettings.ts`

Shared helpers:

- `src/shared/` (UI helpers/icons used by the view)
- `src/utils/` (env parsing/normalization helpers used by runtime + UI)

## 4) Codex CLI App Server Integration

Transport:

- Child process spawned via Node `spawn()`; JSON-RPC messages are newline-delimited JSON written to stdin/stdout.
- The runtime ensures the CLI is invoked with an `app-server` subcommand (adding it if missing).

Spawned command shape (as implemented in `src/core/runtime/index.ts`):

- Command: resolved from `settings.cliPath` (can include args) or auto-discovered; falls back to `codex`.
- Args: ensured to include `app-server` (e.g. `codex app-server`).
- CWD: vault path (`vaultPath`) when available.
- Env: `process.env` plus parsed entries from `settings.environmentVariables`.

JSON-RPC methods used in code:

Client-initiated requests:

- `initialize`
- `thread/start`
- `thread/resume`
- `thread/fork`
- `thread/archive`
- `thread/rollback`
- `thread/list`
- `model/list`
- `turn/start`
- `turn/interrupt`

Client-initiated notifications:

- `initialized`

Notifications handled:

- `item/agentMessage/delta`
- `item/completed`
- `turn/completed`

Server-initiated requests handled (approval/input):

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`

## 5) Data & Privacy

Local session storage (vault-local):

- Conversations are stored under `.claude/sessions/` as JSONL: `.claude/sessions/{threadId}.jsonl`.
- These files contain user prompts and assistant outputs and may contain secrets.
- `settings.environmentVariables` is user-provided and may include secrets (for example, API keys).
- Handle these files and values according to your policies.

## 6) Approval Modes

`approvalMode` (`src/core/types/index.ts`) is `safe` or `yolo`.

- `safe`: declines tool/file approval requests (no prompts; effectively blocks approvals).
- `yolo`: auto-approves tool/file approval requests.

Implementation: `src/core/security/ApprovalManager.ts`. Default setting: `safe` (`src/features/settings/CodexianSettings.ts`).

## 7) Prompt Snippets

Copy/paste templates for Codex CLI / OpenCode.

### Implement change

```text
You are working in the `codexian` Obsidian plugin repo.

Goal:
- Implement: <describe change>

Scope:
- ONLY modify: <list exact files> (do not touch unrelated files)
- Do NOT add dependencies.
- Do not claim tools (e.g. Prettier) that don't exist.

Required reads (before editing):
- Read: package.json
- Read: src/main.ts
- Read any directly-impacted module(s): <paths>

Verification (must run):
- npm run lint
- npm run build

Output:
- Explain what changed and why.
- List the files touched.
```

### Debug / fix

```text
You are debugging the `codexian` Obsidian plugin.

Problem:
- Symptom: <what happens>
- Expected: <what should happen>
- Repro steps: <steps>

Constraints:
- Prefer the smallest fix.
- Do not add dependencies.

Investigation:
- Identify the owning module under `src/` (entry: src/main.ts; UI: src/features/; runtime/storage/security/types: src/core/).
- Read the relevant files and point to the exact logic that causes the bug.

Fix:
- Implement the minimal change.

Verification (must run):
- npm run lint
- npm run build
```

### Add tests (Jest)

```text
Add automated tests for `codexian`.

Notes:
- Tests are run with Jest (see `npm test`).

Requirements:
- Add the minimal test scaffolding and at least one meaningful test covering: <unit under test>.
- Keep tests aligned with `src/` structure (e.g. tests/unit/... and tests/integration/... as needed).

Verification:
- npm run lint
- npm run build
- npm test
```
