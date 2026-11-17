const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../scripts/framework/party-maps.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
function setup() {
    let sequence = 0;
    const users = ['a', 'b'].map(id => ({id, flags: {}, can: () => true,
        getFlag() { return this.flags; }, async setFlag(ns, key, data) { this.flags = structuredClone(data); }}));
    const dirs = new Set(); const uploads = []; const keys = []; const hooks = {};
    class App { async render() { this.rendered = true; return this; } }
    const root = {console, Date, File, MODULE_ID: 'fantik-automations',
        createImageBitmap: async () => ({close() {}}),
        game: {ready: true, user: users[0], users: {contents: users, get: id => users.find(u => u.id === id)},
            world: {id: 'test-world'}, settings: {registerMenu() {}}, keybindings: {register: (...args) => keys.push(args)}},
        ui: {notifications: {error() {}}}, Hooks: {on: (key, fn) => { hooks[key] = fn; }},
        foundry: {utils: {deepClone: structuredClone, randomID: () => `id${++sequence}`}, applications: {
            instances: new Map(), api: {ApplicationV2: App, HandlebarsApplicationMixin: cls => cls}, apps: {FilePicker: {implementation: {
                browse: async () => { throw new Error('Unexpected browse'); }, createDirectory: async () => { throw new Error('Directory creation forbidden'); },
                upload: async (source, folder, file) => { uploads.push({folder, file}); return {path: `${folder}/${file.name}`}; }
            }}}
        }}
    };
    vm.runInNewContext(source + '\nglobalThis.api={validateMapFile,createTeam,joinTeam,uploadMap,chooseMap,catalogue,library,selection,initPartyMaps,PartyMapsApp};', root);
    return {root, users, dirs, uploads, keys, hooks, api: root.api};
}
test('10 MiB boundary, empty files and unsupported formats are rejected before upload', () => {
    const {api} = setup();
    assert.doesNotThrow(() => api.validateMapFile({size: 10 * 1024 * 1024, type: 'image/png'}));
    assert.throws(() => api.validateMapFile({size: 10 * 1024 * 1024 + 1, type: 'image/png'}), /10 МБ/);
    assert.throws(() => api.validateMapFile({size: 0, type: 'image/png'}), /непорожнє/);
    assert.throws(() => api.validateMapFile({size: 100, type: 'image/svg+xml'}), /PNG/);
});
test('teams need no filesystem access; membership survives reload and switching', async () => {
    const {api, users, root, dirs} = setup();
    await api.createTeam('../ Герої / ночі');
    const team = api.catalogue()[0];
    assert.equal(team.folder, undefined); assert.equal(dirs.size, 0);
    root.game.user = users[1]; await api.createTeam('../ Герої / ночі');
    assert.equal(api.catalogue().length, 1); assert.equal(users[1].flags.teamId, team.id);
    const reloaded = setup(); reloaded.users[0].flags = structuredClone(users[0].flags);
    assert.equal(reloaded.api.catalogue()[0].id, team.id);
    await api.joinTeam(''); assert.equal(api.catalogue().length, 1);
    await assert.rejects(api.joinTeam('missing'), /не існує/);
});
test('two players contribute without overwriting each other, share active map; files get unique names', async () => {
    const {api, root, users, uploads} = setup();
    await api.createTeam('Команда'); const team = api.catalogue()[0];
    const file = new File(['image'], 'map.png', {type: 'image/png'});
    await api.uploadMap(file, team);
    root.game.user = users[1]; await api.joinTeam(team.id); await api.uploadMap(file, team);
    const maps = api.library(team.id); assert.equal(maps.length, 2);
    assert.notEqual(uploads[0].file.name, uploads[1].file.name);
    await api.chooseMap(team.id, maps[1].id);
    root.game.user = users[0]; assert.equal(api.selection(team.id).mapId, maps[1].id);
    const context = await new api.PartyMapsApp()._prepareContext();
    assert.equal(context.active.id, maps[1].id);
    await api.createTeam('Інша'); assert.equal(api.library(users[0].flags.teamId).length, 0);
    assert.equal(api.library(team.id).length, 2);
});
test('permission failure and upload failure never create misleading library records', async () => {
    const {api, root, users, uploads} = setup();
    users[0].can = () => false;
    await api.createTeam('Team'); const team = api.catalogue()[0];
    await assert.rejects(api.uploadMap(new File(['x'], 'x.png', {type: 'image/png'}), team), /GM/);
    assert.equal(uploads.length, 0);
    users[0].can = () => true;
    await assert.rejects(api.uploadMap({size: 10485761, type: 'image/png'}, team), /10 МБ/);
    assert.equal(uploads.length, 0);
    root.foundry.applications.apps.FilePicker.implementation.upload = async () => false;
    await assert.rejects(api.uploadMap(new File(['x'], 'x.png', {type: 'image/png'}), team), /Не вдалося/);
    assert.equal(api.library(team.id).length, 0);
});
test('hotkey registers during init, ignores text inputs, and toggles the existing window', () => {
    const {api, keys, root} = setup(); api.initPartyMaps(); const binding = keys[0][2];
    assert.equal(binding.editable[0].key, 'KeyM'); assert.equal(binding.repeat, false);
    assert.equal(binding.onDown({event: {target: {closest: () => true}}}), false);
    let closed = false; root.foundry.applications.instances.set('fantik-party-maps', {rendered: true, close() {closed = true;}});
    assert.equal(binding.onDown({}), true); assert.equal(closed, true);
});

 test('second upload by the same user preserves the first and becomes active', async () => {
    const {api, users} = setup();
    await api.createTeam('Team'); const team = api.catalogue()[0];
    await api.uploadMap(new File(['first'], 'same.png', {type: 'image/png'}), team);
    const first = users[0].flags.maps[0].id;
    await api.uploadMap(new File(['second'], 'same.png', {type: 'image/png'}), team);
    assert.equal(users[0].flags.maps.length, 2);
    assert.equal(users[0].flags.maps[0].id, first);
    assert.equal(api.selection(team.id).mapId, users[0].flags.maps[1].id);
 });
 test('mutation controls recover after failures; close controls are never disabled', async () => {
    const {api} = setup(); const app = new api.PartyMapsApp();
    const upload = {disabled:false}; const close = {disabled:false};
    app.element = {querySelectorAll: selector => {
        assert.equal(selector, '[data-mutation]'); return [upload];
    }, querySelector: () => ({textContent:''})};
    app.rendered = true;
    await app.run(async () => { assert.equal(upload.disabled,true); assert.equal(close.disabled,false); throw new Error('Expected failure'); });
    assert.equal(upload.disabled,false); assert.equal(app.busy,false);
    let second = false; await app.run(async () => {second=true;}); assert.equal(second,true);
 });

test('missing team opens settings immediately; a populated library stays hidden', async () => {
    const {api} = setup();
    const empty = new api.PartyMapsApp();
    const first = await empty._prepareContext();
    assert.equal(first.menuOpen,true);assert.equal(first.settingsOpen,true);
    // Escape can still dismiss the menu; rerender must not reopen it continuously.
    empty.menuOpen=false;
    assert.equal((await empty._prepareContext()).menuOpen,false);
    await api.createTeam('Team'); const team=api.catalogue()[0];
    const noMaps=await new api.PartyMapsApp()._prepareContext();
    assert.equal(noMaps.menuOpen,true);assert.equal(noMaps.settingsOpen,false);
    // Reuse the original window: joining must leave setup for the empty library.
    const joined = await empty._prepareContext();
    assert.equal(joined.menuOpen,true);assert.equal(joined.settingsOpen,false);
    empty.settingsOpen = true;
    assert.equal((await empty._prepareContext()).settingsOpen,true);
    await api.uploadMap(new File(['x'],'map.png',{type:'image/png'}),team);
    const populated=await new api.PartyMapsApp()._prepareContext();
    assert.equal(populated.menuOpen,false);assert.equal(populated.settingsOpen,false);
});

test('legacy and new teams upload into the shared folder, without browse or mkdir; old maps remain', async () => {
    const {api, users, uploads} = setup();
    users[0].flags = {teamId:'legacy', teams:[{id:'legacy',name:'Old',folder:'assets/party-maps/old/team'}], maps:[{id:'old-map',teamId:'legacy',name:'Old.png',path:'assets/party-maps/old/team/old.png'}]};
    users[0].can = permission => permission === 'FILES_UPLOAD';
    await api.uploadMap(new File(['x'], 'map.png', {type:'image/png'}), api.catalogue()[0]);
    assert.equal(uploads[0].folder,'assets/party-maps');
    assert.equal(api.library('legacy').length,2);
    assert.equal(api.library('legacy').find(m=>m.id==='old-map').path,'assets/party-maps/old/team/old.png');
    await api.createTeam('New'); const team=api.catalogue().find(t=>t.name==='New');
    await api.uploadMap(new File(['x'], 'map.png', {type:'image/png'}),team);
    assert.equal(uploads[1].folder,'assets/party-maps');
    assert.notEqual(uploads[0].file.name,uploads[1].file.name);
    assert.equal(api.library(team.id).length,1);
});
test('server upload errors identify shared folder setup and leave the library unchanged', async () => {
    const {api,root} = setup(); await api.createTeam('Team'); const team=api.catalogue()[0];
    root.foundry.applications.apps.FilePicker.implementation.upload=async()=>{throw new Error('ENOENT');};
    await assert.rejects(api.uploadMap(new File(['x'],'map.png',{type:'image/png'}),team), /Data\/assets\/party-maps.*ENOENT/);
    assert.equal(api.library(team.id).length,0);
});
