import { App, MarkdownPostProcessorContext, Notice, TFile } from 'obsidian';
import { degreeOf, Degree, FormulaVars, isSuccess, resolveNumber, rollD20, rollFormula, RollMode } from '../../rules/dice';
import { NoteLink, parseLinks } from '../../rules/items';
import { sizeValue } from '../../rules/size';
import { CheckKind, difficulty } from '../../rules/skillnotes';
import { collectStats, formatMod, statKey, statMod } from '../../rules/stats';
import { applyPassive, AttackPlan, attackPlans, buildSheet, DEFAULT_HEALTH_SLOTS, Sheet, SkillLine } from '../character/model';
import { listEntries } from '../character/ui';
import { LiveBlock, readPair, RenderMarkdown } from '../shared';
import { asText, isRecord, titleCase, toEntries, toRecord } from '../yaml';
import {
	addDebuff,
	appendLog,
	BlockLocation,
	encounterEdit,
	readEncounter,
	updateBlockData,
	checkSkill,
	entryName,
	removeDebuff,
	setPairValue,
	useHotlistItem,
} from './writes';

export const ACTIONS_BLOCK = 'carl-actions';

// Kept per page so a re-render (after a roll is logged or the sheet changes) doesn't lose them.
const targets = new Map<string, string>();
const rollModes = new Map<string, RollMode>();
/** Optional passives switched on, keyed "page|attack|passive". */
const toggles = new Set<string>();

export function renderActionsBlock(app: App, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	ctx.addChild(new ActionsBlock(app, ACTIONS_BLOCK, source, el, ctx));
}

/**
 * A play panel for a party of crawlers and their opponents, for session notes: roll stats, Evade,
 * skills, spells and attacks with Degrees of Success, set health and mana, add and clear debuffs, and
 * use hotlist items. Crawlers are stacked on the left, opponents on the right. Each crawler picks its
 * own target; each mob attack has an Evade button per crawler. A crawler note among the opponents gets
 * a full crawler panel and targets the party (PvP). Crawler changes are written to their notes; mob
 * health and debuffs, and the targets, are saved in this block's YAML; rolls are appended to this page
 * under "## Roll log".
 *
 * Difficulty is worked out from the rules unless a target number is typed in: stat checks 10 + F,
 * unopposed 10 + 2F, opposed 10 + the target's stat mod + F, attacks against its Evade. A crawler's
 * Evade is a roll, so an attack on one rolls their Evade (d20 + DEX mod + buffs) as the target.
 *
 *   party:                         # or `sheet:` for one; defaults to this page
 *     - "[[Carl]]"
 *     - "[[Donut]]"
 *   opponents:                     # name: note — names keep two of the same mob apart
 *     Llama A: "[[Bad Llama]]"
 *     Llama B: "[[Bad Llama]]"
 *     Frank: "[[Frank Q]]"          # a crawler: PvP
 *   targets:                       # saved when you pick a target; defaults to the first on the other side
 *     Carl: Llama A
 *     Frank: Carl
 *   floor: 3                       # F; defaults to this page's or the first crawler's `floor`
 *
 * Plain lists of links work for both; repeats are named "Bad Llama 2", "Bad Llama 3"…
 */
class ActionsBlock extends LiveBlock {
	constructor(app: App, blockName: string, source: string, el: HTMLElement, private postCtx: MarkdownPostProcessorContext) {
		super(app, blockName, source, el, postCtx.sourcePath);
	}

	/** Where this block sits in the page, for saving encounter state into its YAML. */
	private location(): BlockLocation {
		const info = this.postCtx.getSectionInfo(this.containerEl);
		return {
			lines: info ? { start: info.lineStart, end: info.lineEnd } : null,
			source: this.source,
			language: ACTIONS_BLOCK,
		};
	}

	protected renderData(data: Record<string, unknown>, md: RenderMarkdown) {
		const { app, sourcePath } = this;
		const page = fileAt(app, sourcePath);
		if (!page) return;
		const save = (edit: (d: Record<string, unknown>) => void) => updateBlockData(app, page, this.location(), edit);

		// The party: `party`, or `sheet` for one crawler, or this page itself. Names are unique across both sides.
		const used = new Set<string>();
		const partyValue = data.party ?? data.sheet;
		const party: Combatant[] =
			partyValue == null
				? [{ key: page.basename, link: { text: page.basename, target: page.basename, bracketed: true }, file: page }]
				: readOpponents(app, partyValue, sourcePath, used);
		used.add(page.basename);
		const combatants = readOpponents(app, data.opponents ?? data.opponent, sourcePath, used);
		const everyone = [...party, ...combatants];
		this.watch(
			everyone.flatMap((c) => (c.file ? [c.file.path] : [])),
			everyone.some((c) => !c.file),
		);
		if (!party.length) {
			this.containerEl.createDiv({ cls: 'carl-block carl-error', text: `${ACTIONS_BLOCK}: set \`party:\` to crawler notes.` });
			return;
		}

		const propsOf = (c: Combatant) => {
			const props: unknown = c.file ? app.metadataCache.getFileCache(c.file)?.frontmatter : null;
			return isRecord(props) ? props : null;
		};
		const firstProps = propsOf(party[0]!);
		const pageFloor: unknown = app.metadataCache.getFileCache(page)?.frontmatter?.floor;
		const floor = num(data.floor) ?? num(pageFloor) ?? num(firstProps?.floor);
		const savedTargets = isRecord(data.targets) ? data.targets : {};

		// Everyone with a full panel: the party, and crawlers among the opponents. Each targets the other side.
		const presentParty = party.filter((c) => c.file);
		const presentFoes = combatants.filter((c) => c.file);
		const fighters = new Map<string, Fighter>();
		const addFighter = (member: Combatant, foes: Combatant[], legacyTarget: unknown) => {
			const props = propsOf(member);
			if (!member.file || !props) return;
			const sheet = buildSheet(app, props, member.file.path);
			const saved = asText(savedTargets[member.key] ?? legacyTarget);
			fighters.set(member.key, {
				member,
				file: member.file,
				props,
				sheet,
				name: asText(props.name) || member.key,
				isCrawler: isCrawlerSheet(props),
				foes,
				target: foes.find((c) => c.key === saved)?.key ?? foes[0]?.key,
			});
		};
		for (const member of party) addFighter(member, presentFoes, data.target);
		for (const member of combatants) {
			const props = propsOf(member);
			if (props && isCrawlerSheet(props)) addFighter(member, presentParty, null);
		}
		const targetedBy = new Map<string, string[]>();
		for (const f of fighters.values()) {
			if (f.target) targetedBy.set(f.target, [...(targetedBy.get(f.target) ?? []), f.name]);
		}

		// What a fighter is up against: a crawler's enhanced mods and rolled Evade, or a mob's statblock.
		const opponentFor = (key: string | undefined): Opponent | null => {
			const fighter = key ? fighters.get(key) : undefined;
			if (fighter?.isCrawler) {
				const { sheet, name } = fighter;
				return {
					name,
					mods: sheet.statMods,
					evade: null,
					rollEvade: () => {
						const { natural, shown } = rollD20('normal');
						const parts = modText([['DEX', sheet.evade.dex], ['buffs', sheet.evade.buffs]]);
						const total = natural + sheet.evade.total;
						return { total, text: `${name}'s Evade ${shown} ${parts} = ${total}` };
					},
				};
			}
			const target = everyone.find((c) => c.key === key);
			return readOpponent(app, target?.file?.path, floor, key ?? '');
		};

		const root = this.containerEl.createDiv({ cls: 'carl-block carl-actions' });
		renderHeader(root, floor, sourcePath, () => this.rerender());

		const context = (name: string, sheetFile: TFile, vars: FormulaVars, opponent: Opponent | null): RollContext => {
			const typed = num(targets.get(sourcePath));
			return {
				app,
				page,
				name,
				vars,
				target: (kind, opposedBy) => {
					if (typed != null) return typed;
					if (kind === 'attack') return opponent?.evade ?? null;
					const oppMod = opponent && opposedBy ? (opponent.mods[opposedBy] ?? 0) : null;
					return difficulty(kind, floor, oppMod);
				},
				defender: typed == null && opponent?.rollEvade ? { name: opponent.name, roll: opponent.rollEvade } : null,
				show: (text) => {
					showRoll(md, name, text);
					void appendLog(app, page, `${window.moment().format('HH:mm')} · ${name} · ${text}`);
				},
				mode: rollModes.get(sourcePath) ?? 'normal',
				sourcePath,
				file: sheetFile,
				rerender: () => this.rerender(),
			};
		};

		const grid = root.createDiv({ cls: 'carl-actions-grid' });
		const partyCol = grid.createDiv({ cls: 'carl-party' });
		/** Each party crawler's Evade, for the Evade buttons on mob attacks. */
		const evaders: Evader[] = [];
		const missing = (panel: HTMLElement, c: Combatant) =>
			panel.createDiv({ cls: 'carl-error', text: `${c.key}: no note found for [[${c.link.target}]].` });

		const renderFighter = (panel: HTMLElement, f: Fighter) => {
			const { file, props, sheet, name, isCrawler } = f;
			const opponent = opponentFor(f.target);
			const ctx = context(name, file, { F: floor, S: sizeValue(props.size), stats: sheet.statMods }, opponent);

			const head = panel.createDiv({ cls: 'carl-opponent-head' });
			md(`**[[${file.basename}${name !== file.basename ? `|${name}` : ''}]]**`, head.createDiv({ cls: 'carl-name' }));
			const by = targetedBy.get(f.member.key) ?? [];
			if (by.length) panel.addClass('is-target');
			for (const attacker of by) head.createSpan({ cls: 'carl-target-badge', text: attacker });
			if (f.foes.length) {
				renderTargetPicker(panel, f.foes, f.target, (key) => void save((d) => setTarget(d, f.member.key, key)));
			}
			// A crawler's slots are worth their enhanced CON mod (gear and buffs included).
			const tracker = isCrawler
				? noteTracker(app, file, props, true, sheet.mod('con'))
				: encounterTracker(data, f.member.key, props, save);
			renderHealth(panel, tracker);
			renderMana(panel, app, file, props);
			renderDebuffs(panel, tracker, md);
			renderChecks(panel, ctx, sheet, props, isCrawler);
			const plans = attackPlans(sheet);
			renderSkills(panel, ctx, sheet.skills, file, sheet, 'skills', plans);
			renderSkills(panel, ctx, sheet.spells, file, sheet, 'spells', plans);
			renderAttacks(panel, ctx, sheet, props, plans);
			renderHotlist(panel, app, file, props, ctx, md);
			return ctx;
		};

		for (const member of party) {
			const panel = partyCol.createDiv({ cls: 'carl-actions-panel' });
			const fighter = fighters.get(member.key);
			if (!fighter) {
				missing(panel, member);
				continue;
			}
			const ctx = renderFighter(panel, fighter);
			if (fighter.isCrawler) {
				const { sheet } = fighter;
				evaders.push({
					name: fighter.name,
					roll: (label, target) =>
						rollCheck(ctx, `Evade vs ${label}`, [['DEX', sheet.evade.dex], ['buffs', sheet.evade.buffs]], target),
				});
			}
		}

		const opponentsCol = combatants.length ? grid.createDiv({ cls: 'carl-opponents' }) : null;
		for (const member of combatants) {
			const panel = opponentsCol!.createDiv({ cls: 'carl-actions-panel carl-opponent' });
			const fighter = fighters.get(member.key);
			if (fighter) {
				renderFighter(panel, fighter);
				continue;
			}
			const oppProps = propsOf(member);
			if (!member.file || !oppProps) {
				missing(panel, member);
				continue;
			}
			const oppCtx = context(member.key, member.file, { F: floor, S: sizeValue(oppProps.size) }, null);
			const tracker = encounterTracker(data, member.key, oppProps, save);
			renderOpponent(panel, oppCtx, oppProps, md, targetedBy.get(member.key) ?? [], evaders, tracker, member.key);
		}
	}
}

/** Someone with a full panel: a party member, or a crawler among the opponents. */
interface Fighter {
	member: Combatant;
	file: TFile;
	props: Record<string, unknown>;
	sheet: Sheet;
	name: string;
	isCrawler: boolean;
	/** The other side, who this fighter can target. */
	foes: Combatant[];
	target: string | undefined;
}

interface Evader {
	name: string;
	roll: (label: string, target: number | null) => void;
}

// Saves a fighter's target in `targets`; a single-crawler block's old `target:` is folded in.
function setTarget(data: Record<string, unknown>, crawler: string, opponent: string) {
	const saved: Record<string, unknown> = isRecord(data.targets) ? data.targets : {};
	saved[crawler] = opponent;
	data.targets = saved;
	delete data.target;
}

// "Target: [Llama A] [Llama B]" — one button per opponent, the current one highlighted.
function renderTargetPicker(panel: HTMLElement, opponents: Combatant[], current: string | undefined, pick: (key: string) => void) {
	const row = panel.createDiv({ cls: 'carl-target-picker' });
	row.createSpan({ cls: 'carl-field-label', text: 'Target' });
	for (const { key } of opponents) {
		button(row, key, () => pick(key), key === current ? 'is-active' : '');
	}
}

/**
 * An opponent's panel: name with a badge for each crawler targeting it, health and debuffs for this
 * encounter (Reset starts them over), its key numbers, and its attacks — each with an Evade button per
 * crawler and a Damage roll. Nothing here writes to the mob's note.
 */
function renderOpponent(
	panel: HTMLElement,
	ctx: RollContext,
	props: Record<string, unknown>,
	md: RenderMarkdown,
	targetedBy: string[],
	evaders: Evader[],
	tracker: Tracker,
	key: string,
) {
	if (targetedBy.length) panel.addClass('is-target');
	const head = panel.createDiv({ cls: 'carl-opponent-head' });
	md(`**[[${ctx.file.basename}${key !== ctx.file.basename ? `|${key}` : ''}]]**`, head.createDiv({ cls: 'carl-name' }));
	for (const name of targetedBy) head.createSpan({ cls: 'carl-target-badge', text: name });
	if (tracker.reset) button(head, 'Reset', () => void tracker.reset?.(), 'carl-reset');

	renderHealth(panel, tracker);
	renderDebuffs(panel, tracker, md);

	const evadeTarget = props.evade == null ? null : resolveNumber(asText(props.evade), ctx.vars);
	const stats = collectStats(props)
		.map((st) => `${titleCase(st.key)} ${formatMod(statMod(st.value))}`)
		.join(' · ');
	const facts = [
		props.level != null && `Level ${asText(props.level)}`,
		props.evade != null && `Evade ${asText(props.evade)}${evadeTarget != null ? ` = ${evadeTarget}` : ''}`,
		props.dr != null && `DR ${asText(props.dr)}`,
		stats,
	].filter(Boolean);
	if (facts.length) section(panel, 'Stats').createDiv({ cls: 'carl-muted', text: facts.join(' · ') });

	const attacks = toEntries(props.attacks);
	if (!attacks.length) return;
	const body = section(panel, 'Attacks');
	for (const [attackName, details] of attacks) {
		const f = toRecord(details);
		const title = titleCase(attackName);
		const row = body.createDiv({ cls: 'carl-attack-row' });
		row.createSpan({ cls: 'carl-total', text: title });
		const toHit = f['to-hit'] == null ? null : resolveNumber(asText(f['to-hit']), ctx.vars);
		if (f['to-hit'] != null) {
			row.createSpan({ cls: 'carl-muted', text: `to hit ${asText(f['to-hit'])}${toHit != null ? ` = ${toHit}` : ''}` });
		}
		// One Evade per crawler: whoever the attack is aimed at rolls.
		for (const evader of evaders) {
			const label = evaders.length > 1 ? `${evader.name} evades` : 'Evade';
			button(row, `${label}${toHit != null ? ` vs ${toHit}` : ''}`, () => evader.roll(title, toHit));
		}
		const damage = asText(f.damage);
		if (damage) button(row, `Damage ${damage}`, () => rollDamage(ctx, title, damage, []));
	}
}

interface RollContext {
	app: App;
	page: TFile;
	name: string;
	vars: FormulaVars;
	/** The typed target, else the rules' difficulty for this kind of check (null when unknown). */
	target: (kind: CheckKind | null, opposedBy?: string) => number | null;
	/** A crawler being attacked rolls Evade as the target, unless a target number is typed in. */
	defender: { name: string; roll: () => { total: number; text: string } } | null;
	/** Shows a roll in the widget and appends it to the page's roll log. */
	show: (text: string) => void;
	/** Advantage / Disadvantage chosen in the header for every roll. */
	mode: RollMode;
	sourcePath: string;
	file: TFile;
	rerender: () => void;
}

function renderHeader(root: HTMLElement, floor: number | null, sourcePath: string, rerender: () => void) {
	const header = root.createDiv({ cls: 'carl-actions-header' });
	header.createDiv({ cls: 'carl-muted', text: floor != null ? `Floor ${floor}` : 'No floor set' });

	const mode = header.createDiv({ cls: 'carl-target' });
	mode.createSpan({ cls: 'carl-field-label', text: 'Roll' });
	const modeSelect = mode.createEl('select', { cls: 'dropdown' });
	for (const [value, text] of [['normal', 'Normal'], ['advantage', 'Advantage'], ['disadvantage', 'Disadvantage']]) {
		modeSelect.createEl('option', { value: value!, text: text! });
	}
	modeSelect.value = rollModes.get(sourcePath) ?? 'normal';
	modeSelect.addEventListener('change', () => {
		rollModes.set(sourcePath, modeSelect.value as RollMode);
		rerender();
	});

	const target = header.createDiv({ cls: 'carl-target' });
	target.createSpan({ cls: 'carl-field-label', text: 'Target' });
	const input = target.createEl('input', { type: 'number', attr: { placeholder: 'Auto' } });
	input.value = targets.get(sourcePath) ?? '';
	input.addEventListener('change', () => {
		targets.set(sourcePath, input.value);
		rerender();
	});
}

// Click a slot to set current health to it; click the last remaining slot again to lose it.
function renderHealth(root: HTMLElement, tracker: Tracker) {
	const { total, current } = tracker.health;
	if (!Number.isInteger(total) || total < 1) return;

	const worth = tracker.slotValue == null ? '' : ` · ${tracker.slotValue} per slot (CON ${formatMod(tracker.slotValue)})`;
	const row = section(root, `Health ${current} / ${total}${worth}`);
	const bar = row.createDiv({ cls: 'carl-health is-wide carl-clickable' });
	for (let i = 0; i < total; i++) {
		const box = bar.createDiv({ cls: 'carl-slot' }).createDiv({
			cls: i < current ? 'carl-slot-box' : 'carl-slot-box is-lost',
			text: String(i + 1),
		});
		box.setCssProps({
			'--carl-slot-hue-from': String((120 * i) / total),
			'--carl-slot-hue-to': String((120 * (i + 1)) / total),
		});
		box.addEventListener('click', () => void tracker.setHealth(current === i + 1 ? i : i + 1));
	}
}

function renderMana(root: HTMLElement, app: App, file: TFile, props: Record<string, unknown>) {
	const mana = readPair(props, 'mana', ['max', 'current']);
	const max = num(mana.max);
	if (max == null) return;
	const current = num(mana.current) ?? max;

	const row = section(root, 'Mana').createDiv({ cls: 'carl-stepper' });
	const set = (value: number) => void setPairValue(app, file, 'mana', 'current', Math.max(0, Math.min(max, value)));
	button(row, '−', () => set(current - 1));
	row.createSpan({ cls: 'carl-total', text: `${current} / ${max}` });
	button(row, '+', () => set(current + 1));
	button(row, 'Full', () => set(max));
}

function renderDebuffs(root: HTMLElement, tracker: Tracker, md: RenderMarkdown) {
	const body = section(root, 'Debuffs');
	const chips = body.createDiv({ cls: 'carl-chips' });
	tracker.debuffs.forEach((name, i) => {
		const chip = chips.createDiv({ cls: 'carl-chip' });
		md(name, chip.createSpan());
		button(chip, '×', () => void tracker.removeDebuff(i), 'carl-chip-remove');
	});
	const add = body.createDiv({ cls: 'carl-add' });
	const input = add.createEl('input', { type: 'text', attr: { placeholder: 'Add a debuff' } });
	const submit = () => {
		const value = input.value.trim();
		if (value) void tracker.addDebuff(value);
	};
	input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
	button(add, 'Add', submit);
}

/**
 * Where a combatant's health and debuffs live. A crawler's are their own note's properties; a mob's
 * or NPC's are kept in the widget block's own YAML under `encounter:`, so the mob's note stays a clean
 * statblock, each encounter on a page tracks its own fight, and two of the same mob track separately.
 */
interface Tracker {
	health: { total: number; current: number };
	/** What one health slot is worth: the CON mod (null when there's no CON). */
	slotValue: number | null;
	debuffs: string[];
	setHealth: (value: number) => Promise<void>;
	addDebuff: (debuff: string) => Promise<void>;
	removeDebuff: (index: number) => Promise<void>;
	/** Mobs only: forget the encounter state and start fresh from the statblock. */
	reset?: () => Promise<void>;
}

function noteTracker(app: App, file: TFile, props: Record<string, unknown>, isCrawler: boolean, conMod: number | null): Tracker {
	const hp = readPair(props, 'hp', ['slots', 'current']);
	const total = Number(hp.slots ?? (isCrawler ? DEFAULT_HEALTH_SLOTS : null));
	return {
		health: { total, current: hp.current == null ? total : Number(hp.current) },
		slotValue: conMod,
		debuffs: listEntries(props.debuffs).map(([name]) => name),
		setHealth: (value) => setPairValue(app, file, 'hp', 'current', value),
		addDebuff: (debuff) => addDebuff(app, file, debuff),
		removeDebuff: (index) => removeDebuff(app, file, index),
	};
}

function encounterTracker(
	data: Record<string, unknown>,
	key: string,
	props: Record<string, unknown>,
	save: (edit: (d: Record<string, unknown>) => void) => Promise<void>,
): Tracker {
	const hp = readPair(props, 'hp', ['slots', 'current']);
	const total = Number(hp.slots);
	const state = readEncounter(data, key);
	const current = num(state.hp) ?? (hp.current == null ? total : Number(hp.current));
	const con = collectStats(props).find((st) => st.key === 'con');
	return {
		health: { total, current },
		slotValue: con && Number.isFinite(con.value) ? statMod(con.value) : null,
		debuffs: listEntries(state.debuffs ?? []).map(([name]) => name),
		setHealth: (value) => save(encounterEdit(key, (entry) => (entry.hp = value))),
		addDebuff: (debuff) =>
			save(
				encounterEdit(key, (entry) => {
					const list: unknown[] = Array.isArray(entry.debuffs) ? entry.debuffs : [];
					entry.debuffs = [...list, debuff];
				}),
			),
		removeDebuff: (index) =>
			save(
				encounterEdit(key, (entry) => {
					const list: unknown[] = Array.isArray(entry.debuffs) ? entry.debuffs : [];
					list.splice(index, 1);
					entry.debuffs = list;
				}),
			),
		reset: () => save(encounterEdit(key, null)),
	};
}

// Stat checks (d20 + stat mod) and, for crawlers, Evade (d20 + DEX mod + buffs).
function renderChecks(root: HTMLElement, ctx: RollContext, sheet: Sheet, props: Record<string, unknown>, isCrawler: boolean) {
	const body = section(root, 'Checks').createDiv({ cls: 'carl-buttons' });
	for (const stat of sheet.stats) {
		const mod = sheet.mod(stat.key);
		button(body, `${titleCase(stat.key)} ${formatMod(mod)}`, () =>
			rollCheck(ctx, `${titleCase(stat.name)} check`, [[titleCase(stat.key), mod]], ctx.target('stat')),
		);
	}
	if (isCrawler) {
		button(body, `Evade ${formatMod(sheet.evade.total)}`, () =>
			rollCheck(ctx, 'Evade', [['DEX', sheet.evade.dex], ['buffs', sheet.evade.buffs]], ctx.target(null)),
		);
	} else if (props.evade != null) {
		const evade = resolveNumber(asText(props.evade), ctx.vars);
		body.createSpan({ cls: 'carl-muted', text: `Evade ${asText(props.evade)}${evade != null ? ` = ${evade}` : ''}` });
	}
}

/**
 * Every skill and spell gets a button, except passives attached to an attack (those are toggles on
 * the attack). Checks roll d20 + rank + stat mod against the difficulty for their check type; attacks
 * roll to hit against Evade, then damage; heals roll their `heal` dice; other passives just record the
 * use. Spells spend their mana cost first. Any use marks ✔.
 */
function renderSkills(
	root: HTMLElement,
	ctx: RollContext,
	all: SkillLine[],
	file: TFile,
	sheet: Sheet,
	key: 'skills' | 'spells',
	plans: AttackPlan[],
) {
	// Passives attached to an attack are applied from that attack instead.
	const lines = all.filter((l) => !(l.info?.kind === 'passive' && l.info.appliesTo.length));
	if (!lines.length) return;
	const body = section(root, key === 'spells' ? 'Spells' : 'Skills').createDiv({ cls: 'carl-buttons' });
	for (const line of lines) {
		const kind = line.info?.kind ?? null;
		const rank = line.rank ?? 0;
		const mod = line.stat ? sheet.mod(line.stat) : 0;
		const target = ctx.target(kind, line.info?.opposedBy);
		const attack = kind === 'attack';
		const rolled = kind !== 'passive' && !line.info?.heal;
		const cost = key === 'spells' && line.info?.manaCost != null ? ` · ${line.info.manaCost} MP` : '';
		const vs = target != null ? ` vs ${target}` : attack && ctx.defender ? ` vs ${ctx.defender.name}'s Evade` : '';
		const label = `${line.checked ? '✔ ' : ''}${line.name}${rolled ? ` ${formatMod(rank + mod)}` : ''}${cost}${rolled ? vs : ''}`;
		button(body, label, () => {
			if (key === 'spells' && !spendMana(ctx, sheet, file, line)) return;
			const verb = key === 'spells' ? 'cast' : 'used';
			if (line.info?.heal) {
				const roll = rollFormula(line.info.heal, ctx.vars);
				ctx.show(`${verb} **${line.name}**: heals ${roll ? `${roll.detail} Health Bar slots` : line.info.heal}`);
			} else if (attack) {
				const plan = plans.find((pl) => pl.line === line);
				if (plan) rollPlan(ctx, withToggles(ctx, plan), target);
			} else if (rolled) {
				const parts: [string, number][] = [['rank', rank]];
				if (line.stat) parts.push([titleCase(statKey(line.stat)), mod]);
				rollCheck(ctx, line.name, parts, target);
			} else {
				ctx.show(`${verb} **${line.name}**${kind === 'passive' ? ' (passive)' : ''}`);
			}
			if (!line.checked) void checkSkill(ctx.app, file, line.name, key);
		});
	}
}

// Takes a spell's mana cost from `mana-current`; false (and a notice) when there isn't enough.
function spendMana(ctx: RollContext, sheet: Sheet, file: TFile, line: SkillLine): boolean {
	const cost = line.info?.manaCost;
	if (cost == null) return true;
	const mana = readPair(sheet.data, 'mana', ['max', 'current']);
	const current = num(mana.current) ?? num(mana.max);
	if (current == null) return true;
	if (current < cost) {
		new Notice(`Not enough mana for ${line.name}: needs ${cost}, have ${current}.`);
		return false;
	}
	void setPairValue(ctx.app, file, 'mana', 'current', current - cost);
	return true;
}

/**
 * Crawler attacks — `attacks` entries and attack skills (spells are cast from Spells) — roll to hit
 * against the opponent's Evade, then damage on a hit: a Critical Hit doubles the base dice, an Amazing
 * Success adds F. Always-on passives are already included; optional ones are checkboxes on the row.
 * Mob attacks show their to-hit target — the crawler rolls Evade against it — and roll damage.
 */
function renderAttacks(root: HTMLElement, ctx: RollContext, sheet: Sheet, props: Record<string, unknown>, plans: AttackPlan[]) {
	const crawlerPlans = plans.filter((pl) => !pl.line?.spell && !pl.toHitText && (pl.parts.length || pl.damage));
	const mobAttacks = toEntries(props.attacks).filter(([, d]) => toRecord(d)['to-hit'] != null);
	if (!crawlerPlans.length && !mobAttacks.length) return;
	const body = section(root, 'Attacks');
	const evade = ctx.target('attack');

	for (const plan of crawlerPlans) {
		const row = body.createDiv({ cls: 'carl-attack-row' });
		row.createSpan({ cls: 'carl-total', text: `${plan.line?.checked ? '✔ ' : ''}${plan.name}` });
		const rolled = withToggles(ctx, plan);
		const total = rolled.parts.reduce((sum, [, v]) => sum + v, 0);
		const vs = evade != null ? `vs ${evade}` : ctx.defender ? `vs ${ctx.defender.name}'s Evade` : null;
		const tags = [vs, rolled.disadvantage && 'dis'].filter(Boolean).join(' ');
		if (rolled.parts.length) {
			button(row, `Attack ${formatMod(total)}${tags ? ` ${tags}` : ''}`, () => rollPlan(ctx, rolled, evade));
		}
		const damage = damageText(rolled);
		if (damage) button(row, `Damage ${damage}`, () => rollDamage(ctx, plan.name, rolled.damage, rolled.bonusDice));
		for (const passive of plan.applied) row.createSpan({ cls: 'carl-muted', text: `+ ${passive.line.name}` });
		for (const passive of plan.optional) toggle(row, ctx, plan, passive.line.name);
	}

	for (const [attackName, details] of mobAttacks) {
		const f = toRecord(details);
		const title = titleCase(attackName);
		const row = body.createDiv({ cls: 'carl-attack-row' });
		row.createSpan({ cls: 'carl-total', text: title });
		const target = resolveNumber(asText(f['to-hit']), ctx.vars);
		row.createSpan({ cls: 'carl-muted', text: `to hit ${asText(f['to-hit'])}${target != null ? ` = ${target}` : ''}` });
		const damage = asText(f.damage);
		if (damage) button(row, `Damage ${damage}`, () => rollDamage(ctx, title, damage, []));
	}
}

// A checkbox for an optional passive on one attack, e.g. "☐ Aiming".
function toggle(row: HTMLElement, ctx: RollContext, plan: AttackPlan, passive: string) {
	const key = `${ctx.sourcePath}|${plan.name}|${passive}`;
	const label = row.createEl('label', { cls: 'carl-toggle' });
	const box = label.createEl('input', { type: 'checkbox' });
	box.checked = toggles.has(key);
	label.appendText(passive);
	box.addEventListener('change', () => {
		if (box.checked) toggles.add(key);
		else toggles.delete(key);
		ctx.rerender();
	});
}

/** The plan with the optional passives that are switched on applied (a copy). */
function withToggles(ctx: RollContext, plan: AttackPlan): AttackPlan {
	let result: AttackPlan = { ...plan, parts: [...plan.parts], bonusDice: [...plan.bonusDice], applied: [...plan.applied] };
	for (const passive of plan.optional) {
		if (toggles.has(`${ctx.sourcePath}|${plan.name}|${passive.line.name}`)) result = applyPassive(result, passive);
	}
	return result;
}

function damageText(plan: AttackPlan): string {
	if (!plan.damage) return '';
	return plan.bonusDice.length ? `${plan.damage} + ${plan.bonusDice.join(' + ')}` : plan.damage;
}

// Uses the hotlist entry's inventory item, if it has a quantity; empties leave the hotlist.
function renderHotlist(root: HTMLElement, app: App, file: TFile, props: Record<string, unknown>, ctx: RollContext, md: RenderMarkdown) {
	const hotlist = Array.isArray(props.hotlist) ? props.hotlist : [];
	if (!hotlist.length) return;
	const body = section(root, 'Hotlist').createDiv({ cls: 'carl-hotlist-actions' });
	hotlist.forEach((entry, i) => {
		const name = listEntries([entry])[0]?.[0] ?? '';
		const quantity = inventoryQuantity(props.inventory, entryName(entry));
		const item = body.createDiv({ cls: 'carl-hot-action' });
		md(name, item.createSpan());
		if (quantity != null) item.createSpan({ cls: 'carl-muted', text: ` ×${quantity}` });
		button(item, 'Use', () => {
			void useHotlistItem(app, file, i).then((left) => {
				const text = left == null ? '' : left === 0 ? ' — none left, removed from hotlist' : ` — ${left} left`;
				ctx.show(`used ${name}${text}`);
			});
		});
	});
}

function inventoryQuantity(inventory: unknown, name: string): number | null {
	if (!Array.isArray(inventory)) return null;
	for (const entry of inventory) {
		if (!isRecord(entry)) continue;
		if ('item' in entry && entryName(entry.item) === name) return num(entry.quantity);
		const key = Object.keys(entry).find((k) => entryName(k) === name);
		if (key == null) continue;
		const value = entry[key];
		return isRecord(value) ? num(value.quantity) : num(value);
	}
	return null;
}

// ── Rolling ──────────────────────────────────────────────────────────

function rollCheck(ctx: RollContext, label: string, mods: [string, number][], target: number | null) {
	const { natural, shown } = rollD20(ctx.mode);
	const total = natural + mods.reduce((sum, [, m]) => sum + m, 0);
	const degree = degreeOf(natural, total, target);
	ctx.show(`**${label}**: ${shown} ${modText(mods)} = **${total}**${describe(target, degree)}`);
}

// "+ 3 DEX + 1 buffs", skipping zeros.
function modText(mods: [string, number][]): string {
	return mods
		.filter(([, m]) => m)
		.map(([n, m]) => `${m < 0 ? '−' : '+'} ${Math.abs(m)} ${n}`)
		.join(' ');
}

/**
 * Rolls an attack plan: to hit (Disadvantage from a passive cancels the header's Advantage), then
 * damage on a hit. Marks the skill or spell and every applied passive as used.
 */
function rollPlan(ctx: RollContext, plan: AttackPlan, target: number | null) {
	// Against a crawler, their Evade roll is the target.
	const defense = target == null && ctx.defender ? ctx.defender.roll() : null;
	if (defense) target = defense.total;
	const mode: RollMode = plan.disadvantage ? (ctx.mode === 'advantage' ? 'normal' : 'disadvantage') : ctx.mode;
	const { natural, shown } = rollD20(mode);
	const total = natural + plan.parts.reduce((sum, [, v]) => sum + v, 0);
	const degree = degreeOf(natural, total, target);
	let text = `**${plan.name}**: ${shown} ${modText(plan.parts)} = **${total}** to hit${describe(target, degree)}`;
	if (defense) text += ` (${defense.text})`;

	// Without a target the hit can't be judged, so damage is rolled unless it's a natural 1.
	const hits = degree == null ? natural !== 1 : isSuccess(degree);
	if (hits && plan.damage) {
		const base = rollFormula(plan.damage, ctx.vars, degree === 'Critical Hit' ? 2 : 1);
		const bonus = plan.bonusDice.length ? rollFormula(plan.bonusDice.join(' + '), ctx.vars) : null;
		const amazing = degree === 'Amazing Success' && ctx.vars.F != null ? ctx.vars.F : 0;
		if (base) {
			const sum = base.total + (bonus?.total ?? 0) + amazing;
			text += `; damage ${base.detail}${bonus ? ` + bonus ${bonus.detail}` : ''}${amazing ? ` + ${amazing} F` : ''} = **${sum}**${
				base.label ? ` ${base.label}` : ''
			}`;
		}
	}
	if (plan.applied.length) text += ` (with ${plan.applied.map((p) => p.line.name).join(', ')})`;
	ctx.show(text);

	if (plan.line && !plan.line.checked) void checkSkill(ctx.app, ctx.file, plan.line.name, plan.line.spell ? 'spells' : 'skills');
	for (const { line } of plan.applied) if (!line.checked) void checkSkill(ctx.app, ctx.file, line.name, 'skills');
}

function rollDamage(ctx: RollContext, title: string, damage: string, bonusDice: string[]) {
	const roll = rollFormula(damage, ctx.vars);
	if (!roll) {
		new Notice(`Can't roll "${damage}"${/[FS]/.test(damage) ? ' — set floor (F) or size (S)' : ''}.`);
		return;
	}
	const bonus = bonusDice.length ? rollFormula(bonusDice.join(' + '), ctx.vars) : null;
	const total = roll.total + (bonus?.total ?? 0);
	ctx.show(`**${title}** damage: ${roll.detail}${bonus ? ` + bonus ${bonus.detail}` : ''} = **${total}**${roll.label ? ` ${roll.label}` : ''}`);
}

function describe(target: number | null, degree: Degree | null): string {
	return `${target != null ? ` vs ${target}` : ''}${degree ? ` → **${degree}**` : ''}`;
}

// ── Opponent ─────────────────────────────────────────────────────────

interface Combatant {
	/** Unique name in this encounter; keys its `encounter` entry and `target`. */
	key: string;
	link: NoteLink;
	file: TFile | null;
}

/**
 * `opponents` as `name: "[[note]]"` (a map, or a list of one-key maps), or a plain list of links.
 * Unnamed repeats of the same note become "Bad Llama 2", "Bad Llama 3"…
 */
function readOpponents(app: App, value: unknown, sourcePath: string, used = new Set<string>()): Combatant[] {
	const named: [string | null, unknown][] = isRecord(value)
		? Object.entries(value)
		: (Array.isArray(value) ? value : value == null ? [] : [value]).map((item): [string | null, unknown] => {
				if (isRecord(item)) {
					const [name, link] = Object.entries(item)[0] ?? [null, null];
					return [name, link];
				}
				return [null, item];
			});

	return named.flatMap(([name, linkValue]) => {
		const link = parseLinks(linkValue)[0];
		if (!link) return [];
		let key = name ?? link.target;
		for (let n = 2; used.has(key); n++) key = `${name ?? link.target} ${n}`;
		used.add(key);
		return [{ key, link, file: app.metadataCache.getFirstLinkpathDest(link.target, sourcePath) }];
	});
}

interface Opponent {
	name: string;
	mods: Record<string, number>;
	/** A mob's Evade with F and their size filled in. */
	evade: number | null;
	/** A crawler's Evade is rolled each time they're attacked. */
	rollEvade?: () => { total: number; text: string };
}

function readOpponent(app: App, path: string | undefined, floor: number | null, name: string): Opponent | null {
	const file = path ? fileAt(app, path) : null;
	const props = file ? app.metadataCache.getFileCache(file)?.frontmatter : null;
	if (!isRecord(props)) return null;
	const mods = Object.fromEntries(collectStats(props).map((st) => [st.key, statMod(st.value)]));
	const evade = props.evade == null ? null : resolveNumber(asText(props.evade), { F: floor, S: sizeValue(props.size) });
	return { name, mods, evade };
}

// ── Helpers ──────────────────────────────────────────────────────────

const ROLL_NOTICE_MS = 10_000;

// A toast in the corner, so the result is visible wherever the page is scrolled. Click to dismiss.
function showRoll(md: RenderMarkdown, name: string, text: string) {
	const fragment = createFragment();
	const card = fragment.createDiv({ cls: 'carl-roll-notice' });
	card.createDiv({ cls: 'carl-roll-notice-who', text: name });
	md(text, card.createDiv({ cls: 'carl-roll-notice-text' }));
	new Notice(fragment, ROLL_NOTICE_MS);
}

function fileAt(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

function isCrawlerSheet(props: Record<string, unknown>): boolean {
	const tags = asText(props.tags);
	return tags.includes('carl/character') || ['race', 'class', 'skills', 'hotlist', 'crawler'].some((k) => k in props);
}

function section(root: HTMLElement, title: string): HTMLElement {
	const el = root.createDiv({ cls: 'carl-actions-section' });
	el.createDiv({ cls: 'carl-field-label', text: title });
	return el;
}

function button(parent: HTMLElement, text: string, onClick: () => void, cls = ''): HTMLButtonElement {
	const el = parent.createEl('button', { cls: `carl-button ${cls}`.trim(), text });
	el.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		onClick();
	});
	return el;
}

function num(value: unknown): number | null {
	if (value == null || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}
