# Dungeon Crawler Carl RPG for Obsidian

Statblocks and character sheets for the **Dungeon Crawler Carl roleplaying game**, rendered right inside your Obsidian notes.

Write a creature, crawler, item, race or class as properties (or YAML) and the plugin draws it the way the book does — with stat modifiers, health slots, enhanced scores and skill ranks worked out for you. Link a character to its gear, race and class notes and the sheet adds up their bonuses, updating live as you edit them.

> Unofficial fan project. *Dungeon Crawler Carl* is © Matt Dinniman; the roleplaying game is published by Renegade Game Studios. This plugin contains no game text — you bring your own content.

## Blocks

| Block | Draws |
| --- | --- |
| `carl-creature` | A creature/mob statblock: health slots, Level / Surprise / Evade / Move / DR, stats with mods, attacks and notes. Also used for pets. |
| `carl-character` | A full crawler sheet laid out like the printed one. |
| `carl-item` | An item or buff card with its bonuses. |
| `carl-race` | A race entry: size, stat and skill bonuses, abilities. |
| `carl-class` | A class entry, same layout as races. |

### Two ways to feed a block

**From the note's properties (recommended).** Put the data in the note's properties and leave the block empty:

````markdown
---
level: 3
type: mob
size: large
hp-slots: 3
strength: 2
dexterity: 6
---
```carl-creature
```
````

Properties are editable in the Properties panel, show up in [Bases](https://help.obsidian.md/bases), and links in them update when you rename a note.

**Inline YAML** — handy for a quick one-off that nothing links to:

````markdown
```carl-creature
name: Bad Llama
level: 3
hp-slots: 3
```
````

Lists can be written as plain maps or as lists of single-key maps (`- strength: 2`) — both work everywhere.

## Creatures — `carl-creature`

```yaml
name: Bad Llama            # optional; defaults to the note's name
level: 3
type: mob
size: large                # tiny … gargantuan, a number 1–8, or "large (5)"
creature: mutated
hp-slots: 3
hp-current: 3              # optional; lower it to grey out lost slots
surprise: 11+F
evade: 13+F
move: 20+S
dr: 2
strength: 2
intelligence: 1
constitution: 3
dexterity: 6
charisma: 1
attacks:
  - lava spit:
      to-hit: 13+F
      damage: 1d8+F Fire
      range: 30ft          # also: cone, radius (blast radius), line
      limit: once per round
      effect: On an Evade Major Fail or worse, the target gains the Burning Debuff.
traits:
  - bad reflux: Attacks can target the lava pouch in the Llama's throat…
```

- Each health slot shows the **CON mod**.
- Stats show as `6 (+3)` using the stat mod table (Table 9).
- Traits render as `Notes: *Bad Reflux*—…`.
- Any other property is listed at the bottom, so nothing is silently hidden.

## Characters — `carl-character`

The sheet follows the printed character sheet: identity, health bar, stats, Evade and DR formulas, mana, debuffs, external buffs, portrait, attacks, hotlist, gear, skills, inventory, pet, mount, and the remaining panels. Empty sections are hidden.

```yaml
name: Carl
race: "[[Human]]"
class: "[[Compensated Anarchist]]"
pronouns: he/him
level: 12
crawler: 4122
floor: 3
portrait: "[[carl.png]]"
hp-slots: 10               # defaults to 10
hp-current: 8
move: 30ft
step: 5ft
favor: 2                   # AI favor
size: medium
mana-max: 20
mana-current: 12
evade-buffs: 0             # added to Evade on top of item bonuses
dr-buffs: 0                # added to DR on top of item bonuses

# Unenhanced stats, before race/class bonuses
strength: 8
intelligence: 5
constitution: 9
dexterity: 7
charisma: 4

gear:
  head: "[[Hat]]"
  feet: "[[Enchanted Toe Ring]]"
  accessories:             # max 10
    - "[[Sunglasses]]"
buffs:                     # external buffs; only the first 3 count
  - "[[Potion of Strength]]"
debuffs:
  - Poisoned

attacks:
  - punch:
      rank: 3
      stat: str            # to hit = rank + enhanced STR mod
      dice: 1d4
      damage-stat: str     # damage = dice + enhanced STR mod
      effect: Bludgeoning.
skills:
  - pugilism:
      rank: 5              # trained rank, before race/class ranks
      stat: str
      type: Attack
      notes: Unlocked kick at rank 5
      checked: true
hotlist:
  - "[[Hob-lobber]]"
inventory:
  - item: "[[Rope]]"
    quantity: 1
    notes: 50ft
  - Gold: 120

popularity: 150            # running total, starts at 0
trauma: …
loose-ends: …
regrets: …
notes: …

pet: "[[Mr. Whiskers]]"           # a creature note
mount: "[[Shopping Cart of Doom]]"
kills: ["[[Bad Llama]]"]
clubs: ["[[Desperado Club]]"]
space-tier: 2
space-size: Small
amenities: ["Shower"]
deity: "[[Grull]]"
racial-abilities: []       # added after the race note's abilities
class-abilities: []
sponsors: ["[[Valtay Corporation]]"]
```

### How the numbers are worked out

| Value | Calculation |
| --- | --- |
| Unenhanced stat | listed stat + race and class `bonuses` |
| Enhanced stat | unenhanced + gear + first 3 external buffs |
| Stat mod | from the enhanced score, using Table 9 |
| Health slot value | enhanced CON mod |
| Evade | d20 + DEX mod + buffs (`evade` bonuses + `evade-buffs`) |
| DR | armor (gear `dr` bonuses) + buffs (buff/race/class `dr` + `dr-buffs`) |
| Skill rank | listed rank + race and class `skills` ranks |
| Attack to hit / damage | `rank` + stat mod / `dice` + `damage-stat` mod |

Hover any score with a coloured or underlined value to see where it came from. Write `to-hit` or `damage` out in full on an attack to skip the calculation.

## Linked notes

Anything in quotes as a link — `"[[Note]]"` — is read from that note's properties. Plain text works too and is simply shown as written.

**Items and buffs** (`carl-item`):

```yaml
slot: feet
rarity: uncommon
description: Somehow smells like feet even when new.
bonuses:
  dexterity: 2             # stats by name or abbreviation (dex)
  evade: 1                 # also: dr
```

**Races and classes** (`carl-race`, `carl-class`):

```yaml
size: medium
bonuses:
  dexterity: 5
skills:
  climbing: 2
  performance:
    rank: 2
    notes: with a stringed instrument specialty
abilities:
  - +3 Web Spell, which costs half the normal Mana to cast
  - You have an innate Climb Move equal to your normal Move value
```

Rendered like the book: `Size: Medium (4)`, `+5 Dexterity`, `+2 Climbing and Performance (with a stringed instrument specialty) Skills`, then each ability.

**Pets** use creature properties. **Mounts / vehicles** use `hp-slots`, `hp-current`, `size`, `occupants`, `move`, `dr` and `accessories`; each health slot is worth the vehicle's size value (1–8). **Deities and sponsors** show their note's `description`.

Tagging notes (`carl/creature`, `carl/character`, `carl/item`, `carl/race`, `carl/class`…) makes them easy to collect in a Base.

## Installation

Not yet in the community plugin list. To install manually, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/matalina/obsidian-carlrpg/releases) into `<vault>/.obsidian/plugins/dungeon-crawler-carl/`, then enable **Dungeon Crawler Carl** in **Settings → Community plugins**.

## Development

Requires Node 20+.

```bash
npm install
cp .env.example .env       # then set DROPBOX_DIR / VAULT_SUBPATH to your vault
npm test                   # type-check, build, and copy into the vault's plugin folder
npm run dev                # rebuild on change
npm run lint
```

`npm test` copies the build to `<DROPBOX_DIR>/<VAULT_SUBPATH>/.obsidian/plugins/<id>/`; reload the plugin in Obsidian to pick it up.

Source layout:

```
src/
  main.ts                 registers the blocks
  blocks/
    shared.ts             LiveBlock (properties/YAML + live updates), health bar, attacks
    creature.ts           carl-creature
    reference.ts          carl-item, carl-race, carl-class
    character/            carl-character: model (calculations), top, sections, panels, ui
  rules/                  stat mods, size table, item links and bonuses, skill bonuses
```

### Releasing

```bash
npm version patch          # bumps manifest.json + versions.json and tags (no "v" prefix)
git push --follow-tags
```

Pushing the tag builds the plugin and creates a draft GitHub release with the plugin files attached; publish it from the Releases page.
