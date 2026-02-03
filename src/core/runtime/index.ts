import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

import { parseEnvVariables } from '../../utils/env';
import { ApprovalManager } from '../security/ApprovalManager';
import type {
  ApprovalPolicy,
  AppServerMessageItem,
  AppServerTextContent,
  AppServerThread,
  CodexianSettings,
  SandboxPolicy,
} from '../types';

export interface CodexRunHandlers {
  onStart: (turnId: string) => void;
  onDelta: (delta: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onComplete: () => void;
}

export interface AppServerModel {
  id: string;
  model?: string;
  displayName?: string;
  isDefault?: boolean;
  supportedReasoningEfforts?: { reasoningEffort: string; description?: string }[];
  defaultReasoningEffort?: string;
}

interface JsonRpcRequest {
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: { message?: string };
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const getArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const parseThread = (value: unknown): AppServerThread | null => {
  if (!isRecord(value)) return null;
  const id = getString(value.id);
  if (!id) return null;
  return {
    id,
    createdAt: getNumber(value.createdAt),
    updatedAt: getNumber(value.updatedAt),
    preview: getString(value.preview),
    cwd: getString(value.cwd),
    path: getString(value.path),
    turns: getArray(value.turns).map((turn) => {
      if (!isRecord(turn)) return {};
      const items = getArray(turn.items).map((item) => {
        if (!isRecord(item)) return null;
        const type = getString(item.type);
        if (type === 'userMessage') {
          const content = getArray(item.content).map((contentItem) => {
            if (!isRecord(contentItem)) return null;
            const contentType = getString(contentItem.type);
            if (contentType !== 'text') return null;
            const text = getString(contentItem.text);
            if (text === undefined) return { type: 'text' };
            return { type: 'text', text };
          }).filter((entry): entry is AppServerTextContent => !!entry);
          return { type, id: getString(item.id), content } as AppServerMessageItem;
        }
        if (type === 'agentMessage') {
          return { type, id: getString(item.id), text: getString(item.text) } as AppServerMessageItem;
        }
        return null;
      }).filter((entry): entry is AppServerMessageItem => !!entry);
      return { items };
    }),
  };
};

const extractThread = (value: unknown): AppServerThread => {
  const threadCandidate = isRecord(value) ? (isRecord(value.thread) ? value.thread : value) : value;
  const parsed = parseThread(threadCandidate);
  if (!parsed) {
    throw new Error('Invalid thread response from app server.');
  }
  return parsed;
};

const extractThreadList = (value: unknown): AppServerThread[] => {
  const container = isRecord(value) ? value : undefined;
  const list = container ? getArray(container.data) : getArray(value);
  return list.map((entry) => parseThread(entry)).filter((entry): entry is AppServerThread => !!entry);
};

export function expandHomePath(input: string): string {
  if (!input.startsWith('~')) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

export function parseCommandLine(input: string): { command: string; args: string[] } {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of input.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (quote && char === quote) {
      quote = null;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return { command: '', args: [] };
  }

  return { command: tokens[0] ?? '', args: tokens.slice(1) };
}

function isExistingFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export function findCodexCLIPath(pathValue?: string): string | null {
  const isWindows = process.platform === 'win32';
  const suffix = isWindows ? '.exe' : '';
  const homeDir = os.homedir();
  const candidates: string[] = [];

  const nodeDir = path.dirname(process.execPath || '');
  if (nodeDir) {
    candidates.push(path.join(nodeDir, `codex${suffix}`));
  }

  candidates.push(
    path.join(homeDir, '.local', 'bin', `codex${suffix}`),
    path.join(homeDir, '.volta', 'bin', `codex${suffix}`),
    path.join(homeDir, '.asdf', 'shims', `codex${suffix}`),
    path.join(homeDir, '.npm-global', 'bin', `codex${suffix}`),
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex'
  );

  if (process.env.npm_config_prefix) {
    candidates.push(path.join(process.env.npm_config_prefix, 'bin', `codex${suffix}`));
  }

  for (const candidate of candidates) {
    if (isExistingFile(candidate)) {
      return candidate;
    }
  }

  const rawPath = pathValue || process.env.PATH || '';
  const entries = rawPath.split(path.delimiter).filter((entry) => entry);
  for (const entry of entries) {
    const candidate = path.join(entry, `codex${suffix}`);
    if (isExistingFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveCliCommand(cliPath: string): { command: string; args: string[] } {
  const trimmed = cliPath.trim();
  const resolved = trimmed ? expandHomePath(trimmed) : findCodexCLIPath();
  const expanded = resolved || 'codex';
  const parsed = parseCommandLine(expanded);
  return {
    command: parsed.command || 'codex',
    args: parsed.args,
  };
}

function resolveAppServerCommand(cliPath: string): { command: string; args: string[] } {
  const parsed = resolveCliCommand(cliPath);
  const args = [...parsed.args];
  const hasAppServer = args.includes('app-server');

  if (!hasAppServer) {
    const firstArg = args[0];
    if (firstArg && firstArg.includes('codex')) {
      args.splice(1, 0, 'app-server');
    } else {
      args.unshift('app-server');
    }
  }

  return {
    command: parsed.command || 'codex',
    args,
  };
}

function buildEnhancedPath(command: string, currentPath: string): string {
  const entries = currentPath ? currentPath.split(path.delimiter) : [];
  const addUnique = (entry: string | undefined) => {
    if (!entry) return;
    if (!entries.includes(entry)) {
      entries.unshift(entry);
    }
  };

  addUnique(path.dirname(command));
  return entries.join(path.delimiter);
}

class AppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private notifications = new Set<(notification: JsonRpcNotification) => void>();
  private readyPromise: Promise<void> | null = null;
  private starting = false;

  constructor(
    private command: string,
    private args: string[],
    private env: NodeJS.ProcessEnv,
    private cwd: string,
    private approvalManager: ApprovalManager
  ) { }

  async start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      if (this.starting) {
        reject(new Error('App Server initialization already in progress.'));
        return;
      }
      this.starting = true;
      this.child = spawn(this.command, this.args, {
        cwd: this.cwd || process.cwd(),
        env: this.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const child = this.child;
      const rl = readline.createInterface({ input: child.stdout });

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const parsed = safeJsonParse(trimmed);
        if (!isRecord(parsed)) return;

        const idValue = parsed.id;
        const method = getString(parsed.method);

        if (typeof idValue === 'number' && method) {
          this.handleServerRequest({ id: idValue, method, params: parsed.params }).catch(() => undefined);
          return;
        }

        if (typeof idValue === 'number') {
          const pending = this.pending.get(idValue);
          if (!pending) return;
          this.pending.delete(idValue);
          const errorRecord = isRecord(parsed.error) ? parsed.error : undefined;
          const message = getString(errorRecord?.message);
          if (message) {
            pending.reject(new Error(message));
            return;
          }
          pending.resolve(parsed.result);
          return;
        }

        if (method) {
          const notification: JsonRpcNotification = { method, params: parsed.params };
          this.notifications.forEach((handler) => handler(notification));
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf8').trim();
        if (!text) return;
      });

      child.on('error', (error) => {
        this.starting = false;
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
          reject(new Error('Codex CLI not found. Set a valid CLI path or add codex to PATH.'));
          return;
        }
        reject(error);
      });

      child.on('exit', (code) => {
        this.starting = false;
        if (code !== 0) {
          reject(new Error(`App Server exited with code ${code ?? 'unknown'}.`));
        }
      });

      this.sendRequestInternal('initialize', {
        clientInfo: {
          name: 'Codexian',
          version: '0.1.0',
        },
      })
        .then(() => {
          this.sendNotification('initialized');
          this.starting = false;
          resolve();
        })
        .catch((error) => {
          this.starting = false;
          reject(error instanceof Error ? error : new Error('App Server initialization failed.'));
        });
    });

    return this.readyPromise;
  }

  async stop(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.pending.clear();
    this.readyPromise = null;
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): () => void {
    this.notifications.add(handler);
    return () => {
      this.notifications.delete(handler);
    };
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    await this.start();
    return this.sendRequestInternal(method, params);
  }

  private async sendRequestInternal(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = { id, method, params };
    const message = `${JSON.stringify(payload)}\n`;
    this.child?.stdin.write(message);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  sendNotification(method: string, params?: unknown): void {
    const payload: JsonRpcNotification = { method, params } as JsonRpcNotification;
    const message = `${JSON.stringify(payload)}\n`;
    this.child?.stdin.write(message);
  }

  private async handleServerRequest(request: JsonRpcRequest): Promise<void> {
    const { id, method } = request;
    if (!this.child) return;

    if (method === 'item/commandExecution/requestApproval') {
      const decision = this.approvalManager.decideTool();
      const response: JsonRpcResponse = { id, result: { decision } };
      this.child.stdin.write(`${JSON.stringify(response)}\n`);
      return;
    }

    if (method === 'item/fileChange/requestApproval') {
      const decision = this.approvalManager.decideFileChange();
      const response: JsonRpcResponse = { id, result: { decision } };
      this.child.stdin.write(`${JSON.stringify(response)}\n`);
      return;
    }

    if (method === 'item/tool/requestUserInput') {
      const response: JsonRpcResponse = { id, result: { answers: {} } };
      this.child.stdin.write(`${JSON.stringify(response)}\n`);
      return;
    }

    const response: JsonRpcResponse = { id, error: { message: `Unsupported request: ${method}` } };
    this.child.stdin.write(`${JSON.stringify(response)}\n`);
  }
}

export class CodexRuntime {
  private client: AppServerClient | null = null;

  constructor(private settings: CodexianSettings, private vaultPath: string) { }

  private getClient(): AppServerClient {
    if (!this.client) {
      throw new Error('Codex runtime is not ready.');
    }
    return this.client;
  }

  async ensureReady(): Promise<void> {
    if (!this.client) {
      const { command, args } = resolveAppServerCommand(this.settings.cliPath);
      const env = {
        ...process.env,
        ...parseEnvVariables(this.settings.environmentVariables),
      } as NodeJS.ProcessEnv;
      env.PATH = buildEnhancedPath(command, env.PATH || '');

      const approvalManager = new ApprovalManager(this.settings.approvalMode);

      this.client = new AppServerClient(command, args, env, this.vaultPath, approvalManager);
    }
    await this.client.start();
  }

  async shutdown(): Promise<void> {
    await this.client?.stop();
    this.client = null;
  }

  async startThread(): Promise<AppServerThread> {
    await this.ensureReady();
    const client = this.getClient();
    const result = await client.sendRequest('thread/start', {
      cwd: this.vaultPath || undefined,
    });
    return extractThread(result);
  }

  async resumeThread(threadId: string): Promise<AppServerThread> {
    await this.ensureReady();
    const client = this.getClient();
    const result = await client.sendRequest('thread/resume', {
      threadId,
      cwd: this.vaultPath || undefined,
    });
    return extractThread(result);
  }

  async forkThread(threadId: string): Promise<AppServerThread> {
    await this.ensureReady();
    const client = this.getClient();
    const result = await client.sendRequest('thread/fork', {
      threadId,
      cwd: this.vaultPath || undefined,
    });
    return extractThread(result);
  }

  async archiveThread(threadId: string): Promise<void> {
    await this.ensureReady();
    const client = this.getClient();
    await client.sendRequest('thread/archive', { threadId });
  }

  async rollbackThread(threadId: string, numTurns: number): Promise<AppServerThread> {
    await this.ensureReady();
    const client = this.getClient();
    const result = await client.sendRequest('thread/rollback', {
      threadId,
      numTurns,
    });
    return extractThread(result);
  }

  async listThreads(archived: boolean = false): Promise<AppServerThread[]> {
    await this.ensureReady();
    const client = this.getClient();
    const result = await client.sendRequest('thread/list', {
      archived,
      sortKey: 'updated_at',
      limit: 50,
    });
    return extractThreadList(result);
  }

  async listModels(): Promise<AppServerModel[]> {
    await this.ensureReady();
    const client = this.getClient();
    const result = await client.sendRequest('model/list', {});
    if (isRecord(result) && Array.isArray(result.data)) {
      return result.data as AppServerModel[];
    }
    if (isRecord(result) && Array.isArray(result.models)) {
      return result.models as AppServerModel[];
    }
    if (Array.isArray(result)) return result as AppServerModel[];
    return [];
  }

  async startTurn(
    threadId: string,
    prompt: string,
    handlers: CodexRunHandlers,
    model?: string,
    reasoningEffort?: string,
    approvalPolicy?: ApprovalPolicy,
    sandboxPolicy?: SandboxPolicy
  ): Promise<void> {
    await this.ensureReady();
    const client = this.getClient();

    let turnId = '';
    const buffered: JsonRpcNotification[] = [];
    const handleNotification = (notification: JsonRpcNotification): void => {
      const { method, params } = notification;
      const paramsRecord = isRecord(params) ? params : undefined;

      if (!turnId) {
        buffered.push(notification);
        return;
      }

      if (method === 'item/agentMessage/delta') {
        const eventTurnId = getString(paramsRecord?.turnId);
        if (eventTurnId !== turnId) return;
        const delta = getString(paramsRecord?.delta);
        if (delta) {
          handlers.onDelta(delta);
        }
        return;
      }

      if (method === 'item/completed') {
        const eventTurnId = getString(paramsRecord?.turnId);
        if (eventTurnId !== turnId) return;
        const item = isRecord(paramsRecord?.item) ? paramsRecord?.item : undefined;
        if (getString(item?.type) === 'agentMessage') {
          const text = getString(item?.text);
          if (text) {
            handlers.onMessage(text);
          }
        }
        return;
      }

      if (method === 'turn/completed') {
        const turn = isRecord(paramsRecord?.turn) ? paramsRecord?.turn : undefined;
        const eventTurnId = getString(turn?.id);
        if (eventTurnId !== turnId) return;
        const status = getString(turn?.status);
        if (status === 'failed') {
          const errorRecord = isRecord(turn?.error) ? turn?.error : undefined;
          const message = getString(errorRecord?.message) || 'Turn failed.';
          handlers.onError(message);
        }
        unsubscribe();
        handlers.onComplete();
      }
    };

    const unsubscribe = client.onNotification(handleNotification);

    try {
      const response = await client.sendRequest('turn/start', {
        threadId,
        input: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        model: model || undefined,
        effort: reasoningEffort || undefined,
        approvalPolicy: approvalPolicy || undefined,
        sandboxPolicy: sandboxPolicy || undefined,
      });
      const responseRecord = isRecord(response) ? response : undefined;
      const turn = isRecord(responseRecord?.turn) ? responseRecord?.turn : undefined;
      turnId = getString(turn?.id) ?? '';
      handlers.onStart(turnId);

      if (buffered.length > 0) {
        const pending = [...buffered];
        buffered.length = 0;
        for (const notification of pending) {
          handleNotification(notification);
        }
      }
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    if (!turnId) return;
    await this.ensureReady();
    const client = this.getClient();
    await client.sendRequest('turn/interrupt', { threadId, turnId });
  }
}
