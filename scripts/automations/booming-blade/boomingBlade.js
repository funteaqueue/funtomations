import {MODULE_ID} from '../../framework/constants.js';
import {confirm, applyEffectToActor, deleteDocument, inPlayActor} from '../../framework/utils.js';

/**
 * Booming Blade — as part of the action you make a melee weapon attack; on a hit
 * the target takes the weapon's damage plus, from 5th level, extra thunder damage
 * (1d8 at 5th, 2d8 at 11th, 3d8 at 17th). The target is then sheathed in booming
 * energy: if it willingly moves before the start of your next turn it takes thunder
 * damage that scales one die higher (2d8 at 1st–4th, 3d8 at 5th, 4d8 at 11th, 5d8
 * at 17th).
 *
 * The attack is the SPELL'S OWN attack roll, re-pointed at the chosen weapon's
 * numbers. Imported spells usually come with only a damage activity, so on first
 * cast the spell item is upgraded ONCE: the damage activity is replaced by an
 * attack activity (keeping its damage parts, so the attack card has a Damage
 * button). All effects and damage are applied by the GM.
 *
 *   0. CONFIGURE (spellCastConfigure): the measured template (imports carry one
 *      from the "Self, 5-ft radius" range) is suppressed, and so is the activity's
 *      auto-roll after use (subsequentActions = false) — the attack must wait for
 *      the weapon picker, and damage must wait for the card's Damage button.
 *   1. CAST (spellCastComplete, caster's client): the spell item is upgraded if
 *      needed, the player picks one of their weapons, and its numbers (attack
 *      modifier, damage dice) are snapshotted on a flag on the spell. Then the
 *      spell's attack roll is opened. The snapshot has NO expiry: it is simply
 *      overwritten by the next cast — the spell's rolls are always Booming Blade
 *      rolls, so a long pause between attack and damage changes nothing.
 *   2. ATTACK (attackRollConfigure): the difference between the weapon's attack
 *      modifier (ability + magic + flat bonus) and the spell's own is folded into
 *      the spell's attack roll, so the d20 total equals a normal attack with that
 *      weapon. Proficiency is assumed for both (it cancels out).
 *   3. DAMAGE (damageRollConfigure): BEFORE the damage roll evaluates, the spell's
 *      damage parts are replaced with the snapshot weapon damage (dice + modifier)
 *      and the caster-level-scaled thunder (1d8/2d8/3d8 from 5th/11th/17th) — so
 *      only the real dice are rolled and animated, once. Crit doubling is dnd5e's
 *      own. The GM applies the card's damage as usual — nothing is auto-applied.
 *   4. ON HIT (attackRollComplete): the "Booming" marker effect, carrying the
 *      computed move-damage dice, is applied to the target with no dialog —
 *      written directly when the caster owns the target, otherwise silently
 *      through the GM's client (applyEffectToActor).
 *   5. ON MOVE (tokenMoveComplete, the mover's client): when a token carrying the
 *      "Booming" marker moves, whoever moved it is asked "Deal the booming
 *      damage?". On Yes that user rolls the stored Nd8 thunder to chat (the GM
 *      applies it from the card) and the marker is removed via the GM relay.
 *
 * Degradations (never blocks the cast or the move):
 *   - No weapon found, or the one-time item upgrade fails: the spell's own rolls
 *     are left untouched (failures are logged to console).
 *   - No target selected, target AC unknown (hit unverifiable), or no way to
 *     write the effect (no ownership and no GM online): the marker is skipped;
 *     write failures are logged to console.
 *
 * Per-item settings (Manage Automations on the spell):
 *   - weaponFilter: how the picker orders weapons (all are always listed —
 *     'equipped' puts equipped ones first, never hides the rest).
 *   - defaultWeapon: name of a weapon to always attack with, skipping the picker
 *     (filled by the picker's "don't ask again" checkbox, clearable by hand).
 */

const EFFECT_NAME = 'Booming';

// Marker effects currently showing a move-damage prompt on this client, so a
// token dragged repeatedly does not stack dialogs for the same marker.
const promptedEffects = new Set();

/** Number of d8s of on-hit bonus thunder damage for a character level (0 below 5th). */
function onHitDice(level) {
    if (level >= 17) return 3;
    if (level >= 11) return 2;
    if (level >= 5) return 1;
    return 0;
}

/** Number of d8s of move-triggered thunder for a character level (2d8/3d8/4d8/5d8 by tier). */
function moveDice(level) {
    if (level >= 17) return 5;
    if (level >= 11) return 4;
    if (level >= 5) return 3;
    return 2;
}

/** Best-effort character level for cantrip scaling. */
function casterLevel(actor) {
    const level = actor?.system?.details?.level;
    if (typeof level === 'number' && level > 0) return level;
    const classes = actor?.classes;
    if (classes) {
        const summed = Object.values(classes).reduce((sum, c) => sum + (c.system?.levels ?? 0), 0);
        if (summed > 0) return summed;
    }
    return actor?.system?.details?.cr ?? 1;
}

/** Modifier for an ability key on the actor, or 0 if unreadable. */
function abilityMod(actor, ability) {
    return Number(actor?.system?.abilities?.[ability]?.mod) || 0;
}

/** An item's activity of the given type, whichever collection shape dnd5e exposes. */
function findActivity(item, type) {
    return item?.system?.activities?.find?.(a => a.type === type)
        ?? item?.system?.activities?.contents?.find?.(a => a.type === type)
        ?? null;
}

/** The ability modifier the weapon's own attack uses (best-effort). */
function weaponAbilityMod(weapon, actor) {
    const attack = findActivity(weapon, 'attack');
    let ability = attack?.attack?.ability || attack?.damage?.ability || '';
    // Empty ability = dnd5e default. Finesse/ranged pick the best of STR/DEX;
    // otherwise melee uses STR. Approximate the same way.
    if (!ability) {
        const props = weapon?.system?.properties;
        const isFinesse = props?.has?.('fin') ?? (Array.isArray(props) && props.includes('fin'));
        const isRanged = (weapon?.system?.type?.value ?? '').toLowerCase().includes('r');
        if (isFinesse || isRanged) {
            return Math.max(abilityMod(actor, 'str'), abilityMod(actor, 'dex'));
        }
        ability = 'str';
    }
    return abilityMod(actor, ability);
}

/** The weapon's magical attack/damage bonus (only when it has the magical property). */
function magicalBonus(weapon) {
    const props = weapon?.system?.properties;
    const isMagical = props?.has?.('mag') ?? (Array.isArray(props) && props.includes('mag'));
    return isMagical ? (Number(weapon.system?.magicalBonus) || 0) : 0;
}

/** The weapon's primary damage type. */
function weaponDamageType(weapon) {
    const base = weapon?.system?.damage?.base;
    const types = base?.types;
    if (types?.size) return [...types][0];
    if (Array.isArray(types) && types.length) return types[0];
    return base?.type ?? 'slashing';
}

/**
 * Candidate weapons the player may strike with. Never hides any — players
 * routinely don't maintain the equipped state in their inventory, so the
 * 'equipped' filter only ORDERS the list (equipped first, the likely picks).
 */
function pickableWeapons(actor, filter) {
    const weapons = actor.items.filter(item => item.type === 'weapon');
    if (filter === 'equipped') {
        weapons.sort((a, b) => (b.system?.equipped ? 1 : 0) - (a.system?.equipped ? 1 : 0));
    }
    return weapons;
}

/**
 * Weapon picker dialog — a dropdown, so an arsenal of any size fits (button rows
 * capped the list). Returns {weapon, remember} or null on cancel; remember is the
 * "don't ask again" checkbox, persisted by the caller into the per-item settings.
 */
async function chooseWeapon(spell, weapons) {
    const options = weapons.map((weapon, index) => {
        const suffix = weapon.system?.equipped ? '' : ' (not equipped)';
        return `<option value="${weapon.id}"${index === 0 ? ' selected' : ''}>${weapon.name}${suffix}</option>`;
    }).join('');
    const result = await foundry.applications.api.DialogV2.wait({
        window: {title: `${spell.name}: choose a weapon`},
        content: '<p>Which weapon are you attacking with?</p>'
            + `<select name="weapon" autofocus style="width: 100%">${options}</select>`
            + '<label style="display: flex; gap: 6px; align-items: center; margin-top: 8px;">'
            + '<input type="checkbox" name="remember"> Always use this weapon (don\'t ask again)</label>',
        buttons: [
            {
                action: 'attack',
                label: 'Attack',
                default: true,
                callback: (event, button) => ({
                    id: button.form?.elements.weapon?.value ?? null,
                    remember: button.form?.elements.remember?.checked ?? false
                })
            },
            {action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark'}
        ],
        rejectClose: false
    });
    if (!result || result === 'cancel' || !result.id) return null;
    const weapon = weapons.find(w => w.id === result.id) ?? null;
    return weapon ? {weapon, remember: result.remember} : null;
}

/**
 * Build the "Booming" rider effect. Module-flagged so the GM relay accepts the
 * create/delete, and so tokenMoveComplete routes the marked actor's movement back
 * here (effect scope). The flag carries the computed move-dice.
 */
function buildRiderEffect({img, dice, casterName}) {
    return {
        name: EFFECT_NAME,
        img,
        description: `If this creature willingly moves before the start of ${casterName}'s next turn, `
            + `it takes ${dice}d8 thunder damage and the effect ends.`,
        duration: {rounds: 1},
        flags: {
            [MODULE_ID]: {boomingBlade: {moveDice: dice, casterName}}
        }
    };
}

/**
 * One-time item upgrade: imported Booming Blade usually has only a damage
 * activity, which cannot roll an attack. Replace it with an attack activity that
 * keeps the damage parts (so the attack card has a Damage button whose rolls the
 * damage handler then rewrites). Returns the spell's attack activity, or null
 * when the upgrade fails.
 */
async function ensureAttackActivity(spell) {
    const existing = findActivity(spell, 'attack');
    if (existing) return existing;
    try {
        const damageActivity = findActivity(spell, 'damage');
        const parts = damageActivity?.damage?.parts?.map(part => part.toObject?.() ?? foundry.utils.deepClone(part))
            ?? [{number: 1, denomination: 8, types: ['thunder']}];
        await spell.createActivity('attack', {
            name: '',
            activation: damageActivity?.activation?.toObject?.() ?? {type: 'action', value: 1},
            attack: {
                ability: '', // empty = the spell's default (spellcasting ability)
                bonus: '',
                flat: false,
                type: {value: 'melee', classification: 'spell'}
            },
            damage: {includeBase: false, parts}
        }, {renderSheet: false});
        if (damageActivity) await spell.deleteActivity(damageActivity.id);
        console.log(`${MODULE_ID} | boomingBlade: upgraded "${spell.name}" with an attack activity (one-time)`);
        return findActivity(spell, 'attack');
    } catch (error) {
        console.error(`${MODULE_ID} | boomingBlade: failed to upgrade the spell item`, error);
        return null;
    }
}

/* -------------------------------------------- */
/*  0. Configure: no template, no auto-roll     */
/* -------------------------------------------- */

function configureCast(context) {
    // The activity auto-rolls right after use (attack activities roll the attack,
    // damage-only ones roll damage). The attack must wait for the weapon picker —
    // the cast handler opens it itself — and damage must wait for the card's
    // Damage button. Suppress the auto-roll; the card's buttons stay.
    context.usageConfig.subsequentActions = false;

    // Imported Booming Blade items carry a measured template from their "Self,
    // 5-ft radius" range. The cast resolves as a weapon attack, not an area —
    // turn the template off and hide the "Place Template" checkbox in the dialog.
    if (context.usageConfig.create === false) return;
    context.usageConfig.create ??= {};
    context.usageConfig.create.measuredTemplate = false;
    foundry.utils.setProperty(context.dialogConfig, 'options.display.create.measuredTemplate', false);
}

/* -------------------------------------------- */
/*  1. Cast: pick the weapon, open the attack   */
/* -------------------------------------------- */

// Re-entrancy guard: on the one-time upgrade cast, attack.use() fires
// postUseActivity again on this client — without the guard the handler would run
// twice (double weapon picker, double attack roll).
let castInProgress = false;

async function cast(context) {
    if (castInProgress) return;
    castInProgress = true;
    try {
        await handleCast(context);
    } finally {
        castInProgress = false;
    }
}

async function handleCast(context) {
    const {actor, item} = context;
    if (!actor) return;

    const level = casterLevel(actor);
    const bonus = onHitDice(level);
    const rider = moveDice(level);

    // Work on the actor's canonical spell item — during usage dnd5e may hand us an
    // ephemeral clone, but the card's buttons resolve the real item, which is
    // where the later handlers read the snapshot.
    const spell = actor.items.get(item.id) ?? item;

    // Weapons come from the IN-PLAY actor: a cast arriving on the base actor
    // (sidebar sheet, Actor.<id> hotbar macros) while the player runs an
    // unlinked token would miss weapons living on the token's delta (e.g. a
    // summoned Shadow Blade). The weapon is only read — its numbers are
    // snapshotted onto the spell — so no cross-actor writes follow.
    const weapons = pickableWeapons(inPlayActor(actor), context.settings?.weaponFilter ?? 'equipped');
    if (!weapons.length) {
        // Never block the cast: no weapon to strike with, the spell's own rolls
        // stay untouched.
        return;
    }

    // A preselected weapon (the setting, filled by hand or by the picker's
    // "don't ask again" checkbox) skips the dialog entirely; if it is gone
    // (dropped/renamed), fall back to asking.
    const preset = (context.settings?.defaultWeapon ?? '').trim();
    let weapon = preset ? weapons.find(w => w.name === preset) ?? null : null;
    if (!weapon && weapons.length === 1) weapon = weapons[0];
    if (!weapon) {
        const choice = await chooseWeapon(spell, weapons);
        weapon = choice?.weapon ?? null;
        if (weapon && choice.remember) {
            // Persist into the per-item settings so Manage Automations shows the
            // name (clear the field there to be asked again).
            await spell.setFlag(MODULE_ID, 'settings.boomingBlade.defaultWeapon', weapon.name).catch(() => {});
        }
    }
    if (!weapon) {
        // Player cancelled the picker: drop any earlier snapshot so the card's
        // buttons roll the plain spell numbers instead of a stale weapon's.
        await spell.unsetFlag(MODULE_ID, 'boomingBlade').catch(() => {});
        return;
    }

    // Snapshot the weapon's numbers on the spell — no expiry, the next cast
    // overwrites it. Base damage bonus is carried only when it is a plain number
    // (a formula like "@mod" would double-count the modifier we add ourselves).
    // Read ability mods from the actor that owns the weapon — with an unlinked
    // token that is the token's synthetic actor, whose effects the base lacks.
    const mod = weaponAbilityMod(weapon, weapon.actor ?? actor);
    const magic = magicalBonus(weapon);
    const flat = Number(findActivity(weapon, 'attack')?.attack?.bonus) || 0;
    const base = weapon.system?.damage?.base ?? {};
    const baseBonus = /^\s*-?\d+\s*$/.test(base.bonus ?? '') ? Number(base.bonus) : 0;
    await spell.setFlag(MODULE_ID, 'boomingBlade', {
        weaponName: weapon.name,
        attackMod: mod + magic + flat,
        damage: {
            number: base.number ?? 1,
            denomination: base.denomination ?? 6,
            bonus: baseBonus,
            custom: base.custom?.enabled ? (base.custom.formula || null) : null,
            mod: mod + magic,
            type: weaponDamageType(weapon)
        },
        onHitDice: bonus,
        moveDice: rider
    });

    // Make sure the spell can roll an attack (one-time upgrade of imported items),
    // then open the attack roll — after the picker, so the snapshot is in place.
    const attack = await ensureAttackActivity(spell);
    if (!attack) return; // upgrade failure already logged by ensureAttackActivity
    if (context.activity?.id !== attack.id) {
        // The cast used the (now replaced) damage activity: post the attack card too.
        await attack.use().catch(error =>
            console.error(`${MODULE_ID} | boomingBlade: failed to use the attack activity`, error));
    }
    await attack.rollAttack({}).catch(error =>
        console.error(`${MODULE_ID} | boomingBlade: failed to open the attack roll`, error));
}

/* -------------------------------------------- */
/*  2. Attack: use the weapon's attack modifier */
/* -------------------------------------------- */

function onAttackConfigure(context) {
    const pending = context.item?.getFlag?.(MODULE_ID, 'boomingBlade');
    if (pending?.attackMod === undefined) return;
    const roll = context.config?.rolls?.[0];
    if (!roll) return;
    // The spell's own attack resolved @mod in the roll data; fold in the difference
    // so the total equals the weapon's normal attack (proficiency cancels out).
    const spellMod = Number(roll.data?.mod) || 0;
    const delta = pending.attackMod - spellMod;
    if (delta !== 0) roll.parts.push(String(delta));
}

/* -------------------------------------------- */
/*  3. Damage: weapon dice + the bonus thunder  */
/* -------------------------------------------- */

function onDamageConfigure(context) {
    const pending = context.item?.getFlag?.(MODULE_ID, 'boomingBlade');
    if (!pending?.damage) return;
    const rolls = context.config?.rolls;
    if (!rolls?.length) return;

    const {number, denomination, bonus, custom, mod, type} = pending.damage;

    // Weapon damage: dice + flat bits + ability/magic modifier. Crit doubling is
    // applied natively by dnd5e after this hook, to the thunder dice too.
    let formula = custom ?? `${number}d${denomination}`;
    const flat = (custom ? 0 : bonus) + mod;
    if (flat > 0) formula += ` + ${flat}`;
    else if (flat < 0) formula += ` - ${Math.abs(flat)}`;

    // Replace the spell's own damage parts BEFORE the roll evaluates, so exactly
    // the weapon damage and the scaling thunder are rolled (and animated) once.
    const data = rolls[0].data ?? {};
    const replacement = [{data, parts: [formula], options: {type, types: [type]}}];
    if (pending.onHitDice > 0) {
        replacement.push({data, parts: [`${pending.onHitDice}d8`], options: {type: 'thunder', types: ['thunder']}});
    }
    rolls.splice(0, rolls.length, ...replacement);
}

/* -------------------------------------------- */
/*  4. On hit: apply the rider (no dialog)      */
/* -------------------------------------------- */

async function onAttack(context) {
    const spell = context.item;
    const pending = spell?.getFlag?.(MODULE_ID, 'boomingBlade');
    if (!pending) return;

    const {actor} = context;
    const dice = pending.moveDice;
    const targets = context.targets ?? [];

    for (const target of targets) {
        if (target.hit === false) continue; // clean miss — no rider
        // AC unknown: hit/miss cannot be resolved — leave the rider to the GM.
        if (target.hit === undefined) continue;

        // Confirmed hit: apply the marker silently — direct when the caster owns
        // the target, relayed through the GM's client otherwise. No dialog.
        const result = target.actor
            ? await applyEffectToActor(target.actor, buildRiderEffect({img: spell.img, dice, casterName: actor.name}))
            : false;
        if (result === false) {
            // No ownership of the target's actor and no GM online (or no actor).
            console.warn(`${MODULE_ID} | boomingBlade: could not apply "${EFFECT_NAME}" to ${target.name}`);
        }
    }
}

/* -------------------------------------------- */
/*  5. On move: offer the booming damage roll   */
/* -------------------------------------------- */

async function onTokenMove(context) {
    const {actor, token} = context;
    const effects = (actor.appliedEffects ?? actor.effects ?? [])
        .filter(effect => effect.flags?.[MODULE_ID]?.boomingBlade?.moveDice);

    for (const effect of effects) {
        if (promptedEffects.has(effect.uuid)) continue;
        promptedEffects.add(effect.uuid);
        try {
            const {moveDice: dice, casterName} = effect.flags[MODULE_ID].boomingBlade;
            const willing = await confirm(`${EFFECT_NAME}: deal the thunder damage?`,
                `<strong>${token.name}</strong> is sheathed in booming energy`
                + `${casterName ? ` (${casterName}'s Booming Blade)` : ''}. If this move was willing, `
                + `it takes <strong>${dice}d8 thunder</strong> damage. Roll it?`);
            if (!willing) continue; // unwilling move (or declined) — the marker stays

            const DamageRoll = CONFIG.Dice?.DamageRoll ?? Roll;
            const thunderRoll = await new DamageRoll(`${dice}d8`, {}, {type: 'thunder'}).evaluate();
            await thunderRoll.toMessage({
                speaker: ChatMessage.getSpeaker({token, actor}),
                flavor: `${EFFECT_NAME} — thunder damage for willingly moving (GM applies)`,
                flags: {dnd5e: {roll: {type: 'damage'}}}
            });

            // The rider is spent: remove the marker (direct when owned, GM relay otherwise).
            await deleteDocument(effect);
        } finally {
            promptedEffects.delete(effect.uuid);
        }
    }
}

export const boomingBlade = {
    id: 'boomingBlade',
    name: 'Booming Blade',
    version: '4.3.1',
    description: 'On cast, suppresses the spell\'s measured template and auto-rolls, prompts for one of the caster\'s weapons (a preselected weapon — the setting or the picker\'s "don\'t ask again" checkbox — skips the prompt), and opens the SPELL\'s own attack roll using that weapon\'s numbers (imported spells with only a damage activity are upgraded once: it is replaced by an attack activity). The attack roll gets the weapon-vs-spell modifier difference folded in; the Damage button rolls the weapon\'s damage plus the scaling thunder (1d8/2d8/3d8 from 5th/11th/17th, native crit doubling) — the formula is swapped in before the roll, so only the real dice are rolled and animated, and the GM applies it from the card. The weapon snapshot never expires; the next cast overwrites it. On a confirmed hit the "Booming" marker (carrying the computed move-damage, 2d8/3d8/4d8/5d8 by tier) is applied silently, direct or via the GM\'s client. When the marked token moves, whoever moved it is asked whether the move was willing; on Yes that user rolls the stored thunder to chat (GM applies) and the marker is removed via the GM relay.',
    settings: [
        {
            key: 'weaponFilter',
            name: 'Weapon order',
            hint: 'How the picker orders weapons. Every weapon is always listed; "Equipped first" puts equipped ones at the top.',
            type: 'select',
            default: 'equipped',
            choices: {
                equipped: 'Equipped weapons first',
                all: 'Inventory order'
            }
        },
        {
            key: 'defaultWeapon',
            name: 'Preselected weapon',
            hint: 'Exact name of the weapon to always attack with — the picker is skipped while this is set. Filled by the picker\'s "don\'t ask again" checkbox; clear it to be asked again. If no weapon by this name is found, the picker opens.',
            type: 'text',
            default: ''
        }
    ],
    match: {
        itemNames: ['Booming Blade', 'Гримкий клинок']
    },
    events: [
        // Item-lifecycle handlers are scoped to 'item': they must only run for the
        // Booming Blade spell itself. Without the scopes, a "Booming" marker on an
        // actor routed that actor's UNRELATED casts here via effect scope — casting
        // any spell while marked opened the weapon picker and suppressed templates.
        {
            event: 'spellCastConfigure',
            handler: configureCast,
            priority: 50,
            scopes: ['item']
        },
        {
            event: 'spellCastComplete',
            handler: cast,
            priority: 50,
            scopes: ['item']
        },
        {
            event: 'attackRollConfigure',
            handler: onAttackConfigure,
            priority: 50,
            scopes: ['item']
        },
        {
            event: 'attackRollComplete',
            handler: onAttack,
            priority: 50,
            scopes: ['item']
        },
        {
            event: 'damageRollConfigure',
            handler: onDamageConfigure,
            priority: 50,
            scopes: ['item']
        },
        // Marker-driven: routed by the "Booming" effect on the moved token's actor.
        {
            event: 'tokenMoveComplete',
            handler: onTokenMove,
            priority: 50,
            scopes: ['effect']
        }
    ]
};
