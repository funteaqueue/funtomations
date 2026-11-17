# Fantik Automations integration

Source snapshot inspected 2026-11-17: [fantik-automations 0.8.4](https://github.com/funteaqueue/funtomations), Foundry 14 / dnd5e 6.x. Source: `scripts/module.js` and `scripts/framework/` in that repository. Tests cover mocked behavior and browser DOM interactions; this is not a claim of end-to-end multiplayer validation. Reinspect installed code when versions change.

## Public API and optional capabilities

`module.js` exposes the following after `ready`:

```js
const mod = game.modules.get('fantik-automations');
const api = mod?.active ? mod.api : undefined;
// api: {registry, AutomationManager, sockets, spellCards, serpentTongue, partyMaps, alternativeTokens, utils}
```

- `api.spellCards.version === 5` retains the API 4 methods `buildCardData`, `createCard`, `rollRecordedSave`, and `getWounded`; generic card details follow below.
- `getWounded({targetUuid, actorUuid, sceneId, signal})` returns a Promise of a boolean, never exact HP. The caster may be the assigned character or another actor owned by the requester, including a selected token's synthetic actor. No GM, timeout, or rejected target needs manual healthy/damaged selection, not a blocked cast.
- `api.serpentTongue.version === 1`; `use({item, activity, action, castId})` is an older spell-specific workflow. It still assumes an assigned character, an owned spell, and configured activities/resources. Do not use it as the default standalone macro implementation or let those restrictions override the nonblocking casting, selected-caster, and optional-consumption rules in `SKILL.md`.
- `api.utils.applyEffectToActor(actor, effectData)` handles module-flagged effects locally or via GM; returns `'applied'`, `'relayed'`, or `false`. Relayed does not mean confirmed applied. Same-named module markers may be replaced. `api.utils.deleteDocument(doc)` handles module-flagged documents and returns `'deleted'`, `'relayed'`, or `false`. These are effect/document helpers, not generic damage application.
- `api.registry`, `api.AutomationManager`, and `api.sockets.{registerSocketHandler, emitToOthers}` are framework extension facilities. Do not register ad-hoc socket commands in a player macro as a substitute for installed GM-side support. Read `framework/registry.js` and `framework/sockets.js` before extending the framework.

`framework/item-macros.js` implements **Manage Macros / Use macros instead** for items/features/spells. It supplies macro context including `actor`, `token`, `speaker`, `item`, `itemActor`, `activity`, and `event`. Treat that as optional binding context; resolve the actual caster using the current skill priority, and never consume another actor's item resources. Standalone macros must not require this context.

## Generic cards: API 4+ / card metadata version 2

Use `api.spellCards.createCard({content, caster, casterToken, targets, save, damageRolls, rollMode, showRolls})` for any spell, item, or feature:

- `caster` is the actor resolved by the selected-token-first rule; optional `casterToken` supplies its exact scene instance. No Item lookup, slot check, resource consumption, or automatic HP change occurs.
- `targets`: Token objects, TokenDocuments, or `{actor, token, name, img}` UUID descriptors. Duplicates are removed. Omit/empty for untargeted use, which has no target-bound controls.
- `save`: optional `{ability, dc, onSave}`; ability is one of `str/dex/con/int/wis/cha`, DC is the caster's resolved DC, onSave is `none/half/full`. Invalid save metadata omits the control, not the card.
- `damageRolls`: already evaluated, typed `CONFIG.Dice.DamageRoll` objects. The helper does not evaluate/reroll them. Omit for a save-only/chat-only card. Rolls become a native dnd5e 6 `damage` message with `system.targets` and appropriate `system.onSave`.
- `content`: themed HTML, wrapped in `.fantik-spell-card`. Foundry sanitizes it on message creation. No flavor prose is added. By default all damage dice and totals are appended; `showRolls:false` is appropriate only if custom content already displays every actual damage die.
- `rollMode` defaults to the current core setting. The helper applies privacy, awaits Dice So Nice when present, and suppresses duplicate playback on publication. Do not separately animate these rolls before calling it.

`buildCardData(options)` returns the same data without publication or animations. When using it, the macro owns DSN timing/skip flags and must preserve all dice/privacy. If the module is absent, keep a plain/native card path; no macro should reject a cast because API 4 is missing.

For the current compact design, use `showRolls:false` when the themed card supplies inspectable totals with complete hover tooltips; do not append duplicate raw-dice rows. See [ui-design.md](ui-design.md). For one updating sequential card, the native tray must receive only the current step's damage rolls and current recorded targets. Preserve older attacks/damage in the serialized history and roll anchors rather than passing every prior DamageRoll to the tray, which would sum them. The user chose this existing API 4/native Apply approach over custom damage/healing buttons; a UI-only task does not imply a module upgrade.

Optional `[data-fantik-save]` and `[data-fantik-damage]` slots place controls inside the custom layout; otherwise controls append to the card. The GM gets one save button per recorded target and the original native `damage-application` element for damage messages. Players get the themed content/rolls only. No damage element is fabricated if the system did not render one.

`rollRecordedSave(message, {targetUuid, event, button})` uses the recorded ability/DC and exact token actor. It requires a GM viewing the message, rejects UUIDs not recorded in the card, and locks duplicate clicks until the native save completes or is cancelled. Omitting targetUuid works only for one target. Never use the GM's current controlled token as the save target.

**Save outcomes do not automatically set damage multipliers for standalone cards.** onSave records the rule, but there is no native activity outcome workflow to reconcile it. The GM selects the appropriate 0/half/full multiplier and explicitly applies damage. Native damage application handles damage traits. Do not claim automatic save-to-damage adjudication.

## Stored contract and legacy compatibility

Generic flags: `flags['fantik-automations'].spellCard = {version:2, targets, save, damage}`. Save-only cards retain targets in these flags; native damage cards use `system.targets`. The renderer is registered on `dnd5e.renderChatMessage`; it uses `.fantik-spell-card` and optional control slots, not a spell name or kind.

Old Toll the Dead `{kind:'toll-the-dead',version:1}` cards with `.fantik-toll-card` and `flags.world.fantikTollTheDead` are adapted to the common renderer/handler as Wisdom saves. This compatibility adapter is the only reason to use that old metadata. New spells use version 2.

`framework/serpent-tongue.js` remains a separate older spell-specific workflow. Do not route new generic macros through it. Installed world macros are not automatically rewritten by a module update.

For changed integrations, verify player-created cards on a GM client, exact target identity, privacy, no automatic HP writes, and no loss of casting when the helper module or GM is unavailable.

## Additional capabilities in 0.8.4

- API 5 also exports `spellCards.applyRecordedAttack(message, {entryId, kind, multiplier})`. This is a GM-only action for an existing version-3 attack-chain entry, not a general-purpose damage function. `kind` is `damage` or `healing`; multiplier is 0.5, 1 or 2. It requires the recorded evaluated DamageRoll and exact target. A persistent receipt prevents reapplying an entry, including uncertain writes. Inspect `framework/spell-cards.js` and `tests/attack-chain.test.cjs` before creating version-3 metadata; `createCard` still builds version 2, not an attack chain.
- Version-3 cards can show current-AC hit hints only to the GM. Players do not receive hidden AC/HP. These hints are not final adjudication and do not automatically apply damage. Default new cards to manual adjudication unless this workflow is requested.
- **Use macros instead / Manage Macros** binds a macro to an item. **Public automation** publishes a copy of the macro for the world's catalogue; editing the original is not a live update to published copies. Exact names match; when available, `1d20-ua-plutonium` supplies EN/UK name equivalence. Do not register built-in automations to publish a player macro.
- `api.alternativeTokens.open(actor, tokenDocument)` opens the actor's image library. The optional token identifies the scene instance. Applying changes only that token's `texture.src`, not the portrait or prototype. The prototype image is the first gallery entry. Optional Quick Upload integration adds library images.
- Shared party maps provide a persistent M hotkey, team selection and uploads up to 10 MiB. They are a player-facing module feature, not a spell-targeting API. See `PARTY-MAPS.md` in the repository for storage and permissions.

Check the exact method rather than rejecting all future API versions:

```js
const mod = game.modules.get('fantik-automations');
const cards = mod?.active ? mod.api?.spellCards : undefined;
if (typeof cards?.createCard === 'function') {
  // Pass evaluated rolls and recorded targets as documented above.
} else {
  // Preserve the standalone/native chat-card path.
}
```
