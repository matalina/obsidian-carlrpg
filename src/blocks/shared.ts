import {
	App,
	Component,
	debounce,
	MarkdownRenderChild,
	MarkdownRenderer,
	parseYaml,
	TAbstractFile,
	TFile,
} from 'obsidian';
import { asText, isRecord, titleCase, toEntries, toRecord } from './yaml';

// Renders markdown (links, bold, …) into a target element.
export type RenderMarkdown = (markdown: string, target: HTMLElement) => void;

// Properties never shown as block content: Obsidian's own, and `source`/`page`, which go in the footer.
export const HIDDEN_PROPERTIES = new Set(['tags', 'aliases', 'cssclasses', 'publish', 'position', 'source', 'page']);

/**
 * A block whose data is either the YAML inside it or, when the block is empty,
 * the note's own properties. Re-renders when the note's properties or any
 * watched file (e.g. a linked item note) change.
 */
export abstract class LiveBlock extends MarkdownRenderChild {
	private content: Component | null = null;
	private watchedPaths = new Set<string>();
	private watchUnresolved = false;

	constructor(
		protected app: App,
		private blockName: string,
		protected source: string,
		containerEl: HTMLElement,
		protected sourcePath: string,
	) {
		super(containerEl);
	}

	onload() {
		this.render();
		const rerender = debounce(() => this.render(), 300, true);
		const onFileEvent = (file: TAbstractFile) => {
			if (this.watchUnresolved || this.watchedPaths.has(file.path)) rerender();
		};
		this.registerEvent(this.app.metadataCache.on('changed', onFileEvent));
		this.registerEvent(this.app.vault.on('delete', onFileEvent));
		this.registerEvent(this.app.vault.on('rename', onFileEvent));
	}

	/** Watch more files, e.g. linked items; `unresolved` re-renders on any change so new notes get picked up. */
	protected watch(paths: string[], unresolved = false) {
		for (const path of paths) this.watchedPaths.add(path);
		this.watchUnresolved ||= unresolved;
	}

	protected abstract renderData(data: Record<string, unknown>, renderMarkdown: RenderMarkdown): void;

	/** Redraws the block, e.g. after a choice in its own controls. */
	protected rerender() {
		this.render();
	}

	private render() {
		if (this.content) this.removeChild(this.content);
		this.content = this.addChild(new Component());
		this.containerEl.empty();
		this.watchedPaths = new Set();
		this.watchUnresolved = false;

		const data = this.loadData();
		if (!data) return;
		this.renderData(data, markdownRenderer(this.app, this.sourcePath, this.content));
		const block = this.containerEl.querySelector<HTMLElement>(':scope > .carl-block');
		if (block) renderSource(block, data);
	}

	private loadData(): Record<string, unknown> | null {
		if (this.source.trim()) return parseBlock(this.blockName, this.source, this.containerEl);

		// Empty block → use the note's properties.
		this.watch([this.sourcePath]);
		const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
		const frontmatter = file instanceof TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
		if (!isRecord(frontmatter)) {
			renderError(this.containerEl, this.blockName, 'Add properties to this note, or YAML inside the block.');
			return null;
		}
		return frontmatter;
	}
}

// "Core Rulebook, p. 212" or "Homebrew" from `source` and `page`, at the foot of the card.
export function renderSource(block: HTMLElement, data: Record<string, unknown>) {
	const source = asText(data.source).trim();
	const page = asText(data.page).trim();
	const text = [source, page && `p. ${page}`].filter(Boolean).join(', ');
	if (text) block.createDiv({ cls: 'carl-source', text });
}

// Falls back to the note's file name, so a note's properties don't need a `name`.
export function noteName(sourcePath: string): string {
	return sourcePath.split('/').pop()?.replace(/\.md$/, '') ?? '';
}

export function markdownRenderer(app: App, sourcePath: string, component: Component): RenderMarkdown {
	return (markdown, target) => void MarkdownRenderer.render(app, markdown, target, sourcePath, component);
}

// Parses a block's YAML, rendering an error box and returning null when it isn't a map.
export function parseBlock(blockName: string, source: string, el: HTMLElement): Record<string, unknown> | null {
	let data: unknown;
	try {
		data = parseYaml(source);
	} catch (e) {
		renderError(el, blockName, `Invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
	if (!isRecord(data)) {
		renderError(el, blockName, 'Expected a YAML map with at least a name.');
		return null;
	}
	return data;
}

export function renderError(el: HTMLElement, blockName: string, message: string) {
	el.createDiv({ cls: 'carl-block carl-error', text: `${blockName}: ${message}` });
}

/**
 * Reads a two-part value from flat properties (`hp-slots`, `hp-current`) or a
 * nested one (`hp: { slots, current }`, list form, or a bare number for the first part).
 */
export function readPair(
	data: Record<string, unknown>,
	name: string,
	[first, second]: [string, string],
): Record<string, unknown> {
	const flatFirst = data[`${name}-${first}`];
	const flatSecond = data[`${name}-${second}`];
	if (flatFirst != null || flatSecond != null) return { [first]: flatFirst, [second]: flatSecond };
	const nested = data[name];
	if (nested == null) return {};
	return isRecord(nested) || Array.isArray(nested) ? toRecord(nested) : { [first]: nested };
}

// One box per health slot, each worth the CON modifier, shaded red → green.
// Slots past `current` are shown as lost. `wide` stretches the bar to the full width.
export function renderHealth(
	block: HTMLElement,
	slots: unknown,
	current: unknown,
	conMod: number | null,
	wide = false,
) {
	const total = Number(slots);
	if (!Number.isInteger(total) || total < 1) return;
	const remaining = current == null ? total : Number(current);

	const bar = block.createDiv({ cls: wide ? 'carl-health is-wide' : 'carl-health' });
	for (let i = 0; i < total; i++) {
		const slot = bar.createDiv({ cls: 'carl-slot' });
		const box = slot.createDiv({
			cls: i < remaining ? 'carl-slot-box' : 'carl-slot-box is-lost',
			// A non-breaking space keeps an empty slot as tall as a numbered one.
			text: conMod == null ? ' ' : String(conMod),
		});
		box.setCssProps({
			'--carl-slot-hue-from': String((120 * i) / total),
			'--carl-slot-hue-to': String((120 * (i + 1)) / total),
		});
		slot.createDiv({ cls: 'carl-slot-pct', text: `${Math.round((100 * (i + 1)) / total)}%` });
	}
}

export function renderGrid(block: HTMLElement, cls: string, cells: string[][]) {
	if (!cells.length) return;
	const grid = block.createDiv({ cls: `carl-grid ${cls}` });
	grid.setCssProps({ '--carl-columns': String(cells.length) });
	for (const [label] of cells) grid.createDiv({ cls: 'carl-label', text: label });
	for (const [, value] of cells) grid.createDiv({ cls: 'carl-value', text: value });
}

// Area/distance fields, each a feet value printed with its label: "30ft range", "5ft blast radius".
const AREA_FIELDS: [key: string, label: string][] = [
	['range', 'range'],
	['cone', 'cone'],
	['radius', 'blast radius'],
	['line', 'line'],
];

const ATTACK_FIELDS = new Set(['to-hit', 'damage', 'limit', 'effect', ...AREA_FIELDS.map(([key]) => key)]);

// ["30ft range", "5ft blast radius"] for whichever area fields are present.
export function describeArea(fields: Record<string, unknown>): string[] {
	return AREA_FIELDS.flatMap(([key, label]) => {
		const value = asText(fields[key]);
		return value ? [`${value} ${label}`] : [];
	});
}

// "Lava Spit: 13+F to hit, 1d8+F Fire, 30ft range (once per round)" with the effect sentence on its own line.
export function renderAttacks(block: HTMLElement, attacks: unknown, renderMarkdown: RenderMarkdown) {
	const entries = toEntries(attacks);
	if (!entries.length) return;

	const section = block.createDiv({ cls: 'carl-section carl-attacks' });
	for (const [name, details] of entries) {
		const fields = toRecord(details);
		const toHit = asText(fields['to-hit']);
		const parts = [
			toHit && `${toHit} to hit`,
			asText(fields.damage),
			...describeArea(fields),
			...Object.entries(fields)
				.filter(([key]) => !ATTACK_FIELDS.has(key))
				.map(([key, value]) => (value == null ? key : `${key} ${asText(value)}`)),
		].filter(Boolean);

		const limit = asText(fields.limit);
		const line = `**${titleCase(name)}:** ${parts.join(', ')}${limit ? ` (${limit})` : ''}`;

		const attack = section.createDiv({ cls: 'carl-attack' });
		renderMarkdown(line, attack.createDiv());

		const effect = asText(fields.effect);
		if (effect) renderMarkdown(effect, attack.createDiv({ cls: 'carl-attack-effect' }));
	}
}

// Any property not shown elsewhere, as "**Key:** value" lines, so nothing on the note is silently dropped.
export function renderExtras(
	block: HTMLElement,
	data: Record<string, unknown>,
	isShown: (key: string) => boolean,
	renderMarkdown: RenderMarkdown,
) {
	const extras = Object.entries(data).filter(
		([key, value]) => value != null && !isShown(key) && !HIDDEN_PROPERTIES.has(key),
	);
	if (!extras.length) return;

	const section = block.createDiv({ cls: 'carl-section' });
	for (const [key, value] of extras) {
		const text = typeof value === 'string'
			? value
			: toEntries(value).map(([k, v]) => (v == null ? k : `${k} ${asText(v)}`)).join(', ');
		renderMarkdown(`**${titleCase(key)}:** ${text}`, section.createDiv());
	}
}

// "Notes: *Bad Reflux*—Attacks can target…"
export function renderNotes(block: HTMLElement, traits: unknown, renderMarkdown: RenderMarkdown) {
	const entries = toEntries(traits);
	if (!entries.length) return;

	const section = block.createDiv({ cls: 'carl-section carl-notes' });
	entries.forEach(([name, text], i) => {
		const prefix = i === 0 ? '**Notes:** ' : '';
		const body = text == null ? `*${titleCase(name)}*` : `*${titleCase(name)}*—${asText(text)}`;
		renderMarkdown(prefix + body, section.createDiv());
	});
}
