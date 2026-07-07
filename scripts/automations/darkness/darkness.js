import {MODULE_ID} from '../../framework/constants.js';
import {registerSocketHandler, emitToOthers} from '../../framework/sockets.js';
import {pickCanvasLocation, firstActiveOwner} from '../../framework/utils.js';

/**
 * Darkness — creates a real zone of magical darkness as a negative ("darkness") light source.
 * With Vision 5e active, darkness sources block normal sight and darkvision, while
 * Devil's Sight and Truesight see through them — exactly the spell's behavior.
 *
 * The player chooses on cast:
 *   - Aura: the darkness is attached to the caster's token light and moves with them
 *     (the "object you're holding" casting). Fully GM-less — owners may update their token.
 *     Also gets a token-attached emanation Region (v14) as a control handle that
 *     follows the token; deleting it ends the concentration.
 *   - Point: a static AmbientLight darkness zone plus a matching scene Region (same
 *     center and radius, named after the spell and caster) that acts as the zone's
 *     control handle. Foundry only lets GMs create scene documents, so player casts
 *     relay creation/removal to an online GM client; without scene rights and without
 *     a GM online, the aura is the fallback.
 *
 * Cleanup is tied to the spell's concentration effect: when concentration ends (or the
 * spell is recast, ending the old concentration), the aura/zone/region is removed.
 * The link works both ways — deleting the region (or the light) removes its partner
 * and ends the caster's concentration.
 */

const RADIUS = 15; // feet

function configureCast(context) {
    // The automation places its own darkness source, so the vanilla measured template
    // is redundant — turn it off and hide the "Place Template" checkbox in the dialog.
    if (context.usageConfig.create === false) return;
    context.usageConfig.create ??= {};
    context.usageConfig.create.measuredTemplate = false;
    foundry.utils.setProperty(context.dialogConfig, 'options.display.create.measuredTemplate', false);
}

async function cast(context) {
    const actor = context.actor;
    const token = actor?.getActiveTokens?.().find(t => t.controlled)?.document
        ?? actor?.getActiveTokens?.()[0]?.document
        ?? null;

    const mode = await foundry.applications.api.DialogV2.wait({
        window: {title: context.item.name},
        content: '<p>How do you want to shape the darkness?</p>',
        buttons: [
            {action: 'aura', label: 'Aura (follows you)', icon: 'fa-solid fa-circle-half-stroke', default: true},
            {action: 'point', label: 'Point on the map', icon: 'fa-solid fa-location-dot'},
            {action: 'cancel', label: 'No effect', icon: 'fa-solid fa-xmark'}
        ],
        rejectClose: false
    });
    if (!mode || mode === 'cancel') return;

    const concentration = context.results?.effects
        ?.find(effect => effect.statuses?.has?.(CONFIG.specialStatusEffects.CONCENTRATING)) ?? null;

    if (mode === 'aura') {
        if (!token) {
            ui.notifications.warn(`${context.item.name}: no token found for ${actor?.name ?? 'the caster'} on the scene.`);
            return;
        }
        const originalLight = token.light.toObject();
        await token.update({light: {negative: true, dim: RADIUS, bright: RADIUS}});
        if (concentration) {
            await concentration.setFlag(MODULE_ID, 'darkness', {
                type: 'aura',
                tokenUuid: token.uuid,
                originalLight
            });
        } else {
            ui.notifications.warn(`${context.item.name}: cast without concentration — restore the token's light manually when the spell ends.`);
        }
        await createAuraRegion(token, context.item.name, concentration);
        return;
    }

    // Point mode: normally picked by click — configureCast suppresses the vanilla template,
    // but if one slipped through anyway, anchor on it and clean it up.
    let position;
    const template = context.results?.templates?.[0];
    if (template) {
        position = {x: template.x, y: template.y};
        // The darkness source itself shows the area; the template is no longer needed
        await template.delete().catch(() => {});
    } else {
        position = await pickCanvasLocation(`${context.item.name}: click on the map to place the darkness.`);
    }
    if (!position) return;

    const lightData = {
        x: position.x,
        y: position.y,
        config: {negative: true, dim: RADIUS, bright: RADIUS},
        flags: {[MODULE_ID]: {darknessSource: concentration?.uuid ?? true}}
    };
    // A matching region is the zone's control handle: same circle, named after the
    // cast, and deleting it removes the light and ends the caster's concentration.
    // Mirrors how v14 represents spell templates as regions: visible to everyone on
    // every layer, with the caster as owner so they can move/delete their own spell.
    const regionData = {
        name: `${context.item.name} (${actor?.name ?? '?'})`,
        color: '#4b0082',
        shapes: [{
            type: 'circle',
            x: position.x,
            y: position.y,
            radius: RADIUS * canvas.scene.grid.size / canvas.scene.grid.distance
        }],
        visibility: CONST.REGION_VISIBILITY.ALWAYS,
        ownership: {[game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER},
        flags: {[MODULE_ID]: {darknessSource: concentration?.uuid ?? true}}
    };

    const canCreate = getDocumentClass('AmbientLight').canUserCreate(game.user)
        && getDocumentClass('Region').canUserCreate(game.user);
    if (canCreate) {
        await createZoneDocuments(canvas.scene, lightData, regionData);
    } else if (game.users.activeGM) {
        emitToOthers('darkness.createZone', canvas.scene.id, lightData, regionData);
    } else {
        ui.notifications.warn(`${context.item.name}: placing a static darkness zone needs scene rights or an online GM — cast it as an aura instead.`);
        return;
    }
    if (!concentration) {
        ui.notifications.warn(`${context.item.name}: cast without concentration — remove the darkness region manually when the spell ends.`);
    }
}

/** Create the linked region + darkness light pair for a point zone. */
async function createZoneDocuments(scene, lightData, regionData) {
    const [region] = await scene.createEmbeddedDocuments('Region', [regionData]);
    lightData.flags[MODULE_ID].regionId = region.id;
    await scene.createEmbeddedDocuments('AmbientLight', [lightData]);
}

/**
 * Give the aura a control handle too: a token-attached emanation region (v14) that
 * follows the caster. Deleting it ends the concentration, which restores the token
 * light. The darkness itself is the token light, so if the region can't be created
 * (no rights, no GM online) the aura still works — it just has no region handle.
 */
async function createAuraRegion(token, spellName, concentration) {
    const regionData = {
        name: `${spellName} (${token.name})`,
        color: '#4b0082',
        visibility: CONST.REGION_VISIBILITY.ALWAYS,
        ownership: {[game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER},
        flags: {[MODULE_ID]: {darknessSource: concentration?.uuid ?? true}}
    };
    const RegionCls = getDocumentClass('Region');
    if (RegionCls.canUserCreate(game.user)) {
        await RegionCls.createTokenEmanation(token, RADIUS, regionData);
    } else if (game.users.activeGM) {
        emitToOthers('darkness.createAuraRegion', token.uuid, regionData);
    }
}

/* -------------------------------------------- */
/*  Cleanup when concentration ends             */
/* -------------------------------------------- */

async function onDeleteActiveEffect(effect) {
    // Aura: restore the token's original light. Every client sees this hook; the elected
    // owner client performs the (idempotent) revert.
    const data = effect.getFlag?.(MODULE_ID, 'darkness');
    if (data?.type === 'aura') {
        const token = fromUuidSync(data.tokenUuid);
        if (token && firstActiveOwner(token)?.isSelf) {
            await token.update({light: data.originalLight});
        }
    }

    // Zones: the active GM client removes lights and regions bound to this
    // concentration effect. Deleting a light also cascades to its linked region
    // (and vice versa), so these scans just catch whatever is left.
    if (game.users.activeGM !== game.user) return;
    for (const scene of game.scenes) {
        const lightIds = scene.lights
            .filter(light => light.getFlag(MODULE_ID, 'darknessSource') === effect.uuid)
            .map(light => light.id);
        if (lightIds.length) await scene.deleteEmbeddedDocuments('AmbientLight', lightIds);
        const regionIds = scene.regions
            .filter(region => region.getFlag(MODULE_ID, 'darknessSource') === effect.uuid)
            .map(region => region.id);
        if (regionIds.length) await scene.deleteEmbeddedDocuments('Region', regionIds);
    }
}

/* -------------------------------------------- */
/*  Region <-> light <-> concentration links    */
/* -------------------------------------------- */

// Deleting the region removes the linked darkness light and ends the caster's
// concentration — the region layer is the zone's control panel.
async function onDeleteRegion(region) {
    if (game.users.activeGM !== game.user) return;
    const source = region.getFlag?.(MODULE_ID, 'darknessSource');
    if (!source) return;
    const lightIds = region.parent.lights
        .filter(light => light.getFlag(MODULE_ID, 'regionId') === region.id)
        .map(light => light.id);
    if (lightIds.length) await region.parent.deleteEmbeddedDocuments('AmbientLight', lightIds);
    if (typeof source === 'string') await fromUuidSync(source)?.delete().catch(() => {});
}

// Moving or reshaping the region drags the darkness light along with it.
async function onUpdateRegion(region, changes) {
    if (game.users.activeGM !== game.user) return;
    if (!('shapes' in changes) || !region.getFlag(MODULE_ID, 'darknessSource')) return;
    const shape = region.shapes[0];
    if (shape?.type !== 'circle') return;
    const lights = region.parent.lights
        .filter(light => light.getFlag(MODULE_ID, 'regionId') === region.id);
    for (const light of lights) {
        await light.update({x: shape.x, y: shape.y});
    }
}

// Deleting the light directly (the old way) tears down the region and concentration too.
async function onDeleteAmbientLight(light) {
    if (game.users.activeGM !== game.user) return;
    const regionId = light.getFlag?.(MODULE_ID, 'regionId');
    if (!regionId) return;
    await light.parent?.regions.get(regionId)?.delete().catch(() => {});
}

function init() {
    Hooks.on('deleteActiveEffect', onDeleteActiveEffect);
    Hooks.on('deleteRegion', onDeleteRegion);
    Hooks.on('updateRegion', onUpdateRegion);
    Hooks.on('deleteAmbientLight', onDeleteAmbientLight);
    registerSocketHandler('darkness.createZone', (sceneId, lightData, regionData) => {
        if (game.users.activeGM !== game.user) return;
        const scene = game.scenes.get(sceneId);
        if (scene) createZoneDocuments(scene, lightData, regionData);
    });
    registerSocketHandler('darkness.createAuraRegion', (tokenUuid, regionData) => {
        if (game.users.activeGM !== game.user) return;
        const token = fromUuidSync(tokenUuid);
        if (token) getDocumentClass('Region').createTokenEmanation(token, RADIUS, regionData);
    });
}

export const darkness = {
    id: 'darkness',
    name: 'Darkness',
    description: 'On cast, creates a real darkness source as either an aura following the caster or a point zone with a matching scene region as its control handle (delete or drag the region to end or move the darkness). Devil\'s Sight and Truesight see through (with Vision 5e); ends when concentration ends.',
    version: '1.0.1',
    match: {
        itemNames: ['Darkness', 'Темрява']
    },
    events: [
        // Item-lifecycle: without the scope on spellCastComplete, the darkness
        // flag on the caster's concentration effect routed every other spell they
        // cast while concentrating back here via effect scope — opening the
        // aura/point dialog for that unrelated spell.
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
        }
    ],
    init
};
