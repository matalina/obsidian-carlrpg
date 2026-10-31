import { parseSize } from '../rules/size';
import { ForgedMob } from './generate';
import { STAT_KEYS } from './tables';

// Quotes a YAML scalar when it would otherwise be misread.
function scalar(value: string | number): string {
	const text = String(value);
	return /^[\s]|[\s]$|[:#[\]{}&*!|>'"%@`,]|^-/.test(text) ? `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : text;
}

function line(key: string, value: string | number | null, indent = ''): string {
	return value === null || value === '' ? `${indent}${key}:` : `${indent}${key}: ${scalar(value)}`;
}

/** The mob's properties in the same order and shape as the mob template. */
export function mobFrontmatter(mob: ForgedMob, tag = 'carl/creature'): string {
	const attacks = mob.attacks.flatMap((a) => {
		const ind = '      ';
		return [
			`  - ${a.name}:`,
			line('to-hit', a.toHit, ind),
			line('damage', a.damage, ind),
			line('range', a.range, ind),
			line('cone', a.area?.field === 'cone' ? a.area.size : null, ind),
			line('radius', a.area?.field === 'radius' ? a.area.size : null, ind),
			line('line', a.area?.field === 'line' ? a.area.size : null, ind),
			line('limit', null, ind),
			line('effect', a.effect, ind),
		];
	});

	return [
		'---',
		'tags:',
		`  - ${tag}`,
		line('level', mob.level),
		line('type', mob.type),
		line('size', parseSize(mob.size)?.name ?? mob.size),
		line('creature', mob.creature),
		line('hp-slots', mob.hpSlots),
		line('hp-current', mob.hpSlots),
		line('surprise', mob.surprise),
		line('evade', mob.evade),
		line('move', mob.move),
		line('dr', mob.dr),
		...STAT_KEYS.map((k) => line(k, mob.stats[k])),
		'attacks:',
		...attacks,
		'traits:',
		'  - trait name: details',
		'source:',
		'page:',
		'---',
	].join('\n');
}

/** The mob as a property record, for previewing with the creature card renderer. */
export function mobRecord(mob: ForgedMob): Record<string, unknown> {
	return {
		level: mob.level,
		type: mob.type,
		size: mob.size,
		creature: mob.creature,
		'hp-slots': mob.hpSlots,
		'hp-current': mob.hpSlots,
		surprise: mob.surprise,
		evade: mob.evade,
		move: mob.move,
		dr: mob.dr,
		...mob.stats,
		attacks: mob.attacks.map((a) => ({
			[a.name]: {
				'to-hit': a.toHit,
				damage: a.damage,
				range: a.range,
				...(a.area ? { [a.area.field]: a.area.size } : {}),
				...(a.effect ? { effect: a.effect } : {}),
			},
		})),
	};
}

/**
 * Puts the mob's properties into a mob template: replaces its frontmatter, keeps the body
 * (heading, callout, carl-creature block), and fills the "(level)" placeholder.
 */
export function fillMobTemplate(template: string, mob: ForgedMob): string {
	const tag = /^\s*-\s*(carl\/[\w-]+)/m.exec(template)?.[1] ?? 'carl/creature';
	const body = template.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	return `${mobFrontmatter(mob, tag)}\n${body.replace(/\(level\)/g, String(mob.level))}`;
}
