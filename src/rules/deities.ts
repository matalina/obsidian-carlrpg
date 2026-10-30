import { asText, isRecord } from '../blocks/yaml';

// A deity note's `tier-benefits`, by Tier of Devotion:
//
//   tier-benefits:
//     acolyte: [ … ]
//     devotee: [ … ]
//     zealot: [ … ]
//
// A crawler's `devotion` (acolyte | devotee | zealot) is the tier they've reached; each tier keeps the ones before it.

export const DEVOTION_TIERS = ['acolyte', 'devotee', 'zealot'];

export function readTierBenefits(props: Record<string, unknown>): [tier: string, benefits: string[]][] {
	const value = props['tier-benefits'];
	if (!isRecord(value)) return [];
	const tiers = [...DEVOTION_TIERS, ...Object.keys(value).filter((k) => !DEVOTION_TIERS.includes(k.toLowerCase()))];
	return tiers.flatMap((tier): [string, string[]][] => {
		const key = Object.keys(value).find((k) => k.toLowerCase() === tier.toLowerCase());
		const list = key == null ? null : value[key];
		if (list == null) return [];
		const benefits = (Array.isArray(list) ? list : [list]).map(asText).filter(Boolean);
		return benefits.length ? [[tier, benefits]] : [];
	});
}

/** The tiers a crawler with this `devotion` has reached; none when it isn't set. */
export function tiersReached(devotion: unknown): string[] {
	const index = DEVOTION_TIERS.indexOf(asText(devotion).trim().toLowerCase());
	return index < 0 ? [] : DEVOTION_TIERS.slice(0, index + 1);
}
