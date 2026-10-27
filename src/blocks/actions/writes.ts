import { App, parseYaml, stringifyYaml, TFile } from 'obsidian';
import { parseLink } from '../../rules/items';
import { skillKey } from '../../rules/skills';
import { asText, isRecord } from '../yaml';

// Edits to a sheet's properties made from the actions widget. Each keeps the shape the author
// used (flat `hp-current` or nested `hp: { current }`, list or map skills, …).

type Frontmatter = Record<string, unknown>;

export async function setPairValue(app: App, file: TFile, name: string, part: string, value: number) {
	await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
		const nested = fm[name];
		if (isRecord(nested)) nested[part] = value;
		else if (Array.isArray(nested)) {
			const entry = nested.find((e) => isRecord(e) && part in e) as Frontmatter | undefined;
			if (entry) entry[part] = value;
			else nested.push({ [part]: value });
		} else fm[`${name}-${part}`] = value;
	});
}

export async function addDebuff(app: App, file: TFile, debuff: string) {
	await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
		const list = Array.isArray(fm.debuffs) ? fm.debuffs : fm.debuffs == null ? [] : [fm.debuffs];
		list.push(debuff);
		fm.debuffs = list;
	});
}

export async function removeDebuff(app: App, file: TFile, index: number) {
	await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
		const list = Array.isArray(fm.debuffs) ? fm.debuffs : fm.debuffs == null ? [] : [fm.debuffs];
		list.splice(index, 1);
		fm.debuffs = list;
	});
}

// Marks a skill as used (✔). A skill only granted by race/class is added to the character's list.
// `list` is "skills" or "spells".
export async function checkSkill(app: App, file: TFile, name: string, list: 'skills' | 'spells' = 'skills') {
	await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
		const key = skillKey(parseLink(name)?.target ?? name);
		const skills = fm[list];
		if (isRecord(skills)) {
			const found = Object.keys(skills).find((k) => sameSkill(k, key)) ?? name;
			skills[found] = withChecked(skills[found]);
			return;
		}
		const entries = Array.isArray(skills) ? skills : [];
		for (const entry of entries) {
			if (!isRecord(entry)) continue;
			const found = Object.keys(entry).find((k) => sameSkill(k, key));
			if (found) {
				entry[found] = withChecked(entry[found]);
				return;
			}
		}
		entries.push({ [name]: { checked: true } });
		fm[list] = entries;
	});
}

// "[[Iron Punch]]" and "Iron Punch" are the same skill.
function sameSkill(entryKey: string, key: string): boolean {
	return skillKey(parseLink(entryKey)?.target ?? entryKey) === key;
}

function withChecked(details: unknown): unknown {
	if (isRecord(details)) return { ...details, checked: true };
	if (Array.isArray(details)) {
		const kept: unknown[] = details.filter((d) => !(isRecord(d) && 'checked' in d));
		return [...kept, { checked: true }];
	}
	return details == null ? { checked: true } : { rank: details, checked: true };
}

/**
 * Uses a hotlist entry: takes one from the matching inventory item's quantity. When that reaches 0
 * the item stays in the inventory at 0 and leaves the hotlist. Returns the quantity left, or null
 * when the inventory has no counted entry for it.
 */
export async function useHotlistItem(app: App, file: TFile, hotlistIndex: number): Promise<number | null> {
	let left: number | null = null;
	await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
		const hotlist = Array.isArray(fm.hotlist) ? fm.hotlist : [];
		const name = entryName(hotlist[hotlistIndex]);
		if (!name || !Array.isArray(fm.inventory)) return;

		for (const entry of fm.inventory as unknown[]) {
			if (!isRecord(entry)) continue;
			if ('item' in entry && entryName(entry.item) === name) {
				left = decrement(entry, 'quantity');
				break;
			}
			const key = Object.keys(entry).find((k) => entryName(k) === name);
			if (key == null) continue;
			const value = entry[key];
			left = isRecord(value) ? decrement(value, 'quantity') : decrement(entry, key);
			break;
		}
		if (left === 0) hotlist.splice(hotlistIndex, 1);
	});
	return left;
}

function decrement(record: Frontmatter, key: string): number | null {
	const current = Number(record[key]);
	if (!Number.isFinite(current)) return null;
	record[key] = Math.max(0, current - 1);
	return record[key] as number;
}

/** Comparable name for "[[Rope|rope]]", "Rope", or an unquoted [[Rope]]. */
export function entryName(value: unknown): string {
	if (isRecord(value)) value = Object.keys(value)[0];
	return parseLink(value)?.target.toLowerCase() ?? asText(value).toLowerCase();
}

// Appends a line under a "## Roll log" heading at the end of the page, adding the heading once.
export async function appendLog(app: App, page: TFile, line: string) {
	await app.vault.process(page, (content) => {
		const trimmed = content.replace(/\s+$/, '');
		const hasLog = /^## Roll log\s*$/m.test(content);
		return `${trimmed}\n${hasLog ? '' : '\n## Roll log\n\n'}- ${line}\n`;
	});
}

// Encounter state for mobs and NPCs lives in the widget's own YAML, so each block on a page keeps
// its own fight and the mobs' notes are never changed:
//
//   ```carl-actions
//   opponents: ["[[Bad Llama]]", "[[Bad Llama]]"]
//   encounter:
//     Bad Llama: { hp: 2, debuffs: [Burning] }
//   ```

export function readEncounter(data: Record<string, unknown>, key: string): Frontmatter {
	const entry = isRecord(data.encounter) ? data.encounter[key] : null;
	return isRecord(entry) ? entry : {};
}

/** Where a block is: its lines when Obsidian knows them, and its source text as a fallback. */
export interface BlockLocation {
	lines: { start: number; end: number } | null;
	source: string;
	language: string;
}

/**
 * Rewrites a code block's YAML. Finds the block by its fence lines (checking they still hold this
 * block), falling back to matching its source text.
 */
export async function updateBlockData(app: App, page: TFile, where: BlockLocation, edit: (data: Frontmatter) => void) {
	await app.vault.process(page, (content) => {
		const lines = content.split('\n');
		let start = -1;
		let end = -1;
		if (where.lines && lines[where.lines.start]?.trim().startsWith('```' + where.language)) {
			start = where.lines.start;
			end = where.lines.end;
		} else {
			const fence = '```' + where.language + '\n';
			const at = content.indexOf(fence + where.source);
			if (at === -1) return content;
			start = content.slice(0, at).split('\n').length - 1;
			end = start + where.source.replace(/\n$/, '').split('\n').length + 1;
		}
		const body = lines.slice(start + 1, end).join('\n');
		const parsed: unknown = body.trim() ? parseYaml(body) : {};
		const data: Frontmatter = isRecord(parsed) ? parsed : {};
		edit(data);
		const yaml = stringifyYaml(data).replace(/\n$/, '');
		return [...lines.slice(0, start + 1), yaml, ...lines.slice(end)].join('\n');
	});
}

/** Edits one combatant's encounter entry; `null` removes it (a reset). */
export function encounterEdit(key: string, edit: ((entry: Frontmatter) => void) | null) {
	return (data: Frontmatter) => {
		const encounter: Frontmatter = isRecord(data.encounter) ? data.encounter : {};
		if (edit) {
			const entry: Frontmatter = isRecord(encounter[key]) ? encounter[key] : {};
			edit(entry);
			encounter[key] = entry;
		} else {
			delete encounter[key];
		}
		if (Object.keys(encounter).length) data.encounter = encounter;
		else delete data.encounter;
	};
}
