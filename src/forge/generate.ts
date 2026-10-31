import { statMod } from '../rules/stats';
import {
	AREAS,
	AreaField,
	ATTACK_LABELS,
	BOSS_TIERS,
	DAMAGE_TYPES,
	DEBUFFS,
	DIE_SIZES,
	LEVEL_ROWS,
	RANGES,
	Rank,
	Role,
	ROLE_ATTACKS,
	ROLE_WEIGHTS,
	STAT_KEYS,
	StatKey,
	Weighted,
} from './tables';

export interface ForgeOptions {
	floor: number;
	level: number;
	rank: Rank;
	/** Size value 1–8. */
	size: number;
	creature: string;
	role: Role;
	/** Extra DR from armor or hide; null picks one from the role. */
	armor: number | null;
}

export interface ForgedAttack {
	name: string;
	toHit: string;
	damage: string;
	range: string;
	area: { field: AreaField; size: string } | null;
	effect: string;
}

export interface ForgedMob {
	level: number;
	type: string;
	size: number;
	creature: string;
	hpSlots: number;
	surprise: string;
	evade: string;
	move: string;
	dr: number;
	stats: Record<StatKey, number>;
	attacks: ForgedAttack[];
}

const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

export function pick<T>(table: Weighted<T>): T {
	const total = table.reduce((sum, [, w]) => sum + w, 0);
	let x = Math.random() * total;
	for (const [value, weight] of table) {
		x -= weight;
		if (x <= 0) return value;
	}
	return table[0]![0];
}

function rowForFloor(floor: number): number {
	const f = Math.min(18, Math.max(1, floor));
	return LEVEL_ROWS.findIndex((row) => f >= row.floors[0] && f <= row.floors[1]);
}

function diceForLevel(level: number): number {
	return (LEVEL_ROWS.find((row) => level >= row.lo && level <= row.hi) ?? LEVEL_ROWS[LEVEL_ROWS.length - 1]!).dice;
}

/** Typical levels for a rank on a floor (Table 51, bosses one or two rows down). */
export function levelRange(floor: number, rank: Rank): [number, number] {
	let i = rowForFloor(floor);
	const tier = BOSS_TIERS[rank];
	if (!tier) return [LEVEL_ROWS[i]!.lo, LEVEL_ROWS[i]!.hi];
	i = Math.min(LEVEL_ROWS.length - 1, i + tier.step);
	const row = LEVEL_ROWS[i]!;
	const span = row.hi - row.lo;
	return [Math.round(row.lo + span * tier.part[0]), Math.round(row.lo + span * tier.part[1])];
}

export function suggestLevel(floor: number, rank: Rank): number {
	const [lo, hi] = levelRange(floor, rank);
	return randInt(lo, hi);
}

function rollStats(level: number, rank: Rank, role: Role): Record<StatKey, number> {
	const tier = BOSS_TIERS[rank];
	const base = tier ? 5 : 1;
	const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, base])) as Record<StatKey, number>;
	const weights: Weighted<StatKey> = STAT_KEYS.map((k) => [k, ROLE_WEIGHTS[role][k]]);
	for (let left = (tier ? tier.perLevel : 3) * level; left > 0; left--) stats[pick(weights)]++;
	return stats;
}

function moveFor(size: number): string {
	if (size >= 7) return Math.random() < 0.5 ? '30+S' : '40+S';
	if (size === 6) return '30+S';
	return '20+S';
}

function rollDr(floor: number, role: Role, size: number, armor: number | null): number {
	if (armor != null) return floor + armor;
	if (role === 'caster') return Math.max(0, floor - randInt(1, 2));
	if (role === 'brute' && (size >= 5 || Math.random() < 0.5)) return floor + randInt(1, 2);
	return floor;
}

function rollAttacks(level: number, rank: Rank, role: Role, mods: Record<StatKey, number>): ForgedAttack[] {
	const boss = rank !== 'Mob';
	const count = boss ? 3 : level <= 4 ? 1 : 2;
	const kinds = ROLE_ATTACKS[role].slice(0, count);
	const baseDice = diceForLevel(level);
	const seen: Record<string, number> = {};

	return kinds.map((kind, i) => {
		const stat: StatKey =
			kind === 'melee' ? 'strength' : kind === 'ranged' ? 'dexterity' : role === 'showboat' ? 'charisma' : 'intelligence';
		const mod = mods[stat];
		seen[kind] = (seen[kind] ?? 0) + 1;
		const repeats = kinds.filter((k) => k === kind).length > 1;
		const name = repeats ? `${ATTACK_LABELS[kind]} ${seen[kind]}` : ATTACK_LABELS[kind];

		// Area attacks and attacks with a Debuff each lose 1d (p. 273).
		let dice = baseDice;
		const notes: string[] = [];
		let area: ForgedAttack['area'] = null;
		if (kind !== 'melee' && Math.random() < 0.3) {
			const [field, size] = pick(AREAS);
			area = { field, size };
			dice--;
			if (Math.random() < 0.3) notes.push('+5ft Splash.');
		}
		if (kind !== 'spell' && Math.random() < 0.08) notes.push('Armor-Piercing.');
		const debuffChance = boss ? (i === 0 ? 0.9 : 0.5) : 0.45;
		if (Math.random() < debuffChance) {
			dice--;
			const debuff = pick(DEBUFFS);
			// Weak attacks apply the Debuff on any hit; strong ones on a Major Evade Fail (p. 273).
			notes.push(
				dice <= 1 || Math.random() < 0.5
					? `Any hit crawler gains the ${debuff} Debuff.`
					: `On an Evade Major Fail or worse, the crawler gains the ${debuff} Debuff.`,
			);
		}
		dice = Math.max(1, dice);

		return {
			name,
			toHit: `${10 + mod}+F`,
			damage: `${dice}${pick(DIE_SIZES)}+${mod} ${pick(DAMAGE_TYPES[kind])}`,
			range: `${pick(RANGES[kind])}ft`,
			area,
			effect: notes.join(' '),
		};
	});
}

export function forgeMob(opts: ForgeOptions): ForgedMob {
	const floor = Math.max(1, Math.round(opts.floor));
	const level = Math.max(1, Math.round(opts.level));
	const tier = BOSS_TIERS[opts.rank];
	const stats = rollStats(level, opts.rank, opts.role);
	const mods = Object.fromEntries(STAT_KEYS.map((k) => [k, statMod(stats[k])])) as Record<StatKey, number>;

	return {
		level,
		type: opts.rank.toLowerCase(),
		size: opts.size,
		creature: opts.creature,
		hpSlots: tier ? tier.hb + floor : Math.min(level, 10),
		surprise: `${10 + mods.intelligence}+F`,
		evade: `${10 + mods.dexterity}+F`,
		move: moveFor(opts.size),
		dr: rollDr(floor, opts.role, opts.size, opts.armor),
		stats,
		attacks: rollAttacks(level, opts.rank, opts.role, mods),
	};
}
