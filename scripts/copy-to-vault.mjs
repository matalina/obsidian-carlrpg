import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

// Load per-install settings from .env (DROPBOX_DIR, optional VAULT_SUBPATH)
if (existsSync(".env")) process.loadEnvFile(".env");

const dropboxDir = process.env.DROPBOX_DIR;
if (!dropboxDir) {
	console.error("DROPBOX_DIR is not set. Copy .env.example to .env and set it.");
	process.exit(1);
}

const vaultDir = path.join(dropboxDir, process.env.VAULT_SUBPATH ?? "Notebook/Writing/Dungeon Crawler Carl");
if (!existsSync(path.join(vaultDir, ".obsidian"))) {
	console.error(`No Obsidian vault found at ${vaultDir}`);
	process.exit(1);
}

const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const pluginDir = path.join(vaultDir, ".obsidian", "plugins", id);
mkdirSync(pluginDir, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
	if (existsSync(file)) copyFileSync(file, path.join(pluginDir, file));
}

console.log(`Copied plugin to ${pluginDir}`);
