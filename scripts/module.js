import {MODULE_ID} from './framework/constants.js';
import {registry} from './framework/registry.js';
import {initSockets, registerSocketHandler, emitToOthers} from './framework/sockets.js';
import {initTriggers} from './framework/triggers.js';
import {registerAutomationSettings} from './framework/settings.js';
import {initAutomationManager, AutomationManager} from './framework/manager.js';
import {registerVision5eCompatSettings, initVision5eCompat} from './framework/compat/vision5e.js';
import {registerTargetPromptSetting, initTurnTargetClearing} from './framework/target-picker.js';
import {registerPlutoniumPasteSetting, initPlutoniumPaste} from './framework/plutonium-paste.js';
import {initSpellCards, spellCards} from './framework/spell-cards.js';
import {initSerpentTongue, serpentTongue} from './framework/serpent-tongue.js';
import {initItemMacros, installItemMacroUseWrapper} from './framework/item-macros.js';
import {initPartyMaps, partyMaps} from './framework/party-maps.js';
import {initPublicAutomations} from './framework/public-automations.js';
import {initAlternativeTokens, openAlternativeTokens} from './framework/alternative-tokens.js';
import * as utils from './framework/utils.js';
import {allAutomations} from './automations/_index.js';

Hooks.once('init', () => {
    allAutomations.forEach(automation => registry.register(automation));

    // Extension point: world scripts and other modules can register their own automations here.
    Hooks.callAll(`${MODULE_ID}.register`, registry);

    registerAutomationSettings();
    registerTargetPromptSetting();
    registerVision5eCompatSettings();
    registerPlutoniumPasteSetting();
    initSockets();
    initSpellCards();
    initSerpentTongue();
    utils.initFrameworkRelays();
    initAutomationManager();
    initItemMacros();
    initPublicAutomations();
    initPartyMaps();
    initAlternativeTokens();

    for (const automation of registry.all()) {
        try {
            automation.init?.();
        } catch (error) {
            console.error(`${MODULE_ID} | Automation "${automation.id}" failed to init`, error);
        }
    }
});

Hooks.once('ready', () => {
    installItemMacroUseWrapper();
    initTriggers();
    initTurnTargetClearing();
    initVision5eCompat();
    initPlutoniumPaste();
    game.modules.get(MODULE_ID).api = {
        registry,
        AutomationManager,
        sockets: {registerSocketHandler, emitToOthers},
        spellCards,
        serpentTongue,
        partyMaps,
        alternativeTokens: {open: openAlternativeTokens},
        utils
    };
    console.log(`${MODULE_ID} | Ready with ${registry.all().length} automation(s): ${registry.all().map(a => a.id).join(', ')}`);
});
