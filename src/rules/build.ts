import { asText, isRecord, titleCase, toEntries } from '../blocks/yaml';
import { STATS, statKey } from './stats';

// Mechanical benefits and detriments from the Race & Class Point Build menu, beyond stat and skill
// bonuses (`bonuses`, `skills`, `spells`, `size`). Races and classes set them; the crawler sheet applies them.
//
//   resistances: [Fire]          # half damage
//   immunities: [Poison]
//   vulnerabilities: [Necrotic]  # double damage
//   stat-skills: { int: 1 }      # +1 to every Skill that uses INT (−1 is a detriment)
//   stat-advantage: [int]        # Advantage on all INT checks
//   check-dice: { evade: 1d4 }   # added to Evade, or to a stat's checks
//   health-stat: cha             # Health Bar slots use the CHA mod instead of CON
//   stat-cap: { dex: 10 }        # DEX can't go above 10, even with gear
//   rank-20: [Rapier]            # Skills that can be raised to Rank 20, or `all`

export interface BuildTraits {
	resistances: string[];
	immunities: string[];
	vulnerabilities: string[];
	statSkills: Map<string, number>;
	statAdvantage: string[];
	checkDice: Map<string, string>;
	healthStat: string;
	statCap: Map<string, number>;
	rank20: string[];
}

export const BUILD_PROPERTIES = [
	'resistances',
	'immunities',
	'vulnerabilities',
	'stat-skills',
	'stat-advantage',
	'check-dice',
	'health-stat',
	'stat-cap',
	'rank-20',
];

/** A list property as markdown: plain names, or links — "[[Fire]]" — however YAML parsed them. */
export function textList(value: unknown): string[] {
	if (value == null || value === '') return [];
	return (Array.isArray(value) ? value : [value]).flatMap((v): string[] => {
		let inner: unknown = v;
		while (Array.isArray(inner) && inner.length === 1) inner = inner[0];
		if (Array.isArray(v)) return [`[[${asText(inner)}]]`];
		return asText(inner).split(/\s*,\s*/).filter(Boolean);
	});
}

function numberMap(value: unknown, keyOf: (k: string) => string): Map<string, number> {
	const map = new Map<string, number>();
	if (!isRecord(value) && !Array.isArray(value)) return map;
	for (const [key, raw] of toEntries(value)) {
		const amount = Number(raw);
		if (raw != null && raw !== '' && Number.isFinite(amount)) map.set(keyOf(key), (map.get(keyOf(key)) ?? 0) + amount);
	}
	return map;
}

export function readBuildTraits(props: Record<string, unknown>): BuildTraits {
	const checkDice = new Map<string, string>();
	if (isRecord(props['check-dice']) || Array.isArray(props['check-dice'])) {
		for (const [key, dice] of toEntries(props['check-dice'])) if (dice != null && dice !== '') checkDice.set(statKey(key), asText(dice));
	}
	return {
		resistances: textList(props.resistances),
		immunities: textList(props.immunities),
		vulnerabilities: textList(props.vulnerabilities),
		statSkills: numberMap(props['stat-skills'], statKey),
		statAdvantage: textList(props['stat-advantage']).map(statKey),
		checkDice,
		healthStat: props['health-stat'] == null ? '' : statKey(asText(props['health-stat'])),
		statCap: numberMap(props['stat-cap'], statKey),
		rank20: textList(props['rank-20']),
	};
}

/** Several sources' traits as one: lists joined, stat bonuses added, the lowest cap kept. */
export function mergeBuildTraits(all: BuildTraits[]): BuildTraits {
	const merged = readBuildTraits({});
	const unique = (list: string[]) => [...new Set(list)];
	for (const t of all) {
		merged.resistances = unique([...merged.resistances, ...t.resistances]);
		merged.immunities = unique([...merged.immunities, ...t.immunities]);
		merged.vulnerabilities = unique([...merged.vulnerabilities, ...t.vulnerabilities]);
		merged.statAdvantage = unique([...merged.statAdvantage, ...t.statAdvantage]);
		merged.rank20 = unique([...merged.rank20, ...t.rank20]);
		for (const [k, v] of t.statSkills) merged.statSkills.set(k, (merged.statSkills.get(k) ?? 0) + v);
		for (const [k, v] of t.checkDice) merged.checkDice.set(k, merged.checkDice.has(k) ? `${merged.checkDice.get(k)} + ${v}` : v);
		for (const [k, v] of t.statCap) merged.statCap.set(k, Math.min(merged.statCap.get(k) ?? Infinity, v));
		merged.healthStat ||= t.healthStat;
	}
	return merged;
}

export function statName(key: string): string {
	return STATS.find(([abbr]) => abbr === key)?.[1] ?? titleCase(key);
}

const joinAnd = (names: string[]) =>
	names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;

/** The book's bullets for these traits: "Resistance to Fire damage", "+1 all Intelligence-based Skills". */
export function describeBuildTraits(t: BuildTraits): string[] {
	const lines: string[] = [];
	if (t.resistances.length) lines.push(`Resistance to ${joinAnd(t.resistances)} damage`);
	if (t.immunities.length) lines.push(`Immunity to ${joinAnd(t.immunities)}`);
	if (t.vulnerabilities.length) lines.push(`Vulnerable to ${joinAnd(t.vulnerabilities)} damage`);
	for (const [key, amount] of t.statSkills) {
		lines.push(`${amount < 0 ? `−${-amount}` : `+${amount}`} to all ${statName(key)}-based Skills`);
	}
	if (t.statAdvantage.length) lines.push(`Advantage on all ${joinAnd(t.statAdvantage.map(statName))} Checks`);
	for (const [key, dice] of t.checkDice) {
		lines.push(key === 'evade' ? `Add ${dice} to your Evade` : `Add ${dice} to your ${statName(key)} Checks`);
	}
	if (t.healthStat) lines.push(`Health Bar slots use your ${t.healthStat.toUpperCase()} Mod instead of CON`);
	for (const [key, cap] of t.statCap) lines.push(`${statName(key)} is capped at ${cap}`);
	if (t.rank20.some((s) => s.toLowerCase() === 'all')) lines.push('All Skills can be raised to Rank 20');
	else if (t.rank20.length) lines.push(`${joinAnd(t.rank20)} can be raised to Rank 20`);
	return lines;
}

/** Whether a Skill can be raised to Rank 20 under these traits. */
export function canReachRank20(t: BuildTraits, skill: string): boolean {
	const name = skill.toLowerCase();
	return t.rank20.some((s) => {
		const target = s.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.toLowerCase();
		return target === 'all' || target === name;
	});
}
