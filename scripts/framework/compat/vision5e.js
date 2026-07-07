import {MODULE_ID} from '../constants.js';

/**
 * Compatibility fix for Vision 5e.
 *
 * Vision 5e (as of 3.1.3) gives detection modes a priority-aware line-of-sight fallback:
 * Devil's Sight retries with priority 100 (sees through darkness sources of priority < 100),
 * but Truesight retries with priority 0 — which is blocked by EVERY darkness source, since
 * darkness blocks when its priority >= the vision priority. RAW, Truesight sees in magical
 * darkness just like Devil's Sight, and Vision 5e's own light-config hint says the same
 * ("Devil's Sight and Truesight are blocked only if the priority is at least 100").
 *
 * This patch makes the Truesight detection mode use the same priority-100 fallback as
 * Devil's Sight. Toggleable via the module setting.
 */
export function registerVision5eCompatSettings() {
    game.settings.register(MODULE_ID, 'truesightThroughDarkness', {
        name: 'Truesight sees through magical darkness',
        hint: 'Fixes Vision 5e so Truesight penetrates darkness sources with priority below 100, exactly like Devil\'s Sight (RAW). Requires a reload to change.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
}

export function initVision5eCompat() {
    if (!game.modules.get('vision-5e')?.active) return;
    if (!game.settings.get(MODULE_ID, 'truesightThroughDarkness')) return;
    const seeAll = CONFIG.Canvas.detectionModes.seeAll;
    if (!seeAll) return;

    const original = seeAll._testLOS.bind(seeAll);
    seeAll._testLOS = function (visionSource, mode, target, test) {
        if (original(visionSource, mode, target, test)) return true;
        // Same fallback Vision 5e uses for Devil's Sight: LOS computed at priority 100,
        // which ignores darkness sources with a lower priority.
        if (typeof visionSource.getLOS !== 'function') return false;
        const los = visionSource.getLOS(100);
        if (los !== visionSource.los) {
            return los.contains(test.point.x, test.point.y);
        }
        return false;
    };
    console.log(`${MODULE_ID} | Vision 5e compat: Truesight now sees through magical darkness (priority < 100)`);
}
