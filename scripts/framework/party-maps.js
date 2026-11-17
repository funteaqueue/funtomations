import {MODULE_ID} from './constants.js';

const FLAG = 'partyMaps';
const MAP_FOLDER = 'assets/party-maps';
export const MAX_MAP_BYTES = 10 * 1024 * 1024;
const TYPES = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'};
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const state = user => user.getFlag(MODULE_ID, FLAG) ?? {};
const id = () => foundry.utils.randomID();
const segment = text => String(text).normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'team';
let writes = Promise.resolve();
let viewerStyles;

// A running world can still advertise an older module manifest after files were
// copied to the server. Load the viewer stylesheet before inserting its root.
function ensureViewerStyles() {
    if (viewerStyles) return viewerStyles;
    viewerStyles = new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `modules/${MODULE_ID}/styles/party-maps.css?v=0.6.4`;
        link.dataset.fantikPartyMaps = 'true';
        const timer = setTimeout(() => finish(new Error('Не вдалося завантажити стилі мап. Оновіть сторінку.')), 15000);
        const finish = error => {
            clearTimeout(timer);
            if (error) { link.remove(); viewerStyles = null; reject(error); }
            else resolve();
        };
        link.onload = () => finish();
        link.onerror = () => finish(new Error('Не вдалося завантажити стилі мап. Оновіть сторінку.'));
        document.head.append(link);
    });
    return viewerStyles;
}

// Each user writes only their own document. Foundry authenticates and broadcasts
// these updates; no privileged GM socket, client-local registry or online GM needed.
function change(mutator, user = game.user) {
    const result = writes.then(async () => {
        const data = foundry.utils.deepClone(state(user));
        await mutator(data);
        return user.setFlag(MODULE_ID, FLAG, data);
    });
    writes = result.catch(() => {});
    return result;
}

export function catalogue() {
    const teams = game.users.contents.flatMap(user => (state(user).teams ?? []).map(t => ({...t, owner: user.id})));
    return teams.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

export function library(teamId) {
    return game.users.contents.flatMap(user => (state(user).maps ?? [])
        .filter(m => m.teamId === teamId).map(m => ({...m, owner: user.id})))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

function selection(teamId) {
    return game.users.contents.map(user => ({...state(user).choices?.[teamId], userId: user.id}))
        .filter(c => c.mapId).sort((a, b) => b.order - a.order || b.userId.localeCompare(a.userId))[0];
}

export function validateMapFile(file) {
    if (!file || !file.size) throw new Error('Оберіть непорожнє зображення.');
    if (file.size > MAX_MAP_BYTES) throw new Error('Файл перевищує ліміт 10 МБ.');
    if (!TYPES[file.type]) throw new Error('Підтримуються PNG, JPEG та WebP.');
}

function checkUploadPermissions() {
    if (!game.user.can('FILES_UPLOAD')) {
        throw new Error('GM має дозволити вашій ролі завантаження файлів у налаштуваннях дозволів Foundry.');
    }
}

async function createTeam(name) {
    name = name.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) throw new Error('Назва команди: від 1 до 80 символів.');
    const existing = catalogue().find(t => t.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return joinTeam(existing.id);
    const teamId = id();
    await change(data => {
        (data.teams ??= []).push({id: teamId, name});
        data.teamId = teamId;
    });
}

async function joinTeam(teamId) {
    if (teamId && !catalogue().some(t => t.id === teamId)) throw new Error('Команда більше не існує.');
    await change(data => { data.teamId = teamId; });
}

async function chooseMap(teamId, mapId) {
    if (state(game.user).teamId !== teamId || !library(teamId).some(m => m.id === mapId)) return;
    const order = Math.max(Date.now(), (selection(teamId)?.order ?? 0) + 1);
    await change(data => { (data.choices ??= {})[teamId] = {mapId, order}; });
}

async function uploadMap(file, team) {
    validateMapFile(file);
    checkUploadPermissions();
    // Decode before sending: reject renamed/non-image files as well as broken images.
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    const mapId = id();
    const upload = new File([file], `${segment(game.world.id)}-${segment(team.id)}-${segment(file.name.replace(/\.[^.]+$/, ''))}-${mapId}.${TYPES[file.type]}`, {type: file.type});
    // Ignore legacy team.folder for new uploads; existing map.path stays intact.
    let result;
    try {
        result = await foundry.applications.apps.FilePicker.implementation.upload('data', MAP_FOLDER, upload, {}, {notify: false});
        if (!result?.path) throw new Error('Сервер не повернув шлях до файлу.');
    } catch (error) {
        throw new Error(`Не вдалося завантажити мапу. Перевірте на сервері теку Data/${MAP_FOLDER}, право запису процесу Foundry та дозвіл Upload Files. ${error.message}`);
    }
    try {
        await change(data => {
            (data.maps ??= []).push({id: mapId, teamId: team.id, name: file.name, path: result.path});
        });
    } catch (error) {
        throw new Error(`Файл завантажено, але запис бібліотеки не збережено. Шлях: ${result.path}. ${error.message}`);
    }
    await chooseMap(team.id, mapId);
}

export class PartyMapsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'fantik-party-maps', classes: ['fantik-party-maps'],
        window: {title: 'Мапи команди', frame: false, positioned: false}
    };
    static PARTS = {body: {template: `modules/${MODULE_ID}/templates/party-maps.hbs`}};
    menuOpen = false;
    settingsOpen = false;
    busy = false;
    zoom = 1;
    offset = {x: 0, y: 0};
    imageId = null;
    listeners = null;
    emptyTeam = null;

    async _renderFrame(options) {
        await ensureViewerStyles();
        const frame = await super._renderFrame(options);
        // Keep this overlay out of Foundry's flex/grid layout even during CSS refresh.
        Object.assign(frame.style, {position: 'fixed', inset: '0', width: '100vw', height: '100dvh'});
        return frame;
    }

    async _prepareContext() {
        const teams = catalogue();
        const team = teams.find(t => t.id === state(game.user).teamId);
        const maps = team ? library(team.id) : [];
        const active = maps.find(m => m.id === selection(team?.id)?.mapId) ?? maps[0];
        const emptyTeam = active ? null : (team?.id ?? '');
        if (emptyTeam !== null && this.emptyTeam !== emptyTeam) {
            this.menuOpen = true;
            this.settingsOpen = !team;
        }
        this.emptyTeam = emptyTeam;
        if (this.imageId !== active?.id) { this.zoom = 1; this.offset = {x: 0, y: 0}; this.imageId = active?.id; }
        return {
            teams: teams.map(t => ({...t, selected: t.id === team?.id})), team,
            maps: maps.map(m => ({...m, selected: m.id === active?.id})), active,
            menuOpen: this.menuOpen, settingsOpen: this.settingsOpen || !team, busy: this.busy,
            canRemove: active && (active.owner === game.user.id || game.user.isGM)
        };
    }

    async run(task) {
        if (this.busy) return;
        this.busy = true;
        // Never disable navigation/close or Foundry's retained application chrome.
        const controls = this.element?.querySelectorAll('[data-mutation]') ?? [];
        controls.forEach(el => { el.disabled = true; });
        const status = this.element?.querySelector('[role="status"]');
        if (status) status.textContent = 'Завантаження…';
        try { await task(); }
        catch (error) { console.error(`${MODULE_ID} | Party maps`, error); ui.notifications.error(error.message); }
        finally {
            this.busy = false;
            controls.forEach(el => { el.disabled = false; });
            if (this.rendered) await this.render();
        }
    }

    _onClose(options) {
        this.listeners?.abort();
        this.emptyTeam = null;
        super._onClose(options);
    }

    _onRender(context, options) {
        super._onRender(context, options);
        // Handlebars can retain DOM nodes between renders. Remove old listeners first.
        this.listeners?.abort();
        this.listeners = new AbortController();
        const signal = this.listeners.signal;
        const root = this.element;
        const on = (selector, event, callback) => root.querySelectorAll(selector).forEach(el => el.addEventListener(event, callback, {signal}));
        const redraw = () => this.render();
        on('[data-close]', 'click', () => this.close());
        on('[data-menu]', 'click', () => { this.menuOpen = !this.menuOpen; this.settingsOpen = false; redraw(); });
        on('[data-settings]', 'click', () => { this.settingsOpen = !this.settingsOpen; redraw(); });
        on('[data-open-settings]', 'click', () => { this.menuOpen = this.settingsOpen = true; redraw(); });
        on('[data-team]', 'change', event => this.run(async () => {
            await joinTeam(event.target.value);
            this.menuOpen = true;
            this.settingsOpen = false;
        }));
        on('[data-map-id]', 'click', event => this.run(async () => {
            await chooseMap(context.team.id, event.currentTarget.dataset.mapId);
            this.menuOpen = false;
        }));
        on('[data-create]', 'click', () => this.run(async () => {
            await createTeam(root.querySelector('[data-name]').value);
            this.settingsOpen = false;
        }));
        on('[data-upload]', 'click', () => {
            const input = root.querySelector('[data-file]');
            input.disabled = false;
            input.value = ''; // The same local file can be selected again.
            input.click();
        });
        on('[data-file]', 'change', event => {
            const file = event.target.files[0];
            event.target.value = '';
            if (file) this.run(() => uploadMap(file, context.team));
        });
        on('[data-remove]', 'click', () => this.run(async () => {
            const accepted = await foundry.applications.api.DialogV2.confirm({window: {title: 'Прибрати мапу?'}, content: '<p>Прибрати мапу з бібліотеки команди? Файл залишиться в assets.</p>'});
            if (!accepted) return;
            const owner = game.users.get(context.active.owner);
            if (owner.id !== game.user.id && !game.user.isGM) return;
            await change(data => { data.maps = (data.maps ?? []).filter(m => m.id !== context.active.id); }, owner);
        }));
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || foundry.applications.instances.get(this.id) !== this) return;
            // Leave a confirmation dialog above this viewer in control of Escape.
            if (document.querySelector('dialog[open]')) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (this.menuOpen) { this.menuOpen = false; redraw(); }
            else this.close();
        }, {capture: true, signal});
        const viewport = root.querySelector('.fpm-viewport');
        viewport.addEventListener('pointerdown', () => {
            if (this.menuOpen) { this.menuOpen = false; redraw(); }
        }, {signal});
        const img = viewport.querySelector('img');
        if (!img) return;
        const transform = () => { img.style.transform = `translate(${this.offset.x}px, ${this.offset.y}px) scale(${this.zoom})`; };
        transform();
        const fail = () => {
            const message = document.createElement('p');
            message.textContent = 'Не вдалося відкрити зображення. Виберіть іншу мапу в меню.';
            viewport.replaceChildren(message);
        };
        img.addEventListener('error', fail, {signal});
        if (img.complete && !img.naturalWidth) fail();
        const fit = () => { this.zoom = 1; this.offset = {x: 0, y: 0}; transform(); };
        on('[data-fit]', 'click', fit);
        viewport.addEventListener('dblclick', fit, {signal});
        viewport.addEventListener('wheel', event => {
            event.preventDefault(); event.stopPropagation();
            const previous = this.zoom;
            this.zoom = Math.min(12, Math.max(0.25, previous * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
            const rect = viewport.getBoundingClientRect();
            const x = event.clientX - rect.left - rect.width / 2;
            const y = event.clientY - rect.top - rect.height / 2;
            const ratio = this.zoom / previous;
            this.offset = {x: x - (x - this.offset.x) * ratio, y: y - (y - this.offset.y) * ratio};
            transform();
        }, {passive: false, signal});
        let drag;
        viewport.addEventListener('pointerdown', event => {
            if (event.button !== 0 || this.menuOpen) return;
            drag = {x: event.clientX - this.offset.x, y: event.clientY - this.offset.y};
            viewport.setPointerCapture(event.pointerId);
        }, {signal});
        viewport.addEventListener('pointermove', event => {
            if (!drag) return;
            this.offset = {x: event.clientX - drag.x, y: event.clientY - drag.y}; transform();
        }, {signal});
        viewport.addEventListener('pointerup', () => { drag = null; }, {signal});
        viewport.addEventListener('lostpointercapture', () => { drag = null; }, {signal});
    }
}

function open() {
    const app = foundry.applications.instances.get('fantik-party-maps') ?? new PartyMapsApp();
    return app.render({force: true}).catch(error => {
        console.error(`${MODULE_ID} | Party maps`, error);
        ui.notifications.error(error.message);
    });
}
export const partyMaps = {open};

export function initPartyMaps() {
    game.settings.registerMenu(MODULE_ID, 'partyMaps', {
        name: 'Мапи команд', label: 'Відкрити мапи', hint: 'Команда, бібліотека мап і завантаження до 10 МБ.',
        icon: 'fa-solid fa-map', type: PartyMapsApp, restricted: false
    });
    game.keybindings.register(MODULE_ID, 'partyMaps', {
        name: 'Мапа команди', hint: 'Відкрити або закрити мапу своєї команди.',
        editable: [{key: 'KeyM'}], repeat: false,
        onDown: context => {
            const target = context.event?.target;
            if (!game.ready || target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return false;
            const app = foundry.applications.instances.get('fantik-party-maps');
            if (app?.rendered) app.close();
            else open();
            return true;
        }
    });
    const refresh = () => {
        const app = foundry.applications.instances.get('fantik-party-maps');
        if (app?.rendered && !app.busy) app.render();
    };
    Hooks.on('updateUser', (user, changes) => {
        if (Object.keys(changes).some(key => key === 'flags' || key.startsWith(`flags.${MODULE_ID}`))) refresh();
    });
    Hooks.on('deleteUser', refresh);
}
