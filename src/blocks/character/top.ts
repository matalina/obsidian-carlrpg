import { formatSize } from '../../rules/size';
import { setTooltip } from 'obsidian';
import { formatBonuses, isMissing, linkMarkdown } from '../../rules/items';
import { formatMod, statMod } from '../../rules/stats';
import { describeArea, noteName, readPair, RenderMarkdown, renderHealth } from '../shared';
import { asText, titleCase } from '../yaml';
import { attackPlans, DEFAULT_HEALTH_SLOTS, MAX_EXTERNAL_BUFFS, Sheet, withStatMods } from './model';
import { field, op, panel, table, text } from './ui';

// Page 1: identity and health across the top, stats in three columns, then evade/DR/mana,
// debuffs and buffs beside the portrait.
export function renderTop(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const main = root.createDiv({ cls: 'carl-sheet-top' });
	renderIdentity(main, sheet, md);

	const hp = readPair(sheet.data, 'hp', ['slots', 'current']);
	renderHealth(main, hp.slots ?? DEFAULT_HEALTH_SLOTS, hp.current, sheet.mod('con'), true);

	const statGrid = main.createDiv({ cls: 'carl-stat-grid' });
	renderStatGrid(statGrid, sheet);
	renderMovement(statGrid, sheet, md);

	const mid = main.createDiv({ cls: 'carl-sheet-mid' });
	renderDefenses(mid.createDiv({ cls: 'carl-defense-col' }), sheet, md);
	renderPortrait(mid.createDiv({ cls: 'carl-portrait-col' }), sheet, md);
}

// Each box: name, [enhanced] / [unenhanced], then the mod underneath.
function renderStatGrid(grid: HTMLElement, sheet: Sheet) {
	for (const stat of sheet.stats) {
		const box = grid.createDiv({ cls: 'carl-stat-box' });
		box.createDiv({ cls: 'carl-stat-name', text: titleCase(stat.name) });

		const scores = box.createDiv({ cls: 'carl-stat-scores' });
		const enhanced = scores.createDiv({ cls: 'carl-field' });
		const value = enhanced.createDiv({
			cls: stat.enhanced === stat.base ? 'carl-field-value' : 'carl-field-value is-enhanced',
			text: String(stat.enhanced),
		});
		if (stat.sources.length > 1) setTooltip(value, stat.sources.join('\n'));
		enhanced.createDiv({ cls: 'carl-field-label', text: 'Enhanced' });
		scores.createDiv({ cls: 'carl-slash', text: '/' });
		const base = scores.createDiv({ cls: 'carl-field' });
		const baseValue = base.createDiv({
			cls: stat.baseSources.length > 1 ? 'carl-field-value is-natural' : 'carl-field-value',
			text: String(stat.base),
		});
		if (stat.baseSources.length > 1) setTooltip(baseValue, stat.baseSources.join('\n'));
		base.createDiv({ cls: 'carl-field-label', text: 'Unenhanced' });

		const mod = box.createDiv({ cls: 'carl-stat-mod' });
		mod.createDiv({ cls: 'carl-field-label', text: `${stat.key.toUpperCase()} mod` });
		mod.createDiv({ cls: 'carl-field-value', text: formatMod(statMod(stat.enhanced)) });
	}
}

// Fills the slot after Charisma: Move | Step / AI favor | Size.
function renderMovement(grid: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const d = sheet.data;
	const box = grid.createDiv({ cls: 'carl-stat-box carl-movement' });
	field(box, 'Move', asText(d.move), md);
	field(box, 'Step', asText(d.step), md);
	field(box, 'AI favor', asText(d.favor), md);
	field(box, 'Size', formatSize(d.size), md);
}

function renderIdentity(main: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const d = sheet.data;
	const grid = main.createDiv({ cls: 'carl-identity' });
	const inline = { inline: true };
	// Name | Crawler number / Race | Class | Gender/Pronouns / Level | Floor
	const nameRow = grid.createDiv({ cls: 'carl-identity-row' });
	field(nameRow, 'Name', asText(d.name) || noteName(sheet.sourcePath), md, { ...inline, cls: 'carl-wide' });
	field(nameRow, 'Crawler number', asText(d.crawler), md, inline);
	const whoRow = grid.createDiv({ cls: 'carl-identity-row' });
	field(whoRow, 'Race', linkMarkdown(sheet.race), md, inline);
	field(whoRow, 'Class', linkMarkdown(sheet.class), md, inline);
	field(whoRow, 'Gender/Pronouns', asText(d.pronouns), md, inline);
	const levelRow = grid.createDiv({ cls: 'carl-identity-row' });
	field(levelRow, 'Level', asText(d.level), md, inline);
	field(levelRow, 'Floor', asText(d.floor), md, inline);
}

// "EVADE d20 + [DEX mod] + [Buffs] = [Evade total]", the DR row with mana beside it, then debuffs and buffs.
function renderDefenses(col: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const d = sheet.data;

	const evade = col.createDiv({ cls: 'carl-formula' });
	evade.createDiv({ cls: 'carl-formula-name', text: 'Evade' });
	evade.createDiv({ cls: 'carl-op carl-d20', text: 'd20' });
	op(evade, '+');
	field(evade, 'DEX mod', formatMod(sheet.evade.dex), md);
	op(evade, '+');
	field(evade, 'Buffs', formatMod(sheet.evade.buffs), md);
	op(evade, '=');
	field(evade, 'Evade total', `d20${formatMod(sheet.evade.total)}`, md, { cls: 'is-total' });

	const dr = col.createDiv({ cls: 'carl-formula' });
	dr.createDiv({ cls: 'carl-formula-name', text: 'Damage resistance' });
	field(dr, 'Armor', String(sheet.dr.armor), md);
	op(dr, '+');
	field(dr, 'Buffs', String(sheet.dr.buffs), md);
	op(dr, '=');
	field(dr, 'DR total', String(sheet.dr.total), md, { cls: 'is-total' });

	const mana = readPair(d, 'mana', ['max', 'current']);
	const manaText = mana.max == null ? '' : `${asText(mana.max)} / ${asText(mana.current ?? mana.max)}`;
	field(dr, 'Max mana / current', manaText, md, { cls: 'carl-mana' });

	// Debuffs and external buffs side by side under the formulas.
	const status = col.createDiv({ cls: 'carl-status' });
	const debuffs = status.createDiv({ cls: 'carl-debuffs' });
	debuffs.createDiv({ cls: 'carl-field-label', text: 'Debuffs' });
	md(text(d.debuffs), debuffs.createDiv({ cls: 'carl-field-value' }));
	renderBuffs(status, sheet, md);
}

function renderPortrait(col: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const portrait = col.createDiv({ cls: 'carl-portrait' });
	const image = asText(sheet.data.portrait).replace(/^!?\[\[(.+)\]\]$/, '$1');
	if (image) md(`![[${image}]]`, portrait);
	else portrait.createDiv({ cls: 'carl-placeholder', text: 'Portrait' });
}

function renderBuffs(parent: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const buffs = parent.createDiv({ cls: 'carl-buffs' });
	buffs.createDiv({ cls: 'carl-field-label', text: `External buffs (max ${MAX_EXTERNAL_BUFFS})` });
	const count = Math.max(MAX_EXTERNAL_BUFFS, sheet.buffs.length);
	for (let i = 0; i < count; i++) {
		const buff = sheet.buffs[i];
		const row = buffs.createDiv({ cls: i >= MAX_EXTERNAL_BUFFS ? 'carl-buff is-ignored' : 'carl-buff' });
		row.createSpan({ cls: 'carl-buff-num', text: `${i + 1}.` });
		const body = row.createDiv({ cls: 'carl-field-value' });
		if (!buff) continue;
		md(linkMarkdown(buff), body.createSpan());
		const bonuses = isMissing(buff) ? 'No note found' : formatBonuses(buff.bonuses);
		if (bonuses) body.createSpan({ cls: 'carl-muted', text: ` ${bonuses}` });
		if (i >= MAX_EXTERNAL_BUFFS) setTooltip(row, `Only the first ${MAX_EXTERNAL_BUFFS} external buffs count`);
	}
}

/**
 * Attacks table: Name | To hit | Damage | Effects. Covers the `attacks` entries and attack skills and
 * spells, with always-on passives folded in (Iron Punch on Pugilism) and optional ones listed.
 */
export function renderAttackTable(root: HTMLElement, sheet: Sheet, md: RenderMarkdown) {
	const plans = attackPlans(sheet);
	if (!plans.length) return;

	const body = table(panel(root, 'Attacks'), ['Name', 'To hit', 'Damage', 'Effects'], 'carl-attack-table');
	for (const plan of plans) {
		const row = body.createEl('tr');
		md(plan.markdown, row.createEl('th'));

		const toHit = row.createEl('td');
		if (plan.toHitText) toHit.setText(plan.toHitText);
		else if (plan.parts.length) {
			const total = plan.parts.reduce((sum, [, v]) => sum + v, 0);
			toHit.createDiv({ cls: 'carl-total', text: formatMod(total) });
			toHit.createDiv({
				cls: 'carl-muted',
				text: plan.parts.map(([label, v]) => `${label} ${formatMod(v)}`).join(' · '),
			});
		}

		const damage = row.createEl('td');
		if (plan.damage) {
			const bonus = plan.bonusDice.length ? ` + ${plan.bonusDice.join(' + ')}` : '';
			damage.createDiv({ cls: 'carl-total', text: withStatMods(plan.damage, sheet.statMods) + bonus });
		}

		const info = plan.line?.info;
		const effects = [
			describeArea(plan.area).join(', '),
			plan.limit && `(${plan.limit})`,
			plan.effect,
			info && !plan.line?.spell && info.aiFavor && `AI favor ${info.aiFavor}`,
			plan.line?.spell && info?.manaCost != null && `${info.manaCost} MP`,
			...plan.applied.map((p) => `+ ${p.line.markdown}`),
			...plan.optional.map((p) => `${p.line.markdown} (optional)`),
			plan.disadvantage && 'Disadvantage',
		].filter(Boolean);
		md(effects.join(' · '), row.createEl('td'));
	}
}
