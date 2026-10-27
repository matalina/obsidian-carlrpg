import { asText, isRecord, titleCase, toEntries, toRecord } from '../blocks/yaml';

/** A skill rank granted by a race or class: `climbing: 2`, or `performance: { rank: 2, notes: … }`. */
export interface SkillBonus {
	name: string;
	rank: number;
	notes: string;
}

export function skillKey(name: string): string {
	return name.trim().toLowerCase();
}

// `key` is "skills" or "spells" — races and classes grant both the same way.
export function readSkillBonuses(props: Record<string, unknown>, key = 'skills'): SkillBonus[] {
	return toEntries(props[key]).flatMap(([name, value]) => {
		const fields = isRecord(value) || Array.isArray(value) ? toRecord(value) : { rank: value };
		if (fields.rank == null || fields.rank === '') return [];
		const rank = Number(fields.rank);
		return Number.isFinite(rank) ? [{ name, rank, notes: asText(fields.notes) }] : [];
	});
}

// "+2 Climbing, Perception, and Performance (with a stringed instrument specialty) Skills" —
// one line per rank, like the book's race and class entries.
export function describeSkillBonuses(skills: SkillBonus[], noun = 'Skill'): string[] {
	const byRank = new Map<number, string[]>();
	for (const skill of skills) {
		const label = titleCase(skill.name) + (skill.notes ? ` (${skill.notes})` : '');
		byRank.set(skill.rank, [...(byRank.get(skill.rank) ?? []), label]);
	}
	return [...byRank].map(([rank, names]) => {
		const sign = rank < 0 ? String(rank) : `+${rank}`;
		return `${sign} ${joinList(names)} ${names.length === 1 ? noun : `${noun}s`}`;
	});
}

function joinList(names: string[]): string {
	if (names.length < 3) return names.join(' and ');
	return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
