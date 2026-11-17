# Fantik's Automations

A standalone automation framework for the dnd5e system in Foundry VTT.

Current supported platform: **Foundry VTT 14 / dnd5e 6.x**. Reload all player and GM clients after updating to 0.5.0.

## Universal spell cards (API 4)

`game.modules.get('fantik-automations').api.spellCards` now supports any spell, feature, or item without requiring its Item document. Pass the save ability (`str`, `dex`, `con`, `int`, `wis`, or `cha`), DC, and target tokens. Each recorded target gets its own GM save button. Damage cards retain the live native **Apply Damage** tray, with typed rolls and target UUIDs. No HP changes happen on cast, render, or save; application remains an explicit GM action. Save-only, damage-only, multi-target and untargeted cards are supported. Existing Toll the Dead cards still work through a legacy adapter.

Example inside a macro, after its picker has resolved `caster`, `targets`, and `dc`:

```js
const cards = game.modules.get('fantik-automations')?.api?.spellCards;
const damage = await new CONFIG.Dice.DamageRoll('2d6', {}, {type:'fire'}).evaluate();
await cards.createCard({
    caster,
    targets, // Token objects, TokenDocuments, or {actor, token, name, img} UUID descriptors
    save: {ability:'dex', dc, onSave:'half'},
    damageRolls: [damage],
    content: '<div style="padding:10px"><strong>Назва закляття</strong><div data-fantik-save></div></div>'
});
```

The caller chooses the caster (selected token first, assigned character fallback), values, and optional resource consumption; the card API performs no item lookup, slot checks, or resource mutation. For a complete standalone macro, detect the optional module and retain normal chat/roll output when unavailable. `createCard` accepts already evaluated `DamageRoll`s, preserves roll privacy, awaits Dice So Nice if present, then posts once with duplicate playback suppressed. Do not animate those damage rolls separately before calling it. With no `damageRolls`, it creates a chat/save-only card; with no `targets`, it shows no enemy-specific controls.

`buildCardData(options)` returns the same message data without publishing or animating. Use it when the macro already manages its own dice lifecycle; the caller must then handle DSN timing and skip flags. Both helpers wrap content in `.fantik-spell-card` and include damage totals and all dice by default. Set `showRolls:false` only if your custom content already displays every damage die. Optional `[data-fantik-save]` and `[data-fantik-damage]` slots place GM controls within your layout; otherwise they are appended. No flavor text is generated.

`rollRecordedSave(message, {targetUuid, event, button})` is also public. It only runs for a GM viewing a supported card and resolves the exact recorded token, including its synthetic actor. No implicit use of the GM's selected token. `targetUuid` may be omitted only for one recorded target. Native save dialogs, actor bonuses, and Dice So Nice remain system-managed. `save.onSave` records `none`/`half`/`full`, but these standalone cards do **not** automatically reconcile save outcomes with damage multipliers: the GM chooses the appropriate multiplier in the native tray before applying damage.

`getWounded({targetUuid, actorUuid, sceneId, signal})` now accepts the assigned caster or another actor owned by the requesting user, including an owned selected token's synthetic actor. It still returns only wounded/not-wounded, requires an active GM for player queries, and rejects hidden/off-scene targets. Failure should lead to manual health-state selection, never prevent casting.

Verification: `node --test tests/spell-cards.test.cjs` covers API behavior, permissions, exact targets, wound queries, and dice publication. `node --test tests/spell-cards-dom.test.cjs` requires Playwright with Chrome (or `PLAYWRIGHT_CHANNEL`) and checks real browser DOM/button behavior. These are not multi-client live Foundry tests. The older bundled spell macros below retain their original workflows; adopting API 4 does not rewrite installed world macros.

**Zero dependencies.** No socketlib, no midi-qol:

- **Client-side automations.** Existing roll automations run on the acting player's client. Spectator windows use Foundry's built-in module socket. The optional themed Toll the Dead macro asks an active GM for enemy wound status; manual d8/d12 selection remains available without a GM.
- **No midi-qol.** Triggers hook the dnd5e system's native chat cards. Vanilla dnd5e applies damage from the rolls stored on the damage card, so replacing those rolls changes exactly what targets take — nothing else about the system's behavior is altered.

## Included automations

### Existing Serpent Tongue macro

Module 0.4.1 adds `macros/serpent-tongue.js` / `.json`. Paste the JS into **Manage macros** on the assigned character's spell, or import the JSON as a Script macro. Requires an Attack activity; ambiguous casting/attack activities are chosen explicitly. First use consumes configured casting resources, stores the chosen spell level and a 60-second source effect, then publishes a themed snake card. **Укусити** or subsequent use opens a draggable click picker with **Без цілі**, advantage/disadvantage and a damage bonus. Repeated bites do not consume another spell slot. A separate bite activity can consume its configured per-bite resources; a single shared activity treats its non-action resource costs as initial casting costs.

Attack rolls use the native activity API. Piercing damage follows the spell description, `(slot level - 2)d12`, with native critical settings; extra damage can be entered in the picker. All dice remain in the message and are displayed after Dice So Nice completes locally. The GM retains the native Apply Damage tray and an explicit **Отруїти** action for the recorded target. Poison uses the native condition factory, respects configured condition immunity, and expires with the original cast. Active-GM cleanup follows game time/combat and source-effect deletion, leaving unrelated poison effects intact. Targetless cards have no target-bound controls. Source state persists across reloads; old cards cannot reuse an expired cast. Range, line of sight and hit adjudication remain manual; snake animation is silent and local. `tests/serpent-tongue.test.cjs` and the development browser preview cover this workflow with mocked game APIs; multi-client live execution still needs verification.

### Use macros instead (Foundry 14 / dnd5e 6.x)

On an owned item, feature or spell, open its context menu and choose **Use macros instead**. Paste Script macro code and save. Once configured, the entry is called **Manage macros**; an enabled replacement has a green label, background accent and icon. The code is stored on that item's `flags.fantik-automations.useMacroInstead` (`command` and `enabled`); no world Macro document is created. World Items directory entries support the same editor. Compendium entries are excluded; import the item first. Editing and execution require the user's Script Macro permission, but owners can still view and disable a replacement after losing that permission.

- Click **Manage macros** to edit the saved code. Enable/disable the replacement using the checkbox inside the editor and save, or use its **Вимкнути підміну** button to immediately restore normal item use without deleting code. Disabled macros keep their Manage entry. There is no separate enable/disable context-menu entry. The editor's disable button works even with invalid code or without Script Macro permission.
- Enabled replacements execute locally as the clicking user, before the standard item use dialog, resource consumption, chat card and effects. Direct activity use is also intercepted. The macro must handle any spell slots, charges, effects or chat output it needs. A failed macro does not fall back to an unintended normal cast.
- The macro receives `item` (the clicked item), `itemActor` (its owning actor), `activity` (for direct activity use), and `event`. Standard `actor`/`character` use `game.user.character`; `token` is resolved only from that character's tokens. No unrelated selected token is used as the caster. Use `itemActor` explicitly when a macro is intended to act as the item's owner instead.
- Repeated/recursive calls for the same item are blocked while its macro is running. Do not call that item's `use()` from its replacement to invoke the standard behavior; disable the replacement first. “Display in Chat”, editing, and direct attack/damage roll methods are not replaced.
- This explicit item-use replacement is separate from the “Disable my automations” setting. Use its checkbox to disable it.

Implementation uses the cancellable `dnd5e.preUseActivity` hook plus a guarded wrapper around `CONFIG.Item.documentClass.prototype.use` (there is no pre-use item hook in the inspected versions). No libWrapper dependency is required. Reload clients after updating. Menu icons must contain exactly one HTML element: the running Foundry 14 renderer skips an entire entry if its icon contains multiple roots, and makes the icon inert. Version 0.3.12 removes the embedded menu checkbox that caused Manage macros to disappear. `node --test tests/item-macros.test.cjs tests/spell-cards.test.cjs` covers replacement, cancellation, permissions, recursion, persistence and existing spell cards. Browser regression checks use the actual renderer fetched from the running server and reproduce the old missing-entry bug before checking the fix.

### Existing themed Toll the Dead macro

Import [`macros/toll-the-dead.json`](macros/toll-the-dead.json), or paste [`macros/toll-the-dead.js`](macros/toll-the-dead.js) into a Script macro. Reload clients after updating the module. No extra module or socketlib is needed.

- Uses the user's assigned character and click-to-select targeting. Drag the compact picker by its title. **Без цілі** casts without a target for social scenes (d8 by default; choose wounded in ⚙ for d12), without a wound query, token animation, GM save button or damage application tray. Silent bell artwork, per-viewer light/dark cards, all rolled dice shown after Dice So Nice completes locally.
- Standalone Script macros work without a spell Item, using the assigned character and their DC. When an Item exists, the macro resolves its configured activity and costs; multiple matching Items or activities offer an explicit choice. A single non-save activity is supported too. A cost-free cantrip without activities remains usable, but configured charges or other costs without an activity produce a configuration warning. Manage macros supplies the originating Item/activity directly. Configured resource consumption uses the system API once after selection; cancelling is free and failed consumption blocks the roll.
- Creates a native `DamageRoll` of type `necrotic` with the selected target recorded. Version 5.3.3 uses base messages with `flags.dnd5e.roll` and actor UUIDs in `flags.dnd5e.targets`; 6.x uses `damage` messages and `system.targets`. Both retain the exact token for the save button. Requires module 0.3.13+ (spellCards API 3). For targeted casts, the module preserves the themed card and the original dnd5e damage tray for GMs. Players do not get this tray. HP changes only when the GM clicks **Apply**; the native system handles damage traits and multipliers.
- For the GM, the compact **Мудрість / КС …** block is clickable. It rolls a native dnd5e saving throw for the exact token recorded in the card, with its bonuses and the standard dialog for advantage/disadvantage. Changing the GM's selection does not change the save target. A deleted target produces a warning; cancelling or closing the roll dialog releases the button. Apply Damage remains a separate manual action. Earlier cards without the compact slot retain a separate save button.
- For unobserved actors, `game.modules.get('fantik-automations').api.spellCards.getWounded(...)` asks the designated active GM for a boolean wound condition. Exact HP is never included in responses. Requests are scoped to the requester's assigned or owned caster and scene, reject hidden targets for players, time out after eight seconds, and can be cancelled.
- Without an active GM or readable state, the picker stays open and asks for an explicit d8/d12 choice. It never silently assumes full HP. Saves remain manual: apply damage on failure, 0 on success.
- These helpers are separate from the old unregistered `tollTheDead` automation. The old after-roll d8 replacement is not enabled by this integration.

Checks: `node --test tests/spell-cards.test.cjs` covers GM routing, limited responses, invalid targets, timeout and cancellation. The matching macro/browser checks are development artifacts in the originating task workspace. Multi-client live Foundry execution still needs verification.

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

## Plutonium integration

With Plutonium enabled, Fantik's Automations can import pasted 5e.tools links onto an actor sheet or into the world directory. Toggle: **"Plutonium: paste 5e.tools links to import"** in module settings (per-client, default on).

When **1d20-ua-plutonium** is active, Fantik's Automations does not register its paste handler, so only that module handles imports. This also applies if paste import is turned off in that module's settings. With **1d20-ua-plutonium** disabled or absent, Fantik's own paste handler is available again after reload. Items translated by **1d20-ua-plutonium** keep their English name in `flags.1d20-ua-plutonium.nameEn`, and legacy built-in automation matching checks that flag as well as the item name. The public macro catalogue uses the stricter current-name dictionary matching described below.

## Binding automations to items

Automations match in two scopes. Matching is case-insensitive and uses "contains", so renamed items like `Gambler's Blade, Pact Weapon` still match `Gambler's Blade`:

- **Item scope** (`match.itemNames`) — the item that triggered the event matches by name. Used for weapons/spells with special behavior.
- **Actor scope** (`match.actorItemNames`) — the *acting actor owns* an item with a matching name. Used for features/effects that react to everything the actor does.

### Manage Automations: public macro catalogue (0.7.0)

**Use macros instead / Manage macros → Public automation → Save** publishes a snapshot
under the item's current name, visible to every user in this world. Publication is
independent of enabling the macro on the author's item. Each author owns their own
catalogue entries; two authors may publish different macros with the same name.

**Manage Automations** now lists only public macros, with author, version and readable
source code. Bundled automations are hidden from this catalogue and its recommendations;
their registry, settings, explicit bindings, automatic routing and existing effects are
unchanged. No old item flags are migrated or removed by this UI change.

A green Manage Automations context entry means a public macro matches the item's name.
Matching is exact after normalizing case and whitespace. With **1d20-ua-plutonium** active,
its public translation data API supplies English/Ukrainian/bilingual equivalents. Only
the CURRENT name is matched against the dictionary; stale `nameEn` flags on renamed
items never grant a match. Translation data loads in the background after ready; without
it, exact matching still works. No translation module files or item names are changed.

Selecting **Використовувати** saves an independent replacement macro on the owned item.
A different existing script requires confirmation before replacement. Applying never
executes the script. Normal item use later executes it as the clicking user, subject to
Script Macro permission. Public names do not auto-enable or auto-execute macros.

Author edits update the publication on Save while Public automation remains checked.
Installed copies never update silently. Reopen the catalogue and choose **Оновити копію**
to replace a copy explicitly. Unchecking Public automation or choosing **Зняти публікацію**
removes discovery only; installed copies retain their code and enabled state. Authors
can unpublish through the catalogue even if the original item has been deleted.

Public snapshots are stored in the author's world User flag
`flags.fantik-automations.publicAutomations`; installed code remains on the Item in
`useMacroInstead`, with source/version metadata. Include world data in backups. Deleting
a User removes their publications, but does not remove installed Item copies.

Validation: `node --test tests/public-automations.test.cjs tests/item-macros.test.cjs`.

### Flags (scripting)

The legacy built-in runtime still honors these item flags, which scripts can set directly:

```js
// Explicitly apply automations to an item, regardless of its name
item.setFlag('fantik-automations', 'automations', ['gamblersBlade']);

// Exclude specific name-matched automations from this item
item.setFlag('fantik-automations', 'disabledAutomations', ['darkness']);

// Per-item automation settings (see "Per-item settings" below)
item.setFlag('fantik-automations', 'settings.gamblersBlade', {multiplier: 3});
```

The legacy single-binding flag is still honored: `automation: 'someId'` acts as one explicit binding, `automation: 'none'` suppresses all name matching for the item. The public macro catalogue does not modify these legacy bindings.

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
- `spellCards.getWounded({targetUuid, actorUuid, sceneId, signal})` — cancellable GM-assisted wound-condition lookup for themed spell macros; returns a boolean, never HP.
- `spellCards.createCard(options)` / `spellCards.buildCardData(options)` — generic themed save/damage cards; see API 4 above.
- `spellCards.rollRecordedSave(message, {targetUuid, event, button})` — GM-only save for a recorded token using the card's ability and DC.

## Module layout

```
scripts/
  module.js                    entry point
  framework/
    constants.js               MODULE_ID
    registry.js                automation registry + item matching
    triggers.js                native-hook -> automation-event bus
    sockets.js                 P2P socket bus (no GM relay)
    spell-cards.js             themed damage cards and scoped GM wound queries
    settings.js                per-automation enable toggles
    manager.js                 "Manage Automations" item UI + context menus
    utils.js                   dialogs, secure RNG
    plutonium-paste.js         paste 5e.tools links unless 1d20-ua-plutonium is active
  automations/
    _index.js                  list of bundled automations
    gamblers-blade/            first bundled automation
templates/casino/              handlebars templates
styles/casino.css              casino UI styling
```


### Альтернативні токени (0.8.0)

Open **Альтернативні токени** from the token HUD (images icon) or the character
sheet's **⋮** menu. The shared library lives on the world Actor, including when
opened from an unlinked/synthetic token. Only owners of that Actor can manage it.

- **Додати зображення**: name and path, with a native FilePicker to select or upload
  an image into an existing permitted directory. Native Browse/Upload permissions
  apply; the module does not create directories or change filesystem permissions.
- **Стандартний токен**: the current Actor prototype image is always first, cannot be edited/deleted in the gallery, and can be applied to the selected scene token.
- **Керувати зображеннями** (sliders): rename, replace image, or delete a library entry (the file is retained).
- Click a thumbnail to set only `texture.src` on the selected TokenDocument on the
  current scene. The gallery closes after success. The original image is saved
  before it is replaced, if not already in the library.
- No portrait, prototype token, token scale/size, other scene, or other token is
  updated. The scene-token image change persists in the world.
- Opening from the HUD targets that token. From the sheet, one available token is
  selected automatically; several require an explicit choice. Without a token,
  library editing remains available, while applying is disabled.

API: `game.modules.get('fantik-automations').api.alternativeTokens.open(actor, tokenDocument)`.
Tests: `node --test tests/alternative-tokens.test.cjs`. Native ApplicationV2 browser
checks use fixture documents, not live-world token updates.

Version 0.8.1 refreshes the alternative-token gallery with larger thumbnails and
an empty state showing the selected token. HUD integration supports the native,
dnd5e and base placeable HUD render hooks without duplicate buttons.
When `foundry-quick-upload` is active and exposes `api.openDialog`, **Quick Upload**
opens its uploader. A document adapter saves the uploaded path to the Actor's
alternative-image library; it never changes the real Actor portrait or prototype.
Applying the uploaded image remains an explicit thumbnail click.
