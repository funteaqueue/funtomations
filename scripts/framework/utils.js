import {MODULE_ID} from './constants.js';
import {registerSocketHandler, emitToOthers} from './sockets.js';

// Crosshair-cursor token pickers (click tokens to target them; single- and
// multi-target). Live in target-picker.js with the attack/save interception;
// re-exported here so automations and the module api reach them alongside
// pickCanvasLocation.
export {pickTargetToken, pickTargetTokens} from './target-picker.js';

/**
 * Simple yes/no confirmation dialog. Returns false when dismissed.
 * @param {string} title
 * @param {string} content
 * @returns {Promise<boolean>}
 */
export async function confirm(title, content) {
    const result = await foundry.applications.api.DialogV2.confirm({
        window: {title},
        content: `<p>${content}</p>`,
        rejectClose: false
    });
    return result === true;
}

/**
 * Cryptographically secure random integer in [0, maxExclusive).
 * @param {number} maxExclusive
 * @returns {number}
 */
export function secureRandomInt(maxExclusive) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % maxExclusive;
}

/**
 * Cryptographically secure random pick from an array.
 * @param {Array} array
 * @returns {*}
 */
export function secureRandomPick(array) {
    return array[secureRandomInt(array.length)];
}

/**
 * Let the user pick a location by clicking the canvas.
 * @param {string} [message]  Optional notification shown before picking.
 * @returns {Promise<{x: number, y: number}>}
 */
export async function pickCanvasLocation(message) {
    if (message) ui.notifications.info(message);
    return new Promise(resolve => {
        canvas.stage.once('pointerdown', event => {
            const position = event.getLocalPosition(canvas.stage);
            resolve({x: Math.round(position.x), y: Math.round(position.y)});
        });
    });
}

/**
 * The actor actually being played on the canvas. A cast can arrive on a BASE
 * actor while the player runs an UNLINKED token of it (sidebar sheet, hotbar
 * macros that store an Actor.<id> uuid): items summoned during play (e.g. a
 * Shadow Blade) then live only on the token's delta, invisible on the base
 * actor. Resolve to the unlinked token's synthetic actor — the controlled
 * token first, else the scene's only token of that actor. Token-backed and
 * linked actors come back unchanged, as does a base actor with no (or several
 * uncontrolled) unlinked tokens on the scene.
 * @param {Actor} actor
 * @returns {Actor}
 */
export function inPlayActor(actor) {
    if (!actor || actor.isToken || !canvas?.ready) return actor;
    const unlinked = actor.getActiveTokens(false, true)
        .filter(token => !token.actorLink && token.actor);
    if (!unlinked.length) return actor;
    const controlled = unlinked.find(token => token.object?.controlled);
    if (controlled) return controlled.actor;
    return unlinked.length === 1 ? unlinked[0].actor : actor;
}

/**
 * Deterministically elect one connected client to act on a document, so hooks that fire
 * on every client (e.g. deleteActiveEffect) perform side effects exactly once.
 * Prefers a GM, then the first active owner by user id.
 * @param {Document} doc
 * @returns {User|null}
 */
export function firstActiveOwner(doc) {
    const users = game.users.filter(user => user.active && doc.testUserPermission(user, 'OWNER'));
    users.sort((a, b) => (b.isGM - a.isGM) || a.id.localeCompare(b.id));
    return users[0] ?? null;
}

/* -------------------------------------------- */
/*  GM-relayed writes to non-owned actors       */
/* -------------------------------------------- */

/**
 * Same-named module marker effects already embedded on the actor. Only the actor's
 * own effects are considered (never item-transferred ones) and only module-flagged
 * ones — a marker must never displace a vanilla or foreign-module effect.
 * @param {Actor} actor
 * @param {object} effectData
 * @returns {string[]}  Ids of the stale duplicates to delete before creating.
 */
function staleMarkerIds(actor, effectData) {
    return actor.effects
        .filter(effect => effect.name === effectData.name && effect.flags?.[MODULE_ID])
        .map(effect => effect.id);
}

/**
 * Bind a just-created module effect to a concentration effect (dnd5e addDependent),
 * so it is deleted when concentration ends. The concentration uuid travels inside the
 * effect data as flags[MODULE_ID].concentrationUuid because on the relayed path only
 * the GM's client ever holds the created effect document — linking must happen on
 * whichever client performed the write.
 * @param {ActiveEffect} effect      The effect that was just created.
 * @param {object} effectData        The data it was created from.
 */
async function linkToConcentration(effect, effectData) {
    const uuid = effectData?.flags?.[MODULE_ID]?.concentrationUuid;
    if (!uuid || !effect) return;
    const concentration = await fromUuid(uuid);
    if (concentration && typeof concentration.addDependent === 'function') {
        await concentration.addDependent(effect);
    }
}

/**
 * Create an active effect on an actor the current user may not own. Owned actors are
 * written directly; otherwise the write is relayed to the active GM's client over the
 * module socket. The effect data MUST carry a flags[MODULE_ID] entry (the relay
 * refuses unflagged effects), which also enables effect-scope event routing.
 * Markers never stack: a same-named module effect already on the actor is replaced,
 * so a re-cast refreshes the marker (duration, computed dice) instead of duplicating it.
 * If the data carries flags[MODULE_ID].concentrationUuid, the created effect is bound
 * to that concentration effect (addDependent) on whichever client performs the write.
 * @param {Actor} actor
 * @param {object} effectData
 * @returns {Promise<'applied'|'relayed'|false>}  How the write was delivered; false
 *     when the user lacks ownership and no GM is online — skip the write and log it.
 */
export async function applyEffectToActor(actor, effectData) {
    if (!actor || !effectData?.flags?.[MODULE_ID]) return false;
    if (actor.isOwner) {
        const stale = staleMarkerIds(actor, effectData);
        if (stale.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stale);
        const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
        await linkToConcentration(effect, effectData);
        return 'applied';
    }
    if (game.users.activeGM) {
        emitToOthers('framework.applyEffect', actor.uuid, effectData);
        return 'relayed';
    }
    return false;
}

/**
 * Delete a module-flagged document (usually a marker active effect) the current user
 * may not own, relaying to the active GM's client when needed. Only documents carrying
 * a flags[MODULE_ID] entry are eligible — the relay refuses anything else.
 * @param {Document} doc
 * @returns {Promise<'deleted'|'relayed'|false>}  How the delete was delivered; false
 *     when the user lacks ownership and no GM is online.
 */
export async function deleteDocument(doc) {
    if (!doc?.flags?.[MODULE_ID]) return false;
    if (doc.isOwner) {
        await doc.delete();
        return 'deleted';
    }
    if (game.users.activeGM) {
        emitToOthers('framework.deleteDocument', doc.uuid);
        return 'relayed';
    }
    return false;
}

/**
 * Register the socket handlers backing applyEffectToActor / deleteDocument. Called
 * once at init; the handlers self-select so only the active GM's client executes.
 */
export function initFrameworkRelays() {
    registerSocketHandler('framework.applyEffect', async (actorUuid, effectData) => {
        if (game.users.activeGM !== game.user) return;
        if (!effectData?.flags?.[MODULE_ID]) return;
        const actor = await fromUuid(actorUuid);
        if (actor?.documentName !== 'Actor') return;
        // No stacking: replace a same-named module marker (dedupe here, at write
        // time on the GM's client, where the actor's state is current).
        const stale = staleMarkerIds(actor, effectData);
        if (stale.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stale);
        const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
        await linkToConcentration(effect, effectData);
    });
    registerSocketHandler('framework.deleteDocument', async uuid => {
        if (game.users.activeGM !== game.user) return;
        const doc = await fromUuid(uuid);
        if (!doc?.flags?.[MODULE_ID]) return;
        await doc.delete();
    });
}
