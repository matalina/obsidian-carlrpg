import { App, MarkdownPostProcessorContext } from 'obsidian';
import { formatSize, sizeValue } from '../rules/size';
import { collectStats, formatMod, isStat, statMod } from '../rules/stats';
import { rows } from './character/ui';
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

export const MOUNT_BLOCK = 'carl-mount';

// Fields rendered in a fixed place; anything else at the top level is shown as an extra line.
const KNOWN_FIELDS = new Set([
	'name', 'type', 'size', 'creature',
	'hp', 'hp-slots', 'hp-current', 'occupants', 'level', 'evade', 'move', 'dr',
	'stats', 'attacks', 'accessories', 'traits',
]);

const SUMMARY_FIELDS: [key: string, label: string][] = [
	['occupants', 'Occupants'],
	['level', 'Level'],
	['evade', 'Evade'],
	['move', 'Move'],
	['dr', 'DR'],
];

// A mount or vehicle on its own note, laid out like a creature statblock.
export function renderMountBlock(app: App, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	ctx.addChild(new MountBlock(app, MOUNT_BLOCK, source, el, ctx.sourcePath));
}

class MountBlock extends LiveBlock {
	protected renderData(data: Record<string, unknown>, md: RenderMarkdown) {
		const block = this.containerEl.createDiv({ cls: 'carl-block carl-creature carl-mount' });
		const stats = collectStats(data);
		const con = stats.find((s) => s.key === 'con');
		const hp = readPair(data, 'hp', ['slots', 'current']);

		renderHeader(block, data, this.sourcePath);
		// Vehicles have no CON: each health slot is worth the size value (1–8).
		// A living mount with a `constitution` uses its CON mod like any creature.
		const slotValue = con && Number.isFinite(con.value) ? statMod(con.value) : sizeValue(data.size);
		renderHealth(block, hp.slots, hp.current, slotValue);
		renderGrid(block, 'carl-summary', SUMMARY_FIELDS.flatMap(([key, label]) => {
			const value = asText(data[key]);
			return value ? [[label, value]] : [];
		}));
		renderGrid(block, 'carl-stats', stats.map(({ name, value, raw }) => [
			titleCase(name.slice(0, 3)),
			Number.isFinite(value) ? `${raw} (${formatMod(statMod(value))})` : raw,
		]));
		renderAttacks(block, data.attacks, md);
		const accessories = block.createDiv({ cls: 'carl-section' });
		accessories.createDiv({ cls: 'carl-subhead', text: 'Accessories' });
		if (!rows(accessories, data.accessories, md)) accessories.remove();
		renderExtras(block, data, (key) => KNOWN_FIELDS.has(key) || isStat(key), md);
		renderNotes(block, data.traits, md);
	}
}

// "Vehicle; Large (5)" — `type` defaults to Mount.
function renderHeader(block: HTMLElement, data: Record<string, unknown>, sourcePath: string) {
	const header = block.createDiv({ cls: 'carl-header' });
	header.createDiv({ cls: 'carl-name', text: asText(data.name) || noteName(sourcePath) });
	const kind = titleCase(asText(data.type)) || 'Mount';
	const details = [formatSize(data.size), titleCase(asText(data.creature))].filter(Boolean).join(', ');
	header.createDiv({ cls: 'carl-subtitle', text: [kind, details].filter(Boolean).join('; ') });
}
