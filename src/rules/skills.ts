import { asText, isRecord, titleCase, toEntries, toRecord } from '../blocks/yaml';

/**
 * A skill rank granted by a race or class: `climbing: 2`, or `performance: { rank: 2, notes: … }`.
 * Rank `F` is a natural attack's: it equals the floor number and only rises by floor.
 */
export interface SkillBonus {
	name: string;
	/** 0 for a rank of F. */
	rank: number;
	notes: string;
	/** Rank = Floor Number. */
	floor: boolean;
}

export function skillKey(name: string): string {
	return name.trim().toLowerCase();
}

// `key` is "skills" or "spells" — races and classes grant both the same way.
export function readSkillBonuses(props: Record<string, unknown>, key = 'skills'): SkillBonus[] {
	return toEntries(props[key]).flatMap(([name, value]): SkillBonus[] => {
		const fields = isRecord(value) || Array.isArray(value) ? toRecord(value) : { rank: value };
		if (fields.rank == null || fields.rank === '') return [];
		const notes = asText(fields.notes);
		if (asText(fields.rank).trim().toUpperCase() === 'F') return [{ name, rank: 0, notes, floor: true }];
		const rank = Number(fields.rank);
		return Number.isFinite(rank) ? [{ name, rank, notes, floor: false }] : [];
	});
}

// "+2 Climbing, Perception, and Performance (with a stringed instrument specialty) Skills" —
// one line per rank, like the book's race and class entries. Rank F skills come last:
// "Claws Skill at Rank = Floor".
export function describeSkillBonuses(skills: SkillBonus[], noun = 'Skill'): string[] {
	const byRank = new Map<number, string[]>();
	const atFloor: string[] = [];
	for (const skill of skills) {
		if (skill.floor) {
			atFloor.push(titleCase(skill.name) + (skill.notes ? ` (${skill.notes})` : ''));
			continue;
		}
		const label = titleCase(skill.name) + (skill.notes ? ` (${skill.notes})` : '');
		byRank.set(skill.rank, [...(byRank.get(skill.rank) ?? []), label]);
	}
	const nouns = (names: string[]) => (names.length === 1 ? noun : `${noun}s`);
	return [
		...[...byRank].map(([rank, names]) => `${rank < 0 ? String(rank) : `+${rank}`} ${joinList(names)} ${nouns(names)}`),
		...(atFloor.length ? [`${joinList(atFloor)} ${nouns(atFloor)} at Rank = Floor`] : []),
	];
}

function joinList(names: string[]): string {
	if (names.length < 3) return names.join(' and ');
	return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
