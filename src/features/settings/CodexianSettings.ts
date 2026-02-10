import type { App } from 'obsidian';
import { Modal, Notice, PluginSettingTab, Setting } from 'obsidian';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type CodexianPlugin from '../../main';
import type { ApprovalRule, CodexianSettings, EnvSnippet } from '../../core/types';
import { findCodexCLIPath, resolveCliCommand } from '../../core/runtime';

export const DEFAULT_SETTINGS: CodexianSettings = {
  cliPath: '',
  environmentVariables: '',
  envSnippets: [],
  approvalMode: 'safe',
  approvalRules: [],
  commandBlocklist: [],
  pathBlocklist: [],
  lastModel: undefined,
  lastReasoningEffort: undefined,
  lastMode: undefined,
};

const parseListLines = (input: string): string[] =>
  input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const parseApprovalRules = (input: string): ApprovalRule[] => {
  return parseListLines(input)
    .map((line) => {
      const [rawKind, ...rest] = line.split(':');
      const kind = (rawKind || '').trim().toLowerCase();
      const pattern = rest.join(':').trim();
      if (!pattern) return null;
      if (kind !== 'command' && kind !== 'path') return null;
      return { kind, pattern } as ApprovalRule;
    })
    .filter((rule): rule is ApprovalRule => !!rule);
};

const stringifyApprovalRules = (rules: ApprovalRule[]): string =>
  rules.map((rule) => `${rule.kind}: ${rule.pattern}`).join('\n');

export class CodexianSettingTab extends PluginSettingTab {
  plugin: CodexianPlugin;

  constructor(app: App, plugin: CodexianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Codex CLI path')
      .setDesc('Leave empty to use codex from path. You can include arguments, e.g. "/usr/local/bin/codex --help".')
      .addText((text) => {
        text
          .setPlaceholder('/usr/local/bin/codex')
          .setValue(this.plugin.settings.cliPath)
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.cliPath = value.trim();
              await this.plugin.saveSettings();
              this.warnOnInvalidCliPath(value.trim());
            })();
          });
        text.inputEl.addClass('codexian-input-full');
      });

    new Setting(containerEl)
      .setName('Test CLI path')
      .setDesc('Verify the codex CLI can be started from the configured path.')
      .addButton((button) => {
        button
          .setButtonText('Test')
          .onClick(() => {
            const { command, args } = resolveCliCommand(this.plugin.settings.cliPath);
            const testArgs = [...args, '--version'];
            let output = '';
            let errorOutput = '';

            const child = spawn(command, testArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

            child.stdout.on('data', (data: Buffer) => {
              output += data.toString('utf8');
              if (output.length > 1000) {
                output = output.slice(0, 1000);
              }
            });

            child.stderr.on('data', (data: Buffer) => {
              errorOutput += data.toString('utf8');
              if (errorOutput.length > 1000) {
                errorOutput = errorOutput.slice(0, 1000);
              }
            });

            child.on('error', (error) => {
              const err = error as NodeJS.ErrnoException;
              if (err.code === 'ENOENT') {
                new Notice('Codex CLI not found. Check the CLI path in settings.');
                return;
              }
              new Notice(`Failed to start Codex CLI: ${err.message}`);
            });

            child.on('close', (code) => {
              if (code === 0) {
                const detail = output.trim() || 'CLI responded to --version.';
                new Notice(`Codex CLI OK: ${detail}`);
                return;
              }
              const detail = errorOutput.trim() || output.trim();
              const suffix = detail ? ` Output: ${detail}` : '';
              new Notice(`Codex CLI exited with code ${code ?? 'unknown'}.${suffix}`);
            });
          });
      });

    new Setting(containerEl)
      .setName('Approval mode')
      .setDesc('Safe declines requests. Prompt asks in chat. Yolo auto-approves unless blocked.')
      .addDropdown((dropdown) => {
        dropdown.addOption('safe', 'Safe (prompt-free decline)');
        dropdown.addOption('prompt', 'Prompt (ask in transcript)');
        dropdown.addOption('yolo', 'Yolo (auto-approve)');
        dropdown.setValue(this.plugin.settings.approvalMode);
        dropdown.onChange((value) => {
          void (async () => {
            if (value === 'yolo') {
              this.plugin.settings.approvalMode = 'yolo';
            } else if (value === 'prompt') {
              this.plugin.settings.approvalMode = 'prompt';
            } else {
              this.plugin.settings.approvalMode = 'safe';
            }
            await this.plugin.saveSettings();
          })();
        });
      });

    new Setting(containerEl)
      .setName('Approval allow rules')
      .setDesc('Add one rule per line using command or path prefixes.')
      .addTextArea((text) => {
        text
          .setPlaceholder('Enter one rule per line.')
          .setValue(stringifyApprovalRules(this.plugin.settings.approvalRules))
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.approvalRules = parseApprovalRules(value);
              await this.plugin.saveSettings();
            })();
          });
        text.inputEl.rows = 5;
        text.inputEl.addClass('codexian-input-full');
      });

    new Setting(containerEl)
      .setName('Command blocklist')
      .setDesc('Add one command pattern per line. Supports exact and suffix wildcard patterns.')
      .addTextArea((text) => {
        text
          .setPlaceholder('Rm *\nGit push --force')
          .setValue(this.plugin.settings.commandBlocklist.join('\n'))
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.commandBlocklist = parseListLines(value);
              await this.plugin.saveSettings();
            })();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass('codexian-input-full');
      });

    new Setting(containerEl)
      .setName('Path blocklist')
      .setDesc('One path prefix per line. Segment-aware prefix matching is used.')
      .addTextArea((text) => {
        const configPathExample = this.app.vault.configDir
          ? `${this.app.vault.configDir}/plugins/`
          : 'Config/plugins/';
        text
          .setPlaceholder(`${configPathExample}\nSecrets/`)
          .setValue(this.plugin.settings.pathBlocklist.join('\n'))
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.pathBlocklist = parseListLines(value);
              await this.plugin.saveSettings();
            })();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass('codexian-input-full');
      });

    new Setting(containerEl)
      .setName('Environment variables')
      .setDesc('One key=value per line. Lines starting with # or export are ignored.')
      .addTextArea((text) => {
        text
          .setPlaceholder('API key...')
          .setValue(this.plugin.settings.environmentVariables)
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.environmentVariables = value;
              await this.plugin.saveSettings();
            })();
          });
        text.inputEl.rows = 6;
        text.inputEl.addClass('codexian-input-full');
      });

    new Setting(containerEl).setName('Environment snippets').setHeading();

    const snippetOptions = () => {
      const options: Record<string, string> = { '': 'Select a snippet' };
      for (const snippet of this.plugin.settings.envSnippets) {
        options[snippet.id] = snippet.name;
      }
      return options;
    };

    let selectedSnippetId = '';

    const snippetRow = new Setting(containerEl)
      .setName('Saved snippets')
      .setDesc('Store and apply common environment variable sets.');

    snippetRow.addDropdown((dropdown) => {
      const options = snippetOptions();
      Object.entries(options).forEach(([value, label]) => {
        void dropdown.addOption(value, label);
      });
      dropdown.setValue(selectedSnippetId);
      dropdown.onChange((value) => {
        selectedSnippetId = value;
      });
    });

    snippetRow.addButton((button) => {
      button.setButtonText('Apply').onClick(() => {
        void (async () => {
          const snippet = this.getSnippetById(selectedSnippetId);
          if (!snippet) {
            new Notice('Select a snippet first.');
            return;
          }
          this.plugin.settings.environmentVariables = snippet.envVars;
          await this.plugin.saveSettings();
          this.display();
        })();
      });
    });

    snippetRow.addButton((button) => {
      button.setButtonText('Delete').onClick(() => {
        void (async () => {
          if (!selectedSnippetId) {
            new Notice('Select a snippet first.');
            return;
          }
          this.plugin.settings.envSnippets = this.plugin.settings.envSnippets.filter(
            (snippet) => snippet.id !== selectedSnippetId
          );
          selectedSnippetId = '';
          await this.plugin.saveSettings();
          this.display();
        })();
      });
    });

    new Setting(containerEl)
      .setName('Save current environment as snippet')
      .setDesc('Create a named snippet from the current environment variables.')
      .addButton((button) => {
        button.setButtonText('Save').onClick(() => {
          void (async () => {
            const name = await this.requestSnippetName();
            if (!name) return;
            const trimmed = name.trim();
            if (!trimmed) return;
            const snippet: EnvSnippet = {
              id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: trimmed,
              envVars: this.plugin.settings.environmentVariables,
              updatedAt: Date.now(),
            };
            this.plugin.settings.envSnippets.unshift(snippet);
            await this.plugin.saveSettings();
            this.display();
          })();
        });
      });
  }

  private requestSnippetName(): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new SnippetNameModal(this.app, resolve);
      modal.open();
    });
  }

  private getSnippetById(id: string): EnvSnippet | undefined {
    return this.plugin.settings.envSnippets.find((snippet) => snippet.id === id);
  }

  private warnOnInvalidCliPath(value: string): void {
    if (!value) {
      const resolved = findCodexCLIPath();
      if (!resolved) {
        new Notice('Codex CLI not found on path. Configure a CLI path to continue.');
      }
      return;
    }

    const parsed = resolveCliCommand(value);
    const command = parsed.command;
    const looksLikePath = command.includes('/') || command.includes('\\') || path.isAbsolute(command);
    if (looksLikePath && !fs.existsSync(command)) {
      new Notice('Codex CLI path does not exist. Falling back to path discovery.');
    }
  }
}

class SnippetNameModal extends Modal {
  private onSubmit: (value: string | null) => void;
  private inputEl: HTMLInputElement | null = null;

  constructor(app: App, onSubmit: (value: string | null) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Snippet name' });
    this.inputEl = contentEl.createEl('input', { type: 'text' });
    this.inputEl.addClass('codexian-input-full');

    const actions = contentEl.createDiv({ cls: 'codexian-modal-actions' });
    const cancelButton = actions.createEl('button', { text: 'Cancel' });
    const saveButton = actions.createEl('button', { text: 'Save' });

    cancelButton.addEventListener('click', () => {
      this.onSubmit(null);
      this.close();
    });

    saveButton.addEventListener('click', () => {
      const value = this.inputEl?.value ?? '';
      this.onSubmit(value);
      this.close();
    });

    this.inputEl.focus();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
