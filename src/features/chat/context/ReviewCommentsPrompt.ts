export interface ReviewPromptComment {
  scope?: string;
  text: string;
}

const REVIEW_COMMENTS_LABEL = '[Review comments from last turn diff]';

export function buildPromptWithReviewComments(prompt: string, comments: ReviewPromptComment[]): string {
  const userPrompt = prompt.trim();
  const normalized = comments
    .map((comment) => ({
      scope: comment.scope?.trim() || 'general',
      text: comment.text.trim(),
    }))
    .filter((comment) => comment.text.length > 0);

  if (normalized.length === 0) {
    return userPrompt;
  }

  const lines = [REVIEW_COMMENTS_LABEL];
  for (const comment of normalized) {
    lines.push(`- Scope: ${comment.scope}`);
    lines.push(`  Comment: ${comment.text}`);
  }

  return `${userPrompt}\n\n${lines.join('\n')}`;
}
