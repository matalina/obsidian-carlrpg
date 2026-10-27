import { Plugin } from 'obsidian';
import { titleCase } from './blocks/yaml';

// Titles for the plugin's callouts when none is written: `> [!achievement]` reads "New achievement!".
// Obsidian's own default is the type name ("Achievement"), so only that is replaced.
const DEFAULT_TITLES: Record<string, (metadata: string) => string> = {
	ai: () => 'System AI',
	achievement: () => 'New achievement!',
	loot: (tier) => (tier ? `${titleCase(tier)} box` : 'Loot box'),
	quest: () => 'New quest',
	notification: () => 'Notification',
};

export function registerCallouts(plugin: Plugin) {
	plugin.registerMarkdownPostProcessor((el) => {
		for (const callout of Array.from(el.querySelectorAll<HTMLElement>('.callout[data-callout]'))) {
			const type = callout.dataset.callout ?? '';
			const title = DEFAULT_TITLES[type];
			const inner = callout.querySelector<HTMLElement>(':scope > .callout-title .callout-title-inner');
			if (!title || !inner || inner.textContent?.trim().toLowerCase() !== type) continue;
			inner.setText(title(callout.dataset.calloutMetadata?.trim() ?? ''));
		}
	});
}
