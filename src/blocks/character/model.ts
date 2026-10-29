import { App } from 'obsidian';
import { Item, Linked, linkedName, parseLink, parseLinks, readBonuses, resolveItem, resolveLink, resolveValue } from '../../rules/items';
import { collectStats, STATS, statKey, statMod } from '../../rules/stats';
import {
	addBaseDice,
	checkLabel,
	passiveApplies,
	passiveEffect,
	PassiveEffect,
	readSkillInfo,
	SkillInfo,
	skillDamage,
} from '../../rules/skillnotes';
import { readSkillBonuses, skillKey } from '../../rules/skills';
import { sponsoredCrawlers } from '../../rules/sponsors';
import { readStatPools, splitStatPoints, StatPool } from '../../rules/statpoints';
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

export interface SponsorEntry {
	sponsor: Linked;
	/** Crawlers the sponsor backs, as markdown links. */
	crawlers: string[];
}

export interface SkillLine {
	/** Plain name, e.g. "Dagger". */
	name: string;
	/** A link to the skill's note when it has one, else the name. */
	markdown: string;
	rank: number | null;
	/** How the rank was reached, for its tooltip (only when race/class add to it). */
	rankSources: string[];
	stat: string;
	type: string;
	notes: string;
	checked: boolean;
	/** The skill's own note, if there is one. */
	note: Linked | null;
	info: SkillInfo | null;
	/** From the `spells` list. */
	spell: boolean;
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
	sponsors: SponsorEntry[];
	/** Skills the character lists, with race/class ranks added, plus skills only race/class grant. */
	skills: SkillLine[];
	/** Spells, built the same way from `spells`. */
	spells: SkillLine[];
	/** Every linked note, so the block can re-render when one changes. */
	linked: Linked[];
	/** Enhanced modifier by stat key, for formulas like "1d4 + STR". */
	statMods: Record<string, number>;
	/** Enhanced modifier for a stat key ("str") or name ("strength"). */
	mod: (stat: string) => number;
	evade: { dex: number; buffs: number; total: number };
	dr: { armor: number; buffs: number; total: number };
	/** Listed Move and Step with race/class `move`/`step` bonuses added. */
	move: string;
	step: string;
	/** Race/class stat points the crawler hasn't split yet (`race-stats` / `class-stats`). */
	unspentStatPoints: { race: UnspentPoints[]; class: UnspentPoints[] };
}

export interface UnspentPoints {
	pool: StatPool;
	points: number;
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
	const grants = [race, cls].flatMap((l) => l ?? []);
	const floor = data.floor == null || data.floor === '' ? null : Number(data.floor);
	const skills = skillLines(app, sourcePath, data, grants, 'skills', floor);
	const spells = skillLines(app, sourcePath, data, grants, 'spells', floor);
	const sponsorEntries = sponsors.map((sponsor) => ({
		sponsor,
		crawlers: sponsoredCrawlers(app, sponsor.file, sponsor.props),
	}));

	// Race and class bonuses are part of the unenhanced score; gear and external buffs enhance it.
	// A race or class can also offer stat points the crawler splits (`stat-points` → `race-stats` / `class-stats`).
	const raceSplit = race ? splitStatPoints(readStatPools(race.props), data['race-stats']) : null;
	const classSplit = cls ? splitStatPoints(readStatPools(cls.props), data['class-stats']) : null;
	const natural = [
		...(race ? [source(race)] : []),
		...(raceSplit?.bonuses.size ? [{ name: `${linkedName(race!)} (split)`, bonuses: raceSplit.bonuses }] : []),
		...(cls ? [source(cls)] : []),
		...(classSplit?.bonuses.size ? [{ name: `${linkedName(cls!)} (split)`, bonuses: classSplit.bonuses }] : []),
	];
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
		sponsors: sponsorEntries,
		skills,
		spells,
		linked: [
			...gearItems,
			...buffs,
			...[race, cls, pet, mount, deity, ...sponsors].flatMap((l) => l ?? []),
			...[...skills, ...spells].flatMap((s) => s.note ?? []),
		],
		statMods: Object.fromEntries(stats.map((s) => [s.key, statMod(s.enhanced)])),
		mod,
		evade: { dex: mod('dex'), buffs: evadeBuffs, total: mod('dex') + evadeBuffs },
		dr: { armor, buffs: drBuffs, total: armor + drBuffs },
		move: addToMeasure(asText(data.move), total(natural, 'move')),
		step: addToMeasure(asText(data.step), total(natural, 'step')),
		unspentStatPoints: { race: raceSplit?.unspent ?? [], class: classSplit?.unspent ?? [] },
	};
}

// "30ft" + 5 → "35ft"; text without a leading number is left alone.
function addToMeasure(listed: string, bonus: number): string {
	if (!bonus) return listed;
	const match = /^\s*(-?\d+)(.*)$/.exec(listed);
	if (match) return `${Number(match[1]) + bonus}${match[2]}`;
	return listed ? listed : `+${bonus}`;
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
// `key` is "skills" or "spells": spells are skills with their own list, granted and ranked the same way.
function skillLines(
	app: App,
	sourcePath: string,
	data: Record<string, unknown>,
	grants: Linked[],
	key: 'skills' | 'spells',
	floor: number | null,
): SkillLine[] {
	const blank = (name: string): SkillLine => ({
		name,
		markdown: name,
		rank: null,
		rankSources: [],
		stat: '',
		type: '',
		notes: '',
		checked: false,
		note: null,
		info: null,
		spell: key === 'spells',
	});
	const parsed: SkillLine[] = toEntries(data[key]).map(([name, details]) => {
		const f = isRecord(details) || Array.isArray(details) ? toRecord(details) : { rank: details };
		const rank = f.rank == null || f.rank === '' ? null : Number(f.rank);
		return {
			...blank(name),
			rank: Number.isFinite(rank) ? rank : null,
			stat: asText(f.stat),
			type: asText(f.type),
			notes: asText(f.notes),
			checked: f.checked === true,
		};
	});

	// One line per skill: a link and a plain name for the same skill are merged.
	const lines: SkillLine[] = [];
	for (const line of parsed) {
		const same = lines.find((l) => skillKey(skillName(l.name)) === skillKey(skillName(line.name)));
		if (!same) {
			lines.push(line);
			continue;
		}
		if (/^\[\[/.test(line.name) && !/^\[\[/.test(same.name)) same.name = line.name;
		same.rank ??= line.rank;
		same.stat ||= line.stat;
		same.type ||= line.type;
		same.notes ||= line.notes;
		same.checked ||= line.checked;
	}

	for (const grant of grants) {
		for (const bonus of readSkillBonuses(grant.props, key)) {
			let line = lines.find((l) => skillKey(skillName(l.name)) === skillKey(skillName(bonus.name)));
			if (!line) {
				line = blank(titleCase(skillName(bonus.name)));
				lines.push(line);
			}
			// Rank F (a natural attack) is the floor number, whatever was trained.
			if (bonus.floor) {
				line.rank = Number.isFinite(floor) ? floor : null;
				line.rankSources = [`F = ${Number.isFinite(floor) ? floor : '? (no floor set)'} (${linkedName(grant)})`];
				if (bonus.notes) line.notes = [line.notes, bonus.notes].filter(Boolean).join('; ');
				continue;
			}
			if (!line.rankSources.length) line.rankSources.push(`${line.rank ?? 0} trained`);
			line.rank = (line.rank ?? 0) + bonus.rank;
			line.rankSources.push(`${bonus.rank < 0 ? bonus.rank : `+${bonus.rank}`} ${linkedName(grant)}`);
			if (bonus.notes) line.notes = [line.notes, bonus.notes].filter(Boolean).join('; ');
		}
	}

	// A skill with its own note (matched by link or by name) takes its stat and check type from there,
	// unless the character's entry sets them.
	for (const line of lines) {
		const link = parseLink(line.name);
		if (!link) continue;
		const note = resolveLink(app, link, sourcePath);
		line.name = titleCase(skillName(line.name));
		if (!note.file) continue;
		line.note = note;
		line.info = readSkillInfo(note.props);
		line.markdown = `[[${link.text}]]`;
		line.stat ||= line.info.stat;
		line.type ||= checkLabel(line.info);
	}
	return lines;
}

// "[[Dagger|Knife]]" → "Dagger"; plain names unchanged.
function skillName(name: string): string {
	return parseLink(name)?.target ?? name;
}

export interface AttackSkill {
	line: SkillLine;
	rank: number;
	stat: string;
	statMod: number;
	/** Damage formula with upgrades applied, e.g. "1d4 + 1d4 + STR Piercing". */
	damage: string;
}

// Skills and spells whose note says `check: attack` — they appear with the sheet's attacks, rolled against Evade.
export function attackSkills(sheet: Sheet): AttackSkill[] {
	return [...sheet.skills, ...sheet.spells].flatMap((line) => {
		if (line.info?.kind !== 'attack') return [];
		const rank = line.rank ?? 0;
		return [{ line, rank, stat: line.stat, statMod: line.stat ? sheet.mod(line.stat) : 0, damage: skillDamage(line.info, rank) }];
	});
}

/** "1d4 + STR Piercing" → "1d4 + 4 Piercing" for display. */
export function withStatMods(formula: string, statMods: Record<string, number>): string {
	return formula.replace(/\b(STR|INT|CON|DEX|CHA)\b/g, (m) => String(statMods[m.toLowerCase()] ?? 0));
}

/** A passive attached to an attack, with what it adds at its rank. */
export interface AppliedPassive {
	line: SkillLine;
	effect: PassiveEffect;
}

/**
 * Everything needed to show or roll one crawler attack: an entry in `attacks` (rank + stat to hit,
 * dice + damage-stat), or an attack skill or spell. Always-on passives that apply (Iron Punch on
 * Pugilism) are already folded in; optional ones (Aiming) are listed for the player to choose.
 */
export interface AttackPlan {
	name: string;
	markdown: string;
	/** The skill or spell behind it, if any. */
	line: SkillLine | null;
	/** To-hit modifiers, e.g. [["rank", 5], ["Str", 4], ["Iron Punch", 0]]. */
	parts: [label: string, value: number][];
	/** Base damage formula (crit doubles its dice), e.g. "1d4 + 1d2 + STR Bludgeoning". */
	damage: string;
	/** Bonus damage dice added on a hit, not doubled. */
	bonusDice: string[];
	disadvantage: boolean;
	applied: AppliedPassive[];
	optional: AppliedPassive[];
	/** Written-out `to-hit` for an attack without rank/stat. */
	toHitText: string;
	limit: string;
	effect: string;
	area: Record<string, unknown>;
}

export function attackPlans(sheet: Sheet): AttackPlan[] {
	// An entry may be keyed by a link ("[[Pugilism]]"): match skills and passives by its target.
	const entries = toEntries(sheet.data.attacks).map(([key, details]) => {
		const link = parseLink(key);
		return { name: link?.target ?? key, markdown: link?.bracketed ? `[[${link.text}]]` : titleCase(key), details };
	});
	const plans: AttackPlan[] = [];

	for (const { name, markdown, details } of entries) {
		const f = toRecord(details);
		const rank = Number(f.rank) || 0;
		const stat = asText(f.stat);
		const damageMod = f['damage-stat'] == null ? '' : ` + ${statKey(asText(f['damage-stat'])).toUpperCase()}`;
		const damage = f.damage != null ? asText(f.damage) : f.dice != null ? `${asText(f.dice)}${damageMod}` : '';
		plans.push(
			withPassives(sheet, {
				name: titleCase(name),
				markdown,
				line: null,
				parts: f.rank == null && f.stat == null ? [] : [['rank', rank], ...(stat ? [[titleCase(statKey(stat)), sheet.mod(stat)] as [string, number]] : [])],
				damage,
				bonusDice: [],
				disadvantage: false,
				applied: [],
				optional: [],
				toHitText: f['to-hit'] == null ? '' : asText(f['to-hit']),
				limit: asText(f.limit),
				effect: asText(f.effect),
				area: f,
			}, asText(f.attack)),
		);
	}

	for (const { line, rank, stat, statMod: mod, damage } of attackSkills(sheet)) {
		if (entries.some((e) => e.name.toLowerCase() === line.name.toLowerCase())) continue;
		plans.push(
			withPassives(sheet, {
				name: line.name,
				markdown: line.markdown,
				line,
				parts: [['rank', rank], ...(stat ? [[titleCase(statKey(stat)), mod] as [string, number]] : [])],
				damage,
				bonusDice: [],
				disadvantage: false,
				applied: [],
				optional: [],
				toHitText: '',
				limit: '',
				effect: '',
				area: {},
			}, line.info?.attackType ?? ''),
		);
	}
	return plans;
}

function withPassives(sheet: Sheet, plan: AttackPlan, attackType: string): AttackPlan {
	for (const line of sheet.skills) {
		if (line.info?.kind !== 'passive' || !passiveApplies(line.info, plan.name, attackType)) continue;
		const applied = { line, effect: passiveEffect(line.info, line.rank ?? 0) };
		if (line.info.optional) plan.optional.push(applied);
		else applyPassive(plan, applied);
	}
	return plan;
}

/** Folds a passive into an attack: its rank to hit, its base and bonus dice, its Disadvantage. */
export function applyPassive(plan: AttackPlan, passive: AppliedPassive): AttackPlan {
	const { effect, line } = passive;
	return Object.assign(plan, {
		parts: effect.toHit ? [...plan.parts, [line.name, effect.toHit]] : plan.parts,
		damage: plan.damage ? addBaseDice(plan.damage, effect.baseDice) : effect.baseDice.join(' + '),
		bonusDice: [...plan.bonusDice, ...effect.bonusDice],
		disadvantage: plan.disadvantage || effect.disadvantage,
		applied: [...plan.applied, passive],
	});
}
