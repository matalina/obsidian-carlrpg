import { App, Modal, normalizePath, Notice, Setting, TFile } from 'obsidian';
import type CarlPlugin from '../main';
import { NoteTemplate, TEMPLATES } from './definitions';

export function registerTemplateCommands(plugin: CarlPlugin) {
	plugin.addCommand({
		id: 'create-templates',
		name: 'Create template files',
		callback: () => void createTemplateFiles(plugin),
	});

	for (const template of TEMPLATES) {
		plugin.addCommand({
			id: `new-${template.id}`,
			name: `New ${template.label}`,
			callback: () =>
				new NameModal(plugin.app, `New ${template.label}`, (name) => void createNote(plugin, template, name)).open(),
		});
	}
}

// Writes every template into the templates folder. Existing files are left alone, so edits survive.
async function createTemplateFiles(plugin: CarlPlugin) {
	const folder = await templatesFolder(plugin);
	await ensureFolder(plugin.app, folder);

	const created: string[] = [];
	const skipped: string[] = [];
	for (const template of TEMPLATES) {
		const path = normalizePath(`${folder}/${template.file}`);
		if (plugin.app.vault.getAbstractFileByPath(path)) {
			skipped.push(template.file);
			continue;
		}
		await plugin.app.vault.create(path, template.content);
		created.push(template.file);
	}

	const parts = [
		created.length ? `Created ${created.join(', ')}` : 'No new templates',
		skipped.length ? `kept existing ${skipped.join(', ')}` : '',
	].filter(Boolean);
	new Notice(`${parts.join('; ')} in ${folder}.`);
}

// Uses the template file from the templates folder when there is one (so your edits apply),
// otherwise the built-in template.
async function createNote(plugin: CarlPlugin, template: NoteTemplate, name: string) {
	const { app } = plugin;
	const folder = plugin.settings.folders[template.id] || template.folder;
	await ensureFolder(app, folder);

	const custom = app.vault.getAbstractFileByPath(normalizePath(`${await templatesFolder(plugin)}/${template.file}`));
	const source = custom instanceof TFile ? await app.vault.read(custom) : template.content;
	const content = source.replace(/\{\{title\}\}/g, name).replace(/\{\{date\}\}/g, window.moment().format('YYYY-MM-DD'));

	const file = await app.vault.create(availablePath(app, folder, name), content);
	await app.workspace.getLeaf(false).openFile(file);
}

async function templatesFolder(plugin: CarlPlugin): Promise<string> {
	if (plugin.settings.templatesFolder) return normalizePath(plugin.settings.templatesFolder);
	// The core Templates plugin keeps its folder in .obsidian/templates.json.
	try {
		const config = JSON.parse(await plugin.app.vault.adapter.read(`${plugin.app.vault.configDir}/templates.json`)) as {
			folder?: string;
		};
		if (config.folder) return normalizePath(config.folder);
	} catch {
		// No core Templates config; fall through to the default.
	}
	return '_templates';
}

async function ensureFolder(app: App, folder: string) {
	if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
}

// "Name.md", or "Name 2.md" etc. when taken.
function availablePath(app: App, folder: string, name: string): string {
	const base = name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Untitled';
	for (let i = 1; ; i++) {
		const path = normalizePath(`${folder}/${i === 1 ? base : `${base} ${i}`}.md`);
		if (!app.vault.getAbstractFileByPath(path)) return path;
	}
}

class NameModal extends Modal {
	private name = '';

	constructor(app: App, private title: string, private onSubmit: (name: string) => void) {
		super(app);
	}

	onOpen() {
		this.setTitle(this.title);
		const submit = () => {
			if (!this.name.trim()) return;
			this.close();
			this.onSubmit(this.name.trim());
		};
		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') submit();
			});
			text.onChange((value) => (this.name = value));
			window.setTimeout(() => text.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).addButton((button) => button.setButtonText('Create').setCta().onClick(submit));
	}

	onClose() {
		this.contentEl.empty();
	}
}
