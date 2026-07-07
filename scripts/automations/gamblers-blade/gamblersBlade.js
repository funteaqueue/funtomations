import {confirm, secureRandomPick} from '../../framework/utils.js';
import {CasinoEngine} from './casinoEngine.js';
import {registerCasinoSockets} from './casinoApp.js';

async function damage(context) {
    if (!context.damageRolls?.length) return;

    // 1. Ask player if they want to gamble
    const wantToGamble = await confirm(
        context.item.name,
        'Would you like to gamble your damage stakes?'
    );
    if (!wantToGamble) return;

    // 2. Choose randomly (50/50) between Coinflip and Roulette
    const chosenGame = secureRandomPick(['coinflip', 'roulette']);

    // 3. Play chosen game
    const initialDamage = context.damageTotal;
    const result = await CasinoEngine.play(chosenGame, initialDamage, context);

    // 4. Rewrite the damage card based on the outcome; vanilla dnd5e applies
    //    damage from the card's rolls, so this is what targets will take.
    if (result !== initialDamage) {
        const damageType = context.damageRolls[0]?.options?.type;
        const DamageRoll = CONFIG.Dice?.DamageRoll ?? Roll;
        const newDamageRoll = await new DamageRoll(`${result}`, {}, {type: damageType}).evaluate();
        await context.setDamageRolls([newDamageRoll]);

        // Show 3D dice if Dice So Nice is active to reflect the final damage card
        if (game.dice3d) {
            await game.dice3d.showForRoll(newDamageRoll, game.user, true);
        }
    }
}

export const gamblersBlade = {
    id: 'gamblersBlade',
    name: "Gambler's Blade",
    description: 'After rolling damage, offers to gamble the damage total in a casino minigame (coinflip or roulette). The damage card is rewritten with the winnings; other players get a live spectator window.',
    version: '1.0.0',
    match: {
        itemNames: ["Gambler's Blade"]
    },
    events: [
        // Item-lifecycle: only the matched/bound weapon's own damage cards.
        {
            event: 'damageRollComplete',
            handler: damage,
            priority: 50,
            scopes: ['item']
        }
    ],
    init: registerCasinoSockets
};
