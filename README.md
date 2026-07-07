# Fantik's Automations

A standalone automation framework for the dnd5e system in Foundry VTT.

**Zero dependencies.** No socketlib, no midi-qol:

- **No GM required.** Automations run entirely on the client of the player who made the roll. Rewriting the damage card works because a user may always update their own chat message. Spectator windows are synced with Foundry's built-in module socket, which broadcasts peer-to-peer through the server — no GM client acts as a relay.
- **No midi-qol.** Triggers hook the dnd5e system's native chat cards. Vanilla dnd5e applies damage from the rolls stored on the damage card, so replacing those rolls changes exactly what targets take — nothing else about the system's behavior is altered.

## Included automations

| Automation | Matches | What it does |
|---|---|---|
| Gambler's Blade | The item named `Gambler's Blade` (item scope) | After rolling damage, offers to gamble the damage total in a casino minigame (coinflip or roulette, chosen 50/50). The damage card is rewritten with the winnings. Other connected players get a live spectator window. |
| Незрозумілий магічний ефект | Actors owning an item named `Незрозумілий магічний ефект` (actor scope) | Whenever the actor casts any spell (hit or miss), rolls healing to chat: cast level × d4 for leveled spells (upcasting counts), flat 1 for cantrips. |
| Darkness | A spell named `Darkness` / `Темрява` (item scope) | On cast, asks whether the darkness is an **aura** (attached to the caster's token light, moves with them) or a **point** zone (a darkness AmbientLight placed by canvas click). The spell's vanilla measured-template placement is suppressed — the darkness source itself shows the area. Both modes get a **scene region** as a control handle, named after the cast: point zones a static circle, auras a token-attached emanation that follows the caster (v14). Delete the region to remove the darkness and end the caster's concentration; drag a point-zone region to move the zone. Deleting the light directly cleans up the same way. Creates a real *darkness source*: with Vision 5e, normal sight and darkvision are blocked while Devil's Sight and Truesight see through. Ends automatically when concentration ends. Point zones need scene rights or an online GM (Foundry restriction); auras are fully GM-less. |
| Bladesong | A feature named `Bladesong` / `Пісня клинка` (item scope) | Using the feature starts the song: an **active effect** on the actor grants an **AC bonus equal to the Intelligence modifier** and **+10 ft walking speed** for 1 minute. While the song lasts, **weapon attack and damage rolls** that would use Strength or Dexterity **use the Intelligence modifier instead** (the `@mod` part is swapped on the roll). Using the feature again restarts the song; delete the effect to end it early. Not automated: ending conditions (incapacitated, medium/heavy armor, shield), advantage on Acrobatics, and the concentration save bonus — the effect's description reminds the player. |
| Shadow Blade | A spell named `Shadow Blade` / `Тіньовий клинок` (item scope) | On cast, puts a **Shadow Blade weapon** (simple melee, finesse, light, thrown 20/60, magical, psychic damage) into the caster's inventory. Damage scales with the slot: 2d8 at 2nd, 3d8 at 3rd–4th, 4d8 at 5th–6th, 5d8 at 7th+. Recasting reuses the existing blade (updates its damage) instead of creating a duplicate. The **Attack/Damage buttons are stripped** from the spell's usage chat card — attacks are rolled from the weapon item, not the spell. When concentration ends the blade is deleted. Per-item settings: the attack/damage **ability** (automatic finesse, a fixed ability, or spellcasting) and the **concentration behavior** (delete the blade, or create it once and keep it). Advantage vs. targets in dim light/darkness is not automated — it's noted in the blade's description. |

Each automation has an on/off toggle in **Module Settings** (world scope, GM controlled).

## Vision 5e compatibility

Vision 5e (as of 3.1.3) lets Devil's Sight see through magical darkness (darkness sources with priority < 100) but blocks Truesight against *all* darkness sources — contrary to RAW and to Vision 5e's own config hint. This module patches the Truesight detection mode to use the same priority-100 line-of-sight fallback as Devil's Sight. Toggle: **"Truesight sees through magical darkness"** in module settings (default on, requires reload).

## Plutonium integration: paste 5e.tools links to import

With [Plutonium](https://5e.tools) enabled, copy a 5e.tools link (e.g. `https://5e.tools/spells.html#fireball_phb`) and paste it (Ctrl+V) into Foundry:

- Paste **over an open actor sheet** (pointer on it, or focus inside it) — spells, items, feats, and optional features are imported straight onto that actor.
- Paste **anywhere else** (e.g. the sidebar) — the content is imported into the world directory, using Plutonium's usual folder rules.
- **Bestiary** links always import as world actors.

Supported pages: `spells`, `items`, `feats`, `optionalfeatures`, `bestiary`. Multiple links in one paste are imported in order. Pastes into text fields and editors are never intercepted. Uses the same Plutonium import pipeline as its Rivet browser extension, including your loaded homebrew sources. Toggle: **"Plutonium: paste 5e.tools links to import"** in module settings (per-client, default on).

## Binding automations to items

Automations match in two scopes. Matching is case-insensitive and uses "contains", so renamed items like `Gambler's Blade, Pact Weapon` still match `Gambler's Blade`:

- **Item scope** (`match.itemNames`) — the item that triggered the event matches by name. Used for weapons/spells with special behavior.
- **Actor scope** (`match.actorItemNames`) — the *acting actor owns* an item with a matching name. Used for features/effects that react to everything the actor does.

### Manage Automations (UI)

Right-click any item — in the **Items sidebar** or on a **dnd5e actor sheet** (works for feats, spells, weapons, anything) — and pick **Manage Automations**. Requires ownership of the item.

- **List view** — every registered automation, searchable; active ones are green-highlighted and sorted to the top. Rows are tagged `name match` when the automation applies via name matching and `off in settings` when the world toggle is off.
- **Detail view** — click a row to see the automation's description, an **Apply to this item / Remove from this item** toggle, and its per-item settings (saved on change). Removing a name-matched automation stores an explicit exclusion on the item.

Automations control their own availability in this UI via two definition fields:

- `selectable: false` — never offered for manual apply/remove (name matching still works). Default `true`.
- `gmOnly: true` — only a GM can apply/remove/configure it. Players don't see it in the list, except read-only (lock tag, no toggle, disabled settings) when it's already active on their item. Default `false`.

### Flags (scripting)

The UI writes these item flags, which you can also set directly:

```js
// Explicitly apply automations to an item, regardless of its name
item.setFlag('fantik-automations', 'automations', ['gamblersBlade']);

// Exclude specific name-matched automations from this item
item.setFlag('fantik-automations', 'disabledAutomations', ['darkness']);

// Per-item automation settings (see "Per-item settings" below)
item.setFlag('fantik-automations', 'settings.gamblersBlade', {multiplier: 3});
```

The legacy single-binding flag is still honored: `automation: 'someId'` acts as one explicit binding, `automation: 'none'` suppresses all name matching for the item. The UI migrates it to the new flags on first change.

Open the manager from a macro: `game.modules.get('fantik-automations').api.AutomationManager.open(item)`.

And bind actor-scoped automations to an actor regardless of owned items:

```js
actor.setFlag('fantik-automations', 'automations', ['incomprehensibleMagicalEffect']);
```

## Writing a new automation

Automations are plain objects registered with the framework registry. Ship them in `scripts/automations/<name>/` and add them to `scripts/automations/_index.js`, or register from a world script / another module via the hook:

```js
Hooks.on('fantik-automations.register', registry => {
    registry.register({
        id: 'myAutomation',
        name: 'My Automation',
        description: 'Shown in the Manage Automations UI.',
        version: '1.0.0',
        selectable: true,   // optional (default true): offer in the Manage Automations UI
        gmOnly: false,      // optional (default false): only a GM can apply/remove/configure
        match: {itemNames: ['My Item']},
        settings: [   // optional, see "Per-item settings"
            {key: 'multiplier', name: 'Multiplier', hint: 'Damage multiplier.', type: 'number', default: 2, min: 1, max: 10, step: 1}
        ],
        events: [
            {
                event: 'damageRollComplete',
                priority: 50,
                handler: async context => {
                    // context: {event, message, actor, item, activity,
                    //           damageRolls, damageTotal, setDamageRolls}
                    const doubled = await new Roll(`${context.damageTotal * 2}`).evaluate();
                    await context.setDamageRolls([doubled]);
                }
            }
        ],
        init: () => {
            // optional: register socket handlers, preload templates, etc.
        }
    });
});
```

### Per-item settings

An automation can declare a `settings` array; the fields appear in the Manage Automations detail view and are stored per item under the `settings.<automationId>` flag. Supported types: `text` (default), `number` (`min`/`max`/`step`), `checkbox`, `select` (`choices: {value: 'Label'}`). Keys must be simple identifiers (no dots).

Handlers receive the resolved values (stored value or field default) as `context.settings`. Note: values resolve from the **triggering item**, so settings are meaningful for item-scope automations; actor-scope automations just get the defaults.

### Trigger events

| Event | Fires | Context |
|---|---|---|
| `damageRollComplete` | After a dnd5e damage roll card is created, on the rolling client only | `message`, `actor`, `item`, `activity`, `damageRolls`, `damageTotal`, `setDamageRolls(rolls)` |
| `spellCastConfigure` | When a spell activity use begins, before the usage dialog and any consumption/placement. Handlers may mutate `usageConfig`/`dialogConfig` (e.g. suppress the measured template) and **must be synchronous** | `activity`, `item`, `actor`, `usageConfig`, `dialogConfig`, `messageConfig` |
| `spellCastComplete` | Once when a spell is cast (hit or miss, before attack/damage rolls), on the casting client only | `activity`, `item`, `actor`, `castLevel` (upcast-aware, cantrip = 0), `baseLevel`, `usageConfig`, `results`, `message` |
| `featureUseComplete` | Once when a feature (feat item) activity is used, on the acting client only | `activity`, `item`, `actor`, `usageConfig`, `results`, `message` |

More events (attack rolls, saves, activity usage) can be added in `scripts/framework/triggers.js` as needed.

### Framework API

Available after `ready` at `game.modules.get('fantik-automations').api`:

- `registry` — register/inspect automations
- `sockets.registerSocketHandler(event, fn)` / `sockets.emitToOthers(event, ...args)` — peer-to-peer messaging, namespace your events (e.g. `'myAutomation.thing'`)
- `utils` — `confirm(title, content)`, `secureRandomInt(max)`, `secureRandomPick(array)`

## Module layout

```
scripts/
  module.js                    entry point
  framework/
    constants.js               MODULE_ID
    registry.js                automation registry + item matching
    triggers.js                native-hook -> automation-event bus
    sockets.js                 P2P socket bus (no GM relay)
    settings.js                per-automation enable toggles
    manager.js                 "Manage Automations" item UI + context menus
    utils.js                   dialogs, secure RNG
    plutonium-paste.js         paste 5e.tools links to import via Plutonium
  automations/
    _index.js                  list of bundled automations
    gamblers-blade/            first bundled automation
templates/casino/              handlebars templates
styles/casino.css              casino UI styling
```
