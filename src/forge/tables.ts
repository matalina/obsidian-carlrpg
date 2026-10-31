// Mob Forge tables. Build rules are from the Core Rulebook's "Create Your Own Mobs and Bosses"
// (pp. 270–273, Tables 50 and 51). The weighted attack tables were tallied from the 361
// attacks in the rulebook's stat blocks.

export type Weighted<T> = [value: T, weight: number][];

/** Table 51: Mob Level, Floor, & Damage Dice. */
export interface LevelRow {
	lo: number;
	hi: number;
	dice: number;
	floors: [number, number];
}

export const LEVEL_ROWS: LevelRow[] = [
	{ lo: 1, hi: 4, dice: 1, floors: [1, 1] },
	{ lo: 5, hi: 9, dice: 2, floors: [2, 2] },
	{ lo: 10, hi: 29, dice: 3, floors: [3, 4] },
	{ lo: 30, hi: 59, dice: 5, floors: [5, 7] },
	{ lo: 60, hi: 99, dice: 7, floors: [8, 10] },
	{ lo: 100, hi: 159, dice: 9, floors: [11, 13] },
	{ lo: 160, hi: 249, dice: 12, floors: [14, 16] },
	{ lo: 250, hi: 400, dice: 15, floors: [17, 18] },
];

/** Table 50: Boss Severity, plus where Suggest places each tier's level. */
export interface BossTier {
	/** Stat points per Level (bosses also start at 5 in each stat). */
	perLevel: number;
	/** HB slots before + Floor. */
	hb: number;
	/** Rows below the floor's own row on Table 51. */
	step: number;
	/** Fraction of that row the level falls in. */
	part: [number, number];
}

export const RANKS = [
	'Mob',
	'Neighborhood Boss',
	'Borough Boss',
	'City Boss',
	'Province Boss',
	'Country Boss',
	'Floor Boss',
] as const;
export type Rank = (typeof RANKS)[number];

// The book places Neighborhood, Borough and City one row down (low, middle, high end).
// It only says Province and Country go "even stronger", so those and Floor sit a row further.
export const BOSS_TIERS: Partial<Record<Rank, BossTier>> = {
	'Neighborhood Boss': { perLevel: 3, hb: 10, step: 1, part: [0, 0.33] },
	'Borough Boss': { perLevel: 4, hb: 15, step: 1, part: [0.33, 0.66] },
	'City Boss': { perLevel: 5, hb: 20, step: 1, part: [0.66, 1] },
	'Province Boss': { perLevel: 6, hb: 25, step: 2, part: [0, 0.4] },
	'Country Boss': { perLevel: 8, hb: 30, step: 2, part: [0.4, 0.8] },
	'Floor Boss': { perLevel: 10, hb: 40, step: 2, part: [0.8, 1] },
};

export const STAT_KEYS = ['strength', 'intelligence', 'constitution', 'dexterity', 'charisma'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const ROLES = {
	brute: 'Brute',
	skirmisher: 'Skirmisher',
	caster: 'Caster',
	sneak: 'Sneak',
	showboat: 'Showboat',
	even: 'Even spread',
} as const;
export type Role = keyof typeof ROLES;

/** How likely each stat is to get the next point, per role. */
export const ROLE_WEIGHTS: Record<Role, Record<StatKey, number>> = {
	brute: { strength: 3, intelligence: 0.5, constitution: 3, dexterity: 1, charisma: 0.5 },
	skirmisher: { strength: 1, intelligence: 1, constitution: 1, dexterity: 4, charisma: 0.5 },
	caster: { strength: 0.5, intelligence: 4, constitution: 1.5, dexterity: 1, charisma: 1.5 },
	sneak: { strength: 0.5, intelligence: 3, constitution: 1.5, dexterity: 3, charisma: 0.5 },
	showboat: { strength: 1, intelligence: 1, constitution: 1, dexterity: 1.5, charisma: 3 },
	even: { strength: 1, intelligence: 1, constitution: 1, dexterity: 1, charisma: 1 },
};

export type AttackKind = 'melee' | 'ranged' | 'spell';

/** Attack kinds in order: the first is the main attack. */
export const ROLE_ATTACKS: Record<Role, AttackKind[]> = {
	brute: ['melee', 'melee', 'ranged'],
	skirmisher: ['ranged', 'melee', 'ranged'],
	caster: ['spell', 'spell', 'melee'],
	sneak: ['melee', 'spell', 'ranged'],
	showboat: ['spell', 'ranged', 'melee'],
	even: ['melee', 'ranged', 'spell'],
};

export const ATTACK_LABELS: Record<AttackKind, string> = {
	melee: 'Melee attack',
	ranged: 'Ranged attack',
	spell: 'Spell',
};

export const CREATURE_TYPES = ['Humanoid', 'Beastly', 'Undead', 'Ooze', 'Construct', 'Mutated', 'Elemental'];

export const DAMAGE_TYPES: Record<AttackKind, Weighted<string>> = {
	melee: [['Bludgeoning', 120], ['Piercing', 108], ['Slashing', 53]],
	ranged: [['Piercing', 40], ['Bludgeoning', 20], ['Acid', 23], ['Fire', 20], ['Poison', 9], ['Ice', 9]],
	spell: [['Force', 18], ['Sonic', 17], ['Psychic', 15], ['Fire', 10], ['Ice', 6], ['Electric', 6], ['Necrotic', 4], ['Acid', 6]],
};

/** Range in feet. */
export const RANGES: Record<AttackKind, Weighted<number>> = {
	melee: [[5, 174], [10, 52], [15, 8]],
	ranged: [[20, 16], [25, 4], [30, 44], [40, 5], [50, 20], [60, 14], [80, 2], [100, 11]],
	spell: [[20, 8], [30, 30], [40, 5], [50, 15], [60, 14], [100, 4]],
};

export type AreaField = 'cone' | 'radius' | 'line';

export const AREAS: Weighted<[AreaField, string]> = [
	[['cone', '15ft'], 4], [['cone', '20ft'], 6], [['cone', '30ft'], 7], [['cone', '60ft'], 1],
	[['radius', '5ft'], 3], [['radius', '10ft'], 7], [['radius', '15ft'], 3], [['radius', '20ft'], 1],
	[['line', '20ft'], 1], [['line', '30ft'], 3], [['line', '60ft'], 1],
];

export const DEBUFFS: Weighted<string> = [
	['Held', 34], ['Burned', 24], ['Poisoned', 16], ['Take Down', 14], ['Terrified', 13],
	['Blood Trail', 10], ['Woozy', 9], ['Fatigued', 9], ['Queasy', 8], ['Staggered', 8],
	['Paralyzed', 7], ['Stunned', 5], ['Enraged', 5], ['The Taint', 5], ['Stiff Legs', 4],
	['Shocked', 4], ['Sore as Shit', 4], ['Drowning', 3], ['Muted', 3], ['Swallowed', 3],
	['Sepsis', 2], ['Major Injury', 2], ['Unconscious', 2], ['Pinned to a Surface', 2],
	['Collared', 1], ['Charmed', 1],
];

/** d6 is the book's standard die; the others give some spread. */
export const DIE_SIZES: Weighted<string> = [['d4', 1], ['d6', 3], ['d8', 2], ['d10', 1]];
