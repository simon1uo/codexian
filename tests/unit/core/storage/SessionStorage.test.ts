import { SessionStorage } from '../../../../src/core/storage/SessionStorage';
import type { CodexianConversation } from '../../../../src/core/types';

class InMemoryAdapter {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }
}

const makeConversation = (): CodexianConversation => ({
  id: 'session-1',
  threadId: 'thread-1',
  title: 'Test Conversation',
  model: 'gpt-5',
  reasoningEffort: 'medium',
  mode: 'agent',
  createdAt: 1,
  updatedAt: 2,
  lastResponseAt: 3,
  messages: [
    { id: 'm1', role: 'user', content: 'hello', timestamp: 10 },
    { id: 'm2', role: 'assistant', content: 'hi', timestamp: 11 },
  ],
  items: [
    {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
      itemType: 'toolResult',
      timestamp: 12,
      item: { tool: 'read_file', status: 'completed' },
    },
  ],
});

describe('SessionStorage', () => {
  it('roundtrip saves and loads JSONL conversation using expected path', async () => {
    const adapter = new InMemoryAdapter();
    const storage = new SessionStorage(adapter as never);
    const conversation = makeConversation();

    await storage.saveConversation(conversation);

    expect(adapter.dirs.has('.claude/sessions')).toBe(true);
    expect(adapter.files.has('.claude/sessions/session-1.jsonl')).toBe(true);

    const loaded = await storage.loadConversation('session-1');
    expect(loaded).toEqual(conversation);
  });

  it('ignores corrupt JSONL lines while loading', async () => {
    const adapter = new InMemoryAdapter();
    const storage = new SessionStorage(adapter as never);
    const filePath = '.claude/sessions/corrupt.jsonl';

    adapter.files.set(
      filePath,
      `${JSON.stringify({ type: 'meta', id: 'corrupt', title: 'Corrupt', createdAt: 1, updatedAt: 2 })}\n` +
      `${JSON.stringify({ type: 'unknown', payload: 123 })}\n` +
      `not-json\n` +
      `${JSON.stringify({ type: 'item', itemType: 'toolResult', timestamp: 4, item: { ok: true } })}\n` +
      `${JSON.stringify({ type: 'message', message: { id: 'm1', role: 'assistant', content: 'ok', timestamp: 3 } })}\n`
    );

    const loaded = await storage.loadConversation('corrupt');
    expect(loaded).toMatchObject({
      id: 'corrupt',
      title: 'Corrupt',
      createdAt: 1,
      updatedAt: 2,
    });
    expect(loaded?.messages).toEqual([{ id: 'm1', role: 'assistant', content: 'ok', timestamp: 3 }]);
    expect(loaded?.items).toEqual([{ itemType: 'toolResult', timestamp: 4, item: { ok: true } }]);
  });

  it('roundtrip persists item records in JSONL', async () => {
    const adapter = new InMemoryAdapter();
    const storage = new SessionStorage(adapter as never);
    const conversation = makeConversation();

    await storage.saveConversation(conversation);

    const saved = adapter.files.get('.claude/sessions/session-1.jsonl');
    expect(saved).toContain('"type":"item"');

    const loaded = await storage.loadConversation('session-1');
    expect(loaded?.items).toEqual(conversation.items);
  });

  it('returns null when JSONL has no meta record', async () => {
    const adapter = new InMemoryAdapter();
    const storage = new SessionStorage(adapter as never);

    adapter.files.set(
      '.claude/sessions/no-meta.jsonl',
      `${JSON.stringify({ type: 'message', message: { id: 'm1', role: 'user', content: 'x', timestamp: 1 } })}\n`
    );

    await expect(storage.loadConversation('no-meta')).resolves.toBeNull();
  });
});
