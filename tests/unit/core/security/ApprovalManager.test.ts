import { ApprovalManager, approvalMatchers } from '../../../../src/core/security/ApprovalManager';
import type { CodexianSettings } from '../../../../src/core/types';

const buildSettings = (): CodexianSettings => ({
  cliPath: 'codex',
  environmentVariables: '',
  envSnippets: [],
  approvalMode: 'prompt',
  approvalRules: [],
  commandBlocklist: [],
  pathBlocklist: [],
});

describe('ApprovalManager', () => {
  it('matches commands by exact and prefix wildcard', () => {
    expect(approvalMatchers.isCommandMatch('git status', 'git status')).toBe(true);
    expect(approvalMatchers.isCommandMatch('git status', 'git *')).toBe(true);
    expect(approvalMatchers.isCommandMatch('git', 'git *')).toBe(true);
    expect(approvalMatchers.isCommandMatch('npm test', 'git *')).toBe(false);
  });

  it('applies command allow rules and blocklist deterministically', () => {
    const settings = buildSettings();
    settings.approvalMode = 'yolo';
    settings.approvalRules = [{ kind: 'command', pattern: 'git *' }];
    settings.commandBlocklist = ['git push --force'];
    const manager = new ApprovalManager(settings, '/vault');

    expect(manager.resolveCommand({ command: 'git status' })).toEqual({
      decision: 'accept',
      requiresPrompt: false,
    });
    expect(manager.resolveCommand({ command: 'git push --force' })).toEqual({
      decision: 'decline',
      requiresPrompt: false,
    });
  });

  it('matches path prefixes with segment boundaries', () => {
    expect(approvalMatchers.isPathPrefixMatch('/vault/src/app.ts', '/vault/src')).toBe(true);
    expect(approvalMatchers.isPathPrefixMatch('/vault/src2/app.ts', '/vault/src')).toBe(false);
  });

  it('declines path changes outside vault even in yolo', () => {
    const settings = buildSettings();
    settings.approvalMode = 'yolo';
    const manager = new ApprovalManager(settings, '/vault');

    expect(manager.resolveFileChange({ paths: ['../etc/passwd'] })).toEqual({
      decision: 'decline',
      requiresPrompt: false,
    });
  });

  it('applies path blocklist before allow rules', () => {
    const settings = buildSettings();
    settings.approvalMode = 'prompt';
    settings.approvalRules = [{ kind: 'path', pattern: 'src/' }];
    settings.pathBlocklist = ['src/secrets'];
    const manager = new ApprovalManager(settings, '/vault');

    expect(manager.resolveFileChange({ paths: ['src/index.ts'] })).toEqual({
      decision: 'accept',
      requiresPrompt: false,
    });
    expect(manager.resolveFileChange({ paths: ['src/secrets/token.txt'] })).toEqual({
      decision: 'decline',
      requiresPrompt: false,
    });
  });
});
