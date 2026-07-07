# Spell Automation Evaluation Criteria

The core question for every spell: **would automating this spell do something that vanilla dnd5e on Foundry does not already do, in a combat situation?**

A spell earns an `automate` verdict only when **both** are true:

1. **Combat-relevant.** The spell is used in battle (attack, damage, defense, battlefield control, combat buffs/debuffs). Spells that are mostly roleplay, exploration, utility, or social get `skip` — even if some logic could technically be automated.
2. **Has internal logic beyond the vanilla roll.** Vanilla dnd5e already handles attack rolls, save DCs, damage rolls, cantrip scaling, upcast scaling, measured templates, concentration tracking, and applying damage from the chat card. If the spell is "roll to hit, deal damage" or "save or take damage" — vanilla covers it, `skip`. Automation is warranted when there is *conditional* or *stateful* logic: something must be created, tracked, modified, or reacted to.

## Decision checklist

Work through these in order for each spell:

1. Is this spell ever cast during combat to affect combat? **No → skip (social/roleplay/utility).**
2. Strip the spell to its mechanics. Is it fully expressed as one attack/save + damage/healing roll that dnd5e's activity system already performs? **Yes → skip (vanilla handles it).**
3. Does the spell involve any of the following? **Yes to any → strong `automate` candidate:**
   - **Creates or modifies an item/resource** (a conjured weapon whose damage scales with slot — Shadow Blade pattern).
   - **Reacts to later events** (something happens when the target is attacked, moves, is healed — Blade Ward, Booming Blade, Chill Touch patterns).
   - **Rewrites or augments a roll conditionally** (extra damage only under a condition, damage substitution, roll penalties/bonuses that depend on state).
   - **Places or manages a persistent scene object with lifecycle** (light, region, aura tied to concentration — Darkness pattern).
   - **Stateful ongoing effect with non-trivial rules** (ability substitution on rolls, suppressing healing — Bladesong, Chill Touch patterns).
   - **Requires a choice at cast time that changes behavior** (pick a weapon, pick a mode — Booming Blade, Darkness patterns).
4. Is the automatable part so minor that a description note suffices (e.g. advantage in dim light)? **Yes → skip (not worth it),** or mention it as a "notes only" item inside another proposal.

## Worked examples (canonical verdicts)

These are approved reference verdicts. Match new spells against them by analogy.

| Spell | Verdict | Reasoning |
|---|---|---|
| **Shadow Blade** | automate | Needs custom logic vanilla can't do: conjure a weapon item into inventory, control its damage by slot level, clean up on concentration end. (Already implemented in this module — the gold standard.) |
| **Lightning Bolt** | skip | Vanilla already handles everything: template, saves, damage, upcasting. Nothing special needed. |
| **Blade Ward** ('24) | automate | Reactive logic vanilla lacks: when an attack targets a creature with Blade Ward active, roll 1d4 and subtract it from the attack roll, with a pretty chat card. Runs fully on the attacker's client (reading the target's effects is a plain read; the attacker modifies their own roll) — only needs an attack-roll event, so flag `feasibility: needs-new-event`. |
| **Druidcraft** | skip | Mostly a roleplaying spell; no combat mechanics to automate. |
| **Booming Blade** | automate | Ask which weapon is used for the casting, make the attack with it, add the spell's extra damage by character level; optionally an effect noting the move-trigger damage. |
| **Chill Touch** ('14) | automate | On hit, apply an effect to the target that reduces all healing to 0 until the end of the caster's next turn. Stateful, reactive, vanilla can't do it. |
| **Eldritch Blast** | skip | Simple roll and damage; vanilla handles beams and scaling. |
| **Guidance** | skip | Used almost entirely in social/skill encounters, not battle. |

## Feasibility flags

The framework currently exposes only the events listed in `framework-capabilities.md`. A good proposal states which event it uses. When the natural implementation needs an event that does not exist yet (attack rolls, saves, movement, turn start/end, being targeted), still propose it but set:

- `feasibility: ready` — implementable with existing events and client-side permissions.
- `feasibility: needs-new-event` — name the missing trigger (e.g. `attackRollComplete`, `turnEnd`); the framework README explicitly allows adding events.
- `feasibility: needs-gm-or-rights` — requires scene/document rights the acting player may lack (like Darkness point zones), typically served by a socket handler on the GM client. Not a rejection, just a flag.

**Graceful degradation is mandatory.** An automation must NEVER block, cancel, or gate a cast or roll because some part of it can't run (no GM online, missing rights, no valid target selected). It is always better to let the player roll and resolve the rest manually than to forbid the action and frustrate them. Every `needs-gm-or-rights` proposal must state its no-GM fallback in `notes` — usually: let the cast proceed normally and, where an actor can carry it, place a visible marker effect with the computed rule in its description; otherwise skip the automated part entirely. Chat reminder cards are NOT an acceptable fallback (user decision 2026-07-07 — they are table noise). A proposal that says "prevent the cast unless X" is wrong; rewrite it.

Reacting to a *target's* effects (Blade Ward pattern) is simpler than it looks: world data is replicated to every client, so the acting client can always **read** any actor's effects, and it can always modify **its own** rolls and chat messages. Such proposals need only the missing attack-roll event (plus target-based matching in the registry) — flag `needs-new-event`. Sockets or GM presence are required only when the automation must **mutate** the other actor's documents, e.g. a ward that is consumed or expires when triggered — flag those `needs-gm-or-rights` and say what must change on the other actor.

## Version differences

When a spell has multiple source versions (PHB'14 vs PHB'24) with different mechanics, evaluate each: the verdict and proposal may differ per version (Blade Ward '14 is flat resistance — plain active effect; '24 is a reactive 1d4 penalty — real automation). State which version the proposal targets.

## Calibration

Be conservative. The module's philosophy (see README) is a small set of high-value automations, each with lifecycle handling and per-item settings — not blanket coverage. When torn between `automate` and `skip`, ask: *would a player at the table notice and appreciate this automation during a fight?* If the honest answer is "rarely", skip it.
