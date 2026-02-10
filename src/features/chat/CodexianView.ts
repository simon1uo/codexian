import * as path from 'path';
import type { WorkspaceLeaf } from 'obsidian';
import { ItemView, MarkdownRenderer, Menu, Modal, Notice, Setting } from 'obsidian';

import type CodexianPlugin from '../../main';
import type { AppServerModel } from '../../core/runtime';
import type {
  AppServerThread,
  ApprovalPolicy,
  ChatMessage,
  CodexianConversation,
  CodexianMode,
  SandboxPolicy,
} from '../../core/types';
import { normalizeModelSelection } from '../../utils/env';
import { MessageRenderer } from './rendering/MessageRenderer';
import { createIconButton } from '../../shared/components/iconButton';
import { setIcon } from '../../shared/icons';
import { ConversationController } from './controllers/ConversationController';
import { DEFAULT_CHAT_STATE, type ChatState } from './state/ChatState';

export const VIEW_TYPE_CODEXIAN = 'codexian-view';

const MODE_OPTIONS: Array<{
  value: CodexianMode;
  label: string;
  approvalPolicy: ApprovalPolicy;
  sandboxPolicy: SandboxPolicy;
}> = [
  {
    value: 'agent',
    label: 'Agent',
    approvalPolicy: 'on-request',
    sandboxPolicy: { type: 'workspaceWrite' },
  },
  {
    value: 'chat',
    label: 'Chat',
    approvalPolicy: 'on-request',
    sandboxPolicy: { type: 'readOnly' },
  },
  {
    value: 'agent-full',
    label: 'Agent (Full Access)',
    approvalPolicy: 'never',
    sandboxPolicy: { type: 'dangerFullAccess' },
  },
];

class SessionManagerModal extends Modal {
  private plugin: CodexianPlugin;
  private onSelect: (threadId: string) => void;
  private threads: AppServerThread[] = [];
  private searchValue = '';

  constructor(plugin: CodexianPlugin, onSelect: (threadId: string) => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Sessions' });
    const searchRow = contentEl.createDiv({ cls: 'codexian-session-search' });
    const searchInput = searchRow.createEl('input', {
      attr: { type: 'text', placeholder: 'Search sessions...' },
      cls: 'codexian-session-search-input',
    });
    const listEl = contentEl.createDiv({ cls: 'codexian-session-list' });

    const renderList = async (): Promise<void> => {
      listEl.empty();
      const vaultPath = this.normalizePath(this.plugin.getVaultPathForFilter());
      const filtered = this.threads.filter((thread) => {
        if (!vaultPath) return true;
        const cwd = thread?.cwd ? this.normalizePath(thread.cwd) : '';
        if (cwd && cwd === vaultPath) return true;
        const threadPath = thread?.path ? this.normalizePath(thread.path) : '';
        return threadPath.includes(vaultPath);
      });

      const entries = await Promise.all(
        filtered.map(async (thread) => {
          const local = await this.plugin.getLocalConversation(thread.id);
          const title = this.buildThreadTitle(thread, local);
          return { thread, title };
        })
      );

      const query = this.searchValue.trim().toLowerCase();
      const visible = query
        ? entries.filter((entry) => {
            const title = entry.title.toLowerCase();
            return title.includes(query) || entry.thread.id.toLowerCase().includes(query);
          })
        : entries;

      if (visible.length === 0) {
        listEl.createDiv({ text: 'No sessions found.' });
        return;
      }

      for (const entry of visible) {
        const thread = entry.thread;
        const row = listEl.createDiv({ cls: 'codexian-session-row' });
        const title = entry.title;
        const updated = thread.updatedAt ? new Date(thread.updatedAt * 1000).toLocaleString() : '';
        row.createDiv({ cls: 'codexian-session-title', text: title });
        row.createDiv({ cls: 'codexian-session-meta', text: updated });
        const actions = row.createDiv({ cls: 'codexian-session-actions' });

        const openBtn = actions.createEl('button', { text: 'Open' });
        openBtn.addEventListener('click', () => {
          this.onSelect(thread.id);
          this.close();
        });

        const forkBtn = actions.createEl('button', { text: 'Fork' });
        forkBtn.addEventListener('click', () => {
          void (async () => {
            const forked = await this.plugin.runtime.forkThread(thread.id);
            this.onSelect(forked.id);
            this.close();
          })();
        });

        const archiveBtn = actions.createEl('button', { text: 'Archive' });
        archiveBtn.addEventListener('click', () => {
          void (async () => {
            await this.plugin.runtime.archiveThread(thread.id);
            await loadThreads();
          })();
        });
      }
    };

    const loadThreads = async (): Promise<void> => {
      this.threads = await this.plugin.runtime.listThreads(false);
      await renderList();
    };

    searchInput.addEventListener('input', () => {
      this.searchValue = searchInput.value;
      void renderList();
    });

    void loadThreads();
  }

  private normalizePath(value: string): string {
    if (!value) return '';
    const normalized = path.normalize(value);
    return normalized.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  private buildThreadTitle(thread: AppServerThread, local: CodexianConversation | null): string {
    const fallback = (thread.preview || thread.id || '').toString();
    const candidate = local?.messages.find((message) => message.role === 'user')?.content ?? '';
    const cleaned = candidate.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      return this.truncateTitle(cleaned);
    }
    if (local?.title && local.title !== 'Codexian Session') {
      return local.title;
    }
    return fallback || 'Untitled Session';
  }

  private truncateTitle(value: string): string {
    const limit = 64;
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 3)}...`;
  }
}

class RollbackModal extends Modal {
  private onConfirm: (turns: number) => void;

  constructor(plugin: CodexianPlugin, onConfirm: (turns: number) => void) {
    super(plugin.app);
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Rollback' });

    let turnsValue = '1';

    new Setting(contentEl)
      .setName('Turns to rollback')
      .setDesc('Number of turns to drop from the end of the thread.')
      .addText((text) => {
        text.setValue(turnsValue);
        text.onChange((value) => {
          turnsValue = value;
        });
      });

    const actions = contentEl.createDiv({ cls: 'codexian-modal-actions' });
    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    const confirmBtn = actions.createEl('button', { text: 'Rollback' });

    cancelBtn.addEventListener('click', () => this.close());
    confirmBtn.addEventListener('click', () => {
      const parsed = Number.parseInt(turnsValue, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        new Notice('Invalid number of turns.');
        return;
      }
      this.onConfirm(parsed);
      this.close();
    });
  }
}

void RollbackModal;

export class CodexianView extends ItemView {
  private plugin: CodexianPlugin;
  private conversation: CodexianConversation | null = null;
  private statusEl: HTMLElement | null = null;
  private statusLineEl: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendButtonEl: HTMLButtonElement | null = null;
  private modeButtonEl: HTMLButtonElement | null = null;
  private modelButtonEl: HTMLButtonElement | null = null;
  private reasoningButtonEl: HTMLButtonElement | null = null;
  private state: ChatState = { ...DEFAULT_CHAT_STATE };
  private models: AppServerModel[] = [];
  private renderer: MessageRenderer | null = null;
  private conversationController: ConversationController;

  constructor(leaf: WorkspaceLeaf, plugin: CodexianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.conversationController = new ConversationController(plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_CODEXIAN;
  }

  getDisplayText(): string {
    return 'Codexian';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();
    container.addClass('codexian-view');

    const root = container.createDiv({ cls: 'codexian-root' });

    const header = root.createDiv({ cls: 'codexian-header' });
    const headerLeft = header.createDiv({ cls: 'codexian-brand' });
    headerLeft.createDiv({ cls: 'codexian-title', text: 'Codexian' });
    const headerActions = header.createDiv({ cls: 'codexian-actions' });

    this.messagesEl = root.createDiv({ cls: 'codexian-transcript' });
    this.renderer = new MessageRenderer(
      this.messagesEl,
      this.copyMessage.bind(this),
      this.renderMarkdown.bind(this)
    );

    const inputContainer = root.createDiv({ cls: 'codexian-input-container' });

    const inputRow = inputContainer.createDiv({ cls: 'codexian-input-row' });
    this.inputEl = inputRow.createEl('textarea', {
      cls: 'codexian-input',
      attr: { placeholder: 'Ask codex anything.' },
    });

    const bottomToolbar = inputContainer.createDiv({ cls: 'codexian-input-toolbar codexian-input-toolbar-bottom' });
    const toolbarBottomLeft = bottomToolbar.createDiv({ cls: 'codexian-toolbar-left' });
    const toolbarRight = bottomToolbar.createDiv({ cls: 'codexian-toolbar-right' });

    const sessionsButton = createIconButton(headerActions, 'history', {
      ariaLabel: 'Session history',
      className: 'codexian-action-btn codexian-icon-btn',
    });
    const newButton = createIconButton(headerActions, 'square-pen', {
      ariaLabel: 'New session',
      className: 'codexian-action-btn codexian-icon-btn',
    });

    sessionsButton.addEventListener('click', () => {
      const modal = new SessionManagerModal(this.plugin, (threadId) => {
        void this.loadThreadConversation(threadId);
      });
      modal.open();
    });

    newButton.addEventListener('click', () => {
      void this.createNewConversation();
    });

    this.modeButtonEl = createIconButton(toolbarBottomLeft, 'sliders-horizontal', {
      ariaLabel: 'Switch mode',
      className: 'codexian-action-btn codexian-icon-btn codexian-dropdown-btn',
      tooltip: 'Switch mode',
    });
    this.modeButtonEl.addEventListener('click', (event) => {
      this.openModeMenu(event);
    });

    this.modelButtonEl = createIconButton(toolbarBottomLeft, 'cpu', {
      ariaLabel: 'Select model',
      className: 'codexian-action-btn codexian-icon-btn codexian-dropdown-btn',
      tooltip: 'Select model',
    });
    this.modelButtonEl.addEventListener('click', (event) => {
      this.openModelMenu(event);
    });

    this.reasoningButtonEl = createIconButton(toolbarBottomLeft, 'brain', {
      ariaLabel: 'Select reasoning effort',
      className: 'codexian-action-btn codexian-icon-btn codexian-dropdown-btn',
      tooltip: 'Select reasoning effort',
    });
    this.reasoningButtonEl.addEventListener('click', (event) => {
      this.openReasoningMenu(event);
    });

    this.sendButtonEl = createIconButton(toolbarRight, 'arrow-up', {
      ariaLabel: 'Enter a message to get started.',
      className: 'codexian-send codexian-icon-btn',
    });
    this.sendButtonEl.addEventListener('click', () => {
      if (this.state.isRunning) {
        void this.handleCancel();
        return;
      }
      void this.handleSend();
    });

    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (event.ctrlKey && event.metaKey) {
        event.preventDefault();
        this.insertNewline();
        return;
      }
      event.preventDefault();
      void this.handleSend();
    });
    this.inputEl.addEventListener('input', () => {
      this.updateSendState();
    });

    root.createDiv({ cls: 'codexian-input-hint', text: '' });

    await this.runWithStatus('Load conversation', async () => {
      await this.loadConversation();
    });
    await this.runWithStatus('Load models', async () => {
      await this.loadModels();
    });
    this.updateSendState();
  }

  private async loadConversation(): Promise<void> {
    this.conversation = await this.conversationController.loadConversation();
    await this.applySelectionDefaults(this.conversation);
    this.renderMessages();
    this.syncSelections();
  }

  private async loadModels(): Promise<void> {
    try {
      this.models = await this.plugin.runtime.listModels();
    } catch {
      this.models = [];
    }
    if (this.conversation) {
      const normalized = normalizeModelSelection(this.conversation.model, this.models);
      if (normalized && normalized !== this.conversation.model) {
        this.conversation.model = normalized;
        void this.plugin.saveConversation(this.conversation);
        this.plugin.settings.lastModel = normalized;
        void this.plugin.saveSettings();
      }
    }
    this.normalizeEffortSelection();

    if (this.models.length === 0) {
      this.setStatus('Model list unavailable', 'error');
    } else if (this.statusEl?.textContent === 'Model list unavailable') {
      this.setStatus('Idle', 'idle');
    }
  }

  private async loadThreadConversation(threadId: string): Promise<void> {
    await this.runWithStatus('Load session', async () => {
      this.setStatus('Loading...', 'running');
      this.conversation = await this.conversationController.loadThreadConversation(threadId);
      await this.applySelectionDefaults(this.conversation);
      this.renderMessages();
      this.syncSelections();
      this.setStatus('Idle', 'idle');
    });
  }

  private async createNewConversation(): Promise<void> {
    await this.runWithStatus('Start session', async () => {
      this.setStatus('Starting...', 'running');
      this.conversation = await this.conversationController.createNewConversation();
      await this.applySelectionDefaults(this.conversation);
      this.renderMessages();
      this.syncSelections();
      this.setStatus('Idle', 'idle');
    });
  }

  private async rollbackConversation(numTurns: number): Promise<void> {
    if (!this.conversation?.threadId) {
      new Notice('No active thread to rollback.');
      return;
    }
    await this.runWithStatus('Rollback', async () => {
      this.setStatus('Rolling back...', 'running');
      this.conversation = await this.conversationController.rollbackConversation(
        this.conversation!.threadId!,
        numTurns
      );
      this.renderMessages();
      this.setStatus('Idle', 'idle');
    });
  }

  private renderMessages(): void {
    if (!this.messagesEl || !this.conversation || !this.renderer) return;
    this.renderer.renderMessages(this.conversation.messages, (message) => this.appendMessage(message));
    this.scrollToBottom();
  }

  private appendMessage(message: ChatMessage): void {
    if (!this.messagesEl || !this.renderer) return;

    const messageEl = this.messagesEl.createDiv({ cls: 'codexian-message' });
    messageEl.addClass(message.role === 'user' ? 'codexian-user' : 'codexian-assistant');
    const copyButton = messageEl.createEl('button', { cls: 'codexian-copy codexian-icon-btn' });
    copyButton.setAttribute('aria-label', 'Copy message');
    setIcon(copyButton, 'copy');
    this.renderer.bindCopyButton(copyButton, message.content);

    const contentEl = messageEl.createDiv({ cls: 'codexian-message-content codexian-message-bubble' });
    this.renderer.renderMessageContent(message.content, contentEl);

    this.renderer.appendMessage(message, messageEl);
  }

  private updateMessage(message: ChatMessage): void {
    if (!this.renderer) return;
    this.renderer.updateMessage(message, (item) => {
      const messageEl = this.messagesEl?.createDiv({ cls: 'codexian-message' }) ?? document.createElement('div');
      messageEl.addClass(item.role === 'user' ? 'codexian-user' : 'codexian-assistant');
      const copyButton = messageEl.createEl('button', { cls: 'codexian-copy codexian-icon-btn' });
      copyButton.setAttribute('aria-label', 'Copy message');
      setIcon(copyButton, 'copy');
      this.renderer?.bindCopyButton(copyButton, item.content);
      const contentEl = messageEl.createDiv({ cls: 'codexian-message-content codexian-message-bubble' });
      this.renderer?.renderMessageContent(item.content, contentEl);
      return messageEl;
    });
  }

  private async renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
    await MarkdownRenderer.render(this.app, markdown, el, '', this);
  }

  private syncSelections(): void {
    this.normalizeEffortSelection();
  }

  private setStatus(text: string, variant?: 'error' | 'running' | 'idle'): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
    if (this.statusLineEl) {
      this.statusLineEl.dataset.status = variant ?? '';
    }
    this.statusEl.classList.remove('codexian-status-error', 'codexian-status-running');
    if (variant === 'error') {
      this.statusEl.classList.add('codexian-status-error');
    } else if (variant === 'running') {
      this.statusEl.classList.add('codexian-status-running');
    }
  }

  private scrollToBottom(): void {
    if (!this.messagesEl) return;
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async handleSend(): Promise<void> {
    if (!this.inputEl || !this.sendButtonEl) return;
    if (this.state.isRunning) return;

    const prompt = this.inputEl.value.trim();
    if (!prompt) return;

    const conversation = this.conversation ?? await this.conversationController.loadConversation();
    this.conversation = conversation;

    const userMessage: ChatMessage = {
      id: this.plugin.createMessageId(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      id: this.plugin.createMessageId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    if (this.shouldAutoTitle(conversation)) {
      conversation.title = this.truncateTitle(prompt);
    }
    conversation.messages.push(userMessage, assistantMessage);
    conversation.updatedAt = Date.now();

    this.appendMessage(userMessage);
    this.appendMessage(assistantMessage);
    this.scrollToBottom();

    this.inputEl.value = '';
    this.state.isRunning = true;
    this.state.cancelRequested = false;
    this.state.activeTurnId = null;
    this.updateSendState();
    this.setStatus('Running...', 'running');
    await this.plugin.saveConversation(conversation);

    try {
      if (!conversation.threadId) {
        const thread = await this.plugin.runtime.startThread();
        conversation.threadId = thread.id;
        conversation.id = thread.id;
        await this.plugin.saveConversation(conversation);
      }
      const threadId = conversation.threadId;
      if (!threadId) {
        throw new Error('Missing thread id after session start.');
      }
      this.normalizeEffortSelection();
      const model = conversation.model;
      const effort = conversation.reasoningEffort;
      const { approvalPolicy, sandboxPolicy } = this.getModePolicies(conversation.mode);
      await this.plugin.runtime.startTurn(threadId, prompt, {
        onStart: (turnId) => {
          this.state.activeTurnId = turnId || null;
          if (this.state.cancelRequested && this.state.activeTurnId) {
            void this.plugin.runtime.interruptTurn(threadId, this.state.activeTurnId);
          }
        },
        onDelta: (delta) => {
          assistantMessage.content += delta;
          this.updateMessage(assistantMessage);
          this.scrollToBottom();
        },
        onMessage: (message) => {
          assistantMessage.content = message;
          this.updateMessage(assistantMessage);
          this.scrollToBottom();
        },
        onError: (message) => {
          const cleaned = message.trim();
          if (!cleaned) return;
          if (!assistantMessage.content) {
            assistantMessage.content = `Error: ${cleaned}`;
          }
          this.updateMessage(assistantMessage);
          this.setStatus(`Error: ${cleaned}`, 'error');
        },
        onComplete: () => {
          this.state.isRunning = false;
          this.state.activeTurnId = null;
          this.state.cancelRequested = false;
          if (assistantMessage.content) {
            conversation.lastResponseAt = Date.now();
          }
          conversation.updatedAt = Date.now();
          if (!this.statusEl?.classList.contains('codexian-status-error')) {
            this.setStatus('Idle', 'idle');
          }
          this.updateSendState();
          void this.plugin.saveConversation(conversation);
        },
      }, model, effort, approvalPolicy, sandboxPolicy);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      assistantMessage.content = `Error: ${message}`;
      this.updateMessage(assistantMessage);
      this.setStatus(`Error: ${message}`, 'error');
      this.state.isRunning = false;
      this.state.activeTurnId = null;
      this.state.cancelRequested = false;
      this.updateSendState();
    }
  }

  private async handleCancel(): Promise<void> {
    if (!this.state.isRunning || !this.conversation?.threadId) return;
    this.state.cancelRequested = true;
    if (this.state.activeTurnId) {
      await this.plugin.runtime.interruptTurn(this.conversation.threadId, this.state.activeTurnId);
    }
  }

  private updateSendState(): void {
    if (!this.sendButtonEl || !this.inputEl) return;
    const hasText = this.inputEl.value.trim().length > 0;
    this.sendButtonEl.disabled = !this.state.isRunning && !hasText;
    if (this.sendButtonEl) {
      if (this.state.isRunning) {
        this.sendButtonEl.addClass('codexian-sending');
        setIcon(this.sendButtonEl, 'square');
        this.sendButtonEl.setAttribute('aria-label', 'Stop');
      } else {
        this.sendButtonEl.removeClass('codexian-sending');
        setIcon(this.sendButtonEl, 'arrow-up');
        this.sendButtonEl.setAttribute('aria-label', 'Enter a message to get started.');
      }
    }
    if (this.modeButtonEl) {
      this.modeButtonEl.disabled = this.state.isRunning;
    }
    if (this.modelButtonEl) {
      this.modelButtonEl.disabled = this.state.isRunning;
    }
    if (this.reasoningButtonEl) {
      this.reasoningButtonEl.disabled = this.state.isRunning;
    }
  }

  private insertNewline(): void {
    if (!this.inputEl) return;
    const start = this.inputEl.selectionStart ?? this.inputEl.value.length;
    const end = this.inputEl.selectionEnd ?? start;
    const value = this.inputEl.value;
    this.inputEl.value = `${value.slice(0, start)}\n${value.slice(end)}`;
    const cursor = start + 1;
    this.inputEl.selectionStart = cursor;
    this.inputEl.selectionEnd = cursor;
    this.updateSendState();
  }

  private async runWithStatus(label: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.setStatus(`${label} failed: ${message}`, 'error');
      new Notice(message);
    }
  }

  private openModeMenu(event: MouseEvent): void {
    if (!this.conversation) return;
    const current = this.conversation.mode;
    const menu = new Menu();
    for (const option of MODE_OPTIONS) {
      menu.addItem((item) => {
        item.setTitle(option.label);
        if (current === option.value) {
          item.setChecked(true);
        }
        item.onClick(() => {
          if (!this.conversation) return;
          this.conversation.mode = option.value;
          void this.plugin.saveConversation(this.conversation);
          this.plugin.settings.lastMode = option.value;
          void this.plugin.saveSettings();
        });
      });
    }
    menu.showAtMouseEvent(event);
  }

  private openModelMenu(event: MouseEvent): void {
    if (!this.conversation) return;
    const current = this.conversation.model ?? '';
    const menu = new Menu();

    if (this.models.length === 0) {
      menu.addItem((item) => {
        item.setTitle('No models available');
        item.setDisabled(true);
      });
    } else {
      for (const model of this.models) {
        const label = model.displayName || model.model || model.id;
        menu.addItem((item) => {
          item.setTitle(label);
          if (current === model.id || current === model.model) {
            item.setChecked(true);
          }
          item.onClick(() => {
            if (!this.conversation) return;
            this.conversation.model = model.id;
            this.normalizeEffortSelection();
            void this.plugin.saveConversation(this.conversation);
            this.plugin.settings.lastModel = model.id;
            void this.plugin.saveSettings();
          });
        });
      }
    }

    menu.showAtMouseEvent(event);
  }

  private openReasoningMenu(event: MouseEvent): void {
    if (!this.conversation) return;
    this.normalizeEffortSelection();
    const current = this.conversation.reasoningEffort ?? '';
    const menu = new Menu();

    const options = this.getAvailableEfforts();
    for (const effort of options) {
      const label = effort.toUpperCase();
      menu.addItem((item) => {
        item.setTitle(label);
        if (current === effort) {
          item.setChecked(true);
        }
        item.onClick(() => {
          if (!this.conversation) return;
          this.conversation.reasoningEffort = effort;
          void this.plugin.saveConversation(this.conversation);
          this.plugin.settings.lastReasoningEffort = effort;
          void this.plugin.saveSettings();
        });
      });
    }

    menu.showAtMouseEvent(event);
  }

  private normalizeEffortSelection(): void {
    if (!this.conversation) return;
    const options = this.getAvailableEfforts();
    const current = this.conversation.reasoningEffort;
    if (current && options.includes(current)) {
      return;
    }
    const defaultEffort = this.getSelectedModel()?.defaultReasoningEffort;
    this.conversation.reasoningEffort =
      defaultEffort && options.includes(defaultEffort) ? defaultEffort : undefined;
  }

  private getAvailableEfforts(): string[] {
    const selectedModel = this.getSelectedModel();
    const supported = selectedModel?.supportedReasoningEfforts ?? [];
    if (supported.length > 0) {
      return supported.map((entry) => entry.reasoningEffort);
    }
    return ['low', 'medium', 'high'];
  }

  private getSelectedModel(): AppServerModel | undefined {
    const id = this.conversation?.model;
    if (id) {
      return this.models.find((model) => model.id === id || model.model === id);
    }
    return this.models.find((model) => model.isDefault);
  }

  private getModePolicies(
    mode?: CodexianMode
  ): { approvalPolicy?: ApprovalPolicy; sandboxPolicy?: SandboxPolicy } {
    if (!mode) {
      return {};
    }
    const match = MODE_OPTIONS.find((option) => option.value === mode);
    if (!match) {
      return {};
    }
    return { approvalPolicy: match.approvalPolicy, sandboxPolicy: match.sandboxPolicy };
  }

  private shouldAutoTitle(conversation: CodexianConversation): boolean {
    return !conversation.title || conversation.title === 'Codexian Session';
  }

  private async applySelectionDefaults(conversation: CodexianConversation): Promise<void> {
    let changed = false;

    if (!conversation.mode && this.plugin.settings.lastMode) {
      conversation.mode = this.plugin.settings.lastMode;
      changed = true;
    }

    if (!conversation.model && this.plugin.settings.lastModel) {
      conversation.model = this.plugin.settings.lastModel;
      changed = true;
    }

    if (!conversation.reasoningEffort && this.plugin.settings.lastReasoningEffort) {
      conversation.reasoningEffort = this.plugin.settings.lastReasoningEffort;
      changed = true;
    }

    if (changed) {
      await this.plugin.saveConversation(conversation);
    }
  }

  private truncateTitle(value: string): string {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'Untitled Session';
    const limit = 64;
    if (cleaned.length <= limit) return cleaned;
    return `${cleaned.slice(0, limit - 3)}...`;
  }

  private async copyMessage(text: string, button?: HTMLButtonElement): Promise<void> {
    const content = text ?? '';
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable.');
      }
      await navigator.clipboard.writeText(content);
      if (button) {
        button.classList.remove('codexian-copy-fail');
        button.classList.add('codexian-copy-success');
        window.setTimeout(() => {
          button.classList.remove('codexian-copy-success');
        }, 1200);
      }
    } catch {
      if (button) {
        button.classList.remove('codexian-copy-success');
        button.classList.add('codexian-copy-fail');
        window.setTimeout(() => {
          button.classList.remove('codexian-copy-fail');
        }, 1200);
      }
    }
  }
}
