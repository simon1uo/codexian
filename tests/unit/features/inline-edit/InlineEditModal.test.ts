import { MockElement } from '../../../__mocks__/obsidian';

import { InlineEditModal } from '../../../../src/features/inline-edit/InlineEditModal';

function findButtonByText(root: MockElement, text: string): MockElement | null {
  if (root.tag === 'button' && root.textContent === text) {
    return root;
  }
  for (const child of root.children) {
    const found = findButtonByText(child, text);
    if (found) {
      return found;
    }
  }
  return null;
}

describe('InlineEditModal', () => {
  it('renders source/proposed preview and applies proposed text on accept', async () => {
    const onApply = jest.fn();
    const modal = new InlineEditModal({} as never, {
      sourceLabel: 'Current selection',
      sourceText: 'before text',
      onApply,
      generateEdit: async (handlers) => {
        handlers.onDelta('after text');
        handlers.onComplete();
      },
    });

    modal.open();
    await Promise.resolve();

    const contentEl = modal.contentEl as unknown as MockElement;

    const sourceSection = contentEl.querySelector('.codexian-inline-edit-source');
    const proposedSection = contentEl.querySelector('.codexian-inline-edit-proposed');
    expect(sourceSection).not.toBeNull();
    expect(proposedSection).not.toBeNull();

    const acceptButton = findButtonByText(contentEl, 'Accept');
    expect(acceptButton).not.toBeNull();
    expect(acceptButton?.disabled).toBe(false);

    acceptButton?.trigger('click');
    expect(onApply).toHaveBeenCalledWith('after text');
  });
});
