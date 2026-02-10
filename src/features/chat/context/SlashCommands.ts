export interface SlashCommand {
  name: string;
  description: string;
  template: string;
}

export interface SlashCommandState {
  query: string;
  start: number;
  end: number;
}

export interface SlashCommandApplyResult {
  text: string;
  cursor: number;
}

export interface SlashCommandInvocation {
  command: string;
  args: string;
  argList: string[];
}

const SLASH_INVOCATION_REGEX = /^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/;
const SLASH_PLACEHOLDER_REGEX = /\{args\}|\{arg(\d+)\}/g;

const BUILT_IN_SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: 'review',
    description: 'Review code and provide concrete feedback.',
    template:
      'Please review the following and return concise findings with severity, rationale, and fixes:\n\n{args}',
  },
  {
    name: 'plan',
    description: 'Create an implementation plan before coding.',
    template:
      'Create a step-by-step implementation plan with clear milestones for this request:\n\n{args}',
  },
  {
    name: 'test',
    description: 'Design focused tests for a target change.',
    template: 'Design focused tests (unit/integration where appropriate) for:\n\n{args}',
  },
];

export function getAvailableSlashCommands(userDefined: readonly SlashCommand[] = []): SlashCommand[] {
  const byName = new Map<string, SlashCommand>();
  for (const command of BUILT_IN_SLASH_COMMANDS) {
    byName.set(command.name.toLowerCase(), command);
  }
  for (const command of userDefined) {
    if (!command.name.trim()) {
      continue;
    }
    byName.set(command.name.toLowerCase(), {
      name: command.name.trim(),
      description: command.description,
      template: command.template,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getSlashCommandState(text: string, cursor: number): SlashCommandState | null {
  const boundedCursor = Math.max(0, Math.min(cursor, text.length));
  const beforeCursor = text.slice(0, boundedCursor);
  const lineStart = beforeCursor.lastIndexOf('\n') + 1;
  const linePrefix = beforeCursor.slice(lineStart);
  const match = linePrefix.match(/^(\s*)\/([^\s/]*)$/);
  if (!match) {
    return null;
  }

  const leadingWhitespace = match[1]?.length ?? 0;
  const query = match[2] ?? '';

  return {
    query,
    start: lineStart + leadingWhitespace,
    end: boundedCursor,
  };
}

export function applySlashCommand(text: string, cursor: number, commandName: string): SlashCommandApplyResult {
  const state = getSlashCommandState(text, cursor);
  const token = `/${commandName} `;

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
  const nextText = `${text.slice(0, state.start)}${token}${suffix}`;
  return {
    text: nextText,
    cursor: state.start + token.length,
  };
}

export function parseSlashCommandInvocation(prompt: string): SlashCommandInvocation | null {
  const firstLine = prompt.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine.startsWith('/')) {
    return null;
  }

  const match = firstLine.match(SLASH_INVOCATION_REGEX);
  if (!match) {
    return null;
  }

  const command = match[1]?.toLowerCase() ?? '';
  const args = match[2]?.trim() ?? '';
  const argList = args ? args.split(/\s+/).filter((item) => item.length > 0) : [];

  return {
    command,
    args,
    argList,
  };
}

export function expandSlashCommandPrompt(prompt: string, commands: readonly SlashCommand[]): string {
  const invocation = parseSlashCommandInvocation(prompt);
  if (!invocation) {
    return prompt;
  }

  const command = commands.find((item) => item.name.toLowerCase() === invocation.command);
  if (!command) {
    return prompt;
  }

  return command.template.replace(SLASH_PLACEHOLDER_REGEX, (placeholder, argIndexText: string | undefined) => {
    if (placeholder === '{args}') {
      return invocation.args;
    }
    const argIndex = Number.parseInt(argIndexText ?? '', 10);
    if (!Number.isFinite(argIndex) || argIndex <= 0) {
      return '';
    }
    return invocation.argList[argIndex - 1] ?? '';
  });
}
