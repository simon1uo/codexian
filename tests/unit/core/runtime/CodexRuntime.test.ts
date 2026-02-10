import { type ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { CodexRuntime } from '../../../../src/core/runtime';
import type { CodexianSettings } from '../../../../src/core/types';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';

const mockSpawn = jest.mocked(spawn);

interface FakeChild {
  child: ChildProcessWithoutNullStreams;
  stdin: PassThrough;
  stdout: PassThrough;
  writes: string[];
}

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }
  throw new Error('Timed out waiting for condition');
};

const parseClientMessages = (writes: string[]): Array<Record<string, unknown>> => {
  return writes
    .flatMap((chunk) => chunk.split('\n'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

const createFakeChild = (): FakeChild => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const writes: string[] = [];

  stdin.on('data', (chunk: Buffer) => {
    writes.push(chunk.toString('utf8'));
  });

  const emitter = new EventEmitter() as ChildProcessWithoutNullStreams & EventEmitter;
  Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    kill: jest.fn(),
  });

  return {
    child: emitter,
    stdin,
    stdout,
    writes,
  };
};

const buildSettings = (approvalMode: 'safe' | 'yolo' | 'prompt' = 'safe'): CodexianSettings => ({
  cliPath: 'codex',
  environmentVariables: '',
  envSnippets: [],
  approvalMode,
  approvalRules: [],
  commandBlocklist: [],
  pathBlocklist: [],
});

describe('CodexRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('spawns app-server, performs initialize handshake, and starts thread', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const threadPromise = runtime.startThread();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));

    const firstRequest = parseClientMessages(fake.writes).find((entry) => entry.method === 'initialize');
    expect(firstRequest).toMatchObject({ id: 1, method: 'initialize' });

    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'thread/start'));

    const requests = parseClientMessages(fake.writes).filter((entry) => typeof entry.id === 'number');
    const threadStartRequest = requests.find((entry) => entry.method === 'thread/start');
    expect(threadStartRequest).toMatchObject({ id: 2, method: 'thread/start' });

    fake.stdout.write(`${JSON.stringify({ id: 2, result: { thread: { id: 'thread-1' } } })}\n`);

    await expect(threadPromise).resolves.toMatchObject({ id: 'thread-1' });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['app-server']),
      expect.objectContaining({ cwd: '/vault', stdio: ['pipe', 'pipe', 'pipe'] })
    );
  });

  it('responds to server approval request with decline in safe mode', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    fake.stdout.write(
      `${JSON.stringify({ id: 77, method: 'item/commandExecution/requestApproval', params: { command: 'rm -rf' } })}\n`
    );

    await waitFor(() =>
      parseClientMessages(fake.writes).some(
        (entry) => entry.id === 77 && (entry.result as { decision?: string } | undefined)?.decision === 'decline'
      )
    );

    const approvalResponse = parseClientMessages(fake.writes).find((entry) => entry.id === 77);
    expect(approvalResponse).toMatchObject({ id: 77, result: { decision: 'decline' } });
  });

  it('responds to server approval request with accept in yolo mode', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('yolo'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    fake.stdout.write(
      `${JSON.stringify({ id: 78, method: 'item/fileChange/requestApproval', params: { files: ['a.txt'] } })}\n`
    );

    await waitFor(() =>
      parseClientMessages(fake.writes).some(
        (entry) => entry.id === 78 && (entry.result as { decision?: string } | undefined)?.decision === 'accept'
      )
    );

    const approvalResponse = parseClientMessages(fake.writes).find((entry) => entry.id === 78);
    expect(approvalResponse).toMatchObject({ id: 78, result: { decision: 'accept' } });
  });

  it('supports tool/requestUserInput by returning empty answers', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    fake.stdout.write(
      `${JSON.stringify({ id: 79, method: 'tool/requestUserInput', params: { schema: { prompt: 'x' } } })}\n`
    );

    await waitFor(() =>
      parseClientMessages(fake.writes).some(
        (entry) => entry.id === 79 && (entry.result as { answers?: Record<string, unknown> } | undefined)?.answers
      )
    );

    const userInputResponse = parseClientMessages(fake.writes).find((entry) => entry.id === 79);
    expect(userInputResponse).toMatchObject({ id: 79, result: { answers: {} } });
  });

  it('asks approval handler in prompt mode and stores always rule', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('prompt'), '/vault');
    const handler = jest.fn(async () => ({
      decision: 'accept' as const,
      alwaysRule: { kind: 'command' as const, pattern: 'git status' },
    }));
    runtime.setApprovalRequestHandler(handler);

    const readyPromise = runtime.ensureReady();
    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    fake.stdout.write(
      `${JSON.stringify({ id: 80, method: 'item/commandExecution/requestApproval', params: { command: 'git status' } })}\n`
    );

    await waitFor(() =>
      parseClientMessages(fake.writes).some(
        (entry) => entry.id === 80 && (entry.result as { decision?: string } | undefined)?.decision === 'accept'
      )
    );
    expect(handler).toHaveBeenCalledTimes(1);

    const secondHandler = jest.fn(async () => 'decline' as const);
    runtime.setApprovalRequestHandler(secondHandler);

    fake.stdout.write(
      `${JSON.stringify({ id: 81, method: 'item/commandExecution/requestApproval', params: { command: 'git status' } })}\n`
    );

    await waitFor(() =>
      parseClientMessages(fake.writes).some(
        (entry) => entry.id === 81 && (entry.result as { decision?: string } | undefined)?.decision === 'accept'
      )
    );

    expect(secondHandler).not.toHaveBeenCalled();
  });
});
