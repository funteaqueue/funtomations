import {MODULE_ID} from '../../framework/constants.js';
import {registry} from '../../framework/registry.js';

/**
 * Bladesong — using the feature starts the song: an active effect on the actor
 * grants an AC bonus equal to the Intelligence modifier and +10 ft walking
 * speed for 1 minute. While the song lasts, weapon attack and damage rolls
 * that would use Strength or Dexterity use the Intelligence modifier instead.
 *
 * Using the feature again while a song is active restarts it (the old effect
 * is replaced). To end the song early, delete or disable the effect on the
 * actor. The AC bonus is a live formula, so it follows Intelligence changes.
 *
 * Not automated: ending the song when incapacitated or when donning medium/
 * heavy armor or a shield, advantage on Acrobatics checks, and the bonus to
 * concentration saves — the effect's description reminds the player.
 */

/** The bladesong effect currently applying to the actor, if any. */
function activeBladesong(actor) {
    return actor?.effects?.find(effect => effect.active && effect.getFlag(MODULE_ID, 'bladesong')) ?? null;
}

async function activate(context) {
    const actor = context.actor;
    if (!actor) return;

    // Re-activation restarts the song: replace the previous effect.
    await activeBladesong(actor)?.delete().catch(() => {});

    await actor.createEmbeddedDocuments('ActiveEffect', [{
        name: context.item.name,
        img: context.item.img,
        origin: context.item.uuid,
        duration: {seconds: 60},
        description: '<p>AC bonus equal to the Intelligence modifier, +10 ft walking speed, '
            + 'and weapon attacks/damage use Intelligence instead of Strength or Dexterity.</p>'
            + '<p><em>Ends early if you are incapacitated, don medium or heavy armor or a shield. '
            + 'Advantage on Acrobatics checks and the concentration save bonus are not automated.</em></p>',
        changes: [
            {
                key: 'system.attributes.ac.bonus',
                mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                value: '@abilities.int.mod'
            },
            {
                key: 'system.attributes.movement.walk',
                mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                value: '10'
            }
        ],
        flags: {[MODULE_ID]: {bladesong: true}}
    }]);
}

/* -------------------------------------------- */
/*  INT instead of STR/DEX on weapon rolls      */
/* -------------------------------------------- */

/**
 * Shared dnd5e.preRollAttackV2 / dnd5e.preRollDamageV2 handler. Both hooks fire
 * on the rolling client with the same config shape: config.subject is the attack
 * activity and each roll's data carries the ability modifier as `mod` (the @mod
 * part of the formula). While the song is active, swap it for the INT modifier
 * on weapon rolls that resolved to Strength or Dexterity.
 */
function swapAbilityMod(config) {
    if (!registry.isEnabled('bladesong')) return;
    const activity = config.subject;
    const item = activity?.item;
    if (item?.type !== 'weapon') return;
    const actor = item.actor;
    if (!actor || !activeBladesong(actor)) return;
    const ability = activity.ability;
    if (ability !== 'str' && ability !== 'dex') return;
    const intMod = actor.system.abilities?.int?.mod;
    if (typeof intMod !== 'number') return;
    for (const roll of config.rolls ?? []) {
        if (roll.data && 'mod' in roll.data) roll.data.mod = intMod;
    }
}

function init() {
    Hooks.on('dnd5e.preRollAttackV2', swapAbilityMod);
    Hooks.on('dnd5e.preRollDamageV2', swapAbilityMod);
}

export const bladesong = {
    id: 'bladesong',
    name: 'Bladesong',
    description: 'Using the feature starts the song: an active effect grants an AC bonus equal to the Intelligence modifier and +10 ft walking speed for 1 minute, and weapon attack/damage rolls that would use Strength or Dexterity use Intelligence instead. Using the feature again restarts the song; delete the effect to end it early. Ending conditions (incapacitated, medium/heavy armor, shield), Acrobatics advantage and the concentration bonus are not automated.',
    version: '1.0.0',
    match: {
        itemNames: ['Bladesong', 'Пісня клинка']
    },
    events: [
        // Item-lifecycle: only using the Bladesong feature itself starts the song
        // (the bladesong marker on the actor must not route anything back here).
        {
            event: 'featureUseComplete',
            handler: activate,
            priority: 50,
            scopes: ['item']
        }
    ],
    init
};
