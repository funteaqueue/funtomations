// По кому подзвін — Toll the Dead. Foundry VTT 14 / dnd5e 5.3.3 and 6.x.
// Assigned character; one click to target; manual Wisdom save, native GM damage controls.
const support = game.modules.get('fantik-automations')?.api?.spellCards;
const systemVersion = game.system?.version?.split('.').map(Number) ?? [];
const modernMessages = systemVersion[0] >= 6;
const supportedSystem = game.system?.id === 'dnd5e' && (modernMessages
  || (systemVersion[0] === 5 && (systemVersion[1] > 3 || (systemVersion[1] === 3 && systemVersion[2] >= 3))));
if (!support?.getWounded || !(support.version >= 3) || !CONFIG.Dice?.DamageRoll || !supportedSystem) {
  return ui.notifications.warn('Потрібні dnd5e 5.3.3 або новіша та Fantik Automations 0.3.13+. Онови модуль і перезавантаж клієнти.');
}
const LOCK = Symbol.for('fantik.tollTheDead.running');
const prior = globalThis[LOCK];
if (prior) {
  if (typeof prior.cancel === 'function') prior.cancel();
  else return ui.notifications.warn('Подзвін ще лунає. Дочекайся завершення кидка.');
  // Allow the old invocation to restore its selection before taking a new snapshot.
  await Promise.resolve();
}
const actor = game.user.character;
if (!actor?.isOwner) return ui.notifications.warn('Признач свого персонажа в налаштуваннях користувача.');
if (!canvas?.ready) return ui.notifications.warn('Спершу відкрий сцену з ціллю.');
const level = Number(actor.system.details?.level);
if (!Number.isInteger(level) || level < 1) return ui.notifications.warn('У призначеного персонажа не знайдено загальний рівень.');
const count = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
const boundItem = typeof item !== 'undefined' ? item : null;
const matches = actor.items.filter(entry => entry.system?.identifier === 'toll-the-dead'
  || /toll the dead|по кому (?:по)?дзвін|погребальний дзвін|похоронний (?:по)?дзвін/i.test(entry.name));
const boundActivity = typeof activity !== 'undefined' ? activity : null;
let spell = boundItem ?? (matches.length === 1 ? matches[0] : null);
let saveActivity = null, healthActivities = null, defaultDC = '';
if (boundItem && boundItem.actor?.uuid !== actor.uuid) return ui.notifications.warn('Закляття має належати призначеному тобі персонажу.');
const sceneId = canvas.scene.id;
const oldTargets = [...game.user.targets].map(token => token.id);
const run = {cancel: null};
globalThis[LOCK] = run;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INK = 'light-dark(#322d37, #e9e3ec)', MUTED = 'light-dark(#6e6471, #b1a8ba)',
  GOLD = 'light-dark(#87622e, #cda76c)', PAPER = 'light-dark(#f2ede5, #201d29)';

try {
  if (!await resolveUsage()) return;
  const pairDC = healthActivities && healthActivities.full.save?.dc?.value === healthActivities.wounded.save?.dc?.value
    ? healthActivities.full.save?.dc?.value : undefined;
  const preparedDC = saveActivity?.save?.dc?.value ?? pairDC ?? actor.system.attributes?.spell?.dc ?? actor.system.attributes?.spelldc;
  defaultDC = Number.isFinite(Number(preparedDC)) && Number(preparedDC) > 0 ? Number(preparedDC) : '';
  const selected = await pickTarget();
  if (!selected) return;
  if (!canvas.ready || canvas.scene.id !== sceneId || (selected.target && !canvas.tokens.get(selected.target.id)?.actor)) {
    return ui.notifications.warn('Сцена або ціль змінилася. Вибери ціль знову.');
  }
  if (healthActivities) saveActivity = healthActivities[selected.faces === 12 ? 'wounded' : 'full'];
  if (!await consumeResources()) return;
  const roll = await new CONFIG.Dice.DamageRoll(`${count}d${selected.faces}${selected.bonus ? ` + (${selected.bonus})` : ''}`, {},
    {type:'necrotic',properties:['mgc'],isCritical:false,rollType:'damage'}).evaluate();
  const message = {
    speaker: ChatMessage.getSpeaker({actor}),
    rolls: [roll],
    content: cardHTML(selected, roll),
    flags: {'dice-so-nice': {skip: true}, 'fantik-automations': {spellCard: {kind:'toll-the-dead',version:1}}, world: {fantikTollTheDead: {
      actor: actor.uuid, target: selected.target?.document.uuid ?? null, dc: selected.dc, untargeted:!selected.target,
      ability: 'wis', damageType: 'necrotic', conditionalDamage: true
    }}}
  };
  if (modernMessages) {
    message.type = 'damage';
    message.system = {onSave:'none', targets:selected.target ? [{actor:selected.target.actor.uuid, token:selected.target.document.uuid,
      name:selected.target.name, img:selected.target.document.texture?.src}] : []};
  } else {
    // 5.3.3 uses a base message and actor UUIDs in the native damage tray.
    // Retain the token UUID too, so the GM save always uses the original token.
    message.flags.dnd5e = {messageType:'roll', roll:{type:'damage',damageOnSave:'none'},
      targets:selected.target ? [{uuid:selected.target.actor.uuid, token:selected.target.document.uuid, name:selected.target.name}] : []};
  }
  const rollMode = game.settings.get('core', 'rollMode');
  ChatMessage.applyRollMode(message, rollMode);
  const isPublic = !message.blind && !message.whisper?.length;
  const maySee = !message.blind || message.whisper.includes(game.user.id);
  // Decorative effects do not determine whether the target succeeds on its save.
  const effects = maySee && selected.target ? animateBell(selected.target, isPublic).catch(error => {
    console.warn('Toll the Dead | Bell effect unavailable', error);
  }) : Promise.resolve();
  if (game.dice3d?.showForRoll) {
    for (const die of roll.dice) {
      die.options.colorset = 'custom';
      die.options.appearance = {colorset:'custom',system:'standard',foreground:'#e4c796',
        background:'#292431',outline:'#131019',edge:'#a57a41',material:'metal',texture:'none',font:'Arial'};
    }
    const viewers = isPublic ? null : [...new Set([...message.whisper, ...(!message.blind ? [game.user.id] : [])])];
    try {
      // Dice So Nice treats [] as everyone; never use it for an empty private audience.
      if (isPublic || viewers.length) await game.dice3d.showForRoll(roll, game.user, true, viewers, !maySee);
    }
    catch (error) {
      console.warn('Toll the Dead | Dice So Nice failed', error);
      ui.notifications.warn('3D-кубики не відтворилися; результат кидка збережено.');
    }
  }
  // No guessed delay and no second roll: publish only the already evaluated dice.
  const sent = await ChatMessage.create(message);
  if (!sent) throw new Error('Не вдалося створити картку закляття.');
  await effects;
} catch (error) {
  console.error('Toll the Dead', error);
  ui.notifications.error(`По кому подзвін: ${error.message ?? error}`);
} finally {
  try {
    if (canvas.ready && canvas.scene.id === sceneId) {
      canvas.tokens.setTargets(oldTargets.filter(id => canvas.tokens.get(id)), {mode:'replace'});
    }
  } catch (error) { console.warn('Toll the Dead | Target restoration failed', error); }
  finally { if (globalThis[LOCK] === run) delete globalThis[LOCK]; }
}

async function chooseEntry(entries, title) {
  const result = await foundry.applications.api.DialogV2.wait({
    window:{title}, position:{width:360}, rejectClose:false,
    content:`<p>Обери джерело налаштованих витрат для цього запуску.</p><select name="entry" style="width:100%;">${entries.map((entry,index)=>`<option value="${index}">${esc(entry.name || entry.type || `Активність ${index+1}`)}</option>`).join('')}</select>`,
    buttons:[{action:'choose',label:'Обрати',default:true,callback:(_event,button)=>button.form.elements.entry.value},
      {action:'cancel',label:'Скасувати',callback:()=>null}]
  });
  return result == null ? null : entries[Number(result)] ?? null;
}

function healthVariant(entry) {
  const name = String(entry.name ?? '').toLowerCase();
  if (/\b(healthy|uninjured|undamaged|unwounded)\b|здоров[аиіий]|повн.*(?:hp|хп|здоров)/i.test(name)) return 'full';
  if (/\b(damaged|wounded|injured|hurt)\b|поранен|пошкоджен/i.test(name)) return 'wounded';
  const parts = Array.from(entry.damage?.parts ?? []);
  const faces = new Set(parts.map(part=>Number(part.denomination)).filter(n=>n>0));
  if (faces.size === 1 && faces.has(8)) return 'full';
  if (faces.size === 1 && faces.has(12)) return 'wounded';
  return null;
}

async function resolveUsage() {
  if (!boundItem && matches.length > 1) {
    spell = await chooseEntry(matches,'По кому подзвін · закляття');
    if (!spell) return false;
  }
  // A standalone cantrip macro need not have an Item document at all.
  if (!spell) return true;
  const activities = Array.from(spell.system.activities?.values?.() ?? Object.values(spell.system.activities ?? {}));
  const saveVariants = activities.filter(entry=>entry.type==='save');
  const variants = saveVariants.length ? saveVariants : activities;
  if (variants.length === 2) {
    const full = variants.filter(entry=>healthVariant(entry)==='full');
    const wounded = variants.filter(entry=>healthVariant(entry)==='wounded');
    if (full.length === 1 && wounded.length === 1) {
      // Healthy/Damaged are branches of one cantrip, not a second user choice.
      // Select their actual consumption only after the picker resolves health.
      healthActivities = {full:full[0],wounded:wounded[0]};
      return true;
    }
  }
  if (boundActivity?.item?.uuid === spell.uuid) saveActivity = boundActivity;
  else {
    const saves = activities.filter(entry=>entry.type==='save');
    const candidates = saves.length ? saves : activities;
    saveActivity = candidates.length === 1 ? candidates[0] : candidates.length > 1
      ? await chooseEntry(candidates,'По кому подзвін · активність') : null;
    if (candidates.length && !saveActivity) return false;
  }
  if (saveActivity) return true;
  // Imported cantrips may have no activities. Only use the cost-free path when
  // the Item has no slot, uses, recovery or legacy resource consumption configured.
  const uses = spell.system.uses ?? {};
  const max = uses.max;
  const hasUses = (max != null && String(max).trim() !== '' && Number(max) !== 0)
    || Number(uses.value) > 0 || Number(uses.spent) > 0 || !!uses.recovery?.length;
  const legacy = spell.system.consume;
  if ((spell.type && spell.type !== 'spell') || Number(spell.system.level ?? 0) !== 0 || hasUses || legacy?.target || legacy?.type) {
    throw new Error('У заклятті є налаштовані витрати, але немає активності для їх списання. Додай активність у заклятті.');
  }
  return true;
}

async function consumeResources() {
  if (!saveActivity) return true; // Standalone cantrip with no configured resource cost.
  if (typeof saveActivity._prepareUsageConfig !== 'function' || typeof saveActivity.consume !== 'function') {
    throw new Error('Не вдалося перевірити налаштовані ресурси закляття.');
  }
  const usage = saveActivity._prepareUsageConfig({create:false, concentration:false});
  if (!usage.hasConsumption) return true;
  if (saveActivity._requiresConfigurationDialog(usage)) {
    try { await saveActivity.metadata.usage.dialog.create(saveActivity, usage, {}); }
    catch { return false; } // Native dialog cancellation: no resource has been spent.
  }
  const result = await saveActivity.consume(usage, {create:false, data:{}});
  if (result === false) {
    ui.notifications.warn('Використання скасоване: ресурси не підтверджено або їх недостатньо.');
    return false;
  }
  return true;
}

function bellImage(style = '') {
  // Theme is resolved by each recipient, including recipients who never ran this macro.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 230">
    <style>:root{--ink:#514257;--metal:#a57d45;--body:#d4c3a5;--haze:#b9a9c3}@media(prefers-color-scheme:dark){:root{--ink:#baa8cc;--metal:#d6b478;--body:#5a493d;--haze:#9680b0}}</style>
    <defs><radialGradient id="halo"><stop stop-color="var(--haze)" stop-opacity=".2"/><stop offset="1" stop-color="var(--haze)" stop-opacity="0"/></radialGradient><linearGradient id="bronze"><stop stop-color="var(--body)"/><stop offset=".45" stop-color="var(--metal)" stop-opacity=".55"/><stop offset="1" stop-color="var(--body)"/></linearGradient></defs>
    <ellipse cx="130" cy="119" rx="119" ry="105" fill="url(#halo)"/>
    <g fill="none" stroke="var(--metal)" stroke-width=".8" opacity=".6"><circle cx="130" cy="117" r="91" stroke-dasharray="1 7"/><path d="M34 72Q5 119 35 162 M46 84Q26 119 47 151 M226 72Q255 119 225 162 M214 84Q234 119 213 151"/><path d="M37 203H94 M166 203H223 M130 7V22"/></g>
    <g stroke="var(--metal)" stroke-linejoin="round"><path d="M119 45V37Q119 26 130 26Q141 26 141 37V45" fill="none" stroke-width="3"/>
    <path d="M86 107Q86 55 119 51V45H141V51Q174 55 174 107L181 149Q185 160 198 166V177H62V166Q75 160 79 149Z" fill="url(#bronze)" stroke-width="1.8"/>
    <path d="M111 60Q96 75 96 111L88 153 M153 62Q166 83 165 111L172 153 M80 153H181 M84 145H177 M64 166H196" fill="none" stroke-width="1" opacity=".85"/>
    <ellipse cx="130" cy="177" rx="68" ry="8" fill="var(--ink)" stroke-width="1.6"/>
    <path d="M130 176V191" stroke-width="3"/><circle cx="130" cy="197" r="7" fill="var(--metal)"/>
    <path d="M120 105L130 94 140 105 130 116Z M130 83V94 M130 116V128 M108 105H120 M140 105H152" fill="none" stroke-width="1.1"/></g>
    <g fill="none" stroke="var(--ink)" stroke-width=".75" opacity=".6"><path d="M66 35V57 M61 42H71 M194 35V57 M189 42H199"/></g><circle cx="130" cy="218" r="1.8" fill="var(--ink)" opacity=".65"/>
  </svg>`;
  return `<img alt="Похоронний дзвін" draggable="false" src="data:image/svg+xml,${encodeURIComponent(svg)}" style="display:block;width:100%;height:auto;border:0;box-shadow:none;color-scheme:inherit;pointer-events:none;${style}">`;
}

function diceBreakdown(roll) {
  return roll.dice.map(die => `<span style="white-space:nowrap;">d${die.faces}:</span> ${die.results.map(result =>
    `<span style="${result.discarded || result.active === false ? 'text-decoration:line-through;opacity:.55;' : ''}">${esc(result.result)}</span>`).join(' + ')}`).join(' · ');
}

function cardHTML(selected, roll) {
  return `<section class="fantik-toll-card" style="color-scheme:var(--color-scheme, light);position:relative;overflow:hidden;border:1px solid light-dark(#b5a28a,#6f5b44);border-radius:110px 110px 9px 9px;background:radial-gradient(ellipse at 50% 20%,light-dark(#fff9ec,#302635),${PAPER} 65%);color:${INK};padding:24px 14px 12px;font-family:Georgia,'Times New Roman',serif;text-align:center;">
    <div style="position:absolute;inset:7px;border:1px solid light-dark(#c9b99f,#5b4a3d);border-radius:105px 105px 5px 5px;pointer-events:none;opacity:.65;"></div>
    <div style="position:relative;font-size:10px;letter-spacing:2px;color:${GOLD};margin:12px 0 0;">TOLL THE DEAD</div>
    ${bellImage('margin:0 auto;max-width:235px;')}
    <div style="position:relative;font-size:17px;line-height:1.3;overflow-wrap:anywhere;margin:0 0 9px;">${esc(selected.target?.name ?? 'Без цілі')}</div>
    <div style="display:flex;align-items:center;gap:8px;position:relative;">
      <div data-fantik-save style="flex:1;min-width:0;"><div style="font:11px/1.4 sans-serif;color:${MUTED};">Мудрість</div><div style="font-size:24px;line-height:1.2;margin-top:2px;">КС ${selected.dc}</div></div>
      <div style="flex:1;min-width:0;border-left:1px solid light-dark(#c9b99f,#64513d);"><div style="font:11px/1.4 sans-serif;color:${MUTED};">Шкода при провалі</div><div style="font-size:30px;line-height:1.1;margin-top:2px;color:${GOLD};">${esc(roll.total)}</div></div>
    </div>
    <div style="font:12px/1.5 sans-serif;color:${INK};overflow-wrap:anywhere;position:relative;margin-top:8px;">${esc(roll.formula)} · ${diceBreakdown(roll)}${selected.bonus ? ` · бонус ${selected.bonus > 0 ? '+' : ''}${selected.bonus}` : ''}</div>
    <div style="font:10px/1.4 sans-serif;color:${MUTED};margin-top:3px;">Некротична · успішний ряткидок: 0</div>
  </section>`;
}

function pickTarget() {
  return new Promise((resolve, reject) => {
    // This Foundry 14 build uses PIXI 7's app.view; PIXI 8 exposes app.canvas.
    const board = canvas.app?.view ?? canvas.app?.canvas ?? document.getElementById('board');
    if (!board?.style) return reject(new Error('Полотно сцени ще не готове. Перезавантаж сцену та спробуй знову.'));
    const hud = document.createElement('section');
    hud.id = 'fantik-toll-picker';
    hud.setAttribute('aria-label', 'Вибір цілі: По кому подзвін');
    hud.style.cssText = `pointer-events:auto;color-scheme:var(--color-scheme,light);position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:10000;width:350px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:12px 14px;background:${PAPER};color:${INK};border:1px solid ${GOLD};border-radius:10px;box-shadow:0 6px 25px #0004;font:13px/1.4 sans-serif;`;
    hud.innerHTML = `<style>
      #fantik-toll-picker *{box-sizing:border-box}#fantik-toll-picker button,#fantik-toll-picker input,#fantik-toll-picker select{height:29px;min-height:29px;width:auto;padding:3px 7px;margin:0;border:1px solid ${GOLD};border-radius:4px;background:${PAPER};color:${INK};font:12px/1.4 sans-serif;box-shadow:none}
      #fantik-toll-picker summary{cursor:pointer;list-style:none;padding:3px 6px;color:${GOLD}}#fantik-toll-picker summary::-webkit-details-marker{display:none}
      #fantik-toll-picker .toll-settings{position:absolute;bottom:calc(100% + 10px);left:0;width:100%;max-height:55vh;overflow:auto;padding:14px;border:1px solid ${GOLD};border-radius:9px;background:${PAPER};box-shadow:0 6px 24px #0004}
      #fantik-toll-picker label{display:grid;gap:5px;margin:0 0 12px;font-size:12px}#fantik-toll-picker input,#fantik-toll-picker select{width:100%}#fantik-toll-picker input[type=checkbox]{width:16px;height:16px;min-height:16px}
      #fantik-toll-picker button:focus-visible,#fantik-toll-picker summary:focus-visible{outline:2px solid ${GOLD};outline-offset:3px}
      #fantik-toll-picker [data-drag]{display:flex;align-items:center;gap:9px;flex:1;min-width:0;cursor:grab;touch-action:none;user-select:none}
      #fantik-toll-picker [data-untargeted]{font-size:10px;min-height:22px;height:22px;padding:1px 6px;white-space:nowrap}
      #fantik-toll-picker .toll-health{display:flex;gap:7px;margin-top:5px}
      #fantik-toll-picker [data-health]{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;height:34px;font-size:11px}
      #fantik-toll-picker [data-health] svg{width:17px;height:17px;flex:none;color:${GOLD}}
      #fantik-toll-picker [data-health][aria-pressed=true]{background:light-dark(#e5d8c3,#473b2e);box-shadow:inset 0 0 0 1px ${GOLD}}
    </style><div style="display:flex;align-items:center;gap:9px;">
      <div data-drag title="Перетягнути панель"><span style="display:block;width:27px;flex:0 0 27px;">${bellImage()}</span><strong style="flex:1;font:17px Georgia,serif;">По кому подзвін</strong><span style="font-size:11px;color:${MUTED};">0 / 1</span></div>
      <details><summary aria-label="Налаштування закляття" title="Налаштування">⚙</summary><div class="toll-settings">
        <label>Складність ряткидка Мудрості<input name="dc" type="number" min="1" max="99" step="1" value="${defaultDC}"></label>
        <div style="margin-bottom:12px;font-size:12px;">Стан цілі<input name="health" type="hidden" value="auto">
          <div class="toll-health" role="group" aria-label="Стан цілі">
            <button type="button" data-health="full" aria-pressed="false" title="Повні HP · d8. Повторний клік повертає автоматичне визначення."><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21C9 18 2 13 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 6-7 11-10 14Z"/></svg>Здорова · d8</button>
            <button type="button" data-health="wounded" aria-pressed="false" title="Втрачені HP · d12. Повторний клік повертає автоматичне визначення."><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21C9 18 2 13 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 6-7 11-10 14Z"/><path d="m13 3-3 6 5 3-5 4 2 5" fill="none" style="stroke:${PAPER};stroke-width:2;stroke-linejoin:round"/></svg>Поранена · d12</button>
          </div><div data-health-hint aria-live="polite" style="font-size:10px;color:${MUTED};margin-top:5px;">Автоматично · обери кнопку для ручного стану</div>
        </div>
        <label>Додатковий бонус шкоди<input name="bonus" type="number" value="0" step="1"></label>
      </div></details><button type="button" data-cancel aria-label="Скасувати вибір" title="Скасувати · Esc">×</button>
    </div><div style="display:flex;align-items:center;gap:8px;margin:7px 0 0 36px;"><div data-hint aria-live="polite" style="flex:1;font-size:11px;color:${MUTED};">Клацни істоту · 60 футів</div><button type="button" data-untargeted title="Використати без цілі · d8, або d12 при виборі в ⚙">Без цілі</button></div>`;
    const field = name => hud.querySelector(`[name="${name}"]`);
    let done = false, checking = false, hook, drag = null;
    const controller = new AbortController();
    const oldCursor = board.style.cursor;
    const events = canvas.app?.renderer?.events;
    const cursors = new Map();
    const finish = (value, error) => {
      if (done) return;
      done = true;
      run.cancel = null;
      for (const dispose of [
        () => window.removeEventListener('pointerdown', onPointer, true),
        () => window.removeEventListener('keydown', onKey, true),
        () => window.removeEventListener('pointermove', onDragMove, true),
        () => window.removeEventListener('pointerup', onDragEnd, true),
        () => window.removeEventListener('pointercancel', onDragEnd, true),
        () => controller.abort(),
        () => { if (hook !== undefined) Hooks.off('canvasTearDown', hook); },
        () => hud.remove(),
        ...[...cursors].map(([mode, value]) => () => {events.cursorStyles[mode] = value;}),
        () => events?.setCursor?.('default'), () => {board.style.cursor = oldCursor;}
      ]) { try {dispose();} catch (e) {console.warn('Toll the Dead | Picker cleanup', e);} }
      if (error) reject(error); else resolve(value);
    };
    function onKey(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();event.stopImmediatePropagation();finish(null);
    }
    function onDragMove(event) {
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault();event.stopImmediatePropagation();
      const rect = hud.getBoundingClientRect();
      hud.style.left = `${Math.max(8,Math.min(window.innerWidth-rect.width-8,event.clientX-drag.x))}px`;
      hud.style.top = `${Math.max(8,Math.min(window.innerHeight-rect.height-8,event.clientY-drag.y))}px`;
    }
    function onDragEnd(event) {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;hud.querySelector('[data-drag]').style.cursor = 'grab';
      event.stopImmediatePropagation();
    }
    function readSettings() {
      const dc = Number(field('dc').value), bonus = Number(field('bonus').value);
      if (!Number.isInteger(dc) || dc < 1 || dc > 99 || !Number.isSafeInteger(bonus)) {
        hud.querySelector('details').open = true;
        hud.querySelector('[data-hint]').textContent = 'Перевір КС і цілий бонус шкоди в ⚙.';
        return null;
      }
      return {dc,bonus};
    }
    async function onPointer(event) {
      if (done || checking || drag || event.target !== board || event.button !== 0) return;
      event.preventDefault();event.stopImmediatePropagation();
      try {
        const point = canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
        const hits = canvas.tokens.placeables.filter(t => t.visible && t.actor && t.bounds.contains(point.x,point.y));
        const target = hits.find(t => t.hover) ?? hits.sort((a,b)=>(b.document.sort??0)-(a.document.sort??0))[0];
        if (!target) return;
        const settings = readSettings();
        if (!settings) return;
        const {dc,bonus} = settings;
        let health = field('health').value;
        if (health === 'auto') {
          const canObserve = game.user.isGM || target.actor.testUserPermission?.(game.user, 'OBSERVER');
          let wounded;
          if (canObserve) {
            const hp = target.actor.system.attributes?.hp;
            if (hp?.value != null && hp?.max != null && Number.isFinite(Number(hp.value))
                && Number.isFinite(Number(hp.max)) && Number(hp.max) > 0) wounded = Number(hp.value) < Number(hp.max);
          } else {
            checking = true;
            hud.querySelector('[data-hint]').textContent = 'GM перевіряє, чи ціль поранена…';
            try {
              wounded = await support.getWounded({targetUuid:target.document.uuid, actorUuid:actor.uuid, sceneId, signal:controller.signal});
            } catch (error) {
              if (done) return;
              hud.querySelector('details').open = true;
              hud.querySelector('[data-hint]').textContent = error.message;
              return;
            }
            if (done) return;
          }
          if (typeof wounded !== 'boolean') {
            hud.querySelector('details').open = true;
            hud.querySelector('[data-hint]').textContent = 'HP невідомі — обери стан цілі в ⚙ і клацни її знову.';
            return;
          }
          health = wounded ? 'wounded' : 'full';
        }
        canvas.tokens.setTargets([target.id],{mode:'replace'});
        finish({target,dc,bonus,faces:health==='wounded'?12:8});
      } catch (error) {finish(null,error);}
      finally {checking = false;}
    }
    try {
      // Follow the interface theme, like the chat, rather than a separate application preference.
      (document.getElementById('interface') ?? document.body).append(hud);
      hook = Hooks.on('canvasTearDown',()=>finish(null));
      run.cancel = ()=>finish(null);
      for (const mode of ['default','pointer','grab']) {
        if (!events?.cursorStyles) break;
        cursors.set(mode,events.cursorStyles[mode]);events.cursorStyles[mode]='crosshair';
      }
      events?.setCursor?.('crosshair');board.style.cursor='crosshair';
      hud.querySelector('[data-cancel]').addEventListener('click',()=>finish(null));
      hud.querySelectorAll('[data-health]').forEach(button=>button.addEventListener('click',()=>{
        const value=field('health').value===button.dataset.health?'auto':button.dataset.health;
        field('health').value=value;
        hud.querySelectorAll('[data-health]').forEach(option=>option.setAttribute('aria-pressed',String(option.dataset.health===value)));
        hud.querySelector('[data-health-hint]').textContent=value==='auto'
          ? 'Автоматично · обери кнопку для ручного стану'
          : 'Вручну · повторний клік повертає авто';
      }));
      hud.querySelector('[data-untargeted]').addEventListener('click',()=>{
        if (done) return;
        const settings = readSettings();
        if (settings) finish({target:null,...settings,faces:field('health').value==='wounded'?12:8});
      });
      hud.querySelector('[data-drag]').addEventListener('pointerdown',event=>{
        if (done || event.button !== 0) return;
        event.preventDefault();event.stopPropagation();
        const rect = hud.getBoundingClientRect();
        drag = {id:event.pointerId,x:event.clientX-rect.left,y:event.clientY-rect.top};
        hud.style.left = `${rect.left}px`;hud.style.top = `${rect.top}px`;
        hud.style.bottom = 'auto';hud.style.transform = 'none';
        hud.querySelector('[data-drag]').style.cursor = 'grabbing';
      });
      window.addEventListener('pointermove',onDragMove,true);
      window.addEventListener('pointerup',onDragEnd,true);
      window.addEventListener('pointercancel',onDragEnd,true);
      window.addEventListener('pointerdown',onPointer,true);window.addEventListener('keydown',onKey,true);
      canvas.tokens.setTargets([],{mode:'replace'});
    } catch (error) {finish(null,error);}
  });
}

async function animateBell(target, broadcast) {
  if (!canvas.ready || canvas.scene.id !== sceneId) return;
  if (game.modules.get('sequencer')?.active && typeof Sequence !== 'undefined' && typeof Sequencer !== 'undefined') {
    const file = ['jb2a.toll_the_dead.grey.complete','jb2a.toll_the_dead.purple.complete','jb2a.toll_the_dead.yellow.complete']
      .find(key => {try {return !!Sequencer.Database.getEntry(key);} catch {return false;}});
    if (file) {
      await new Sequence().effect().file(file).atLocation(target).scaleToObject(2.5).play({local:!broadcast});
      return;
    }
  }
  // Local fallback: no dependency is required for a visible bell at the selected token.
  const effect = document.createElement('div');
  const point = canvas.clientCoordinatesFromCanvas(target.center);
  effect.style.cssText = `position:fixed;left:${point.x}px;top:${point.y}px;width:180px;transform:translate(-50%,-75%);z-index:80;pointer-events:none;color-scheme:dark;`;
  effect.innerHTML = bellImage();
  document.body.append(effect);
  const teardown = Hooks.on('canvasTearDown',()=>effect.remove());
  try {
    const motion = effect.animate([{opacity:0,rotate:'-8deg'},{opacity:1,rotate:'8deg',offset:.2},{opacity:1,rotate:'-6deg',offset:.45},{opacity:1,rotate:'4deg',offset:.7},{opacity:0,rotate:'0deg'}],{duration:2400,easing:'ease-in-out'});
    await motion.finished;
  } finally {effect.remove();Hooks.off('canvasTearDown',teardown);}
}
