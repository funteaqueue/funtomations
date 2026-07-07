import {MODULE_ID} from './constants.js';

/**
 * Interactive target selection for attacks and save-based activities.
 *
 * During an active encounter, when an attack roll begins with no target
 * selected, the roll is paused (not cancelled): the canvas cursor turns into a
 * crosshair and one left-click on a token targets it, after which the same
 * attack roll is re-issued automatically.
 *
 * Save activities (Hold Person, Bane) prompt AFTER the use completes (dialog,
 * consumption, chat card) — only then is the chosen slot level known, so
 * upcast target counts resolve correctly. The user picks SEVERAL targets:
 * clicking toggles a token's target state, a floating counter shows how many
 * more can be picked, and reaching the limit finishes the pick, after which
 * the picked targets are written onto the already-posted usage card. The limit
 * comes from the activity's target metadata ("up to three creatures" → 3); an
 * empty or unreadable count defaults to one target, plus upcast targets parsed
 * from the spell text ("one additional Humanoid for each spell slot level
 * above 2"). Activities that place a measured template (Fireball) are left
 * alone — the template is their targeting. Nothing is ever cancelled in this
 * flow: the cast happens vanilla and the pick merely follows it.
 *
 * In both flows the floating button, a quick right-click (a right-drag still
 * pans the map), or Escape finishes early and the action proceeds with
 * whatever is targeted, possibly nothing — the vanilla action is only ever
 * deferred, never blocked. Any internal failure fails open (the original
 * action proceeds as if this module were absent).
 *
 * Every dnd5e attack roll resolves against ONE target per roll, so the attack
 * prompt deliberately ignores the item's target metadata: imported spells
 * carry measured templates from ranges like "Self (5-foot radius)" (Booming
 * Blade) and scaling-formula target counts (Eldritch Blast's beams), and each
 * ray of a multi-attack spell is its own one-target roll anyway. Filtering on
 * that metadata silently disabled the prompt for exactly the spells that need
 * it.
 */

/** The one picker that may be active at a time; a new pick supersedes it. */
let activePicker = null;

/** Activity uuids whose next preRollAttackV2 must pass through (resumed rolls). */
const resumedActivities = new Set();

export function registerTargetPromptSetting() {
    game.settings.register(MODULE_ID, 'promptTargetSelection', {
        name: 'Prompt for target selection',
        hint: 'During an active encounter, when an attack roll is made with nothing targeted, the roll pauses and lets you click a target on the canvas. The on-screen button, a quick right-click, or Escape rolls without a target. Outside combat everything rolls normally.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register(MODULE_ID, 'clearTargetsOnTurnStart', {
        name: 'Clear targets when your turn starts',
        hint: 'When your combat turn begins (an NPC turn, for the GM), tokens you still had targeted from earlier turns are untargeted automatically.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });
}

/**
 * Register the combat hook that clears this user's stale targets when a turn
 * they drive begins. Targets are per-user client state, so every client listens
 * and clears only its own. Called once at ready.
 */
export function initTurnTargetClearing() {
    Hooks.on('combatTurnChange', onCombatTurnChange);
}

function onCombatTurnChange(combat, prior, current) {
    try {
        if (!game.settings.get(MODULE_ID, 'clearTargetsOnTurnStart')) return;
        if (!combat.isActive || !combat.started) return;
        const combatant = combat.combatants.get(current?.combatantId);
        if (!combatant) return;
        // "My turn": for a player, a combatant they own; for the GM, the turns
        // no player drives (clearing the GM's targets on every player turn
        // would fight the players' own targeting).
        const players = combatant.players ?? [];
        const isMyTurn = game.user.isGM ? players.length === 0 : players.includes(game.user);
        if (!isMyTurn) return;
        if (!game.user.targets.size) return;
        game.user.updateTokenTargets([]);
        game.user.broadcastActivity({targets: []});
    } catch (error) {
        console.error(`${MODULE_ID} | Failed to clear targets on turn start`, error);
    }
}

/** Shared gating for both interceptors: prompt only when a pick is possible and wanted. */
function shouldPromptForTargets() {
    if (!game.settings.get(MODULE_ID, 'promptTargetSelection')) return false;
    // Only during an active encounter — out-of-combat actions (testing dummies,
    // downtime, macro rolls) proceed untargeted without the prompt.
    if (!game.combat?.started) return false;
    if (game.user.targets.size > 0) return false;
    // No canvas to pick from — degrade to the vanilla untargeted action.
    if (!canvas?.ready || !canvas.tokens?.placeables?.length) return false;
    return true;
}

/**
 * Called from the dnd5e.preRollAttackV2 wrapper. Returns false when the roll
 * should pause for target selection — in that case this module ALWAYS re-issues
 * the roll afterwards (with or without a target). Returns undefined to let the
 * roll proceed normally.
 * @param {object} config  The attack roll process configuration (config.subject
 *                         is the attack activity).
 * @returns {false|undefined}
 */
export function interceptAttackTargeting(config) {
    try {
        const activity = config?.subject;
        const item = activity?.item;
        if (!item) return;
        // A roll this module re-issued after a pick/skip — let it through.
        if (resumedActivities.delete(activity.uuid)) return;
        if (!shouldPromptForTargets()) return;
        resumeAttackAfterPick(activity, config.event);
        return false;
    } catch (error) {
        console.error(`${MODULE_ID} | Target prompt failed — attack proceeds untargeted`, error);
        return undefined;
    }
}

/** Run the picker, then unconditionally re-issue the paused attack roll. */
async function resumeAttackAfterPick(activity, event) {
    let reason = 'skipped';
    try {
        ({reason} = await pickTargetToken({
            hint: `${activity.item.name}: click a token to target it, or use the button below to roll without one (right-click/Escape also work).`
        }));
    } catch (error) {
        console.error(`${MODULE_ID} | Target picker failed`, error);
    }
    // Another action started its own pick and owns the flow now.
    if (reason === 'superseded') return;
    resumedActivities.add(activity.uuid);
    try {
        await activity.rollAttack({event});
    } catch (error) {
        console.error(`${MODULE_ID} | Failed to resume attack roll after target selection`, error);
    } finally {
        resumedActivities.delete(activity.uuid);
    }
}

/**
 * Called from the dnd5e.postUseActivity handler, BEFORE automation events are
 * dispatched, so automations see the picked targets. When a save activity was
 * used with nothing targeted, let the user pick up to the activity's target
 * count on the canvas, then write the picks onto the posted usage card. The
 * use has already fully happened — this never cancels or re-issues anything.
 * @param {object} activity     The (possibly scaling-cloned) activity that was used.
 * @param {object} usageConfig  Final usage configuration; scaling is chosen by now.
 * @param {object} results      Usage results; results.message is the posted card.
 */
export async function promptSaveTargets(activity, usageConfig, results) {
    // Disabled for now — only attack rolls prompt for targets. The save-activity
    // pick stays in place so it can be re-enabled by removing this return.
    return;
    // eslint-disable-next-line no-unreachable
    try {
        if (activity?.type !== 'save' || !activity.item) return;
        if (!shouldPromptForTargets()) return;
        const target = effectiveTarget(activity);
        // A measured template IS the targeting — placing it and hand-picking
        // tokens would be double work.
        if (target?.template?.type) return;
        // Self-targeted saves have nothing to pick.
        if (target?.affects?.type === 'self') return;
        const scaling = Math.max(0, Number(usageConfig?.scaling) || 0);
        const max = resolveTargetCount(activity, target?.affects, scaling);
        const limit = max > 1 ? ` (up to ${max})` : '';
        const {tokens, reason} = await pickTargetTokens({
            max,
            verb: 'Continue',
            hint: `${activity.item.name}: click tokens to target them${limit}; clicking again untargets. The button, a quick right-click, or Escape finishes with the current targets.`
        });
        if (reason === 'superseded' || !tokens.length) return;
        await writeTargetsToMessage(results?.message, tokens);
    } catch (error) {
        console.error(`${MODULE_ID} | Target prompt failed — activity stays untargeted`, error);
    }
}

/**
 * Write picked targets onto a posted usage card so it reads as if they had
 * been targeted at cast time (the card's target list and save-application UI
 * work off this flag).
 * @param {ChatMessage|null} message
 * @param {Token[]} tokens
 */
async function writeTargetsToMessage(message, tokens) {
    if (!message?.setFlag) return;
    // Same shape dnd5e's getTargetDescriptors produces at message creation.
    const descriptors = game.dnd5e?.utils?.getTargetDescriptors?.()
        ?? tokens.filter(token => token.actor).map(token => ({
            uuid: token.actor.uuid,
            name: token.name,
            img: token.actor.img,
            ac: token.actor.system?.attributes?.ac?.value ?? null
        }));
    if (!descriptors.length) return;
    await message.setFlag('dnd5e', 'targets', descriptors);
}

/** The activity's effective target data: its own when overridden, else the item's. */
function effectiveTarget(activity) {
    if (activity.target?.override) return activity.target;
    return activity.item.system?.target ?? activity.target;
}

/**
 * How many targets the activity may affect at the level it was just used at.
 * Numeric counts are used directly; formula counts (which may use
 * dice-formula functions like max()) are evaluated against the activity's
 * roll data with the chosen scaling available as @scaling. An empty or
 * unreadable count defaults to ONE target — the common case for
 * individually-targeted save spells ("Choose a Humanoid…") whose imports
 * leave the count blank. Imports also tend to omit upcast target scaling from
 * the count, so it is recovered from the spell text ("you can target one
 * additional Humanoid for each spell slot level above 2").
 * @param {object} activity
 * @param {object|undefined} affects
 * @param {number} scaling  Slot levels above the spell's base level.
 * @returns {number}  A positive integer.
 */
function resolveTargetCount(activity, affects, scaling) {
    let base = 1;
    const raw = affects?.count;
    if (raw) {
        const direct = Number(raw);
        if (Number.isFinite(direct) && direct > 0) {
            base = Math.floor(direct);
        } else {
            try {
                const rollData = activity.getRollData?.() ?? {};
                rollData.scaling ??= scaling;
                const value = new Roll(String(raw), rollData).evaluateSync({strict: false}).total;
                if (Number.isFinite(value) && value > 0) {
                    // A formula that consumes @scaling already accounts for
                    // upcasting — don't add the description bonus on top.
                    if (String(raw).includes('@scaling')) return Math.floor(value);
                    base = Math.floor(value);
                }
            } catch (error) {
                console.warn(`${MODULE_ID} | Unreadable target count "${raw}" — assuming one target`, error);
            }
        }
    }
    if (scaling > 0) {
        const description = activity.item.system?.description?.value ?? '';
        const match = description.match(/\b(one|two|three|\d+)\s+additional\b/i);
        if (match) {
            const word = match[1].toLowerCase();
            const per = {one: 1, two: 2, three: 3}[word] ?? Number(word);
            return base + per * scaling;
        }
    }
    return base;
}

/** The board <canvas> element across PIXI versions (app.view is PIXI 7, app.canvas PIXI 8). */
function boardElement() {
    return canvas.app?.view ?? canvas.app?.canvas ?? document.getElementById('board');
}

/**
 * Single-target pick used for attack rolls: the first token clicked is
 * targeted (releasing other targets) and the pick finishes.
 * @param {object} [options]
 * @param {string} [options.hint]  Notification shown while picking.
 * @returns {Promise<{token: Token|null, reason: 'picked'|'skipped'|'superseded'}>}
 */
export async function pickTargetToken({hint} = {}) {
    const {tokens, reason} = await pickTargetTokens({hint, max: 1, verb: 'Attack'});
    return {token: tokens[0] ?? null, reason};
}

/**
 * Let the user pick tokens by clicking them on the canvas. The cursor becomes
 * a crosshair; a left-click targets a token (with max 1 releasing other
 * targets and finishing at once; otherwise toggling, so a second click
 * untargets). Reaching max finishes the pick. The floating button, a quick
 * right-click, or Escape finishes early with whatever is targeted — a
 * right-drag pans the map as usual. Clicks on empty ground keep the picker
 * armed; clicks on UI elements pass through untouched. Starting a new pick
 * supersedes an active one.
 * @param {object} [options]
 * @param {string} [options.hint]  Notification shown while picking.
 * @param {number} [options.max]   Auto-finish after this many targets (Infinity: button only).
 * @param {string} [options.verb]  Action word for the button label ("Attack", "Cast").
 * @returns {Promise<{tokens: Token[], reason: 'picked'|'skipped'|'superseded'}>}
 */
export function pickTargetTokens({hint, max = Infinity, verb = 'Attack'} = {}) {
    activePicker?.finish('superseded');
    return new Promise(resolve => {
        const restoreCursor = activateCrosshairCursor();
        let notification = null;
        if (hint) notification = ui.notifications.info(hint);
        const multi = max !== 1;
        const hud = createPickerHud({
            showCounter: multi,
            onDone: () => picker.finish('done')
        });
        updateHud();

        const picker = {
            finish(reason) {
                if (activePicker !== picker) return;
                activePicker = null;
                window.removeEventListener('pointerdown', onPointerDown, true);
                window.removeEventListener('pointerup', onPointerUp, true);
                window.removeEventListener('keydown', onKeyDown, true);
                window.removeEventListener('contextmenu', onContextMenu, true);
                restoreCursor();
                hud?.element.remove();
                try {
                    notification?.remove?.();
                } catch {
                    // Old notification API without remove() — it expires on its own.
                }
                const tokens = reason === 'superseded' ? [] : [...game.user.targets];
                resolve({tokens, reason: reason === 'done' ? (tokens.length ? 'picked' : 'skipped') : reason});
            }
        };

        function updateHud() {
            if (!hud) return;
            const picked = game.user.targets.size;
            hud.setButtonLabel(picked
                ? `${verb} with ${picked} target${picked === 1 ? '' : 's'}`
                : `${verb} without a target`);
            if (multi) {
                hud.setCounter(Number.isFinite(max)
                    ? `${picked} / ${max} targets — ${max - picked} more can be picked`
                    : `${picked} target${picked === 1 ? '' : 's'} selected`);
            }
        }

        /** Where the current right-button press started, or null. */
        let rightDownAt = null;

        function onPointerDown(event) {
            // Only intercept clicks on the game canvas; UI stays interactive.
            if (event.target !== boardElement()) return;
            if (event.button === 2) {
                // Don't finish yet — a right-drag must still pan the map, so the
                // press/drag distinction is made on pointerup. Only a press on
                // a token is swallowed here (it would open the token HUD);
                // empty ground propagates so PIXI's drag-pan engages.
                rightDownAt = {x: event.clientX, y: event.clientY};
                if (tokenAtClient(event)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
                return;
            }
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const token = tokenAtClient(event);
            if (!token) return; // empty ground — keep waiting for a token
            if (multi && token.isTargeted) {
                token.setTarget(false, {releaseOthers: false});
                updateHud();
                return;
            }
            token.setTarget(true, {releaseOthers: !multi});
            updateHud();
            if (game.user.targets.size >= max) picker.finish('picked');
        }

        function onPointerUp(event) {
            if (event.button !== 2 || !rightDownAt) return;
            const moved = Math.hypot(event.clientX - rightDownAt.x, event.clientY - rightDownAt.y);
            rightDownAt = null;
            if (moved > 8) return; // it was a pan drag — keep picking
            event.preventDefault();
            event.stopImmediatePropagation();
            picker.finish('done');
        }

        function onKeyDown(event) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            picker.finish('done');
        }

        function onContextMenu(event) {
            if (event.target !== boardElement()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        activePicker = picker;
        // Capture phase so the picker sees clicks before Foundry/PIXI select or
        // pan — during a pick a token click must target, not select.
        window.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('contextmenu', onContextMenu, true);
    });
}

/**
 * Floating HUD shown over the canvas while a pick is active: an optional
 * "N / M targets" counter and a button that finishes the pick with the current
 * targets — a clickable alternative to right-click/Escape. Returns null on
 * failure; the picker works fine without it.
 * @param {object} options
 * @param {boolean} options.showCounter
 * @param {() => void} options.onDone
 * @returns {{element: HTMLElement, setButtonLabel: (text: string) => void,
 *            setCounter: (text: string) => void}|null}
 */
function createPickerHud({showCounter, onDone}) {
    try {
        const element = document.createElement('div');
        element.className = 'fantik-target-hud';
        const counter = document.createElement('div');
        counter.className = 'fantik-target-count';
        counter.hidden = !showCounter;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fantik-target-skip';
        const label = document.createElement('span');
        button.append(createIcon(), label);
        button.addEventListener('click', event => {
            event.preventDefault();
            onDone();
        });
        element.append(counter, button);
        document.body.append(element);
        return {
            element,
            setButtonLabel(text) {
                label.textContent = text;
            },
            setCounter(text) {
                counter.textContent = text;
            }
        };
    } catch (error) {
        console.error(`${MODULE_ID} | Failed to render the target picker HUD`, error);
        return null;
    }
}

function createIcon() {
    const icon = document.createElement('i');
    icon.className = 'fas fa-dice-d20';
    return icon;
}

/**
 * Switch the canvas cursor to a crosshair for the duration of a pick. Overrides
 * PIXI's per-object cursor styles (tokens set "pointer" on hover) so the
 * crosshair persists while hovering tokens. Returns a restore function.
 * @returns {() => void}
 */
function activateCrosshairCursor() {
    const events = canvas.app?.renderer?.events;
    const overridden = [];
    if (events?.cursorStyles) {
        for (const mode of ['default', 'pointer', 'grab']) {
            overridden.push([mode, events.cursorStyles[mode]]);
            events.cursorStyles[mode] = 'crosshair';
        }
        // PIXI applies unknown modes as raw CSS cursor values.
        events.setCursor?.('crosshair');
    }
    const view = boardElement();
    const previousInline = view?.style?.cursor ?? '';
    if (view?.style) view.style.cursor = 'crosshair';
    return () => {
        if (events?.cursorStyles) {
            for (const [mode, style] of overridden) events.cursorStyles[mode] = style;
            events.setCursor?.('default');
        }
        if (view?.style) view.style.cursor = previousInline;
    };
}

/**
 * Find the topmost visible token under a DOM pointer event.
 * @param {PointerEvent} event
 * @returns {Token|null}
 */
function tokenAtClient(event) {
    const point = typeof canvas.canvasCoordinatesFromClient === 'function'
        ? canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY})
        : canvas.mousePosition;
    const hits = canvas.tokens.placeables.filter(token =>
        token.visible && token.bounds.contains(point.x, point.y));
    if (!hits.length) return null;
    return hits.find(token => token.hover)
        ?? hits.sort((a, b) =>
            ((b.document.sort ?? 0) - (a.document.sort ?? 0))
            || ((b.document.elevation ?? 0) - (a.document.elevation ?? 0)))[0];
}
