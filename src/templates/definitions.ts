// Note templates for every block. Properties match what the blocks read, left empty to fill in.
// `{{title}}` is replaced with the note name (the same placeholder Obsidian's Templates plugin uses).

export interface NoteTemplate {
	/** Command id suffix and settings key. */
	id: string;
	/** Shown in commands: "New mob". */
	label: string;
	/** Template file name in the templates folder. */
	file: string;
	/** Default folder for new notes of this type. */
	folder: string;
	content: string;
}

const ATTACK = `attacks:
  - attack name:
      to-hit:
      damage:
      range:
      cone:
      radius:
      line:
      limit:
      effect:`;

const STATS = `strength:
intelligence:
constitution:
dexterity:
charisma:`;

const creature = (tag: string, type: string) => `---
tags:
  - carl/${tag}
level:
type: ${type}
size:
creature:
hp-slots:
hp-current:
surprise:
evade:
move:
dr:
${STATS}
${ATTACK}
traits:
  - trait name: details
---
# {{title}}

(details)

> [!danger] {{title}}, Level (level)
>
> (ai's description)

\`\`\`carl-creature
\`\`\`
`;

const card = (tag: string, properties: string, block: string) => `---
tags:
  - carl/${tag}
${properties}
---
# {{title}}

\`\`\`${block}
\`\`\`
`;

export const TEMPLATES: NoteTemplate[] = [
	{ id: 'mob', label: 'mob', file: 'mob.md', folder: 'mobs', content: creature('creature', 'mob') },
	{ id: 'npc', label: 'NPC', file: 'npc.md', folder: 'npcs', content: creature('npc', 'npc') },
	{ id: 'pet', label: 'pet', file: 'pet.md', folder: 'pets', content: creature('pet', 'pet') },
	{
		id: 'character',
		label: 'crawler',
		file: 'crawler.md',
		folder: 'crawlers',
		content: `---
tags:
  - carl/character
name:
race:
class:
pronouns:
level: 1
crawler:
floor: 1
portrait:
hp-slots: 10
hp-current:
move:
step:
favor:
size:
mana-max:
mana-current:
evade-buffs:
dr-buffs:
${STATS}
gear:
  head:
  torso:
  arms:
  hands:
  legs:
  feet:
  accessories: []
buffs: []
debuffs: []
attacks:
  - attack name:
      rank:
      stat:
      dice:
      damage-stat:
      effect:
skills:
  - skill name:
      rank:
      stat:
      type:
      notes:
      checked: false
hotlist: []
inventory:
  - item:
    quantity:
    notes:
popularity: 0
trauma:
loose-ends:
regrets:
notes:
pet:
mount:
kills: []
clubs: []
space-tier:
space-size:
amenities: []
deity:
racial-abilities: []
class-abilities: []
sponsors: []
---
\`\`\`carl-character
\`\`\`
`,
	},
	{
		id: 'item',
		label: 'item',
		file: 'item.md',
		folder: 'items',
		content: card('item', `slot:
rarity:
type:
description:
bonuses:
  strength:
abilities: []`, 'carl-item'),
	},
	{
		id: 'race',
		label: 'race',
		file: 'race.md',
		folder: 'races',
		content: card('race', `size:
description:
bonuses:
  strength:
skills:
  skill name:
abilities: []`, 'carl-race'),
	},
	{
		id: 'class',
		label: 'class',
		file: 'class.md',
		folder: 'classes',
		content: card('class', `description:
bonuses:
  strength:
skills:
  skill name:
abilities: []`, 'carl-class'),
	},
	{
		id: 'mount',
		label: 'mount or vehicle',
		file: 'mount.md',
		folder: 'mounts',
		content: card('mount', `hp-slots: 10
hp-current:
size:
occupants:
move:
dr:
accessories: []`, 'carl-mount'),
	},
	{
		id: 'sponsor',
		label: 'sponsor',
		file: 'sponsor.md',
		folder: 'sponsors',
		content: card('sponsor', `name:
description:
crawlers: []`, 'carl-sponsor'),
	},
];
