import { Plugin } from 'obsidian';
import { ACTIONS_BLOCK, renderActionsBlock } from './blocks/actions/index';
import { CHARACTER_BLOCK, renderCharacterBlock } from './blocks/character/index';
import { CREATURE_BLOCK, renderCreatureBlock } from './blocks/creature';
import { MOUNT_BLOCK, renderMountBlock } from './blocks/mount';
import { referenceBlocks } from './blocks/reference';
import { renderSkillBlock, renderSpellBlock, SKILL_BLOCK, SPELL_BLOCK } from './blocks/skill';
import { registerCallouts } from './callouts';
import { registerMobForge } from './forge/index';
import { CarlSettings, CarlSettingTab, DEFAULT_SETTINGS } from './settings';
import { registerTemplateCommands } from './templates/commands';

export default class CarlPlugin extends Plugin {
	settings!: CarlSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(CREATURE_BLOCK, (source, el, ctx) =>
			renderCreatureBlock(this.app, source, el, ctx),
		);
		this.registerMarkdownCodeBlockProcessor(CHARACTER_BLOCK, (source, el, ctx) =>
			renderCharacterBlock(this.app, source, el, ctx),
		);
		this.registerMarkdownCodeBlockProcessor(MOUNT_BLOCK, (source, el, ctx) =>
			renderMountBlock(this.app, source, el, ctx),
		);
		this.registerMarkdownCodeBlockProcessor(ACTIONS_BLOCK, (source, el, ctx) =>
			renderActionsBlock(this.app, source, el, ctx),
		);
		this.registerMarkdownCodeBlockProcessor(SKILL_BLOCK, (source, el, ctx) =>
			renderSkillBlock(this.app, source, el, ctx),
		);
		this.registerMarkdownCodeBlockProcessor(SPELL_BLOCK, (source, el, ctx) =>
			renderSpellBlock(this.app, source, el, ctx),
		);
		for (const { name, render } of referenceBlocks(this.app)) {
			this.registerMarkdownCodeBlockProcessor(name, render);
		}

		registerCallouts(this);
		registerTemplateCommands(this);
		registerMobForge(this);
		this.addSettingTab(new CarlSettingTab(this.app, this));
	}

	async loadSettings() {
		const saved = ((await this.loadData()) ?? {}) as Partial<CarlSettings>;
		this.settings = {
			...DEFAULT_SETTINGS,
			...saved,
			folders: { ...DEFAULT_SETTINGS.folders, ...saved.folders },
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
