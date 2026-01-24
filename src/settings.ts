import {App, PluginSettingTab, Setting} from "obsidian";
import CodexianPlugin from "./main";

export interface CodexianSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: CodexianSettings = {
	mySetting: 'default'
}

export class CodexianSettingTab extends PluginSettingTab {
	plugin: CodexianPlugin;

	constructor(app: App, plugin: CodexianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
