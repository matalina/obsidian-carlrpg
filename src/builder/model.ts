import { stringifyYaml } from 'obsidian';
import { statName } from '../rules/build';
import {
	CLASS_POINTS,
	MAX_DETRIMENT_POINTS,
	MAX_DETRIMENTS,
	MenuOption,
	RACE_POINTS,
} from './menu';

export type BuildKind = 'race' | 'class';

/** One option taken from the menu, with whatever it asks for. */
export interface Pick {
	option: MenuOption;
	/** Units for per-unit options (+2 Strength), points of penalty for detriments, or a size. */
	amount: number;
	/** A stat key, or `evade` for a check die. */
	stat: string;
	/** Skill or spell names (comma-separated for groups), a damage type, or a natural attack's name. */
	name: string;
	/** A +1 Skill pick that's a Spell. */
	spell: boolean;
	/** A natural attack's damage type. */
	damageType: string;
	/** The ability line written for text options; editable. */
	text: string;
	/** What a custom benefit or detriment costs. */
	cost: number;
}

export interface Build {
	kind: BuildKind;
	name: string;
	earth: boolean;
	classType: string;
	size: number | null;
	description: string;
	picks: Pick[];
}

export function newPick(option: MenuOption): Pick {
	return {
		option,
		amount: option.effect === 'size' ? 2 : 1,
		stat: option.effect === 'check-die' ? 'evade' : option.effect === 'health-stat' ? 'cha' : 'str',
		name: option.preset && option.effect !== 'natural-attack' ? option.preset : '',
		spell: false,
		damageType: '',
		text: option.effect === 'text' ? option.label : '',
		cost: option.cost,
	};
}

/** What a benefit costs, or what a detriment earns on its own (stat and skill penalties are counted together). */
export function pickPoints(pick: Pick): number {
	const { option } = pick;
	if (option.effect === 'custom') return Math.max(0, pick.cost);
	if (option.effect === 'stat-penalty' || option.effect === 'skill-penalty') return 0;
	const each = option.perUnit ? option.cost * Math.max(0, pick.amount) : option.cost;
	return option.perName ? each * Math.max(1, names(pick.name).length) : each;
}

/** Points of penalty a stat or skill penalty row adds up to: −2 to each of two Skills is 4. */
export function penaltyPoints(pick: Pick): number {
	const count = pick.option.effect === 'skill-penalty' ? Math.max(1, names(pick.name).length) : 1;
	return Math.max(0, pick.amount) * count;
}

export interface Tally {
	base: number;
	spent: number;
	/** Points from detriments before the cap of 5. */
	earned: number;
	/** Points from detriments that count. */
	bonus: number;
	budget: number;
	left: number;
	detriments: number;
	warnings: string[];
}

export function tally(build: Build): Tally {
	const base = build.kind === 'race' ? RACE_POINTS : CLASS_POINTS;
	const benefits = build.picks.filter((p) => !p.option.detriment);
	const detriments = build.picks.filter((p) => p.option.detriment);
	const spent = benefits.reduce((sum, p) => sum + pickPoints(p), 0);
	// "1 extra Build Point for every 2 points of penalties to one or more stats" — and the same for Skills.
	const penalty = (effect: string) =>
		detriments.filter((p) => p.option.effect === effect).reduce((sum, p) => sum + penaltyPoints(p), 0);
	const statPenalty = penalty('stat-penalty');
	const skillPenalty = penalty('skill-penalty');
	const earned =
		Math.floor(statPenalty / 2) + Math.floor(skillPenalty / 2) + detriments.reduce((sum, p) => sum + pickPoints(p), 0);
	const bonus = Math.min(earned, MAX_DETRIMENT_POINTS);
	const budget = base + bonus;
	const left = budget - spent;

	const warnings: string[] = [];
	if (left < 0) warnings.push(`Over budget by ${-left}.`);
	if (left > 0) warnings.push(`${left} left to spend. Leftover Build Points are lost.`);
	if (earned > MAX_DETRIMENT_POINTS) warnings.push(`Detriments earn ${earned}, but only ${MAX_DETRIMENT_POINTS} count.`);
	if (detriments.length > MAX_DETRIMENTS) warnings.push(`${detriments.length} detriments; the most is ${MAX_DETRIMENTS}.`);
	if (statPenalty % 2) warnings.push('Stat penalties earn 1 point per −2; the odd −1 earns nothing.');
	if (skillPenalty % 2) warnings.push('Skill penalties earn 1 point per −2; the odd −1 earns nothing.');
	const dr = benefits.filter((p) => p.option.effect === 'dr').reduce((sum, p) => sum + p.amount, 0);
	if (dr > 3) warnings.push(`+${dr} DR; the limit is +3.`);
	if (skillPenalty) warnings.push("A Skill penalty can't be larger than the Rank you have in it.");
	for (const p of build.picks) {
		const needsName = ['skill', 'natural-attack', 'resistance', 'immunity', 'vulnerability', 'rank-20', 'skill-penalty'];
		if (needsName.includes(p.option.effect) && !p.name.trim()) warnings.push(`Name what "${short(p.option.label)}" applies to.`);
	}
	return { base, spent, earned, bonus, budget, left, detriments: detriments.length, warnings };
}

const short = (label: string) => (label.length > 40 ? `${label.slice(0, 39)}…` : label);

function names(text: string): string[] {
	return text.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
}
const link = (name: string) => (/^\[\[.*\]\]$/.test(name) ? name : `[[${name}]]`);
const unlink = (name: string) => name.replace(/^\[\[|\]\]$/g, '').split('|')[0]!;

/** A natural attack's own Skill note, which the race or class lists at Rank F. */
export interface NaturalAttack {
	name: string;
	die: string;
	stat: string;
	damageType: string;
}

/** The race or class note's properties, in the template's order. */
export function buildRecord(build: Build): Record<string, unknown> {
	const bonuses: Record<string, number> = {};
	const skills: Record<string, number | string> = {};
	const spells: Record<string, number> = {};
	const abilities: string[] = [];
	const resistances: string[] = [];
	const immunities: string[] = [];
	const vulnerabilities: string[] = [];
	const statSkills: Record<string, number> = {};
	const statAdvantage: string[] = [];
	const checkDice: Record<string, string> = {};
	const statCap: Record<string, number> = {};
	const rank20: string[] = [];
	let healthStat = '';
	let size = build.size;

	const add = <T extends Record<string, number>>(map: T, key: string, amount: number) => {
		(map as Record<string, number>)[key] = (map[key] ?? 0) + amount;
	};
	const addSkill = (name: string, amount: number) => {
		const key = link(name);
		const current = skills[key];
		skills[key] = (typeof current === 'number' ? current : 0) + amount;
	};

	for (const pick of build.picks) {
		const { option } = pick;
		const stat = statName(pick.stat).toLowerCase();
		switch (option.effect) {
			case 'stat':
				add(bonuses, stat, pick.amount);
				break;
			case 'stat-penalty':
				add(bonuses, stat, -pick.amount);
				break;
			case 'skill':
				for (const name of names(pick.name)) {
					if (pick.spell) add(spells, link(name), pick.amount);
					else addSkill(name, pick.amount);
				}
				break;
			case 'skill-penalty':
				for (const name of names(pick.name)) addSkill(name, -pick.amount);
				break;
			case 'skill-group':
				if (pick.name.trim()) for (const name of names(pick.name)) addSkill(name, 1);
				else add(statSkills, pick.stat, 1);
				break;
			case 'stat-skills-penalty':
				add(statSkills, pick.stat, -pick.amount);
				break;
			case 'dr':
				add(bonuses, 'dr', pick.amount);
				break;
			case 'move':
				add(bonuses, 'move', 5);
				break;
			case 'step':
				add(bonuses, 'step', 5);
				break;
			case 'size':
				size = pick.amount;
				break;
			case 'natural-attack':
				if (pick.name.trim()) skills[link(pick.name.trim())] = 'F';
				break;
			case 'resistance':
				resistances.push(...names(pick.name));
				break;
			case 'immunity':
				immunities.push(...names(pick.name));
				break;
			case 'vulnerability':
				vulnerabilities.push(...names(pick.name));
				break;
			case 'stat-advantage':
				statAdvantage.push(pick.stat);
				break;
			case 'check-die':
				checkDice[pick.stat] = '1d4';
				break;
			case 'health-stat':
				healthStat = pick.stat;
				break;
			case 'stat-cap':
				statCap[pick.stat] = 10;
				break;
			case 'rank-20':
				rank20.push(...names(pick.name).map((n) => (n.toLowerCase() === 'all' ? 'all' : unlink(n))));
				break;
			case 'custom':
			case 'text':
				if (pick.text.trim()) abilities.push(pick.text.trim());
				break;
		}
	}

	const record: Record<string, unknown> = {
		tags: [`carl/${build.kind}`],
		earth: build.earth,
		...(build.kind === 'class' ? { 'class-type': build.classType } : {}),
		...(size != null ? { size } : {}),
		description: build.description,
		bonuses,
		skills,
		...(Object.keys(spells).length ? { spells } : {}),
		abilities,
	};
	const optional: [string, unknown, boolean][] = [
		['resistances', resistances, resistances.length > 0],
		['immunities', immunities, immunities.length > 0],
		['vulnerabilities', vulnerabilities, vulnerabilities.length > 0],
		['stat-skills', statSkills, Object.keys(statSkills).length > 0],
		['stat-advantage', statAdvantage, statAdvantage.length > 0],
		['check-dice', checkDice, Object.keys(checkDice).length > 0],
		['health-stat', healthStat, !!healthStat],
		['stat-cap', statCap, Object.keys(statCap).length > 0],
		['rank-20', rank20, rank20.length > 0],
	];
	for (const [key, value, present] of optional) if (present) record[key] = value;
	record.source = 'Homebrew';
	record.page = '';
	return record;
}

export function naturalAttacks(build: Build): NaturalAttack[] {
	return build.picks
		.filter((p) => p.option.effect === 'natural-attack' && p.name.trim())
		.map((p) => ({ name: unlink(p.name.trim()), die: p.option.preset ?? '1d6', stat: p.stat, damageType: p.damageType.trim() }));
}

/** A natural attack's Skill note properties: Rank = Floor, its die plus one more at Rank 5, 10, and 15. */
export function naturalAttackRecord(attack: NaturalAttack, from: string): Record<string, unknown> {
	const stat = attack.stat.toUpperCase();
	return {
		tags: ['carl/skill'],
		keywords: 'Melee Attack, Natural',
		check: 'evade',
		stat: attack.stat,
		attack: 'melee',
		description: `A natural attack${from ? ` from ${from}` : ''}. Its Rank equals the Floor Number and only increases by Floor.`,
		'base-damage': `${attack.die} + ${stat}${attack.damageType ? ` ${attack.damageType}` : ''}`,
		upgrades: { 5: `+${attack.die} base damage`, 10: `+${attack.die} base damage`, 15: `+${attack.die} base damage` },
		source: 'Homebrew',
		page: '',
	};
}

export function frontmatter(record: Record<string, unknown>): string {
	return `---\n${stringifyYaml(record)}---`;
}

/** Puts properties into a template: replaces its frontmatter and keeps the body (heading and block). */
export function fillTemplate(template: string, record: Record<string, unknown>): string {
	const body = template.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	return `${frontmatter(record)}\n${body}`;
}
