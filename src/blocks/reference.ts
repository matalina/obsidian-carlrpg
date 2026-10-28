import { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { bonusLabel } from '../rules/items';
import { formatSize } from '../rules/size';
import { describeSkillBonuses, readSkillBonuses } from '../rules/skills';
import { sponsoredCrawlers } from '../rules/sponsors';
import { describeStatPool, readStatPools } from '../rules/statpoints';
import { formatMod, statKey, STATS } from '../rules/stats';
import { LiveBlock, noteName, OBSIDIAN_PROPERTIES, RenderMarkdown } from './shared';
import { asText, titleCase, toEntries } from './yaml';

// Cards for the notes a character links to: items (gear and buffs), races and classes.
// Laid out like the book's race/class entries — a description, then one bullet per trait.
// Same properties the character sheet reads, so one note feeds both.

export const ITEM_BLOCK = 'carl-item';
export const RACE_BLOCK = 'carl-race';
export const CLASS_BLOCK = 'carl-class';
export const SPONSOR_BLOCK = 'carl-sponsor';

interface ReferenceKind {
	block: string;
	/** Subtitle, e.g. "Feet" for an item's slot or "Race". */
	subtitle: (data: Record<string, unknown>) => string;
	/** Properties this card shows in a fixed place; the rest are listed as extras. */
	known: string[];
	/** Lists the crawlers this note sponsors (sponsors only). */
	crawlers?: boolean;
}

const KINDS: ReferenceKind[] = [
	{
		block: ITEM_BLOCK,
		subtitle: (d) => [d.slot && `${titleCase(asText(d.slot))} slot`, asText(d.rarity), asText(d.type)]
			.filter(Boolean)
			.map((s) => titleCase(asText(s)))
			.join(' · ') || 'Item',
		known: ['name', 'slot', 'rarity', 'type', 'bonuses', 'description', 'abilities'],
	},
	{
		block: RACE_BLOCK,
		subtitle: () => 'Race',
		known: ['name', 'earth', 'size', 'bonuses', 'stat-points', 'skills', 'spells', 'description', 'abilities'],
	},
	{
		block: CLASS_BLOCK,
		subtitle: () => 'Class',
		known: ['name', 'earth', 'class-type', 'size', 'bonuses', 'stat-points', 'skills', 'spells', 'description', 'abilities'],
	},
	{
		block: SPONSOR_BLOCK,
		subtitle: () => 'Sponsor',
		known: ['name', 'description', 'crawlers'],
		crawlers: true,
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
		const name = header.createDiv({ cls: 'carl-name', text: asText(data.name) || noteName(this.sourcePath) });
		// `earth: true` marks an Earth race or class, shown with the book's globe.
		if (data.earth === true) name.createSpan({ cls: 'carl-earth', text: ' 🌎', attr: { 'aria-label': 'Earth' } });
		header.createDiv({ cls: 'carl-subtitle', text: this.kind.subtitle(data) });

		this.renderTraits(block, data, md);
		if (this.kind.crawlers) this.renderCrawlers(block, data, md);
	}

	// Every crawler's interface shows who a sponsor backs. Re-renders on any note change,
	// since a crawler anywhere in the vault can add this sponsor.
	private renderCrawlers(block: HTMLElement, data: Record<string, unknown>, md: RenderMarkdown) {
		this.watch([], true);
		const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
		const crawlers = sponsoredCrawlers(this.app, file instanceof TFile ? file : null, data);
		const section = block.createDiv({ cls: 'carl-sponsored' });
		section.createDiv({ cls: 'carl-label', text: 'Sponsored crawlers' });
		if (!crawlers.length) {
			section.createDiv({ cls: 'carl-muted', text: 'None yet' });
			return;
		}
		const list = section.createEl('ul', { cls: 'carl-trait-list' });
		for (const crawler of crawlers) md(crawler, list.createEl('li'));
	}

	// "Class Type: Mage", the description, then "Size: Medium (4)", "+2 Intelligence and Dexterity",
	// "−2 Constitution and Charisma", "+2 Climbing and Perception Skills", each ability, and any other property.
	private renderTraits(block: HTMLElement, data: Record<string, unknown>, md: RenderMarkdown) {
		const classType = asText(data['class-type']);
		if (classType) md(`**Class Type:** ${classType}`, block.createDiv({ cls: 'carl-class-type' }));
		const description = asText(data.description);
		if (description) md(description, block.createDiv({ cls: 'carl-description' }));

		const bullets: string[] = [];
		const size = formatSize(data.size);
		if (size) bullets.push(`Size: ${size}`);
		bullets.push(...describeBonuses(bonusEntries(data)));
		bullets.push(...readStatPools(data).map(describeStatPool));
		// Skill and spell lines by rank, highest first, spells before skills at the same rank.
		const ranked = [
			...describeSkillBonuses(readSkillBonuses(data, 'spells'), 'Spell'),
			...describeSkillBonuses(readSkillBonuses(data)),
		];
		bullets.push(...ranked.sort((a, b) => parseFloat(b) - parseFloat(a)));
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
		if (value == null || value === '') return [];
		const amount = Number(value);
		return Number.isFinite(amount) ? [[statKey(name), amount]] : [];
	});
}

// Bonuses of the same amount share a line, gains before penalties, like the book:
// "+2 Intelligence and Dexterity", "−2 Constitution and Charisma".
function describeBonuses(entries: [key: string, amount: number][]): string[] {
	const byAmount = new Map<number, string[]>();
	for (const [key, amount] of entries) {
		if (amount) byAmount.set(amount, [...(byAmount.get(amount) ?? []), bonusName(key)]);
	}
	return [...byAmount]
		.sort(([a], [b]) => Number(b > 0) - Number(a > 0))
		.map(([amount, names]) => `${formatMod(amount).replace('-', '−')} ${joinAnd(names)}`);
}

function joinAnd(names: string[]): string {
	return names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// Full stat name for stats ("Dexterity"), the bonus label for anything else ("Evade").
function bonusName(key: string): string {
	return STATS.find(([abbr]) => abbr === key)?.[1] ?? bonusLabel(key);
}
