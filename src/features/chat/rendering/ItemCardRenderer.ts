import type { AppServerItem } from '../../../core/types';

type SupportedItemCardType = 'commandExecution' | 'fileChange' | 'plan' | 'reasoning' | 'mcpToolCall';

interface ItemCardEntry {
  type: SupportedItemCardType;
  cardEl: HTMLElement;
  statusEl: HTMLElement;
  bodyEl: HTMLElement;
  outputEl?: HTMLElement;
  toggleButtonEl?: HTMLButtonElement;
  collapsibleEl?: HTMLElement;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const getArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const isSupportedItemType = (type: string): type is SupportedItemCardType =>
  type === 'commandExecution' ||
  type === 'fileChange' ||
  type === 'plan' ||
  type === 'reasoning' ||
  type === 'mcpToolCall';

const stringifyJson = (value: unknown): string => JSON.stringify(value ?? {}, null, 2);

export class ItemCardRenderer {
  private entriesByKey = new Map<string, ItemCardEntry>();
  private sequence = 0;
  private latestCommandCardKey: string | null = null;

  constructor(private transcriptEl: HTMLElement) {}

  reset(): void {
    this.entriesByKey.clear();
    this.sequence = 0;
    this.latestCommandCardKey = null;
  }

  beginTurn(): void {
    this.latestCommandCardKey = null;
  }

  handleItemStarted(item: AppServerItem): void {
    if (!isSupportedItemType(item.type)) return;

    const raw = this.getRaw(item);
    const key = this.getItemKey(item);
    const cardEl = document.createElement('div');
    cardEl.className = `codexian-item-card codexian-item-${item.type}`;
    cardEl.dataset.itemType = item.type;
    cardEl.dataset.status = 'running';

    const headerEl = document.createElement('div');
    headerEl.className = 'codexian-item-card-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'codexian-item-card-title';
    titleEl.textContent = item.type;

    const statusEl = document.createElement('div');
    statusEl.className = 'codexian-item-card-status';
    statusEl.textContent = 'Running';

    headerEl.appendChild(titleEl);
    headerEl.appendChild(statusEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'codexian-item-card-body';

    cardEl.appendChild(headerEl);
    cardEl.appendChild(bodyEl);
    this.transcriptEl.appendChild(cardEl);

    const entry: ItemCardEntry = {
      type: item.type,
      cardEl,
      statusEl,
      bodyEl,
    };
    this.entriesByKey.set(key, entry);

    if (item.type === 'commandExecution') {
      this.renderCommandExecution(entry, raw);
      this.latestCommandCardKey = key;
    } else if (item.type === 'fileChange') {
      this.renderFileChange(entry, raw);
    } else if (item.type === 'plan') {
      this.renderPlan(entry, raw);
    } else if (item.type === 'mcpToolCall') {
      this.renderMcpToolCall(entry, raw);
    } else {
      this.renderReasoning(entry, raw);
    }
  }

  handleCommandExecutionOutputDelta(delta: string): void {
    if (!delta) return;
    if (!this.latestCommandCardKey) return;

    const entry = this.entriesByKey.get(this.latestCommandCardKey);
    if (!entry?.outputEl) return;
    entry.outputEl.textContent = `${entry.outputEl.textContent ?? ''}${delta}`;
  }

  handleItemCompleted(item: AppServerItem): void {
    if (!isSupportedItemType(item.type)) return;
    const key = this.resolveItemKey(item);
    if (!key) return;

    const entry = this.entriesByKey.get(key);
    if (!entry) return;
    entry.statusEl.textContent = 'Completed';
    entry.cardEl.dataset.status = 'completed';

    const raw = this.getRaw(item);
    if (entry.type === 'commandExecution') {
      const finalOutput =
        getString(raw?.output) ?? getString(raw?.stdout) ?? getString(raw?.combinedOutput) ?? getString(raw?.text);
      if (finalOutput && entry.outputEl) {
        entry.outputEl.textContent = finalOutput;
      }
    }
    if (entry.type === 'reasoning' && raw) {
      const summary =
        getString(raw.summary) ?? getString(raw.summaryText) ?? getString(raw.text) ?? getString(raw.reasoning);
      if (summary) {
        const summaryEl = entry.bodyEl.querySelector('.codexian-item-reasoning-summary');
        if (summaryEl) {
          summaryEl.textContent = summary;
        }
      }
    }

    if (entry.type === 'mcpToolCall') {
      const status = getString(raw?.status) ?? getString(raw?.state) ?? 'completed';
      const statusLabel = status.slice(0, 1).toUpperCase() + status.slice(1);
      entry.statusEl.textContent = statusLabel;
      if (status.toLowerCase() === 'error' || status.toLowerCase() === 'failed') {
        entry.cardEl.dataset.status = 'error';
      }
    }
  }

  private getRaw(item: AppServerItem): Record<string, unknown> | undefined {
    if ('raw' in item && isRecord(item.raw)) {
      return item.raw;
    }
    return undefined;
  }

  private getItemKey(item: AppServerItem): string {
    const id = getString(item.id);
    if (id) return id;
    this.sequence += 1;
    return `${item.type}-${this.sequence}`;
  }

  private resolveItemKey(item: AppServerItem): string | null {
    const id = getString(item.id);
    if (id && this.entriesByKey.has(id)) {
      return id;
    }
    if (item.type === 'commandExecution' && this.latestCommandCardKey) {
      return this.latestCommandCardKey;
    }
    return null;
  }

  private renderCommandExecution(entry: ItemCardEntry, raw?: Record<string, unknown>): void {
    const command =
      getString(raw?.command) ??
      getString(raw?.commandLine) ??
      getString(raw?.cmd) ??
      getString(raw?.input) ??
      null;

    if (command) {
      const commandEl = document.createElement('code');
      commandEl.className = 'codexian-item-command';
      commandEl.textContent = command;
      entry.bodyEl.appendChild(commandEl);
    }

    const outputEl = document.createElement('pre');
    outputEl.className = 'codexian-item-output';
    const initialOutput =
      getString(raw?.output) ?? getString(raw?.stdout) ?? getString(raw?.combinedOutput) ?? getString(raw?.text) ?? '';
    outputEl.textContent = initialOutput;
    entry.bodyEl.appendChild(outputEl);
    entry.outputEl = outputEl;

    if (!command) {
      this.appendJsonFallback(entry.bodyEl, raw);
    }
  }

  private renderFileChange(entry: ItemCardEntry, raw?: Record<string, unknown>): void {
    const files = getArray(raw?.files)
      .map((value) => {
        if (typeof value === 'string') return value;
        if (!isRecord(value)) return null;
        return getString(value.path) ?? getString(value.filePath) ?? getString(value.newPath) ?? null;
      })
      .filter((value): value is string => !!value);

    if (files.length > 0) {
      const listEl = document.createElement('ul');
      listEl.className = 'codexian-item-file-list';
      for (const file of files) {
        const itemEl = document.createElement('li');
        itemEl.textContent = file;
        listEl.appendChild(itemEl);
      }
      entry.bodyEl.appendChild(listEl);
    }

    const diffText =
      getString(raw?.unifiedDiff) ?? getString(raw?.diff) ?? getString(raw?.patch) ?? getString(raw?.diffText) ?? null;

    if (diffText) {
      const controlsEl = document.createElement('div');
      controlsEl.className = 'codexian-item-card-controls';
      const toggleButtonEl = document.createElement('button');
      toggleButtonEl.className = 'codexian-item-toggle';
      toggleButtonEl.type = 'button';
      toggleButtonEl.textContent = 'Expand diff';
      controlsEl.appendChild(toggleButtonEl);

      const diffPre = document.createElement('pre');
      diffPre.className = 'codexian-item-diff';
      diffPre.textContent = diffText;
      diffPre.hidden = true;

      toggleButtonEl.addEventListener('click', () => {
        const expanded = !diffPre.hidden;
        diffPre.hidden = expanded;
        toggleButtonEl.textContent = expanded ? 'Expand diff' : 'Collapse diff';
      });

      entry.bodyEl.appendChild(controlsEl);
      entry.bodyEl.appendChild(diffPre);
      entry.toggleButtonEl = toggleButtonEl;
      entry.collapsibleEl = diffPre;
      return;
    }

    this.appendJsonFallback(entry.bodyEl, raw);
  }

  private renderPlan(entry: ItemCardEntry, raw?: Record<string, unknown>): void {
    const steps = getArray(raw?.steps)
      .map((value) => {
        if (typeof value === 'string') return value;
        if (!isRecord(value)) return null;
        return getString(value.text) ?? getString(value.title) ?? getString(value.description) ?? null;
      })
      .filter((value): value is string => !!value);

    if (steps.length > 0) {
      const listEl = document.createElement('ol');
      listEl.className = 'codexian-item-plan-list';
      for (const step of steps) {
        const itemEl = document.createElement('li');
        itemEl.textContent = step;
        listEl.appendChild(itemEl);
      }
      entry.bodyEl.appendChild(listEl);
      return;
    }

    this.appendJsonFallback(entry.bodyEl, raw);
  }

  private renderReasoning(entry: ItemCardEntry, raw?: Record<string, unknown>): void {
    const summary =
      getString(raw?.summary) ?? getString(raw?.summaryText) ?? getString(raw?.text) ?? getString(raw?.reasoning) ?? null;

    if (summary) {
      const summaryEl = document.createElement('div');
      summaryEl.className = 'codexian-item-reasoning-summary';
      summaryEl.textContent = summary;
      entry.bodyEl.appendChild(summaryEl);
    }

    const controlsEl = document.createElement('div');
    controlsEl.className = 'codexian-item-card-controls';
    const toggleButtonEl = document.createElement('button');
    toggleButtonEl.className = 'codexian-item-toggle';
    toggleButtonEl.type = 'button';
    toggleButtonEl.textContent = 'Show raw reasoning';
    controlsEl.appendChild(toggleButtonEl);

    const rawEl = document.createElement('pre');
    rawEl.className = 'codexian-item-reasoning-raw';
    rawEl.textContent = stringifyJson(raw ?? {});
    rawEl.hidden = true;

    toggleButtonEl.addEventListener('click', () => {
      const expanded = !rawEl.hidden;
      rawEl.hidden = expanded;
      toggleButtonEl.textContent = expanded ? 'Show raw reasoning' : 'Hide raw reasoning';
    });

    entry.bodyEl.appendChild(controlsEl);
    entry.bodyEl.appendChild(rawEl);

    entry.toggleButtonEl = toggleButtonEl;
    entry.collapsibleEl = rawEl;

    if (!summary) {
      this.appendJsonFallback(entry.bodyEl, raw);
    }
  }

  private renderMcpToolCall(entry: ItemCardEntry, raw?: Record<string, unknown>): void {
    const server =
      getString(raw?.server) ?? getString(raw?.serverName) ?? getString(raw?.mcpServer) ?? getString(raw?.host) ?? '-';
    const tool =
      getString(raw?.tool) ?? getString(raw?.toolName) ?? getString(raw?.name) ?? getString(raw?.method) ?? '-';
    const status = getString(raw?.status) ?? getString(raw?.state) ?? 'running';

    entry.statusEl.textContent = status.slice(0, 1).toUpperCase() + status.slice(1);

    const metaEl = document.createElement('div');
    metaEl.className = 'codexian-item-mcp-meta';
    metaEl.textContent = `Server: ${server} | Tool: ${tool}`;
    entry.bodyEl.appendChild(metaEl);

    const argsValue = raw?.arguments ?? raw?.args ?? raw?.input ?? raw?.inputArguments;
    const resultValue = raw?.result ?? raw?.output;
    const errorValue = raw?.error;

    this.appendCollapsibleJson(entry.bodyEl, 'Arguments', argsValue, true);
    this.appendCollapsibleJson(entry.bodyEl, 'Result', resultValue, true);
    this.appendCollapsibleJson(entry.bodyEl, 'Error', errorValue, true);

    if (argsValue === undefined && resultValue === undefined && errorValue === undefined) {
      this.appendJsonFallback(entry.bodyEl, raw);
    }
  }

  private appendCollapsibleJson(
    parent: HTMLElement,
    label: string,
    value: unknown,
    collapsedByDefault: boolean
  ): void {
    if (value === undefined) return;

    const controlsEl = document.createElement('div');
    controlsEl.className = 'codexian-item-card-controls';
    const toggleButtonEl = document.createElement('button');
    toggleButtonEl.className = 'codexian-item-toggle';
    toggleButtonEl.type = 'button';
    toggleButtonEl.textContent = `${collapsedByDefault ? 'Expand' : 'Collapse'} ${label.toLowerCase()}`;
    controlsEl.appendChild(toggleButtonEl);

    const contentEl = document.createElement('pre');
    contentEl.className = 'codexian-item-fallback-json';
    contentEl.textContent = stringifyJson(value);
    contentEl.hidden = collapsedByDefault;

    toggleButtonEl.addEventListener('click', () => {
      const expanded = !contentEl.hidden;
      contentEl.hidden = expanded;
      toggleButtonEl.textContent = `${expanded ? 'Expand' : 'Collapse'} ${label.toLowerCase()}`;
    });

    parent.appendChild(controlsEl);
    parent.appendChild(contentEl);
  }

  private appendJsonFallback(parent: HTMLElement, raw?: Record<string, unknown>): void {
    const pre = document.createElement('pre');
    pre.className = 'codexian-item-fallback-json';
    pre.textContent = stringifyJson(raw ?? {});
    parent.appendChild(pre);
  }
}
