export const PLAN_MODE_PROMPT_PREFIX = 'First propose a step-by-step plan. Do not execute yet.';

export function buildPlanModePrompt(prompt: string, isPlanMode: boolean): string {
  if (!isPlanMode || !prompt.trim()) {
    return prompt;
  }
  return `${PLAN_MODE_PROMPT_PREFIX}\n\n${prompt}`;
}
