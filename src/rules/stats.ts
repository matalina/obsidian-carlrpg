import { asText, toEntries } from '../blocks/yaml';

export const STATS: [key: string, name: string][] = [
	['str', 'Strength'],
	['int', 'Intelligence'],
	['con', 'Constitution'],
	['dex', 'Dexterity'],
	['cha', 'Charisma'],
];

// "strength", "Str" and "STR" all map to "str"; anything else is returned lowercased.
export function statKey(name: string): string {
	const key = name.trim().toLowerCase();
	return STATS.find(([abbr, full]) => key === abbr || key === full.toLowerCase())?.[0] ?? key;
}

export function isStat(name: string): boolean {
	const key = statKey(name);
	return STATS.some(([abbr]) => abbr === key);
}

export interface StatValue {
	name: string;
	key: string;
	value: number;
	raw: string;
}

// Stats come from top-level properties (`strength: 8`) and/or a nested `stats` list or map.
// Returned in sheet order, then any extra stats listed under `stats`.
export function collectStats(data: Record<string, unknown>): StatValue[] {
	const entries = [
		...Object.entries(data).filter(([name]) => isStat(name)),
		...toEntries(data.stats),
	];
	const stats = entries.map(([name, value]) => ({
		name,
		key: statKey(name),
		value: Number(value),
		raw: asText(value),
	}));
	const rank = (key: string) => {
		const i = STATS.findIndex(([abbr]) => abbr === key);
		return i === -1 ? STATS.length : i;
	};
	return stats.sort((a, b) => rank(a.key) - rank(b.key));
}

// Table 9: Stat Mods — [minimum stat value, modifier], highest first.
const STAT_MODS: [min: number, mod: number][] = [
	[300, 10],
	[200, 9],
	[150, 8],
	[100, 7],
	[50, 6],
	[20, 5],
	[10, 4],
	[6, 3],
	[3, 2],
	[1, 1],
];

export function statMod(value: number): number {
	return STAT_MODS.find(([min]) => value >= min)?.[1] ?? 0;
}

export function formatMod(mod: number): string {
	return mod < 0 ? String(mod) : `+${mod}`;
}
