import { Component, ItemView, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import { markdownRenderer, renderAttacks, renderGrid, renderHealth } from '../blocks/shared';
import { formatSize } from '../rules/size';
import { formatMod, statMod } from '../rules/stats';
import { titleCase } from '../blocks/yaml';
import type CarlPlugin from '../main';
import { createNote, templateSource } from '../templates/commands';
import { TEMPLATES } from '../templates/definitions';
import { fillMobTemplate, mobRecord } from './frontmatter';
import { ForgedMob, ForgeOptions, forgeMob, levelRange, suggestLevel } from './generate';
import { CREATURE_TYPES, RANKS, Rank, Role, ROLES, STAT_KEYS } from './tables';

export const MOB_FORGE_VIEW = 'carl-mob-forge';

const SIZE_NAMES = ['Tiny', 'Small', 'Petite', 'Medium', 'Large', 'Huge', 'Colossal', 'Gargantuan'];
const summary = (mob: ForgedMob): string[][] => [
	['Level', String(mob.level)],
	['Surprise', mob.surprise],
	['Evade', mob.evade],
	['Move', mob.move],
	['DR', String(mob.dr)],
];

export class MobForgeView extends ItemView {
	private name = '';
	private opts: ForgeOptions = {
		floor: 3,
		level: 14,
		rank: 'Mob',
		size: 4,
		creature: 'Humanoid',
		role: 'brute',
		armor: null,
	};
	private mob: ForgedMob | null = null;
	private levelInput: HTMLInputElement | null = null;
	private hintEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewComponent: Component | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: CarlPlugin) {
		super(leaf);
	}

	getViewType() {
		return MOB_FORGE_VIEW;
	}

	getDisplayText() {
		return 'Mob forge';
	}

	getIcon() {
		return 'dices';
	}

	async onOpen() {
		const root = this.contentEl;
		root.empty();
		root.addClass('carl-forge');

		const form = root.createDiv({ cls: 'carl-forge-form' });
		new Setting(form).setName('Name').addText((t) =>
			t.setPlaceholder('Scrap rat').onChange((v) => (this.name = v.trim())),
		);
		new Setting(form).setName('Floor').addText((t) => {
			t.inputEl.type = 'number';
			t.inputEl.min = '1';
			t.inputEl.max = '18';
			t.setValue(String(this.opts.floor)).onChange((v) => {
				this.opts.floor = Math.max(1, Number(v) || 1);
				this.suggest();
			});
		});
		new Setting(form).setName('Rank').addDropdown((d) => {
			for (const rank of RANKS) d.addOption(rank, rank);
			d.setValue(this.opts.rank).onChange((v) => {
				this.opts.rank = v as Rank;
				this.suggest();
			});
		});
		new Setting(form)
			.setName('Level')
			.addText((t) => {
				t.inputEl.type = 'number';
				t.inputEl.min = '1';
				this.levelInput = t.inputEl;
				t.setValue(String(this.opts.level)).onChange((v) => (this.opts.level = Math.max(1, Number(v) || 1)));
			})
			.addExtraButton((b) => b.setIcon('wand-2').setTooltip('Suggest a level').onClick(() => this.suggest()));
		this.hintEl = form.createDiv({ cls: 'carl-forge-hint' });
		new Setting(form).setName('Size').addDropdown((d) => {
			for (const [i, name] of SIZE_NAMES.entries()) d.addOption(String(i + 1), `${name} (${i + 1})`);
			d.setValue(String(this.opts.size)).onChange((v) => (this.opts.size = Number(v)));
		});
		new Setting(form).setName('Type').addDropdown((d) => {
			for (const type of CREATURE_TYPES) d.addOption(type, type);
			d.setValue(this.opts.creature).onChange((v) => (this.opts.creature = v));
		});
		new Setting(form).setName('Role').addDropdown((d) => {
			for (const [key, label] of Object.entries(ROLES)) d.addOption(key, label);
			d.setValue(this.opts.role).onChange((v) => (this.opts.role = v as Role));
		});
		new Setting(form).setName('Armor').addDropdown((d) => {
			d.addOption('auto', 'By role');
			d.addOption('0', 'None');
			d.addOption('1', 'Light armor, +1');
			d.addOption('2', 'Heavy armor, +2');
			d.setValue('auto').onChange((v) => (this.opts.armor = v === 'auto' ? null : Number(v)));
		});

		new Setting(form)
			.addButton((b) => b.setButtonText('Roll').setCta().onClick(() => this.roll()))
			.addButton((b) => b.setButtonText('Create note').onClick(() => void this.createNote()))
			.addExtraButton((b) => b.setIcon('copy').setTooltip('Copy as note').onClick(() => void this.copy()));

		this.previewEl = root.createDiv({ cls: 'carl-forge-preview' });
		this.updateHint();
		this.roll();
	}

	async onClose() {
		this.contentEl.empty();
	}

	private suggest() {
		this.opts.level = suggestLevel(this.opts.floor, this.opts.rank);
		if (this.levelInput) this.levelInput.value = String(this.opts.level);
		this.updateHint();
	}

	private updateHint() {
		const [lo, hi] = levelRange(this.opts.floor, this.opts.rank);
		this.hintEl?.setText(`Typical for a ${this.opts.rank.toLowerCase()} on floor ${this.opts.floor}: level ${lo}–${hi}.`);
	}

	private roll() {
		this.mob = forgeMob(this.opts);
		this.renderPreview();
	}

	private renderPreview() {
		const el = this.previewEl;
		const mob = this.mob;
		if (!el || !mob) return;
		if (this.previewComponent) this.removeChild(this.previewComponent);
		this.previewComponent = this.addChild(new Component());
		el.empty();

		const data = mobRecord(mob);
		const block = el.createDiv({ cls: 'carl-block carl-creature' });
		const header = block.createDiv({ cls: 'carl-header' });
		header.createDiv({ cls: 'carl-name', text: this.name || 'Unnamed mob' });
		header.createDiv({
			cls: 'carl-subtitle',
			text: `${titleCase(mob.type)}; ${formatSize(mob.size)}, ${mob.creature}`,
		});
		renderHealth(block, mob.hpSlots, mob.hpSlots, statMod(mob.stats.constitution));
		renderGrid(block, 'carl-summary', summary(mob));
		renderGrid(
			block,
			'carl-stats',
			STAT_KEYS.map((k) => [titleCase(k.slice(0, 3)), `${mob.stats[k]} (${formatMod(statMod(mob.stats[k]))})`]),
		);
		renderAttacks(block, data.attacks, markdownRenderer(this.app, '', this.previewComponent));
	}

	private async noteText(): Promise<string> {
		const template = TEMPLATES.find((t) => t.id === 'mob')!;
		return fillMobTemplate(await templateSource(this.plugin, template), this.mob!);
	}

	private async createNote() {
		if (!this.mob) return;
		if (!this.name) {
			new Notice('Give the mob a name first.');
			return;
		}
		const template = TEMPLATES.find((t) => t.id === 'mob')!;
		const mob = this.mob;
		await createNote(this.plugin, template, this.name, (source) => fillMobTemplate(source, mob));
	}

	private async copy() {
		if (!this.mob) return;
		const text = (await this.noteText()).replace(/\{\{title\}\}/g, this.name || 'Unnamed mob');
		try {
			await navigator.clipboard.writeText(text);
			new Notice('Copied the mob as a note.');
		} catch {
			new Notice('Could not copy to the clipboard.');
		}
	}
}
