import { setTooltip } from 'obsidian';
import { formatBonuses, isMissing, linkMarkdown } from '../../rules/items';
import { formatMod, statKey } from '../../rules/stats';
import { RenderMarkdown } from '../shared';
import { asText, isRecord, titleCase, toRecord } from '../yaml';
import { GEAR_SLOTS, MAX_ACCESSORIES, Sheet } from './model';
import { listEntries, panel, table, text } from './ui';

const STORY_FIELDS: [key: string, label: string][] = [
	['trauma', 'Past trauma'],
	['loose-ends', 'Loose ends'],
	['regrets', 'Regrets'],
	['notes', 'Notes'],
];

// Up to 10 boxes, five to a row.
export function renderHotlist(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const entries = listEntries(sheet.data.hotlist);
	if (!entries.length) return;
	const grid = panel(root, 'Hotlist', 'is-red').createDiv({ cls: 'carl-hotlist' });
	for (const [name, value] of entries.slice(0, 10)) {
		md(value == null ? name : `**${titleCase(name)}:** ${asText(value)}`, grid.createDiv({ cls: 'carl-hot' }));
	}
}

// Gear slots on the left (every standard slot, filled or not); story boxes on the right.
export function renderGearAndStory(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const row = root.createDiv({ cls: 'carl-two-col' });
	renderGear(row.createDiv({ cls: 'carl-gear-col' }), sheet, md);

	const col = row.createDiv({ cls: 'carl-story-col' });
	renderPopularity(col, sheet.data.popularity);

	const story = STORY_FIELDS.map(([key, label]) => [label, text(sheet.data[key])] as const).filter(([, v]) => v);
	for (const [label, value] of story) {
		const box = col.createDiv({ cls: 'carl-story' });
		box.createDiv({ cls: 'carl-field-label', text: label });
		md(value, box.createDiv({ cls: 'carl-field-value' }));
	}
}

// Popularity is a running total that starts at 0.
function renderPopularity(col: HTMLElement, popularity: unknown) {
	const box = col.createDiv({ cls: 'carl-story carl-popularity' });
	box.createDiv({ cls: 'carl-field-label', text: 'Popularity' });
	box.createDiv({ cls: 'carl-field-value', text: String(Number(popularity) || 0) });
}

function renderGear(col: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const body = col.createDiv({ cls: 'carl-gear' });
	body.createDiv({ cls: 'carl-subhead', text: 'Gear slots / tattoos / patches' });

	const standard = GEAR_SLOTS.map(([key]) => key);
	const extraSlots = [...new Set(sheet.gear.map((g) => g.slot))].filter((s) => !standard.includes(s.toLowerCase()));
	const slots: [string, string][] = [...GEAR_SLOTS, ...extraSlots.map((s): [string, string] => [s, titleCase(s)])];

	for (const [key, label] of slots) {
		const items = sheet.gear.filter((g) => g.slot.toLowerCase() === key.toLowerCase()).map((g) => g.item);
		const slot = body.createDiv({ cls: 'carl-gear-slot' });
		slot.createDiv({ cls: 'carl-gear-label', text: label });
		const list = slot.createDiv({ cls: 'carl-gear-items' });
		items.forEach((item, i) => {
			const ignored = key === 'accessories' && i >= MAX_ACCESSORIES;
			const line = list.createDiv({ cls: ignored ? 'carl-gear-item is-ignored' : 'carl-gear-item' });
			md(linkMarkdown(item), line.createSpan());
			const bonuses = isMissing(item) ? 'No note found' : formatBonuses(item.bonuses);
			if (bonuses) line.createSpan({ cls: 'carl-muted', text: ` ${bonuses}` });
		});
	}
}

/** Skills: Name | Rank | Stat & mod | Check type | Notes & upgrades | ✓ */
export function renderSkills(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	if (!sheet.skills.length) return;

	const body = table(
		panel(root, 'Skills'),
		['Name', 'Rank', 'Stat & mod', 'Check type', 'Notes & upgrades', '✔'],
		'carl-skill-table',
	);
	for (const skill of sheet.skills) {
		const row = body.createEl('tr');
		md(skill.markdown, row.createEl('th'));
		const rank = row.createEl('td', {
			cls: skill.rankSources.length ? 'carl-center is-natural' : 'carl-center',
			text: skill.rank == null ? '' : String(skill.rank),
		});
		if (skill.rankSources.length) setTooltip(rank, skill.rankSources.join('\n'));
		row.createEl('td', {
			cls: 'carl-center',
			text: skill.stat ? `${titleCase(statKey(skill.stat))} ${formatMod(sheet.mod(skill.stat))}` : '',
		});
		row.createEl('td', { text: skill.type });
		md(skill.notes, row.createEl('td'));
		row.createEl('td', { cls: 'carl-center carl-check', text: skill.checked ? '✔' : '' });
	}
}

/** Spells: Name | Rank | Mana | Range | Duration | Check | Notes | ✔ — details from each spell's note. */
export function renderSpells(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	if (!sheet.spells.length) return;
	const body = table(
		panel(root, 'Spells'),
		['Name', 'Rank', 'Mana', 'Range', 'Duration', 'Check', 'Notes', '✔'],
		'carl-skill-table',
	);
	for (const spell of sheet.spells) {
		const info = spell.info;
		const row = body.createEl('tr');
		md(spell.markdown, row.createEl('th'));
		const rank = row.createEl('td', {
			cls: spell.rankSources.length ? 'carl-center is-natural' : 'carl-center',
			text: spell.rank == null ? '' : String(spell.rank),
		});
		if (spell.rankSources.length) setTooltip(rank, spell.rankSources.join('\n'));
		row.createEl('td', { cls: 'carl-center', text: info?.manaCost == null ? '' : String(info.manaCost) });
		row.createEl('td', { text: info?.range ?? '' });
		row.createEl('td', { text: info?.duration ?? '' });
		row.createEl('td', { text: spell.type });
		md(spell.notes, row.createEl('td'));
		row.createEl('td', { cls: 'carl-center carl-check', text: spell.checked ? '✔' : '' });
	}
}

/** Inventory: Item | Quantity | Notes. Entries can be `- "[[Rope]]"`, `- rope: 2`, or `- item/quantity/notes` maps. */
export function renderInventory(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const inventory = Array.isArray(sheet.data.inventory) ? sheet.data.inventory : [];
	if (!inventory.length) return;

	const body = table(panel(root, 'Inventory'), ['Item', 'Quantity', 'Notes'], 'carl-inventory-table');
	for (const raw of inventory) {
		for (const [item, f] of inventoryEntries(raw)) {
			const row = body.createEl('tr');
			md(item, row.createEl('td'));
			row.createEl('td', { cls: 'carl-center', text: asText(f.quantity) });
			md(text(f.notes), row.createEl('td'));
		}
	}
}

function inventoryEntries(raw: unknown): [string, Record<string, unknown>][] {
	if (isRecord(raw) && 'item' in raw) return [[asText(raw.item), raw]];
	return listEntries([raw]).map(([name, value]) => {
		if (value == null) return [name, {}];
		if (isRecord(value) || Array.isArray(value)) return [name, toRecord(value)];
		return [name, { quantity: value }];
	});
}
