import { buildPlanModePrompt, PLAN_MODE_PROMPT_PREFIX } from '../../../../src/features/chat/context/PlanModePrompt';

describe('buildPlanModePrompt', () => {
  it('prepends plan instruction when plan mode is enabled', () => {
    expect(buildPlanModePrompt('Ship feature X.', true)).toBe(
      `${PLAN_MODE_PROMPT_PREFIX}\n\nShip feature X.`
    );
  });

  it('keeps original prompt when plan mode is disabled', () => {
    expect(buildPlanModePrompt('Ship feature X.', false)).toBe('Ship feature X.');
  });
});
