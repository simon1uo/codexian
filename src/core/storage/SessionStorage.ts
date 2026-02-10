import type { DataAdapter } from 'obsidian';

import type {
  ChatMessage,
  CodexianConversation,
  CodexianConversationItem,
  CodexianMode,
} from '../types';

const SESSIONS_PATH = '.claude/sessions';

interface SessionMetaRecord {
  type: 'meta';
  id: string;
  title: string;
  model?: string;
  reasoningEffort?: string;
  mode?: CodexianMode;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  threadId?: string;
}

interface SessionMessageRecord {
  type: 'message';
  message: ChatMessage;
}

interface SessionItemRecord {
  type: 'item';
  threadId?: string;
  turnId?: string;
  itemId?: string;
  itemType: string;
  timestamp: number;
  item: unknown;
}

type SessionRecord = SessionMetaRecord | SessionMessageRecord | SessionItemRecord;

export class SessionStorage {
  constructor(private adapter: DataAdapter) {}

  async loadConversation(id: string): Promise<CodexianConversation | null> {
    const filePath = this.getFilePath(id);
    try {
      if (!(await this.adapter.exists(filePath))) {
        return null;
      }
      const content = await this.adapter.read(filePath);
      return this.parseJSONL(content);
    } catch {
      return null;
    }
  }

  async saveConversation(conversation: CodexianConversation): Promise<void> {
    await this.ensureSessionsDir();
    const filePath = this.getFilePath(conversation.id);
    const content = this.serializeToJSONL(conversation);
    await this.adapter.write(filePath, content);
  }

  private getFilePath(id: string): string {
    return `${SESSIONS_PATH}/${id}.jsonl`;
  }

  private async ensureSessionsDir(): Promise<void> {
    if (await this.adapter.exists(SESSIONS_PATH)) {
      return;
    }
    await this.adapter.mkdir(SESSIONS_PATH);
  }

  private parseJSONL(content: string): CodexianConversation | null {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return null;

    let meta: SessionMetaRecord | null = null;
    const messages: ChatMessage[] = [];
    const items: CodexianConversationItem[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as SessionRecord | { type?: unknown };
        if (record.type === 'meta') {
          meta = record as SessionMetaRecord;
        } else if (record.type === 'message') {
          messages.push((record as SessionMessageRecord).message);
        } else if (record.type === 'item') {
          const itemRecord = record as SessionItemRecord;
          items.push({
            threadId: itemRecord.threadId,
            turnId: itemRecord.turnId,
            itemId: itemRecord.itemId,
            itemType: itemRecord.itemType,
            timestamp: itemRecord.timestamp,
            item: itemRecord.item,
          });
        }
      } catch {
        continue;
      }
    }

    if (!meta) return null;

    return {
      id: meta.id,
      threadId: meta.threadId,
      title: meta.title,
      model: meta.model,
      reasoningEffort: meta.reasoningEffort,
      mode: meta.mode,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      lastResponseAt: meta.lastResponseAt,
      messages,
      items: items.length > 0 ? items : undefined,
    };
  }

  private serializeToJSONL(conversation: CodexianConversation): string {
    const meta: SessionMetaRecord = {
      type: 'meta',
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      reasoningEffort: conversation.reasoningEffort,
      mode: conversation.mode,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastResponseAt: conversation.lastResponseAt,
      threadId: conversation.threadId,
    };

    const lines: string[] = [JSON.stringify(meta)];
    for (const message of conversation.messages) {
      const record: SessionMessageRecord = { type: 'message', message };
      lines.push(JSON.stringify(record));
    }
    for (const item of conversation.items ?? []) {
      const record: SessionItemRecord = {
        type: 'item',
        threadId: item.threadId,
        turnId: item.turnId,
        itemId: item.itemId,
        itemType: item.itemType,
        timestamp: item.timestamp,
        item: item.item,
      };
      lines.push(JSON.stringify(record));
    }
    return `${lines.join('\n')}\n`;
  }
}
