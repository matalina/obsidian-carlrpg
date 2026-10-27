import { RenderMarkdown } from '../shared';
import { asText, titleCase, toEntries } from '../yaml';

/** A boxed field: a filled value box with its label (below by default, or beside it). */
export function field(
	parent: HTMLElement,
	label: string,
	value: string,
	renderMarkdown: RenderMarkdown,
	{ inline = false, cls = '' } = {},
): HTMLElement {
	const el = parent.createDiv({ cls: `carl-field ${inline ? 'is-inline' : ''} ${cls}`.trim() });
	if (inline) el.createDiv({ cls: 'carl-field-label', text: label });
	const box = el.createDiv({ cls: 'carl-field-value' });
	if (value) renderMarkdown(value, box);
	if (!inline && label) el.createDiv({ cls: 'carl-field-label', text: label });
	return el;
}

/** An operator between fields: "+", "=", "/". */
export function op(parent: HTMLElement, text: string) {
	parent.createDiv({ cls: 'carl-op', text });
}

/** A panel with a black title bar, like the sheet's ATTACKS / SKILLS headers. */
export function panel(parent: HTMLElement, title: string, cls = ''): HTMLElement {
	const el = parent.createDiv({ cls: `carl-panel ${cls}`.trim() });
	el.createDiv({ cls: 'carl-bar', text: title });
	return el.createDiv({ cls: 'carl-panel-body' });
}

/** A table with a header row; returns the tbody. */
export function table(parent: HTMLElement, headers: string[], cls = ''): HTMLTableSectionElement {
	const el = parent.createEl('table', { cls: `carl-table ${cls}`.trim() });
	const head = el.createEl('thead').createEl('tr');
	for (const header of headers) head.createEl('th', { text: header });
	return el.createEl('tbody');
}

/** Markdown for a list entry: "text", or "*Name*—description" for `name: description`. */
export function entryMarkdown(name: string, value: unknown): string {
	if (value == null) return name;
	return `*${titleCase(name)}*—${asText(value)}`;
}

/** Ruled rows, one per list entry. Returns false when there is nothing to show. */
export function rows(parent: HTMLElement, list: unknown, renderMarkdown: RenderMarkdown): boolean {
	const entries = listEntries(list);
	if (!entries.length) return false;
	const el = parent.createDiv({ cls: 'carl-rows' });
	for (const [name, value] of entries) renderMarkdown(entryMarkdown(name, value), el.createDiv({ cls: 'carl-row' }));
	return true;
}

// Like toEntries, but keeps an unquoted [[link]] (parsed by YAML as nested lists) as link text.
export function listEntries(list: unknown): [string, unknown][] {
	const items = Array.isArray(list) ? list : list == null ? [] : [list];
	return items.flatMap((item): [string, unknown][] => {
		if (Array.isArray(item)) {
			let inner: unknown = item;
			while (Array.isArray(inner) && inner.length === 1) inner = inner[0];
			return [[`[[${asText(inner)}]]`, null]];
		}
		return toEntries(item);
	});
}

/** Free text (markdown) from a property; empty when missing. */
export function text(value: unknown): string {
	if (Array.isArray(value)) return listEntries(value).map(([n, v]) => entryMarkdown(n, v)).join('\n');
	return asText(value);
}
