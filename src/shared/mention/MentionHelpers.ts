export interface MentionState {
  query: string;
  start: number;
  end: number;
}

export interface MentionApplyResult {
  text: string;
  cursor: number;
}

const MENTION_TOKEN_REGEX = /@\{([^}\n\r]+)\}/g;

export function getMentionState(text: string, cursor: number): MentionState | null {
  const boundedCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, boundedCursor);
  const markerIndex = before.lastIndexOf('@');
  if (markerIndex < 0) {
    return null;
  }

  const preceding = markerIndex > 0 ? before.charAt(markerIndex - 1) : '';
  if (preceding && !/\s/.test(preceding)) {
    return null;
  }

  const query = before.slice(markerIndex + 1);
  if (/\s/.test(query)) {
    return null;
  }

  return {
    query,
    start: markerIndex,
    end: boundedCursor,
  };
}

export function applyMention(text: string, cursor: number, filePath: string): MentionApplyResult {
  const state = getMentionState(text, cursor);
  const token = `@{${filePath}}`;

  if (!state) {
    const boundedCursor = Math.max(0, Math.min(cursor, text.length));
    const suffix = text.slice(boundedCursor);
    const separator = suffix.length === 0 || /^\s/.test(suffix) ? '' : ' ';
    const nextText = `${text.slice(0, boundedCursor)}${token}${separator}${suffix}`;
    return {
      text: nextText,
      cursor: boundedCursor + token.length + separator.length,
    };
  }

  const suffix = text.slice(state.end);
  const separator = suffix.length === 0 || /^\s/.test(suffix) ? '' : ' ';
  const nextText = `${text.slice(0, state.start)}${token}${separator}${suffix}`;
  return {
    text: nextText,
    cursor: state.start + token.length + separator.length,
  };
}

export function extractMentionedPaths(text: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN_REGEX.exec(text)) !== null) {
    const rawPath = match[1];
    if (!rawPath) continue;
    const path = rawPath.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}
