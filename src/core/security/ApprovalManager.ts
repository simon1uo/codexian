import * as path from 'path';

import type { ApprovalDecision, ApprovalRule, CodexianSettings } from '../types';

export interface CommandApprovalInput {
  command?: string;
}

export interface FileApprovalInput {
  paths: string[];
}

export interface ApprovalResolution {
  decision: ApprovalDecision;
  requiresPrompt: boolean;
}

const normalizeSlashPath = (value: string): string => value.replace(/\\/g, '/');

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$|\\+$/g, '');

const normalizeComparablePath = (value: string): string => {
  const normalized = normalizeSlashPath(path.normalize(value || '').trim());
  return trimTrailingSlashes(normalized);
};

const toLowerIfWindows = (value: string): string =>
  process.platform === 'win32' ? value.toLowerCase() : value;

const normalizePathPattern = (value: string): string => toLowerIfWindows(normalizeComparablePath(value));

const splitPathSegments = (value: string): string[] => value.split('/').filter((segment) => segment.length > 0);

const isPathPrefixMatch = (target: string, prefix: string): boolean => {
  const normalizedTarget = normalizePathPattern(target);
  const normalizedPrefix = normalizePathPattern(prefix);
  if (!normalizedTarget || !normalizedPrefix) return false;

  const targetSegments = splitPathSegments(normalizedTarget);
  const prefixSegments = splitPathSegments(normalizedPrefix);
  if (prefixSegments.length > targetSegments.length) return false;

  for (let i = 0; i < prefixSegments.length; i += 1) {
    if (targetSegments[i] !== prefixSegments[i]) {
      return false;
    }
  }
  return true;
};

const normalizeCommand = (value: string): string => value.trim();

const isCommandMatch = (command: string, pattern: string): boolean => {
  const normalizedCommand = normalizeCommand(command);
  const normalizedPattern = normalizeCommand(pattern);
  if (!normalizedCommand || !normalizedPattern) return false;

  if (normalizedPattern.endsWith(' *')) {
    const base = normalizedPattern.slice(0, -2).trim();
    return normalizedCommand === base || normalizedCommand.startsWith(`${base} `);
  }

  if (normalizedPattern.endsWith('*')) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedCommand.startsWith(prefix);
  }

  return normalizedCommand === normalizedPattern;
};

export const approvalMatchers = {
  isCommandMatch,
  isPathPrefixMatch,
};

export class ApprovalManager {
  constructor(
    private settings: Pick<CodexianSettings, 'approvalMode' | 'approvalRules' | 'commandBlocklist' | 'pathBlocklist'>,
    private vaultPath: string
  ) {}

  resolveCommand(input: CommandApprovalInput): ApprovalResolution {
    const command = input.command?.trim() || '';
    if (!command) {
      return this.fromMode();
    }

    if (this.settings.commandBlocklist.some((pattern) => isCommandMatch(command, pattern))) {
      return { decision: 'decline', requiresPrompt: false };
    }

    if (this.settings.approvalRules.some((rule) => this.matchesCommandRule(rule, command))) {
      return { decision: 'accept', requiresPrompt: false };
    }

    return this.fromMode();
  }

  resolveFileChange(input: FileApprovalInput): ApprovalResolution {
    const paths = input.paths;

    if (paths.some((filePath) => !this.isWithinVault(filePath))) {
      return { decision: 'decline', requiresPrompt: false };
    }

    if (paths.some((filePath) => this.matchesPathBlocklist(filePath))) {
      return { decision: 'decline', requiresPrompt: false };
    }

    if (paths.length > 0 && paths.every((filePath) => this.matchesPathAllowRule(filePath))) {
      return { decision: 'accept', requiresPrompt: false };
    }

    return this.fromMode();
  }

  addAllowRule(rule: ApprovalRule): void {
    const pattern = rule.pattern.trim();
    if (!pattern) return;
    const normalizedPattern = rule.kind === 'path' ? normalizeComparablePath(pattern) : pattern;
    if (!normalizedPattern) return;
    const exists = this.settings.approvalRules.some(
      (entry) => entry.kind === rule.kind && entry.pattern === normalizedPattern
    );
    if (!exists) {
      this.settings.approvalRules.push({ kind: rule.kind, pattern: normalizedPattern });
    }
  }

  decideTool(): ApprovalDecision {
    return this.fromMode().decision;
  }

  decideFileChange(): ApprovalDecision {
    return this.fromMode().decision;
  }

  private fromMode(): ApprovalResolution {
    if (this.settings.approvalMode === 'yolo') {
      return { decision: 'accept', requiresPrompt: false };
    }
    if (this.settings.approvalMode === 'prompt') {
      return { decision: 'decline', requiresPrompt: true };
    }
    return { decision: 'decline', requiresPrompt: false };
  }

  private matchesCommandRule(rule: ApprovalRule, command: string): boolean {
    if (rule.kind !== 'command') return false;
    return isCommandMatch(command, rule.pattern);
  }

  private matchesPathAllowRule(targetPath: string): boolean {
    return this.settings.approvalRules.some((rule) => {
      if (rule.kind !== 'path') return false;
      return this.matchesPathRule(targetPath, rule.pattern);
    });
  }

  private matchesPathBlocklist(targetPath: string): boolean {
    return this.settings.pathBlocklist.some((pattern) => this.matchesPathRule(targetPath, pattern));
  }

  private matchesPathRule(targetPath: string, pattern: string): boolean {
    const targetAbsolute = this.toAbsolutePath(targetPath);
    if (!targetAbsolute) return false;

    const normalizedPattern = normalizeComparablePath(pattern);
    if (!normalizedPattern) return false;

    if (path.isAbsolute(normalizedPattern)) {
      return isPathPrefixMatch(targetAbsolute, normalizedPattern);
    }

    const vaultAbsolute = this.getVaultAbsolutePath();
    if (!vaultAbsolute) return false;
    const relative = path.relative(vaultAbsolute, targetAbsolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
    return isPathPrefixMatch(normalizeSlashPath(relative), normalizedPattern);
  }

  private isWithinVault(targetPath: string): boolean {
    const targetAbsolute = this.toAbsolutePath(targetPath);
    const vaultAbsolute = this.getVaultAbsolutePath();
    if (!targetAbsolute || !vaultAbsolute) return false;
    return isPathPrefixMatch(targetAbsolute, vaultAbsolute);
  }

  private getVaultAbsolutePath(): string | null {
    const normalized = normalizeComparablePath(this.vaultPath);
    return normalized || null;
  }

  private toAbsolutePath(targetPath: string): string | null {
    const trimmed = targetPath.trim();
    if (!trimmed) return null;
    const vaultAbsolute = this.getVaultAbsolutePath();
    const base = vaultAbsolute ?? process.cwd();
    const resolved = path.resolve(base, trimmed);
    const normalized = normalizeComparablePath(resolved);
    return normalized || null;
  }
}
