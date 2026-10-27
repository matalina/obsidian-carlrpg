import { formatSize, sizeValue } from '../../rules/size';
import { isMissing, Linked, linkMarkdown } from '../../rules/items';
import { collectStats, formatMod, statMod } from '../../rules/stats';
import { readPair, RenderMarkdown, renderAttacks, renderHealth, renderNotes } from '../shared';
import { asText, titleCase } from '../yaml';
import { Sheet } from './model';
import { panel, rows, text } from './ui';

// Pages 5–6 of the sheet, as cards that flow into columns: pet, mount, kills, clubs,
// personal space, deity, racial/class abilities, sponsors. Empty cards are left out.
export function renderPanels(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const grid = root.createDiv({ cls: 'carl-panels' });
	const d = sheet.data;

	if (sheet.pet) renderPet(panel(grid, 'Pet'), sheet.pet, md);
	if (sheet.mount) renderMount(panel(grid, 'Mount / vehicle'), sheet.mount, md);
	listPanel(grid, "Important things I've killed", d.kills, md);
	listPanel(grid, 'Clubs, societies, guilds, etc', d.clubs, md);
	renderPersonalSpace(grid, d, md);
	if (sheet.deity) renderLinkedText(panel(grid, 'Deity'), sheet.deity, md);
	listPanel(grid, 'Racial abilities', [...asList(sheet.race?.props.abilities), ...asList(d['racial-abilities'])], md);
	listPanel(grid, 'Class abilities', [...asList(sheet.class?.props.abilities), ...asList(d['class-abilities'])], md);
	for (const sponsor of sheet.sponsors) renderLinkedText(panel(grid, 'Sponsor'), sponsor, md);

	if (!grid.childElementCount) grid.remove();
}

function listPanel(grid: HTMLElement, title: string, list: unknown, md: RenderMarkdown) {
	const body = panel(grid, title);
	if (!rows(body, list, md)) body.parentElement?.remove();
}

function asList(value: unknown): unknown[] {
	if (value == null) return [];
	return Array.isArray(value) ? value : [value];
}

function renderPersonalSpace(grid: HTMLElement, d: Record<string, unknown>, md: RenderMarkdown) {
	const tier = asText(d['space-tier']);
	const size = asText(d['space-size']);
	if (!tier && !size && d.amenities == null) return;

	const body = panel(grid, 'Personal space');
	const facts = body.createDiv({ cls: 'carl-rows' });
	if (tier) md(`**Tier:** ${tier}`, facts.createDiv({ cls: 'carl-row' }));
	if (size) md(`**Size:** ${size}`, facts.createDiv({ cls: 'carl-row' }));
	if (d.amenities != null) {
		body.createDiv({ cls: 'carl-subhead', text: 'Amenities' });
		rows(body, d.amenities, md);
	}
}

// A link (or plain name) with the linked note's `description`, e.g. a deity or sponsor.
function renderLinkedText(body: HTMLElement, linked: Linked, md: RenderMarkdown) {
	const name = linkMarkdown(linked) || asText(linked.props.name);
	if (name) md(`**${name}**${isMissing(linked) ? ' (no note found)' : ''}`, body.createDiv());
	const description = text(linked.props.description);
	if (description) md(description, body.createDiv({ cls: 'carl-panel-text' }));
}

// Same properties as a creature note: hp-slots/hp-current, stats, level, dr, evade, move, size, attacks.
function renderPet(body: HTMLElement, pet: Linked, md: RenderMarkdown) {
	const p = pet.props;
	companionName(body, pet, md);
	const stats = collectStats(p);
	const con = stats.find((s) => s.key === 'con');
	const hp = readPair(p, 'hp', ['slots', 'current']);
	renderHealth(body, hp.slots, hp.current, con ? statMod(con.value) : null, true);

	const grid = body.createDiv({ cls: 'carl-companion-stats' });
	const left = grid.createDiv();
	for (const stat of stats) {
		pair(left, titleCase(stat.name), Number.isFinite(stat.value) ? `${stat.raw} (${formatMod(statMod(stat.value))})` : stat.raw);
	}
	const right = grid.createDiv();
	for (const [key, label] of [['level', 'Level'], ['dr', 'DR'], ['evade', 'Evade'], ['move', 'Move'], ['size', 'Size']]) {
		pair(right, label!, key === 'size' ? formatSize(p.size) : titleCase(asText(p[key!])));
	}

	renderAttacks(body, p.attacks, md);
	const special = text(p.special);
	if (special) md(`**Special:** ${special}`, body.createDiv({ cls: 'carl-section' }));
	renderNotes(body, p.traits, md);
}

// hp-slots/hp-current, size, occupants, move, dr, accessories.
function renderMount(body: HTMLElement, mount: Linked, md: RenderMarkdown) {
	const p = mount.props;
	companionName(body, mount, md);
	// Vehicles have no CON: each health slot is worth the size value (1–8).
	// A living mount with a `constitution` uses its CON mod like any creature.
	const hp = readPair(p, 'hp', ['slots', 'current']);
	const con = collectStats(p).find((s) => s.key === 'con');
	const slotValue = con && Number.isFinite(con.value) ? statMod(con.value) : sizeValue(p.size);
	renderHealth(body, hp.slots, hp.current, slotValue, true);

	const grid = body.createDiv({ cls: 'carl-companion-stats' });
	const left = grid.createDiv();
	pair(left, 'Size', formatSize(p.size));
	pair(left, 'Occupants', asText(p.occupants));
	const right = grid.createDiv();
	pair(right, 'Move', asText(p.move));
	pair(right, 'DR', asText(p.dr));

	if (p.accessories != null) {
		body.createDiv({ cls: 'carl-subhead', text: 'Accessories' });
		rows(body, p.accessories, md);
	}
}

function companionName(body: HTMLElement, linked: Linked, md: RenderMarkdown) {
	const name = linkMarkdown(linked) || asText(linked.props.name);
	if (!name) return;
	md(`**${name}**${isMissing(linked) ? ' (no note found)' : ''}`, body.createDiv({ cls: 'carl-companion-name' }));
}

function pair(parent: HTMLElement, label: string, value: string) {
	const row = parent.createDiv({ cls: 'carl-pair' });
	row.createDiv({ cls: 'carl-pair-label', text: label });
	row.createDiv({ cls: 'carl-field-value', text: value });
}
