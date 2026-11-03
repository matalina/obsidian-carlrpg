import type CarlPlugin from '../main';
import { BUILDER_VIEW, RaceClassBuilderView } from './view';

export function registerRaceClassBuilder(plugin: CarlPlugin) {
	plugin.registerView(BUILDER_VIEW, (leaf) => new RaceClassBuilderView(leaf, plugin));
	plugin.addRibbonIcon('hammer', 'Open race & class builder', () => void openBuilder(plugin));
	plugin.addCommand({
		id: 'open-race-class-builder',
		name: 'Open race & class builder',
		callback: () => void openBuilder(plugin),
	});
}

async function openBuilder(plugin: CarlPlugin) {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(BUILDER_VIEW)[0];
	if (!leaf) {
		leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: BUILDER_VIEW, active: true });
	}
	workspace.setActiveLeaf(leaf, { focus: true });
}
