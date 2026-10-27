import { App, TFile } from 'obsidian';
import { asText, isRecord } from '../blocks/yaml';
import { parseLinks } from './items';

/**
 * Crawlers a sponsor backs, as markdown: the sponsor note's own `crawlers` list, plus every
 * note whose `sponsors` property links to this sponsor — so adding a sponsor to a character
 * is enough to list them here. Only `[[links]]` count for that, since it reads Obsidian's link index.
 */
export function sponsoredCrawlers(app: App, sponsor: TFile | null, props: Record<string, unknown>): string[] {
	const crawlers: string[] = [];
	const seen = new Set<string>();
	const add = (key: string, markdown: string) => {
		if (seen.has(key)) return;
		seen.add(key);
		crawlers.push(markdown);
	};

	const sourcePath = sponsor?.path ?? '';
	for (const link of parseLinks(props.crawlers)) {
		const file = app.metadataCache.getFirstLinkpathDest(link.target, sourcePath);
		add(file?.path ?? link.target.toLowerCase(), link.bracketed || file ? `[[${link.text}]]` : link.text);
	}

	if (sponsor) {
		// Only notes that link to the sponsor, from Obsidian's link index, rather than every note in the vault.
		const linking = Object.entries(app.metadataCache.resolvedLinks)
			.filter(([, targets]) => sponsor.path in targets)
			.map(([path]) => app.vault.getAbstractFileByPath(path));
		for (const file of linking) {
			if (!(file instanceof TFile)) continue;
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
			if (!isRecord(frontmatter) || frontmatter.sponsors == null) continue;
			const backs = parseLinks(frontmatter.sponsors).some(
				(link) => app.metadataCache.getFirstLinkpathDest(link.target, file.path)?.path === sponsor.path,
			);
			if (!backs) continue;
			const name = asText(frontmatter.name);
			add(file.path, name && name !== file.basename ? `[[${file.basename}|${name}]]` : `[[${file.basename}]]`);
		}
	}
	return crawlers;
}
