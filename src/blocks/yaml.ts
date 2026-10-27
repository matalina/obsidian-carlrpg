// Block YAML often uses lists of single-key maps (`- strength: 2`) instead of
// plain maps. These helpers accept either shape so authors can use both.

export type Entry = [key: string, value: unknown];

export function toEntries(value: unknown): Entry[] {
	if (value == null) return [];
	if (Array.isArray(value)) {
		return value.flatMap((item): Entry[] => {
			if (isRecord(item)) return Object.entries(item);
			return [[asText(item), null]];
		});
	}
	if (isRecord(value)) return Object.entries(value);
	return [[asText(value), null]];
}

export function toRecord(value: unknown): Record<string, unknown> {
	return Object.fromEntries(toEntries(value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asText(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return JSON.stringify(value);
}

export function titleCase(text: string): string {
	return text.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
