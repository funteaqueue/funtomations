import {MODULE_ID} from './constants.js';
import {ownPublicAutomation, publishItemAutomation} from './public-automations.js';

const FLAG = 'useMacroInstead';
const running = new Set();
const editors = new Map();
const WRAPPED = Symbol.for('fantik-automations.item-macro-use');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function itemMacroState(item) {
    const flag = item?.getFlag(MODULE_ID, FLAG);
    return {command: typeof flag?.command === 'string' ? flag.command : '', enabled: flag?.enabled === true};
}

function canManage(item) { return !!item?.isOwner && !item.pack; }
function canEdit(item) { return canManage(item) && game.user.can('MACRO_SCRIPT'); }

function replacesUse(item) {
    return !item?.pack && itemMacroState(item).enabled;
}

/** Compile only, using the same nested block and arguments as Macro#execute. */
export function validateItemMacro(command) {
    if (!command.trim()) throw new Error('Встав код макроса перед збереженням.');
    new foundry.utils.AsyncFunction('speaker', 'actor', 'token', 'character', 'scope',
        'item', 'itemActor', 'activity', 'event', `{${command}\n}`);
}

export async function saveItemMacro(item, {command, enabled, publicAutomation, source}) {
    if (!canEdit(item)) throw new Error('Немає дозволу редагувати макрос цього предмета.');
    validateItemMacro(command);
    const previous = item.getFlag(MODULE_ID, FLAG) ?? {};
    await item.setFlag(MODULE_ID, FLAG, {...previous, command, enabled: !!enabled,
        ...(source ? {source} : {})});
    if (typeof publicAutomation === 'boolean') {
        try { await publishItemAutomation(item, command, publicAutomation); }
        catch (error) { throw new Error(`Код предмета збережено, але публікацію не оновлено: ${error.message}`); }
    }
}

/** Owners can always turn a replacement off, even after losing script permission. */
export async function setItemMacroEnabled(item, enabled) {
    if (!canManage(item)) throw new Error('Немає дозволу керувати цим предметом.');
    if (enabled) {
        if (!canEdit(item)) throw new Error('Немає дозволу запускати Script-макроси.');
        validateItemMacro(itemMacroState(item).command);
    }
    await item.setFlag(MODULE_ID, `${FLAG}.enabled`, !!enabled);
    const checkbox = editors.get(item.uuid)?.element?.querySelector('[name="enabled"]');
    if (checkbox) checkbox.checked = !!enabled;
}

/** One editor per item; invalid code and failed writes leave the editor open. */
export function openItemMacroEditor(item) {
    if (!canManage(item)) return;
    const existing = editors.get(item.uuid);
    if (existing) { existing.bringToFront(); return existing; }
    const state = itemMacroState(item);
    const publication = ownPublicAutomation(item);
    const dialog = new foundry.applications.api.DialogV2({
        id: `fantik-item-macro-${item.uuid.replaceAll('.', '-')}`,
        classes: ['fantik-item-macro-editor'],
        window: {title: `Manage macros · ${item.name}`, resizable: true},
        position: {width: 650},
        form: {closeOnSubmit: false},
        content: `<p class="fantik-macro-status ${state.enabled ? 'is-active' : ''}">${state.enabled ? '● Макрос замінює стандартне використання' : '○ Стандартне використання предмета'}</p>
            <label class="fantik-macro-enabled"><input type="checkbox" name="enabled" ${state.enabled || !state.command ? 'checked' : ''} ${canEdit(item) ? '' : 'disabled'}> Використовувати макрос замість предмета</label>
            <label class="fantik-macro-enabled"><input type="checkbox" name="publicAutomation" ${publication ? 'checked' : ''} ${canEdit(item) ? '' : 'disabled'}> Public automation</label>
            <label class="fantik-macro-code-label">Код Script-макроса
            <textarea name="command" spellcheck="false" autocomplete="off" aria-label="Код макроса" ${canEdit(item) ? '' : 'readonly'}>${escapeHTML(state.command)}</textarea></label>
            ${canEdit(item) ? '' : '<p class="hint">Немає дозволу редагувати Script-макроси. Вимкнути наявну підміну можна кнопкою нижче.</p>'}
            <p class="hint">Повністю замінює стандартне використання. Комірки, заряди та ефекти має обробляти сам макрос.</p>`,
        buttons: [
            {action:'save', label:'Зберегти', icon:'fa-solid fa-floppy-disk', default:true, disabled:!canEdit(item),
                callback: async (_event, button) => {
                    try {
                        await saveItemMacro(item, {command:button.form.elements.command.value,
                            enabled:button.form.elements.enabled.checked,
                            publicAutomation:button.form.elements.publicAutomation?.checked});
                        await dialog.close();
                    } catch (error) { ui.notifications.error(error.message); }
                }},
            ...(state.enabled ? [{action:'disable', label:'Вимкнути підміну', icon:'fa-solid fa-power-off',
                callback:async () => {
                    try { await setItemMacroEnabled(item, false); await dialog.close(); }
                    catch (error) { ui.notifications.error(error.message); }
                }}] : []),
            {action:'cancel', label:'Скасувати', callback:() => dialog.close()}
        ]
    });
    editors.set(item.uuid, dialog);
    dialog.addEventListener('close', () => editors.delete(item.uuid), {once:true});
    Promise.resolve(dialog.render({force:true})).catch(error => {
        editors.delete(item.uuid);
        ui.notifications.error(`Не вдалося відкрити редактор: ${error.message}`);
    });
    return dialog;
}

// Foundry 14 requires exactly one icon element and marks it inert.
// Multiple roots (for example an icon plus checkbox) make it skip the entire entry.
function manageIcon(item) {
    return `<i class="fa-solid fa-code" ${itemMacroState(item).enabled ? 'style="color:#51b986"' : ''}></i>`;
}

/** Execute locally as the clicking user; no privileged relay or saved Macro document. */
export async function executeItemMacro(item, {activity = null, event = null} = {}) {
    if (!item?.isOwner || !game.user.can('MACRO_SCRIPT')) {
        ui.notifications.warn('Немає дозволу запускати макрос цього предмета.');
        return;
    }
    const state = itemMacroState(item);
    if (!state.enabled || item.pack) return;
    if (running.has(item.uuid)) {
        ui.notifications.warn('Макрос цього предмета вже виконується.');
        return;
    }
    running.add(item.uuid);
    try {
        validateItemMacro(state.command);
        const actor = game.user.character ?? null;
        // Never let an unrelated controlled token silently become the caster.
        const tokens = actor?.getActiveTokens?.() ?? [];
        const token = tokens.find(t => t.controlled) ?? (tokens.length === 1 ? tokens[0] : null);
        const speaker = {actor:actor?.id ?? null, token:token?.id ?? null,
            scene:token?.document?.parent?.id ?? null, alias:actor?.name ?? game.user.name};
        const macro = new CONFIG.Macro.documentClass({name:item.name, type:'script', command:state.command,
            ownership:{default:0, [game.user.id]:CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER}});
        await macro.execute({actor, token, speaker, item, itemActor:item.actor ?? null, activity, event});
        // Do not return arbitrary macro values as dnd5e ActivityUsageResults.
    } catch (error) {
        console.error(`${MODULE_ID} | Item replacement macro failed`, error);
        ui.notifications.error(`Макрос «${item.name}»: ${error.message}`);
    } finally { running.delete(item.uuid); }
}

/** Cancel synchronously: native Hooks.call does not await listeners. */
export function interceptItemMacroActivity(activity, usage = {}) {
    if (!replacesUse(activity?.item)) return;
    void Promise.resolve().then(() => executeItemMacro(activity.item, {activity, event:usage.event}));
    return false;
}

/** Item.use has no cancellable pre-use hook in 5.3.3/6.x. Wrap only that entry point. */
export function installItemMacroUseWrapper() {
    const prototype = CONFIG.Item.documentClass.prototype;
    const original = prototype.use;
    if (typeof original !== 'function' || original[WRAPPED]) return;
    function use(...args) {
        if (!replacesUse(this)) return original.apply(this, args);
        return executeItemMacro(this, {event:args[0]?.event});
    }
    Object.defineProperty(use, WRAPPED, {value:true});
    prototype.use = use;
}

export function initItemMacros() {
    Hooks.on('dnd5e.getItemContextOptions', (item, entries) => {
        if (!canManage(item)) return;
        const state = itemMacroState(item);
        entries.push({name:state.command || state.enabled ? 'Manage macros' : 'Use macros instead',
            icon:manageIcon(item), classes:`fantik-item-macro-entry${state.enabled ? ' fantik-item-macro-active' : ''}`,
            callback:() => openItemMacroEditor(item)});

    });
    Hooks.on('getItemContextOptions', (app, entries) => {
        if (app instanceof foundry.applications.sidebar.apps.Compendium) return;
        const itemFor = li => { const el = li?.[0] ?? li; return game.items.get(el?.dataset.entryId ?? el?.dataset.documentId); };
        const entry = {name:'Use macros instead', group:'system', classes:'fantik-item-macro-entry',
            condition:li => {
                const item = itemFor(li);
                if (!canManage(item)) return false;
                const state = itemMacroState(item);
                entry.name = state.command || state.enabled ? 'Manage macros' : 'Use macros instead';
                entry.icon = manageIcon(item);
                entry.classes = `fantik-item-macro-entry${state.enabled ? ' fantik-item-macro-active' : ''}`;
                return true;
            }, callback:li => openItemMacroEditor(itemFor(li))};
        entries.push(entry);

    });
    Hooks.on('dnd5e.preUseActivity', interceptItemMacroActivity);
}
