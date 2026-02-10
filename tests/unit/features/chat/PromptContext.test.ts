import { buildPromptWithContext } from '../../../../src/features/chat/context/PromptContext';

describe('buildPromptWithContext', () => {
  it('includes active note and selection blocks before user prompt', () => {
    const result = buildPromptWithContext({
      userPrompt: 'Summarize this.',
      activeFile: {
        path: 'notes/today.md',
        content: '# Today\n- task',
      },
      selection: 'Selected line',
    });

    expect(result).toContain('[Context: Active note]');
    expect(result).toContain('Path: notes/today.md');
    expect(result).toContain('```markdown\n# Today\n- task\n```');
    expect(result).toContain('[Context: Selection]');
    expect(result).toContain('```text\nSelected line\n```');
    expect(result).toMatch(/\[User prompt\]\nSummarize this\./);
  });

  it('includes mentioned file blocks and truncation notice', () => {
    const result = buildPromptWithContext({
      userPrompt: 'Use referenced files.',
      mentionedFiles: [
        { path: 'docs/a.md', content: 'abcdef' },
        { path: 'docs/b.md', content: 'xyz' },
      ],
      limits: {
        maxMentionedFileChars: 3,
        maxMentionedFiles: 1,
      },
    });

    expect(result).toContain('[Context: Mentioned file]');
    expect(result).toContain('Path: docs/a.md');
    expect(result).toContain('```markdown\nabc\n```');
    expect(result).toContain('(Truncated: showing first 3 of 6 chars.)');
    expect(result).toContain('(Mentioned files truncated: showing 1 of 2 files.)');
    expect(result).not.toContain('docs/b.md');
  });
});
