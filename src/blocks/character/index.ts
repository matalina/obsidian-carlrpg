import { App, MarkdownPostProcessorContext } from 'obsidian';
import { LiveBlock, RenderMarkdown } from '../shared';
import { buildSheet } from './model';
import { renderPanels } from './panels';
import { renderGearAndStory, renderHotlist, renderInventory, renderSkills, renderSpells } from './sections';
import { renderAttackTable, renderTop } from './top';

export const CHARACTER_BLOCK = 'carl-character';

export function renderCharacterBlock(
	app: App,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
) {
	ctx.addChild(new CharacterBlock(app, CHARACTER_BLOCK, source, el, ctx.sourcePath));
}

// Laid out in the order of the printed sheet. Also watches every linked note
// (items, race, class, pet, mount, deity, sponsors) so edits there show up straight away.
class CharacterBlock extends LiveBlock {
	protected renderData(data: Record<string, unknown>, md: RenderMarkdown) {
		const sheet = buildSheet(this.app, data, this.sourcePath);
		// Sponsors list every crawler that links to them, so any note change may alter that list.
		this.watch(
			sheet.linked.flatMap((l) => (l.file ? [l.file.path] : [])),
			sheet.linked.some((l) => l.link?.bracketed && !l.file) || sheet.sponsors.length > 0,
		);

		const root = this.containerEl.createDiv({ cls: 'carl-block carl-character' });
		renderTop(root, sheet, md);
		renderAttackTable(root, sheet, md);
		renderHotlist(root, sheet, md);
		renderGearAndStory(root, sheet, md);
		renderSkills(root, sheet, md);
		renderSpells(root, sheet, md);
		renderInventory(root, sheet, md);
		renderPanels(root, sheet, md);
	}
}
