import type CodexianPlugin from '../../../main';
import type { CodexianConversation } from '../../../core/types';

export class ConversationController {
  constructor(private plugin: CodexianPlugin) {}

  async loadConversation(): Promise<CodexianConversation> {
    return this.plugin.getConversation();
  }

  async loadThreadConversation(threadId: string): Promise<CodexianConversation> {
    return this.plugin.loadConversationFromThread(threadId);
  }

  async createNewConversation(): Promise<CodexianConversation> {
    const thread = await this.plugin.runtime.startThread();
    const conversation = this.plugin.createConversationFromThread(thread);
    await this.plugin.saveConversation(conversation);
    return conversation;
  }

  async rollbackConversation(threadId: string, numTurns: number): Promise<CodexianConversation> {
    const thread = await this.plugin.runtime.rollbackThread(threadId, numTurns);
    return this.plugin.loadConversationFromThread(thread.id);
  }
}
