/** Portent: two persistent dice. Foundry v14. Paste into a Script macro. */
(async () => {
    const FLAG = 'fantikPortentDice';
    const PHRASES = [
        'Я вже бачив цю мить',
        "Я пам'ятаю що має статись",
        'Цей випадок я пам’ятаю наперед',
        'Доля вже зробила свій вибір',
        'Я впізнаю цю мить. Вона приходила уві сні',
        'Я впізнаю цю мить. Я побачив її в зорях',
        'Я впізнаю цю мить. Чаїнки розповіли мені',
        'Мені здається воно якось так має статись',
        'Щось типу такого',
        'Твоя наступна фраза:',
        'Як я і передбачив. З самого початку'
    ];
    const pickPhrase = previous => {
        const choices = PHRASES.filter(phrase => phrase !== previous);
        return choices.length ? choices[Math.floor(Math.random() * choices.length)] : (PHRASES[0] ?? '');
    };
    const actor = game.user.character;
    if (!actor) return ui.notifications.warn('До твого користувача не прив’язано персонажа. Обери його в налаштуваннях користувача.');
    if (!actor.isOwner) return ui.notifications.warn('Немає прав на зміну прив’язаного персонажа.');

    const windows = globalThis.__fantikPortentWindows ??= new Map();
    const existing = windows.get(actor.uuid);
    if (existing) {
        existing.bringToFront();
        return;
    }

    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
    const read = () => {
        const data = actor.getFlag('world', FLAG);
        return data ? foundry.utils.deepClone(data) : {slots: [null, null]};
    };
    const save = state => actor.setFlag('world', FLAG, state);

    async function animateDice(roll) {
        if (!game.dice3d?.showForRoll) {
            ui.notifications.warn('Передбачення збережено. Для 3D-анімації увімкни Dice So Nice.');
            return;
        }
        // Per-roll appearance: do not change the user's saved Dice So Nice settings.
        for (const die of roll.dice) {
            die.options.colorset = 'custom';
            die.options.appearance = {
                colorset: 'custom', system: 'standard',
                foreground: '#f5d48c', background: '#48266b',
                outline: '#160d24', edge: '#ba9451',
                material: 'metal', texture: 'marble', font: 'Arial'
            };
        }
        try {
            // Animate the evaluated roll, including both dice when both slots were empty.
            // Synchronize the appearance/results with other connected users.
            await game.dice3d.showForRoll(roll, game.user, true);
        } catch (error) {
            console.error('Portent | Dice So Nice animation failed', error);
            ui.notifications.warn('Передбачення збережено, але 3D-анімація не вдалася.');
        }
    }

    function diceHTML(state, phrase) {
        return `<section style="padding:18px 12px 12px;border-radius:12px;background:radial-gradient(ellipse at top,#352552,#151220);color:#f2e6ce;text-align:center">
            <div style="font-size:11px;letter-spacing:3px;color:#c2a76c">✦ ПЕРЕДБАЧЕННЯ ✦</div>
            <div style="display:flex;justify-content:center;gap:20px;margin:22px 0 16px">
                ${state.slots.map((value, index) => `<button type="button" data-action="die" data-slot="${index}"
                    aria-label="${value === null ? 'Заповнити комірку' : `Оголосити ${value} в чат і звільнити комірку`}"
                    title="${value === null ? 'Клік — кинути d20' : 'Клік — оголосити в чат і використати'}"
                    style="position:relative;width:112px;height:122px;padding:0;border:0;background:transparent;color:${value === null ? '#9485ad' : '#f3d594'};box-shadow:none;cursor:pointer">
                    <svg viewBox="0 0 100 110" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">
                        <path d="M50 3 L94 28 L94 79 L50 106 L6 79 L6 28 Z" fill="${value === null ? '#211b2f' : '#382747'}" stroke="currentColor" stroke-width="1.8" ${value === null ? 'stroke-dasharray="4 4"' : ''}/>
                        <path d="M50 3 L26 38 L6 28 M26 38 L6 79 M26 38 L74 38 L94 28 M74 38 L50 3 M74 38 L94 79 M26 38 L50 82 L74 38 M50 82 L6 79 M50 82 L94 79 M50 82 L50 106" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1"/>
                    </svg>
                    <span style="position:relative;display:block;font:600 38px Georgia,serif;line-height:122px;text-shadow:0 2px 8px #100b19;pointer-events:none">${value ?? '+'}</span>
                </button>`).join('')}
            </div>
            <div style="font-size:12px;line-height:1.6;color:#b8acc9">Порожній кубик — заповнити<br>Заповнений — оголосити й використати</div>
            <label style="display:block;margin-top:18px;text-align:left;font-size:12px;color:#c2a76c">
                Твоя фраза
                <textarea name="portentPhrase" rows="3" placeholder="Напиши своє передбачення…"
                    style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #655139;border-radius:8px;background:#191422;color:#f2e6ce;font:14px Georgia,serif;line-height:1.5;resize:vertical">${esc(phrase)}</textarea>
            </label>
        </section>`;
    }

    async function announceRefill(values) {
        try {
            const message = await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}),
                content: `<div style="padding:20px 12px;border:1px solid #9c8051;border-radius:12px;background:linear-gradient(145deg,#30213e,#14131f);color:#f4e4c1;text-align:center">
                    <div style="font-size:10px;letter-spacing:3px;color:#c4a96d">✦ PORTENT ✦</div>
                    <div style="margin-top:9px;font:20px Georgia,serif;color:#f4e4c1">Майбутнє проясняється</div>
                    <div style="display:flex;justify-content:center;gap:18px;margin:14px 0">
                        ${values.map(value => `<span style="display:inline-block;min-width:74px;padding:8px 12px;border:1px solid #806440;border-radius:10px;background:#241b32;font:700 48px Georgia,serif;line-height:1.2;color:#f5d48c;text-shadow:0 0 20px #956fc0">${value}</span>`).join('')}
                    </div>
                    <div style="margin-top:14px;padding-top:10px;border-top:1px solid #655139;font-size:12px;color:#bcacc9">${esc(actor.name)}</div>
                </div>`,
                whisper: [], blind: false,
                // No attached Roll: animateDice handles the single synchronized 3D throw.
                flags: {world: {[FLAG]: {refill: true, actor: actor.uuid, values}}}
            });
            if (!message) throw new Error('Повідомлення не створено.');
        } catch (error) {
            console.error('Portent | Refill announcement failed', error);
            ui.notifications.warn('Передбачення збережено, але картку в чаті не вдалося створити.');
        }
    }

    function chatHTML(value, phrase) {
        return `<div style="padding:20px 12px;border:1px solid #9c8051;border-radius:12px;background:linear-gradient(145deg,#30213e,#14131f);color:#f4e4c1;text-align:center">
            <div style="font-size:10px;letter-spacing:3px;color:#c4a96d">✦ PORTENT ✦</div>
            <div style="margin-top:9px;font:20px Georgia,serif;color:#f4e4c1">Мить передбачення</div>
            <div style="font:700 68px Georgia,serif;line-height:1.3;color:#f5d48c;text-shadow:0 0 20px #956fc0">${value}</div>
            ${phrase.trim() ? `<div style="font-size:12px;color:#d3bddf;white-space:pre-wrap;overflow-wrap:anywhere">«${esc(phrase)}»</div>` : ''}
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid #655139;font-size:12px;color:#bcacc9">${esc(actor.name)}</div>
        </div>`;
    }

    class PortentPanel extends foundry.applications.api.DialogV2 {
        busy = false;
        phrase = pickPhrase();

        async _renderHTML(context, options) {
            const html = await super._renderHTML(context, options);
            html.querySelector('.dialog-content').innerHTML = diceHTML(read(), this.phrase);
            html.querySelector('[name="portentPhrase"]').addEventListener('input', event => {
                this.phrase = event.currentTarget.value;
            });
            html.querySelector('[data-action="fill"]').disabled = read().slots.every(value => value !== null);
            html.querySelector('.form-footer').style.flexDirection = 'column';
            return html;
        }

        async run(index = null, {rerollAll = false} = {}) {
            if (this.busy) return;
            this.busy = true;
            this.phrase = this.element.querySelector('[name="portentPhrase"]').value;
            // Only lock the form: the window header survives content re-renders.
            this.element.querySelectorAll('.dialog-form button, .dialog-form textarea')
                .forEach(input => { input.disabled = true; });
            try {
                const state = read();
                if (state.pending) {
                    const sent = game.messages.find(message => message.getFlag('world', FLAG)?.id === state.pending.id);
                    if (sent) {
                        state.slots[state.pending.index] = null;
                        this.phrase = pickPhrase(this.phrase);
                    }
                    // Recover a publication interrupted between the two document writes.
                    state.pending = null;
                    await save(state);
                    ui.notifications.info('Стан передбачень відновлено.');
                    return;
                }
                if (rerollAll || index === null || state.slots[index] === null) {
                    const slotsToRoll = rerollAll ? [0, 1]
                        : index === null ? [0, 1].filter(i => state.slots[i] === null) : [index];
                    if (!slotsToRoll.length) return;
                    const roll = await new Roll(`${slotsToRoll.length}d20`).evaluate();
                    slotsToRoll.forEach((slot, i) => { state.slots[slot] = roll.dice[0].results[i].result; });
                    await save(state);
                    await animateDice(roll);
                    await announceRefill(slotsToRoll.map(slot => state.slots[slot]));
                } else {
                    const value = state.slots[index];
                    const id = foundry.utils.randomID();
                    state.pending = {id, index};
                    await save(state);
                    try {
                        // Announce the stored number publicly, without rolling again.
                        const sent = await ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({actor}),
                            content: chatHTML(value, this.phrase),
                            whisper: [], blind: false,
                            flags: {world: {[FLAG]: {id, actor: actor.uuid, value}}}
                        });
                        if (!sent) throw new Error('Повідомлення не створено.');
                        this.phrase = pickPhrase(this.phrase);
                    } catch (error) {
                        state.pending = null;
                        await save(state);
                        throw error;
                    }
                    state.slots[index] = null;
                    state.pending = null;
                    await save(state);
                }
            } catch (error) {
                console.error('Portent', error);
                ui.notifications.error(error.message || 'Не вдалося зберегти передбачення.');
            } finally {
                this.busy = false;
                if (this.rendered) await this.render({force: true});
            }
        }

        async close(options) {
            if (this.busy) return this;
            await super.close(options);
            windows.delete(actor.uuid);
            return this;
        }
    }

    try {
        const panel = new PortentPanel({
            window: {title: `Portent — ${actor.name}`, resizable: false},
            position: {width: 340},
            form: {closeOnSubmit: false},
            content: '<div></div>',
            actions: {die(_event, button) { return this.run(Number(button.dataset.slot)); }},
            buttons: [
                {action: 'fill', label: 'Заповнити пусті', icon: 'fa-solid fa-dice-d20',
                    callback: (_event, _button, panel) => panel.run()},
                {action: 'reroll', label: 'Переролити всі', icon: 'fa-solid fa-rotate',
                    callback: (_event, _button, panel) => panel.run(null, {rerollAll: true})}
            ]
        });
        windows.set(actor.uuid, panel);
        await panel.render({force: true});
    } catch (error) {
        windows.delete(actor.uuid);
        console.error('Portent', error);
        ui.notifications.error(error.message);
    }
})();
