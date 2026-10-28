import { asText, isRecord } from '../blocks/yaml';
import { statKey, STATS } from './stats';

// Stat points a race or class lets the crawler split between stats:
//
//   stat-points:                     # on the race or class note
//     points: 3
//     stats: [str, dex, con]
//
// or a list of such pools. The crawler records their split:
//
//   race-stats: { str: 2, dex: 1 }   # on the crawler note; `class-stats` for the class
//
// The split counts toward the unenhanced score, like a fixed race/class bonus.

export interface StatPool {
	points: number;
	/** Stat keys the points can go to. */
	stats: string[];
}

export function readStatPools(props: Record<string, unknown>): StatPool[] {
	const value = props['stat-points'];
	const pools = Array.isArray(value) ? value : value == null ? [] : [value];
	return pools.flatMap((pool): StatPool[] => {
		if (!isRecord(pool)) return [];
		const points = Number(pool.points);
		const stats = (Array.isArray(pool.stats) ? pool.stats : asText(pool.stats).split(','))
			.map((s) => statKey(asText(s)))
			.filter(Boolean);
		return Number.isFinite(points) && points > 0 && stats.length ? [{ points, stats }] : [];
	});
}

/** "+3 points split between Strength, Dexterity, or Constitution" */
export function describeStatPool(pool: StatPool): string {
	const names = pool.stats.map((key) => STATS.find(([abbr]) => abbr === key)?.[1] ?? key);
	const list = names.length < 3 ? names.join(' or ') : `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
	return `+${pool.points} ${pool.points === 1 ? 'point' : 'points'} split between ${list}`;
}

export interface StatSplit {
	bonuses: Map<string, number>;
	/** Points not yet assigned, per pool. */
	unspent: { pool: StatPool; points: number }[];
}

/** Applies the crawler's split to the pools; a stat a pool doesn't offer, or points past its total, are ignored. */
export function splitStatPoints(pools: StatPool[], split: unknown): StatSplit {
	const remaining = pools.map((pool) => pool.points);
	const bonuses = new Map<string, number>();
	if (isRecord(split)) {
		for (const [name, value] of Object.entries(split)) {
			const key = statKey(name);
			let wanted = Number(value);
			if (!Number.isFinite(wanted) || wanted <= 0) continue;
			pools.forEach((pool, i) => {
				if (!wanted || !pool.stats.includes(key)) return;
				const used = Math.min(wanted, remaining[i]!);
				remaining[i]! -= used;
				wanted -= used;
				bonuses.set(key, (bonuses.get(key) ?? 0) + used);
			});
		}
	}
	return {
		bonuses,
		unspent: pools.map((pool, i) => ({ pool, points: remaining[i]! })).filter((u) => u.points > 0),
	};
}
