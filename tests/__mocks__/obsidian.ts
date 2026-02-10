export class Plugin {}

export class PluginSettingTab {}

export class ItemView {}

export class WorkspaceLeaf {}

export class App {}

export class MarkdownView {}

export class Setting {}

export class TextAreaComponent {}

export class Modal {}

export const MarkdownRenderer = {
  renderMarkdown: async () => undefined,
};

export const setIcon = () => undefined;

export class TFile {
  path: string;

  constructor(path = '') {
    this.path = path;
  }
}
