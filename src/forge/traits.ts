import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type CarlPlugin from '../main';
import { Trait, traitLines } from './frontmatter';

// The template's sample entry, removed when a real trait is added.
const PLACEHOLDER = /^\s*-\s*trait name:\s*details\s*$/;

/**
 * Adds traits to the `traits` list in a note's frontmatter. Edits the text directly so the
 * rest of the properties keep their exact layout (empty template fields stay empty).
 */
export function addTraitsToText(text: string, traits: Trait[]): string {
	const lines = traitLines(traits);
	if (!lines.length) return text;
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (!match) return `---\ntraits:\n${lines.join('\n')}\n---\n${text}`;

	const fm = match[1]!.split(/\r?\n/);
	const start = fm.findIndex((l) => /^traits:/.test(l));
	if (start === -1) {
		const before = fm.findIndex((l) => /^(source|page):/.test(l));
		fm.splice(before === -1 ? fm.length : before, 0, 'traits:', ...lines);
	} else {
		let end = start + 1;
		while (end < fm.length && (/^\s/.test(fm[end]!) || fm[end] === '')) end++;
		const kept = fm.slice(start + 1, end).filter((l) => !PLACEHOLDER.test(l) && l.trim() !== '');
		fm.splice(start, end - start, 'traits:', ...kept, ...lines);
	}
	return text.replace(match[0], `---\n${fm.join('\n')}\n---`);
}

export function registerTraitCommand(plugin: CarlPlugin) {
	plugin.addCommand({
		id: 'add-trait',
		name: 'Add trait to this note',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') return false;
			if (!checking) new TraitModal(plugin.app, (trait) => void addTraitToFile(plugin.app, file, trait)).open();
			return true;
		},
	});
}

async function addTraitToFile(app: App, file: TFile, trait: Trait) {
	await app.vault.process(file, (text) => addTraitsToText(text, [trait]));
	new Notice(`Added ${trait.name} to ${file.basename}.`);
}

export class TraitModal extends Modal {
	private trait: Trait = { name: '', details: '' };

	constructor(app: App, private onSubmit: (trait: Trait) => void) {
		super(app);
	}

	onOpen() {
		this.setTitle('Add trait');
		const submit = () => {
			if (!this.trait.name.trim()) return;
			this.close();
			this.onSubmit({ name: this.trait.name.trim(), details: this.trait.details.trim() });
		};
		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.setPlaceholder('Bad reflux').onChange((v) => (this.trait.name = v));
			window.setTimeout(() => text.inputEl.focus(), 0);
		});
		new Setting(this.contentEl)
			.setName('Details')
			.setDesc('What it does. Leave empty for a name-only trait.')
			.addTextArea((area) => {
				area.inputEl.rows = 4;
				area.onChange((v) => (this.trait.details = v));
			});
		new Setting(this.contentEl).addButton((b) => b.setButtonText('Add').setCta().onClick(submit));
	}

	onClose() {
		this.contentEl.empty();
	}
}
