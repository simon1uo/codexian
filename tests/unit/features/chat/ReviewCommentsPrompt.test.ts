import { buildPromptWithReviewComments } from '../../../../src/features/chat/context/ReviewCommentsPrompt';

describe('buildPromptWithReviewComments', () => {
  it('returns user prompt unchanged when no comments are provided', () => {
    expect(buildPromptWithReviewComments('Ship it', [])).toBe('Ship it');
  });

  it('appends labeled review comments block with scope + comment text', () => {
    const result = buildPromptWithReviewComments('Please update the patch.', [
      { scope: 'src/main.ts', text: 'Split this into smaller helper functions.' },
      { text: 'Preserve existing CLI arg behavior.' },
    ]);

    expect(result).toContain('Please update the patch.');
    expect(result).toContain('[Review comments from last turn diff]');
    expect(result).toContain('- Scope: src/main.ts');
    expect(result).toContain('  Comment: Split this into smaller helper functions.');
    expect(result).toContain('- Scope: general');
    expect(result).toContain('  Comment: Preserve existing CLI arg behavior.');
  });
});
