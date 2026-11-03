import { Component, ItemView, Notice, normalizePath, setIcon, Setting, WorkspaceLeaf } from 'obsidian';
import { RACE_KNOWN, renderTraits } from '../blocks/reference';
import { markdownRenderer } from '../blocks/shared';
import { STATS } from '../rules/stats';
import type CarlPlugin from '../main';
import { availablePath, createNote, ensureFolder, templateSource } from '../templates/commands';
import { TEMPLATES } from '../templates/definitions';
import { BENEFITS, DETRIMENTS, MENU, MenuOption } from './menu';
import {
	Build,
	BuildKind,
	buildRecord,
	fillTemplate,
	frontmatter,
	naturalAttackRecord,
	naturalAttacks,
	newPick,
	Pick,
	penaltyPoints,
	pickPoints,
	tally,
} from './model';

export const BUILDER_VIEW = 'carl-race-class-builder';

const SIZE_NAMES = ['Tiny', 'Small', 'Petite', 'Medium', 'Large', 'Huge', 'Colossal', 'Gargantuan'];

/**
 * Sidebar calculator for the Race & Class Point Build: pick benefits and detriments from the book's menu,
 * watch the points, preview the card, and create the note the character sheet reads.
 */
export class RaceClassBuilderView extends ItemView {
	private build: Build = { kind: 'race', name: '', earth: false, classType: '', size: 4, description: '', picks: [] };
	private classTypeEl: HTMLElement | null = null;
	private sizeEl: HTMLElement | null = null;
	private tallyEl: HTMLElement | null = null;
	private benefitsEl: HTMLElement | null = null;
	private detrimentsEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewComponent: Component | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: CarlPlugin) {
		super(leaf);
	}

	getViewType() {
		return BUILDER_VIEW;
	}

	getDisplayText() {
		return 'Race & class builder';
	}

	getIcon() {
		return 'hammer';
	}

	async onOpen() {
		const root = this.contentEl;
		root.empty();
		root.addClass('carl-forge', 'carl-builder');
		const form = root.createDiv({ cls: 'carl-forge-form' });

		new Setting(form).setName('Build a').addDropdown((d) =>
			d
				.addOption('race', 'Race (25 points)')
				.addOption('class', 'Class (30 points)')
				.setValue(this.build.kind)
				.onChange((v) => {
					this.build.kind = v as BuildKind;
					this.updateKind();
					this.refresh();
				}),
		);
		new Setting(form).setName('Name').addText((t) =>
			t.setPlaceholder('Grill master').onChange((v) => {
				this.build.name = v.trim();
				this.renderPreview();
			}),
		);
		new Setting(form)
			.setName('Earth')
			.setDesc('Comes with a silver box and hobby potion, and can take earth classes.')
			.addToggle((t) =>
				t.setValue(this.build.earth).onChange((v) => {
					this.build.earth = v;
					this.renderPreview();
				}),
			);
		this.classTypeEl = new Setting(form).setName('Class type').addText((t) =>
			t.setPlaceholder('Bard, fighter').onChange((v) => {
				this.build.classType = v.trim();
				this.renderPreview();
			}),
		).settingEl;
		this.sizeEl = new Setting(form).setName('Size').addDropdown((d) => {
			for (const [i, name] of SIZE_NAMES.entries()) d.addOption(String(i + 1), `${name} (${i + 1})`);
			d.setValue(String(this.build.size)).onChange((v) => {
				this.build.size = Number(v);
				this.renderPreview();
			});
		}).settingEl;
		new Setting(form).setName('Description').addTextArea((t) => {
			t.inputEl.rows = 3;
			t.onChange((v) => {
				this.build.description = v.trim();
				this.renderPreview();
			});
		});

		this.tallyEl = form.createDiv({ cls: 'carl-builder-tally' });

		new Setting(form).setName('Benefits').setHeading();
		this.addPicker(form, BENEFITS, 'Add a benefit…');
		this.benefitsEl = form.createDiv({ cls: 'carl-forge-traits' });

		new Setting(form)
			.setName('Detriments')
			.setDesc('Up to 5 detriments, for up to 5 extra points.')
			.setHeading();
		this.addPicker(form, DETRIMENTS, 'Add a detriment…');
		this.detrimentsEl = form.createDiv({ cls: 'carl-forge-traits' });

		new Setting(form)
			.addButton((b) => b.setButtonText('Create note').setCta().onClick(() => void this.createNote()))
			.addExtraButton((b) => b.setIcon('copy').setTooltip('Copy as note').onClick(() => void this.copy()))
			.addExtraButton((b) => b.setIcon('rotate-ccw').setTooltip('Start over').onClick(() => this.reset()));

		this.previewEl = root.createDiv({ cls: 'carl-forge-preview' });
		this.updateKind();
		this.refresh();
	}

	async onClose() {
		this.contentEl.empty();
	}

	// A <select> with the menu grouped by tier; choosing an option adds it.
	private addPicker(parent: HTMLElement, options: MenuOption[], placeholder: string) {
		const select = parent.createEl('select', { cls: 'dropdown carl-builder-picker' });
		select.createEl('option', { text: placeholder, value: '' });
		const groups = new Map<string, HTMLOptGroupElement>();
		for (const option of options) {
			let group = groups.get(option.tier);
			if (!group) {
				const cost = option.cost && option.effect !== 'custom' ? ` (${option.cost} each)` : '';
				group = select.createEl('optgroup', { attr: { label: `${option.tier}${cost}` } });
				groups.set(option.tier, group);
			}
			group.createEl('option', { text: option.label, value: option.id });
		}
		select.addEventListener('change', () => {
			const option = MENU.find((o) => o.id === select.value);
			select.value = '';
			if (!option) return;
			this.build.picks.push(newPick(option));
			this.refresh();
		});
	}

	private updateKind() {
		this.classTypeEl?.toggle(this.build.kind === 'class');
		this.sizeEl?.toggle(this.build.kind === 'race');
		if (this.build.kind === 'class') this.build.size = null;
		else this.build.size ??= 4;
	}

	private reset() {
		this.build.picks = [];
		this.refresh();
	}

	private refresh() {
		this.renderPicks(this.benefitsEl, false);
		this.renderPicks(this.detrimentsEl, true);
		this.renderTally();
		this.renderPreview();
	}

	private changed() {
		this.renderTally();
		this.renderPreview();
	}

	private renderTally() {
		const el = this.tallyEl;
		if (!el) return;
		el.empty();
		const t = tally(this.build);
		const line = el.createDiv({ cls: 'carl-builder-points' });
		line.createSpan({ cls: t.left < 0 ? 'carl-builder-left is-over' : 'carl-builder-left', text: `${t.left} left` });
		line.createSpan({
			cls: 'carl-muted',
			text: ` · ${t.spent} spent of ${t.budget} (${t.base}${t.bonus ? ` + ${t.bonus} from detriments` : ''})`,
		});
		for (const warning of t.warnings) el.createDiv({ cls: 'carl-forge-hint', text: warning });
	}

	private renderPicks(el: HTMLElement | null, detriments: boolean) {
		if (!el) return;
		el.empty();
		const picks = this.build.picks.filter((p) => !!p.option.detriment === detriments);
		if (!picks.length) {
			el.createDiv({ cls: 'carl-forge-hint', text: detriments ? 'None.' : 'Choose from the menu above.' });
			return;
		}
		for (const pick of picks) this.renderPick(el, pick);
	}

	private renderPick(parent: HTMLElement, pick: Pick) {
		const { option } = pick;
		const row = parent.createDiv({ cls: 'carl-forge-trait' });
		const top = row.createDiv({ cls: 'carl-forge-trait-top' });
		top.createDiv({ cls: 'carl-builder-label', text: option.effect === 'text' ? option.tier : option.label });
		const cost = top.createSpan({ cls: 'carl-builder-cost' });
		const showCost = () => {
			const points = pickPoints(pick);
			const penalty = option.effect === 'stat-penalty' || option.effect === 'skill-penalty';
			cost.setText(penalty ? `−${penaltyPoints(pick)}` : option.detriment ? `+${points}` : String(points));
		};
		showCost();
		const remove = top.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Remove' } });
		setIcon(remove, 'x');
		remove.addEventListener('click', () => {
			this.build.picks.splice(this.build.picks.indexOf(pick), 1);
			this.refresh();
		});

		const fields = row.createDiv({ cls: 'carl-builder-fields' });
		const update = () => {
			showCost();
			this.changed();
		};
		const text = (placeholder: string, key: 'name' | 'damageType' | 'text') => {
			const input = fields.createEl('input', { type: 'text', placeholder, value: pick[key] });
			input.setAttr('aria-label', placeholder);
			input.addEventListener('input', () => {
				pick[key] = input.value;
				update();
			});
		};
		const number = (label: string, key: 'amount' | 'cost', min = 1, max?: number) => {
			const input = fields.createEl('input', { type: 'number', value: String(pick[key]) });
			input.min = String(min);
			if (max) input.max = String(max);
			input.setAttr('aria-label', label);
			input.addEventListener('input', () => {
				pick[key] = Math.max(min, Number(input.value) || min);
				update();
			});
		};
		const stat = (extra: [value: string, label: string][] = []) => {
			const select = fields.createEl('select', { cls: 'dropdown' });
			for (const [value, label] of [...extra, ...STATS]) select.createEl('option', { value, text: label });
			select.value = pick.stat;
			select.addEventListener('change', () => {
				pick.stat = select.value;
				update();
			});
		};

		switch (option.effect) {
			case 'stat':
				stat();
				number('Points', 'amount');
				break;
			case 'stat-penalty':
			case 'stat-skills-penalty':
				stat();
				number('Penalty', 'amount');
				break;
			case 'stat-advantage':
			case 'stat-cap':
				stat();
				break;
			case 'health-stat':
				stat([]);
				break;
			case 'check-die':
				stat([['evade', 'Evade']]);
				break;
			case 'skill': {
				text('Skill or spell', 'name');
				number('Ranks', 'amount');
				const label = fields.createEl('label', { cls: 'carl-builder-check' });
				const box = label.createEl('input', { type: 'checkbox' });
				box.checked = pick.spell;
				label.appendText(' Spell');
				box.addEventListener('change', () => {
					pick.spell = box.checked;
					update();
				});
				break;
			}
			case 'skill-penalty':
				text('Skill', 'name');
				number('Penalty', 'amount');
				break;
			case 'skill-group':
				text('Skills, comma-separated — or leave empty and pick a stat', 'name');
				stat();
				break;
			case 'dr':
				number('DR', 'amount', 1, 3);
				break;
			case 'size': {
				const select = fields.createEl('select', { cls: 'dropdown' });
				for (const n of [1, 2]) select.createEl('option', { value: String(n), text: `${SIZE_NAMES[n - 1]} (${n})` });
				select.value = String(pick.amount);
				select.addEventListener('change', () => {
					pick.amount = Number(select.value);
					update();
				});
				break;
			}
			case 'natural-attack':
				text('Attack name, e.g. Bite', 'name');
				stat();
				text('Damage type, e.g. Piercing', 'damageType');
				break;
			case 'resistance':
			case 'immunity':
			case 'vulnerability':
				text('Damage type', 'name');
				break;
			case 'rank-20':
				if (option.preset !== 'all') text('Skills, comma-separated', 'name');
				break;
			case 'custom':
				text('What it does', 'text');
				number('Points', 'cost');
				break;
			case 'text': {
				const area = fields.createEl('textarea', { attr: { rows: '2', 'aria-label': 'Ability text' } });
				area.value = pick.text;
				area.addEventListener('input', () => {
					pick.text = area.value;
					update();
				});
				break;
			}
		}
		if (!fields.childElementCount) fields.remove();
	}

	private renderPreview() {
		const el = this.previewEl;
		if (!el) return;
		if (this.previewComponent) this.removeChild(this.previewComponent);
		this.previewComponent = this.addChild(new Component());
		el.empty();

		const data = buildRecord(this.build);
		const block = el.createDiv({ cls: `carl-block carl-reference carl-${this.build.kind}` });
		const header = block.createDiv({ cls: 'carl-header' });
		const name = header.createDiv({ cls: 'carl-name', text: this.build.name || `Unnamed ${this.build.kind}` });
		if (this.build.earth) name.createSpan({ cls: 'carl-earth', text: ' 🌎', attr: { 'aria-label': 'Earth' } });
		header.createDiv({ cls: 'carl-subtitle', text: this.build.kind === 'race' ? 'Race' : 'Class' });
		renderTraits(block, data, markdownRenderer(this.app, '', this.previewComponent), ['class-type', ...RACE_KNOWN]);
		block.createDiv({ cls: 'carl-source', text: 'Homebrew' });
	}

	private template() {
		return TEMPLATES.find((t) => t.id === this.build.kind)!;
	}

	private async createNote() {
		if (!this.build.name) {
			new Notice(`Give the ${this.build.kind} a name first.`);
			return;
		}
		const record = buildRecord(this.build);
		const created = await this.createNaturalAttacks();
		await createNote(this.plugin, this.template(), this.build.name, (source) => fillTemplate(source, record));
		if (created.length) new Notice(`Also created ${created.join(', ')}.`);
	}

	// Each natural attack needs its own Skill note for the sheet to roll it; existing notes are left alone.
	private async createNaturalAttacks(): Promise<string[]> {
		const attacks = naturalAttacks(this.build);
		if (!attacks.length) return [];
		const skill = TEMPLATES.find((t) => t.id === 'skill')!;
		const folder = this.plugin.settings.folders.skill || skill.folder;
		const source = await templateSource(this.plugin, skill);
		const created: string[] = [];
		for (const attack of attacks) {
			if (this.app.metadataCache.getFirstLinkpathDest(attack.name, '')) continue;
			await ensureFolder(this.app, folder);
			const content = fillTemplate(source, naturalAttackRecord(attack, this.build.name)).replace(/\{\{title\}\}/g, attack.name);
			await this.app.vault.create(normalizePath(availablePath(this.app, folder, attack.name)), content);
			created.push(attack.name);
		}
		return created;
	}

	private async copy() {
		const source = await templateSource(this.plugin, this.template());
		const text = fillTemplate(source, buildRecord(this.build)).replace(/\{\{title\}\}/g, this.build.name || `Unnamed ${this.build.kind}`);
		const attacks = naturalAttacks(this.build).map(
			(a) => `\n\n<!-- ${a.name} (skill note) -->\n${frontmatter(naturalAttackRecord(a, this.build.name))}`,
		);
		try {
			await navigator.clipboard.writeText(text + attacks.join(''));
			new Notice(`Copied the ${this.build.kind} as a note.`);
		} catch {
			new Notice('Could not copy to the clipboard.');
		}
	}
}
