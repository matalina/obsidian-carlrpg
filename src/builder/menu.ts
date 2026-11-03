// The Race & Class Point Build menu (Core Rulebook pp. 158–161). Races get 25 Build Points and classes 30;
// detriments add up to 5 more (at most 5 detriments). Each option says what it writes to the note:
// `effect` picks the inputs the builder asks for and the property it fills. Options without one become
// an ability line, editable before it's written.

export type Effect =
	| 'stat' // +1 to a Stat, per point
	| 'skill' // +1 in a Skill or Spell, per Rank
	| 'skill-group' // +1 to a group of Skills: named, or every Skill under a Stat
	| 'dr' // +1 DR Buff
	| 'move' // +5ft Move
	| 'step' // +5 Step
	| 'size' // Size 2 (Small) or less
	| 'natural-attack' // a Skill at Rank = Floor, with its own note
	| 'resistance'
	| 'immunity'
	| 'stat-advantage'
	| 'check-die' // add 1d4 to Evade or a Stat's checks
	| 'health-stat'
	| 'rank-20' // named Skills, or all
	| 'stat-penalty' // detriment: 1 point per −2, across all rows
	| 'skill-penalty' // detriment: 1 point per −2, across all rows
	| 'stat-skills-penalty' // detriment: 1 point per −1 to all Skills under a Stat
	| 'vulnerability'
	| 'stat-cap'
	| 'custom' // a benefit or detriment of your own, at a cost you set
	| 'text';

export interface MenuOption {
	id: string;
	tier: string;
	/** The book's wording; also the ability text for `text` options. */
	label: string;
	cost: number;
	effect: Effect;
	/** Detriments earn points instead of spending them. */
	detriment?: boolean;
	/** Cost is per unit (+1 Stat, +1 Rank, +1 DR). */
	perUnit?: boolean;
	/** Cost is per name listed: each Skill, each damage type. */
	perName?: boolean;
	/** Fixed values the effect writes, e.g. the natural attack's die or an immunity. */
	preset?: string;
	/** Most of these that may be taken (+1 DR to a limit of +3). */
	max?: number;
}

export const RACE_POINTS = 25;
export const CLASS_POINTS = 30;
export const MAX_DETRIMENT_POINTS = 5;
export const MAX_DETRIMENTS = 5;

const tier = (name: string, cost: number, options: [label: string, effect?: Effect, extra?: Partial<MenuOption>][], detriment = false) =>
	options.map(([label, effect = 'text', extra = {}], i): MenuOption => ({
		id: `${name.toLowerCase()}-${detriment ? 'd' : 'b'}${i}`,
		tier: name,
		label,
		cost,
		effect,
		...(detriment ? { detriment } : {}),
		...(perName(name, effect, extra) ? { perName: true } : {}),
		...extra,
	}));

// Options paid for once per Skill or damage type named: two Skills at +1 cost twice one.
function perName(tier: string, effect: Effect, extra: Partial<MenuOption>): boolean {
	if (effect === 'skill' || effect === 'resistance' || effect === 'vulnerability') return true;
	if (effect === 'immunity') return !extra.preset;
	return effect === 'rank-20' && tier === 'Minor';
}

export const BENEFITS: MenuOption[] = [
	...tier('Minor', 1, [
		['+1 to a Stat', 'stat', { perUnit: true }],
		['Membership in Club Desperado or Club Vanquisher'],
		['At the end of each floor, add 1 to your Skill Advancement Checks for a particular Skill'],
		['Allow a specific Skill to be raised to Rank 20', 'rank-20'],
		['Add your Stat Mod a second time when using a specific non-combat Skill in a common circumstance'],
		['A benefit that has a condition, such as gaining Advantage when attacking stone creatures'],
		['Can see in total darkness or has a natural ability to produce light'],
		['Double Mana regeneration from mending and resting in a specific environment'],
		['You can see twice as far as most creatures'],
		['A tier-1 crafting table (as soon as you acquire a personal space, it shows up there)'],
		['A free room in saferooms'],
		['Discount at stores, bonus earned from sales or interest earned (+1 for each category)'],
		['Gain a non-combat benefit once per session under very specific conditions'],
	]),
	...tier('Moderate', 2, [
		['+1 in a Skill or Spell, including Passive ones', 'skill', { perUnit: true }],
		['Heal 1 Health Bar slot when you damage or kill a creature with a specific Weapon Skill or Spell, up to 5 Health Bar per combat scene'],
		['Add your Stat Mod a second time when making an attack in a common circumstance'],
		['Roll with Advantage when making Skill Advancement Checks for a particular Skill'],
		['At the end of each floor, add 1 to your Skill Advancement Checks for a particular group of thematically linked Skills'],
		['At the start of combat, you can change your damage to a different type for that combat'],
		['+1 DR Buff (to a limit of +3)', 'dr', { perUnit: true, max: 3 }],
		['Can access any guild of a particular type'],
		['Double Mana regeneration from mending and resting without a limit'],
		['Membership in all professional and social clubs'],
		['Membership in the Dungeon Book of the Floor Club'],
		['Can raise a thematically linked group of Skills to Rank 20', 'rank-20'],
		['Mobs drop 1 × Floor Number gold when you kill them with a specific attack'],
		['Ability to gain Popularity with specific actions and attacks'],
		['Patron Benefit'],
		['Resistance to an uncommon damage type (Force, Psychic, Necrotic, etc.)', 'resistance'],
		['Resistance to damage dealt by the environment (Falling, Drowning, dungeon traps, etc.)', 'resistance'],
		['Replace a Stat used in an ability with another Stat'],
		['A Stat Mod from another ability can be used in addition to the normal Mod for specific Skills'],
		['Can use skills designed for one type of weapon on another type of weapon'],
		['When you use a Healing-type Spell, the target heals 1 additional Health Bar'],
		['The ability to traverse certain terrain types without Skill Checks'],
		['The ability to burrow'],
		['The ability to breathe underwater'],
		['+1 in all Skills for a temporary duration that\'s an hour or less'],
		['A natural attack at Rank = Floor: 1d6 + Stat Mod, +1d6 at Rank 5, 10, and 15', 'natural-attack', { preset: '1d6' }],
		['The ability to reassign a Race or Class\'s Stat point benefits once per floor during a Long Rest'],
	]),
	...tier('Major', 3, [
		['Access to significant assistance, akin to the Manager benefit'],
		['Gain a friendly Pet or a Mount'],
		['Provide a significant Buff or Benefit up to 4 Points to all of your Pets or Mounts'],
		['An ability to dramatically alter an encounter once a day, such as by making enemies attack each other'],
		['A defensive ability usable once per day, such as negating all damage you take from a single attack'],
		['The ability to Buff the entire party once per day, such as granting them regeneration or extra DR'],
		['The ability to fly, with some limitations'],
		['The ability to survive without breathing, which also gives Immunity to inhaled toxins'],
		['Rage (Benefit): Your melee attacks deal +1 damage for each Health Bar slot you have lost'],
		['Size 2 (Small) or less', 'size'],
		['+5ft Move', 'move'],
		['+5 Step', 'step'],
		['Add 1d4 to your Evade or Stat Checks for a specific Stat', 'check-die'],
		['A natural attack at Rank = Floor: 1d8 + Stat Mod, +1d8 at Rank 5, 10, and 15', 'natural-attack', { preset: '1d8' }],
		['Advantage when using a specific non-combat Skill or Spell'],
		['Situational bonus of up to ×2 damage for one round'],
		['Swap CON for determining Health Bar values with another Stat', 'health-stat'],
		['Gain a Climb Movement, which allows you to automatically climb most surfaces, even ceilings'],
	]),
	...tier('Extreme', 4, [
		['+1 in a Skill that you wouldn\'t normally be able to learn', 'skill', { perUnit: true }],
		['+1 to all Skills in a thematically linked group of 3–5 Skills', 'skill-group'],
		['Advantage on all Stat Checks for a specific Stat', 'stat-advantage'],
		['All Skills in a thematically linked group of up to 6 Skills can be raised to Rank 20', 'rank-20'],
		['Immunity to Poison', 'immunity', { preset: 'Poison' }],
		['Resistance to a common damage type (Bludgeoning, Fire)', 'resistance'],
		['Double the duration of your Rank 5 and lower Spells that have a duration'],
		['Advantage on all Skills in a limited non-combat situation'],
		['Additional functional arm'],
		['Doppelgänger shape-changing'],
	]),
	...tier('Epic', 6, [
		['+1 to all Skills in a thematically linked group of 6+ Skills', 'skill-group'],
		['All Skills can be raised to Rank 20', 'rank-20', { preset: 'all' }],
		['Immunity to a common damage type (like Bludgeoning, Fire or Piercing)', 'immunity'],
		['Halve the damage of the first nine attacks against you each day'],
		['The Limb Regeneration Benefit'],
		['Roll with Advantage on all Skills in a wide-ranging set of circumstances'],
		['Immunity to Poison and all diseases', 'immunity', { preset: 'Poison, Disease' }],
		['Advantage on Evade Checks'],
		['A powerful and flexible ability that can significantly change your Stats or Skills'],
		['Changeling shapeshifting'],
		['Roll with Advantage on all Skill Checks for a specific Stat'],
		['The ability to fly with no limitations'],
	]),
	{ id: 'custom-b', tier: 'Custom', label: 'A benefit of your own', cost: 1, effect: 'custom' },
];

export const DETRIMENTS: MenuOption[] = [
	{ id: 'stat-penalty', tier: 'Stat', label: 'Stat penalty (1 point per −2)', cost: 0, effect: 'stat-penalty', detriment: true },
	{ id: 'skill-penalty', tier: 'Skill', label: 'Skill penalty (1 point per −2)', cost: 0, effect: 'skill-penalty', detriment: true },
	...tier('Minor', 1, [
		['−1 to all Skills under a specific Stat (per −1)', 'stat-skills-penalty', { perUnit: true }],
		['Cannot choose Class due to membership in a specific club'],
		['+1 Mana cost to cast spells not favored by your Class'],
		['Disadvantage when using a thematically linked group of Skills, when there is a condition'],
		['Must worship a deity'],
		['Cannot worship a deity'],
		['−1 to Skill Advancement Checks for a specific Skill provided by your Race or Class at Rank 5+'],
		['Vulnerability: An uncommon damage type (such as Force or Necrotic) deals double damage to you', 'vulnerability'],
		['You halve the effects of a broad type of damage that isn\'t the focus of your Class'],
		['A weakness that has two conditions, such as Disadvantage in social situations when dealing with Fairies'],
		['Delay a bonus to after Level 50 or activating on the 6th Floor'],
	], true),
	...tier('Moderate', 2, [
		['A weakness with a single broad condition, such as Disadvantage in all social situations'],
		['Skill only increases in Rank upon descent to the next floor'],
		['Limited choice of weapons available to choose from'],
		['No Stat Mod added to Weapon Skill provided by your Race or Class'],
		['+3 Mana cost to a Class of spells provided by your Race or Class'],
		['Disadvantage when using a thematically linked group of Skills, such as all movement-related Skills'],
		['Prohibited from using a wide category of useful items'],
	], true),
	...tier('Major', 3, [
		['A specific Stat is capped at 10, even with magic gear and potions', 'stat-cap'],
		['Vulnerability: A common damage type (such as Bludgeoning or Piercing) deals double damage to you', 'vulnerability'],
	], true),
	{ id: 'custom-d', tier: 'Custom', label: 'A detriment of your own', cost: 1, effect: 'custom', detriment: true },
];

export const MENU = [...BENEFITS, ...DETRIMENTS];
