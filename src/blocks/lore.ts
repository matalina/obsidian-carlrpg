import { describeMechanics } from '../rules/debuffs';
import { readTierBenefits } from '../rules/deities';
import { STATS, statKey } from '../rules/stats';
import { RenderMarkdown } from './shared';
import { asText, isRecord, titleCase } from './yaml';

// Card bodies for the rules' reference notes: debuffs, damage types, deities and achievements.

type Body = (block: HTMLElement, data: Record<string, unknown>, md: RenderMarkdown) => void;

function facts(block: HTMLElement, md: RenderMarkdown, lines: [label: string, text: string][]) {
	const body = block.createDiv({ cls: 'carl-facts' });
	for (const [label, text] of lines) if (text) md(`**${label}:** ${text}`, body.createDiv());
	if (!body.childElementCount) body.remove();
}

function bullets(block: HTMLElement, md: RenderMarkdown, list: string[]) {
	if (!list.length) return;
	const ul = block.createEl('ul', { cls: 'carl-trait-list' });
	for (const item of list) md(item, ul.createEl('li'));
}

function list(value: unknown): string[] {
	if (value == null || value === '') return [];
	return (Array.isArray(value) ? value : [value]).flatMap((v) => {
		// An unquoted [[link]] in YAML arrives as nested lists.
		let inner: unknown = v;
		while (Array.isArray(inner) && inner.length === 1) inner = inner[0];
		if (Array.isArray(v)) return [`[[${asText(inner)}]]`];
		// `- "[[Scroll of Water Breathing]]": 10` → "10 × [[Scroll of Water Breathing]]"
		if (isRecord(v)) return Object.entries(v).map(([name, qty]) => (qty == null || qty === '' ? name : `${asText(qty)} × ${name}`));
		return [asText(inner)];
	}).filter(Boolean);
}

/** "Blinded" — Effect, Duration, Stacks. `mechanics` say the same as `effect`, so they only stand in for a missing one. */
export const debuffBody: Body = (block, data, md) => {
	facts(block, md, [
		['Effect', asText(data.effect) || describeMechanics(data.mechanics).join(', ')],
		['Duration', asText(data.duration)],
		['Stacks', data.stackable == null ? '' : data.stackable === true ? 'Yes' : 'No'],
	]);
};

export function debuffSubtitle(data: Record<string, unknown>): string {
	return ['Debuff', ...list(data.categories).map(titleCase)].join(' · ');
}

/** Damage types are only a name and a rarity; the subtitle carries it. */
export function damageTypeSubtitle(data: Record<string, unknown>): string {
	const rarity = asText(data.rarity);
	return rarity ? `${titleCase(rarity)} damage type` : 'Damage type';
}

/** The book's god entry: title, description, the facts, signature stat and skills, then benefits by tier. */
export const deityBody: Body = (block, data, md) => {
	const description = asText(data.description);
	if (description) md(description, block.createDiv({ cls: 'carl-description' }));
	const stat = statKey(asText(data['signature-stat']));
	facts(block, md, [
		['Symbol', asText(data.symbol)],
		['Temple', asText(data.temple)],
		['High Cleric', asText(data['high-cleric'])],
		['Offering', asText(data.offering)],
		['Rival', list(data.rival).join(', ')],
		['Likely Sponsor', asText(data['likely-sponsor'])],
		['Signature Stat', STATS.find(([key]) => key === stat)?.[1] ?? asText(data['signature-stat'])],
		['Signature Skills', list(data['signature-skills']).join(', ')],
		['Signature Weapon', asText(data['signature-note'])],
	]);
	renderTierBenefits(block, data, md);
};

/** Acolyte, Devotee and Zealot benefits; `reached` marks the tiers a crawler has, the rest are dimmed. */
export function renderTierBenefits(block: HTMLElement, data: Record<string, unknown>, md: RenderMarkdown, reached?: string[]) {
	for (const [tier, benefits] of readTierBenefits(data)) {
		const dim = reached && !reached.includes(tier);
		const section = block.createDiv({ cls: dim ? 'carl-tier is-locked' : 'carl-tier' });
		section.createDiv({ cls: 'carl-subhead', text: titleCase(tier) });
		bullets(section, md, benefits);
	}
}

/** The achievement's text as the AI reads it out, then its loot box and what was in it. */
export const achievementBody: Body = (block, data, md) => {
	const text = asText(data.text);
	if (text) md(`*${text}*`, block.createDiv({ cls: 'carl-description' }));
	facts(block, md, [['Loot Box', asText(data['loot-box'])]]);
	bullets(block, md, list(data.contents));
};
