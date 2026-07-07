# Framework Capabilities Baseline

Condensed from the module README and `scripts/framework/triggers.js`. Use this to decide what vanilla dnd5e already covers (→ skip) and what the fantik-automations framework can implement (→ automate, with a named trigger event).

## What vanilla dnd5e (5.x) on Foundry already handles — never propose automating these

- Attack rolls vs AC, including advantage/disadvantage dialogs.
- Saving throw DCs and save request buttons on chat cards.
- Damage rolls, damage types, critical doubling, and **applying damage from the damage chat card**.
- Cantrip damage scaling by character level; leveled-spell upcast scaling via the slot picker.
- Measured template placement for area spells.
- Concentration: starting it, prompting saves on damage, ending it (and deleting effects linked to it).
- Active effects a spell can express declaratively: flat bonuses/penalties to AC, abilities, speeds; resistances/immunities; conditions applied via enchantment/effect riders.
- Spell slot consumption, ritual casting, material component tracking.

A spell that is fully expressed by the above needs **no automation**.

## What the framework adds (existing automations prove these patterns)

- **Rewrite damage rolls on the card** — `setDamageRolls(rolls)` replaces the rolls vanilla applies to targets (Gambler's Blade).
- **Create/update/delete items in the caster's inventory**, with damage controlled by cast level and cleanup on concentration end (Shadow Blade).
- **Suppress or alter the vanilla usage flow** before the dialog — e.g. cancel the measured template and place something else (Darkness, via `spellCastConfigure`).
- **Place and manage scene objects with lifecycle** — lights, scene regions, token-attached auras, tied to concentration (Darkness). Point placements may need scene rights or an online GM.
- **Apply active effects with custom roll-time logic** — e.g. swapping `@mod` on weapon rolls while an effect lasts (Bladesong).
- **Dialogs and choices at cast time** — ask the player a question and branch (Darkness mode choice; Booming Blade weapon choice would follow this pattern).
- **Custom chat cards** with Handlebars templates and CSS.
- **Peer-to-peer sockets** for cross-client displays without a GM relay (casino spectator windows).
- **Per-item settings** exposed in the Manage Automations UI.

## Trigger events available today

| Event | Fires | Key context |
|---|---|---|
| `spellCastConfigure` | Before the usage dialog; may mutate usage/dialog config; must be synchronous | `activity`, `item`, `actor`, `usageConfig`, `dialogConfig` |
| `spellCastComplete` | Once per cast (hit or miss), before attack/damage rolls, on the casting client | `castLevel` (upcast-aware, cantrip = 0), `baseLevel`, `message` |
| `damageRollComplete` | After a damage roll card is created, on the rolling client | `damageRolls`, `damageTotal`, `setDamageRolls(rolls)` |
| `featureUseComplete` | Once when a feat-item activity is used | `activity`, `item`, `actor`, `message` |

**Not available yet** (README: "more events can be added as needed"): attack-roll events, save events, movement, turn start/end, being-targeted. Proposals may rely on these but must flag `feasibility: needs-new-event` and name the event.

## Hard constraints

- **Never block the player.** Automations enhance actions; they must not gate them. If a required capability is unavailable at runtime (no GM online for a socket-handled write, missing scene rights), the cast/roll proceeds vanilla and the automation degrades to a visible marker effect for manual resolution, or skips the part entirely — never a chat reminder card. Blocking a cast because automation can't complete is never acceptable.
- **GM-less by design.** Automations run on the acting player's client with that player's permissions. A player can always update their own chat message and own actor/items; they generally cannot create scene documents or modify other players' actors. Anything touching another actor's documents needs a socket handler on that actor's owner client, or GM presence — flag it.
- **Reads are always allowed; writes are not.** World data is replicated to every client, so the acting client can freely read any actor's effects/items — e.g. check whether the attack's *target* has Blade Ward and adjust the attacker's own roll accordingly, all on the attacker's client. Sockets or a GM are needed only to **mutate** documents the acting player doesn't own (consume/expire an effect on the target, apply an effect to an enemy). Reactive proposals like Chill Touch (apply an effect *to the target* on hit) fall in this second bucket unless the GM client or the target's owner cooperates via a socket handler.
- **Matching is by item name** (case-insensitive contains), item scope or actor scope, so a proposal only needs the spell's name(s) — including localized names if relevant (existing automations match Ukrainian names too). Note: reacting to the *target's* state (Blade Ward pattern) inverts this — the attacker triggers the event, but the relevant effect is on the target. That needs a new match scope (e.g. target-effect matching) alongside the new event; mention it in the proposal's notes.
