import { asText, isRecord, titleCase } from '../blocks/yaml';

// A debuff note's `mechanics`, in words:
//
//   mechanics:
//     disadvantage: sight        # all | attacks | sight | next-check | next-attack | …
//     check-penalty: -2
//     damage: 1d6+F Fire         # each round
//     move-multiplier: 0.5
//     cant-act: true             # also: no-move, no-step, no-spells, no-heal, no-dex-mod,
//                                #       attacked-with-advantage, halve-highest-stat
//
// Anything else is listed as "Key: value".

const DISADVANTAGE_ON: Record<string, string> = {
	all: 'all rolls',
	attacks: 'attacks',
	sight: 'checks that need sight',
	'next-check': 'the next check',
	'next-attack': 'the next attack',
};

const FLAGS: Record<string, string> = {
	'cant-act': "Can't act",
	'no-move': "Can't Move",
	'no-step': "Can't Step",
	'no-spells': "Can't cast spells",
	'no-heal': "Can't heal",
	'no-dex-mod': 'No DEX mod',
	'attacked-with-advantage': 'Attacks against you have Advantage',
	'halve-highest-stat': 'Highest stat halved',
};

export function describeMechanics(mechanics: unknown): string[] {
	if (!isRecord(mechanics)) return [];
	return Object.entries(mechanics).flatMap(([key, value]): string[] => {
		if (value == null || value === false || value === '') return [];
		const text = asText(value);
		switch (key) {
			case 'disadvantage':
				return [`Disadvantage on ${DISADVANTAGE_ON[text] ?? text.replace(/-/g, ' ')}`];
			case 'check-penalty':
				return [`${text.replace('-', '−')} to checks`];
			case 'damage':
				return [`${text} damage`];
			case 'move-multiplier':
				return [Number(value) === 0.5 ? 'Half Move' : `Move × ${text}`];
		}
		if (FLAGS[key]) return [FLAGS[key]];
		return [value === true ? titleCase(key.replace(/-/g, ' ')) : `${titleCase(key.replace(/-/g, ' '))}: ${text}`];
	});
}
