import { App, TFile } from 'obsidian';
import { asText, isRecord, titleCase, toEntries } from '../blocks/yaml';
import { statKey } from './stats';

// Bonus keys that aren't stats; shown with these labels.
const OTHER_BONUS_LABELS: Record<string, string> = { evade: 'Evade', dr: 'DR' };

export interface NoteLink {
	/** Link text as written, e.g. "Sunglasses|Shades". */
	text: string;
	/** Link target without alias or heading. */
	target: string;
	/** Written as [[…]] — an unresolved bracketed link is shown as missing; plain text is just text. */
	bracketed: boolean;
}

/** A value that may point at another note (item, race, pet…), with that note's properties. */
export interface Linked {
	link: NoteLink | null;
	file: TFile | null;
	props: Record<string, unknown>;
}

export interface Item extends Linked {
	link: NoteLink;
	bonuses: Map<string, number>;
}

export function bonusLabel(key: string): string {
	return OTHER_BONUS_LABELS[key] ?? titleCase(key);
}

// Accepts "[[Item]]", "Item", or an unquoted [[Item]] (which YAML parses as nested lists).
export function parseLink(value: unknown): NoteLink | null {
	let bracketed = false;
	if (Array.isArray(value) && value.length === 1 && Array.isArray(value[0])) bracketed = true;
	while (Array.isArray(value) && value.length === 1) value = value[0];
	const raw = asText(value).trim();
	if (!raw) return null;
	const match = /^\[\[(.+)\]\]$/.exec(raw);
	const text = match?.[1] ?? raw;
	const target = text.split('|')[0]!.split('#')[0]!.trim();
	return target ? { text, target, bracketed: bracketed || !!match } : null;
}

// A list of links: a single link, or a YAML list of them.
export function parseLinks(value: unknown): NoteLink[] {
	if (Array.isArray(value) && value.length > 1) return value.flatMap((v) => parseLink(v) ?? []);
	const link = parseLink(value);
	return link ? [link] : [];
}

export function resolveLink(app: App, link: NoteLink, sourcePath: string): Linked {
	const file = app.metadataCache.getFirstLinkpathDest(link.target, sourcePath);
	const frontmatter = file ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
	return { link, file, props: isRecord(frontmatter) ? frontmatter : {} };
}

// A link to a note, or an inline map of the same properties (e.g. a quick pet without its own note).
export function resolveValue(app: App, value: unknown, sourcePath: string): Linked | null {
	if (isRecord(value)) return { link: null, file: null, props: value };
	const link = parseLink(value);
	return link ? resolveLink(app, link, sourcePath) : null;
}

export function resolveItem(app: App, link: NoteLink, sourcePath: string): Item {
	const linked = resolveLink(app, link, sourcePath);
	return { ...linked, link, bonuses: readBonuses(linked.props) };
}

// Reads `bonuses` from a note's properties (map or list of single-key maps), keyed by stat ("str") or name ("evade").
export function readBonuses(props: Record<string, unknown>): Map<string, number> {
	const bonuses = new Map<string, number>();
	for (const [name, value] of toEntries(props.bonuses)) {
		const amount = Number(value);
		if (!Number.isFinite(amount)) continue;
		const key = statKey(name);
		bonuses.set(key, (bonuses.get(key) ?? 0) + amount);
	}
	return bonuses;
}

// Display name for a linked value: the link target, or an inline map's `name`.
export function linkedName(linked: Linked): string {
	return linked.link?.target ?? asText(linked.props.name);
}

// Markdown for a linked value: a real link when it resolves or was written as one, else plain text.
export function linkMarkdown(linked: Linked | null): string {
	if (!linked?.link) return '';
	return linked.file || linked.link.bracketed ? `[[${linked.link.text}]]` : linked.link.text;
}

// A bracketed link with no note behind it.
export function isMissing(linked: Linked | null): boolean {
	return !!linked?.link?.bracketed && !linked.file;
}

export function formatBonuses(bonuses: Map<string, number>): string {
	return [...bonuses]
		.map(([key, amount]) => `${amount < 0 ? amount : `+${amount}`} ${bonusLabel(key)}`)
		.join(', ');
}
