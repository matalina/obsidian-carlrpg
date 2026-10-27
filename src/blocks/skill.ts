import { App, MarkdownPostProcessorContext } from 'obsidian';
import { checkLabel, readSkillInfo, skillSubtitle } from '../rules/skillnotes';
import { LiveBlock, noteName, RenderMarkdown } from './shared';
import { asText } from './yaml';

export const SKILL_BLOCK = 'carl-skill';
/** Spells are skills with mana cost, range, duration… — same card. */
export const SPELL_BLOCK = 'carl-spell';

export function renderSkillBlock(app: App, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	ctx.addChild(new SkillBlock(app, SKILL_BLOCK, source, el, ctx.sourcePath));
}

export function renderSpellBlock(app: App, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	ctx.addChild(new SkillBlock(app, SPELL_BLOCK, source, el, ctx.sourcePath));
}

// Laid out like the book's skill and spell entries: name, quote, "Passive" / "Intelligence" /
// "Melee Attack, Dex" (or a spell's keywords), the bold facts, description, then upgrades by rank.
class SkillBlock extends LiveBlock {
	protected renderData(data: Record<string, unknown>, md: RenderMarkdown) {
		const info = readSkillInfo(data);
		const block = this.containerEl.createDiv({ cls: 'carl-block carl-reference carl-skill' });

		const header = block.createDiv({ cls: 'carl-header' });
		header.createDiv({ cls: 'carl-name', text: asText(data.name) || noteName(this.sourcePath) });
		if (info.quote) header.createDiv({ cls: 'carl-skill-quote', text: `“${info.quote.replace(/^["“]|["”]$/g, '')}”` });
		const subtitle = skillSubtitle(info);
		if (subtitle) header.createDiv({ cls: 'carl-subtitle', text: subtitle });

		const body = block.createDiv({ cls: 'carl-skill-body' });
		if (info.manaCost != null) md(`**Mana Cost:** ${info.manaCost}`, body.createDiv());
		if (info.range) md(`**Range:** ${info.range}`, body.createDiv());
		if (info.duration) md(`**Duration:** ${info.duration}`, body.createDiv());
		if (info.aiFavor) md(`**AI Favor:** ${info.aiFavor}`, body.createDiv());
		if (info.baseDamage) md(`**Base Damage:** ${info.baseDamage}`, body.createDiv());
		if (info.limitations) md(`**Limitations:** ${info.limitations}`, body.createDiv());
		if (info.cooldown) md(`**Cooldown:** ${info.cooldown}`, body.createDiv());
		if (info.heal) md(`**Heals:** ${info.heal} Health Bar slots`, body.createDiv());
		if (info.description) md(info.description, body.createDiv());
		const check = checkLabel(info);
		if (check && info.kind !== 'passive') body.createDiv({ cls: 'carl-muted', text: `Check: ${check}` });

		if (info.upgrades.length) {
			body.createDiv({ cls: 'carl-skill-upgrades', text: 'Upgrades' });
			for (const [rank, text] of info.upgrades) md(`**Rank ${rank}:** ${text}`, body.createDiv());
		}
	}
}
