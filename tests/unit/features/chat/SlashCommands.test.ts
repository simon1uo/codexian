import {
  expandSlashCommandPrompt,
  getAvailableSlashCommands,
  parseSlashCommandInvocation,
} from '../../../../src/features/chat/context/SlashCommands';

describe('SlashCommands', () => {
  it('parses command name and split args from first line', () => {
    expect(parseSlashCommandInvocation('/review src/main.ts fix lint')).toEqual({
      command: 'review',
      args: 'src/main.ts fix lint',
      argList: ['src/main.ts', 'fix', 'lint'],
    });
  });

  it('returns null when prompt does not start with slash command', () => {
    expect(parseSlashCommandInvocation('review src/main.ts')).toBeNull();
  });

  it('expands {args} and positional placeholders', () => {
    const commands = [
      {
        name: 'run',
        description: 'Run a command',
        template: 'Command={args}; first={arg1}; second={arg2}; third={arg3}',
      },
    ];

    expect(expandSlashCommandPrompt('/run npm test --watch', commands)).toBe(
      'Command=npm test --watch; first=npm; second=test; third=--watch'
    );
  });

  it('keeps prompt unchanged when command is not registered', () => {
    expect(expandSlashCommandPrompt('/unknown do thing', getAvailableSlashCommands())).toBe('/unknown do thing');
  });

  it('allows custom commands to override built-ins as extension point', () => {
    const commands = getAvailableSlashCommands([
      {
        name: 'review',
        description: 'Custom review',
        template: 'CUSTOM:{args}',
      },
    ]);

    expect(expandSlashCommandPrompt('/review abc', commands)).toBe('CUSTOM:abc');
  });
});
