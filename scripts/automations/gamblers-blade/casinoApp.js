const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
import {MODULE_ID} from '../../framework/constants.js';
import {emitToOthers, registerSocketHandler} from '../../framework/sockets.js';

export class CasinoApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        const gameType = options.gameType ?? 'roulette';
        options.position = options.position ?? {};
        options.position.width = gameType === 'roulette' ? 820 : 420;
        super(options);
        this.gameType = gameType;
        this.stakes = options.stakes ?? 0;
        this.actor = options.actor;
        this.activeUserId = options.activeUserId ?? game.user.id;
        this.sessionId = options.sessionId ?? '';
        this.isViewer = options.isViewer ?? false;
        this.resolvePromise = null;
        this.timerId = null;
        this.timeLeft = gameType === 'coinflip' ? 15 : 30;

        // Roulette bets
        this.currentBets = {
            red: 0,
            black: 0,
            green: 0,
            numberAmt: 0,
            numberVal: ''
        };

        // Coinflip specific state
        this.currentStakes = this.stakes;
        this.coinChoice = 'heads';
        this.coinRotation = 0;
        this.flipHistory = [];
        this.isAnimating = false;
        this.hasTimedOutMidAction = false;
    }

    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['balatro-casino-window'],
        window: {
            title: 'Balatro Gambler Interface',
            contentClasses: ['balatro-casino-form'],
            resizable: false,
            minimizable: false
        },
        position: {
            width: 420
        },
        actions: {}
    };

    get title() {
        return this.gameType === 'coinflip' ? "Gambler Interface: Coinflip" : "Gambler Interface: Roulette";
    }

    static PARTS = {
        form: {
            template: '' // Set dynamically
        }
    };

    _configureRenderParts(options) {
        const parts = super._configureRenderParts(options);
        if (parts.form) {
            parts.form.template = `modules/${MODULE_ID}/templates/casino/${this.gameType}.hbs`;
        }
        return parts;
    }

    async _prepareContext(options) {
        const context = {};
        context.stakes = this.stakes;
        context.isViewer = this.isViewer;
        const activeUser = game.users.get(this.activeUserId);
        context.activeUsername = activeUser ? activeUser.name : 'Unknown Player';

        if (this.gameType === 'roulette') {
            context.numbers = Array.from({length: 37}, (_, i) => i); // 0 to 36

            // European wheel order pockets context
            const wheelNumbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
            context.pockets = wheelNumbers.map((num, index) => {
                const angle = index * (360 / 37);
                const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
                const color = num === 0 ? 'green' : (redNumbers.includes(num) ? 'red' : 'black');
                return {
                    number: num,
                    angle: angle,
                    negAngle: 180, // Rotate pocket text 180deg to face center radially
                    color: color
                };
            });
        }

        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        this.startCountdown(html);

        if (this.gameType === 'coinflip') {
            // Setup Coinflip listeners
            const headsBtn = html.querySelector('.btn-heads');
            const tailsBtn = html.querySelector('.btn-tails');
            const flipBtn = html.querySelector('#btn-play-coinflip');
            const coin = html.querySelector('#casino-coin');
            const postWinDiv = html.querySelector('#coin-post-win');
            const cashoutBtn = html.querySelector('#btn-coin-cashout');
            const continueBtn = html.querySelector('#btn-coin-continue');
            const stakesLabel = html.querySelector('#coinflip-stakes-label');

            headsBtn.addEventListener('click', () => {
                headsBtn.classList.add('selected');
                tailsBtn.classList.remove('selected');
                this.coinChoice = 'heads';
            });

            tailsBtn.addEventListener('click', () => {
                tailsBtn.classList.add('selected');
                headsBtn.classList.remove('selected');
                this.coinChoice = 'tails';
            });

            flipBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                this.isAnimating = true;

                // Disable choice buttons and flip button during spin
                flipBtn.disabled = true;
                headsBtn.disabled = true;
                tailsBtn.disabled = true;

                // Cryptographically secure flip result
                const array = new Uint32Array(1);
                window.crypto.getRandomValues(array);
                const isHeads = (array[0] % 2) === 0;
                const result = isHeads ? 'heads' : 'tails';
                const win = this.coinChoice === result;

                if (!this.isViewer && this.sessionId) {
                    emitToOthers('casino.flip', this.sessionId, result, this.coinChoice);
                }

                // Calculate spin rotation smoothly from previous position
                this.coinRotation = this.coinRotation + 1440; // 4 full spins
                if (result === 'heads') {
                    this.coinRotation = Math.ceil(this.coinRotation / 360) * 360;
                } else {
                    this.coinRotation = Math.ceil((this.coinRotation - 180) / 360) * 360 + 180;
                }

                coin.style.transition = 'transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)';
                coin.style.transform = `rotateY(${this.coinRotation}deg)`;

                // Wait for 4s animation to finish
                await new Promise(resolve => setTimeout(resolve, 4000));

                this.isAnimating = false;

                if (win) {
                    this.currentStakes *= 2;
                    stakesLabel.textContent = `${this.currentStakes} DMG`;

                    this.flipHistory.push({
                        choice: this.coinChoice,
                        result: result,
                        win: true,
                        payout: this.currentStakes
                    });

                    // Update UI result area to show result
                    const resultDiv = html.querySelector('#coinflip-result');
                    if (resultDiv) {
                        resultDiv.innerHTML = `RESULT: <span style="color: ${result === 'heads' ? '#ffcc00' : '#ff5500'}; text-shadow: 0 0 10px ${result === 'heads' ? '#ffcc00' : '#ff5500'}; font-size: 1.2rem; font-weight: 900; animation: neon-flash 0.5s infinite alternate;">${result.toUpperCase()} (WON!)</span>`;
                    }

                    // Check if they timed out mid-flip
                    if (this.hasTimedOutMidAction) {
                        await new Promise(resolve => setTimeout(resolve, 2500));
                        this._finish({
                            game: 'coinflip',
                            win: true,
                            stakes: this.currentStakes,
                            history: this.flipHistory,
                            timeout: true
                        });
                        return;
                    }

                    // Re-enable choice buttons so they can choose for the next round
                    headsBtn.disabled = this.isViewer;
                    tailsBtn.disabled = this.isViewer;

                    // Show Cash Out / Continue buttons
                    flipBtn.style.display = 'none';
                    postWinDiv.style.display = 'flex';
                } else {
                    this.currentStakes = 0;
                    this.flipHistory.push({
                        choice: this.coinChoice,
                        result: result,
                        win: false,
                        payout: 0
                    });

                    // Show failure card state, wait 2.5s, and resolve
                    stakesLabel.textContent = `0 DMG`;
                    stakesLabel.style.color = '#ff0055';

                    const resultDiv = html.querySelector('#coinflip-result');
                    if (resultDiv) {
                        resultDiv.innerHTML = `RESULT: <span style="color: #ff0055; text-shadow: 0 0 10px #ff0055; font-size: 1.2rem; font-weight: 900; animation: neon-flash 0.5s infinite alternate;">${result.toUpperCase()} (LOST)</span>`;
                    }

                    await new Promise(resolve => setTimeout(resolve, 2500));

                    this._finish({
                        game: 'coinflip',
                        win: false,
                        stakes: 0,
                        history: this.flipHistory
                    });
                }
            });

            cashoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._finish({
                    game: 'coinflip',
                    win: true,
                    stakes: this.currentStakes,
                    history: this.flipHistory
                });
            });

            continueBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Setup next flip round
                postWinDiv.style.display = 'none';

                flipBtn.disabled = false;
                flipBtn.style.display = 'none';
                headsBtn.disabled = false;
                tailsBtn.disabled = false;

                // Clear previous result
                const resultDiv = html.querySelector('#coinflip-result');
                if (resultDiv) {
                    resultDiv.innerHTML = '';
                }

                // Restart timer if not running
                if (!this.timerId) {
                    const timerDisplayDiv = html.querySelector('.timer-display');
                    if (timerDisplayDiv) {
                        timerDisplayDiv.innerHTML = `TIME REMAINING: <span id="game-timer" style="color: #ffcc00; text-shadow: 0 0 5px #ffcc00; font-size: 1.1rem; font-weight: 900;">${this.timeLeft}s</span>`;
                    }
                    this.startCountdown(html);
                }

                // Broadcast continue to spectators
                if (!this.isViewer && this.sessionId) {
                    emitToOthers('casino.continue', this.sessionId);
                }

                // Immediately flip the coin
                flipBtn.click();
            });

        } else if (this.gameType === 'roulette') {
            // Setup Roulette listeners
            const redInput = html.querySelector('input[name="bet-red"]');
            const blackInput = html.querySelector('input[name="bet-black"]');
            const greenInput = html.querySelector('input[name="bet-green"]');
            const numSelect = html.querySelector('select[name="bet-number-val"]');
            const numAmtInput = html.querySelector('input[name="bet-number-amt"]');
            const spinBtn = html.querySelector('#btn-play-roulette');
            const unallocatedLabel = html.querySelector('#unallocated-damage');
            const wheel = html.querySelector('#casino-wheel');
            const ballContainer = html.querySelector('#casino-ball-container');

            // Quick bet buttons
            const quickRedBtn = html.querySelector('.btn-quick-red');
            const quickBlackBtn = html.querySelector('.btn-quick-black');
            const clearBetsBtn = html.querySelector('.btn-clear-bets');

            const validateBets = () => {
                if (this.isViewer) {
                    spinBtn.disabled = true;
                    spinBtn.classList.add('disabled');
                    spinBtn.textContent = "SPECTATING";
                    return false;
                }
                const red = Math.max(0, parseInt(redInput.value) || 0);
                const black = Math.max(0, parseInt(blackInput.value) || 0);
                const green = Math.max(0, parseInt(greenInput.value) || 0);
                const numVal = numSelect.value;
                const numAmt = numVal ? Math.max(0, parseInt(numAmtInput.value) || 0) : 0;

                const totalBet = red + black + green + numAmt;
                const remaining = this.stakes - totalBet;

                // Mirror bets live to spectators
                this.broadcastBets();

                if (remaining < 0) {
                    unallocatedLabel.textContent = "0";
                    unallocatedLabel.style.color = '#ff0055';
                    spinBtn.disabled = true;
                    spinBtn.textContent = "STAKES EXCEEDED";
                    return false;
                }

                unallocatedLabel.textContent = remaining;
                unallocatedLabel.style.color = remaining === 0 ? '#00ff66' : '#00ffff';

                if (remaining === 0 && totalBet > 0) {
                    spinBtn.disabled = false;
                    spinBtn.classList.remove('disabled');
                    spinBtn.textContent = "SPIN WHEEL";
                    this.currentBets = { red, black, green, numberVal: numVal, numberAmt: numAmt };
                    return true;
                } else {
                    spinBtn.disabled = true;
                    spinBtn.classList.add('disabled');
                    spinBtn.textContent = remaining > 0 ? `PLACE ${remaining} MORE` : "PLACE BETS";
                    return false;
                }
            };

            if (quickRedBtn) {
                quickRedBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    redInput.value = this.stakes;
                    blackInput.value = 0;
                    greenInput.value = 0;
                    numSelect.value = '';
                    numAmtInput.value = 0;
                    validateBets();
                });
            }

            if (quickBlackBtn) {
                quickBlackBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    redInput.value = 0;
                    blackInput.value = this.stakes;
                    greenInput.value = 0;
                    numSelect.value = '';
                    numAmtInput.value = 0;
                    validateBets();
                });
            }

            if (clearBetsBtn) {
                clearBetsBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    redInput.value = 0;
                    blackInput.value = 0;
                    greenInput.value = 0;
                    numSelect.value = '';
                    numAmtInput.value = 0;
                    validateBets();
                });
            }

            [redInput, blackInput, greenInput, numAmtInput].forEach(inp => {
                inp.addEventListener('input', validateBets);
            });
            numSelect.addEventListener('change', () => {
                if (!numSelect.value) {
                    numAmtInput.value = 0;
                }
                validateBets();
            });

            spinBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!validateBets()) return;

                this.isAnimating = true;

                // Disable all controls
                spinBtn.disabled = true;
                redInput.disabled = true;
                blackInput.disabled = true;
                greenInput.disabled = true;
                numSelect.disabled = true;
                numAmtInput.disabled = true;
                if (quickRedBtn) quickRedBtn.disabled = true;
                if (quickBlackBtn) quickBlackBtn.disabled = true;
                if (clearBetsBtn) clearBetsBtn.disabled = true;

                // Spin calculations using cryptographically secure random values
                const wheelNumbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
                const array = new Uint32Array(1);
                window.crypto.getRandomValues(array);
                const landedNumber = wheelNumbers[array[0] % wheelNumbers.length];

                const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
                const landedColor = landedNumber === 0 ? 'green' : (redNumbers.includes(landedNumber) ? 'red' : 'black');

                // Broadcast spin to spectators
                if (!this.isViewer && this.sessionId) {
                    emitToOthers('casino.spin', this.sessionId, landedNumber, landedColor);
                }

                const pocketIndex = wheelNumbers.indexOf(landedNumber);
                const pocketAngle = pocketIndex * (360 / 37);

                const wheelSpin = 1440;
                const finalWheelRotation = wheelSpin + pocketAngle;

                const ballSpin = -2160;
                const finalBallRotation = ballSpin + pocketAngle;

                wheel.style.transform = `rotate(${finalWheelRotation}deg)`;
                ballContainer.style.transform = `rotate(${finalBallRotation}deg)`;

                await new Promise(resolve => setTimeout(resolve, 4000));

                this.isAnimating = false;

                // Update UI timer area to show result
                const timerDisplayDiv = html.querySelector('.timer-display');
                if (timerDisplayDiv) {
                    const labelColor = landedColor === 'green' ? '#00ff66' : (landedColor === 'red' ? '#ff2a5f' : '#ffffff');
                    const labelShadow = landedColor === 'green' ? '0 0 10px #00ff66' : (landedColor === 'red' ? '0 0 10px #ff2a5f' : '0 0 10px #ffffff');
                    timerDisplayDiv.innerHTML = `RESULT: <span id="game-timer" style="color: ${labelColor}; text-shadow: ${labelShadow}; font-size: 1.3rem; font-weight: 900; animation: neon-flash 0.5s infinite alternate;">${landedColor.toUpperCase()} ${landedNumber}</span>`;
                }

                // Update spin button to show result
                spinBtn.textContent = `RESULT: ${landedColor.toUpperCase()} ${landedNumber}`;
                spinBtn.style.borderColor = landedColor === 'green' ? '#00ff66' : (landedColor === 'red' ? '#ff2a5f' : '#ffffff');
                spinBtn.style.color = landedColor === 'green' ? '#00ff66' : (landedColor === 'red' ? '#ff2a5f' : '#ffffff');
                spinBtn.style.textShadow = landedColor === 'green' ? '0 0 10px #00ff66' : (landedColor === 'red' ? '0 0 10px #ff2a5f' : '0 0 10px #ffffff');

                // Wait 2.5 seconds so player can see the outcome
                await new Promise(resolve => setTimeout(resolve, 2500));

                const outcome = {
                    game: 'roulette',
                    bets: this.currentBets,
                    resultColor: landedColor,
                    resultNumber: landedNumber,
                    timeout: this.hasTimedOutMidAction
                };

                this._finish(outcome);
            });
        }
    }

    static async show(options = {}) {
        return new Promise((resolve) => {
            const app = new CasinoApp(options);
            app.resolvePromise = resolve;
            app.render({force: true});
        });
    }

    startCountdown(html) {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        const timerLabel = html.querySelector('#game-timer');
        if (!timerLabel) return;

        timerLabel.textContent = `${this.timeLeft}s`;

        this.timerId = setInterval(() => {
            this.timeLeft--;
            if (this.timeLeft < 0) {
                clearInterval(this.timerId);
                this.timerId = null;

                // If mid-animation, defer the timeout checkout until animation ends
                if (this.isAnimating) {
                    this.hasTimedOutMidAction = true;
                    return;
                }

                // Trigger timeout
                if (this.gameType === 'coinflip') {
                    this._finish({
                        game: 'coinflip',
                        win: this.currentStakes > this.stakes,
                        stakes: this.currentStakes,
                        history: this.flipHistory,
                        timeout: true
                    });
                } else {
                    this._finish({
                        game: 'roulette',
                        timeout: true,
                        resultColor: 'none',
                        resultNumber: -1,
                        bets: { red: 0, black: 0, green: 0, numberAmt: 0, numberVal: '' }
                    });
                }
                return;
            }

            timerLabel.textContent = `${this.timeLeft}s`;
            if (this.timeLeft <= 10) {
                timerLabel.style.color = '#ff0055';
                timerLabel.style.textShadow = '0 0 8px #ff0055';
                timerLabel.classList.add('animate-pulse');
            }
        }, 1000);
    }

    broadcastBets() {
        if (this.isViewer || !this.sessionId) return;
        const html = this.element;
        if (!html) return;
        const redInput = html.querySelector('input[name="bet-red"]');
        const blackInput = html.querySelector('input[name="bet-black"]');
        const greenInput = html.querySelector('input[name="bet-green"]');
        const numSelect = html.querySelector('select[name="bet-number-val"]');
        const numAmtInput = html.querySelector('input[name="bet-number-amt"]');

        const bets = {
            red: parseInt(redInput?.value) || 0,
            black: parseInt(blackInput?.value) || 0,
            green: parseInt(greenInput?.value) || 0,
            numberVal: numSelect?.value || '',
            numberAmt: parseInt(numAmtInput?.value) || 0
        };

        emitToOthers('casino.bets', this.sessionId, bets);
    }

    receiveBetsUpdate(bets) {
        const html = this.element;
        if (!html) return;
        const redInput = html.querySelector('input[name="bet-red"]');
        const blackInput = html.querySelector('input[name="bet-black"]');
        const greenInput = html.querySelector('input[name="bet-green"]');
        const numSelect = html.querySelector('select[name="bet-number-val"]');
        const numAmtInput = html.querySelector('input[name="bet-number-amt"]');
        const unallocatedLabel = html.querySelector('#unallocated-damage');

        if (redInput) redInput.value = bets.red;
        if (blackInput) blackInput.value = bets.black;
        if (greenInput) greenInput.value = bets.green;
        if (numSelect) numSelect.value = bets.numberVal;
        if (numAmtInput) numAmtInput.value = bets.numberAmt;

        // Calculate remaining stakes
        const totalBet = bets.red + bets.black + bets.green + bets.numberAmt;
        const remaining = this.stakes - totalBet;
        if (unallocatedLabel) {
            unallocatedLabel.textContent = remaining;
            unallocatedLabel.style.color = remaining === 0 ? '#00ff66' : '#00ffff';
        }

        // Save to currentBets
        this.currentBets = bets;
    }

    async receiveSpin(landedNumber, landedColor) {
        const html = this.element;
        if (!html) return;
        const redInput = html.querySelector('input[name="bet-red"]');
        const blackInput = html.querySelector('input[name="bet-black"]');
        const greenInput = html.querySelector('input[name="bet-green"]');
        const numSelect = html.querySelector('select[name="bet-number-val"]');
        const numAmtInput = html.querySelector('input[name="bet-number-amt"]');
        const spinBtn = html.querySelector('#btn-play-roulette');
        const wheel = html.querySelector('#casino-wheel');
        const ballContainer = html.querySelector('#casino-ball-container');

        if (spinBtn) spinBtn.disabled = true;
        if (redInput) redInput.disabled = true;
        if (blackInput) blackInput.disabled = true;
        if (greenInput) greenInput.disabled = true;
        if (numSelect) numSelect.disabled = true;
        if (numAmtInput) numAmtInput.disabled = true;

        const quickRedBtn = html.querySelector('.btn-quick-red');
        const quickBlackBtn = html.querySelector('.btn-quick-black');
        const clearBetsBtn = html.querySelector('.btn-clear-bets');
        if (quickRedBtn) quickRedBtn.disabled = true;
        if (quickBlackBtn) quickBlackBtn.disabled = true;
        if (clearBetsBtn) clearBetsBtn.disabled = true;

        const wheelNumbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
        const pocketIndex = wheelNumbers.indexOf(landedNumber);
        const pocketAngle = pocketIndex * (360 / 37);

        const wheelSpin = 1440;
        const finalWheelRotation = wheelSpin + pocketAngle;

        const ballSpin = -2160;
        const finalBallRotation = ballSpin + pocketAngle;

        if (wheel) wheel.style.transform = `rotate(${finalWheelRotation}deg)`;
        if (ballContainer) ballContainer.style.transform = `rotate(${finalBallRotation}deg)`;

        await new Promise(resolve => setTimeout(resolve, 4000));

        // Update UI timer area to show result
        const timerDisplayDiv = html.querySelector('.timer-display');
        if (timerDisplayDiv) {
            const labelColor = landedColor === 'green' ? '#00ff66' : (landedColor === 'red' ? '#ff2a5f' : '#ffffff');
            const labelShadow = landedColor === 'green' ? '0 0 10px #00ff66' : (landedColor === 'red' ? '0 0 10px #ff2a5f' : '0 0 10px #ffffff');
            timerDisplayDiv.innerHTML = `RESULT: <span id="game-timer" style="color: ${labelColor}; text-shadow: ${labelShadow}; font-size: 1.3rem; font-weight: 900; animation: neon-flash 0.5s infinite alternate;">${landedColor.toUpperCase()} ${landedNumber}</span>`;
        }

        if (spinBtn) {
            spinBtn.textContent = `RESULT: ${landedColor.toUpperCase()} ${landedNumber}`;
            spinBtn.style.borderColor = landedColor === 'green' ? '#00ff66' : (landedColor === 'red' ? '#ff2a5f' : '#ffffff');
            spinBtn.style.color = landedColor === 'green' ? '#00ff66' : (landedColor === 'red' ? '#ff2a5f' : '#ffffff');
            spinBtn.style.textShadow = landedColor === 'green' ? '0 0 10px #00ff66' : (landedColor === 'red' ? '0 0 10px #ff2a5f' : '0 0 10px #ffffff');
        }
    }

    async receiveFlip(result, choice) {
        const html = this.element;
        if (!html) return;

        this.isAnimating = true;

        const headsBtn = html.querySelector('.btn-heads');
        const tailsBtn = html.querySelector('.btn-tails');
        const flipBtn = html.querySelector('#btn-play-coinflip');
        const coin = html.querySelector('#casino-coin');
        const postWinDiv = html.querySelector('#coin-post-win');
        const stakesLabel = html.querySelector('#coinflip-stakes-label');

        if (flipBtn) flipBtn.disabled = true;
        if (headsBtn) headsBtn.disabled = true;
        if (tailsBtn) tailsBtn.disabled = true;

        if (choice === 'heads') {
            if (headsBtn) headsBtn.classList.add('selected');
            if (tailsBtn) tailsBtn.classList.remove('selected');
        } else {
            if (tailsBtn) tailsBtn.classList.add('selected');
            if (headsBtn) headsBtn.classList.remove('selected');
        }

        // Calculate spin rotation smoothly from previous position
        this.coinRotation = this.coinRotation + 1440; // 4 full spins
        if (result === 'heads') {
            this.coinRotation = Math.ceil(this.coinRotation / 360) * 360;
        } else {
            this.coinRotation = Math.ceil((this.coinRotation - 180) / 360) * 360 + 180;
        }

        if (coin) {
            coin.style.transition = 'transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)';
            coin.style.transform = `rotateY(${this.coinRotation}deg)`;
        }

        // Wait for 4s animation to finish
        await new Promise(resolve => setTimeout(resolve, 4000));

        this.isAnimating = false;

        const win = choice === result;
        if (win) {
            this.currentStakes *= 2;
            if (stakesLabel) stakesLabel.textContent = `${this.currentStakes} DMG`;

            // Update UI result area to show result
            const resultDiv = html.querySelector('#coinflip-result');
            if (resultDiv) {
                resultDiv.innerHTML = `RESULT: <span style="color: ${result === 'heads' ? '#ffcc00' : '#ff5500'}; text-shadow: 0 0 10px ${result === 'heads' ? '#ffcc00' : '#ff5500'}; font-size: 1.2rem; font-weight: 900; animation: neon-flash 0.5s infinite alternate;">${result.toUpperCase()} (WON!)</span>`;
            }

            // Show Cash Out / Continue buttons
            if (flipBtn) flipBtn.style.display = 'none';
            if (postWinDiv) postWinDiv.style.display = 'flex';
        } else {
            this.currentStakes = 0;
            if (stakesLabel) {
                stakesLabel.textContent = `0 DMG`;
                stakesLabel.style.color = '#ff0055';
            }

            const resultDiv = html.querySelector('#coinflip-result');
            if (resultDiv) {
                resultDiv.innerHTML = `RESULT: <span style="color: #ff0055; text-shadow: 0 0 10px #ff0055; font-size: 1.2rem; font-weight: 900; animation: neon-flash 0.5s infinite alternate;">${result.toUpperCase()} (LOST)</span>`;
            }
        }
    }

    receiveContinue() {
        const html = this.element;
        if (!html) return;
        const headsBtn = html.querySelector('.btn-heads');
        const tailsBtn = html.querySelector('.btn-tails');
        const flipBtn = html.querySelector('#btn-play-coinflip');
        const postWinDiv = html.querySelector('#coin-post-win');

        if (postWinDiv) postWinDiv.style.display = 'none';

        if (flipBtn) {
            flipBtn.disabled = true;
            flipBtn.style.display = 'none';
        }
        if (headsBtn) headsBtn.disabled = true;
        if (tailsBtn) tailsBtn.disabled = true;

        // Clear result display
        const resultDiv = html.querySelector('#coinflip-result');
        if (resultDiv) {
            resultDiv.innerHTML = '';
        }

        // Restart timer display (read-only countdown) if not running
        if (!this.timerId) {
            const timerDisplayDiv = html.querySelector('.timer-display');
            if (timerDisplayDiv) {
                timerDisplayDiv.innerHTML = `TIME REMAINING: <span id="game-timer" style="color: #ffcc00; text-shadow: 0 0 5px #ffcc00; font-size: 1.1rem; font-weight: 900;">${this.timeLeft}s</span>`;
            }
            this.startCountdown(html);
        }
    }

    _finish(result) {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
        this.close();
    }

    async close(options) {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        if (this.resolvePromise) {
            this.resolvePromise(null);
            this.resolvePromise = null;
        }
        return super.close(options);
    }
}

/* -------------------------------------------- */
/*  Spectator session socket handlers            */
/* -------------------------------------------- */

const activeSessions = new Map();

export function registerCasinoSockets() {
    registerSocketHandler('casino.showViewer', (gameType, stakes, activeUserId, actorUuid, sessionId) => {
        if (game.user.id === activeUserId) return;
        activeSessions.get(sessionId)?.close();
        const app = new CasinoApp({
            gameType: gameType,
            stakes: stakes,
            activeUserId: activeUserId,
            actor: actorUuid ? fromUuidSync(actorUuid) : null,
            sessionId: sessionId,
            isViewer: true
        });
        activeSessions.set(sessionId, app);
        app.render({force: true});
    });

    registerSocketHandler('casino.closeViewer', sessionId => {
        activeSessions.get(sessionId)?.close();
        activeSessions.delete(sessionId);
    });

    registerSocketHandler('casino.bets', (sessionId, bets) => {
        activeSessions.get(sessionId)?.receiveBetsUpdate(bets);
    });

    registerSocketHandler('casino.spin', (sessionId, landedNumber, landedColor) => {
        activeSessions.get(sessionId)?.receiveSpin(landedNumber, landedColor);
    });

    registerSocketHandler('casino.flip', (sessionId, result, choice) => {
        activeSessions.get(sessionId)?.receiveFlip(result, choice);
    });

    registerSocketHandler('casino.continue', sessionId => {
        activeSessions.get(sessionId)?.receiveContinue();
    });
}
