import type { Editor, EditorPosition } from 'obsidian';
import { MarkdownView, Notice } from 'obsidian';

import type CodexianPlugin from '../../main';
import { InlineEditModal } from './InlineEditModal';

const INLINE_CONTEXT_RADIUS = 120;

interface InlineEditTarget {
  hasSelection: boolean;
  sourceLabel: string;
  sourceText: string;
  contextWithCursor: string;
  selectionFrom: EditorPosition;
  selectionTo: EditorPosition;
  cursor: EditorPosition;
}

function getInlineEditTarget(editor: Editor): InlineEditTarget {
  const selection = editor.getSelection();
  const hasSelection = selection.length > 0;

  if (hasSelection) {
    const selectionFrom = editor.getCursor('from');
    const selectionTo = editor.getCursor('to');
    return {
      hasSelection: true,
      sourceLabel: 'Current selection',
      sourceText: selection,
      contextWithCursor: '',
      selectionFrom,
      selectionTo,
      cursor: selectionFrom,
    };
  }

  const cursor = editor.getCursor();
  const fullText = editor.getValue();
  const cursorOffset = editor.posToOffset(cursor);
  const start = Math.max(0, cursorOffset - INLINE_CONTEXT_RADIUS);
  const end = Math.min(fullText.length, cursorOffset + INLINE_CONTEXT_RADIUS);
  const contextText = fullText.slice(start, end);
  const relativeCursor = cursorOffset - start;
  const contextWithCursor = `${contextText.slice(0, relativeCursor)}<CURSOR>${contextText.slice(relativeCursor)}`;

  return {
    hasSelection: false,
    sourceLabel: 'Context around cursor',
    sourceText: contextText,
    contextWithCursor,
    selectionFrom: cursor,
    selectionTo: cursor,
    cursor,
  };
}

function buildInlineEditPrompt(target: InlineEditTarget): string {
  if (target.hasSelection) {
    return [
      'You are editing markdown text selected by the user.',
      'Rewrite the text to improve clarity while preserving meaning and style.',
      'Return only the edited text. Do not include explanations or code fences.',
      '',
      'TARGET:',
      '<<<',
      target.sourceText,
      '>>>',
    ].join('\n');
  }

  return [
    'You are editing markdown text at the cursor position.',
    'Based on surrounding context, produce only the text that should be inserted at <CURSOR>.',
    'Do not include surrounding text, explanations, or code fences.',
    '',
    'CONTEXT:',
    '<<<',
    target.contextWithCursor,
    '>>>',
  ].join('\n');
}

export async function runInlineEditCommand(plugin: CodexianPlugin): Promise<void> {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  const editor = view?.editor;
  if (!editor) {
    return;
  }

  const target = getInlineEditTarget(editor);
  const prompt = buildInlineEditPrompt(target);

  const modal = new InlineEditModal(plugin.app, {
    sourceLabel: target.sourceLabel,
    sourceText: target.sourceText,
    onApply: (value) => {
      if (target.hasSelection) {
        editor.replaceRange(value, target.selectionFrom, target.selectionTo);
        return;
      }
      editor.replaceRange(value, target.cursor, target.cursor);
    },
    generateEdit: async (handlers) => {
      try {
        const conversation = await plugin.getConversation();
        const threadId = conversation.threadId ?? conversation.id;
        if (!threadId) {
          throw new Error('Missing thread id for inline edit.');
        }

        await plugin.runtime.startTurn(
          threadId,
          prompt,
          {
            onStart: () => undefined,
            onDelta: handlers.onDelta,
            onMessage: handlers.onMessage,
            onError: handlers.onError,
            onComplete: handlers.onComplete,
          },
          conversation.model ?? plugin.settings.lastModel,
          conversation.reasoningEffort ?? plugin.settings.lastReasoningEffort,
          'never',
          { type: 'readOnly' }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Inline edit failed.';
        handlers.onError(message);
        handlers.onComplete();
        new Notice(`Inline edit failed: ${message}`);
      }
    },
  });

  modal.open();
}
