import {CasinoApp} from './casinoApp.js';
import {emitToOthers} from '../../framework/sockets.js';

export class CasinoEngine {
    static async play(gameType, stakes, context) {
        const actor = context.actor;
        const sessionId = foundry.utils.randomID();

        // Broadcast to show the spectator UI to other players (pure peer broadcast, no GM needed)
        emitToOthers('casino.showViewer', gameType, stakes, game.user.id, actor?.uuid ?? null, sessionId);

        // Show the interactive minigame UI to the active player
        const gameResult = await CasinoApp.show({
            gameType: gameType,
            stakes: stakes,
            actor: actor,
            activeUserId: game.user.id,
            sessionId: sessionId,
            isViewer: false
        });

        // Broadcast to close the spectator UI for others
        emitToOthers('casino.closeViewer', sessionId);

        if (!gameResult) {
            // Player closed dialog without playing
            return stakes;
        }

        // Setup calculation variables
        let state = {
            chips: 0,
            mult: 1.0,
            logs: []
        };

        if (gameResult.game === 'coinflip') {
            const history = gameResult.history;
            const finalStakes = gameResult.stakes;

            state.chips = finalStakes;

            // Loop through each round and document logs
            history.forEach((round, index) => {
                const roundNum = index + 1;
                if (round.win) {
                    state.logs.push(`Round ${roundNum}: Guessed ${round.choice.toUpperCase()}, Landed ${round.result.toUpperCase()} -> Won! (Double: ${round.payout} DMG)`);
                } else {
                    state.logs.push(`Round ${roundNum}: Guessed ${round.choice.toUpperCase()}, Landed ${round.result.toUpperCase()} -> Lost! (Total Stakes set to 0)`);
                }
            });

            if (gameResult.timeout) {
                state.logs.push(`TIME OUT! Game stopped automatically. Banked stakes returned.`);
            } else if (finalStakes > 0) {
                state.logs.push(`Cashed Out at: ${finalStakes} DMG.`);
            }

        } else if (gameResult.game === 'roulette') {
            if (gameResult.timeout && gameResult.resultNumber === -1) {
                state.chips = stakes;
                state.logs.push(`TIME OUT! Game stopped automatically. No bets spun. Original stakes returned.`);
            } else {
                if (gameResult.timeout) {
                    state.logs.push(`TIME OUT! Game stopped automatically mid-spin. Spin results processed.`);
                }
                const bets = gameResult.bets;
                const resultColor = gameResult.resultColor;
                const resultNumber = gameResult.resultNumber;

                // Roulette payouts
                const redWin = resultColor === 'red';
                const blackWin = resultColor === 'black';
                const greenWin = resultColor === 'green';
                const numberWin = bets.numberVal !== '' && String(resultNumber) === bets.numberVal;

                let payoutChips = 0;
                if (redWin) payoutChips += bets.red * 2;
                if (blackWin) payoutChips += bets.black * 2;
                if (greenWin) payoutChips += bets.green * 14;
                if (numberWin) payoutChips += bets.numberAmt * 35;

                state.chips += payoutChips;

                state.logs.push(`Roulette landed on: ${resultColor.toUpperCase()} ${resultNumber}.`);

                // Log individual bets
                if (bets.red > 0) state.logs.push(`Bet on RED: ${bets.red} DMG -> ${redWin ? 'Won ' + (bets.red * 2) + ' DMG' : 'Lost'}`);
                if (bets.black > 0) state.logs.push(`Bet on BLACK: ${bets.black} DMG -> ${blackWin ? 'Won ' + (bets.black * 2) + ' DMG' : 'Lost'}`);
                if (bets.green > 0) state.logs.push(`Bet on GREEN: ${bets.green} DMG -> ${greenWin ? 'Won ' + (bets.green * 14) + ' DMG' : 'Lost'}`);
                if (bets.numberAmt > 0) state.logs.push(`Bet on Number ${bets.numberVal}: ${bets.numberAmt} DMG -> ${numberWin ? 'Won ' + (bets.numberAmt * 35) + ' DMG' : 'Lost'}`);
            }
        }

        // Calculate Final Damage
        const finalDamage = Math.max(0, Math.floor(state.chips * state.mult));

        // Render and post Results Chat Card
        await this.publishChatCard(actor, gameType, stakes, state, finalDamage);

        return finalDamage;
    }

    static async publishChatCard(actor, gameType, stakes, state, finalDamage) {
        const logHtml = state.logs.map(log => {
            return `<div class="step-log">> ${log}</div>`;
        }).join('');

        const cardContent = `
        <div class="balatro-chat-card crt">
            <div class="header-title">${gameType.toUpperCase()} RESULTS</div>

            <div class="step-log">> Initial Stakes: ${stakes} DMG</div>
            ${logHtml}

            <div class="result-summary">
                <div class="summary-cell">
                    <div class="total-label">CHIPS WON</div>
                    <div class="total-value chips-neon">${state.chips}</div>
                </div>
                <div class="summary-cell" style="font-size: 1.5rem; font-weight: 900; color: #00ffff; padding: 0 5px;">=</div>
                <div class="summary-cell">
                    <div class="total-label">FINAL DAMAGE</div>
                    <div class="total-value total-value-dmg" style="color: #00ff66; text-shadow: 0 0 8px #00ff66;">${finalDamage} DMG</div>
                </div>
            </div>
        </div>
        `;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: cardContent
        });
    }
}
