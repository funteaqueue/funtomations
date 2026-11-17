import {MODULE_ID} from './constants.js';
import {publicAutomations, publicAutomationMatches, loadAutomationTranslations, unpublishAutomation} from './public-automations.js';
import {itemMacroState, saveItemMacro, setItemMacroEnabled, validateItemMacro} from './item-macros.js';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const canManage = item => !!item?.isOwner && !item.pack;

/** Install a snapshot, never a live link to somebody else's executable code. */
export async function applyPublicAutomation(item, key) {
    if (!canManage(item) || !game.user.can('MACRO_SCRIPT')) throw new Error('Немає дозволу використовувати Script-макроси на цьому предметі.');
    const entry = publicAutomations().find(e => e.key === key);
    if (!entry) throw new Error('Автор зняв цю автоматизацію з публікації.');
    validateItemMacro(entry.command);
    const previous = itemMacroState(item);
    if (previous.command && previous.command !== entry.command) {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: {title: 'Замінити макрос?'},
            content: '<p>На цьому предметі вже є макрос. Замінити його вибраною публічною копією?</p>'
        });
        if (!confirmed) return false;
    }
    const latest = publicAutomations().find(e => e.key === key);
    if (!latest || latest.revision !== entry.revision || latest.command !== entry.command) throw new Error('Публікація змінилася. Перегляньте нову версію перед застосуванням.');
    if (itemMacroState(item).command !== previous.command) throw new Error('Макрос предмета змінився. Відкрийте його ще раз перед заміною.');
    await saveItemMacro(item, {command: entry.command, enabled: true,
        source: {key: entry.key, revision: entry.revision, name: entry.name, author: entry.author}});
    return true;
}

export class AutomationManager extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ['fantik-automation-manager'],
        window: {icon: 'fa-solid fa-wand-magic-sparkles', resizable: true},
        position: {width: 480, height: 'auto'},
        actions: {
            openAutomation: AutomationManager.#openDetail,
            backToList: AutomationManager.#back,
            applyPublic: AutomationManager.#apply,
            disableCopy: AutomationManager.#disable,
            unpublish: AutomationManager.#unpublish
        }
    };
    static PARTS = {body: {template: `modules/${MODULE_ID}/templates/automation-manager.hbs`}};
    #item;
    #detailId = null;
    #search = '';
    #busy = false;
    #listeners;

    constructor(item, options = {}) {
        options.id = `fantik-automation-manager-${item.uuid.replaceAll('.', '-')}`;
        super(options); this.#item = item;
    }
    static open(item, {detailId = null} = {}) {
        if (!canManage(item)) return;
        const id = `fantik-automation-manager-${item.uuid.replaceAll('.', '-')}`;
        const manager = foundry.applications.instances.get(id) ?? new AutomationManager(item);
        manager.#detailId = detailId;
        return manager.render({force: true});
    }
    get title() { return `Manage Automations · ${this.#item.name}`; }

    async _prepareContext() {
        await loadAutomationTranslations();
        const state = itemMacroState(this.#item);
        const source = this.#item.getFlag(MODULE_ID, 'useMacroInstead')?.source;
        const rows = publicAutomations().map(entry => {
            const installed = source?.key === entry.key;
            const sameCode = installed && state.command === entry.command;
            return {...entry, installed, active: sameCode && state.enabled,
                byName: publicAutomationMatches(entry, this.#item),
                canUnpublish: entry.authorId === game.user.id,
                canDisable: installed && state.enabled,
                locked: !canManage(this.#item) || !game.user.can('MACRO_SCRIPT'),
                changed: installed && !sameCode,
                searchText: `${entry.name} ${entry.author}`.toLowerCase(),
                applyLabel: sameCode && state.enabled ? 'Використовується' : installed ? 'Оновити копію' : 'Використовувати'};
        }).sort((a,b) => Number(b.byName)-Number(a.byName) || Number(b.active)-Number(a.active) || a.name.localeCompare(b.name));
        const detail = rows.find(e => e.key === this.#detailId);
        if (!detail) this.#detailId = null;
        return {detail, rows, search:this.#search, busy:this.#busy};
    }
    _onRender(context, options) {
        super._onRender(context, options);
        this.#listeners?.abort(); this.#listeners = new AbortController();
        const filter = () => {
            for (const row of this.element.querySelectorAll('.fam-row')) row.hidden = !row.dataset.search.includes(this.#search.trim().toLowerCase());
        };
        const input = this.element.querySelector('input[type="search"]');
        input?.addEventListener('input', () => {this.#search=input.value;filter();}, {signal:this.#listeners.signal});
        filter();
    }
    _onClose(options) { this.#listeners?.abort(); super._onClose(options); }
    async #run(task) {
        if (this.#busy) return;
        this.#busy=true;
        try { await task(); }
        catch(error) { ui.notifications.error(error.message); }
        finally { this.#busy=false; if (this.rendered) await this.render(); }
    }
    static #openDetail(event, target) { this.#detailId=target.dataset.automationId; this.render(); }
    static #back() { this.#detailId=null; this.render(); }
    static #apply(event, target) { return this.#run(() => applyPublicAutomation(this.#item,target.dataset.automationId)); }
    static #disable() { return this.#run(() => setItemMacroEnabled(this.#item,false)); }
    static #unpublish(event, target) {
        return this.#run(async () => {
            if (!await foundry.applications.api.DialogV2.confirm({window:{title:'Зняти публікацію?'},content:'<p>Автоматизація зникне з каталогу. Встановлені копії залишаться.</p>'})) return;
            await unpublishAutomation(target.dataset.automationId);
            this.#detailId=null;
        });
    }
}

// Built-in registry bindings and execution are deliberately untouched. Only the
// public macro catalogue participates in discovery and green recommendations.
export function initAutomationManager() {
    const options = item => {
        const matches = publicAutomations().filter(e => publicAutomationMatches(e,item));
        return {
            name:'Manage Automations',
            icon:`<i class="fa-solid fa-wand-magic-sparkles" ${matches.length ? 'style="color:#2ea36b"' : ''}></i>`,
            classes:matches.length ? 'fantik-automations-manage-item' : '',
            callback:() => AutomationManager.open(item, {detailId:matches.length===1 ? matches[0].key : null})
        };
    };
    Hooks.on('dnd5e.getItemContextOptions', (item, entries) => {
        if (canManage(item)) entries.push(options(item));
    });
    Hooks.on('getItemContextOptions', (app, entries) => {
        if (app instanceof foundry.applications.sidebar.apps.Compendium) return;
        const itemFor = li => {const el=li?.[0] ?? li;return game.items.get(el?.dataset.entryId ?? el?.dataset.documentId);};
        const entry={name:'Manage Automations',group:'system',condition:li => {
            const item=itemFor(li);
            if (!canManage(item)) return false;
            Object.assign(entry, options(item)); return true;
        }};
        entries.push(entry);
    });
    Hooks.on('updateUser', (user, changes) => {
        if (!Object.keys(changes).some(k=>k==='flags'||k.startsWith(`flags.${MODULE_ID}`))) return;
        for (const app of foundry.applications.instances.values()) if (app instanceof AutomationManager && app.rendered) app.render();
    });
}
