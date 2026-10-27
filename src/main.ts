import { Plugin } from 'obsidian';
import { CHARACTER_BLOCK, renderCharacterBlock } from './blocks/character/index';
import { CREATURE_BLOCK, renderCreatureBlock } from './blocks/creature';
import { referenceBlocks } from './blocks/reference';

export default class CarlPlugin extends Plugin {
	onload() {
		this.registerMarkdownCodeBlockProcessor(CREATURE_BLOCK, (source, el, ctx) =>
			renderCreatureBlock(this.app, source, el, ctx),
		);
		this.registerMarkdownCodeBlockProcessor(CHARACTER_BLOCK, (source, el, ctx) =>
			renderCharacterBlock(this.app, source, el, ctx),
		);
		for (const { name, render } of referenceBlocks(this.app)) {
			this.registerMarkdownCodeBlockProcessor(name, render);
		}
	}
}
