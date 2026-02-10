import type { App } from 'obsidian';
import { Modal } from 'obsidian';

export interface InlineEditGenerateHandlers {
  onDelta: (delta: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onComplete: () => void;
}

export interface InlineEditModalOptions {
  sourceLabel: string;
  sourceText: string;
  onApply: (value: string) => void;
  generateEdit: (handlers: InlineEditGenerateHandlers) => Promise<void>;
}

export class InlineEditModal extends Modal {
  private readonly sourceLabel: string;
  private readonly sourceText: string;
  private readonly onApply: (value: string) => void;
  private readonly generateEdit: (handlers: InlineEditGenerateHandlers) => Promise<void>;
  private proposedText = '';
  private proposedPreEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private acceptButtonEl: HTMLButtonElement | null = null;
  private isClosed = false;

  constructor(app: App, options: InlineEditModalOptions) {
    super(app);
    this.sourceLabel = options.sourceLabel;
    this.sourceText = options.sourceText;
    this.onApply = options.onApply;
    this.generateEdit = options.generateEdit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: 'Inline edit preview' });

    const sourceSection = contentEl.createDiv({ cls: 'codexian-inline-edit-source' });
    sourceSection.createEl('h4', { text: this.sourceLabel });
    sourceSection.createEl('pre', { text: this.sourceText || '(empty)' });

    const proposedSection = contentEl.createDiv({ cls: 'codexian-inline-edit-proposed' });
    proposedSection.createEl('h4', { text: 'Proposed' });
    this.proposedPreEl = proposedSection.createEl('pre', { text: '' });

    this.statusEl = contentEl.createDiv({ cls: 'codexian-inline-edit-status', text: 'Generating...' });

    const actions = contentEl.createDiv({ cls: 'codexian-modal-actions' });
    const cancelButton = actions.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
    this.acceptButtonEl = actions.createEl('button', {
      text: 'Accept',
      attr: { type: 'button' },
    });
    this.acceptButtonEl.disabled = true;

    cancelButton.addEventListener('click', () => {
      this.close();
    });

    this.acceptButtonEl.addEventListener('click', () => {
      this.onApply(this.proposedText);
      this.close();
    });

    void this.runGeneration();
  }

  onClose(): void {
    this.isClosed = true;
  }

  private async runGeneration(): Promise<void> {
    try {
      await this.generateEdit({
        onDelta: (delta) => {
          this.proposedText += delta;
          this.renderProposedText(this.proposedText);
        },
        onMessage: (message) => {
          this.proposedText = message;
          this.renderProposedText(this.proposedText);
        },
        onError: (message) => {
          this.setStatus(`Error: ${message}`);
        },
        onComplete: () => {
          this.setStatus('Ready to apply');
          if (this.acceptButtonEl) {
            this.acceptButtonEl.disabled = false;
          }
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.setStatus(`Error: ${message}`);
    }
  }

  private renderProposedText(text: string): void {
    if (this.isClosed || !this.proposedPreEl) {
      return;
    }
    this.proposedPreEl.textContent = text;
  }

  private setStatus(text: string): void {
    if (this.isClosed || !this.statusEl) {
      return;
    }
    this.statusEl.textContent = text;
  }
}
