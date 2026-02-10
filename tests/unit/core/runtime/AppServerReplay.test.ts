import { type ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';

import { CodexRuntime } from '../../../../src/core/runtime';
import type { AppServerItem, CodexianSettings } from '../../../../src/core/types';

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

type RpcEntry = Record<string, unknown>;

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

const parseClientMessages = (writes: string[]): RpcEntry[] => {
  return writes
    .flatMap((chunk) => chunk.split('\n'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RpcEntry);
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

const replayFixturePath = path.resolve(__dirname, '../../../fixtures/app-server/replay-basic.jsonl');

const loadReplayEntries = (): RpcEntry[] => {
  const raw = fs.readFileSync(replayFixturePath, 'utf8').trim();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RpcEntry);
};

const isResponseWithId = (entry: RpcEntry, id: number): boolean =>
  typeof entry.id === 'number' && entry.id === id && typeof entry.method !== 'string';

const isNotification = (entry: RpcEntry, method: string): boolean =>
  typeof entry.method === 'string' && entry.method === method;

describe('AppServer replay fixture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replays JSONL transcript for initialize/thread/startTurn happy path', async () => {
    const fixtureEntries = loadReplayEntries();
    const initResponse = fixtureEntries.find((entry) => isResponseWithId(entry, 1));
    const threadStartResponse = fixtureEntries.find((entry) => isResponseWithId(entry, 2));
    const turnStartResponse = fixtureEntries.find((entry) => isResponseWithId(entry, 3));
    const replayNotifications = fixtureEntries.filter((entry) => typeof entry.method === 'string');

    expect(initResponse).toBeDefined();
    expect(threadStartResponse).toBeDefined();
    expect(turnStartResponse).toBeDefined();
    expect(replayNotifications.some((entry) => isNotification(entry, 'item/started'))).toBe(true);
    expect(replayNotifications.some((entry) => isNotification(entry, 'item/completed'))).toBe(true);

    const fake = createFakeChild();
    mockSpawn.mockReturnValue(fake.child);

    const runtime = new CodexRuntime(buildSettings('safe'), '/vault');
    const startThreadPromise = runtime.startThread();

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.id === 1 && entry.method === 'initialize'));
    fake.stdout.write(`${JSON.stringify(initResponse)}\n`);

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.id === 2 && entry.method === 'thread/start'));
    fake.stdout.write(`${JSON.stringify(threadStartResponse)}\n`);

    await expect(startThreadPromise).resolves.toMatchObject({ id: 'thread-replay' });

    const starts: string[] = [];
    const deltas: string[] = [];
    const messages: string[] = [];
    const startedItems: AppServerItem[] = [];
    const completedItems: AppServerItem[] = [];
    const errors: string[] = [];
    let completed = false;

    const turnPromise = runtime.startTurn('thread-replay', 'Say hello', {
      onStart: (turnId) => starts.push(turnId),
      onDelta: (delta) => deltas.push(delta),
      onMessage: (message) => messages.push(message),
      onItemStarted: (item) => startedItems.push(item),
      onItemCompleted: (item) => completedItems.push(item),
      onError: (message) => errors.push(message),
      onComplete: () => {
        completed = true;
      },
    });

    await waitFor(() => parseClientMessages(fake.writes).some((entry) => entry.id === 3 && entry.method === 'turn/start'));

    for (const notification of replayNotifications) {
      fake.stdout.write(`${JSON.stringify(notification)}\n`);
    }
    fake.stdout.write(`${JSON.stringify(turnStartResponse)}\n`);

    await turnPromise;

    expect(starts).toEqual(['turn-replay']);
    expect(deltas).toEqual(['Hello', ' world']);
    expect(messages).toEqual(['Hello world']);
    expect(startedItems.map((item) => item.type)).toEqual(['agentMessage', 'plan']);
    expect(completedItems.map((item) => item.type)).toEqual(['plan', 'agentMessage']);
    expect(completedItems[0]).toMatchObject({
      id: 'item-plan-1',
      type: 'plan',
      raw: {
        id: 'item-plan-1',
        type: 'plan',
        title: 'Draft response',
        steps: ['outline', 'finalize'],
      },
    });
    expect(errors).toEqual([]);
    expect(completed).toBe(true);
  });
});
