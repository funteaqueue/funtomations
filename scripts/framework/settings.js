import {MODULE_ID} from './constants.js';
import {registry} from './registry.js';

export function registerAutomationSettings() {
    // Per-player kill switch for the player's OWN item/spell/feat automations.
    // Does not touch effect-scope routing (markers other casters placed) or
    // framework features (vision compat, target picker, status effects).
    game.settings.register(MODULE_ID, 'disableOwnAutomations', {
        name: 'FANTIK-AUTOMATIONS.Settings.DisableOwn.Name',
        hint: 'FANTIK-AUTOMATIONS.Settings.DisableOwn.Hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false
    });

    for (const automation of registry.all()) {
        game.settings.register(MODULE_ID, `enabled-${automation.id}`, {
            name: automation.name,
            hint: `Enable the "${automation.name}" automation (v${automation.version ?? '?'}).`,
            scope: 'world',
            config: true,
            type: Boolean,
            default: true
        });
    }
}
