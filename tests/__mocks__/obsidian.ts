type MockEventHandler = () => void;

export class MockElement {
  public textContent: string;
  public hidden = false;
  public disabled = false;
  public className = '';
  public children: MockElement[] = [];
  public readonly listeners: Record<string, MockEventHandler[]> = {};
  public readonly dataset: Record<string, string> = {};

  constructor(public readonly tag: string = 'div', text = '') {
    this.textContent = text;
  }

  createEl(tag: string, options?: { text?: string; cls?: string; attr?: Record<string, string> }): MockElement {
    const child = new MockElement(tag, options?.text ?? '');
    if (options?.cls) {
      child.className = options.cls;
    }
    if (options?.attr && options.attr.type === 'button') {
      child.disabled = false;
    }
    this.children.push(child);
    return child;
  }

  createDiv(options?: { text?: string; cls?: string }): MockElement {
    return this.createEl('div', options);
  }

  createSpan(options?: { text?: string; cls?: string }): MockElement {
    return this.createEl('span', options);
  }

  empty(): void {
    this.children = [];
    this.textContent = '';
  }

  addClass(...classNames: string[]): void {
    const current = new Set(this.className.split(' ').filter((entry) => entry));
    for (const className of classNames) {
      current.add(className);
    }
    this.className = Array.from(current).join(' ');
  }

  removeClass(...classNames: string[]): void {
    const toRemove = new Set(classNames);
    this.className = this.className
      .split(' ')
      .filter((entry) => entry && !toRemove.has(entry))
      .join(' ');
  }

  setText(value: string): void {
    this.textContent = value;
  }

  show(): void {
    this.hidden = false;
  }

  hide(): void {
    this.hidden = true;
  }

  addEventListener(event: string, handler: MockEventHandler): void {
    const current = this.listeners[event] ?? [];
    current.push(handler);
    this.listeners[event] = current;
  }

  trigger(event: string): void {
    for (const handler of this.listeners[event] ?? []) {
      handler();
    }
  }

  querySelector(selector: string): MockElement | null {
    if (!selector.startsWith('.')) {
      return null;
    }
    const cls = selector.slice(1);
    return this.findByClass(cls);
  }

  private findByClass(cls: string): MockElement | null {
    if (this.className.split(' ').includes(cls)) {
      return this;
    }
    for (const child of this.children) {
      const found = child.findByClass(cls);
      if (found) {
        return found;
      }
    }
    return null;
  }
}

export class Plugin {}

export class PluginSettingTab {}

export class ItemView {}

export class WorkspaceLeaf {}

export class App {}

export class MarkdownView {
  editor?: unknown;
}

export class Setting {}

export class TextAreaComponent {}

export class Modal {
  public contentEl: MockElement;

  constructor(public app: unknown) {
    this.contentEl = new MockElement('div');
  }

  open(): void {
    this.onOpen();
  }

  close(): void {
    this.onClose();
  }

  onOpen(): void {
    // no-op
  }

  onClose(): void {
    // no-op
  }
}

export class Notice {
  constructor(public readonly message: string) {}
}

export class Menu {
  addItem(callback: (item: { setTitle: (title: string) => void; setDisabled: (disabled: boolean) => void; setChecked: (checked: boolean) => void; onClick: (handler: () => void) => void }) => void): void {
    const item = {
      setTitle: () => undefined,
      setDisabled: () => undefined,
      setChecked: () => undefined,
      onClick: () => undefined,
    };
    callback(item);
  }

  showAtMouseEvent(): void {
    // no-op
  }
}

export const MarkdownRenderer = {
  renderMarkdown: async () => undefined,
  render: async () => undefined,
};

export const setIcon = () => undefined;

export class TFile {
  path: string;

  constructor(path = '') {
    this.path = path;
  }
}
