import {MODULE_ID} from './constants.js';

const FLAG = 'serpentTongue';
const KIND = 'serpent-tongue';
const running = new Map();
const poisoning = new Set();
const INK = 'light-dark(#193f35,#e3eddf)';
const PAPER = 'light-dark(#f2f0df,#122a24)';
const GOLD = 'light-dark(#83622e,#cfb775)';
const MUTED = 'light-dark(#637166,#9fb6a8)';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dataOf = effect => effect.getFlag(MODULE_ID, FLAG);

export function expired(state) {
    if (!state || !Number.isFinite(state.expires) || game.time.worldTime >= state.expires) return true;
    const combat = state.combatId && game.combats.get(state.combatId);
    return !!(combat?.started && (combat.round > state.round + 10
        || (combat.round === state.round + 10 && combat.turn >= state.turn)));
}

function sourceEffect(actor, castId) {
    return actor?.effects.find(e => {
        const s = dataOf(e);
        return s?.role === 'source' && (!castId || s.castId === castId) && !e.disabled && !expired(s);
    });
}

export function snakeImage() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 180">
      <style>:root{--body:#336b50;--edge:#8a7139;--eye:#cf9a34;--line:#efebd5}@media(prefers-color-scheme:dark){:root{--body:#3c7258;--edge:#cfb775;--eye:#f3dc8c;--line:#a3c1a2}}</style>
      <defs><linearGradient id="s"><stop stop-color="var(--body)"/><stop offset=".5" stop-color="#75996a"/><stop offset="1" stop-color="var(--body)"/></linearGradient></defs>
      <g fill="none" stroke="var(--edge)" opacity=".5"><ellipse cx="140" cy="94" rx="103" ry="65"/><ellipse cx="140" cy="94" rx="94" ry="57" stroke-dasharray="1 7"/><path d="M17 93H38M242 93H263M140 17V28M140 159V172"/></g>
      <path d="M71 145C32 113 90 98 157 132C218 164 242 105 191 86C143 68 95 114 72 86C48 54 96 34 145 45C175 51 189 44 190 30" fill="none" stroke="var(--edge)" stroke-width="23" stroke-linecap="round"/>
      <path d="M71 145C32 113 90 98 157 132C218 164 242 105 191 86C143 68 95 114 72 86C48 54 96 34 145 45C175 51 189 44 190 30" fill="none" stroke="url(#s)" stroke-width="20" stroke-linecap="round"/>
      <path d="M71 144C41 115 97 108 153 137C208 163 233 108 190 91C143 74 95 120 68 88C44 58 94 27 146 39" fill="none" stroke="var(--line)" stroke-opacity=".5" stroke-width="2"/>
      <g fill="none" stroke="var(--edge)" opacity=".7"><path d="M87 111l5 7-5 7M106 115l5 8-5 7M126 123l4 8-5 7M169 135l5 7-5 6M198 122l8 3-2 8M199 101l7-4 6 6M157 91l-4 8-8-2M118 102l-6 7-7-6M83 94l-8 5-6-6M76 64l-7-6 5-7M102 46l1-7 8-3M133 48l6-7 6 7"/></g>
      <path d="M179 39Q173 28 180 17L199 8Q212 15 211 28L201 42Q190 48 179 39Z" fill="url(#s)" stroke="var(--edge)" stroke-width="1.5"/>
      <path d="M198 11L194 24L205 29M179 33L194 24" fill="none" stroke="var(--edge)" stroke-width="1"/>
      <ellipse cx="202" cy="19" rx="3.6" ry="4" fill="var(--eye)"/><path d="M202 16V22" stroke="#13251c" stroke-width="1.6"/>
      <path d="M205 36L220 47L232 44M220 47L225 58" fill="none" stroke="#bb795f" stroke-width="2" stroke-linecap="round"/>
      <g fill="var(--edge)"><path d="M37 40l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/><circle cx="239" cy="139" r="2"/><circle cx="48" cy="126" r="1.5"/></g>
    </svg>`;
    return `<img alt="Смарагдова змія" draggable="false" src="data:image/svg+xml,${encodeURIComponent(svg)}" style="display:block;width:100%;max-width:250px;margin:0 auto;border:0;box-shadow:none;color-scheme:inherit;pointer-events:none;">`;
}

export function breakdown(roll, attack = false) {
    return roll.dice.map(die => `d${die.faces}: ${die.results.map(r => {
        const color = attack && die.faces === 20 ? (r.result === 20 ? '#48a568' : r.result === 1 ? '#e26868' : INK) : INK;
        return `<span style="color:${color};${r.discarded || r.active === false ? 'text-decoration:line-through;opacity:.65;' : ''}">${esc(r.result)}</span>`;
    }).join(' · ')}`).join(' / ');
}

export function cardHTML({state, target, attacks = [], damage}) {
    const attack = attacks[0];
    const color = attack?.isCritical ? '#48a568' : attack?.isFumble ? '#e26868' : INK;
    return `<section class="fantik-serpent-card" style="color-scheme:var(--color-scheme,light);position:relative;overflow:hidden;border:1px solid ${GOLD};border-radius:64px 64px 10px 10px;padding:20px 14px 12px;background:radial-gradient(ellipse at 50% 0,light-dark(#e0e7cf,#254235),${PAPER} 75%);color:${INK};text-align:center;font-family:Georgia,serif;">
      <div style="font:9px/1.5 sans-serif;letter-spacing:2px;color:${GOLD};margin:5px 0 0;">SERPENT TONGUE</div>${snakeImage()}
      <div style="font-size:23px;line-height:1.2;margin:0 0 8px;">Зміїний язик</div>
      ${damage ? `<div style="font-size:16px;overflow-wrap:anywhere;margin-bottom:10px;">${esc(target?.name ?? 'Без цілі')}</div>
        <div style="display:flex;gap:8px;align-items:start;">
          <div style="flex:1;min-width:0;"><div style="font:11px sans-serif;color:${MUTED};">Атака${attack?.isCritical ? ' · крит' : ''}</div><div style="font-size:32px;color:${color};">${esc(attack?.total)}</div></div>
          <div style="flex:1;min-width:0;border-left:1px solid ${GOLD};"><div style="font:11px sans-serif;color:${MUTED};">Колюча шкода</div><div style="font-size:32px;color:${GOLD};">${esc(damage.total)}</div></div>
        </div>
        ${attacks.map(r => `<div style="font:11px/1.6 sans-serif;overflow-wrap:anywhere;margin-top:4px;">${esc(r.formula)} = ${esc(r.total)} · ${breakdown(r,true)}</div>`).join('')}
        <div style="font:11px/1.6 sans-serif;overflow-wrap:anywhere;margin-top:4px;">${esc(damage.formula)} = ${esc(damage.total)} · ${breakdown(damage)}</div>
        <div style="font:10px/1.5 sans-serif;color:${MUTED};margin-top:7px;">При влучанні — отруєння до кінця закляття</div>`
        : `<div style="font-size:13px;font-style:italic;line-height:1.4;color:${MUTED};margin:5px 5px 12px;">Твій голос набуває отруйного присмаку.</div>
        <div style="font:12px/1.5 sans-serif;color:${GOLD};">1 хвилина · рівень ${state.level} · ${state.level-2}d12</div>`}
      <div data-serpent-controls style="position:relative;margin-top:10px;"></div>
    </section>`;
}

function messageData(actor, state, extra = {}) {
    const data = {speaker:ChatMessage.getSpeaker({actor}), flags:{[MODULE_ID]:{spellCard:{kind:KIND,version:1},[FLAG]:state},'dice-so-nice':{skip:true}},...extra};
    ChatMessage.applyRollMode(data, game.settings.get('core','rollMode'));
    return data;
}

async function showDice(rolls, message) {
    if (!game.dice3d?.showForRoll) return;
    const isPublic = !message.blind && !message.whisper?.length;
    const viewers = isPublic ? null : [...new Set([...(message.whisper ?? []), ...(!message.blind ? [game.user.id] : [])])];
    const maySee = !message.blind || viewers?.includes(game.user.id);
    if (!isPublic && !viewers.length) return;
    for (const roll of rolls) {
        for (const die of roll.dice) {
            die.options.colorset = 'custom';
            die.options.appearance = {colorset:'custom',system:'standard',foreground:'#e7d39b',background:'#164635',outline:'#09251b',edge:'#af9559',material:'metal',texture:'none',font:'Arial'};
        }
        try { await game.dice3d.showForRoll(roll,game.user,true,viewers,!maySee); }
        catch (error) { console.warn(`${MODULE_ID} | Serpent dice`,error);ui.notifications.warn('3D-кубики недоступні; результат збережено.'); }
    }
}

async function chooseActivity(activities, title) {
    if (activities.length === 1) return activities[0];
    if (!activities.length) throw new Error(`Не знайдено активність: ${title}. Перевір налаштування закляття.`);
    const id = await foundry.applications.api.DialogV2.wait({window:{title},rejectClose:false,
        content:`<label>Активність<select name="activity">${activities.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>`,
        buttons:[{action:'choose',label:'Обрати',callback:(_event,button)=>button.form.elements.activity.value},{action:'cancel',label:'Скасувати',callback:()=>null}]});
    return activities.find(a=>a.id===id);
}

export async function consume(activity, {initial, sameActivity = false, level} = {}) {
    if (!activity?._prepareUsageConfig || !activity.consume) throw new Error('Не вдалося визначити ресурси активності.');
    // A single imported attack activity may serve both casting and the ongoing bite.
    // Its spell/resource costs belong to the initial cast; action cost still applies per bite.
    const usage = activity._prepareUsageConfig({create:false,concentration:false,
        ...(!initial ? {consume:{spellSlot:false,...(sameActivity ? {resources:[]} : {})},
            ...(Number.isInteger(level) ? {scaling:level-Number(activity.item.system.level)} : {})} : {})});
    if (initial || (usage.hasConsumption && !sameActivity && activity._requiresConfigurationDialog(usage))) {
        try { await activity.metadata.usage.dialog.create(activity,usage,{}); }
        catch { return null; }
    }
    if (!initial) {
        usage.consume ??= {};
        usage.consume.spellSlot = false;
        if (sameActivity) usage.consume.resources = [];
        if (Number.isInteger(level)) usage.scaling=level-Number(activity.item.system.level);
    }
    if (initial) {
        const slot = activity.actor.system.spells?.[usage.spell?.slot];
        const slotLevel = Number(slot?.level ?? String(usage.spell?.slot ?? '').match(/^spell([3-9])$/)?.[1]);
        usage.serpentLevel = Number.isInteger(slotLevel) && slotLevel >= 3 ? slotLevel : Number(activity.item.system.level) + Number(usage.scaling ?? 0);
        if (!Number.isInteger(usage.serpentLevel) || usage.serpentLevel < 3 || usage.serpentLevel > 9) throw new Error('Для Зміїного язика потрібен рівень закляття від 3 до 9.');
    }
    if (usage.hasConsumption && await activity.consume(usage,{create:false,data:{}}) === false) {
        ui.notifications.warn('Використання скасоване: ресурси не підтверджено або їх недостатньо.');
        return null;
    }
    return usage;
}

export async function useSerpentTongue({item, activity, action, castId} = {}) {
    const actor = game.user.character;
    if (!actor?.isOwner) return ui.notifications.warn('Признач свого персонажа в налаштуваннях користувача.');
    if (game.system.id !== 'dnd5e' || !CONFIG.Dice.D20Roll || !CONFIG.Dice.DamageRoll) return ui.notifications.warn('Потрібна система dnd5e.');
    const matches = actor.items.filter(i=>i.system?.identifier === 'serpent-tongue' || /serpent tongue|зміїний язик|зміїний язичок/i.test(i.name));
    item ??= matches.length === 1 ? matches[0] : null;
    if (!item || item.actor?.uuid !== actor.uuid || item.type !== 'spell') return ui.notifications.warn('Прив’яжи макрос до Serpent Tongue призначеного персонажа або залиш одну однозначну копію на його аркуші.');
    if (running.has(actor.uuid)) return ui.notifications.warn('Зміїний язик уже виконується. Заверши вибір або натисни Esc.');
    const run = {cancel:null};running.set(actor.uuid,run);
    try {
        const source = sourceEffect(actor,castId);
        if (castId && (!source || dataOf(source).itemUuid !== item.uuid)) return ui.notifications.warn('Це накладання вже завершилося. Запусти закляття знову.');
        if (action === 'end') { if (source) await source.delete();return; }
        if (source) {
            const state = dataOf(source);
            if (state.itemUuid !== item.uuid) throw new Error('Спершу заверши попередній Зміїний язик.');
            const attack = item.system.activities.get(state.attackId);
            if (!attack?.rollAttack) throw new Error('Активність укусу видалена або змінена.');
            await bite(actor,item,attack,state,run);
            return;
        }
        const all = Array.from(item.system.activities.values());
        const attack = await chooseActivity(all.filter(a=>a.type==='attack'),'Зміїний язик · активність укусу');
        if (!attack) return;
        const casting = activity?.item?.uuid === item.uuid && (activity.type !== 'attack' || !all.some(a=>a.type!=='attack')) ? activity
            : await chooseActivity(all.filter(a=>a.type !== 'attack').length ? all.filter(a=>a.type !== 'attack') : [attack], 'Зміїний язик · накладання');
        if (!casting) return;
        const usage = await consume(casting,{initial:true});
        if (!usage) return;
        const start = game.time.worldTime;
        const state = {role:'source',castId:foundry.utils.randomID(),casterUuid:actor.uuid,itemUuid:item.uuid,attackId:attack.id,castingId:casting.id,
            level:usage.serpentLevel,start,expires:start+60,combatId:game.combat?.started ? game.combat.id : null,round:game.combat?.round ?? 0,turn:game.combat?.turn ?? 0};
        await actor.createEmbeddedDocuments('ActiveEffect',[{name:'Зміїний язик',img:item.img,origin:item.uuid,disabled:false,
            duration:{seconds:60,startTime:start,...(state.combatId ? {combat:state.combatId,rounds:10,startRound:state.round,startTurn:state.turn} : {})},
            flags:{[MODULE_ID]:{[FLAG]:state}}}]);
        await ChatMessage.create(messageData(actor,state,{content:cardHTML({state})}));
    } catch (error) {
        console.error(`${MODULE_ID} | Serpent Tongue`,error);
        ui.notifications.error(`Зміїний язик: ${error.message ?? error}`);
    } finally {if (running.get(actor.uuid)===run) running.delete(actor.uuid);}
}

async function bite(actor,item,attack,state,run) {
    if (!canvas?.ready) throw new Error('Відкрий сцену для вибору цілі.');
    const sceneId = canvas.scene.id;
    const oldTargets = [...game.user.targets].map(t=>t.id);
    try {
        const selected = await pickTarget(run,state);
        if (!selected) return;
        if (!sourceEffect(actor,state.castId)) throw new Error('Дія закляття вже завершилась.');
        if (!canvas.ready || canvas.scene.id !== sceneId || (selected.target && !canvas.tokens.get(selected.target.id)?.actor)) throw new Error('Сцена або ціль змінилася.');
        if (!await consume(attack,{initial:false,sameActivity:state.castingId===state.attackId,level:state.level})) return;
        // Native attack roll preserves item bonuses, condition modifiers and critical threshold.
        const rolls = await attack.rollAttack({ammunition:false,rolls:[{options:selected.mode==='adv' ? {advantage:true} : selected.mode==='dis' ? {disadvantage:true} : {}}]},
            {configure:false},{create:false,data:{flags:{'dice-so-nice':{skip:true}}}});
        if (!rolls?.length) return;
        const metadata = {...state,role:'bite',target:selected.target?.document.uuid ?? null};
        const data = messageData(actor,metadata);
        await showDice(rolls,data);
        const damage = await new CONFIG.Dice.DamageRoll(`${state.level-2}d12${selected.bonus ? ` + ${selected.bonus}` : ''}`,{},
            {type:'piercing',properties:['mgc'],isCritical:rolls[0].isCritical,
                critical:{multiplyNumeric:game.settings.get('dnd5e','criticalDamageModifiers'),powerfulCritical:game.settings.get('dnd5e','criticalDamageMaxDice'),bonusDamage:attack.damage?.critical?.bonus || undefined}}).evaluate();
        await showDice([damage],data);
        data.rolls = [...rolls,damage];
        data.content = cardHTML({state,target:selected.target,attacks:rolls,damage});
        const target = selected.target;
        if (Number(game.system.version.split('.')[0]) >= 6) {
            data.type = 'damage';
            data.system = {targets:target ? [{actor:target.actor.uuid,token:target.document.uuid,name:target.name,img:target.document.texture?.src}] : []};
        } else data.flags.dnd5e = {messageType:'roll',roll:{type:'damage'},targets:target ? [{uuid:target.actor.uuid,token:target.document.uuid,name:target.name}] : []};
        await ChatMessage.create(data);
        if (target && !data.blind && (!data.whisper?.length || data.whisper.includes(game.user.id))) void animateSnake(target,sceneId);
    } finally {
        try { if (canvas.ready && canvas.scene.id===sceneId) canvas.tokens.setTargets(oldTargets.filter(id=>canvas.tokens.get(id)),{mode:'replace'}); }
        catch (error) {console.warn(`${MODULE_ID} | Restore targets`,error);}
    }
}

export async function poisonFromMessage(message) {
    const s = message.getFlag(MODULE_ID,FLAG);
    if (!game.user.isGM || !message.isContentVisible || message.getFlag(MODULE_ID,'spellCard')?.kind !== KIND || s?.role !== 'bite' || !s.target) return;
    if (poisoning.has(message.id)) return;
    poisoning.add(message.id);
    try {
        const caster = await fromUuid(s.casterUuid);
        const source = sourceEffect(caster,s.castId);
        if (!source) throw new Error('Закляття завершилось; отруєння більше не застосовується.');
        const token = await fromUuid(s.target);
        const target = token?.documentName === 'Token' && token.actor;
        if (!target?.isOwner) throw new Error('Ціль цього укусу недоступна.');
        if (target.system.traits?.ci?.value?.has('poisoned')) return ui.notifications.info('Ціль має імунітет до стану «Отруєний».');
        if (target.effects.some(e=>dataOf(e)?.role==='poison' && dataOf(e).castId===s.castId && !e.disabled)) return ui.notifications.info('Отруєння від цього закляття вже застосовано.');
        // Native factory also sets dnd5e 6's condition model, not just the status icon.
        const definition = (await ActiveEffect.implementation.fromStatusEffect('poisoned')).toObject();
        delete definition.id;delete definition._id;
        const state = dataOf(source);
        await target.createEmbeddedDocuments('ActiveEffect',[{...definition,name:'Отруєний · Зміїний язик',origin:state.itemUuid,disabled:false,
            statuses:['poisoned'],duration:{seconds:state.expires-game.time.worldTime,startTime:game.time.worldTime},
            flags:{...definition.flags,[MODULE_ID]:{[FLAG]:{...state,role:'poison'}}}}]);
        ui.notifications.info('Отруєння застосовано до цілі укусу.');
    } catch (error) {ui.notifications.warn(error.message);} finally {poisoning.delete(message.id);}
}

export function renderSerpentCard(message,html) {
    if (message.getFlag(MODULE_ID,'spellCard')?.kind !== KIND || !message.isContentVisible) return;
    const s = message.getFlag(MODULE_ID,FLAG);
    if (!s) return;
    const content = html.querySelector('.message-content');
    if (!content) return;
    const template = document.createElement('template');template.innerHTML=message.content;
    const card = template.content.querySelector('.fantik-serpent-card');
    if (!card) return;
    const tray = game.user.isGM && s.target ? content.querySelector('damage-application') : null;
    content.replaceChildren(template.content);
    const controls = card.querySelector('[data-serpent-controls]');
    if (!controls) return;
    const button = (label,handler) => {
        const b = document.createElement('button');b.type='button';b.textContent=label;
        b.style.cssText=`height:auto;min-height:30px;padding:5px 8px;margin:2px;border:1px solid ${GOLD};border-radius:5px;background:transparent;color:inherit;font:12px sans-serif;width:auto;`;
        b.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();b.disabled=true;try{await handler();}catch(error){ui.notifications.error(error.message);}finally{b.disabled=false;}});
        controls.append(b);
    };
    if (s.role==='source' && game.user.character?.uuid===s.casterUuid && game.user.character.isOwner) {
        button('Укусити',async()=>useSerpentTongue({item:await fromUuid(s.itemUuid),action:'bite',castId:s.castId}));
        button('Завершити',async()=>useSerpentTongue({item:await fromUuid(s.itemUuid),action:'end',castId:s.castId}));
    }
    if (game.user.isGM && s.role==='bite' && s.target) {
        button('Отруїти · при влучанні',()=>poisonFromMessage(message));
        if (tray) {controls.append(tray);tray.open=true;}
    }
}

let cleaning = false;
export async function cleanupSerpentEffects() {
    if (cleaning) return;
    if (game.users.activeGM ? game.users.activeGM.id !== game.user.id : game.user.isGM === false && !game.user.character?.isOwner) return;
    cleaning=true;
    try {
        const actors = new Map(game.actors.map(a=>[a.uuid,a]));
        for (const scene of game.scenes) for (const token of scene.tokens) if (token.actor) actors.set(token.actor.uuid,token.actor);
        for (const actor of actors.values()) {
            if (!actor.isOwner) continue;
            const ids=[];
            for (const effect of actor.effects) {
                const s=dataOf(effect);
                if (!s) continue;
                const caster=s.role==='poison' ? await fromUuid(s.casterUuid) : actor;
                if (expired(s) || (s.role==='poison' && !sourceEffect(caster,s.castId))) ids.push(effect.id);
            }
            if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect',ids);
        }
    } catch(error) {console.warn(`${MODULE_ID} | Serpent expiry`,error);} finally {cleaning=false;}
}

export function initSerpentTongue() {
    Hooks.on('dnd5e.renderChatMessage',renderSerpentCard);
    for (const hook of ['updateWorldTime','updateCombat','deleteCombat']) Hooks.on(hook,()=>void cleanupSerpentEffects());
    for (const hook of ['createActiveEffect','deleteActiveEffect','updateActiveEffect']) Hooks.on(hook,effect=>{if(dataOf(effect))void cleanupSerpentEffects();});
    Hooks.once('ready',()=>void cleanupSerpentEffects());
}

async function animateSnake(target,sceneId) {
    if (!canvas.ready || canvas.scene.id!==sceneId) return;
    const p=canvas.clientCoordinatesFromCanvas(target.center), el=document.createElement('div');
    el.style.cssText=`position:fixed;left:${p.x}px;top:${p.y}px;width:150px;pointer-events:none;z-index:80;color-scheme:dark;transform:translate(-50%,-50%);`;
    el.innerHTML=snakeImage();document.body.append(el);
    const hook=Hooks.on('canvasTearDown',()=>el.remove());
    try {await el.animate([{opacity:0,scale:'.4',rotate:'-20deg'},{opacity:1,scale:'1.2',rotate:'8deg',offset:.45},{opacity:0,scale:'1',rotate:'0deg'}],{duration:850,easing:'ease-out'}).finished;}
    catch(error){console.warn(`${MODULE_ID} | Serpent visual`,error);}finally{el.remove();Hooks.off('canvasTearDown',hook);}
}

export function pickTarget(run,state) {
  return new Promise((resolve, reject) => {
    // This Foundry 14 build uses PIXI 7's app.view; PIXI 8 exposes app.canvas.
    const board = canvas.app?.view ?? canvas.app?.canvas ?? document.getElementById('board');
    if (!board?.style) return reject(new Error('Полотно сцени ще не готове. Перезавантаж сцену та спробуй знову.'));
    const hud = document.createElement('section');
    hud.id = 'fantik-serpent-picker';
    hud.setAttribute('aria-label', 'Вибір цілі: Зміїний язик');
    hud.style.cssText = `pointer-events:auto;color-scheme:var(--color-scheme,light);position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:10000;width:350px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:12px 14px;background:${PAPER};color:${INK};border:1px solid ${GOLD};border-radius:10px;box-shadow:0 6px 25px #0004;font:13px/1.4 sans-serif;`;
    hud.innerHTML = `<style>
      #fantik-serpent-picker *{box-sizing:border-box}#fantik-serpent-picker button,#fantik-serpent-picker input,#fantik-serpent-picker select{height:29px;min-height:29px;width:auto;padding:3px 7px;margin:0;border:1px solid ${GOLD};border-radius:4px;background:${PAPER};color:${INK};font:12px/1.4 sans-serif;box-shadow:none}
      #fantik-serpent-picker summary{cursor:pointer;list-style:none;padding:3px 6px;color:${GOLD}}#fantik-serpent-picker summary::-webkit-details-marker{display:none}
      #fantik-serpent-picker .serpent-settings{position:absolute;bottom:calc(100% + 10px);left:0;width:100%;max-height:55vh;overflow:auto;padding:14px;border:1px solid ${GOLD};border-radius:9px;background:${PAPER};box-shadow:0 6px 24px #0004}
      #fantik-serpent-picker label{display:grid;gap:5px;margin:0 0 12px;font-size:12px}#fantik-serpent-picker input,#fantik-serpent-picker select{width:100%}#fantik-serpent-picker input[type=checkbox]{width:16px;height:16px;min-height:16px}
      #fantik-serpent-picker button:focus-visible,#fantik-serpent-picker summary:focus-visible{outline:2px solid ${GOLD};outline-offset:3px}
      #fantik-serpent-picker [data-drag]{display:flex;align-items:center;gap:9px;flex:1;min-width:0;cursor:grab;touch-action:none;user-select:none}
      #fantik-serpent-picker [data-untargeted]{font-size:10px;min-height:22px;height:22px;padding:1px 6px;white-space:nowrap}
    </style><div style="display:flex;align-items:center;gap:9px;">
      <div data-drag title="Перетягнути панель"><span style="display:block;width:27px;flex:0 0 27px;">${snakeImage()}</span><strong style="flex:1;font:17px Georgia,serif;">Зміїний язик</strong><span style="font-size:11px;color:${MUTED};">0 / 1</span></div>
      <details><summary aria-label="Налаштування закляття" title="Налаштування">⚙</summary><div class="serpent-settings">
        <label>Атака<select name="mode"><option value="normal">Звичайно</option><option value="adv">Перевага</option><option value="dis">Завада</option></select></label>
        <label>Додатковий бонус шкоди<input name="bonus" type="number" value="0" step="1"></label>
      </div></details><button type="button" data-cancel aria-label="Скасувати вибір" title="Скасувати · Esc">×</button>
    </div><div style="display:flex;align-items:center;gap:8px;margin:7px 0 0 36px;"><div data-hint aria-live="polite" style="flex:1;font-size:11px;color:${MUTED};">Клацни істоту · 10 футів · ${state.level-2}d12</div><button type="button" data-untargeted title="Використати без цілі">Без цілі</button></div>`;
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
      ]) { try {dispose();} catch (e) {console.warn('Serpent Tongue | Picker cleanup', e);} }
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
      const bonus = Number(field('bonus').value);
      if (!Number.isSafeInteger(bonus)) {
        hud.querySelector('details').open = true;
        hud.querySelector('[data-hint]').textContent = 'Вкажи цілий бонус шкоди.';
        return null;
      }
      return {bonus,mode:field('mode').value};
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
        canvas.tokens.setTargets([target.id],{mode:'replace'});
        finish({target,...settings});
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
      hud.querySelector('details').addEventListener('toggle',()=>{
        const panel=hud.querySelector('.serpent-settings');
        const above=hud.getBoundingClientRect().top > panel.offsetHeight+18;
        panel.style.bottom=above?'calc(100% + 10px)':'auto';
        panel.style.top=above?'auto':'calc(100% + 10px)';
      });
      hud.querySelector('[data-untargeted]').addEventListener('click',()=>{
        if (done) return;
        const settings = readSettings();
        if (settings) {try {canvas.tokens.setTargets([],{mode:'replace'});finish({target:null,...settings});} catch(error) {finish(null,error);}}
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

export const serpentTongue = Object.freeze({version:1,use:useSerpentTongue});
