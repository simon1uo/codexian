import { type ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { buildTurnInputItems, CodexRuntime } from '../../../../src/core/runtime';
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

  it('sends localImage input items when attachments are provided', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const turnPromise = runtime.startTurn(
      'thread-1',
      'Describe this image',
      {
        onStart: () => undefined,
        onDelta: () => undefined,
        onMessage: () => undefined,
        onError: () => undefined,
        onComplete: () => undefined,
      },
      undefined,
      undefined,
      undefined,
      undefined,
      ['/tmp/one.png', '/tmp/two.jpg']
    );

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'turn/start'));

    const turnStartRequest = parseClientMessages(fake.writes).find((entry) => entry.method === 'turn/start');
    const params = turnStartRequest?.params as { input?: unknown[] } | undefined;
    expect(params?.input).toEqual([
      { type: 'text', text: 'Describe this image' },
      { type: 'localImage', path: '/tmp/one.png' },
      { type: 'localImage', path: '/tmp/two.jpg' },
    ]);

    fake.stdout.write(`${JSON.stringify({ id: 2, result: { turn: { id: 'turn-1' } } })}\n`);
    await expect(turnPromise).resolves.toBeUndefined();
  });

  it('lists skills from skills/list and keeps raw fields', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const listPromise = runtime.listSkills();
    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'skills/list'));

    const request = parseClientMessages(fake.writes).find((entry) => entry.method === 'skills/list');
    expect(request).toMatchObject({
      id: 2,
      method: 'skills/list',
      params: { cwd: '/vault' },
    });

    fake.stdout.write(
      `${JSON.stringify({
        id: 2,
        result: {
          data: [
            { name: 'planner', path: '/skills/planner', label: 'Plan helper' },
            { name: '   ' },
            { path: '/skills/missing-name' },
          ],
        },
      })}\n`
    );

    await expect(listPromise).resolves.toEqual([
      { name: 'planner', path: '/skills/planner', label: 'Plan helper' },
    ]);
  });

  it('lists MCP server status from mcpServerStatus/list', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const listPromise = runtime.listMcpServerStatus();
    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'mcpServerStatus/list'));

    const request = parseClientMessages(fake.writes).find((entry) => entry.method === 'mcpServerStatus/list');
    expect(request).toMatchObject({
      id: 2,
      method: 'mcpServerStatus/list',
      params: { cwd: '/vault' },
    });

    fake.stdout.write(
      `${JSON.stringify({
        id: 2,
        result: {
          data: [
            { name: 'filesystem', status: 'connected', tools: [{ name: 'read_file' }], resources: [] },
            'invalid-entry',
          ],
        },
      })}\n`
    );

    await expect(listPromise).resolves.toEqual([
      { name: 'filesystem', status: 'connected', tools: [{ name: 'read_file' }], resources: [] },
    ]);
  });

  it('sends skill input item when a skill is selected', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const turnPromise = runtime.startTurn(
      'thread-1',
      '$planner Refine this plan',
      {
        onStart: () => undefined,
        onDelta: () => undefined,
        onMessage: () => undefined,
        onError: () => undefined,
        onComplete: () => undefined,
      },
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      { name: ' planner ', path: ' /skills/planner ' }
    );

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'turn/start'));

    const turnStartRequest = parseClientMessages(fake.writes).find((entry) => entry.method === 'turn/start');
    const params = turnStartRequest?.params as { input?: unknown[] } | undefined;
    expect(params?.input).toEqual([
      { type: 'text', text: '$planner Refine this plan' },
      { type: 'skill', name: 'planner', path: '/skills/planner' },
    ]);

    fake.stdout.write(`${JSON.stringify({ id: 2, result: { turn: { id: 'turn-2' } } })}\n`);
    await expect(turnPromise).resolves.toBeUndefined();
  });

  it('includes collaborationMode in turn/start params when set', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const turnPromise = runtime.startTurn(
      'thread-1',
      'Help me implement this',
      {
        onStart: () => undefined,
        onDelta: () => undefined,
        onMessage: () => undefined,
        onError: () => undefined,
        onComplete: () => undefined,
      },
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      undefined,
      ' code-review '
    );

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'turn/start'));

    const turnStartRequest = parseClientMessages(fake.writes).find((entry) => entry.method === 'turn/start');
    const params = turnStartRequest?.params as { collaborationMode?: string } | undefined;
    expect(params?.collaborationMode).toBe('code-review');

    fake.stdout.write(`${JSON.stringify({ id: 2, result: { turn: { id: 'turn-collab' } } })}\n`);
    await expect(turnPromise).resolves.toBeUndefined();
  });

  it('routes turn/plan/updated notifications to onPlanUpdated handler', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const onPlanUpdated = jest.fn();
    const onComplete = jest.fn();

    const turnPromise = runtime.startTurn('thread-1', 'Plan first', {
      onStart: () => undefined,
      onDelta: () => undefined,
      onMessage: () => undefined,
      onPlanUpdated,
      onError: () => undefined,
      onComplete,
    });

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'turn/start'));
    fake.stdout.write(`${JSON.stringify({ id: 2, result: { turn: { id: 'turn-9' } } })}\n`);
    await expect(turnPromise).resolves.toBeUndefined();

    fake.stdout.write(
      `${JSON.stringify({ method: 'turn/plan/updated', params: { turnId: 'turn-9', plan: { steps: ['a', 'b'] } } })}\n`
    );

    await waitFor(() => onPlanUpdated.mock.calls.length === 1);
    expect(onPlanUpdated).toHaveBeenCalledWith({ steps: ['a', 'b'] }, 'turn-9');

    fake.stdout.write(`${JSON.stringify({ method: 'turn/completed', params: { turn: { id: 'turn-9', status: 'completed' } } })}\n`);
    await waitFor(() => onComplete.mock.calls.length === 1);
  });

  it('routes turn/diff/updated notifications to onDiffUpdated handler', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const onDiffUpdated = jest.fn();
    const onComplete = jest.fn();

    const turnPromise = runtime.startTurn('thread-1', 'Review latest changes', {
      onStart: () => undefined,
      onDelta: () => undefined,
      onMessage: () => undefined,
      onDiffUpdated,
      onError: () => undefined,
      onComplete,
    });

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'turn/start'));
    fake.stdout.write(`${JSON.stringify({ id: 2, result: { turn: { id: 'turn-11' } } })}\n`);
    await expect(turnPromise).resolves.toBeUndefined();

    fake.stdout.write(
      `${JSON.stringify({ method: 'turn/diff/updated', params: { turnId: 'turn-11', diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new' } })}\n`
    );

    await waitFor(() => onDiffUpdated.mock.calls.length === 1);
    expect(onDiffUpdated).toHaveBeenCalledWith('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new', 'turn-11');

    fake.stdout.write(`${JSON.stringify({ method: 'turn/completed', params: { turn: { id: 'turn-11', status: 'completed' } } })}\n`);
    await waitFor(() => onComplete.mock.calls.length === 1);
  });

  it('sends turn/steer request with expectedTurnId and text input', async () => {
    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const readyPromise = runtime.ensureReady();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
    await readyPromise;

    const steerPromise = runtime.steerTurn('thread-1', 'turn-2', '  Focus on failing tests only.  ');

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.method === 'turn/steer'));

    const steerRequest = parseClientMessages(fake.writes).find((entry) => entry.method === 'turn/steer');
    expect(steerRequest).toMatchObject({
      id: 2,
      method: 'turn/steer',
      params: {
        threadId: 'thread-1',
        expectedTurnId: 'turn-2',
        input: [{ type: 'text', text: 'Focus on failing tests only.' }],
      },
    });

    fake.stdout.write(`${JSON.stringify({ id: 2, result: {} })}\n`);
    await expect(steerPromise).resolves.toBeUndefined();
  });
});

describe('buildTurnInputItems', () => {
  it('builds text + localImage items from prompt and attachment paths', () => {
    expect(buildTurnInputItems('hello', ['/tmp/a.png', '  ', '/tmp/b.jpg'])).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'localImage', path: '/tmp/a.png' },
      { type: 'localImage', path: '/tmp/b.jpg' },
    ]);
  });

  it('builds text + skill item when a skill is provided', () => {
    expect(buildTurnInputItems('$skill-name hello', [], { name: ' skill-name ', path: ' /skills/skill-name ' })).toEqual([
      { type: 'text', text: '$skill-name hello' },
      { type: 'skill', name: 'skill-name', path: '/skills/skill-name' },
    ]);
  });
});
