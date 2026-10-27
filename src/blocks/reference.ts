import { formatSize } from '../rules/size';
import { App, MarkdownPostProcessorContext } from 'obsidian';
import { bonusLabel } from '../rules/items';
import { describeSkillBonuses, readSkillBonuses } from '../rules/skills';
import { formatMod, statKey, STATS } from '../rules/stats';
import { LiveBlock, noteName, OBSIDIAN_PROPERTIES, RenderMarkdown, renderExtras, renderGrid } from './shared';
import { asText, titleCase, toEntries } from './yaml';

// Statblock-style cards for the notes a character links to: items (gear and buffs), races and classes.
// Same properties the character sheet reads, so one note feeds both.

export const ITEM_BLOCK = 'carl-item';
export const RACE_BLOCK = 'carl-race';
export const CLASS_BLOCK = 'carl-class';

interface ReferenceKind {
	block: string;
	/** Subtitle, e.g. "Feet" for an item's slot or "Race". */
	subtitle: (data: Record<string, unknown>) => string;
	/** Properties this card shows in a fixed place; the rest are listed as extras. */
	known: string[];
	/** `card`: statblock with a bonus row. `list`: one bullet per trait, like the book's race/class entries. */
	layout: 'card' | 'list';
}

const KINDS: ReferenceKind[] = [
	{
		block: ITEM_BLOCK,
		subtitle: (d) => [d.slot && `${titleCase(asText(d.slot))} slot`, asText(d.rarity), asText(d.type)]
			.filter(Boolean)
			.map((s) => titleCase(asText(s)))
			.join(' · ') || 'Item',
		known: ['name', 'slot', 'rarity', 'type', 'bonuses', 'description'],
		layout: 'card',
	},
	{
		block: RACE_BLOCK,
		subtitle: () => 'Race',
		known: ['name', 'size', 'bonuses', 'skills', 'description', 'abilities'],
		layout: 'list',
	},
	{
		block: CLASS_BLOCK,
		subtitle: () => 'Class',
		known: ['name', 'size', 'bonuses', 'skills', 'description', 'abilities'],
		layout: 'list',
	},
];

export function referenceBlocks(app: App) {
	return KINDS.map((kind) => ({
		name: kind.block,
		render: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) =>
			ctx.addChild(new ReferenceBlock(app, kind, source, el, ctx.sourcePath)),
	}));
}

class ReferenceBlock extends LiveBlock {
	constructor(app: App, private kind: ReferenceKind, source: string, el: HTMLElement, sourcePath: string) {
		super(app, kind.block, source, el, sourcePath);
	}

	protected renderData(data: Record<string, unknown>, md: RenderMarkdown) {
		const block = this.containerEl.createDiv({ cls: `carl-block carl-reference ${this.kind.block}` });

		const header = block.createDiv({ cls: 'carl-header' });
		header.createDiv({ cls: 'carl-name', text: asText(data.name) || noteName(this.sourcePath) });
		header.createDiv({ cls: 'carl-subtitle', text: this.kind.subtitle(data) });

		if (this.kind.layout === 'list') this.renderList(block, data, md);
		else this.renderCard(block, data, md);
	}

	// Items: bonuses as a row like a creature's stats ("DEX +2 | CHA +1"), then description and extras.
	private renderCard(block: HTMLElement, data: Record<string, unknown>, md: RenderMarkdown) {
		const bonuses = bonusEntries(data).map(([key, amount]) => [bonusLabel(key), formatMod(amount)]);
		renderGrid(block, 'carl-stats carl-bonus-row', bonuses);

		const description = asText(data.description);
		if (description) md(description, block.createDiv({ cls: 'carl-section carl-description' }));

		renderExtras(block, data, (key) => this.kind.known.includes(key), md);
	}

	// Races and classes, like the book: a description, then one bullet per trait —
	// "Size: Medium (4)", "+5 Dexterity", "+2 Climbing and Perception Skills", each ability, and any other property.
	private renderList(block: HTMLElement, data: Record<string, unknown>, md: RenderMarkdown) {
		const description = asText(data.description);
		if (description) md(description, block.createDiv({ cls: 'carl-description' }));

		const bullets: string[] = [];
		const size = formatSize(data.size);
		if (size) bullets.push(`Size: ${size}`);
		for (const [key, amount] of bonusEntries(data)) bullets.push(`${formatMod(amount)} ${bonusName(key)}`);
		bullets.push(...describeSkillBonuses(readSkillBonuses(data)));
		for (const [name, text] of toEntries(data.abilities)) {
			bullets.push(text == null ? name : `**${titleCase(name)}:** ${asText(text)}`);
		}
		for (const [key, value] of Object.entries(data)) {
			if (value == null || this.kind.known.includes(key) || OBSIDIAN_PROPERTIES.has(key)) continue;
			bullets.push(`${titleCase(key)}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
		}
		if (!bullets.length) return;

		const list = block.createEl('ul', { cls: 'carl-trait-list' });
		for (const bullet of bullets) md(bullet, list.createEl('li'));
	}
}

function bonusEntries(data: Record<string, unknown>): [key: string, amount: number][] {
	return toEntries(data.bonuses).flatMap(([name, value]) => {
		const amount = Number(value);
		return Number.isFinite(amount) ? [[statKey(name), amount]] : [];
	});
}

// Full stat name for stats ("Dexterity"), the bonus label for anything else ("Evade").
function bonusName(key: string): string {
	return STATS.find(([abbr]) => abbr === key)?.[1] ?? bonusLabel(key);
}
