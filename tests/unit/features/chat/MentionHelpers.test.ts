import { applyMention, extractMentionedPaths, getMentionState } from '../../../../src/shared/mention/MentionHelpers';

describe('MentionHelpers', () => {
  it('detects mention state from current cursor', () => {
    const text = 'Please open @doc';
    const state = getMentionState(text, text.length);

    expect(state).toEqual({
      query: 'doc',
      start: 12,
      end: 16,
    });
  });

  it('applies selected mention token at cursor', () => {
    const text = 'Check @rea now';
    const cursor = 'Check @rea'.length;

    const result = applyMention(text, cursor, 'README.md');

    expect(result.text).toBe('Check @{README.md} now');
    expect(result.cursor).toBe('Check @{README.md}'.length);
  });

  it('extracts unique mentioned paths from tokens', () => {
    const text = 'Look at @{a.md} and @{b.md} and again @{a.md}';
    expect(extractMentionedPaths(text)).toEqual(['a.md', 'b.md']);
  });
});
