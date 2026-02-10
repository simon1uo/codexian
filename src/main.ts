import { Plugin } from 'obsidian';

import { CodexRuntime } from './core/runtime';
import { SessionStorage } from './core/storage';
import type {
  AppServerThread,
  ChatMessage,
  CodexianConversation,
  CodexianData,
  CodexianSettings,
} from './core/types';
import { CodexianSettingTab, DEFAULT_SETTINGS } from './features/settings/CodexianSettings';
import { CodexianView, VIEW_TYPE_CODEXIAN } from './features/chat/CodexianView';

export default class CodexianPlugin extends Plugin {
  settings: CodexianSettings;
  runtime: CodexRuntime;
  private storage: SessionStorage;
  private activeConversationId: string | null = null;
  private conversation: CodexianConversation | null = null;

  onload(): void {
    void this.loadSettings()
      .then(() => {
      this.storage = new SessionStorage(this.app.vault.adapter);
      this.runtime = new CodexRuntime(this.settings, this.getVaultPath());
      this.runtime.setSettingsChangedHandler(async () => {
        await this.saveSettings();
      });

      this.registerView(
        VIEW_TYPE_CODEXIAN,
        (leaf) => new CodexianView(leaf, this)
      );

      this.addRibbonIcon('bot', 'Open codexian', () => {
        void this.activateView();
      });

      this.addCommand({
        id: 'open',
        name: 'Open',
        callback: () => {
          void this.activateView();
        },
      });

      const statusBarItem = this.addStatusBarItem();
      statusBarItem.setText('Codexian');
      statusBarItem.addEventListener('click', () => {
        void this.activateView();
      });

      this.addSettingTab(new CodexianSettingTab(this.app, this));
      })
      .catch((error) => {
        console.error('Failed to load Codexian settings', error);
      });
  }

  onunload(): void {
    void this.runtime.shutdown();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<CodexianData> | undefined;
    const loadedSettings = data?.settings ?? (data as Partial<CodexianSettings> | undefined);

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(loadedSettings ?? {}),
    };
    this.settings.envSnippets ??= [];
    this.settings.approvalRules ??= [];
    this.settings.commandBlocklist ??= [];
    this.settings.pathBlocklist ??= [];
    this.activeConversationId = data?.activeConversationId ?? null;
  }

  async saveSettings(): Promise<void> {
    const data: CodexianData = {
      settings: this.settings,
      activeConversationId: this.activeConversationId ?? undefined,
    };
    await this.saveData(data);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CODEXIAN)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_CODEXIAN,
          active: true,
        });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      await workspace.revealLeaf(leaf);
    }
  }

  async getConversation(): Promise<CodexianConversation> {
    if (this.conversation) {
      return this.conversation;
    }

    const thread = await this.runtime.startThread();
    const conversation = this.buildConversationFromThread(thread);
    this.conversation = conversation;
    this.activeConversationId = conversation.id;
    await this.saveSettings();
    await this.storage.saveConversation(conversation);
    return conversation;
  }

  async loadConversationFromThread(threadId: string): Promise<CodexianConversation> {
    const thread = await this.runtime.resumeThread(threadId);
    const baseConversation = this.buildConversationFromThread(thread);
    const local = await this.storage.loadConversation(threadId);
    const conversation = this.mergeConversation(baseConversation, local);
    this.conversation = conversation;
    this.activeConversationId = conversation.id;
    await this.saveSettings();
    await this.storage.saveConversation(conversation);
    return conversation;
  }

  async saveConversation(conversation: CodexianConversation): Promise<void> {
    this.conversation = conversation;
    const defaultsApplied = this.applyConversationDefaults(conversation);
    const settingsSynced = this.syncLastSelections(conversation);
    const shouldSaveSettings = defaultsApplied || settingsSynced;
    if (this.activeConversationId !== conversation.id) {
      this.activeConversationId = conversation.id;
      await this.saveSettings();
    } else if (shouldSaveSettings) {
      await this.saveSettings();
    }
    await this.storage.saveConversation(conversation);
  }

  async getLocalConversation(threadId: string): Promise<CodexianConversation | null> {
    return this.storage.loadConversation(threadId);
  }

  createConversationFromThread(thread: AppServerThread): CodexianConversation {
    return this.buildConversationFromThread(thread);
  }

  createMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private buildConversationFromThread(thread: AppServerThread): CodexianConversation {
    const now = Date.now();
    const createdAt = typeof thread.createdAt === 'number' ? thread.createdAt * 1000 : now;
    const updatedAt = typeof thread.updatedAt === 'number' ? thread.updatedAt * 1000 : now;
    const messages = this.buildMessagesFromThread(thread);

    return {
      id: thread.id,
      threadId: thread.id,
      title: thread.preview || 'Codexian Session',
      model: undefined,
      mode: undefined,
      createdAt,
      updatedAt,
      lastResponseAt: updatedAt,
      messages,
    };
  }

  private mergeConversation(
    base: CodexianConversation,
    local: CodexianConversation | null
  ): CodexianConversation {
    if (!local) {
      return base;
    }

    const preferredTitle =
      local.title && local.title !== 'Codexian Session' ? local.title : base.title;
    const mergedUpdatedAt = Math.max(base.updatedAt, local.updatedAt ?? 0);

    return {
      ...base,
      title: preferredTitle,
      model: local.model ?? base.model,
      reasoningEffort: local.reasoningEffort ?? base.reasoningEffort,
      mode: local.mode ?? base.mode,
      createdAt: local.createdAt ?? base.createdAt,
      updatedAt: mergedUpdatedAt || base.updatedAt,
      lastResponseAt: local.lastResponseAt ?? base.lastResponseAt,
    };
  }

  private buildMessagesFromThread(thread: AppServerThread): ChatMessage[] {
    const turns = thread.turns ?? [];
    const messages: ChatMessage[] = [];
    let offset = 0;

    for (const turn of turns) {
      const items = turn.items ?? [];
      for (const item of items) {
        if (item.type === 'userMessage') {
          const content = item.content ?? [];
          const text = content
            .filter((input) => input.type === 'text')
            .map((input) => input.text ?? '')
            .join('\n');
          if (!text) continue;
          messages.push({
            id: item.id ?? this.createMessageId(),
            role: 'user',
            content: text,
            timestamp: Date.now() + offset++,
          });
        }

        if (item.type === 'agentMessage' && typeof item.text === 'string') {
          messages.push({
            id: item.id ?? this.createMessageId(),
            role: 'assistant',
            content: item.text,
            timestamp: Date.now() + offset++,
          });
        }
      }
    }

    return messages;
  }

  private applyConversationDefaults(conversation: CodexianConversation): boolean {
    let changed = false;
    if (!conversation.mode && this.settings.lastMode) {
      conversation.mode = this.settings.lastMode;
      changed = true;
    }
    if (!conversation.model && this.settings.lastModel) {
      conversation.model = this.settings.lastModel;
      changed = true;
    }
    if (!conversation.reasoningEffort && this.settings.lastReasoningEffort) {
      conversation.reasoningEffort = this.settings.lastReasoningEffort;
      changed = true;
    }
    return changed;
  }

  private syncLastSelections(conversation: CodexianConversation): boolean {
    let changed = false;
    if (conversation.mode && conversation.mode !== this.settings.lastMode) {
      this.settings.lastMode = conversation.mode;
      changed = true;
    }
    if (conversation.model && conversation.model !== this.settings.lastModel) {
      this.settings.lastModel = conversation.model;
      changed = true;
    }
    if (
      conversation.reasoningEffort &&
      conversation.reasoningEffort !== this.settings.lastReasoningEffort
    ) {
      this.settings.lastReasoningEffort = conversation.reasoningEffort;
      changed = true;
    }
    return changed;
  }

  private getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath ?? '';
  }

  getVaultPathForFilter(): string {
    return this.getVaultPath();
  }
}
