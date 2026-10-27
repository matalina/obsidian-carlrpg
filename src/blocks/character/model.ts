import { App } from 'obsidian';
import { Item, Linked, linkedName, parseLinks, readBonuses, resolveItem, resolveValue } from '../../rules/items';
import { collectStats, STATS, statKey, statMod } from '../../rules/stats';
import { readSkillBonuses, skillKey } from '../../rules/skills';
import { asText, isRecord, titleCase, toEntries, toRecord } from '../yaml';

export const GEAR_SLOTS: [key: string, label: string][] = [
	['head', 'Head'],
	['torso', 'Torso'],
	['arms', 'Arms'],
	['hands', 'Hands/Holding'],
	['legs', 'Legs'],
	['feet', 'Feet'],
	['accessories', 'Accessories (max 10)'],
];
export const MAX_EXTERNAL_BUFFS = 3;
export const MAX_ACCESSORIES = 10;
export const DEFAULT_HEALTH_SLOTS = 10;

export interface GearEntry {
	slot: string;
	item: Item;
}

export interface SkillLine {
	name: string;
	rank: number | null;
	/** How the rank was reached, for its tooltip (only when race/class add to it). */
	rankSources: string[];
	stat: string;
	type: string;
	notes: string;
	checked: boolean;
}

export interface StatLine {
	name: string;
	key: string;
	base: number;
	enhanced: number;
	/** How the enhanced score was reached, for its tooltip. */
	sources: string[];
	/** How the unenhanced score was reached (listed value + race/class). */
	baseSources: string[];
}

/** Everything the sheet needs, with linked notes resolved and bonuses totalled. */
export interface Sheet {
	data: Record<string, unknown>;
	sourcePath: string;
	stats: StatLine[];
	gear: GearEntry[];
	buffs: Item[];
	race: Linked | null;
	class: Linked | null;
	pet: Linked | null;
	mount: Linked | null;
	deity: Linked | null;
	sponsors: Linked[];
	/** Skills the character lists, with race/class ranks added, plus skills only race/class grant. */
	skills: SkillLine[];
	/** Every linked note, so the block can re-render when one changes. */
	linked: Linked[];
	/** Enhanced modifier for a stat key ("str") or name ("strength"). */
	mod: (stat: string) => number;
	evade: { dex: number; buffs: number; total: number };
	dr: { armor: number; buffs: number; total: number };
}

export function buildSheet(app: App, data: Record<string, unknown>, sourcePath: string): Sheet {
	const item = (value: unknown) => parseLinks(value).map((link) => resolveItem(app, link, sourcePath));
	const linked = (value: unknown) => resolveValue(app, value, sourcePath);

	const gear = toEntries(data.gear).flatMap(([slot, value]) => item(value).map((i) => ({ slot, item: i })));
	const buffs = item(data.buffs);
	const activeBuffs = buffs.slice(0, MAX_EXTERNAL_BUFFS);
	const gearItems = gear.map((g) => g.item);

	const race = linked(data.race);
	const cls = linked(data.class);
	const pet = linked(data.pet);
	const mount = linked(data.mount);
	const deity = linked(data.deity);
	const sponsors = (Array.isArray(data.sponsors) ? data.sponsors : data.sponsors == null ? [] : [data.sponsors])
		.flatMap((s) => linked(s) ?? []);

	// Race and class bonuses are part of the unenhanced score; gear and external buffs enhance it.
	const natural = [race, cls].flatMap((l) => (l ? [source(l)] : []));
	const enhancements = [...gearItems, ...activeBuffs].map(source);
	const stats = statLines(data, natural, enhancements);
	const mod = (stat: string) => {
		const line = stats.find((s) => s.key === statKey(stat));
		return line ? statMod(line.enhanced) : 0;
	};
	const total = (sources: BonusSource[], key: string) =>
		sources.reduce((sum, s) => sum + (s.bonuses.get(key) ?? 0), 0);

	// Evade = d20 + DEX mod + buffs; DR = armor (gear) + buffs. `evade-buffs`/`dr-buffs` add on top of buff items.
	const evadeBuffs = total([...natural, ...enhancements], 'evade') + num(data['evade-buffs']);
	const armor = total(gearItems.map(source), 'dr');
	const drBuffs = total([...natural, ...activeBuffs.map(source)], 'dr') + num(data['dr-buffs']);

	return {
		data,
		sourcePath,
		stats,
		gear,
		buffs,
		race,
		class: cls,
		pet,
		mount,
		deity,
		sponsors,
		skills: skillLines(data, [race, cls].flatMap((l) => l ?? [])),
		linked: [...gearItems, ...buffs, ...[race, cls, pet, mount, deity, ...sponsors].flatMap((l) => l ?? [])],
		mod,
		evade: { dex: mod('dex'), buffs: evadeBuffs, total: mod('dex') + evadeBuffs },
		dr: { armor, buffs: drBuffs, total: armor + drBuffs },
	};
}

function num(value: unknown): number {
	return Number(value) || 0;
}

interface BonusSource {
	name: string;
	bonuses: Map<string, number>;
}

function source(linked: Linked): BonusSource {
	return { name: linkedName(linked), bonuses: readBonuses(linked.props) };
}

// Always shows the five stats (missing ones as 0), plus any extra stats the author listed.
// unenhanced = listed value + race/class bonuses; enhanced = unenhanced + gear/buff bonuses.
function statLines(data: Record<string, unknown>, natural: BonusSource[], enhancements: BonusSource[]): StatLine[] {
	const given = collectStats(data);
	const lines = [
		...STATS.map(([key, name]) => given.find((s) => s.key === key) ?? { name, key, value: 0 }),
		...given.filter((s) => !STATS.some(([key]) => key === s.key)),
	];
	return lines.map(({ name, key, value }) => {
		const listed = Number.isFinite(value) ? value : 0;
		const baseSources = [`${listed} listed`];
		const base = applyBonuses(listed, key, natural, baseSources);
		const sources = [`${base} unenhanced`];
		const enhanced = applyBonuses(base, key, enhancements, sources);
		return { name, key, base, enhanced, sources, baseSources };
	});
}

function applyBonuses(start: number, key: string, sources: BonusSource[], log: string[]): number {
	let value = start;
	for (const { name, bonuses } of sources) {
		const bonus = bonuses.get(key);
		if (!bonus) continue;
		value += bonus;
		log.push(`${bonus < 0 ? bonus : `+${bonus}`} ${name}`);
	}
	return value;
}

// The character's own `rank` is what they trained; race and class ranks are added on top.
function skillLines(data: Record<string, unknown>, grants: Linked[]): SkillLine[] {
	const lines: SkillLine[] = toEntries(data.skills).map(([name, details]) => {
		const f = isRecord(details) || Array.isArray(details) ? toRecord(details) : { rank: details };
		const rank = f.rank == null || f.rank === '' ? null : Number(f.rank);
		return {
			name,
			rank: Number.isFinite(rank) ? rank : null,
			rankSources: [],
			stat: asText(f.stat),
			type: asText(f.type),
			notes: asText(f.notes),
			checked: f.checked === true,
		};
	});

	for (const grant of grants) {
		for (const bonus of readSkillBonuses(grant.props)) {
			let line = lines.find((l) => skillKey(l.name) === skillKey(bonus.name));
			if (!line) {
				line = { name: titleCase(bonus.name), rank: null, rankSources: [], stat: '', type: '', notes: '', checked: false };
				lines.push(line);
			}
			if (!line.rankSources.length) line.rankSources.push(`${line.rank ?? 0} trained`);
			line.rank = (line.rank ?? 0) + bonus.rank;
			line.rankSources.push(`${bonus.rank < 0 ? bonus.rank : `+${bonus.rank}`} ${linkedName(grant)}`);
			if (bonus.notes) line.notes = [line.notes, bonus.notes].filter(Boolean).join('; ');
		}
	}
	return lines;
}
