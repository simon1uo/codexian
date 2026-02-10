/**
 * @jest-environment ./tests/helpers/jsdom-environment.cjs
 */

import type { AppServerItem } from '../../../../src/core/types';
import { ItemCardRenderer } from '../../../../src/features/chat/rendering/ItemCardRenderer';

const createItem = (type: string, id: string, raw: Record<string, unknown>): AppServerItem => {
  return {
    id,
    type: type as AppServerItem['type'],
    raw,
  } as AppServerItem;
};

describe('ItemCardRenderer', () => {
  it('renders commandExecution card and appends output deltas', () => {
    const transcriptEl = document.createElement('div');
    const renderer = new ItemCardRenderer(transcriptEl);

    renderer.handleItemStarted(
      createItem('commandExecution', 'cmd-1', {
        command: 'npm test',
      })
    );

    renderer.handleCommandExecutionOutputDelta('line 1\n');
    renderer.handleCommandExecutionOutputDelta('line 2');

    const card = transcriptEl.querySelector('.codexian-item-commandExecution');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.codexian-item-command')?.textContent).toBe('npm test');
    expect(card?.querySelector('.codexian-item-output')?.textContent).toBe('line 1\nline 2');

    renderer.handleItemCompleted(
      createItem('commandExecution', 'cmd-1', {
        output: 'final output',
      })
    );

    expect(card?.querySelector('.codexian-item-card-status')?.textContent).toBe('Completed');
    expect(card?.querySelector('.codexian-item-output')?.textContent).toBe('final output');
  });

  it('renders fileChange card diff and supports collapse/expand', () => {
    const transcriptEl = document.createElement('div');
    const renderer = new ItemCardRenderer(transcriptEl);

    renderer.handleItemStarted(
      createItem('fileChange', 'file-1', {
        files: ['src/main.ts'],
        unifiedDiff: '--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1 +1 @@\n-old\n+new\n',
      })
    );

    const card = transcriptEl.querySelector('.codexian-item-fileChange');
    const toggle = card?.querySelector('.codexian-item-toggle') as HTMLButtonElement | null;
    const diff = card?.querySelector('.codexian-item-diff') as HTMLElement | null;

    expect(card).not.toBeNull();
    expect(card?.querySelector('li')?.textContent).toBe('src/main.ts');
    expect(diff).not.toBeNull();
    expect(diff?.hidden).toBe(true);
    expect(toggle?.textContent).toBe('Expand diff');

    toggle?.click();
    expect(diff?.hidden).toBe(false);
    expect(toggle?.textContent).toBe('Collapse diff');

    toggle?.click();
    expect(diff?.hidden).toBe(true);
    expect(toggle?.textContent).toBe('Expand diff');
  });
});
