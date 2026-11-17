const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../assets/eldritch-blast.js'), 'utf8');

function setup(level, {animation = true, attackNatural = 12, staleLock = false,
  targetFailure = false, cursorFailure = false, d20Results = null} = {}) {
  const listeners = new Map(), hooks = new Map(), messages = [], effects = [], warnings = [];
  let hud, targets = ['old'];
  const fields = new Map();
  function element() {
    return {style: {}, addEventListener(type, fn) {this[type] = fn;}, setAttribute() {},
      remove() {this.removed = true;}, querySelector(key) {
        if (!fields.has(key)) fields.set(key, {...element(), value: ({
          '[name="attack"]': '@bonus', '[name="damage"]': '3',
          '[name="mode"]': 'normal', '[name="color"]': 'purple'
        })[key] ?? ''});
        return fields.get(key);
      }};
  }
  const actor = {isOwner: true, items: [], system: {details: {level},
    attributes: {spell: {attack: 5}}, abilities: {cha: {mod: 3}}}};
  function token(id, x, ownActor = null) {
    return {id, name: id === 'a' ? '<Goblin>' : id, visible: true, center: {x, y: 0},
      bounds: {contains: px => px === x}, document: {sort: 0},
      actor: ownActor ?? {system: {attributes: {ac: {value: 14}}}}};
  }
  const caster = token('caster', 0, actor), a = token('a', 1), b = token('b', 2), old = token('old', 3);
  const tokens = [caster, a, b, old];
  const board = {style: {cursor: 'grab'}};
  const context = vm.createContext({console, Symbol, Set, Map, Number, Math, Promise,
    ui: {notifications: {warn: x => warnings.push(x), error: x => warnings.push(x)}},
    canvas: {ready: true, scene: {id: 'scene'}, grid: {size: 100},
      app: {canvas: board, renderer: {events: {cursorStyles: {default: 'auto', pointer: 'pointer'},
        setCursor(mode) {if (cursorFailure && mode === 'default') throw new Error('cursor cleanup failed');}}}},
      tokens: {controlled: [caster], placeables: tokens, get: id => tokens.find(t => t.id === id),
        setTargets(ids, options) {
          assert.equal(options.mode, 'replace');
          if (targetFailure) throw new Error('target API failed');
          targets = ids;
        }},
      canvasCoordinatesFromClient: p => p},
    // Foundry 14 has no game.user.updateTokenTargets().
    game: {user: {targets: [old]},
      modules: {get: () => ({active: animation})}, settings: {get: () => 'publicroll'}},
    foundry: {utils: {randomID: () => 'test'}},
    document: {createElement: () => (hud = element()), body: {append() {}},
      getElementById: () => hud && !hud.removed ? hud : null},
    window: {addEventListener: (k, f) => listeners.set(k, f), removeEventListener: k => listeners.delete(k)},
    Hooks: {on: (k, f) => {hooks.set(k, f); return k;}, off: k => hooks.delete(k)},
    Roll: class {
      constructor(formula, data) {this.formula = formula; this.data = data;}
      static validate(s) {return s !== 'invalid';}
      async evaluate() {
        const attack = this.formula.includes('d20');
        this.total = attack ? attackNatural + 5 : 9;
        this.dice = [{faces: attack ? 20 : 10, results: attack && d20Results ? d20Results : [{active: true, result: attack ? attackNatural : 6}]}];
        return this;
      }
      toAnchor({attrs} = {}) {return {outerHTML: `<a style="${attrs?.style ?? ''}">roll</a>`};}
    },
    ChatMessage: {getSpeaker: () => ({}), applyMode() {}, create: async m => messages.push(m)},
    Sequencer: {Database: {getEntry: () => true}},
    Sequence: class {
      effect() {effects.push({}); return this;}
      file() {return this;}
      atLocation(p) {effects.at(-1).origin = p; return this;}
      stretchTo(t) {effects.at(-1).target = t.id; return this;}
      missed(v) {effects.at(-1).missed = v; return this;}
      syncGroup(v) {effects.at(-1).sync = v; return this;}
      async play() {}
    }
  });
  // Match Foundry's macro wrapper, including its predefined actor/token parameters.
  if (staleLock) vm.runInContext('globalThis[Symbol.for("fantik.eldritchBlast.running")] = true', context);
  const rerun = () => vm.runInContext(`(async (speaker, actor, token, character, scope) => {{${source}\n}})()`, context);
  const run = rerun();
  const click = x => listeners.get('pointerdown')?.({target: board, button: 0,
    clientX: x, clientY: 0, preventDefault() {}, stopImmediatePropagation() {}});
  const key = key => listeners.get('keydown')?.({key, target: {}, preventDefault() {}, stopImmediatePropagation() {}});
  return {run, rerun, click, key, listeners, hooks, messages, effects, warnings, fields, board,
    locked: () => vm.runInContext('Boolean(globalThis[Symbol.for("fantik.eldritchBlast.running")])', context),
    get hud() {return hud;}, get targets() {return targets;}};
}

for (const [level, beams] of [[1, 1], [4, 1], [5, 2], [10, 2], [11, 3], [16, 3], [17, 4], [20, 4]]) {
  test(`level ${level}: ${beams} repeated target clicks, separate rolls, simultaneous effects`, async () => {
    const s = setup(level);
    s.click(999); // Empty ground does not consume a beam.
    s.click(0); // Caster does not consume a beam.
    for (let i = 0; i < beams - 1; i++) s.click(1);
    assert.equal(s.messages.length, 0);
    assert.ok(s.listeners.has('pointerdown'));
    s.click(1);
    await s.run;
    assert.equal(s.messages.length, 1);
    assert.equal(s.messages[0].rolls.length, beams * 2);
    assert.equal(s.effects.length, beams);
    assert.ok(s.effects.every(e => e.target === 'a'));
    assert.equal(new Set(s.effects.map(e => e.sync)).size, 1);
    assert.equal(new Set(s.effects.map(e => e.origin.y)).size, beams);
    assert.match(s.messages[0].content, /&lt;Goblin&gt;/);
    assert.equal(s.listeners.size, 0);
    assert.equal(s.hooks.size, 0);
    assert.equal(s.board.style.cursor, 'grab');
    assert.equal(JSON.stringify(s.targets), '["old"]');
  });
}

test('undo and per-beam advantage retain correct assignments', async () => {
  const s = setup(11);
  s.hud.querySelector('[name="mode"]').value = 'adv';
  s.click(1);
  s.click(2);
  s.key('Backspace');
  s.fields.get('[name="mode"]').value = 'dis';
  s.click(1);
  s.click(2);
  await s.run;
  assert.equal(s.effects.map(e => e.target).join(','), 'a,a,b');
  assert.match(s.messages[0].rolls[0].formula, /2d20kh1/);
  assert.match(s.messages[0].rolls[2].formula, /2d20kl1/);
});

test('Esc cancels without attacks and cleans up', async () => {
  const s = setup(5);
  s.click(1);
  s.key('Escape');
  await s.run;
  assert.equal(s.messages.length, 0);
  assert.equal(s.effects.length, 0);
  assert.equal(s.listeners.size, 0);
  assert.equal(s.hooks.size, 0);
  assert.equal(s.hud.removed, true);
  assert.equal(JSON.stringify(s.targets), '["old"]');
});

test('scene teardown cancels the picker', async () => {
  const s = setup(5);
  s.hooks.get('canvasTearDown')();
  await s.run;
  assert.equal(s.messages.length, 0);
  assert.equal(s.listeners.size, 0);
});

test('missing Sequencer preserves chat rolls', async () => {
  const s = setup(5, {animation: false});
  s.click(1); s.click(2);
  await s.run;
  assert.equal(s.messages[0].rolls.length, 4);
  assert.equal(s.effects.length, 0);
  assert.equal(s.warnings.length, 1);
});

test('critical doubles only dice; natural one still shows damage without hit labels', async () => {
  const crit = setup(1, {attackNatural: 20});
  crit.click(1); await crit.run;
  assert.equal(crit.messages[0].rolls[1].formula, '2d10 + @bonus');
  assert.equal(crit.messages[0].rolls[1].data.bonus, 3);
  const miss = setup(1, {attackNatural: 1});
  miss.click(1); await miss.run;
  assert.equal(miss.effects[0].missed, undefined);
  assert.equal(miss.messages[0].rolls.length, 2);
  assert.equal(miss.messages[0].rolls[1].formula, '1d10 + @bonus');
  assert.doesNotMatch(miss.messages[0].content, /Влучання|Промах|Перевірте КБ/);
  assert.doesNotMatch(crit.messages[0].content, /Влучання|Промах|Крит!/);
});

test('recovers the original stale boolean lock without a reload', async () => {
  const s = setup(1, {staleLock: true});
  s.click(1); await s.run;
  assert.equal(s.messages.length, 1);
  assert.equal(s.locked(), false);
});

test('advantage shows both d20s and highlights the kept 20 in green', async () => {
  const s = setup(1, {d20Results: [{result:1,active:false,discarded:true},{result:20,active:true}]});
  s.hud.querySelector('[name="mode"]').value = 'adv';
  s.click(1); await s.run;
  const html = s.messages[0].content;
  assert.match(html, /data-d20="1" data-discarded="true"[^>]*color:#ff9393;[^>]*line-through/);
  assert.match(html, /data-d20="20" data-discarded="false"[^>]*color:#94e0a2/);
  assert.match(html, /<a style="[^"]*color:#94e0a2/);
  assert.equal(s.messages[0].rolls[1].formula, '2d10 + @bonus');
});

test('disadvantage keeps the red 1; discarded 20 does not double damage', async () => {
  const s = setup(1, {d20Results: [{result:20,active:false,discarded:true},{result:1,active:true}]});
  s.hud.querySelector('[name="mode"]').value = 'dis';
  s.click(1); await s.run;
  const html = s.messages[0].content;
  assert.match(html, /data-d20="20" data-discarded="true"[^>]*color:#94e0a2;[^>]*line-through/);
  assert.match(html, /data-d20="1" data-discarded="false"[^>]*color:#ff9393/);
  assert.match(html, /<a style="[^"]*color:#ff9393/);
  assert.equal(s.messages[0].rolls[1].formula, '1d10 + @bonus');
});

test('target selection and restoration failures still release the lock', async () => {
  const s = setup(5, {targetFailure: true});
  await s.run;
  assert.equal(s.locked(), false);
  assert.equal(s.listeners.size, 0);
  assert.equal(s.hooks.size, 0);
  assert.equal(s.hud.removed, true);
  assert.match(s.warnings.join(' '), /target API failed/);
});

test('cursor cleanup failure still settles picker and releases lock', async () => {
  const s = setup(5, {cursorFailure: true});
  s.key('Escape'); await s.run;
  assert.equal(s.locked(), false);
  assert.equal(s.listeners.size, 0);
  assert.equal(s.hooks.size, 0);
});

test('running again cancels old picks and creates exactly one new picker', async () => {
  const s = setup(5);
  s.click(1);
  const second = s.rerun();
  await s.run;
  await Promise.resolve();
  assert.equal(s.messages.length, 0);
  assert.equal(s.listeners.size, 2);
  s.click(2); s.click(2);
  await second;
  assert.equal(s.messages.length, 1);
  assert.equal(s.effects.map(e => e.target).join(','), 'b,b');
  assert.equal(s.locked(), false);
});
