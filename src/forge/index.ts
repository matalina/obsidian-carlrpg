import type CarlPlugin from '../main';
import { MOB_FORGE_VIEW, MobForgeView } from './view';

export function registerMobForge(plugin: CarlPlugin) {
	plugin.registerView(MOB_FORGE_VIEW, (leaf) => new MobForgeView(leaf, plugin));
	plugin.addRibbonIcon('dices', 'Open mob forge', () => void openMobForge(plugin));
	plugin.addCommand({
		id: 'open-mob-forge',
		name: 'Open mob forge',
		callback: () => void openMobForge(plugin),
	});
}

async function openMobForge(plugin: CarlPlugin) {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(MOB_FORGE_VIEW)[0];
	if (!leaf) {
		leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: MOB_FORGE_VIEW, active: true });
	}
	workspace.setActiveLeaf(leaf, { focus: true });
}
