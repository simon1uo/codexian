import type { ChatMessage } from '../../../core/types';

export class MessageRenderer {
  private messageEls = new Map<string, HTMLElement>();

  constructor(
    private container: HTMLElement,
    private onCopy: (text: string, button?: HTMLButtonElement) => Promise<void>,
    private renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>
  ) {}

  renderMessages(messages: ChatMessage[], append: (message: ChatMessage) => void): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.messageEls.clear();

    for (const message of messages) {
      append(message);
    }
  }

  appendMessage(message: ChatMessage, messageEl: HTMLElement): void {
    this.messageEls.set(message.id, messageEl);
  }

  updateMessage(message: ChatMessage, create: (message: ChatMessage) => HTMLElement): void {
    const messageEl = this.messageEls.get(message.id);
    if (!messageEl) {
      const created = create(message);
      this.messageEls.set(message.id, created);
      return;
    }
    const contentEl = messageEl.querySelector('.codexian-message-content');
    if (contentEl) {
      this.renderMessageContent(message.content, contentEl as HTMLElement);
    }
  }

  renderMessageContent(content: string, contentEl: HTMLElement): void {
    while (contentEl.firstChild) {
      contentEl.removeChild(contentEl.firstChild);
    }
    void this.renderMarkdown(content, contentEl);
  }

  bindCopyButton(button: HTMLButtonElement, content: string): void {
    button.addEventListener('click', () => {
      void this.onCopy(content, button);
    });
  }
}
