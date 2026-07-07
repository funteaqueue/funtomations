import {MODULE_ID} from './constants.js';

/**
 * An automation definition:
 * {
 *     id: 'gamblersBlade',                       // unique key, used for settings and item flags
 *     name: "Gambler's Blade",                   // human readable name
 *     description: 'What it does, one or two sentences (shown in the manager UI)',
 *     version: '1.0.0',
 *     selectable: true,                          // optional (default true): show in the "Manage Automations"
 *                                                // UI for manual apply/remove; false = name matching only
 *     gmOnly: false,                             // optional (default false): only a GM may apply/remove it
 *                                                // (players still see it on their items, read-only)
 *     settings: [                                // optional per-item settings, edited in the manager UI
 *         {key: 'multiplier', name: 'Multiplier', hint: '...', type: 'number', default: 2, min: 1, max: 10, step: 1},
 *         {key: 'silent', name: 'Silent mode', type: 'checkbox', default: false},
 *         {key: 'mode', name: 'Mode', type: 'select', default: 'a', choices: {a: 'Option A', b: 'Option B'}},
 *         {key: 'label', name: 'Label', type: 'text', default: ''}
 *     ],                                         // keys must be simple identifiers (no dots)
 *                                                // values arrive in handler context as context.settings
 *     match: {
 *         itemNames: ["Gambler's Blade"],        // item scope: the item that triggered the event matches
 *         actorItemNames: ['Some Feature']       // actor scope: the acting actor OWNS a matching item
 *     },                                         // (all name matching is case-insensitive)
 *     events: [                                  // trigger handlers, see triggers.js for event names
 *         {event: 'damageRollComplete', handler: async (context) => {...}, priority: 50,
 *          scopes: ['item']}                     // optional: which match scopes may route this event
 *                                                // to this handler — 'item' (the triggering item
 *                                                // matched), 'actor' (the acting actor matched),
 *                                                // 'effect' (a module-flagged marker on an involved
 *                                                // actor matched). Omitted = any scope (legacy).
 *                                                // Item-lifecycle handlers (cast, own attack/damage)
 *                                                // should declare ['item'] so a marker its automation
 *                                                // placed on an actor does NOT route that actor's
 *                                                // unrelated casts/rolls into them; marker-driven
 *                                                // handlers should declare ['effect'].
 *     ],
 *     init: () => {}                             // optional, runs once at init (register sockets, etc.)
 * }
 *
 * Items can also be bound explicitly (the "Manage Automations" item context menu writes these):
 *     item flag 'automations'          string[]  automations applied regardless of name
 *     item flag 'disabledAutomations'  string[]  name-matched automations explicitly removed
 * Legacy single-binding flag 'automation' ('someId' | 'none') is still honored.
 *
 * Actors can be bound to actor-scoped automations regardless of owned items:
 *     actor.setFlag('fantik-automations', 'automations', ['incomprehensibleMagicalEffect'])
 *
 * Effect scope: events that involve other actors (attack/save rolls) also match any
 * automation whose id appears as a truthy flag key under flags['fantik-automations']
 * on an active effect of an involved actor. Automations opt in simply by flagging the
 * marker effects they create:
 *     flags: {[MODULE_ID]: {chillTouch: true}}
 * so the marked actor's later rolls route back to the automation that marked it.
 */
class AutomationRegistry {
    #automations = new Map();

    register(automation) {
        if (!automation?.id || !automation?.name) {
            console.error(`${MODULE_ID} | Invalid automation definition, "id" and "name" are required`, automation);
            return;
        }
        if (this.#automations.has(automation.id)) {
            console.warn(`${MODULE_ID} | Automation "${automation.id}" registered twice, overwriting`);
        }
        this.#automations.set(automation.id, automation);
    }

    get(id) {
        return this.#automations.get(id);
    }

    all() {
        return [...this.#automations.values()];
    }

    isEnabled(id) {
        try {
            return game.settings.get(MODULE_ID, `enabled-${id}`);
        } catch {
            return false;
        }
    }

    /**
     * Has the current user turned off automations for their own actions
     * (client-scoped setting)? Gates item/actor scope in handlersForEvent only:
     * effect-scope routing keeps working so markers other casters placed on this
     * user's actors still apply, and framework features are unaffected.
     */
    ownAutomationsDisabled() {
        try {
            return game.settings.get(MODULE_ID, 'disableOwnAutomations');
        } catch {
            return false;
        }
    }

    /** Is this automation offered for manual apply/remove in the manager UI? */
    isSelectable(automation) {
        return automation?.selectable !== false;
    }

    /** May the current user apply/remove this automation? */
    canManage(automation) {
        return !automation?.gmOnly || game.user.isGM;
    }

    /**
     * Does an automation's item-scope name matching apply to this item?
     * "Contains" matching: renamed items like "Gambler's Blade, Pact Weapon" still match.
     * @param {object} automation
     * @param {Item} item
     * @returns {boolean}
     */
    matchesItemName(automation, item) {
        const itemName = (item?.name ?? '').toLowerCase();
        const names = automation.match?.itemNames ?? [];
        return names.some(name => itemName.includes(name.toLowerCase().trim()));
    }

    /**
     * Read an item's explicit automation bindings from flags, folding the legacy
     * single-binding 'automation' flag ('someId' | 'none') into the new model.
     * @param {Item} item
     * @returns {{added: Set<string>, removed: Set<string>, suppressNameMatching: boolean}}
     */
    getItemBindings(item) {
        const added = new Set(item?.getFlag?.(MODULE_ID, 'automations') ?? []);
        const removed = new Set(item?.getFlag?.(MODULE_ID, 'disabledAutomations') ?? []);
        const legacy = item?.getFlag?.(MODULE_ID, 'automation');
        let suppressNameMatching = false;
        if (legacy === 'none') suppressNameMatching = true;
        else if (legacy) added.add(legacy);
        return {added, removed, suppressNameMatching};
    }

    /**
     * Find all enabled automations that apply to an item: explicit flag bindings
     * plus name matching, minus explicit removals.
     * @param {Item} item
     * @returns {object[]}
     */
    findForItem(item) {
        if (!item) return [];
        const {added, removed, suppressNameMatching} = this.getItemBindings(item);
        const matched = new Map();
        for (const id of added) {
            const automation = this.get(id);
            if (!automation) {
                console.warn(`${MODULE_ID} | Item "${item.name}" is bound to unknown automation "${id}"`);
                continue;
            }
            if (this.isEnabled(id)) matched.set(id, automation);
        }
        if (!suppressNameMatching) {
            for (const automation of this.all()) {
                if (matched.has(automation.id) || removed.has(automation.id)) continue;
                if (!this.isEnabled(automation.id)) continue;
                if (this.matchesItemName(automation, item)) matched.set(automation.id, automation);
            }
        }
        return [...matched.values()];
    }

    /**
     * Resolve an automation's per-item settings: values stored on the item's
     * 'settings.<automationId>' flag, falling back to each field's default.
     * @param {Item} item
     * @param {string} automationId
     * @returns {object}
     */
    getItemSettings(item, automationId) {
        const automation = this.get(automationId);
        const stored = item?.getFlag?.(MODULE_ID, `settings.${automationId}`) ?? {};
        const values = {};
        for (const field of automation?.settings ?? []) {
            values[field.key] = stored[field.key] ?? field.default;
        }
        return values;
    }

    /**
     * Find all enabled actor-scoped automations that apply to an actor, by explicit flag
     * binding first, then by owned-item name matching against match.actorItemNames.
     * @param {Actor} actor
     * @returns {object[]}
     */
    findForActor(actor) {
        if (!actor) return [];
        const boundIds = actor.getFlag?.(MODULE_ID, 'automations') ?? [];
        const ownedNames = actor.items.map(item => (item.name ?? '').toLowerCase());
        return this.all().filter(automation => {
            if (!this.isEnabled(automation.id)) return false;
            if (boundIds.includes(automation.id)) return true;
            const names = automation.match?.actorItemNames ?? [];
            return names.some(name => {
                const needle = name.toLowerCase().trim();
                return ownedNames.some(owned => owned.includes(needle));
            });
        });
    }

    /**
     * Find all enabled automations routed by module-flagged effects ("effect scope"):
     * an active effect on one of the given actors whose flags[MODULE_ID] object has a
     * truthy key equal to an automation id matches that automation. This is how a
     * marker placed on another actor routes that actor's later rolls back to the
     * automation that placed it.
     * @param {Actor[]} [actors]
     * @returns {object[]}
     */
    findForEffectActors(actors = []) {
        const ids = new Set();
        for (const actor of actors) {
            if (!actor) continue;
            const effects = actor.appliedEffects ?? actor.effects ?? [];
            for (const effect of effects) {
                const flags = effect.flags?.[MODULE_ID];
                if (!flags) continue;
                for (const [key, value] of Object.entries(flags)) {
                    if (value && this.#automations.has(key)) ids.add(key);
                }
            }
        }
        return [...ids].filter(id => this.isEnabled(id)).map(id => this.get(id));
    }

    /**
     * Collect event handlers from automations matching the triggering item (item scope),
     * the acting actor (actor scope), and/or module-flagged effects on involved actors
     * (effect scope), deduplicated and sorted by priority.
     * @param {string} event
     * @param {object} subjects
     * @param {Item} [subjects.item]            The item that triggered the event.
     * @param {Actor} [subjects.actor]          The actor performing the action.
     * @param {Actor[]} [subjects.effectActors] Actors whose module-flagged effects route the event.
     * @returns {{automation: object, handler: Function, priority: number}[]}
     */
    handlersForEvent(event, {item, actor, effectActors} = {}) {
        // Track WHICH scope(s) matched each automation, so event entries that
        // declare scopes only run when routed by a scope they accept — e.g. a
        // "Booming" marker on an actor must not route that actor's unrelated
        // spell casts into Booming Blade's item-lifecycle handlers.
        const matched = new Map();
        const collect = (automations, scope) => {
            for (const automation of automations) {
                const entry = matched.get(automation.id) ?? {automation, scopes: new Set()};
                entry.scopes.add(scope);
                matched.set(automation.id, entry);
            }
        };
        // Triggers dispatch only on the acting client, so item/actor scope here is
        // always the current user's own action — the per-player kill switch gates
        // exactly those. Effect scope stays live: markers other casters placed on
        // this user's actors are their automations, not this user's.
        if (!this.ownAutomationsDisabled()) {
            collect(this.findForItem(item), 'item');
            collect(this.findForActor(actor), 'actor');
        }
        collect(this.findForEffectActors(effectActors), 'effect');
        return [...matched.values()]
            .flatMap(({automation, scopes}) => (automation.events ?? [])
                .filter(entry => entry.event === event
                    && (!entry.scopes || entry.scopes.some(scope => scopes.has(scope))))
                .map(entry => ({automation, handler: entry.handler, priority: entry.priority ?? 50})))
            .sort((a, b) => a.priority - b.priority);
    }
}

export const registry = new AutomationRegistry();
