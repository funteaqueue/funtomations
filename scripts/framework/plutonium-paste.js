import {MODULE_ID} from './constants.js';

/**
 * Paste-to-import: paste a 5e.tools link anywhere in Foundry and import it via Plutonium.
 *
 * Pasting while pointing at (or focused inside) an open actor sheet imports onto that
 * actor; pasting anywhere else imports into the world directory, where Plutonium's own
 * folder rules apply. Creatures always import as world actors.
 *
 * Relies on Plutonium globals (DataLoader) and its public API (game.plutonium.importer),
 * the same path its Rivet browser extension uses. If Plutonium is missing or its API
 * shape changes, the feature stays inert — pasting is never blocked.
 */

const SETTING_ID = 'plutonium-paste-import';

// Pages we import from, keyed by the .html page name a 5e.tools URL carries.
// isAcceptActor mirrors Plutonium's own importer metadata: whether the entity
// can be imported onto an actor rather than into the world directory.
const PAGES = {
    'spells.html': {label: 'spell', isAcceptActor: true},
    'items.html': {label: 'item', isAcceptActor: true},
    'feats.html': {label: 'feat', isAcceptActor: true},
    'optionalfeatures.html': {label: 'optional feature', isAcceptActor: true},
    'bestiary.html': {label: 'creature', isAcceptActor: false}
};

const URL_PATTERN = /https?:\/\/(?:www\.)?5e\.tools\/([a-z][\w-]*\.html)#([^\s"'<>]+)/gi;

export function registerPlutoniumPasteSetting() {
    game.settings.register(MODULE_ID, SETTING_ID, {
        name: 'Plutonium: paste 5e.tools links to import',
        hint: 'Paste a 5e.tools link (Ctrl+V) over an actor sheet or the sidebar to import it via Plutonium. Requires the Plutonium module. Automatically disabled while 1d20-ua-plutonium is active.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });
}

export function initPlutoniumPaste() {
    // The translation module owns paste imports when enabled, avoiding duplicates.
    if (game.modules.get('1d20-ua-plutonium')?.active) return;
    if (!game.modules.get('plutonium')?.active) return;

    document.addEventListener('paste', event => {
        handlePaste(event).catch(error => {
            console.error(`${MODULE_ID} | Paste import failed`, error);
        });
    });
    console.log(`${MODULE_ID} | Plutonium paste-to-import enabled`);
}

async function handlePaste(event) {
    if (!game.settings.get(MODULE_ID, SETTING_ID)) return;

    // Never hijack a paste aimed at a text field, editor, or the chat box.
    const target = event.composedPath?.()[0] ?? event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], .ProseMirror')) return;

    const text = event.clipboardData?.getData('text/plain') ?? '';
    const links = [...text.matchAll(URL_PATTERN)]
        .map(([, page, fragment]) => ({page: page.toLowerCase(), fragment}))
        .filter(link => PAGES[link.page]);
    if (!links.length) return;

    const api = getPlutoniumApi();
    if (!globalThis.DataLoader?.pCacheAndGetHash || !api?.importer?.pGetImporter) {
        console.warn(`${MODULE_ID} | Plutonium paste: DataLoader=${!!globalThis.DataLoader}, `
            + `game.plutonium=${!!game.plutonium}, globalThis.plutonium=${!!globalThis.plutonium}, `
            + `module api=${!!game.modules.get('plutonium')?.api}, importer=${!!api?.importer}`);
        ui.notifications.warn('Plutonium import API is unavailable — cannot paste-import 5e.tools links. See console (F12) for details.');
        return;
    }

    const actor = resolveTargetActor(target);
    for (const link of links) {
        await importLink(api, link, actor);
    }
}

/**
 * Plutonium publishes its API in several places depending on version/mode;
 * take whichever is present.
 * @returns {object|null}
 */
function getPlutoniumApi() {
    return game.plutonium ?? globalThis.plutonium ?? game.modules.get('plutonium')?.api ?? null;
}

/**
 * Find the actor the paste is aimed at: the sheet containing the paste target,
 * or failing that the sheet currently under the mouse cursor.
 * @param {EventTarget} target
 * @returns {Actor|null}
 */
function resolveTargetActor(target) {
    if (target instanceof Element) {
        const actor = actorFromElement(target);
        if (actor) return actor;
    }
    // :hover matches every element under the cursor; the last one is the deepest.
    const hovered = [...document.querySelectorAll('.application:hover, .app:hover')].at(-1);
    return hovered ? actorFromElement(hovered) : null;
}

/**
 * Resolve the Foundry application that owns an element (ApplicationV2 via
 * foundry.applications.instances, legacy AppV1 via ui.windows) and return its actor.
 * @param {Element} element
 * @returns {Actor|null}
 */
function actorFromElement(element) {
    const appElement = element.closest('.application, .app');
    if (!appElement) return null;
    const app = foundry.applications?.instances?.get(appElement.id)
        ?? ui.windows?.[appElement.dataset.appid];
    const doc = app?.actor ?? app?.document;
    return doc instanceof Actor ? doc : null;
}

function safeDecodeUri(text) {
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

async function importLink(api, {page, fragment}, actor) {
    const {label, isAcceptActor} = PAGES[page];
    // A 5e.tools fragment is "<hash>[,<subhash>...]"; the hash is "<name>_<source>",
    // URI-encoded. pCacheAndGetHash derives the source from the hash itself.
    const hash = fragment.split(',')[0];
    const displayName = safeDecodeUri(hash.split('_')[0]);
    const targetActor = isAcceptActor ? actor : null;

    try {
        const entity = await DataLoader.pCacheAndGetHash(page, hash);
        if (!entity) {
            ui.notifications.warn(`Could not find ${label} "${safeDecodeUri(hash)}". Homebrew sources may need to be loaded in Plutonium first.`);
            return;
        }

        const importer = await api.importer.pGetImporter({page});
        if (!importer) {
            ui.notifications.warn(`Plutonium has no importer for "${page}".`);
            return;
        }

        const importOpts = new api.importer.ImportOpts({actor: targetActor});
        const summary = await importer.pImportEntry(entity, importOpts);
        if (summary?.doNotification) summary.doNotification();
        else ui.notifications.info(`Imported ${label} "${entity.name ?? displayName}"${targetActor ? ` to "${targetActor.name}"` : ''}.`);
    } catch (error) {
        console.error(`${MODULE_ID} | Failed to import ${label} "${displayName}" (${hash})`, error);
        ui.notifications.error(`Failed to import ${label} "${displayName}": ${error.message}`);
    }
}
