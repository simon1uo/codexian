import type { ChatMessage } from '../../../../src/core/types';
import { MessageRenderer } from '../../../../src/features/chat/rendering/MessageRenderer';

class MockElement {
  public className = '';
  public textContent: string | null = null;
  public children: MockElement[] = [];
  private listeners: Record<string, Array<() => void>> = {};

  get firstChild(): MockElement | null {
    return this.children[0] ?? null;
  }

  get childElementCount(): number {
    return this.children.length;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    return child;
  }

  querySelector(selector: string): MockElement | null {
    if (selector !== '.codexian-message-content') {
      return null;
    }
    return this.children.find((child) => child.className.includes('codexian-message-content')) ?? null;
  }

  addEventListener(event: string, callback: () => void): void {
    const current = this.listeners[event] ?? [];
    current.push(callback);
    this.listeners[event] = current;
  }

  trigger(event: string): void {
    for (const callback of this.listeners[event] ?? []) {
      callback();
    }
  }
}

describe('MessageRenderer', () => {
  const createMessage = (overrides?: Partial<ChatMessage>): ChatMessage => ({
    id: 'm1',
    role: 'assistant',
    content: 'hello',
    timestamp: Date.now(),
    ...overrides,
  });

  const asHtmlEl = (el: MockElement): HTMLElement => el as unknown as HTMLElement;

  it('renderMessages clears container with standard DOM API', () => {
    const container = new MockElement();
    container.appendChild(new MockElement());
    const renderer = new MessageRenderer(asHtmlEl(container), jest.fn().mockResolvedValue(undefined), async () => undefined);
    const messages = [createMessage({ id: '1' }), createMessage({ id: '2' })];
    const append = jest.fn();

    renderer.renderMessages(messages, append);

    expect(container.childElementCount).toBe(0);
    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenNthCalledWith(1, messages[0]);
    expect(append).toHaveBeenNthCalledWith(2, messages[1]);
  });

  it('updateMessage re-renders message content as markdown', async () => {
    const container = new MockElement();
    const renderMarkdown = jest.fn(async (markdown: string, el: HTMLElement) => {
      const mockEl = el as unknown as MockElement;
      mockEl.textContent = `md:${markdown}`;
    });
    const renderer = new MessageRenderer(asHtmlEl(container), jest.fn().mockResolvedValue(undefined), renderMarkdown);
    const message = createMessage({ id: 'assistant-1', content: 'old text' });

    const messageEl = new MockElement();
    const contentEl = new MockElement();
    contentEl.className = 'codexian-message-content';
    contentEl.textContent = 'Stale.';
    messageEl.appendChild(contentEl);
    renderer.appendMessage(message, asHtmlEl(messageEl));

    renderer.updateMessage({ ...message, content: '**new** text' }, () => asHtmlEl(messageEl));
    await Promise.resolve();

    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    expect(renderMarkdown).toHaveBeenCalledWith('**new** text', asHtmlEl(contentEl));
    expect(contentEl.textContent).toBe('md:**new** text');
  });

  it('updateMessage creates and tracks element when message is missing', () => {
    const container = new MockElement();
    const renderer = new MessageRenderer(asHtmlEl(container), jest.fn().mockResolvedValue(undefined), async () => undefined);
    const message = createMessage({ id: 'missing-id' });
    const created = new MockElement();
    const create = jest.fn(() => asHtmlEl(created));

    renderer.updateMessage(message, create);
    renderer.updateMessage({ ...message, content: 'updated' }, create);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
