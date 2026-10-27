import { formatSize } from '../rules/size';
import { App, MarkdownPostProcessorContext } from 'obsidian';
import { collectStats, formatMod, isStat, statMod } from '../rules/stats';
import {
	LiveBlock,
	noteName,
	readPair,
	RenderMarkdown,
	renderAttacks,
	renderExtras,
	renderGrid,
	renderHealth,
	renderNotes,
} from './shared';
import { asText, titleCase } from './yaml';

export const CREATURE_BLOCK = 'carl-creature';

// Fields rendered in a fixed place; anything else at the top level is shown as an extra line.
const KNOWN_FIELDS = new Set([
	'name', 'level', 'type', 'size', 'creature',
	'hp', 'hp-slots', 'hp-current', 'surprise', 'evade', 'move', 'dr',
	'stats', 'attacks', 'traits',
]);

const SUMMARY_FIELDS: [key: string, label: string][] = [
	['level', 'Level'],
	['surprise', 'Surprise'],
	['evade', 'Evade'],
	['move', 'Move'],
	['dr', 'DR'],
];

export function renderCreatureBlock(
	app: App,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
) {
	ctx.addChild(new CreatureBlock(app, CREATURE_BLOCK, source, el, ctx.sourcePath));
}

class CreatureBlock extends LiveBlock {
	protected renderData(data: Record<string, unknown>, renderMarkdown: RenderMarkdown) {
		const block = this.containerEl.createDiv({ cls: 'carl-block carl-creature' });
		const stats = collectStats(data);
		const con = stats.find((s) => s.key === 'con');
		const hp = readPair(data, 'hp', ['slots', 'current']);

		renderHeader(block, data, this.sourcePath);
		renderHealth(block, hp.slots, hp.current, con ? statMod(con.value) : null);
		renderGrid(block, 'carl-summary', SUMMARY_FIELDS.flatMap(([key, label]) => {
			const value = asText(data[key]);
			return value ? [[label, value]] : [];
		}));
		renderGrid(block, 'carl-stats', stats.map(({ name, value, raw }) => [
			titleCase(name.slice(0, 3)),
			Number.isFinite(value) ? `${raw} (${formatMod(statMod(value))})` : raw,
		]));
		renderAttacks(block, data.attacks, renderMarkdown);
		renderExtras(block, data, (key) => KNOWN_FIELDS.has(key) || isStat(key), renderMarkdown);
		renderNotes(block, data.traits, renderMarkdown);
	}
}

function renderHeader(block: HTMLElement, data: Record<string, unknown>, sourcePath: string) {
	const header = block.createDiv({ cls: 'carl-header' });
	header.createDiv({ cls: 'carl-name', text: asText(data.name) || noteName(sourcePath) });

	// "Mob; Large (5), Mutated"
	const kind = titleCase(asText(data.type));
	const details = [formatSize(data.size), titleCase(asText(data.creature))].filter(Boolean).join(', ');
	const subtitle = [kind, details].filter(Boolean).join('; ');
	if (subtitle) header.createDiv({ cls: 'carl-subtitle', text: subtitle });
}
