// Foundry VTT 14 / dnd5e 6. Створіть макрос типу Script і вставте весь файл.
// Окремі кидки в чаті; HP, Hex, відштовхування та реакції обробляються вручну.
// Для анімації: активні Sequencer і JB2A Patreon (або безкоштовний JB2A).
const LOCK = Symbol.for("fantik.eldritchBlast.running");
if (globalThis[LOCK]) {
  const previous = globalThis[LOCK];
  if (typeof previous.cancel === "function") {
    previous.cancel();
    // Let the previous run restore its targets before starting another picker.
    await Promise.resolve();
  } else if (previous === true && !document.getElementById("fantik-eldritch-picker")) {
    // Recover the stale boolean lock left by the original macro after an error.
    delete globalThis[LOCK];
  } else {
    ui.notifications.warn("Eldritch Blast ще виконується. Дочекайтеся завершення або натисніть Esc у вікні вибору.");
    return;
  }
}
if (!canvas?.ready) return ui.notifications.warn("Спочатку відкрийте сцену.");
const controlled = canvas.tokens.controlled;
if (controlled.length > 1) return ui.notifications.warn("Виберіть лише токен чаклуна.");
const caster = controlled[0] ?? game.user.character?.getActiveTokens()?.[0];
if (!caster?.actor?.isOwner) return ui.notifications.warn("Виберіть свій токен на сцені.");
const actor = caster.actor;
const level = Number(actor.system.details?.level);
if (!Number.isInteger(level) || level < 1) {
  return ui.notifications.warn("Не знайдено загальний рівень персонажа. Виберіть токен персонажа з класами.");
}
const beamCount = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
const sceneId = canvas.scene.id;
const previousTargets = [...game.user.targets].map(t => t.id);
const spell = actor.items.find(i => i.system?.identifier === "eldritch-blast"
  || /eldritch blast|потойбічний розряд|містичний заряд|містичний розряд/i.test(i.name));
const activity = spell?.system.activities?.find(a => a.type === "attack");
// The activity supplies item bonuses and formula bonuses (e.g. an extra die).
let attackData = {bonus: Number(actor.system.attributes?.spell?.attack) || 0};
let attackBonus = "@bonus";
if (activity?.getAttackData) {
  const prepared = activity.getAttackData();
  attackData = prepared.data;
  attackBonus = prepared.parts.join(" + ") || "0";
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);
const runState = {cancel: null};
globalThis[LOCK] = runState;
try {
  const selected = await pickBeams();
  if (!selected) return;
  if (!canvas.ready || canvas.scene.id !== sceneId
    || selected.picks.some(p => !canvas.tokens.get(p.token.id)?.actor)) {
    return ui.notifications.warn("Сцена або цілі змінилися. Запустіть макрос ще раз.");
  }

  const results = await Promise.all(selected.picks.map(async ({token, mode}) => {
    const die = mode === "adv" ? "2d20kh1" : mode === "dis" ? "2d20kl1" : "1d20";
    const attack = await new Roll(`${die} + (${selected.bonus})`, attackData).evaluate();
    const natural = attack.dice.find(d => d.faces === 20)?.results.find(r => r.active !== false && !r.discarded)?.result;
    const critical = natural === 20;
    // Every beam rolls damage; the table decides whether the attack hits.
    const damage = await new Roll(`${critical ? 2 : 1}d10 + @bonus`, {
      bonus: selected.damageBonus
    }).evaluate();
    return {token, mode, attack, damage, critical};
  }));

  const anchor = (roll, color = "#ffdbb8") => roll.toAnchor({
    classes: ["inline-dsn-hidden"],
    attrs: {style: `display:inline-flex;align-items:center;gap:5px;padding:0;border:0;background:transparent;color:${color};font:600 19px/1.2 sans-serif;white-space:nowrap;text-decoration:none;box-shadow:none;`}
  }).outerHTML;
  const naturalColor = value => value === 20 ? "#94e0a2" : value === 1 ? "#ff9393" : "#ffdbb8";
  const d20Details = roll => roll.dice.filter(d => d.faces === 20).flatMap(d => d.results).map(die => {
    const dropped = die.active === false || die.discarded === true;
    return `<span data-d20="${die.result}" data-discarded="${dropped}" title="к20: ${die.result}${dropped ? " · відкинуто" : " · враховано"}" style="display:inline-block;color:${naturalColor(die.result)};font-size:12px;font-weight:600;${dropped ? "text-decoration:line-through;text-decoration-thickness:2px;opacity:0.65;" : ""}">${die.result}</span>`;
  }).join('<span aria-hidden="true" style="color:#8e7868;">/</span>');
  // Foundry sanitizes inline <svg> tags, but permits SVG images in data URLs.
  // Keep the drawing embedded so importing the macro requires no extra assets.
  const catHead = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="104" viewBox="0 0 260 104" fill="none">
    <path d="M1 104V71Q1 53 21 43L17 8Q17 2 23 5L73 32Q130 16 187 32L237 5Q243 2 243 8L239 43Q259 53 259 71V104" fill="#261e19" stroke="#a56b3c" stroke-width="2" stroke-linejoin="round"/>
    <path d="M29 16L34 42L62 35Z M231 16L226 42L198 35Z" fill="#c77a45"/>
    <path d="M36 24L39 36L51 33Z M224 24L221 36L209 33Z" fill="#efb080"/>
    <path d="M115 29L119 42M130 27V40M145 29L141 42" stroke="#a56b3c" stroke-width="4" stroke-linecap="round"/>
    <path d="M79 64Q89 52 99 64M161 64Q171 52 181 64" stroke="#f6c993" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="113" cy="78" rx="16" ry="11" fill="#38271c"/><ellipse cx="147" cy="78" rx="16" ry="11" fill="#38271c"/>
    <path d="M124 70Q130 67 136 70L130 76Z" fill="#e6a077"/>
    <path d="M130 76V80Q124 87 118 80M130 80Q136 87 142 80" stroke="#d6a06e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M48 65L91 73M43 78L88 79M50 91L92 85M212 65L169 73M217 78L172 79M210 91L168 85" stroke="#d9995c" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M5 58L20 62M3 69L17 71M255 58L240 62M257 69L243 71" stroke="#704a2f" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
  const catPaws = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="34" viewBox="0 0 260 34" fill="none">
    <path d="M1 0V15Q1 33 19 33H241Q259 33 259 15V0" fill="#261e19" stroke="#a56b3c" stroke-width="2"/>
    <path d="M43 33V20Q43 7 62 7Q81 7 81 20V33M179 33V20Q179 7 198 7Q217 7 217 20V33" fill="#39271a" stroke="#a56b3c" stroke-width="1.5"/>
    <path d="M55 26V32M67 26V32M191 26V32M203 26V32" stroke="#c78950" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  const drawing = (svg, alt) => `<img src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="${alt}" draggable="false" style="display:block;width:100%;height:auto;max-width:none;margin:0;padding:0;border:0;border-radius:0;box-shadow:none;pointer-events:none;">`;
  const cards = results.map((r, i) => {
    const natural = r.attack.dice.find(d => d.faces === 20)?.results.find(d => d.active !== false && !d.discarded)?.result;
    const mode = r.mode === "adv" ? " · перевага" : r.mode === "dis" ? " · перешкода" : "";
    return `<div style="min-width:0;padding:11px 0;border-top:1px solid #513c30;">
      <div style="display:flex;align-items:center;gap:7px;min-width:0;margin-bottom:7px;">
        <span style="flex:0 0 auto;color:#d08a55;font-size:11px;">${String(i + 1).padStart(2, "0")}</span>
        <span title="${escape(r.token.name)}" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e8d2c0;font-size:12px;">${escape(r.token.name)}</span>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;">
        <div style="min-width:0;"><div style="color:#bba08c;font-size:11px;line-height:1.4;margin-bottom:3px;">Атака${mode}</div>${anchor(r.attack, naturalColor(natural))}
          <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:4px;margin-top:5px;font-size:11px;line-height:1.4;"><span style="color:#bba08c;">к20:</span>${d20Details(r.attack)}</div>
        </div>
        <div style="min-width:0;"><div style="color:#bba08c;font-size:11px;line-height:1.4;margin-bottom:3px;">Шкода</div>${anchor(r.damage)}</div>
      </div>
    </div>`;
  }).join("");
  const message = {
    speaker: ChatMessage.getSpeaker({actor, token: caster.document}),
    rolls: results.flatMap(r => [r.attack, r.damage]),
    content: `<section style="min-width:0;padding:0;color:#f2dfcf;font:13px/1.4 sans-serif;text-align:left;word-break:normal;overflow-wrap:normal;">
      ${drawing(catHead, "Рудий котик із вушками та вусами")}
      <div style="padding:0 13px;background:#261e19;border-left:1px solid #a56b3c;border-right:1px solid #a56b3c;">
        <div style="text-align:center;padding-bottom:12px;">
          <div style="font-size:16px;line-height:1.3;font-weight:600;color:#ffe5cd;">Eldritch Blast</div>
          <div style="color:#bba08c;font-size:11px;margin-top:3px;">${beamCount} ${beamCount === 1 ? "промінь" : "промені"} · силова шкода</div>
        </div>
        ${cards}
      </div>
      ${drawing(catPaws, "")}
    </section>`
  };
  ChatMessage.applyMode(message);
  await ChatMessage.create(message);
  // Publish rolls first: an unavailable animation must not lose the attack results.
  try {
    await animate(results, selected.color);
  } catch (error) {
    console.error("Eldritch Blast | Animation failed", error);
    ui.notifications.warn("Кидки збережено в чаті, але анімацію не вдалося відтворити.");
  }
} catch (error) {
  console.error("Eldritch Blast", error);
  ui.notifications.error(`Eldritch Blast: ${error.message ?? error}. Подробиці в консолі (F12).`);
} finally {
  try {
    // Never write old scene token ids into a newly opened scene.
    if (canvas.ready && canvas.scene.id === sceneId) {
      setTargets(previousTargets.filter(id => canvas.tokens.get(id)));
    }
  } catch (error) {
    console.error("Eldritch Blast | Failed to restore targets", error);
  } finally {
    if (globalThis[LOCK] === runState) delete globalThis[LOCK];
  }
}

function setTargets(ids) {
  canvas.tokens.setTargets(ids, {mode: "replace"});
}

async function animate(results, color) {
  if (!game.modules.get("sequencer")?.active || typeof Sequence === "undefined") {
    ui.notifications.warn("Кидки готові. Для анімації увімкніть Sequencer і JB2A.");
    return;
  }
  let file = `jb2a.eldritch_blast.${color}`;
  if (!Sequencer.Database.getEntry(file)) file = "jb2a.eldritch_blast.purple";
  if (!Sequencer.Database.getEntry(file)) {
    ui.notifications.warn("Кидки готові. У базі JB2A не знайдено Eldritch Blast.");
    return;
  }
  if (!canvas.ready || canvas.scene.id !== sceneId) return;
  const sequence = new Sequence();
  const sync = `eldritch-${foundry.utils.randomID()}`;
  for (const [i, result] of results.entries()) {
    const angle = Math.atan2(result.token.center.y - caster.center.y,
      result.token.center.x - caster.center.x);
    const offset = (i - (results.length - 1) / 2) * canvas.grid.size * 0.3;
    sequence.effect().file(file)
      .atLocation({x: caster.center.x - Math.sin(angle) * offset,
        y: caster.center.y + Math.cos(angle) * offset})
      .stretchTo(result.token).syncGroup(sync);
    // No waitUntilFinished: every beam starts in the same sequence together.
  }
  await sequence.play({local: game.settings.get("core", "rollMode") !== "publicroll"});
}

function pickBeams() {
  return new Promise((resolve, reject) => {
    const picks = [];
    const board = canvas.app.canvas ?? canvas.app.view;
    const hud = document.createElement("section");
    hud.id = "fantik-eldritch-picker";
    hud.setAttribute("aria-label", "Вибір цілей Eldritch Blast");
    hud.style.cssText = "position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:10000;width:360px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:12px 14px;background:#261e19;color:#f2dfcf;border:1px solid #805334;border-radius:12px;box-shadow:0 6px 24px #0006;font:13px/1.4 sans-serif;";
    hud.innerHTML = `<style>
      #fantik-eldritch-picker *{box-sizing:border-box}
      #fantik-eldritch-picker button,#fantik-eldritch-picker select,#fantik-eldritch-picker input{height:28px;min-height:28px;width:auto;margin:0;padding:3px 7px;border:1px solid #654831;border-radius:5px;background:#34271f;color:#f2dfcf;font:12px/1.3 sans-serif;box-shadow:none}
      #fantik-eldritch-picker button:hover,#fantik-eldritch-picker summary:hover{background:#4b3424;color:#ffca94}
      #fantik-eldritch-picker button:disabled{opacity:.35;cursor:default}
      #fantik-eldritch-picker select option{background:#34271f;color:#f2dfcf}
      #fantik-eldritch-picker summary{list-style:none;cursor:pointer;color:#dda575;border-radius:5px;padding:3px 6px;font-size:12px}
      #fantik-eldritch-picker summary::-webkit-details-marker{display:none}
      #fantik-eldritch-picker .eb-settings{position:absolute;bottom:calc(100% + 12px);left:0;width:100%;max-height:50vh;overflow:auto;padding:14px;background:#261e19;border:1px solid #805334;border-radius:10px;box-shadow:0 6px 24px #0006}
      #fantik-eldritch-picker .eb-settings label{display:grid;gap:5px;margin:0 0 10px;color:#d6bba5;font-size:12px}
      #fantik-eldritch-picker .eb-settings input,#fantik-eldritch-picker .eb-settings select{width:100%}
    </style>
    <div style="display:flex;align-items:center;gap:8px;">
      <span aria-hidden="true" style="color:#ed9b58;font:16px monospace;white-space:nowrap;">=^·^=</span>
      <span style="flex:1;font-size:13px;font-weight:600;">Eldritch Blast</span>
      <span data-count aria-live="polite" style="color:#e7b58c;font-size:12px;white-space:nowrap;"></span>
      <details><summary aria-label="Налаштування" title="Бонуси та колір">⚙</summary><div class="eb-settings">
        <label>Бонус атаки (формула)<input name="attack" type="text" value="${escape(attackBonus)}"></label>
        <label>Бонус шкоди кожного променя<input name="damage" type="number" value="0" step="1"></label>
        <div style="font-size:11px;color:#bba08c;margin-bottom:10px;">Agonizing Blast: модифікатор Харизми ${Number(actor.system.abilities?.cha?.mod) || 0}.</div>
        <label>Колір променів<select name="color"><option value="orange">Рудий</option><option value="dark_purple">Темно-фіолетовий</option><option value="purple">Фіолетовий</option><option value="dark_green">Темно-зелений</option><option value="dark_red">Темно-червоний</option></select></label>
      </div></details>
      <button type="button" data-cancel aria-label="Скасувати вибір" title="Скасувати · Esc">×</button>
    </div>
    <div data-picks style="margin:7px 0 9px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#bba08c;"></div>
    <div style="display:flex;align-items:center;gap:7px;">
      <select name="mode" aria-label="Кидок наступного променя" style="flex:1;min-width:0;"><option value="normal">Звичайна атака</option><option value="adv">З перевагою</option><option value="dis">З перешкодою</option></select>
      <button type="button" data-undo title="Скасувати останній вибір · Backspace">↶ Назад</button>
    </div>`;
    const field = name => hud.querySelector(`[name="${name}"]`);
    const events = canvas.app.renderer?.events;
    const oldCursors = new Map();
    const oldCursor = board.style.cursor;
    let done = false;
    const teardownHook = Hooks.on("canvasTearDown", () => finish(null));
    runState.cancel = () => finish(null);

    function finish(value, error) {
      if (done) return;
      done = true;
      runState.cancel = null;
      // One failed cleanup operation must not leave the promise pending or
      // prevent other handlers from being removed.
      const cleanup = [
        () => window.removeEventListener("pointerdown", onPointer, true),
        () => window.removeEventListener("keydown", onKey, true),
        () => Hooks.off("canvasTearDown", teardownHook),
        () => hud.remove(),
        ...[...oldCursors].map(([mode, cursor]) => () => { events.cursorStyles[mode] = cursor; }),
        () => events?.setCursor?.("default"),
        () => { board.style.cursor = oldCursor; }
      ];
      for (const dispose of cleanup) {
        try { dispose(); }
        catch (cleanupError) { console.error("Eldritch Blast | Cleanup failed", cleanupError); }
      }
      if (error) reject(error); else resolve(value);
    }
    function refresh() {
      hud.querySelector("[data-count]").textContent = `${picks.length} / ${beamCount}`;
      const pickSummary = picks.map((p, i) => `${i + 1}. ${p.token.name}${p.mode === "adv" ? " ↑" : p.mode === "dis" ? " ↓" : ""}`).join(" · ");
      hud.querySelector("[data-picks]").textContent = pickSummary || "Клацніть ціль · останній клік запускає залп";
      hud.querySelector("[data-picks]").title = pickSummary || "Одну ціль можна вибирати кілька разів.";
      hud.querySelector("[data-undo]").disabled = !picks.length;
      setTargets([...new Set(picks.map(p => p.token.id))]);
    }
    function undo() {
      try {
        picks.pop();
        refresh();
      } catch (error) { finish(null, error); }
    }
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(null);
      } else if (event.key === "Backspace" && !/INPUT|SELECT|TEXTAREA/.test(event.target?.tagName)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        undo();
      }
    }
    function onPointer(event) {
      if (event.target !== board || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const point = canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY});
        const hits = canvas.tokens.placeables.filter(t => t.visible && t.actor
          && t.bounds.contains(point.x, point.y));
        const target = hits.find(t => t.hover) ?? hits.sort((a, b) =>
          (b.document.sort ?? 0) - (a.document.sort ?? 0))[0];
        if (!target || target.id === caster.id) return;
        const bonus = field("attack").value.trim();
        const damageBonus = Number(field("damage").value);
        if (!bonus || !Roll.validate(bonus) || !Number.isSafeInteger(damageBonus)) {
          ui.notifications.warn("Перевірте формулу бонусу атаки та цілий бонус шкоди.");
          return;
        }
        picks.push({token: target, mode: field("mode").value});
        refresh();
        if (picks.length === beamCount) finish({picks: [...picks], bonus,
          damageBonus, color: field("color").value});
      } catch (error) {
        finish(null, error);
      }
    }
    try {
      document.body.append(hud);
      for (const mode of ["default", "pointer", "grab"]) {
        if (!events?.cursorStyles) break;
        oldCursors.set(mode, events.cursorStyles[mode]);
        events.cursorStyles[mode] = "crosshair";
      }
      events?.setCursor?.("crosshair");
      board.style.cursor = "crosshair";
      hud.querySelector("[data-undo]").addEventListener("click", undo);
      hud.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
      window.addEventListener("pointerdown", onPointer, true);
      window.addEventListener("keydown", onKey, true);
      refresh();
    } catch (error) {
      finish(null, error);
    }
  });
}
