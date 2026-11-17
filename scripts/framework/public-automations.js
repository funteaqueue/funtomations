import {MODULE_ID} from './constants.js';

const FLAG = 'publicAutomations';
const TRANSLATOR = '1d20-ua-plutonium';
const aliases = new Map();
let translationLoad;
let loadedApi;
let writes = Promise.resolve();
export const normalizeAutomationName = name => String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Read only the translator's public API; never translate or rename documents. */
export async function loadAutomationTranslations() {
    const module = game.modules?.get(TRANSLATOR);
    const api = module?.active ? module.api?.data : null;
    if (!api?.loadPack || !api.getManifest) return;
    if (translationLoad && loadedApi === api) return translationLoad;
    loadedApi = api;
    translationLoad = (async () => {
        const manifest = await api.getManifest();
        const types = ['spells', 'items', 'feats', 'optionalfeatures', 'classfeatures', 'subclassfeatures', 'backgrounds', 'races']
            .filter(type => manifest.uk?.[type]);
        const packs = await Promise.allSettled(types.map(type => api.loadPack(type)));
        aliases.clear();
        for (const pack of packs) {
            if (pack.status !== 'fulfilled') continue;
            for (const entry of pack.value.values()) {
                if (!entry.name_en || !entry.name_uk) continue;
                const names = [entry.name_en, entry.name_uk, `${entry.name_uk.trim()} (${entry.name_en})`].map(normalizeAutomationName);
                for (const name of names) {
                    const group = aliases.get(name) ?? new Set();
                    names.forEach(n => group.add(n));
                    aliases.set(name, group);
                }
            }
        }
        if (packs.some(p => p.status === 'rejected')) translationLoad = null;
    })().catch(error => {
        translationLoad = null;
        console.warn(`${MODULE_ID} | Translation matching unavailable; exact names still work`, error);
    });
    return translationLoad;
}

export function publicAutomationMatches(entry, item) {
    const current = normalizeAutomationName(item?.name);
    const published = normalizeAutomationName(entry?.name);
    if (!current || !published) return false;
    if (current === published) return true;
    // Never use a stale nameEn/original flag: a manually renamed item must not
    // inherit its former translation identity.
    if (!game.modules?.get(TRANSLATOR)?.active) return false;
    return aliases.get(current)?.has(published) === true;
}

export function publicAutomations() {
    return (game.users?.contents ?? []).flatMap(user => {
        const entries = user.getFlag(MODULE_ID, FLAG);
        if (!Array.isArray(entries)) return [];
        return entries.filter(e => typeof e?.id === 'string' && typeof e.name === 'string' && typeof e.command === 'string' && e.command.trim())
            .map(e => ({...e, authorId: user.id, author: user.name, key: `${user.id}:${e.id}`}));
    });
}

export function ownPublicAutomation(item) {
    return publicAutomations().find(e => e.authorId === game.user.id && e.sourceUuid === item?.uuid);
}

function editPublications(mutator) {
    const user = game.user;
    const result = writes.then(async () => {
        const stored = user.getFlag(MODULE_ID, FLAG);
        const entries = foundry.utils.deepClone(Array.isArray(stored) ? stored : []);
        mutator(entries);
        await user.setFlag(MODULE_ID, FLAG, entries);
    });
    writes = result.catch(() => {});
    return result;
}

export async function publishItemAutomation(item, command, publish) {
    if (!item?.isOwner || item.pack || !game.user.can('MACRO_SCRIPT')) throw new Error('Немає дозволу публікувати цей макрос.');
    if (publish && (!command.trim() || !normalizeAutomationName(item.name))) throw new Error('Для публікації потрібні назва та код.');
    await editPublications(entries => {
        const index = entries.findIndex(e => e.sourceUuid === item.uuid);
        if (!publish) { if (index >= 0) entries.splice(index, 1); return; }
        const old = index >= 0 ? entries[index] : null;
        const changed = !old || old.name !== item.name || old.command !== command;
        const entry = {id: old?.id ?? foundry.utils.randomID(), sourceUuid: item.uuid,
            name: item.name, command, revision: (old?.revision ?? 0) + (changed ? 1 : 0)};
        if (index < 0) entries.push(entry); else entries[index] = entry;
    });
}

export async function unpublishAutomation(key) {
    const entry = publicAutomations().find(e => e.key === key);
    if (!entry || entry.authorId !== game.user.id) throw new Error('Зняти публікацію може лише її автор.');
    await editPublications(entries => {
        const index = entries.findIndex(e => e.id === entry.id);
        if (index >= 0) entries.splice(index, 1);
    });
}

export function initPublicAutomations() {
    // Run after all modules have installed their ready APIs.
    Hooks.once('ready', () => { setTimeout(() => void loadAutomationTranslations(), 0); });
}
