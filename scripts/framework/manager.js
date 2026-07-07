import {MODULE_ID} from './constants.js';
import {registry} from './registry.js';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * "Manage Automations" window for a single item.
 *
 * List view: every registered automation, active ones highlighted and sorted first,
 * filtered by the search input. Clicking a row opens the detail view.
 *
 * Detail view: description, apply/remove toggle, and the automation's per-item
 * settings (defined by automation.settings, stored on the item's
 * 'settings.<automationId>' flag, saved on change).
 *
 * Apply/remove writes the explicit binding flags ('automations' /
 * 'disabledAutomations') that registry.findForItem reads, migrating the legacy
 * single-binding 'automation' flag on first change.
 */
export class AutomationManager extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ['fantik-automation-manager'],
        window: {
            icon: 'fa-solid fa-wand-magic-sparkles',
            resizable: false
        },
        position: {width: 440, height: 'auto'},
        actions: {
            openAutomation: AutomationManager.#onOpenAutomation,
            backToList: AutomationManager.#onBackToList,
            toggleAutomation: AutomationManager.#onToggleAutomation
        }
    };

    static PARTS = {
        body: {template: `modules/${MODULE_ID}/templates/automation-manager.hbs`}
    };

    #item;
    #search = '';
    #detailId = null;

    constructor(item, options = {}) {
        options.id = AutomationManager.#idFor(item);
        super(options);
        this.#item = item;
    }

    static #idFor(item) {
        return `fantik-automation-manager-${item.uuid.replaceAll('.', '-')}`;
    }

    /** Open (or refocus) the manager window for an item, optionally jumping straight to one automation's detail view. */
    static open(item, {detailId = null} = {}) {
        const existing = foundry.applications.instances.get(AutomationManager.#idFor(item));
        const manager = existing ?? new AutomationManager(item);
        if (detailId) manager.#detailId = detailId;
        return manager.render({force: true});
    }

    get title() {
        return game.i18n.format('FANTIK-AUTOMATIONS.Manager.Title', {name: this.#item.name});
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    async _prepareContext() {
        const detail = this.#detailId ? this.#prepareDetail() : null;
        if (detail) return {detail};
        return {rows: this.#prepareRows(), search: this.#search};
    }

    #automationState(automation) {
        const {added, removed} = this.#normalizedBindings();
        const byName = registry.matchesItemName(automation, this.#item);
        const active = added.has(automation.id) || (byName && !removed.has(automation.id));
        return {
            byName,
            active,
            enabled: registry.isEnabled(automation.id),
            locked: !registry.canManage(automation)
        };
    }

    #prepareRows() {
        return registry.all()
            .filter(automation => registry.isSelectable(automation))
            .map(automation => ({
                id: automation.id,
                name: automation.name,
                ...this.#automationState(automation),
                searchText: `${automation.name} ${automation.id}`.toLowerCase()
            }))
            // GM-only automations stay hidden from players unless already active
            // on the item — then they show read-only, with a lock tag.
            .filter(row => !row.locked || row.active)
            .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    }

    #prepareDetail() {
        const automation = registry.get(this.#detailId);
        if (!automation) {
            this.#detailId = null;
            return null;
        }
        const state = this.#automationState(automation);
        const stored = this.#item.getFlag(MODULE_ID, `settings.${automation.id}`) ?? {};
        const fields = (automation.settings ?? []).map(field => {
            const value = stored[field.key] ?? field.default;
            const type = field.type ?? 'text';
            return {
                key: field.key,
                label: field.name ?? field.key,
                hint: field.hint,
                isCheckbox: type === 'checkbox',
                isNumber: type === 'number',
                isSelect: type === 'select',
                isText: type === 'text',
                value,
                min: field.min,
                max: field.max,
                step: field.step,
                options: Object.entries(field.choices ?? {})
                    .map(([key, label]) => ({value: key, label, selected: key === value}))
            };
        });
        return {
            id: automation.id,
            name: automation.name,
            description: automation.description,
            version: automation.version,
            ...state,
            fields,
            toggleLabel: game.i18n.localize(`FANTIK-AUTOMATIONS.Manager.${state.active ? 'RemoveLong' : 'ApplyLong'}`),
            statusLabel: game.i18n.localize(`FANTIK-AUTOMATIONS.Manager.${state.active ? 'Active' : 'Inactive'}`),
            gmOnly: !!automation.gmOnly
        };
    }

    _onRender(context, options) {
        const input = this.element.querySelector('input[type="search"]');
        if (input) {
            input.addEventListener('input', () => {
                this.#search = input.value;
                this.#applySearchFilter();
            });
            this.#applySearchFilter();
        }
        for (const field of this.element.querySelectorAll('[data-setting-key]')) {
            field.addEventListener('change', () => this.#onSettingChange(field));
        }
    }

    #applySearchFilter() {
        const query = this.#search.trim().toLowerCase();
        for (const row of this.element.querySelectorAll('.fam-row')) {
            row.hidden = !!query && !row.dataset.search.includes(query);
        }
    }

    /* -------------------------------------------- */
    /*  Bindings                                    */
    /* -------------------------------------------- */

    /**
     * Current bindings with the legacy 'automation' flag folded in. A legacy 'none'
     * (suppress all name matching) becomes explicit removals of every name match,
     * so migrating it to the new flags preserves behavior.
     */
    #normalizedBindings() {
        const {added, removed, suppressNameMatching} = registry.getItemBindings(this.#item);
        if (suppressNameMatching) {
            for (const automation of registry.all()) {
                if (registry.matchesItemName(automation, this.#item)) removed.add(automation.id);
            }
        }
        return {added, removed};
    }

    async #onSettingChange(field) {
        if (!registry.canManage(registry.get(this.#detailId))) return;
        const key = field.dataset.settingKey;
        let value;
        if (field.type === 'checkbox') value = field.checked;
        else if (field.type === 'number') value = Number(field.value);
        else value = field.value;
        await this.#item.update({[`flags.${MODULE_ID}.settings.${this.#detailId}.${key}`]: value});
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static #onOpenAutomation(event, target) {
        this.#detailId = target.dataset.automationId;
        this.render();
    }

    static #onBackToList() {
        this.#detailId = null;
        this.render();
    }

    static async #onToggleAutomation(event, target) {
        const id = target.dataset.automationId;
        const automation = registry.get(id);
        if (!automation) return;
        if (!registry.canManage(automation)) {
            ui.notifications.warn(game.i18n.localize('FANTIK-AUTOMATIONS.Manager.GMOnlyWarning'));
            return;
        }
        const {added, removed} = this.#normalizedBindings();
        const byName = registry.matchesItemName(automation, this.#item);
        const active = added.has(id) || (byName && !removed.has(id));
        if (active) {
            added.delete(id);
            if (byName) removed.add(id);
        } else {
            added.add(id);
            removed.delete(id);
        }
        await this.#item.update({
            [`flags.${MODULE_ID}`]: {
                '-=automation': null,
                automations: [...added],
                disabledAutomations: [...removed]
            }
        });
        await this.render();
    }
}

/**
 * Add "Manage Automations" entries to item context menus: the sidebar Items
 * directory and items on dnd5e actor sheets. Items that currently have an
 * active automation additionally get a "Manage <item name>" entry that jumps
 * straight to that automation's detail view (or the list when several are
 * active). Compendium entries are skipped (flags can't be written to locked
 * packs).
 */
export function initAutomationManager() {
    const detailFor = item => {
        const active = registry.findForItem(item);
        return {detailId: active.length === 1 ? active[0].id : null};
    };
    // Green accent (matches --fam-green) marks the entry as "this item has an
    // active automation". The icon is colored inline; the label text is colored
    // by the .fantik-automations-manage-item rule where the menu supports
    // per-entry classes.
    const manageItemIcon = '<i class="fa-solid fa-wand-magic-sparkles" style="color: #2ea36b;"></i>';
    const manageItemClasses = 'fantik-automations-manage-item';

    Hooks.on('getItemContextOptions', (app, entryOptions) => {
        if (app instanceof foundry.applications.sidebar.apps.Compendium) return;
        const itemFor = li => game.items.get(li.dataset.entryId ?? li.dataset.documentId);
        entryOptions.push({
            name: 'FANTIK-AUTOMATIONS.Manager.MenuLabel',
            icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>',
            group: 'system',
            condition: li => !!itemFor(li)?.isOwner,
            callback: li => {
                const item = itemFor(li);
                if (item) AutomationManager.open(item);
            }
        });
        const manageItemEntry = {
            name: 'FANTIK-AUTOMATIONS.Manager.ItemMenuLabel',
            icon: manageItemIcon,
            classes: manageItemClasses,
            group: 'system',
            condition: li => {
                const item = itemFor(li);
                if (!item?.isOwner || !registry.findForItem(item).length) return false;
                // The directory builds its menu entries once, but condition runs on
                // every open — refresh the per-item label here.
                manageItemEntry.name = game.i18n.format('FANTIK-AUTOMATIONS.Manager.ItemMenuLabel', {name: item.name});
                return true;
            },
            callback: li => {
                const item = itemFor(li);
                if (item) AutomationManager.open(item, detailFor(item));
            }
        };
        entryOptions.push(manageItemEntry);
    });

    Hooks.on('dnd5e.getItemContextOptions', (item, menuItems) => {
        if (!item?.isOwner || item.pack) return;
        menuItems.push({
            name: 'FANTIK-AUTOMATIONS.Manager.MenuLabel',
            icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>',
            callback: () => AutomationManager.open(item)
        });
        if (registry.findForItem(item).length) {
            menuItems.push({
                name: game.i18n.format('FANTIK-AUTOMATIONS.Manager.ItemMenuLabel', {name: item.name}),
                icon: manageItemIcon,
                classes: manageItemClasses,
                callback: () => AutomationManager.open(item, detailFor(item))
            });
        }
    });
}
