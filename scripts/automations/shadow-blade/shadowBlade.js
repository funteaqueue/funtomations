import {MODULE_ID} from '../../framework/constants.js';
import {firstActiveOwner, inPlayActor} from '../../framework/utils.js';

/**
 * Shadow Blade — on cast, a magic weapon appears in the caster's inventory:
 * a simple melee weapon (finesse, light, thrown 20/60) dealing psychic damage
 * that scales with the slot level: 2d8 at 2nd, 3d8 at 3rd–4th, 4d8 at 5th–6th,
 * 5d8 at 7th+.
 *
 * If a blade with the same name is already in the inventory (from a previous
 * cast, or kept via the "persist" setting) it is reused: its damage is updated
 * to the new cast level instead of creating a duplicate.
 *
 * Cleanup is tied to the spell's concentration effect: when concentration ends
 * (or the spell is recast, ending the old concentration), the blade is deleted
 * by the elected owner client. The per-item "When concentration ends" setting
 * can instead leave the blade in the inventory permanently.
 *
 * Attacks are made with the summoned weapon, not the spell — the Attack/Damage
 * buttons on the spell's usage chat card are stripped so casting doesn't offer
 * to deal damage directly.
 *
 * The advantage against targets in dim light or darkness is not automated —
 * the blade's description reminds the player.
 *
 * Per-item settings (Manage Automations on the spell):
 *   - ability: attack/damage ability for the blade's attack activity.
 *     "Automatic" leaves dnd5e's finesse handling (best of STR/DEX).
 *   - behavior: despawn on concentration end (default) or create once and keep.
 */

/** Number of d8s for a given slot level (base 2nd). */
function bladeDice(castLevel) {
    if (castLevel >= 7) return 5;
    if (castLevel >= 5) return 4;
    if (castLevel >= 3) return 3;
    return 2;
}

function buildBladeData(spell, dice) {
    return {
        name: spell.name,
        type: 'weapon',
        img: spell.img,
        system: {
            description: {
                value: '<p>A sword of solidified gloom. Simple melee weapon, finesse, light, '
                    + 'thrown (range 20/60). Deals psychic damage.</p>'
                    + '<p><em>When you attack a target that is in dim light or darkness, '
                    + 'you make the attack roll with advantage.</em></p>'
            },
            type: {value: 'simpleM', baseItem: ''},
            proficient: 1,
            properties: ['fin', 'lgt', 'thr', 'mgc'],
            range: {value: 20, long: 60, reach: 5, units: 'ft'},
            damage: {base: {number: dice, denomination: 8, types: ['psychic']}},
            equipped: true,
            quantity: 1,
            weight: {value: 0, units: 'lb'}
        },
        flags: {
            [MODULE_ID]: {
                shadowBlade: {concentrationUuid: null},
                // The blade shares the spell's name; keep the manager from
                // name-matching this automation onto the weapon itself.
                disabledAutomations: ['shadowBlade']
            }
        }
    };
}

/**
 * Remove the Attack/Damage buttons from the spell's usage chat card: the cast
 * only summons the blade, the rolls come from the weapon item. dnd5e bakes the
 * buttons into the stored card content, so one update fixes it for everyone.
 */
async function stripAttackButtons(message) {
    // results.message is plain data (not a document) when card creation was skipped
    if (!message?.content || typeof message.update !== 'function') return;
    const content = document.createElement('div');
    content.innerHTML = message.content;
    const buttons = content.querySelectorAll(
        'button[data-action="rollAttack"], button[data-action="rollDamage"]');
    if (!buttons.length) return;
    for (const button of buttons) button.remove();
    await message.update({content: content.innerHTML});
}

async function cast(context) {
    // The blade materializes on the IN-PLAY actor: a cast arriving on the base
    // actor (sidebar sheet, Actor.<id> hotbar macros) while the player runs an
    // unlinked token must put the weapon on the token's sheet, where the other
    // blade automations (True Strike, Booming Blade) will look for it.
    const actor = inPlayActor(context.actor);
    if (!actor) return;

    await stripAttackButtons(context.message);

    const dice = bladeDice(context.castLevel);
    const behavior = context.settings?.behavior ?? 'despawn';
    const abilitySetting = context.settings?.ability ?? 'auto';
    const ability = abilitySetting === 'auto' ? '' : abilitySetting;
    const concentration = context.results?.effects
        ?.find(effect => effect.statuses?.has?.(CONFIG.specialStatusEffects.CONCENTRATING)) ?? null;
    const concentrationUuid = behavior === 'despawn' ? concentration?.uuid ?? null : null;

    // Reuse an existing blade (previous cast, or a kept "persist" blade) instead
    // of spawning a duplicate: rebind it and update its damage to this cast.
    const bladeName = context.item.name.toLowerCase();
    let blade = actor.items.find(item => item.type === 'weapon'
        && (item.getFlag(MODULE_ID, 'shadowBlade') || item.name.toLowerCase() === bladeName));
    if (blade) {
        await blade.update({
            'system.damage.base.number': dice,
            'system.equipped': true,
            [`flags.${MODULE_ID}.shadowBlade.concentrationUuid`]: concentrationUuid
        });
    } else {
        const bladeData = buildBladeData(context.item, dice);
        bladeData.flags[MODULE_ID].shadowBlade.concentrationUuid = concentrationUuid;
        [blade] = await actor.createEmbeddedDocuments('Item', [bladeData]);
    }

    // dnd5e auto-creates an attack activity on new weapons; point it at the
    // configured ability ('' = automatic, so finesse picks the best of STR/DEX).
    const attack = blade.system.activities?.find?.(activity => activity.type === 'attack');
    if (attack && attack.attack.ability !== ability) {
        await attack.update({'attack.ability': ability});
    }

    if (behavior === 'despawn') {
        if (concentration) {
            await concentration.setFlag(MODULE_ID, 'shadowBlade', {itemUuid: blade.uuid});
        } else {
            ui.notifications.warn(`${context.item.name}: cast without concentration — delete the blade manually when the spell ends.`);
        }
    }
}

/* -------------------------------------------- */
/*  Cleanup when concentration ends             */
/* -------------------------------------------- */

async function onDeleteActiveEffect(effect) {
    const data = effect.getFlag?.(MODULE_ID, 'shadowBlade');
    if (!data?.itemUuid) return;
    const blade = fromUuidSync(data.itemUuid);
    if (!blade) return;
    // A recast rebinds the blade to the new concentration effect before the old
    // one is deleted — only remove the blade if it still belongs to this effect.
    if (blade.getFlag(MODULE_ID, 'shadowBlade')?.concentrationUuid !== effect.uuid) return;
    // Every client sees this hook; the elected owner client performs the delete.
    if (firstActiveOwner(blade.actor ?? blade)?.isSelf) {
        await blade.delete().catch(() => {});
    }
}

function init() {
    Hooks.on('deleteActiveEffect', onDeleteActiveEffect);
}

export const shadowBlade = {
    id: 'shadowBlade',
    name: 'Shadow Blade',
    description: 'On cast, puts a Shadow Blade weapon (finesse, light, thrown 20/60, psychic damage scaling with slot level) into the caster\'s inventory, reusing an existing blade instead of duplicating it. Attack/Damage buttons are stripped from the spell\'s chat card — rolls come from the weapon. The blade is deleted when concentration ends (configurable). Advantage in dim light/darkness is not automated.',
    version: '1.0.2',
    settings: [
        {
            key: 'ability',
            name: 'Attack/damage ability',
            hint: 'Ability the blade\'s attack activity uses. "Automatic" lets dnd5e pick (finesse: best of Strength/Dexterity).',
            type: 'select',
            default: 'auto',
            choices: {
                auto: 'Automatic (finesse)',
                str: 'Strength',
                dex: 'Dexterity',
                int: 'Intelligence',
                wis: 'Wisdom',
                cha: 'Charisma',
                spellcasting: 'Spellcasting ability'
            }
        },
        {
            key: 'behavior',
            name: 'When concentration ends',
            hint: 'Despawn deletes the blade when concentration breaks; Keep creates it once and leaves it in the inventory.',
            type: 'select',
            default: 'despawn',
            choices: {
                despawn: 'Delete the blade',
                persist: 'Keep the blade (create once)'
            }
        }
    ],
    match: {
        itemNames: ['Shadow Blade', 'Тіньовий клинок']
    },
    events: [
        // Item-lifecycle: without the scope, the shadowBlade flag on the caster's
        // concentration effect routed every other spell they cast while
        // concentrating back here via effect scope — stripping that spell's
        // Attack/Damage buttons and resetting the blade's damage dice.
        {
            event: 'spellCastComplete',
            handler: cast,
            priority: 50,
            scopes: ['item']
        }
    ],
    init
};
