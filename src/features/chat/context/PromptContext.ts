export interface PromptContextFile {
  path: string;
  content: string;
}

export interface PromptContextLimits {
  maxActiveFileChars: number;
  maxSelectionChars: number;
  maxMentionedFiles: number;
  maxMentionedFileChars: number;
}

export interface BuildPromptWithContextInput {
  userPrompt: string;
  activeFile?: PromptContextFile | null;
  selection?: string | null;
  mentionedFiles?: PromptContextFile[];
  limits?: Partial<PromptContextLimits>;
}

const DEFAULT_LIMITS: PromptContextLimits = {
  maxActiveFileChars: 6000,
  maxSelectionChars: 2000,
  maxMentionedFiles: 5,
  maxMentionedFileChars: 4000,
};

interface TrimResult {
  text: string;
  truncated: boolean;
  originalLength: number;
}

function trimToLimit(content: string, maxChars: number): TrimResult {
  const normalized = content.replace(/\r\n?/g, '\n');
  if (normalized.length <= maxChars) {
    return {
      text: normalized,
      truncated: false,
      originalLength: normalized.length,
    };
  }
  return {
    text: normalized.slice(0, maxChars),
    truncated: true,
    originalLength: normalized.length,
  };
}

function buildTruncationNotice(result: TrimResult, maxChars: number): string {
  if (!result.truncated) return '';
  return `(Truncated: showing first ${maxChars} of ${result.originalLength} chars.)`;
}

function buildFileSection(label: string, file: PromptContextFile, maxChars: number): string {
  const trimmed = trimToLimit(file.content, maxChars);
  const notice = buildTruncationNotice(trimmed, maxChars);
  const parts = [
    `[Context: ${label}]`,
    `Path: ${file.path}`,
    '```markdown',
    trimmed.text,
    '```',
  ];
  if (notice) {
    parts.push(notice);
  }
  return parts.join('\n');
}

function buildSelectionSection(selection: string, maxChars: number): string {
  const trimmed = trimToLimit(selection, maxChars);
  const notice = buildTruncationNotice(trimmed, maxChars);
  const parts = [
    '[Context: Selection]',
    '```text',
    trimmed.text,
    '```',
  ];
  if (notice) {
    parts.push(notice);
  }
  return parts.join('\n');
}

export function buildPromptWithContext(input: BuildPromptWithContextInput): string {
  const userPrompt = input.userPrompt.trim();
  const limits: PromptContextLimits = {
    ...DEFAULT_LIMITS,
    ...(input.limits ?? {}),
  };

  const sections: string[] = [];
  if (input.activeFile && input.activeFile.path.trim()) {
    sections.push(buildFileSection('Active note', input.activeFile, limits.maxActiveFileChars));
  }

  const selection = input.selection?.trim();
  if (selection) {
    sections.push(buildSelectionSection(selection, limits.maxSelectionChars));
  }

  if (input.mentionedFiles && input.mentionedFiles.length > 0) {
    const fileLimit = Math.max(0, limits.maxMentionedFiles);
    for (const file of input.mentionedFiles.slice(0, fileLimit)) {
      if (!file.path.trim()) continue;
      sections.push(buildFileSection('Mentioned file', file, limits.maxMentionedFileChars));
    }
    if (input.mentionedFiles.length > fileLimit) {
      sections.push(
        `(Mentioned files truncated: showing ${fileLimit} of ${input.mentionedFiles.length} files.)`
      );
    }
  }

  if (sections.length === 0) {
    return userPrompt;
  }

  return `${sections.join('\n\n')}\n\n[User prompt]\n${userPrompt}`;
}
