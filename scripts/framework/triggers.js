import {MODULE_ID} from './constants.js';
import {registry} from './registry.js';
import {interceptAttackTargeting, promptSaveTargets} from './target-picker.js';

/**
 * The trigger bus maps native Foundry/dnd5e hooks to automation events.
 * Everything runs on the client that performed the action — no GM required.
 *
 * Supported events:
 *   'damageRollComplete' — fires after a dnd5e damage roll chat card is created.
 *       Context: {event, message, actor, item, activity, damageRolls, damageTotal, setDamageRolls}
 *       setDamageRolls(rolls) rewrites the rolls on the chat card; since vanilla dnd5e
 *       applies damage from the card's rolls, this changes the damage that gets applied.
 *       NOTE: the original rolls are evaluated (and animated by Dice So Nice) before
 *       this fires — to change WHAT is rolled, prefer damageRollConfigure.
 *
 *   'damageRollConfigure' — fires while a damage roll is being configured, BEFORE the
 *       roll dialog and evaluation, on the rolling client. Handlers MUST be
 *       synchronous and may mutate config.rolls (an array of {data, parts, options}
 *       roll configurations — replace parts/entries to change what is rolled; crit
 *       doubling is applied natively afterwards). Never cancel the roll.
 *       Context: {event, config, dialog, message, activity, item, actor}
 *
 *   'spellCastComplete' — fires once when a spell activity is used (any cast, hit or miss),
 *       before attack/damage rolls are made.
 *       Context: {event, activity, item, actor, castLevel, baseLevel, usageConfig, results, message}
 *       castLevel accounts for upcasting (slot level, spell scroll scaling); cantrips are 0.
 *
 *   'spellCastConfigure' — fires when a spell activity use begins, BEFORE the usage
 *       dialog is shown and anything is consumed or placed. Handlers may mutate
 *       usageConfig/dialogConfig (e.g. suppress the measured template) and MUST be
 *       synchronous — dnd5e does not await this hook.
 *       Context: {event, activity, item, actor, usageConfig, dialogConfig, messageConfig}
 *
 *   'featureUseComplete' — fires once when a feature (feat item) activity is used.
 *       Context: {event, activity, item, actor, usageConfig, results, message}
 *
 *   'attackRollConfigure' — fires while an attack roll is being configured, BEFORE the
 *       roll dialog and evaluation, on the attacking client. Handlers MUST be
 *       synchronous and may mutate the roll process config: push bonus/penalty parts
 *       into config.rolls[0].parts, set config.rolls[0].options.advantage/disadvantage
 *       or options.criticalSuccess (crit threshold). Never cancel the roll.
 *       Context: {event, config, dialog, message, activity, item, actor, targets}
 *       targets: the attacker's current targets [{token, actor, uuid, name, ac}].
 *
 *   'attackRollComplete' — fires after an attack roll is evaluated, on the attacking
 *       client. Exposes the d20 result, crit state, and hit/miss per target where AC
 *       is known. Write only to owned documents here; for target writes use the
 *       GM-relay helpers in utils.js (applyEffectToActor / deleteDocument).
 *       Context: {event, roll, rolls, activity, item, actor, targets, hitTargets,
 *                 isCritical, isFumble, d20}
 *       Each target: {token, actor, uuid, name, ac, hit} — hit is true/false when AC
 *       is known (crits always hit, fumbles always miss), undefined otherwise.
 *
 *   'saveRollConfigure' — fires while a saving throw is being configured, BEFORE the
 *       dialog and evaluation, on the client rolling the save. That client OWNS the
 *       rolling actor, so marker effects on it may be read AND deleted here. Handlers
 *       MUST be synchronous and may mutate config (parts, advantage/disadvantage).
 *       Never cancel the roll. Includes concentration saves.
 *       Context: {event, config, dialog, message, actor, ability}
 *
 *   'saveRollComplete' — fires after a saving throw is rolled, on the client that
 *       rolled it (owns the actor — effect creation/consumption on the roller is a
 *       same-client write). Includes concentration saves.
 *       Context: {event, roll, rolls, actor, ability, total, dc, isSuccess, isFailure,
 *                 margin, d20}
 *       dc/isSuccess/isFailure/margin are undefined when no DC accompanied the roll.
 *
 *   'tokenMoveComplete' — fires after a token's position (x/y) changes, ONLY on the
 *       client of the user who moved it (so exactly one client dispatches, with the
 *       mover's permissions). Fires after the move is committed — never blocks or
 *       rewinds movement. Dispatches by actor and effect scope for the moved token's
 *       actor: a module-flagged marker on that actor routes its movement back to the
 *       automation that placed the marker.
 *       Context: {event, token, actor, changes, userId}
 *
 * Besides item/actor scope, all events dispatch by EFFECT SCOPE: an automation is
 * matched when an involved actor (the roller, or an attack target) carries an active
 * effect flagged flags['fantik-automations'][<automationId>]. This is how a marker an
 * automation placed on another actor routes that actor's later rolls back to it.
 * See registry.findForEffectActors.
 */
export function initTriggers() {
    Hooks.on('createChatMessage', onCreateChatMessage);
    Hooks.on('dnd5e.postUseActivity', onPostUseActivity);
    Hooks.on('dnd5e.preUseActivity', onPreUseActivity);
    Hooks.on('dnd5e.preRollAttackV2', onPreRollAttack);
    Hooks.on('dnd5e.rollAttackV2', onRollAttack);
    Hooks.on('dnd5e.preRollDamageV2', onPreRollDamage);
    Hooks.on('dnd5e.preRollSavingThrowV2', onPreRollSavingThrow);
    Hooks.on('dnd5e.rollSavingThrow', onRollSavingThrow);
    Hooks.on('updateToken', onUpdateToken);
}

async function dispatch(event, subjects, context) {
    const handlers = registry.handlersForEvent(event, subjects);
    for (const {automation, handler} of handlers) {
        try {
            // Per-item settings resolve from the triggering item (item scope).
            const settings = registry.getItemSettings(subjects.item, automation.id);
            await handler({...context, settings});
        } catch (error) {
            console.error(`${MODULE_ID} | Automation "${automation.id}" failed on ${event}`, error);
        }
    }
}

/** Synchronous dispatch for pre-hooks where dnd5e reads the config right after. */
function dispatchSync(event, subjects, context) {
    const handlers = registry.handlersForEvent(event, subjects);
    for (const {automation, handler} of handlers) {
        try {
            const settings = registry.getItemSettings(subjects.item, automation.id);
            handler({...context, settings});
        } catch (error) {
            console.error(`${MODULE_ID} | Automation "${automation.id}" failed on ${event}`, error);
        }
    }
}

/* -------------------------------------------- */
/*  damageRollComplete                          */
/* -------------------------------------------- */

async function onCreateChatMessage(message, options, userId) {
    // Only the client that made the roll runs automations, so they execute exactly once
    // and with the acting player's permissions (a user may always update their own message).
    if (userId !== game.user.id) return;
    if (message.getFlag('dnd5e', 'roll.type') !== 'damage') return;
    if (!message.rolls?.length) return;
    const item = message.getAssociatedItem?.();
    if (!item) return;
    const actor = message.getAssociatedActor?.() ?? item.actor ?? null;
    const context = {
        event: 'damageRollComplete',
        message,
        item,
        activity: message.getAssociatedActivity?.() ?? null,
        actor,
        damageRolls: message.rolls,
        damageTotal: message.rolls.reduce((total, roll) => total + (roll.total ?? 0), 0),
        async setDamageRolls(newRolls) {
            await message.update({rolls: newRolls.map(roll => JSON.stringify(roll.toJSON()))});
        }
    };
    await dispatch('damageRollComplete', {item, actor}, context);
}

/* -------------------------------------------- */
/*  damageRollConfigure                         */
/* -------------------------------------------- */

function onPreRollDamage(config, dialog, message) {
    // dnd5e.preRollDamageV2 fires only on the rolling client, before the roll
    // dialog and evaluation. config.subject is the activity performing the roll.
    // Returning false here would cancel the roll — never do that.
    const activity = config.subject;
    const item = activity?.item;
    if (!item) return;
    const actor = item.actor;
    const context = {event: 'damageRollConfigure', config, dialog, message, activity, item, actor};
    dispatchSync('damageRollConfigure', {item, actor, effectActors: actor ? [actor] : []}, context);
}

/* -------------------------------------------- */
/*  spellCastConfigure                          */
/* -------------------------------------------- */

function onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
    // dnd5e.preUseActivity only fires on the client that used the activity.
    const item = activity?.item;
    if (item?.type !== 'spell') return;
    const actor = item.actor;
    const context = {
        event: 'spellCastConfigure',
        activity,
        item,
        actor,
        usageConfig,
        dialogConfig,
        messageConfig
    };
    dispatchSync('spellCastConfigure', {item, actor}, context);
}

/* -------------------------------------------- */
/*  spellCastComplete / featureUseComplete      */
/* -------------------------------------------- */

async function onPostUseActivity(activity, usageConfig, results) {
    // dnd5e.postUseActivity only fires on the client that used the activity.
    const item = activity?.item;
    if (!item) return;
    const actor = item.actor;

    // Save activity used with nothing targeted: prompt now — the slot level is
    // known here, so upcast target counts resolve correctly. The use already
    // fully happened (nothing is blocked); the picked targets are written onto
    // the posted card, and awaiting means automations below see them targeted.
    await promptSaveTargets(activity, usageConfig, results);

    if (item.type === 'feat') {
        const context = {
            event: 'featureUseComplete',
            activity,
            item,
            actor,
            usageConfig,
            results,
            message: results?.message ?? null
        };
        await dispatch('featureUseComplete', {item, actor}, context);
        return;
    }

    if (item.type !== 'spell') return;
    const baseLevel = item.system.level ?? 0;
    // For upcast spells the item clone carries the scaling delta (slot level - base level).
    const scaling = Number(usageConfig?.scaling) || 0;
    const castLevel = baseLevel > 0 ? baseLevel + Math.max(0, scaling) : 0;
    const context = {
        event: 'spellCastComplete',
        activity,
        item,
        actor,
        castLevel,
        baseLevel,
        usageConfig,
        results,
        message: results?.message ?? null
    };
    // Effect scope included so markers on the caster (e.g. reactive auras) can react
    // to the marked actor casting a spell.
    await dispatch('spellCastComplete', {item, actor, effectActors: [actor]}, context);
}

/* -------------------------------------------- */
/*  attackRollConfigure / attackRollComplete    */
/* -------------------------------------------- */

/** Snapshot the acting user's current targets as plain descriptors. */
function targetDescriptors() {
    return [...game.user.targets]
        .filter(token => token.actor)
        .map(token => ({
            token,
            actor: token.actor,
            uuid: token.actor.uuid,
            name: token.name,
            ac: token.actor.system?.attributes?.ac?.value ?? null
        }));
}

function onPreRollAttack(config, dialog, message) {
    // dnd5e.preRollAttackV2 fires only on the attacking client. config.subject is the
    // attack activity. Returning false here cancels the roll — the ONLY permitted use
    // is the target-selection pause below, which guarantees the roll is re-issued
    // (with or without a target); automations must never cancel.
    const activity = config.subject;
    const item = activity?.item;
    if (!item) return;

    // Attack roll with nothing targeted: pause, let the user click a target on
    // the canvas, then the same roll is re-issued automatically. Applies to any
    // attack roll — each dnd5e attack roll resolves against one target, and item
    // target metadata (import templates, formula counts) is too unreliable to
    // filter on. Automations only see the resumed roll, so their pre-handlers
    // run once.
    if (interceptAttackTargeting(config) === false) return false;

    const actor = item.actor;
    const targets = targetDescriptors();
    const context = {event: 'attackRollConfigure', config, dialog, message, activity, item, actor, targets};
    dispatchSync('attackRollConfigure', {item, actor, effectActors: [actor, ...targets.map(t => t.actor)]}, context);
}

async function onRollAttack(rolls, data) {
    // dnd5e.rollAttackV2 fires only on the attacking client, after evaluation but
    // before ammunition is consumed. data.subject is the attack activity (null for
    // enricher-embedded rolls, which carry no item context — skipped).
    const activity = data?.subject;
    const item = activity?.item;
    if (!item) return;
    const actor = item.actor;
    const roll = rolls?.[0];
    if (!roll) return;
    const isCritical = roll.isCritical === true;
    const isFumble = roll.isFumble === true;
    const targets = targetDescriptors().map(target => ({
        ...target,
        hit: isFumble ? false
            : isCritical ? true
            : Number.isFinite(target.ac) ? roll.total >= target.ac
            : undefined
    }));
    const context = {
        event: 'attackRollComplete',
        roll,
        rolls,
        activity,
        item,
        actor,
        targets,
        hitTargets: targets.filter(target => target.hit === true),
        isCritical,
        isFumble,
        d20: roll.d20?.total ?? null
    };
    await dispatch('attackRollComplete', {item, actor, effectActors: [actor, ...targets.map(t => t.actor)]}, context);
}

/* -------------------------------------------- */
/*  saveRollConfigure / saveRollComplete        */
/* -------------------------------------------- */

function onPreRollSavingThrow(config, dialog, message) {
    // dnd5e.preRollSavingThrowV2 fires on the client rolling the save (the actor's
    // owner or the GM). Returning false would cancel the roll — never do that.
    const actor = config.subject;
    if (actor?.documentName !== 'Actor') return;
    const context = {event: 'saveRollConfigure', config, dialog, message, actor, ability: config.ability ?? null};
    dispatchSync('saveRollConfigure', {actor, effectActors: [actor]}, context);
}

async function onRollSavingThrow(rolls, data) {
    // dnd5e.rollSavingThrow fires on the client that rolled the save. When the save
    // was prompted from a chat card button the DC rides on roll.options.target.
    const actor = data?.subject;
    if (actor?.documentName !== 'Actor') return;
    const roll = rolls?.[0];
    if (!roll) return;
    const dc = Number.isFinite(roll.options?.target) ? roll.options.target : undefined;
    const context = {
        event: 'saveRollComplete',
        roll,
        rolls,
        actor,
        ability: data.ability ?? null,
        total: roll.total,
        dc,
        isSuccess: dc !== undefined ? roll.total >= dc : undefined,
        isFailure: dc !== undefined ? roll.total < dc : undefined,
        margin: dc !== undefined ? roll.total - dc : undefined,
        d20: roll.d20?.total ?? null
    };
    await dispatch('saveRollComplete', {actor, effectActors: [actor]}, context);
}

/* -------------------------------------------- */
/*  tokenMoveComplete                           */
/* -------------------------------------------- */

async function onUpdateToken(tokenDoc, changes, options, userId) {
    // updateToken fires on every client; only the mover's client dispatches, so
    // automations run exactly once and can talk to the user who moved the token.
    if (userId !== game.user.id) return;
    if (changes.x === undefined && changes.y === undefined) return;
    const actor = tokenDoc.actor;
    if (!actor) return;
    const context = {event: 'tokenMoveComplete', token: tokenDoc, actor, changes, userId};
    await dispatch('tokenMoveComplete', {actor, effectActors: [actor]}, context);
}
