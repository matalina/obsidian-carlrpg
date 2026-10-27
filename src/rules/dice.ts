// Dice rolling and the Degrees of Success & Failure table.

/** Values for the letters in sheet formulas: F = floor, S = size value (1–8), STR/DEX/… = stat mods. */
export interface FormulaVars {
	F: number | null;
	S: number | null;
	/** Stat mods by key ("str"), for formulas like "1d4 + STR". */
	stats?: Record<string, number>;
}

const STAT_TERM = 'STR|INT|CON|DEX|CHA';

function termValue(term: string, vars: FormulaVars): number | null {
	if (/^\d+$/.test(term)) return Number(term);
	if (term === 'F') return vars.F;
	if (term === 'S') return vars.S;
	return vars.stats?.[term.toLowerCase()] ?? null;
}

export interface DiceRoll {
	/** "1d8+F" as written. */
	formula: string;
	/** Text after the formula, e.g. "Fire" in "1d8+F Fire". */
	label: string;
	/** Each die rolled, grouped per dice term. */
	dice: { sides: number; rolls: number[] }[];
	total: number;
	/** "1d8[6] + F[3] = 9" */
	detail: string;
}

/** "13+F" → 16 when F is 3; null when it isn't a plain formula or a letter has no value. */
export function resolveNumber(formula: string, vars: FormulaVars): number | null {
	const terms = splitTerms(formula.trim());
	if (!terms) return null;
	let total = 0;
	for (const { sign, term } of terms) {
		const value = termValue(term, vars);
		if (value == null) return null;
		total += sign * value;
	}
	return total;
}

/**
 * Rolls "2d6+4 Slashing", "1d8+F Fire", "d20". `diceMultiplier` doubles the dice for a critical hit
 * (twice as many base dice, then the flat bonuses once). Returns null if it can't be parsed.
 */
export function rollFormula(text: string, vars: FormulaVars, diceMultiplier = 1): DiceRoll | null {
	// The longest run of leading words that parses as a formula; the rest is the label.
	const words = text.trim().split(/\s+/);
	let split = 0;
	for (let i = words.length; i > 0; i--) {
		if (splitTerms(words.slice(0, i).join(''))) {
			split = i;
			break;
		}
	}
	const formula = words.slice(0, split).join(' ');
	const label = words.slice(split).join(' ');
	const terms = split ? splitTerms(formula) : null;
	if (!terms) return null;

	const dice: DiceRoll['dice'] = [];
	const parts: string[] = [];
	let total = 0;
	for (const { sign, term } of terms) {
		const die = /^(\d*)d(\d+)$/.exec(term);
		let value: number;
		let shown: string;
		if (die) {
			const count = (Number(die[1]) || 1) * diceMultiplier;
			const sides = Number(die[2]);
			const rolls = Array.from({ length: count }, () => rollDie(sides));
			dice.push({ sides, rolls });
			value = rolls.reduce((a, b) => a + b, 0);
			shown = `${count}d${sides}[${rolls.join(',')}]`;
		} else if (/^\d+$/.test(term)) {
			value = Number(term);
			shown = term;
		} else {
			const v = termValue(term, vars);
			if (v == null) return null;
			value = v;
			shown = `${term}[${v}]`;
		}
		total += sign * value;
		parts.push(`${parts.length ? (sign < 0 ? '- ' : '+ ') : sign < 0 ? '-' : ''}${shown}`);
	}
	return { formula, label, dice, total, detail: `${parts.join(' ')} = ${total}` };
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

/** A d20 — two with Advantage (keep the higher) or Disadvantage (keep the lower). */
export function rollD20(mode: RollMode): { natural: number; shown: string } {
	if (mode === 'normal') {
		const natural = rollDie(20);
		return { natural, shown: `d20[${natural}]` };
	}
	const a = rollDie(20);
	const b = rollDie(20);
	const natural = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
	return { natural, shown: `d20[${a},${b}→${natural}${mode === 'advantage' ? ' adv' : ' dis'}]` };
}

export function rollDie(sides: number): number {
	return Math.floor(Math.random() * sides) + 1;
}

function splitTerms(formula: string): { sign: number; term: string }[] | null {
	const compact = formula.replace(/\s+/g, '');
	// Stat names first, so "STR" isn't read as "S".
	const term = STAT_TERM + String.raw`|\d*d\d+|\d+|F|S`;
	if (!new RegExp(`^[+-]?(${term})([+-](${term}))*$`).test(compact)) return null;
	return [...compact.matchAll(new RegExp(`([+-]?)(${term})`, 'g'))].map((m) => ({
		sign: m[1] === '-' ? -1 : 1,
		term: m[2]!,
	}));
}

export type Degree =
	| 'Critical Hit'
	| 'Amazing Success'
	| 'Standard Success'
	| 'Near Miss Fail'
	| 'Standard Fail'
	| 'Major Fail'
	| 'Critical Fail';

/** Degrees of Success & Failure. Natural 20/1 apply even without a target. */
export function degreeOf(natural: number, total: number, target: number | null): Degree | null {
	if (natural === 20) return 'Critical Hit';
	if (natural === 1) return 'Critical Fail';
	if (target == null) return null;
	const by = total - target;
	if (by >= 10) return 'Amazing Success';
	if (by >= 0) return 'Standard Success';
	if (by >= -2) return 'Near Miss Fail';
	if (by >= -9) return 'Standard Fail';
	return 'Major Fail';
}

export function isSuccess(degree: Degree | null): boolean {
	return degree === 'Critical Hit' || degree === 'Amazing Success' || degree === 'Standard Success';
}
