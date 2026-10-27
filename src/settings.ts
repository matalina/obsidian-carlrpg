import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
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

/** Control key for a template's new-note folder, e.g. "folder:mob". */
const FOLDER_KEY = 'folder:';

export class CarlSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CarlPlugin) {
		super(app, plugin);
	}

	// Obsidian 1.13+: rendered from these definitions and indexed for settings search.
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Templates folder',
				desc: 'Folder for the plugin templates. Leave empty to use the core templates folder.',
				control: { type: 'folder', key: 'templatesFolder', placeholder: '_templates' },
			},
			{
				type: 'group',
				heading: 'New note folders',
				items: TEMPLATES.map((template) => ({
					name: `New ${template.label}`,
					control: { type: 'folder', key: `${FOLDER_KEY}${template.id}`, placeholder: template.folder },
				})),
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key.startsWith(FOLDER_KEY)) {
			const id = key.slice(FOLDER_KEY.length);
			return this.plugin.settings.folders[id] ?? TEMPLATES.find((t) => t.id === id)?.folder;
		}
		return key === 'templatesFolder' ? this.plugin.settings.templatesFolder : undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const text = typeof value === 'string' ? value.trim() : '';
		if (key.startsWith(FOLDER_KEY)) {
			const id = key.slice(FOLDER_KEY.length);
			this.plugin.settings.folders[id] = text || (TEMPLATES.find((t) => t.id === id)?.folder ?? '');
		} else if (key === 'templatesFolder') {
			this.plugin.settings.templatesFolder = text;
		}
		await this.plugin.saveSettings();
	}

	// Fallback for Obsidian before 1.13, which doesn't read getSettingDefinitions().
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
