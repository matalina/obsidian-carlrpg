import { asText, isRecord, toEntries } from '../blocks/yaml';
import { STATS, statKey } from './stats';

// A skill's own note: how it's checked, which stat it uses, its damage if it's an attack, and its upgrades.
//
//   check: passive | opposed | unopposed | stat | evade   # evade = an attack ("attack" also works)
//   stat: int
//   opposed-by: int          # opposed only — the antagonist's stat; defaults to `stat`
//   attack: melee | ranged   # attack only; `stat` defaults to STR for melee, DEX for ranged
//   range: 30 feet           # attack only; melee (5 feet) when not set
//   ai-favor: 1
//   limitations: …
//   cooldown: 1 round
//   description: …
//   base-damage: 1d4 + STR Piercing
//   effects: …               # anything besides damage
//   upgrades: { 5: "+1d4 base damage, …", 10: …, 15: … }
//
// Spells are skills with a few more properties:
//   quote: "Hold. Hold! HOLD!"
//   keywords: Attack, Fire          # the italic line under the name; replaces the stat line
//   mana-cost: 60
//   range: 50 feet
//   duration: 2 rounds
//   cooldown: 5 minutes
//   heal: 1d4                       # Health Bar slots healed, rolled when cast
//
// Passive skills attach to an attack and change it:
//   applies-to: "[[Pugilism]]"      # skill/attack names or links, or a kind: melee | ranged
//   optional: true                  # chosen per attack (Aiming); otherwise always applied (Iron Punch)
//   add-rank: true                  # adds this skill's rank to the to-hit
//   disadvantage: true              # applying it means rolling with Disadvantage
//   base-damage: 1d2                # extra base damage dice (doubled on a Critical Hit)
//   damage: 1d4                     # extra bonus damage on a hit (not doubled)
//
// Upgrades are read for damage: "+1d4 base damage", "+1d4 damage", and "Add 1 Rank damage die"
// (the dice for the skill's current rank, from Table 37).

export type CheckKind = 'passive' | 'opposed' | 'unopposed' | 'stat' | 'attack';

const KINDS: CheckKind[] = ['passive', 'opposed', 'unopposed', 'stat', 'attack'];

export interface SkillInfo {
	kind: CheckKind | null;
	/** Stat key ("dex"), or "" when not set. */
	stat: string;
	/** Antagonist stat for opposed checks. */
	opposedBy: string;
	/** "melee" / "ranged" for attack skills. */
	attackType: string;
	aiFavor: string;
	baseDamage: string;
	limitations: string;
	description: string;
	/** Effects besides damage. */
	effects: string;
	upgrades: [rank: number, text: string][];
	quote: string;
	keywords: string;
	manaCost: number | null;
	range: string;
	duration: string;
	cooldown: string;
	heal: string;
	/** Lowercased names and kinds this passive attaches to. */
	appliesTo: string[];
	optional: boolean;
	addRank: boolean;
	disadvantage: boolean;
	/** Extra bonus damage (`damage`), not doubled on a crit. */
	bonusDamage: string;
}

export function readSkillInfo(props: Record<string, unknown>): SkillInfo {
	// Attacks are checked against Evade, so `check: evade` marks one; `attack` is the older spelling.
	const checked = asText(props.check).trim().toLowerCase();
	const kind = (checked === 'evade' ? 'attack' : checked) as CheckKind;
	const attackType = asText(props.attack).toLowerCase();
	const stat = props.stat == null || props.stat === '' ? defaultAttackStat(kind, attackType) : statKey(asText(props.stat));
	return {
		kind: KINDS.includes(kind) ? kind : null,
		stat,
		opposedBy: props['opposed-by'] == null ? stat : statKey(asText(props['opposed-by'])),
		attackType,
		aiFavor: asText(props['ai-favor']),
		baseDamage: asText(props['base-damage']),
		limitations: asText(props.limitations),
		description: asText(props.description),
		effects: asText(props.effects ?? props.effect),
		upgrades: readUpgrades(props.upgrades),
		quote: asText(props.quote),
		keywords: asText(props.keywords),
		manaCost: props['mana-cost'] == null || props['mana-cost'] === '' ? null : Number(props['mana-cost']),
		range: asText(props.range),
		duration: asText(props.duration),
		cooldown: asText(props.cooldown),
		heal: asText(props.heal),
		appliesTo: (Array.isArray(props['applies-to']) ? props['applies-to'] : props['applies-to'] == null ? [] : [props['applies-to']])
			.map((v) => linkTarget(v).toLowerCase())
			.filter(Boolean),
		optional: props.optional === true,
		addRank: props['add-rank'] === true,
		disadvantage: props.disadvantage === true,
		bonusDamage: asText(props.damage),
	};
}

// The book's default to-hit stat: STR for melee attacks, DEX for ranged.
function defaultAttackStat(kind: string, attackType: string): string {
	if (kind !== 'attack') return '';
	return attackType === 'ranged' ? 'dex' : attackType === 'melee' ? 'str' : '';
}

// "[[Pugilism|Punching]]" → "Pugilism"; an unquoted [[Pugilism]] arrives as nested lists.
function linkTarget(value: unknown): string {
	while (Array.isArray(value) && value.length === 1) value = value[0];
	const text = asText(value).trim();
	const inner = /^\[\[(.+)\]\]$/.exec(text)?.[1] ?? text;
	return inner.split('|')[0]!.split('#')[0]!.trim();
}

function readUpgrades(value: unknown): [number, string][] {
	const entries = isRecord(value) || Array.isArray(value) ? toEntries(value) : [];
	return entries
		.map(([rank, text]): [number, string] => [Number(String(rank).replace(/\D/g, '')), asText(text)])
		.filter(([rank, text]) => Number.isFinite(rank) && text)
		.sort(([a], [b]) => a - b);
}

/** "Passive", "Intelligence", "Melee Attack, Dex" — the book's line under the skill name. */
export function skillSubtitle(info: SkillInfo): string {
	if (info.keywords) return info.keywords;
	if (info.kind === 'passive') return 'Passive';
	const stat = STATS.find(([key]) => key === info.stat);
	if (info.kind === 'attack') {
		const type = info.attackType ? `${info.attackType[0]!.toUpperCase()}${info.attackType.slice(1)} Attack` : 'Attack';
		return stat ? `${type}, ${stat[0][0]!.toUpperCase()}${stat[0].slice(1)}` : type;
	}
	return stat?.[1] ?? '';
}

/** Short label for the sheet's Check type column. */
export function checkLabel(info: SkillInfo): string {
	switch (info.kind) {
		case 'passive':
			return info.appliesTo.length ? `Passive → ${info.appliesTo.map(titleWords).join(', ')}` : 'Passive';
		case 'opposed':
			return `Opposed${info.opposedBy ? ` (${info.opposedBy.toUpperCase()})` : ''}`;
		case 'unopposed':
			return 'Unopposed';
		case 'stat':
			return 'Stat check';
		case 'attack':
			// Every attack, melee or ranged, is checked against the target's Evade.
			return 'Evade';
		default:
			return '';
	}
}

/**
 * Difficulty for a check, from the rules:
 *   opposed   10 + antagonist's stat mod + floor
 *   unopposed 10 + floor × 2
 *   stat      10 + floor
 * Attacks are against the target's Evade; passive skills aren't rolled.
 */
export function difficulty(kind: CheckKind | null, floor: number | null, antagonistMod: number | null): number | null {
	if (floor == null) return null;
	switch (kind) {
		case 'opposed':
			return antagonistMod == null ? null : 10 + antagonistMod + floor;
		case 'unopposed':
			return 10 + floor * 2;
		case 'stat':
			return 10 + floor;
		default:
			return null;
	}
}

function titleWords(text: string): string {
	return text.replace(/(^|\s)(\S)/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

// Table 37: Rank Damage Dice Scaling — [minimum rank, dice], highest first.
const RANK_DAMAGE_DICE: [rank: number, dice: string[]][] = [
	[20, ['2d10']],
	[18, ['1d10', '1d8']],
	[16, ['2d8']],
	[14, ['1d8', '1d6']],
	[12, ['1d12']],
	[10, ['1d10']],
	[8, ['1d8']],
	[6, ['1d6']],
	[4, ['1d4']],
	[2, ['1d2']],
	[1, ['1']],
];

/** The "Rank damage die" for a skill rank, e.g. rank 5 → ["1d4"], rank 15 → ["1d8", "1d6"]. */
export function rankDamageDice(rank: number): string[] {
	return RANK_DAMAGE_DICE.find(([min]) => rank >= min)?.[1] ?? [];
}

/** Dice added to base damage by the upgrades reached: "+1d4 base damage", "Add 1 Rank damage die". */
function upgradeBaseDice(info: SkillInfo, rank: number): string[] {
	return info.upgrades
		.filter(([at]) => at <= rank)
		.flatMap(([, text]) => [
			...[...text.matchAll(/\+\s*(\d*d\d+)\s+base damage/gi)].map((m) => m[1]!),
			...[...text.matchAll(/add\s+(\d+)\s+rank damage di(?:e|ce)/gi)].flatMap((m) =>
				Array.from({ length: Number(m[1]) }, () => rankDamageDice(rank)).flat(),
			),
		]);
}

/** Dice added to bonus damage by the upgrades reached: "+1d4 damage" (but not "base damage"). */
function upgradeBonusDice(info: SkillInfo, rank: number): string[] {
	return info.upgrades
		.filter(([at]) => at <= rank)
		.flatMap(([, text]) => [...text.matchAll(/\+\s*(\d*d\d+)\s+damage/gi)].map((m) => m[1]!));
}

/**
 * Damage formula for an attack skill at a rank: its base damage with the upgrades' extra base dice.
 * "1d4 + STR Piercing" at rank 10 → "1d4 + 1d4 + 1d4 + STR Piercing".
 */
export function skillDamage(info: SkillInfo, rank: number): string {
	if (!info.baseDamage) return '';
	return addBaseDice(info.baseDamage, upgradeBaseDice(info, rank));
}

/** What a passive adds to an attack at its rank: base dice, bonus dice, to-hit and roll mode. */
export interface PassiveEffect {
	baseDice: string[];
	bonusDice: string[];
	toHit: number;
	disadvantage: boolean;
}

export function passiveEffect(info: SkillInfo, rank: number): PassiveEffect {
	const ownBase = [...info.baseDamage.matchAll(/\d*d\d+/g)].map((m) => m[0]);
	const ownBonus = [...info.bonusDamage.matchAll(/\d*d\d+/g)].map((m) => m[0]);
	return {
		baseDice: [...ownBase, ...upgradeBaseDice(info, rank)],
		bonusDice: [...ownBonus, ...upgradeBonusDice(info, rank)],
		toHit: info.addRank ? rank : 0,
		disadvantage: info.disadvantage,
	};
}

/** Whether a passive attaches to an attack, by its name or its kind (melee/ranged). */
export function passiveApplies(info: SkillInfo, attackName: string, attackType: string): boolean {
	const name = attackName.toLowerCase();
	return info.appliesTo.some((t) => t === name || (attackType && t === attackType.toLowerCase()));
}

/** Inserts extra base dice right after the formula's leading dice term, so a crit doubles them too. */
export function addBaseDice(formula: string, dice: string[]): string {
	if (!dice.length) return formula;
	const match = /^\s*(\d*d\d+)(.*)$/.exec(formula);
	return match ? `${match[1]} + ${dice.join(' + ')}${match[2]}` : `${dice.join(' + ')} + ${formula}`;
}
