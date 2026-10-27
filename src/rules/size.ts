import { asText, titleCase } from '../blocks/yaml';

// Table 9: Creature Size — value 1–8.
const SIZES = ['Tiny', 'Small', 'Petite', 'Medium', 'Large', 'Huge', 'Colossal', 'Gargantuan'];

export interface Size {
	name: string;
	value: number;
}

// Accepts "medium", "4", or "medium (4)". Unknown names are kept as written, without a value.
export function parseSize(size: unknown): Size | null {
	const text = asText(size).trim();
	if (!text) return null;
	const number = Number(/\((\d+)\)/.exec(text)?.[1] ?? text);
	if (Number.isInteger(number) && SIZES[number - 1]) return { name: SIZES[number - 1]!, value: number };
	const index = SIZES.findIndex((name) => name.toLowerCase() === text.toLowerCase());
	return index === -1 ? null : { name: SIZES[index]!, value: index + 1 };
}

// "Medium (4)"; anything not in the table is shown as written.
export function formatSize(size: unknown): string {
	const parsed = parseSize(size);
	return parsed ? `${parsed.name} (${parsed.value})` : titleCase(asText(size));
}

export function sizeValue(size: unknown): number | null {
	return parseSize(size)?.value ?? null;
}
