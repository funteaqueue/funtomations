# Spell Automation Proposals — cantrips.txt, 2026-07-06

Evaluated 108 spells: 35 automate, 73 skip.

## Proposed automations

### Bacterial Barrage (Cantrip, SCGtD)
**Pitch:** Auto-swap the necrotic die to 1d12 when the target is poisoned or diseased.
**Behavior:** You cast Bacterial Barrage and make the normal ranged spell attack. On the damage step the automation checks the target's active conditions; if the target is Poisoned (or flagged with a disease) it rewrites the damage roll from Nd8 to Nd12 before damage is applied. If the target has neither condition, the roll stays 1d8. A small chat note states which die was used and why.
**Trigger:** damageRollComplete (with setDamageRolls); reads the target's effects/conditions · **Feasibility:** ready
**Settings:** Toggle for whether GM-defined "disease" flags/effects count in addition to the Poisoned condition.
**Notes:** Runs entirely on the caster's client — reading target conditions is a plain replicated read, and only the caster's own damage rolls are rewritten. "Disease" has no canonical dnd5e status, so it is matched by configurable effect name/flag; if no target is selected, leave the roll at 1d8 and post a reminder.

### Blood Bolt (Cantrip, TCM'14 & TCM'24 — identical)
**Pitch:** On a hit, automatically grant the caster temp HP equal to their proficiency bonus.
**Behavior:** You cast Blood Bolt and make the ranged spell attack as normal. When the attack hits and damage is dealt, the automation reads your proficiency bonus and applies that many temporary hit points to you (respecting 5e's no-stacking rule, keeping the higher value), then notes it in chat. On a miss, nothing is applied.
**Trigger:** damageRollComplete on the casting client (used as the hit signal), applying temp HP to the caster's own actor · **Feasibility:** ready
**Settings:** Toggle to auto-apply vs. only post a reminder; option to always take the higher of current/new temp HP automatically.
**Notes:** The caster only writes to their own actor, so no GM or socket is needed. If the framework can't confirm a hit cleanly, degrade to a chat reminder rather than applying on a miss.

### Claws of Darkness (Cantrip, TftS)
**Pitch:** Conjure a 10-foot-reach cold-damage claw as a usable weapon item for the concentration duration.
**Behavior:** On cast, the automation creates a temporary weapon item ("Claws of Darkness", 1d10 cold, 10-foot reach, spell attack) in your inventory so you can make the melee spell attack repeatedly on later turns from the sheet. When concentration ends, the conjured weapon is automatically deleted. Mirrors the Shadow Blade lifecycle pattern.
**Trigger:** spellCastComplete to create the item; concentration-end cleanup hook · **Feasibility:** ready
**Settings:** none
**Notes:** Caster owns their own inventory, so item creation/cleanup runs fully client-side like Shadow Blade. Damage is fixed 1d10 (no scaling), so only the item lifecycle needs automating.

### Ferocious Strike (Cantrip, HGtMH)
**Pitch:** Pick the weapon you're striking with, roll that weapon's attack, and on a hit add 1d4 (level-scaled) of the weapon's damage type.
**Behavior:** When you cast Ferocious Strike you're asked which of your weapons to attack with, and the automation makes that weapon's attack roll. On a hit it appends the spell's bonus damage — 1d4 scaling to 2d4/3d4/4d4 at levels 5/11/17 — using the same damage type as the chosen weapon, merged into the damage card. On a miss it does nothing extra.
**Trigger:** spellCastConfigure (weapon choice) and spellCastComplete / damageRollComplete (append the bonus damage) · **Feasibility:** ready
**Settings:** none
**Notes:** Follows the Booming Blade weapon-choice pattern and uses setDamageRolls to fold in the extra dice with the weapon's type; runs entirely on the caster's client.

### Green-Flame Blade (Cantrip, TCE)
**Pitch:** Ask which weapon casts the spell, roll that weapon's attack, add scaling fire damage, then apply fire damage to a second creature.
**Behavior:** On cast the player is asked which melee weapon they are using; the automation makes that weapon's attack against the primary target. On a hit it adds the level-scaled extra fire damage (1d8 at 5th, 2d8 at 11th, 3d8 at 17th) and rolls the secondary fire damage (spell mod, or 1d8+mod scaling) for a chosen second creature within 5 feet. Damage is delivered through the normal chat cards.
**Trigger:** spellCastConfigure/spellCastComplete for the weapon choice and attack; damageRollComplete with setDamageRolls to inject the scaling fire damage · **Feasibility:** ready
**Settings:** Default weapon selection; whether to prompt for the second target or leave it as a note.
**Notes:** Mirrors the Booming Blade proposal. Secondary-target selection can stay a description prompt if no target picker is wired. All damage stays on the caster's own cards — no cross-client writes.

### Shillelagh (Cantrip, PHB'24 — also covers PHB'14)
**Pitch:** Buff your club/quarterstaff so it uses your spellcasting mod, a larger die, and ('24) a chosen damage type for the duration.
**Behavior:** When you cast Shillelagh, the automation asks which held club or quarterstaff to imbue and applies an effect to it. While active, melee attacks with that weapon substitute your spellcasting ability on attack and damage rolls (Bladesong-style @mod swap) and change the damage die to a d8 (scaling to d10/d12/2d6 at levels 5/11/17 for '24). The '24 version also lets you pick Force or the weapon's normal damage type. The effect cleans up when the spell ends or is recast.
**Trigger:** spellCastComplete (apply the weapon effect and prompt the weapon/damage-type choice); roll-time ability substitution rides on a custom active effect like Bladesong · **Feasibility:** ready
**Settings:** Toggle automatic ability substitution; toggle '24 damage-die scaling; default damage-type choice.
**Notes:** Reuses the existing Bladesong ability-substitution pattern and applies only to the caster's own weapon item — no GM or sockets. If no valid held club/quarterstaff is detected, degrade to a chat reminder rather than blocking the cast. The "ends if you let go of the weapon" clause is left as description text.

### Sorcerous Burst (Cantrip, PHB'24)
**Pitch:** Auto-resolve the exploding d8 damage dice, rerolling on each 8 up to your spellcasting modifier's worth of extra dice.
**Behavior:** You cast and make the ranged attack as normal. On the damage roll, the automation detects each d8 that rolled an 8 and adds another d8, repeating while 8s come up but capping the added dice at your spellcasting ability modifier. It rewrites the damage card with the exploded total (and chosen damage type) so the correct number gets applied.
**Trigger:** damageRollComplete with setDamageRolls(rolls) to append the extra dice and rewrite the card · **Feasibility:** ready
**Settings:** Toggle the auto-explode behavior; default damage type.
**Notes:** Runs entirely on the caster's own roll and chat message (Gambler's Blade pattern) — no GM or sockets. If the roll structure can't be parsed, degrade to a reminder to add exploding d8s manually.

### Toll the Dead (Cantrip, XGE & PHB'24 — identical)
**Pitch:** Swap the damage die to 1d12 automatically when the target is already wounded.
**Behavior:** The player casts Toll the Dead and rolls damage as normal. The automation reads the targeted creature's current hit points; if the target is missing any HP it replaces the rolled d8s with the equivalent d12s, otherwise it leaves the d8s in place. The corrected damage total appears on the chat card ready to apply.
**Trigger:** damageRollComplete (with setDamageRolls to substitute the dice); reads target actor HP · **Feasibility:** ready
**Settings:** Toggle auto-substitute vs. just post a reminder; per-item enable.
**Notes:** Reading target HP is a plain cross-client read and the caster modifies only their own damage card — no GM or socket. If no target is selected or HP is unknown, fall back to the vanilla 1d8 roll plus a chat note "use 1d12 dice if the target is wounded" — never block the roll.

### True Strike (Cantrip, PHB'24)
**Pitch:** Make the casting weapon's attack using your spellcasting modifier, with optional radiant damage and level scaling.
**Behavior:** On cast the player is asked which held weapon they are striking with (Booming Blade pattern). The automation makes that weapon's attack but substitutes the caster's spellcasting ability for Strength/Dexterity on both attack and damage, and asks whether to deal radiant or the weapon's normal damage type. On a hit it adds the extra radiant damage for the caster's level (1d6 at 5, 2d6 at 11, 3d6 at 17).
**Trigger:** spellCastConfigure / spellCastComplete for the weapon and mode choice; damageRollComplete to inject the ability swap and bonus radiant dice · **Feasibility:** ready
**Settings:** Default damage-type choice (radiant vs. weapon) so the dialog can be skipped; per-item enable.
**Notes:** All rolls and edits are on the caster's own client and items — no GM needed. The PHB'14 version (concentration, advantage on next turn's first attack) is intentionally left un-automated: it needs a not-yet-existing next-turn attack-roll event and is a famously low-value spell. If the caster holds no valid weapon, degrade to a chat reminder.

### Blade Ward (Cantrip, PHB'24)
**Pitch:** While Blade Ward is up, subtract 1d4 from every attack roll made against the warded creature.
**Behavior:** When any creature makes an attack roll against a target that has Blade Ward '24 active, the automation rolls 1d4 and subtracts it from that attack roll, showing a small chat card explaining the ward. The subtraction happens on the attacker's own client by reading the target's effects, so it works without the ward's owner being online. The effect persists for the concentration duration.
**Trigger:** attackRollComplete (does not exist yet); target-effect matching so the attacker's roll is modified based on the defender's effect · **Feasibility:** needs-new-event (attackRollComplete)
**Settings:** none
**Notes:** Requires an attack-roll event plus a target-effect match scope (the event fires on the attacker but the relevant effect is on the target). No writes to the defender are needed — no GM or socket required. Fallback: chat reminder that attackers subtract 1d4. The '14 version is a declarative resistance active effect and is intentionally left to vanilla.

### Booming Blade (Cantrip, TCE)
**Pitch:** Attack with the chosen weapon, add scaled thunder damage, and flag the move-triggered damage.
**Behavior:** On casting, the automation asks which melee weapon you're using and makes that weapon's attack against the target. On a hit it applies the weapon's normal damage plus, at level 5+, the extra thunder damage (1d8/2d8/3d8 by tier). It then places an effect on the target noting the booming-energy rider so that if the target willingly moves it takes the movement damage (2d8/3d8/4d8 by tier), surfaced as a reminder since there is no movement event.
**Trigger:** spellCastConfigure/spellCastComplete for the weapon choice and attack; damageRollComplete to fold in the extra thunder damage · **Feasibility:** needs-new-event (movement/turn event for the rider)
**Settings:** Default weapon to skip the prompt when only one melee weapon is equipped; toggle for the move-trigger effect vs. description-only.
**Notes:** The weapon choice, attack, and on-hit thunder damage are ready with existing events. The move-triggered damage cannot fire automatically without a movement/turn event and is intentionally left as an effect + chat reminder. Applying the rider effect to an enemy target needs the target's owner or GM via socket; with no GM online, degrade to a chat reminder only.

### Cat's Spring (Cantrip, CBT)
**Pitch:** Pick Slashing or Force at cast time, resolve the melee spell attack, and flag advantage on your next attack against the target.
**Behavior:** When you cast Cat's Spring, a dialog asks whether the claw deals Slashing or Force damage and sets the damage type accordingly. The attack and 1d8 (scaled) damage resolve as normal. On a hit, the automation applies a short-lived effect to you (or a chat reminder) granting advantage on your next attack roll against that specific target before the end of your next turn.
**Trigger:** spellCastConfigure for the damage-type choice; spellCastComplete/damageRollComplete to detect the hit and post the advantage effect · **Feasibility:** needs-new-event (attackRollComplete with target matching)
**Settings:** Toggle the advantage-tracking effect vs. chat-reminder-only; default damage type.
**Notes:** Cleanly consuming the conditional advantage on the next attack against that target needs an attackRollComplete event with target matching; absent that, degrade to an active effect on the caster plus a chat note. The 10-foot jump is left as description text.

### Drayfn's Bane of Excellence (Cantrip, BoET)
**Pitch:** After the target fails its save, cancel the effect of the target's next natural-20 d20 roll (scaling to multiple nat-20s) for the duration.
**Behavior:** You cast the spell and the target makes its Charisma save via the vanilla card. On a failure, the automation tags the target with a counter (1 charge, up to 4 by character level). While concentrating, whenever the target rolls a natural 20 on an attack, ability check, or save, the automation flags that roll as having no effect and decrements the counter, posting a chat card explaining the negation. Charges out or concentration ends → tag clears.
**Trigger:** spellCastComplete to seed the charges on a failed save; a future d20RollComplete event on the target to detect and negate natural 20s · **Feasibility:** needs-new-event (d20RollComplete)
**Settings:** Whether it prompts the caster to confirm each negation vs. auto-applies; charge count derived from caster level.
**Notes:** Requires a d20-roll event that fires for the target and a target-scoped match, neither of which exists. The negation must also mutate/track state on a target the caster doesn't own — needs GM or target-owner cooperation. No-GM fallback: chat reminder resolved manually. What a negated nat-20 means for a check vs. attack is left partly to description text.

### Evil Eye (Cantrip, CBT)
**Pitch:** After the damage lands, mark the target so any attack against it scores a critical hit on 19–20 until the end of your next turn.
**Behavior:** You cast Evil Eye and the vanilla card rolls the 1d4+2 psychic damage. The automation then tags the target with an "expanded crit range" effect. Until the end of your next turn, when any creature attacks the tagged target, the automation checks whether the d20 landed on 19 and, if so, upgrades the strike to a critical hit and flags it on the chat card.
**Trigger:** spellCastComplete to apply the tag after damage; a future attack-roll event with target-effect matching to promote 19s to crits · **Feasibility:** needs-new-event (attackRollComplete)
**Settings:** Toggle crit-range automation vs. chat-reminder-only; whether it applies to Unarmed Strikes and weapon/spell attacks alike.
**Notes:** The damage itself is vanilla. Requires attackRollComplete plus target-effect matching (Blade Ward pattern inverted) — reading the target's tag is a free read on any client; promoting the attacker's own roll to a crit runs on the attacker's client. Applying the tag to a non-owned target needs GM/target-owner via socket, otherwise degrade to the chat reminder.

### Eye Burn (Cantrip, TCM'14 & TCM'24 — identical)
**Pitch:** Cast as a reaction to an attack: prompt the attacker's CON save, then blind on a fail or knock 1d4 off the triggering attack roll on a success.
**Behavior:** When you use Eye Burn as a reaction to a creature attacking you, the automation requests the attacker's Constitution save against your spell DC. On a failed save it applies a Blinded effect until the end of the current turn. On a success it subtracts 1d4 from the triggering attack roll and shows the adjusted result on the attack card. Either way it posts a chat note and reminds you the target auto-succeeds against your Eye Burn for 24 hours.
**Trigger:** attack-roll event on the caster as target, plus spellCastComplete for the reaction cast · **Feasibility:** needs-new-event (attackRollComplete exposing the in-flight roll)
**Settings:** none
**Notes:** Requires an attack-roll event that lets a reaction rewrite the in-flight attacker roll, with target-based matching. Modifying the attacker's own roll is a client-side write the attacker owns, but applying Blinded to the attacker is a write on another actor — needs the target's owner or GM via socket. No-GM fallback: chat reminder; never block the reaction.

### Gust Barrier (Cantrip, HWCS)
**Pitch:** While active, impose disadvantage on ranged attacks against you and trigger a Con save (fling + prone) on any melee attacker who hits you.
**Behavior:** On cast, an effect gives disadvantage to ranged attacks against the caster until end of their next turn (declarative). When a melee attack hits the caster during that window, the automation prompts the attacker for a Constitution save vs the caster's spell DC; on a failure it posts that the attacker is flung up to 10 feet and knocked prone. If the reactive part can't run, the cast proceeds with a chat reminder.
**Trigger:** spellCastComplete to place the effect; a not-yet-existing attack-roll/being-hit event to fire the counter-save · **Feasibility:** needs-new-event (attackRollComplete)
**Settings:** Toggle the ranged-disadvantage effect vs. the melee counter-save independently.
**Notes:** Requires an attack-resolution event plus target-effect matching. The ranged-attack disadvantage could ship as description/effect only; knocking the attacker prone mutates the attacker's actor, so applying prone needs the attacker's client or a GM — degrade to a chat note otherwise. Never block the melee attack itself.

### Infestation (Cantrip, XGE)
**Pitch:** On a failed save, roll the random direction and nudge the target 5 feet automatically.
**Behavior:** The player casts Infestation and rolls the Constitution save via the vanilla card. When the target fails, the automation rolls a d4 for direction (1 north, 2 south, 3 east, 4 west) and posts a chat card announcing the result. If the target can move and the adjacent square is unblocked, it slides the target token 5 feet that way (no opportunity attacks); if blocked, it says so and leaves the token in place.
**Trigger:** spellCastComplete to detect the cast; a save-resolution event to know pass/fail (not available yet) · **Feasibility:** needs-new-event (saveRollComplete)
**Settings:** Toggle auto-moving the token vs. just announcing the rolled direction.
**Notes:** Needs a save-complete event. Moving an enemy token is a write the caster usually can't perform — needs the target owner's/GM client via socket; with no GM online, degrade to a chat note stating the rolled direction. Collision/blocked-direction checks depend on scene walls and may be approximate.

### Lightning Lure (Cantrip, TCE)
**Pitch:** On a failed save, pull the target up to 10 feet toward the caster and gate the damage on the resulting distance.
**Behavior:** The player casts Lightning Lure and the target rolls the Strength save on the vanilla card. On a failure, the automation drags the target token in a straight line toward the caster (up to 10 feet, stopping at obstacles), then checks the final distance: within 5 feet → proceed with the lightning damage roll; still farther → post a note that no damage applies. On a success it does nothing.
**Trigger:** spellCastComplete for the cast; a save-resolution event for pass/fail (not available yet) · **Feasibility:** needs-new-event (saveRollComplete)
**Settings:** Toggle auto-pull vs. announce the pull for manual movement.
**Notes:** Requires saveRollComplete. Pulling the enemy token routes through the target owner's/GM client via socket; with no GM online, degrade to a chat reminder and let the cast and damage proceed normally. Straight-line pathing and wall collision are approximate.

### Mind Sliver (Cantrip, TCE/PHB'14 & PHB'24 — identical)
**Pitch:** Apply a self-expiring -1d4 debuff to the target's next saving throw when Mind Sliver's save fails.
**Behavior:** The player casts Mind Sliver normally; vanilla rolls the Intelligence save and applies the psychic damage. If the target fails, the automation places a short-lived effect on the target that subtracts 1d4 from the next saving throw it makes before the end of the caster's next turn, removing itself once that save is rolled or the window expires. A chat card notes the penalty is active.
**Trigger:** spellCastComplete to detect the cast; a new saveRollComplete event to detect and modify the target's next save · **Feasibility:** needs-new-event (saveRollComplete)
**Settings:** Toggle auto-apply vs. reminder-only; toggle whether the penalty auto-consumes on the first save.
**Notes:** Requires a save-roll event plus target-effect matching. Writing the effect onto an enemy needs the target's owner or GM via socket; with no GM online, degrade to a chat reminder and let the cast resolve vanilla.

### Pins & Needles (Cantrip, HGtMH)
**Pitch:** When the target fails the save by 5 or more, apply disadvantage on its next attack roll.
**Behavior:** The player casts as normal and vanilla resolves the Constitution save and 1d8 psychic damage. The automation compares the save total against the spell DC; if it fails by 5 or more, it applies a short effect giving the target disadvantage on the next attack roll it makes before the end of its next turn, removing itself when that attack is made or the window ends. A chat card reports whether the disadvantage triggered.
**Trigger:** spellCastComplete plus a new saveRollComplete event to read the save margin, and an attackRollComplete event to consume the debuff · **Feasibility:** needs-new-event (saveRollComplete + attackRollComplete)
**Settings:** Auto-apply vs. reminder-only for the disadvantage rider.
**Notes:** Needs a save-roll event exposing the roll total/margin (fail-by-5 check) and an attack-roll event with target-effect matching to consume it; neither exists today. Applying disadvantage to an enemy requires the target's owner or GM via socket — no-GM fallback is a chat note.

### Resistance (Cantrip, PHB'24)
**Pitch:** On the warded ally, automatically reduce the first instance of chosen-type damage each turn by 1d4.
**Behavior:** At cast the player picks which damage type to protect against and touches a willing creature; the automation records the type on a concentration-linked effect. When that creature next takes damage of the chosen type, the automation rolls 1d4 and subtracts it from the incoming total, posting a small chat card, then marks that it has fired this turn. Ends with concentration. The '14 version (add a d4 to one save) is left as description text.
**Trigger:** a damage-application event on the warded target plus a cast-time choice dialog (spellCastConfigure); no damage-taken event exists today · **Feasibility:** needs-new-event (damage-applied-to-actor event)
**Settings:** Toggle auto-reduction vs. reminder-only.
**Notes:** Requires a new "damage about to be applied to actor" event carrying type and total, and a target-effect match scope; mutating another actor's incoming damage may also need the target-owner/GM client. Fallback: effect carries a description plus a chat note. Per-turn reset keys off the warded creature's turn.

### Spore Cloud (Cantrip, HGtMH)
**Pitch:** Auto-apply Poisoned to any target that fails Spore Cloud's Constitution save by 5 or more.
**Behavior:** Player casts Spore Cloud as normal and the vanilla card resolves the CON saves and poison damage. After saves resolve, the automation compares each failing target's save total against the spell DC; for any that missed by 5+ it applies a Poisoned effect lasting until the end of that creature's next turn and posts a chat note naming who is poisoned. Without rights, it posts a reminder listing targets to mark manually.
**Trigger:** spellCastComplete to read the DC/cast, plus a save-resolution event to read each target's save total · **Feasibility:** needs-new-event (saveRollComplete)
**Settings:** Toggle auto-apply vs. chat-reminder only.
**Notes:** No save-completion event exists today exposing per-target save totals and the spell DC. Applying Poisoned to enemy tokens needs GM presence or a socket handler on the target's owner; no-GM fallback is a chat reminder. Damage and base save left to vanilla.

### Stalker's Eye (Cantrip, HGtMH)
**Pitch:** Give the buffed creature advantage and a widened crit range on its next attack, then end the spell automatically.
**Behavior:** When cast on a willing creature it gains a tracked Stalker's Eye effect. The first time that creature makes an attack, the automation grants advantage on that roll and lowers the critical-hit threshold based on the caster's level (19-20 at 5th, 18-20 at 11th, 17-20 at 17th). Immediately after that attack resolves, the effect (and its concentration) is removed so the buff can't apply again.
**Trigger:** spellCastComplete to place the effect; an attack-roll event on the buffed creature to apply advantage/crit range and then expire the effect · **Feasibility:** needs-new-event (attackRollComplete/preAttackRoll)
**Settings:** none
**Notes:** Needs an attack-roll event that can set advantage and the crit threshold and then delete the effect. The buffed creature is typically the acting player's own actor, so reads/writes stay client-side; only the missing event blocks it. If no roll-modification hook fires, degrade to a chat reminder rather than blocking the attack.

### Vengeful Blade (Cantrip, IllR)
**Pitch:** Resolve the weapon strike, then track the reactive necrotic aura that punishes the target for attacking or casting.
**Behavior:** The player is asked which weapon they used (Booming Blade pattern) and the automation makes that melee attack, adding the extra 1d8 necrotic on a hit at the appropriate tier (5/11/17). On a hit it applies an aura effect to the target lasting until the start of the caster's next turn; if the target makes an attack or casts a spell while the aura is up, the automation deals the reactive necrotic damage (2d8/3d8/4d8 by tier) and removes the aura.
**Trigger:** spellCastComplete/damageRollComplete for the weapon strike and bonus die; a new attack-roll/spell-cast event on the target for the reactive damage; effect lifecycle for the aura · **Feasibility:** needs-new-event (attackRollComplete with target-effect scope)
**Settings:** Per-item enable; toggle auto-applying the reactive damage vs. just reminding.
**Notes:** The reactive trigger needs an event that fires when a creature makes an attack or casts a spell, matched by target-effect scope. Applying the aura and dealing damage to the target mutates another actor — needs a socket handler on the target's owner or a GM. No-GM fallback: the strike resolves normally and a chat note describes the aura. The base attack must never be blocked.

### Word of Misfortune (Cantrip, BoET)
**Pitch:** Subtract a d4 from the target's next saving throw, then end the spell.
**Behavior:** The player casts Word of Misfortune on a creature and the automation marks that target. The next time the target rolls any saving throw while concentration lasts, the automation rolls 1d4 and subtracts it from that save's total, showing the penalty in a chat card, then ends the effect. The player doesn't have to watch for the target's next save or do the math.
**Trigger:** spellCastComplete to register the target; a new save-roll event on the target to apply and consume the penalty; concentration lifecycle to clean up · **Feasibility:** needs-new-event (savingThrowComplete)
**Settings:** Per-item enable; toggle auto-apply vs. reminder-only.
**Notes:** Requires a save-roll event with target-effect matching. Modifying another actor's save roll (or the marking flag) needs the target-owner's client or a GM via socket. No-GM fallback: chat reminder; never block the cast.

### Chill Touch (Cantrip, PHB'14 & PHB'24 — durations differ; '14 adds undead disadvantage)
**Pitch:** On a hit, mark the target so it can't regain hit points until the caster's next turn, and ('14) give undead disadvantage on attacks against the caster.
**Behavior:** The attack and necrotic damage resolve vanilla. On a hit, the automation applies a "no healing" effect to the target that expires at the start ('14) or end ('24) of your next turn. For the '14 version, if the target is undead it additionally gets disadvantage on attack rolls against you until the end of your next turn. If the effect can't be written to the target, the cast still proceeds and a chat note tells you what to apply manually.
**Trigger:** damageRollComplete (to detect the hit) to apply the effect · **Feasibility:** needs-gm-or-rights
**Settings:** Toggle undead-disadvantage handling ('14); toggle auto-apply vs chat-reminder-only.
**Notes:** Applying the healing-suppression effect mutates the target's actor, so it needs a socket handler on the target's owner/GM client; no-GM fallback is a chat reminder. This is the canonical Chill Touch pattern from the rubric.

### Create Bonfire (Cantrip, XGE)
**Pitch:** Place a persistent 5-foot bonfire region tied to concentration that re-triggers its Dex save on creatures entering or ending their turn in it.
**Behavior:** On cast, in addition to the initial Dexterity save, the automation places a scene region/token marking the 5-foot bonfire and keeps it for the concentration duration. When a creature enters the bonfire's space or ends its turn there, it prompts the (scaled) 1d8 fire save again. When concentration ends, the bonfire region is removed. If region placement isn't permitted, the cast proceeds vanilla with a chat reminder.
**Trigger:** spellCastComplete to place the region; region-enter and turnEnd events for the recurring save; concentration-end cleanup · **Feasibility:** needs-gm-or-rights (also needs region-enter/turnEnd events)
**Settings:** Toggle recurring-save prompts vs place-region-only.
**Notes:** Creating a scene region and prompting saves on other creatures needs scene rights and a turnEnd/region-enter event (neither exists yet) plus a GM/socket to place documents; no-GM fallback is cast-plus-chat-reminder. Vanilla covers only the single instantaneous save at cast time — the persisting hazard is the value here.

### Dissolution (Cantrip, TCM'14 & TCM'24 — identical)
**Pitch:** On hit, mark the target with a -1 AC debuff consumed by the next attack roll against it before the end of your next turn.
**Behavior:** You cast Dissolution and make the vanilla melee spell attack and damage roll. On a hit, the automation applies a temporary effect to the target that lowers its AC by 1. The debuff is single-use: it applies to the next attack made against the target and then clears, or expires at the end of your next turn if unused. A chat card notes the weakened defense so allies know to strike now.
**Trigger:** spellCastComplete to detect the hit and apply the effect; a future attack-roll event to consume/expire it after one hit · **Feasibility:** needs-gm-or-rights (also wants attackRollComplete for the single-use expiry)
**Settings:** Toggle auto-expiry vs. manual removal; toggle the chat reminder.
**Notes:** Applying and later mutating an effect on a non-owned target needs the GM client or target-owner via socket. Missing event: attack-roll completion, to consume the debuff after exactly one attack. No-GM fallback: chat note. The single-use gate is the part vanilla can't do; a plain -1 AC AE would over-apply.

### Flare (Cantrip, HGtMH)
**Pitch:** Roll the ranged spell attack; if it crits, tag the target with a "grants advantage against it" effect until the end of your next turn.
**Behavior:** When you cast Flare and choose the attack mode, vanilla resolves the ranged spell attack and scaling radiant damage. If the attack is a critical hit, the automation applies an effect to the target that grants advantage on attack rolls against it until the end of your next turn, and posts a chat note. The alternate "launch into the air for light" mode is left as description text.
**Trigger:** spellCastComplete plus an attack-roll/critical result event to detect the crit · **Feasibility:** needs-gm-or-rights (also needs an attack event carrying isCritical)
**Settings:** none
**Notes:** Needs a way to read the crit result and then write an effect onto the target — a mutation of another actor's documents requiring the target's owner or GM via socket. No-GM fallback: chat reminder on a crit. The light-source alternate mode is intentionally left as description text.

### Gray Gaze (Cantrip, FoEQ)
**Pitch:** On a failed save, mark the target with disadvantage on its next Dex save, expiring at end of its next turn.
**Behavior:** Player casts Gray Gaze and rolls the Con save as normal. On a failure, the automation applies a tracked effect to the target that gives disadvantage on the next Dexterity saving throw it makes, expiring at the end of the target's next turn. When that Dex save comes up the disadvantage is applied automatically (or a chat reminder fires). Necrotic damage (= proficiency bonus) is applied via the normal chat card.
**Trigger:** spellCastComplete to read the save result and place the effect; a save-roll event on the target to consume/expire it · **Feasibility:** needs-gm-or-rights (also relies on a not-yet-existing saveRollComplete)
**Settings:** Toggle auto-apply disadvantage vs. reminder.
**Notes:** Applying an effect to an enemy target requires the target's owner client or an online GM via socket; with no GM online, degrade to a chat reminder. The flat PB damage is intentionally left to the vanilla card.

### Holy Word (Cantrip, GH:PG'24 — mechanically equivalent to GH:PP)
**Pitch:** On a hit, if the target is Fey, Fiend, or Undead, apply speed -10 and no-reactions until the end of its next turn.
**Behavior:** Player makes the ranged spell attack and applies the scaling radiant damage as normal. On a hit the automation reads the target's creature type; if it is Fey, Fiend, or Undead it applies a tracked effect reducing speed by 10 feet and preventing reactions, expiring at the end of the target's next turn. Other types: nothing extra. Without write rights, a chat reminder describes the rider.
**Trigger:** spellCastComplete (or an attack-hit event) to read the hit result and target type and place the effect · **Feasibility:** needs-gm-or-rights
**Settings:** Toggle auto-apply of the rider vs. reminder-only.
**Notes:** Reading the target's type is a free read; writing speed/reaction effects onto an enemy needs the target's owner or an online GM via socket — degrade to a chat note otherwise. Cleanly detecting "on a hit" would benefit from an attack-roll event but can fall back to reading the attack result from the cast message.

### Poison Needle (Cantrip, SCGtD)
**Pitch:** When Poison Needle drops a target to 0 HP, mark it stable and apply a 1-hour poisoned+paralyzed effect.
**Behavior:** The player makes the ranged spell attack and vanilla applies the poison damage. If that damage reduces the target to 0 HP, the automation stabilizes the target and applies an effect giving it the poisoned and paralyzed conditions for 1 hour (paralyzed while poisoned this way). A chat card announces the target was felled and paralyzed. Without rights, it posts a reminder.
**Trigger:** damageRollComplete (or a post-damage hook) to detect the target reaching 0 HP after this spell's damage · **Feasibility:** needs-gm-or-rights
**Settings:** Toggle auto-apply of the paralysis/poison effect vs. reminder-only.
**Notes:** Detecting the target crossing to 0 HP from this specific damage and writing conditions onto an enemy requires the target's owner or GM via socket. No-GM fallback: chat reminder. The attack and damage are vanilla.

### Ray of Frost (Cantrip, PHB'14 & PHB'24 — identical for the speed reduction)
**Pitch:** On a hit, apply a self-expiring -10 ft speed penalty to the target until the caster's next turn.
**Behavior:** The player casts Ray of Frost and makes the vanilla ranged spell attack and damage. If the attack hits, the automation applies a "Ray of Frost (Slowed)" active effect to the target reducing walking speed by 10 ft, stamped to expire at the start of the caster's next turn so nobody has to remember to remove it. The attack and damage stay fully vanilla.
**Trigger:** an attack-resolution event that reports hit/miss and the target; today only spellCastComplete exists and it fires before the attack · **Feasibility:** needs-gm-or-rights (also needs attackRollComplete)
**Settings:** Toggle auto-apply of the speed effect vs. posting a reminder.
**Notes:** Needs a new attack-resolution event exposing the hit target, plus writing an effect onto another actor — route through a GM or target-owner socket handler. No-GM fallback: chat reminder. The "until start of your next turn" expiry maps to a duration keyed on the caster's turn.

### Shocking Grasp (Cantrip, PHB'14 no-reactions / PHB'24 no-opportunity-attacks — same automation)
**Pitch:** On a hit, mark the target as unable to take reactions ('14) or opportunity attacks ('24) until the start of its next turn.
**Behavior:** You cast and roll the melee spell attack and damage as normal. On a hit, the automation applies a tracked effect to the target — "can't take reactions" ('14) or "can't make opportunity attacks" ('24) — that expires at the start of the target's next turn, with a chat card noting the restriction.
**Trigger:** spellCastComplete plus an attack-roll/hit event to gate on the hit; applying the effect to the target · **Feasibility:** needs-gm-or-rights (also wants attackRollComplete)
**Settings:** Toggle auto-apply vs. reminder-only.
**Notes:** Requires an attack-hit event and mutating the target's documents — needs the target's owner or a GM via socket. No-GM fallback: chat reminder. Never blocks the cast.

### Smokescreen (Cantrip, HGtMH)
**Pitch:** Place a heavily-obscuring smoke cylinder centered on you, sized by your level, that either stays put or follows you until your next turn.
**Behavior:** When you cast Smokescreen, the automation asks whether the cloud stays where you cast it or moves with you, then places a heavily-obscured scene region/light of the correct diameter for your character level (5/15/25/35 ft). If "moves with you", the aura is attached to your token. The object is tied to the spell's duration and removed when it ends. Darkness-pattern scene-object lifecycle.
**Trigger:** spellCastConfigure (stay/move choice) and spellCastComplete (place and register the scene object with cleanup) · **Feasibility:** needs-gm-or-rights
**Settings:** Default stay-vs-move choice; auto-place the region or just place a template.
**Notes:** Creating scene regions/lights typically needs scene rights or an online GM, served via a socket on the GM client (same as Darkness). No-GM fallback: cast proceeds with a chat reminder describing the cloud for manual placement. Token-attached auras follow the existing Darkness token-aura approach.

## Skipped

| Spell | Reason |
|---|---|
| Acid Burn | Cone Dex-save for acid damage with standard cantrip scaling — vanilla handles template, save, damage, scaling. |
| Acid Splash | Pure save-or-damage in both versions (multi-target '14, sphere '24) — vanilla fully covers it. |
| Aundair's Silent Sanctum | Sound-muffling emanation; utility/exploration, nothing beyond a declarative effect. |
| Bright Sparks | 60ft light plus minor situational Perception advantage — description note suffices. |
| Calling Card | Marks a corpse; purely narrative/utility. |
| Can't Trip | Prone immunity is a declarative condition-immunity effect vanilla handles; stand-up rider too minor. |
| Can'trip | Reacts to the target's own casting action, an event the framework can't hook; inherently table adjudication. |
| Chant of Thoth | Out-of-combat Intelligence-check aid; no combat mechanics. |
| Concealed Shot | Stealth utility for a ranged weapon; no roll logic beyond narration. |
| Concussion | Save-or-damage with a deafened rider vanilla applies as an effect. |
| Confounding Shadows | Save/damage is vanilla; the "can't see you" clause is a narrow visibility note best left as text. |
| Control Flames | Utility manipulation of nonmagical flames; no combat mechanics. |
| Dancing Lights | Utility light source; vanilla lighting and concentration cover it. |
| Douse Light | Extinguishes a mundane light source; utility only. |
| Drizzle | Environmental flavor rain; no combat mechanics. |
| Druidcraft | Canonical roleplay/utility skip. |
| Eldritch Blast | Canonical skip: attack-and-damage with beam scaling vanilla fully handles. |
| Elementalism | Minor elemental sensory/utility effects; no combat logic. |
| Encode Thoughts | Thought-strand information storage; pure utility. |
| Finger Guns | Fixed 2d6 force ranged weapon for 1 minute — declaratively expressible as a temporary weapon, no conditional lifecycle. |
| Fire Bolt | Plain ranged attack with scaling fire damage; vanilla. |
| Flowering | Decorative flowers; roleplay only. |
| Force Blast | Plain ranged attack with scaling force damage; vanilla. |
| Friends | Social spell in both versions; plain effect/condition rider. |
| Frightful Start | Single WIS save-or-Frightened rider vanilla applies declaratively. |
| Frostbite | Save-or-damage plus a short disadvantage rider close enough to a 1-round effect. |
| Guidance | Canonical skip — out-of-combat ability checks. |
| Gust | Minor push/utility air effect with no lasting combat state. |
| Hellfire | Pure save-or-damage with cantrip scaling; vanilla. |
| Howl | Long-range communication/roleplay cantrip. |
| Hunter Sense | Perception-check floor; exploration aid expressible as a note. |
| Illusory Instrument | Cosmetic illusory instrument/focus; flavor only. |
| Jolt | Combat use is a plain attack+damage; machine-powering clause is non-combat utility. |
| Light | Utility light vanilla handles via token lighting; the '14 Dex-save clause is minor. |
| Mage Hand | Utility object manipulation; no combat mechanics. |
| Magecraft | Tool-check buff; non-combat, plain active effect. |
| Magic Stone | Reduces to attack + 1d6+mod damage vanilla handles; caster-mod wrinkle is a niche edge case. |
| Magnetobolt | Attack + damage + save-or-prone rider vanilla covers; conditional disadvantage too minor. |
| Mend Plants | Exploration/utility plant repair. |
| Mending | Utility object repair in both versions. |
| Message | Utility communication; no combat mechanics. |
| Minor Illusion | DM-adjudicated illusion utility. |
| Mold Earth | Terrain/utility manipulation; description text suffices. |
| Moment to Think | Extra non-combat action; nothing to track. |
| Mysterious Presence | -1d4 to Insight/Perception against you — social effect a plain AE covers. |
| Obfuscate Object | Sleight-of-Hand concealment utility. |
| Orien Step | 5-foot teleport; no rolls, resources, or state beyond movement. |
| Poison Spray | Save-or-damage ('14) or attack-and-damage ('24) with scaling; vanilla. |
| Preserve | Keeps food from spoiling; pure utility. |
| Prestidigitation | Roleplay/utility tricks. |
| Primal Savagery | Melee spell attack with scaling acid damage; vanilla. |
| Primal Scent | Smell-based check buff for exploration. |
| Produce Flame | Attack is vanilla; the hand light is a mundane light source expressible via token light. |
| Resilient Friendship | Help-action grant; the conditional temp HP depends on off-roll outcomes the framework can't observe. |
| Retrieve | Utility telekinesis of a small object. |
| Root Grab | Flat 10-ft speed reduction is a declarative active effect vanilla applies directly. |
| Sacred Flame | Plain Dex save for radiant damage with scaling; vanilla end to end. |
| Sapping Sting | Save-or-damage plus Prone, both vanilla save + condition rider. |
| Shadow Bite | Save-or-damage plus a speed-halved rider vanilla applies declaratively. |
| Shadow Blindness | Niche darkvision-negating attack; no automation hook, conditional targeting is description-only. |
| Shape Water | Utility/exploration water shaping. |
| Spare the Dying | Stabilization utility vanilla already resolves. |
| Spark | Attack/damage/multi-beam scaling covered by vanilla; crit-blind is a minor rider. |
| Starry Wisp | Attack/damage vanilla; dim-light/no-invisibility rider expressible as a plain effect. |
| Swarm | Dex save inflicting Poisoned plus scaled damage — ordinary save-or-effect vanilla covers. |
| Sword Burst | Self-centered save-or-damage with scaling; vanilla. |
| Task | Utility chores; no combat mechanics. |
| Thaumaturgy | Roleplay/utility manifestations in both versions. |
| Thorn Whip | Attack/damage vanilla; the pull-10-feet is a trivial token nudge requiring rights, not worth stateful automation. |
| Thunderclap | Con save + thunder damage + 5-ft emanation; vanilla handles all of it. |
| Vicious Mockery | Save + damage + disadvantage-on-next-attack rider vanilla expresses as a timed effect. |
| Water Whip | Attack/damage vanilla; forced 10-ft pull on failed save is manual positioning best left as a reminder. |
| Word of Radiance | Multi-target Con save-or-damage with scaling; vanilla covers it entirely. |
