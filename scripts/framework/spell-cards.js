import {MODULE_ID} from './constants.js';
import {registerSocketHandler, emitToOthers} from './sockets.js';

const REQUEST = 'spellCards.woundedRequest';
const RESPONSE = 'spellCards.woundedResponse';
const pending = new Map();
const saving = new Set();
const applyingAttacks = new Set();
const ABILITIES = {str:'Сила', dex:'Спритність', con:'Статура', int:'Інтелект', wis:'Мудрість', cha:'Харизма'};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

function damageBreakdown(rolls) {
    return rolls.map(roll => '<div style="font:12px/1.5 sans-serif;overflow-wrap:anywhere;">'
        + escapeHTML(roll.formula) + ' = <strong>' + escapeHTML(roll.total) + '</strong>'
        + (roll.options?.type ? ' · ' + escapeHTML(roll.options.type) : '')
        + '<div>' + (roll.dice ?? []).map(die => 'd' + escapeHTML(die.faces) + ': '
            + die.results.map(r => '<span' + (r.discarded || r.active === false ? ' style="text-decoration:line-through;opacity:.65;"' : '')
                + '>' + escapeHTML(r.result) + '</span>').join(' · ')).join(' / ') + '</div></div>').join('');
}

/** Version 2 is spell-independent; keep old Toll the Dead messages usable. */
function cardConfig(message) {
    const config = message.getFlag(MODULE_ID, 'spellCard');
    if (config?.version === 2 || config?.version === 3) return config;
    if (config?.kind !== 'toll-the-dead' || (config.version != null && config.version !== 1)) return null;
    const old = message.getFlag('world', 'fantikTollTheDead');
    const targets = message.system?.targets ?? message.getFlag('dnd5e', 'targets') ?? [];
    return {legacy:true, damage:true, targets:old?.untargeted ? [] : targets.filter(t => t.token === old?.target),
        save:{ability:'wis', dc:old?.dc}};
}

function recordedTargets(message, config) {
    const targets = config.legacy ? config.targets : (message.system?.targets ?? config.targets ?? []);
    return Array.from(new Map(Array.from(targets).filter(t => typeof t.token === 'string')
        .map(t => [t.token, t])).values());
}

function validSave(save) {
    return Object.hasOwn(ABILITIES, save?.ability) && Number.isInteger(Number(save.dc)) && Number(save.dc) > 0;
}

/** Use the exact recorded token, even if the GM has selected another creature. */
export async function rollRecordedSave(message, {event, button, targetUuid} = {}) {
    if (!game.user.isGM || !message.isContentVisible) return;
    const config = cardConfig(message);
    if (!config) return;
    const targets = recordedTargets(message, config);
    const descriptor = targetUuid ? targets.find(t => t.token === targetUuid) : (targets.length === 1 ? targets[0] : null);
    const dc = Number(config.save?.dc);
    if (!descriptor || !validSave(config.save)) {
        ui.notifications.warn('У картці немає коректної цілі або КС ряткидка.');
        return;
    }
    let token;
    try { token = fromUuidSync(descriptor.token); }
    catch { /* Treat invalid or stale UUIDs like a deleted target. */ }
    if (token?.documentName !== 'Token' || !token.actor?.isOwner || !token.actor.rollSavingThrow) {
        ui.notifications.warn('Ціль цієї картки недоступна. Можливо, її токен видалено.');
        return;
    }
    const key = `${message.id}:${descriptor.token}`;
    if (saving.has(key)) return;
    saving.add(key);
    if (button) button.disabled = true;
    try {
        // Native dnd5e handles bonuses, conditions, advantage, dialog and Dice So Nice.
        // No HP mutation: the GM still decides when to use Apply Damage.
        return await token.actor.rollSavingThrow({event, ability:config.save.ability, target:dc}, {}, {
            data: {
                speaker: ChatMessage.getSpeaker({actor:token.actor, token, scene:token.parent}),
                ...(Number(game.system.version.split('.')[0]) >= 6 ? {system: {origin:message.id}} : {})
            }
        });
    } catch (error) {
        console.error(`${MODULE_ID} | Recorded saving throw failed`, error);
        ui.notifications.error('Не вдалося виконати ряткидок цілі.');
    } finally {
        saving.delete(key);
        if (button) button.disabled = false;
    }
}

/** Read on the GM client only. No HP values are included in replies. */
function inspectWounded(request) {
    const requester = game.users.get(request.requester);
    const token = fromUuidSync(request.targetUuid);
    const caster = fromUuidSync(request.actorUuid);
    const canUseCaster = requester?.character?.uuid === request.actorUuid
        || (caster?.documentName === 'Actor' && (requester?.isGM || caster.testUserPermission?.(requester, 'OWNER')));
    if (!requester?.active || !canUseCaster
        || token?.documentName !== 'Token' || token.parent?.id !== request.sceneId
        || (requester.viewedScene && requester.viewedScene !== request.sceneId)
        || (token.hidden && !requester.isGM)) {
        throw new Error('Недоступна ціль. Обери видиму істоту на своїй сцені.');
    }
    const hp = token.actor?.system?.attributes?.hp;
    if (hp?.value == null || hp?.max == null || !Number.isFinite(Number(hp.value))
        || !Number.isFinite(Number(hp.max)) || Number(hp.max) <= 0) {
        throw new Error('Стан цілі невідомий. Обери стан цілі вручну.');
    }
    return Number(hp.value) < Number(hp.max);
}

/** Request only the wound condition, never arbitrary actor data or mutations. */
export function getWounded({targetUuid, actorUuid, sceneId, signal} = {}) {
    if (signal?.aborted) return Promise.reject(new Error('Вибір скасовано.'));
    if (![targetUuid, actorUuid, sceneId].every(value => typeof value === 'string' && value.length > 0)) {
        return Promise.reject(new Error('Некоректна ціль передбачення шкоди.'));
    }
    const request = {id: foundry.utils.randomID(), requester: game.user.id, targetUuid, actorUuid, sceneId};
    if (game.user.isGM) {
        try { return Promise.resolve(inspectWounded(request)); }
        catch (error) { return Promise.reject(error); }
    }
    const gm = game.users.activeGM;
    if (!gm) return Promise.reject(new Error('GM не підключений. Обери стан цілі вручну.'));
    if (pending.size >= 8) return Promise.reject(new Error('Попередні запити ще виконуються.'));
    request.gm = gm.id;
    return new Promise((resolve, reject) => {
        let timer;
        const settle = (error, result) => {
            if (!pending.delete(request.id)) return;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            if (error) reject(error); else resolve(result);
        };
        const abort = () => settle(new Error('Вибір скасовано.'));
        pending.set(request.id, {gm: gm.id, settle});
        timer = setTimeout(() => settle(new Error('GM не відповів. Обери стан цілі вручну.')), 8000);
        signal?.addEventListener('abort', abort, {once: true});
        try { emitToOthers(REQUEST, request); }
        catch (error) { settle(error); }
    });
}

/** Preserve the system's live damage element, with its native event handlers. */
export function renderSpellCard(message, html) {
    const config = cardConfig(message);
    if (!config || !message.isContentVisible) return;
    const content = html.querySelector('.message-content');
    if (!content) return;
    const template = document.createElement('template');
    // Stored message content has passed Foundry's HTML sanitizer.
    template.innerHTML = message.content;
    const card = template.content.querySelector(config.legacy ? '.fantik-toll-card' : '.fantik-spell-card');
    if (!card) return; // Leave the native message intact if the custom markup is unavailable.
    if (config.version === 3 && Array.isArray(config.attacks)) {
        content.replaceChildren(template.content);
        renderAttackChain(message, card, config);
        return;
    }
    const targets = recordedTargets(message, config);
    const tray = game.user.isGM && config.damage !== false && targets.length
        ? content.querySelector('damage-application') : null;
    content.replaceChildren(template.content);
    if (!game.user.isGM || !targets.length) return;
    const controls = document.createElement('div');
    controls.className = 'fantik-spell-damage-controls';
    controls.style.cssText = 'position:relative;text-align:left;margin-top:6px;font:13px/1.4 var(--font-body, sans-serif);';
    if (validSave(config.save)) {
        const slot = card.querySelector('[data-fantik-save]') ?? controls;
        if (slot !== controls) slot.replaceChildren();
        for (const target of targets) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'fantik-recorded-save';
            button.textContent = (targets.length > 1 ? (target.name || 'Ціль') + ' · ' : '')
                + ABILITIES[config.save.ability] + ' · КС ' + Number(config.save.dc);
            button.title = 'Ряткидок за записану ціль';
            button.style.cssText = 'display:block;width:100%;height:auto;min-height:28px;margin:3px 0;padding:4px 6px;white-space:normal;color:inherit;border:1px solid currentColor;border-radius:5px;background:transparent;font:inherit;';
            button.addEventListener('click', event => {
                event.preventDefault();event.stopPropagation();
                void rollRecordedSave(message, {event, button, targetUuid:target.token});
            });
            slot.append(button);
        }
    }
    if (tray) {
        const slot = card.querySelector('[data-fantik-damage]');
        if (slot) slot.replaceChildren(tray); else controls.append(tray);
        tray.open = true;
    }
    if (controls.childElementCount) card.append(controls);
}

/** Resolve recorded identities only on the GM client; never transmit AC or a hit verdict. */
function attackTarget(entry) {
    if (!game.user.isGM || !entry?.target?.token) return null;
    try {
        const token = fromUuidSync(entry.target.token);
        return token?.documentName === 'Token' && token.actor?.isOwner
            && token.actor.uuid === entry.target.actor ? token : null;
    } catch { return null; }
}

/** Advisory only: current AC, retained d20, no cover/reaction/conditional adjudication. */
export function recordedAttackHint(message, entry) {
    if (!game.user.isGM || !message.isContentVisible) return null;
    const token = attackTarget(entry);
    const roll = message.rolls?.[entry.attackRoll];
    if (!token || !roll?.evaluated) return null;
    const natural = roll.dice?.find(d => d.faces === 20)?.results.find(r => r.active !== false && !r.discarded)?.result;
    const rawAC = token.actor.system?.attributes?.ac?.value;
    const ac = rawAC == null ? NaN : Number(rawAC);
    if (natural === 1) return 'Натуральна 1';
    if (roll.isCritical === true || natural === 20) return 'Критичне влучання';
    if (!Number.isFinite(ac) || !Number.isFinite(roll.total)) return 'AC недоступний';
    return roll.total >= ac ? 'Ймовірно влучає' : 'Ймовірно не влучає';
}

/** One explicit GM action, one recorded roll, one exact target. Native traits/HP rules apply. */
export async function applyRecordedAttack(message, {entryId, kind, multiplier = 1} = {}) {
    if (!game.user.isGM || !message.isContentVisible || !['damage','healing'].includes(kind)) return false;
    if (typeof entryId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(entryId)) return false;
    if (game.users?.activeGM && game.users.activeGM.id !== game.user.id) {
        ui.notifications.warn('Застосування виконує активний GM, щоб уникнути подвійного списання.');
        return false;
    }
    const config = cardConfig(message);
    const entry = config?.version === 3 ? config.attacks?.find(e => e.id === entryId) : null;
    const token = attackTarget(entry);
    const roll = entry && Number.isInteger(entry.damageRoll) && message.rolls?.[entry.damageRoll];
    if (!token?.actor?.applyDamage || !(roll instanceof CONFIG.Dice.DamageRoll) || !roll.evaluated
        || !Number.isFinite(roll.total) || ![0.5,1,2].includes(Number(multiplier))) return false;
    const receipt = message.getFlag(MODULE_ID, 'attackApplications')?.[entryId];
    const key = `${message.id}:${entryId}`;
    if (receipt || applyingAttacks.has(key)) return false;
    applyingAttacks.add(key);
    let begun = false;
    try {
        // Receipt persists across card updates and reloads. An interrupted mutation is
        // deliberately not retried: the GM must check HP manually in that case.
        await message.update({[`flags.${MODULE_ID}.attackApplications.${entryId}`]:{state:'pending',kind}});
        begun = true;
        await token.actor.applyDamage([{value:Math.max(0,roll.total),
            type:kind === 'healing' ? 'healing' : roll.options.type,
            properties:new Set(kind === 'healing' ? [] : (roll.options.properties ?? []))}],
        {multiplier:Number(multiplier),isDelta:true,origin:message});
        await message.update({[`flags.${MODULE_ID}.attackApplications.${entryId}`]:{state:'done',kind}});
        return true;
    } catch (error) {
        console.error(MODULE_ID + ' | Recorded attack application', error);
        ui.notifications.error(begun ? 'Результат застосування не підтверджено. Перевір HP вручну; повторне застосування заблоковано.'
            : 'Не вдалося записати застосування. HP не змінено.');
        return false;
    } finally { applyingAttacks.delete(key); }
}

function renderAttackChain(message, card, config) {
    // Do not even resolve target UUIDs on player clients. Verdicts are DOM-only.
    if (!game.user.isGM) return;
    const entries = config.attacks.filter(e => e?.target?.token && e?.target?.actor);
    for (const entry of entries) {
        const hint = recordedAttackHint(message, entry);
        const slot = [...card.querySelectorAll('[data-fantik-hit]')].find(e => e.dataset.fantikHit === entry.id);
        if (!hint || !slot) continue;
        slot.textContent = `GM · ${hint}`;
        slot.title = 'За поточним AC. Укриття, реакції та інші умови перевіряє GM.';
        slot.style.cssText = 'margin-top:5px;color:#dfcda5;font:10px/1.4 sans-serif;';
    }
    const host = card.querySelector('[data-fantik-chain-controls]');
    if (!host || !entries.length) return;
    host.replaceChildren();
    const select = document.createElement('select');
    select.ariaLabel = 'Застосувати результат до цілі';
    select.style.cssText = 'width:100%;height:30px;color:#eee9de;background:#25272b;border:1px solid #777168;border-radius:5px;font:12px sans-serif;';
    for (const entry of entries) {
        const option = document.createElement('option'); option.value=entry.id;
        option.textContent=`${config.attacks.indexOf(entry)+1}. ${entry.target.name || 'Ціль'}`;
        select.append(option);
    }
    select.value = entries.some(e => e.id === config.active) ? config.active : entries.at(-1).id;
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    const note = document.createElement('div'); note.style.cssText='font:10px/1.4 sans-serif;margin-top:5px;color:#c7c2b9;';
    const buttons = ['damage','healing'].map(kind => {
        const button = document.createElement('button'); button.type='button';
        button.className='fantik-recorded-attack';button.dataset.kind=kind;
        button.textContent = kind === 'damage' ? 'Влучає · шкода' : 'Влучає · зцілення';
        button.style.cssText='flex:1;min-width:0;white-space:normal;height:auto;min-height:38px;font:11px/1.3 sans-serif;padding:5px;border:1px solid #716b60;border-radius:5px;background:#28272a;color:#f4e9da;';
        button.addEventListener('click', async event => {
            event.preventDefault();event.stopPropagation();
            const entryId=select.value;
            buttons.forEach(b=>b.disabled=true);
            await applyRecordedAttack(message,{entryId,kind});refresh();
        });
        actions.append(button);return button;
    });
    function refresh() {
        const entry=entries.find(e=>e.id===select.value);
        const receipt=message.getFlag(MODULE_ID,'attackApplications')?.[entry?.id];
        const target=attackTarget(entry);
        buttons.forEach(b=>b.disabled=!!receipt || !target);
        note.textContent=receipt?.state==='done' ? (receipt.kind==='healing'?'Зцілення застосовано.':'Шкоду застосовано.')
            : receipt ? 'Перевір застосування вручну.' : !target ? 'Записана ціль недоступна.' : '';
    }
    select.addEventListener('change',refresh);host.append(select,actions,note);refresh();
}

/** Produce a typed message without needing an Item, activity, slot, or scene. */
export function buildCardData({content = '', caster, casterToken, targets = [], save, damageRolls = [], showRolls = true,
    rollMode = game.settings.get('core', 'rollMode')} = {}) {
    const descriptors = [];
    for (const target of targets) {
        const token = target?.document ?? target;
        const descriptor = token?.documentName === 'Token'
            ? {actor:token.actor?.uuid, token:token.uuid, name:token.name, img:token.texture?.src}
            : target;
        if (typeof descriptor?.token !== 'string' || typeof descriptor?.actor !== 'string') continue;
        if (!descriptors.some(t => t.token === descriptor.token)) descriptors.push({
            actor:descriptor.actor, token:descriptor.token, name:descriptor.name ?? '', img:descriptor.img ?? ''
        });
    }
    const normalizedSave = validSave(save) ? {ability:save.ability, dc:Number(save.dc)} : null;
    const data = {
        speaker: ChatMessage.getSpeaker(caster ? {actor:caster, ...(casterToken ? {
            token:casterToken.document ?? casterToken, scene:(casterToken.document ?? casterToken).parent
        } : {})} : {alias:game.user.name}),
        content:'<section class="fantik-spell-card">' + content
            + (showRolls && damageRolls.length ? '<div data-fantik-rolls>' + damageBreakdown(damageRolls) + '</div>' : '') + '</section>',
        rolls:damageRolls,
        flags:{[MODULE_ID]:{spellCard:{version:2, targets:descriptors, save:normalizedSave, damage:!!damageRolls.length}}}
    };
    if (damageRolls.length) {
        data.type = 'damage';
        data.system = {targets:descriptors};
        if (normalizedSave && ['none', 'half', 'full'].includes(save.onSave)) data.system.onSave = save.onSave;
    }
    ChatMessage.applyRollMode(data, rollMode);
    return data;
}

/** Publish already evaluated damage after DSN; never roll, consume, or apply HP here. */
export async function createCard(options = {}) {
    const data = buildCardData(options);
    // Keep all dice and their types. Do not silently evaluate or reroll a supplied roll.
    if (data.rolls.some(roll => !roll?.evaluated)) throw new Error('Передай вже обчислені кидки шкоди.');
    if (game.dice3d?.showForRoll && data.rolls.length) {
        data.flags['dice-so-nice'] = {skip:true};
        const recipients = (data.whisper ?? []).map(u => typeof u === 'string' ? u : u.id);
        const isPublic = !data.blind && !recipients.length;
        const viewers = isPublic ? null : [...new Set([...recipients, ...(!data.blind ? [game.user.id] : [])])];
        const maySee = isPublic || viewers.includes(game.user.id);
        for (const roll of data.rolls) {
            if (!isPublic && !viewers.length) continue;
            try { await game.dice3d.showForRoll(roll, game.user, true, viewers, !maySee); }
            catch (error) { console.warn(MODULE_ID + ' | Dice animation unavailable', error); }
        }
    }
    return ChatMessage.create(data);
}

export function initSpellCards() {
    registerSocketHandler(REQUEST, request => {
        // Only the designated GM answers. No socket request ever applies damage.
        if (!game.user.isGM || request?.gm !== game.user.id || game.users.activeGM?.id !== game.user.id
            || typeof request.id !== 'string' || typeof request.requester !== 'string'
            || ![request.targetUuid, request.actorUuid, request.sceneId].every(value => typeof value === 'string')) return;
        const reply = {id: request.id, recipient: request.requester, gm: game.user.id};
        try { reply.wounded = inspectWounded(request); }
        catch { reply.error = 'Не вдалося перевірити стан цілі. Обери стан цілі вручну.'; }
        emitToOthers(RESPONSE, reply);
    });
    registerSocketHandler(RESPONSE, reply => {
        if (reply?.recipient !== game.user.id) return;
        const entry = pending.get(reply.id);
        if (!entry || entry.gm !== reply.gm) return;
        if (typeof reply.wounded === 'boolean') entry.settle(null, reply.wounded);
        else if (reply.error) entry.settle(new Error('Не вдалося перевірити стан цілі. Обери стан цілі вручну.'));
    });
    Hooks.on('dnd5e.renderChatMessage', renderSpellCard);
    // Standalone attack cards also render through Foundry's base message path.
    // Restrict the fallback to v3 so native damage/save trays keep their lifecycle.
    Hooks.on('renderChatMessageHTML', (message, html) => {
        if (cardConfig(message)?.version === 3) renderSpellCard(message, html);
    });
}

export const spellCards = Object.freeze({version: 5, getWounded, buildCardData, createCard, rollRecordedSave, applyRecordedAttack});
