import { App, PluginSettingTab, Setting } from 'obsidian';
import type CarlPlugin from './main';
import { TEMPLATES } from './templates/definitions';

export interface CarlSettings {
	/** Where "Create template files" writes; empty uses the core Templates folder, else "_templates". */
	templatesFolder: string;
	/** Folder for new notes of each type, keyed by template id. */
	folders: Record<string, string>;
}

export const DEFAULT_SETTINGS: CarlSettings = {
	templatesFolder: '',
	folders: Object.fromEntries(TEMPLATES.map((t) => [t.id, t.folder])),
};

export class CarlSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CarlPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Templates folder')
			.setDesc('Folder for the plugin templates. Leave empty to use the core templates folder.')
			.addText((text) =>
				text
					.setPlaceholder('_templates')
					.setValue(this.plugin.settings.templatesFolder)
					.onChange(async (value) => {
						this.plugin.settings.templatesFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('New note folders').setHeading();
		for (const template of TEMPLATES) {
			new Setting(containerEl)
				.setName(`New ${template.label}`)
				.addText((text) =>
					text
						.setPlaceholder(template.folder)
						.setValue(this.plugin.settings.folders[template.id] ?? template.folder)
						.onChange(async (value) => {
							this.plugin.settings.folders[template.id] = value.trim() || template.folder;
							await this.plugin.saveSettings();
						}),
				);
		}
	}
}
