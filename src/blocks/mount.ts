import { App, MarkdownPostProcessorContext } from 'obsidian';
import { renderMount } from './character/panels';
import { panel } from './character/ui';
import { LiveBlock, noteName, RenderMarkdown } from './shared';
import { asText } from './yaml';

export const MOUNT_BLOCK = 'carl-mount';

// The same Mount / vehicle card the crawler's sheet shows, on the mount's own note.
export function renderMountBlock(app: App, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	ctx.addChild(new MountBlock(app, MOUNT_BLOCK, source, el, ctx.sourcePath));
}

class MountBlock extends LiveBlock {
	protected renderData(data: Record<string, unknown>, md: RenderMarkdown) {
		const root = this.containerEl.createDiv({ cls: 'carl-block carl-character carl-standalone' });
		const props = { ...data, name: asText(data.name) || noteName(this.sourcePath) };
		renderMount(panel(root, 'Mount / vehicle'), { link: null, file: null, props }, md);
	}
}
