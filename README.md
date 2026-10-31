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
| `carl-race` | A race entry: size, stat, skill and spell bonuses, abilities. |
| `carl-class` | A class entry, same layout as races. |
| `carl-skill` / `carl-spell` | A skill or spell entry like the book's, with upgrades. |
| `carl-actions` | A play panel for a party and their opponents: rolls, health, mana, debuffs, hotlist. |
| `carl-mount` | A mount or vehicle statblock, like `carl-creature`: "Vehicle; Large (5)", health slots worth the size value (or the CON mod for a living mount), Occupants / Move / DR, any stats and attacks, then accessories. The crawler's sheet shows the same mount in its Mount panel. |
| `carl-sponsor` | A sponsor: name, description and the crawlers it sponsors. |
| `carl-deity` | A god: title, description, symbol, temple, signature stat and skills, then benefits by Tier of Devotion. |
| `carl-debuff` | A debuff: effect, duration and whether it stacks. |
| `carl-damage-type` | A damage type and its rarity. |
| `carl-achievement` | An achievement: its text, loot box and contents. |

### Two ways to feed a block

**From the note's properties (recommended — and required for any note `carl-actions` links to).** Put the data in the note's properties and leave the block empty:

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

### Source footer

Every card ends with where it came from, from `source` and `page`:

```yaml
source: Core Rulebook   # or Homebrew
page: 212               # a range or list works too: 104–106
```

→ *Core Rulebook, p. 212*. Either can be left out; with neither, there's no footer.

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
devotion: acolyte          # Tier of Devotion: acolyte | devotee | zealot
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
earth: true                     # an Earth race or class: a 🌎 after the name
class-type: Mage, Necromancer   # classes only: the "Class Type:" line
size: medium
bonuses:
  dexterity: 5             # also: evade, dr, move, step — negative for detriments
stat-points:               # points the crawler splits between these stats
  points: 3
  stats: [str, dex, con]
skills:
  climbing: 2
  performance:
    rank: 2
    notes: with a stringed instrument specialty
  "[[Bite]]": F            # a natural attack: Rank = Floor
abilities:
  - +3 Web Spell, which costs half the normal Mana to cast
  - You have an innate Climb Move equal to your normal Move value
```

Rendered like the book: `Class Type: Mage, Necromancer`, the description, `Size: Medium (4)`, `+5 Dexterity` (bonuses of the same amount share a line: `+2 Intelligence and Dexterity`, `−2 Constitution and Charisma`), `+3 points split between Strength, Dexterity, or Constitution`, `+2 Climbing and Performance (with a stringed instrument specialty) Skills`, then each ability.

**Natural attacks** are attack skills granted at rank `F`: the skill's rank on the sheet is the crawler's `floor`, whatever they've trained, and it shows on the race or class card as "Bite Skill at Rank = Floor". Give the skill its own note with the die, stat and damage type, and one more die at Rank 5, 10 and 15:

```yaml
check: evade
attack: melee
stat: str
base-damage: 1d6 + STR Piercing     # 1d6 (Moderate) or 1d8 (Major)
upgrades:
  5: +1d6 base damage
  10: +1d6 base damage
  15: +1d6 base damage
```

The crawler records how they split the points, and the sheet adds them to the unenhanced stats (the tooltip shows "+2 Barbarian (split)"). Points not split yet are listed in the Racial / Class abilities panel. `move` and `step` bonuses are added to the crawler's listed Move and Step.

```yaml
race-stats: { dex: 2, con: 1 }
class-stats: { str: 3 }
```

Every build-point benefit and detriment from the race and class rules is listed in [docs/race-class-benefits.md](docs/race-class-benefits.md), with where each one goes on the note.

**Pets** use creature properties. **Mounts / vehicles** use `hp-slots`, `hp-current`, `size`, `occupants`, `move`, `dr` and `accessories`; each health slot is worth the vehicle's size value (1–8). **Deities** show their description and their benefits by tier (see below).

**Sponsors** (`carl-sponsor`) have a `name`, `description` and the crawlers they sponsor — on the sponsor's own card and on every sponsored crawler's sheet. Crawlers are found automatically from any note whose `sponsors` links to the sponsor with a `[[link]]` (read from Obsidian's link index, not by scanning the vault); list others (without notes) in `crawlers`:

```yaml
name: Valtay Corporation
description: Pays well for spectacle.
crawlers:
  - Some crawler without a note
```

**Deities** (`carl-deity`):

```yaml
title: The Blessed Oak Mother
description: …
symbol: …
temple: Sacred Grove of the Divine
high-cleric: Arkangel Debadora
offering: A single tear shed in sadness
rival: "[[Nekhebit]]"
likely-sponsor: The Dream
signature-stat: intelligence
signature-skills: ["[[Catcher]]", "[[Shield]]"]
tier-benefits:
  acolyte: [ … ]
  devotee: [ … ]
  zealot: [ … ]
```

On the crawler, `devotion: acolyte | devotee | zealot` is their Tier of Devotion. The sheet's Deity panel shows it, with every tier's benefits and the ones not reached yet dimmed. Without `devotion`, all tiers show.

**Debuffs** (`carl-debuff`):

```yaml
effect: Roll all Skill Checks that require sight with Disadvantage.
duration: Until the end of the next round.
stackable: false
categories: [damage]
mechanics:
  disadvantage: sight      # all | attacks | sight | next-check | next-attack
  check-penalty: -2
  damage: 1d6+F Fire
  move-multiplier: 0.5
  cant-act: true           # also: no-move, no-step, no-spells, no-heal, no-dex-mod,
                           #       attacked-with-advantage, halve-highest-stat
```

A crawler's `debuffs` can name or link debuff notes (`- "[[Blinded]]"`, `- Blinded`, or `- Blinded: 2 rounds`). The sheet shows each one with its effect, and its duration on hover.

**Damage types** (`carl-damage-type`) have a `rarity`. **Achievements** (`carl-achievement`) have `text`, `loot-box` and a `contents` list. Contents can link to item notes, with a count:

```yaml
loot-box: Bronze I'm Wet Box
contents:
  - "[[Scroll of Water Breathing]]": 10   # shown as "10 × Scroll of Water Breathing"
  - "[[Pliers]]"
  - A bucket of pink glitter               # plain text works too
```

Tagging notes (`carl/creature`, `carl/character`, `carl/item`, `carl/race`, `carl/class`…) makes them easy to collect in a Base.

## Skills and spells — `carl-skill`, `carl-spell`

Give each skill or spell its own note, then list it on a crawler under `skills:` or `spells:` with the crawler's rank:

```yaml
skills:
  - "[[Dagger]]":
      rank: 5
spells:
  - "[[Heal Others]]":
      rank: 2
```

The note says how it's checked and supplies the stat, damage and upgrades; the crawler's entry can still override `stat`.

```yaml
quote: It's like a headbutt, only cooler.
check: evade             # passive | opposed | unopposed | stat | evade (an attack)
attack: melee            # attack only: melee | ranged
stat: str                # to-hit stat; attacks default to STR (melee) or DEX (ranged)
opposed-by: int          # opposed only: the antagonist's stat (defaults to `stat`)
range: 30 feet           # attack only; leave out for melee (5 feet)
ai-favor: 1
limitations: On Success, you lose 1 Health Bar slot.
cooldown: 1 round
description: …
base-damage: 1d4 + CON Bludgeoning
effects: …               # anything besides damage
upgrades:
  5: +1d4 base damage, and this Attack deals Armor-Piercing damage (ignores DR).
  10: +1d4 base damage, …
  15: +1d4 base damage, …
```

Every skill and spell card follows the book: name, quote, the stat or keywords line ("Melee Attack, Str"), then Mana Cost, Range, Duration, AI Favor, Limitations, Cooldown, Heals, the description, Base Damage, Effects and Upgrades — each line only when it's set.

**Passive skills** attach to an attack instead of being rolled:

```yaml
check: passive
applies-to: "[[Pugilism]]"   # skill/attack names or links, or a kind: melee | ranged
optional: true               # chosen per attack (Aiming); otherwise always on (Iron Punch)
add-rank: true               # adds this skill's rank to the to-hit
disadvantage: true           # applying it means rolling with Disadvantage
base-damage: 1d2             # extra base dice (doubled on a Critical Hit)
damage: 1d4                  # extra bonus damage on a hit
```

Always-on passives are folded into the attack's to-hit and damage on the sheet and in the widget; optional ones are checkboxes on the attack in the widget. Using the attack marks the passive ✔.

Upgrades are read for damage: **"+1d4 base damage"** (with or without the +), **"+1d4 damage"**, and **"Add 1 Rank damage die"** — the dice for the skill's current rank from Table 37 (rank 5 → +1d4, rank 15 → +1d8 & +1d6).

Spells add `quote`, `keywords` (the italic line, e.g. `Attack, Fire`), `mana-cost`, `range`, `duration`, `cooldown` and `heal` (dice of Health Bar slots).

- Each upgrade reached that says **"+1d4 base damage"** adds that die to the damage, so a rank-10 Dagger rolls `1d4 + 1d4 + 1d4 + STR`.
- Attack skills and spells appear in the sheet's Attacks table with to-hit and damage worked out; spells get their own Spells table.
- Races and classes grant spell ranks the same way as skills: `spells: { web: 3 }` → "+3 Web Spell".

## Actions widget — `carl-actions`

A play panel for session notes: the party stacked on the left, the opponents on the right.

> [!IMPORTANT]
> **Crawlers, mobs and NPCs must keep their data in properties.**
> The widget reads each linked note's **properties** only. A note whose stats live in YAML inside a `carl-character` / `carl-creature` block (rather than in the note's properties with an empty block) shows up with no stats, health or attacks. Move the YAML into the note's properties and leave the block empty — see [Two ways to feed a block](#two-ways-to-feed-a-block).

````markdown
```carl-actions
party:                 # crawler notes; `sheet:` works for one, and it defaults to the page itself
  - "[[Carl]]"
  - "[[Donut]]"
opponents:             # name: note — the name tells two of the same mob apart
  Llama A: "[[Bad Llama]]"
  Llama B: "[[Bad Llama]]"
targets:               # saved when a crawler picks a target; defaults to the first opponent
  Carl: Llama A
floor: 3               # F; defaults to this page's `floor`, then the first crawler's
```
````

Plain lists of links work for both (`- "[[Bad Llama]]"`); repeats are named "Bad Llama 2" and so on. Each crawler's panel has **Target** buttons, one per opponent; their attacks and opposed checks go against the one they pick, and the targeted opponent shows a badge with the crawler's name. Each opponent shows its health, debuffs, stats and attacks; every attack has an **Evade** button for each crawler (rolling that crawler's Evade against its to-hit) and a **Damage** roll.

**Mob and NPC notes are never changed.** Their health and debuffs for the fight are saved into the block itself, so every encounter on a page keeps its own state:

````markdown
```carl-actions
party: ["[[Carl]]"]
opponents:
  Llama A: "[[Bad Llama]]"
  Llama B: "[[Bad Llama]]"
encounter:
  Llama A: { hp: 2, debuffs: [Burning] }
  Llama B: { hp: 3 }
```
````

**Reset** on an opponent clears its entry. Each crawler's health, mana, debuffs, skill marks and hotlist are written to that crawler's own note.

**PvP:** put a crawler note under `opponents` and it gets a full crawler panel on the right, with its own **Target** buttons for the party. A crawler's Evade is a roll, not a number, so an attack on a crawler rolls the defender's Evade (d20 + DEX mod + buffs) as the target — both rolls appear in the toast and the log. Opposed checks use the defender's enhanced stat mods. Like the party, an opposing crawler's health, mana and debuffs are written to their own note.

````markdown
```carl-actions
party: ["[[Carl]]"]
opponents:
  Frank: "[[Frank Q]]"
targets:
  Carl: Frank
  Frank: Carl
```
````

| Section | Does |
| --- | --- |
| Roll | Normal, Advantage or Disadvantage (2d20, keep the higher/lower) for every roll. A passive that brings Disadvantage cancels Advantage. |
| Target | Leave empty for the rules' difficulty — stat check 10 + F, unopposed 10 + 2F, opposed 10 + the target's stat mod + F, attack vs its Evade (rolled, for a crawler) — or type a number to override. Every roll gets a Degree of Success; natural 20 and 1 always count. |
| Health | Click a slot to set current health; click the last remaining slot again to lose it. The heading shows what a slot is worth (the CON mod). Crawlers save `hp-current` on their note; opponents save to the block's `encounter`. |
| Mana | −, +, Full — writes `mana-current`. |
| Debuffs | Add or remove debuffs — the crawler's `debuffs`, or an opponent's `encounter` entry. |
| Checks | Each stat (d20 + stat mod) and, for crawlers, Evade (d20 + DEX mod + buffs). Mob Evade shows its target number. |
| Skills | d20 + rank + stat mod against the difficulty for the skill's `check`; attack skills roll to hit and damage. Passives attached to an attack are checkboxes on that attack (always-on ones are already included); other passives just record the use. Any use marks the skill ✔ (`checked: true`). |
| Spells | Every spell has a Cast button: spends `mana-cost` (refused if there isn't enough), then rolls like a skill — attack spells roll to hit and damage, heals roll their `heal` dice. |
| Attacks | Crawler attacks and attack skills: d20 + rank + stat mod to hit against the targeted opponent's Evade, then damage on a hit — a Critical Hit doubles the base dice, an Amazing Success adds F. Optional passives (Aiming) are checkboxes here. |
| Opponents | Each opponent's attacks show their to-hit, with **Evade** (the crawler rolls against it) and **Damage**. |
| Hotlist | **Use** takes one from the matching inventory item's `quantity`; at 0 it stays in the inventory and leaves the hotlist. |

Formulas understand `F` (floor), `S` (size value) and stat mods (`1d4 + STR`). Every roll pops up as a notice in the corner (10 seconds, click to dismiss) and is appended to the page under **## Roll log**, e.g.
`- 14:05 · Carl · **Pugilism**: d20[13] + 6 rank + 4 Str = **23** vs 15 → **Amazing Success**`.

## Callouts

A family of "system interface" callouts, typed like any built-in callout:

| Callout | For | Default title |
| --- | --- | --- |
| `> [!ai]` | The System AI speaking or describing something | System AI |
| `> [!achievement]` | Achievements; the last paragraph is styled as the reward | New achievement! |
| `> [!loot\|gold]` | Loot boxes, coloured by tier: `bronze`, `silver`, `gold`, `platinum`, `legendary`, `celestial` | Gold box |
| `> [!quest]` | Quests | New quest |
| `> [!notification]` | System messages ("The floor collapses in 3 days") | Notification |

```markdown
> [!achievement] Smush!
> You killed a mob by dropping something heavy on it.
>
> Reward: You've received a Bronze Box!
```

Write your own title after the type to replace the default.

## Mob forge

A sidebar panel that rolls a starting statblock for a mob or boss, then turns it into a note. Open it from the dice icon in the ribbon or the **Open mob forge** command.

1. Set the **Floor** and **Rank** (Mob, Neighborhood, Borough, City, Province, Country or Floor Boss). Changing either suggests a **Level** in the typical range for that floor, shown under the field; type over it or select the wand for another suggestion.
2. Pick a **Size**, **Type**, **Role** and **Armor**. The role decides where stat points go and which attacks the mob gets: Brute (Strength, Constitution, melee), Skirmisher (Dexterity, ranged), Caster (Intelligence, spells), Sneak (Dexterity and Intelligence), Showboat (Charisma) or an even spread.
3. Select **Roll**. The preview draws the result as a `carl-creature` card. Roll again until one fits.
4. Select **Create note** to make a note in your mobs folder from the mob template, with every property filled in, or the copy icon to put the same note on the clipboard. Your copy of `mob.md` in the templates folder is used when there is one, so your own body text and callouts stay.

The numbers follow the build rules in the Core Rulebook's guide to creating your own Mobs and Bosses:

| Entry | Rule |
| --- | --- |
| Stats | Mobs start at 1 in each stat with 3 points per Level. Bosses start at 5 with 3–10 points per Level by tier. |
| Health slots | Mobs: Level, up to 10. Bosses: 10, 15, 20, 25, 30 or 40 by tier, + Floor. Each slot is worth the CON mod. |
| Surprise / Evade | 10 + INT / 10 + DEX, then +F |
| To hit | 10 + the attack's stat mod, then +F |
| Damage | Dice count by Level (1d at 1–4 up to 15d at 250+), d6 standard, + the stat mod. Area attacks and attacks with a debuff lose 1d. |
| DR | The floor number, +1–2 for armor or hide, −1–2 for casters |

Attacks are labelled by kind (*Melee attack*, *Ranged attack*, *Spell*) for you to rename. Their damage types, ranges, areas and debuffs are picked at random, weighted by how often each appears in the rulebook's statblocks. The stat spread, die sizes and debuffs change on every roll; the rest is the rules above.

### Traits

Traits are never rolled. The **Traits** section of the panel starts empty; select **+** to add one with a name and details, and **×** to remove it. Traits you type are kept when you roll again and go into the note. With none, `traits:` is left empty.

To add a trait to a note later, open it and run **Add trait to this note**. The trait is added to the note's `traits` list (replacing the template's `trait name: details` placeholder) and the rest of its properties are left as they are.

## Templates and commands

| Command | Does |
| --- | --- |
| **Create template files** | Writes a template for every type — `mob`, `npc`, `pet`, `crawler`, `item`, `race`, `class`, `skill`, `spell`, `mount`, `sponsor`, `deity`, `debuff`, `damage-type`, `achievement` — into your templates folder, with every property stubbed out. Existing files are never overwritten, so your edits survive. |
| **Open mob forge** | Opens the [mob forge](#mob-forge) panel in the right sidebar. |
| **Add trait to this note** | Adds a trait to the open note's `traits` list. |
| **New mob**, **New NPC**, **New crawler**, … | Asks for a name and creates the note in that type's folder (`mobs/`, `npcs/`, `crawlers/`…), then opens it. Uses your copy of the template from the templates folder when there is one, otherwise the built-in one. |

`{{title}}` and `{{date}}` in a template are filled in, the same placeholders the core Templates plugin uses — so the files also work with **Templates: Insert template**.

In **Settings → Dungeon Crawler Carl** you can set the templates folder (empty = the core Templates folder, else `_templates`) and the folder for each type of new note.

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
  main.ts                 registers the blocks, commands and the mob forge view
  blocks/
    shared.ts             LiveBlock (properties/YAML + live updates), health bar, attacks
    creature.ts           carl-creature
    reference.ts          carl-item, carl-race, carl-class
    character/            carl-character: model (calculations), top, sections, panels, ui
  forge/
    tables.ts             build rules (Tables 50, 51) and weighted attack tables
    generate.ts           rolls a mob or boss from the panel's options
    frontmatter.ts        writes a rolled mob into the mob template
    traits.ts             Add trait command and modal
    view.ts               the sidebar panel
  rules/                  stat mods, size table, item links and bonuses, skill bonuses
```

### Releasing

```bash
npm version patch          # bumps manifest.json + versions.json and tags (no "v" prefix)
git push --follow-tags
```

Pushing the tag builds the plugin and creates a draft GitHub release with the plugin files attached; publish it from the Releases page.
