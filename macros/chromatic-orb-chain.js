// Chromatic Orb v3 · черга цілей, покрокові кидки, одна картка.
// Foundry 14 / dnd5e 6. Native damage tray uses existing Fantik API 4; no module update needed.
const ORB_LOCK = Symbol.for('fantik.chromaticOrb.chain');
if (globalThis[ORB_LOCK]) {
  ui.notifications.warn('Chromatic Orb уже відкрито. Заверши поточний ланцюжок.');
  return;
}
const orbRun = {stop:false};
globalThis[ORB_LOCK] = orbRun;
const orbEsc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ORB_SPHERE_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 340 104\"><defs><radialGradient id=\"g\"><stop stop-color=\"#a7baff\" stop-opacity=\".36\"/><stop offset=\"1\" stop-color=\"#b4a0ff\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"h\" cx=\".3\" cy=\".2\"><stop stop-color=\"#fff\" stop-opacity=\".5\"/><stop offset=\".7\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient></defs><ellipse cx=\"170\" cy=\"51\" rx=\"83\" ry=\"51\" fill=\"url(#g)\"/><polygon points=\"191.73,85.99 207.11,72.72 188.71,88.16\" fill=\"#12564f\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"207.11,72.72 211.33,48.99 211.40,52.97\" fill=\"#2b166b\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"132.89,29.28 128.60,49.03 128.67,53.01\" fill=\"#27be6e\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"148.27,16.01 151.29,13.84 132.89,29.28\" fill=\"#2b48d2\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"211.40,52.97 211.33,48.99 207.11,30.34\" fill=\"#6e1b83\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"148.27,16.01 170.00,8.62 151.29,13.84\" fill=\"#7a2fd4\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"170.00,93.38 163.17,89.40 148.27,88.11\" fill=\"#417317\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"140.24,75.98 132.89,71.66 148.27,88.11\" fill=\"#62921e\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"188.71,88.16 163.17,89.40 170.00,93.38\" fill=\"#1d7117\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"128.67,53.01 132.89,71.66 140.24,75.98\" fill=\"#51b024\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"191.73,13.89 188.71,19.59 207.11,30.34\" fill=\"#bf2795\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"170.00,8.62 188.71,19.59 191.73,13.89\" fill=\"#d22bb1\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"207.11,72.72 200.28,68.75 188.71,88.16\" fill=\"#19677b\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"207.11,72.72 211.40,52.97 200.28,68.75\" fill=\"#1b2784\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"148.27,88.11 163.17,89.40 140.24,75.98\" fill=\"#5e981f\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"132.89,29.28 128.67,53.01 140.24,33.60\" fill=\"#38d6b5\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"148.27,16.01 132.89,29.28 140.24,33.60\" fill=\"#4494d9\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"207.11,30.34 200.28,42.55 211.40,52.97\" fill=\"#8d23ac\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"148.27,16.01 163.17,20.83 170.00,8.62\" fill=\"#904bda\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"188.71,19.59 200.28,42.55 207.11,30.34\" fill=\"#c829c9\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"163.17,20.83 188.71,19.59 170.00,8.62\" fill=\"#c148da\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"188.71,88.16 180.11,79.23 163.17,89.40\" fill=\"#1f9539\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"141.09,56.39 128.67,53.01 140.24,75.98\" fill=\"#33d42d\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"200.28,68.75 211.40,52.97 200.28,42.55\" fill=\"#4023ad\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"188.71,88.16 200.28,68.75 180.11,79.23\" fill=\"#209a88\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"148.27,16.01 140.24,33.60 163.17,20.83\" fill=\"#586add\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"140.24,33.60 128.67,53.01 141.09,56.39\" fill=\"#45d991\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"163.17,89.40 158.95,70.76 140.24,75.98\" fill=\"#42bc26\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"163.17,89.40 180.11,79.23 158.95,70.76\" fill=\"#26ba3e\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"140.24,75.98 158.95,70.76 141.09,56.39\" fill=\"#32d537\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"188.71,19.59 180.11,34.67 200.28,42.55\" fill=\"#a641d8\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"163.17,20.83 180.11,34.67 188.71,19.59\" fill=\"#a555dc\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"200.28,68.75 200.28,42.55 181.88,57.99\" fill=\"#2a41cb\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"180.11,79.23 200.28,68.75 181.88,57.99\" fill=\"#28a6c2\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"140.24,33.60 158.95,44.57 163.17,20.83\" fill=\"#6294df\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"140.24,33.60 141.09,56.39 158.95,44.57\" fill=\"#5addd3\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"181.88,57.99 158.95,70.76 180.11,79.23\" fill=\"#2ed4ab\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"181.88,57.99 200.28,42.55 180.11,34.67\" fill=\"#5242d8\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"158.95,44.57 141.09,56.39 158.95,70.76\" fill=\"#4edba5\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"163.17,20.83 158.95,44.57 180.11,34.67\" fill=\"#6265df\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"158.95,44.57 158.95,70.76 181.88,57.99\" fill=\"#4bdad9\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><polygon points=\"180.11,34.67 158.95,44.57 181.88,57.99\" fill=\"#5682dc\" stroke=\"#e5f5ff\" stroke-opacity=\".22\" stroke-width=\".55\"/><circle cx=\"170\" cy=\"51\" r=\"42\" fill=\"url(#h)\"/><g fill=\"#c5d4ff\"><circle cx=\"99\" cy=\"60\" r=\"1.2\"/><circle cx=\"235\" cy=\"35\" r=\"1.5\"/><circle cx=\"220\" cy=\"77\" r=\".8\"/></g></svg>";
const orbTypes = {
  acid:{label:'Кислота',color:'#b9ed72',vfx:'#c4ff42'}, cold:{label:'Холод',color:'#8bdcff',vfx:'#76d5ff'},
  fire:{label:'Вогонь',color:'#ffae77',vfx:'#ff8c35'}, lightning:{label:'Блискавка',color:'#b6a3ff',vfx:'#b292ff'},
  poison:{label:'Отрута',color:'#77e3b5',vfx:'#52ec86'}, thunder:{label:'Грім',color:'#f1a5e0',vfx:'#df9cf4'}
};
let orbUI, orbVisual, orbScene, orbOldTargets=[], orbTeardown;
let orbCaster, orbCasterToken, orbActivity, orbSpell, orbState;
let orbPreferenceSave = Promise.resolve();
const orbPendingMessages = [];
const orbRecoveryRolls = [];
try {
  const casterChoice = await orbResolveCaster();
  if (!casterChoice) return;
  ({caster:orbCaster,token:orbCasterToken} = casterChoice);
  orbScene = globalThis.canvas?.ready ? canvas.scene?.id : null;
  orbOldTargets = [...(game.user.targets ?? [])].map(t => t.id);
  orbResolveBinding();
  const sources = orbSources();
  const slots = orbCaster?.system.spells ?? {};
  orbState = {
    phase:'plan', level:1, slotKey:'spell1', type:orbRememberedType(), mode:'normal',
    ability:sources[0]?.value ?? '', sources,
    manualBonus:'', consume:false, resources:'none', index:0, rows:[], used:new Set(),
    origin:orbCasterToken, hover:null, flight:null, overrideRange:false, effects:true,
    castId:foundry.utils.randomID(), privacy:orbPrivacy(), last:null, committed:false,
    queue:[],message:null,cardId:foundry.utils.randomID()
  };
  orbState.consume = !!(orbCaster?.isOwner && (orbActivity || Number(slots.spell1?.value) > 0));
  if (orbActivity && !orbCanPay()) orbState.consume = false;
  orbUI = orbCreateUI();
  try { orbVisual = orbCreateVisual(); }
  catch (error) { console.warn('Chromatic Orb | Scene overlay unavailable', error); }
  orbTeardown = Hooks.on('canvasTearDown', () => {
    orbRun.stop = true;
    void orbVisual?.destroy();
    orbUI?.signal({action:'end'});
  });
  orbRefresh();
  while (!orbRun.stop) {
    let choice = await orbUI.wait();
    if (!choice || choice.action === 'end') break;
    if (choice.action === 'undo') { orbState.queue.pop(); orbState.hover=null; orbRefresh(); continue; }
    if (choice.action === 'add') {
      if (!orbTargetStatus(choice.target).allowed) continue;
      orbState.queue.push({target:choice.target,mode:orbState.mode});orbState.hover=null;orbRefresh();
      if (orbState.queue.length<orbState.level+1) continue;
      choice={action:'start'};
    }
    if (choice.action === 'start' || choice.action === 'leap') {
      const next=orbState.queue[orbState.index];
      if (!next) { orbUI.hint('Чергу завершено.');continue; }
      const live=orbSceneReady() && canvas.tokens.get(next.target.id);
      if (!live?.actor || !live.isVisible) {orbUI.hint('Наступна ціль недоступна. Заверши ланцюжок або використай «Без цілі».');continue;}
      orbState.mode=next.mode;
      choice={action:'cast',target:live};
    }
    if (choice.action !== 'cast') continue;
    let target = choice.target ?? null;
    if (target && !orbTargetStatus(target,{committing:true}).allowed) { orbUI.hint('Ціль змінила відстань. Доступний перемикач «Ігнорувати відстань».'); continue; }
    const attackData = orbAttackData();
    if (!attackData && !choice.cardOnly) {
      orbUI.hint('Вкажи джерело заклять або ручний бонус у ⚙.');
      continue;
    }
    orbState.phase='rolling'; orbRefresh();
    if (!orbState.committed) {
      if (!await orbConsume()) break;
      orbState.committed=true;
    }
    // A scene change during consumption must not discard a paid cast.
    if (orbRun.stop || !orbSceneReady()) target=null;
    if (!target) { orbState.queue.length=orbState.index;orbState.hover=null; orbState.origin=null; await orbVisual?.clear(); }
    if (target) {
      orbState.used.add(orbIdentity(target));
      orbSetTargets([target.id]);
      await orbVisual?.fly(orbState.origin, target);
      orbState.origin=target;
      orbState.hover=null;
    }
    orbState.index++;
    if (choice.cardOnly) {
      await orbPublish({target:null,cardOnly:true});
      break;
    }
    // Every evaluated die is retained; damage remains a separate typed Roll.
    let attack = await orbEvaluateAttack(attackData);
    attack = await orbResolveDice(attack, 'Атака');
    orbRecoveryRolls.push(attack);
    const natural = orbNatural(attack);
    const critical = attack.isCritical ?? (natural >= attackData.critical);
    const Damage = CONFIG.Dice?.DamageRoll ?? Roll;
    const damageOptions = {type:orbState.type,properties:['mgc'],isCritical:critical,
      critical:{multiplyNumeric:orbSetting('dnd5e','criticalDamageModifiers',false),
        powerfulCritical:orbSetting('dnd5e','criticalDamageMaxDice',false),
        bonusDamage:orbActivity?.damage?.critical?.bonus ?? ''}};
    let damage = await new Damage(`${(orbState.level+2)*(Damage===Roll && critical?2:1)}d8`, {}, damageOptions).evaluate();
    damage = await orbResolveDice(damage, 'Шкода');
    orbRecoveryRolls.push(damage);
    const values = damage.dice.filter(d => d.faces === 8).flatMap(d => d.results)
      .filter(orbRetained).map(r => r.result);
    const doubles = [...new Set(values.filter((v,i) => values.indexOf(v) !== i))];
    const row = {id:foundry.utils.randomID(),target,attack,damage,natural,critical,doubles};
    await orbPublish(row);
    orbRecoveryRolls.length=0;
    orbState.rows.push(row); orbState.last=row; orbState.origin=target;
    // No hidden results in the local HUD, including duplicate/critical indicators.
    if (!target || orbRun.stop || !orbSceneReady() || orbState.index>=orbState.queue.length
      || (orbMaySee() && (!doubles.length || natural===1))) break;
    orbState.mode=orbState.queue[orbState.index]?.mode ?? orbState.mode;
    orbState.phase='decision'; orbRefresh();
  }
} catch (error) {
  console.error('Chromatic Orb', error);
  ui.notifications.error(`Chromatic Orb: ${error.message ?? error}`);
  if (orbRecoveryRolls.length && !error.orbDeliveryCancelled) {
    // Preserve completed rolls even when a later animation, roll or publication fails.
    try { await orbSend({speaker:orbSpeaker(),rolls:orbRecoveryRolls,...orbState.privacy,
      content:'<p>Chromatic Orb · збережені кидки</p>',flags:{'dice-so-nice':{skip:true}}}); }
    catch (saveError) { console.error('Chromatic Orb | Unpublished rolls',orbRecoveryRolls,saveError); }
  }
} finally {
  try { orbUI?.destroy(); } catch (error) { console.warn(error); }
  try { await orbVisual?.destroy(); } catch (error) { console.warn(error); }
  try { if (orbTeardown != null) Hooks.off('canvasTearDown',orbTeardown); } catch {}
  try { if (orbSceneReady()) orbSetTargets(orbOldTargets.filter(id=>canvas.tokens.get(id))); } catch {}
  await orbPreferenceSave;
  if (globalThis[ORB_LOCK] === orbRun) delete globalThis[ORB_LOCK];
}

function orbRememberedType() {
  try {
    const type=game.user.getFlag?.('world','fantikChromaticOrbType');
    return Object.hasOwn(orbTypes,type)?type:'lightning';
  } catch { return 'lightning'; }
}
function orbRememberType(type) {
  if(!Object.hasOwn(orbTypes,type))return;
  // Serialize rapid changes so an older selection cannot overwrite the latest.
  orbPreferenceSave=orbPreferenceSave.then(()=>game.user.setFlag('world','fantikChromaticOrbType',type))
    .catch(error=>{
      console.warn('Chromatic Orb | Could not save element preference',error);
      ui.notifications.warn('Не вдалося запам’ятати стихію. Поточний вибір залишається доступним.');
    });
}
function orbSetting(namespace,key,fallback) { try { return game.settings.get(namespace,key) ?? fallback; } catch { return fallback; } }
function orbSceneReady() { return !!(orbScene && globalThis.canvas?.ready && canvas.scene?.id === orbScene); }
function orbSetTargets(ids) { if (orbSceneReady()) { try { canvas.tokens.setTargets(ids,{mode:'replace'}); } catch (e) { console.warn('Chromatic Orb | Targets',e); } } }
function orbRetained(r) { return r.active !== false && !r.discarded; }
function orbNatural(roll) { return roll.dice.find(d=>d.faces===20)?.results.find(orbRetained)?.result; }
function orbIdentity(t) { return t.document?.actorLink ? t.actor.uuid : t.document?.uuid ?? t.id; }
function orbPrivacy() {
  const data={}; ChatMessage.applyMode(data);
  return {whisper:data.whisper ?? [],blind:!!data.blind};
}
function orbMaySee() { return !orbState.privacy.blind || orbState.privacy.whisper.some(u=>(u.id??u)===game.user.id); }
function orbSpeaker() {
  return ChatMessage.getSpeaker(orbCaster ? {actor:orbCaster,...(orbCasterToken ? {
    token:orbCasterToken.document,scene:orbCasterToken.document.parent}: {})} : {alias:game.user.name});
}
async function orbResolveCaster() {
  const controlled=(globalThis.canvas?.tokens?.controlled ?? []).filter(t=>t.actor);
  if (controlled.length === 1) return {caster:controlled[0].actor,token:controlled[0]};
  if (controlled.length > 1) {
    const selected=await foundry.applications.api.DialogV2.wait({window:{title:'Chromatic Orb · заклинач'},
      content:`<select name="caster">${controlled.map((t,i)=>`<option value="${i}">${orbEsc(t.name)}</option>`).join('')}<option value="manual">Без персонажа</option></select>`,
      buttons:[{action:'choose',label:'Обрати',default:true,callback:(_e,b)=>b.form.elements.caster.value},
        {action:'cancel',label:'Скасувати',callback:()=>null}],rejectClose:false});
    if (selected == null) return null;
    const t=controlled[Number(selected)];
    return selected==='manual' ? {caster:null,token:null} : {caster:t.actor,token:t};
  }
  const caster=game.user.character ?? null;
  // An assigned actor may have several scene tokens; do not invent a spatial origin.
  const tokens=(globalThis.canvas?.tokens?.placeables ?? []).filter(t=>t.actor===caster && t.isVisible);
  return {caster,token:tokens.length===1 ? tokens[0] : null};
}
function orbResolveBinding() {
  if (!orbCaster) return;
  const supplied=typeof item !== 'undefined' ? item : null;
  const suppliedActivity=typeof activity !== 'undefined' ? activity : null;
  const matches=Array.from(orbCaster.items ?? []).filter(i=>i.system?.identifier==='chromatic-orb'
    || /^(chromatic orb|хроматична (?:сфера|куля))$/i.test(i.name));
  orbSpell=supplied?.actor?.uuid===orbCaster.uuid ? supplied : matches.length===1 ? matches[0] : null;
  const activities=Array.from(orbSpell?.system.activities?.values?.() ?? []);
  const attacks=activities.filter(a=>a.type==='attack');
  orbActivity=suppliedActivity?.item?.uuid===orbSpell?.uuid && suppliedActivity?.actor?.uuid===orbCaster.uuid
    ? suppliedActivity : attacks.length===1 ? attacks[0] : null;
}
function orbSources() {
  if (!orbCaster) return [];
  const explicit=orbActivity?.attack?.ability || orbSpell?.system.ability;
  const keys=new Set();
  if (explicit && orbCaster.system.abilities?.[explicit]) keys.add(explicit);
  else {
    const configured=orbCaster.system.attributes?.spellcasting;
    if (configured) keys.add(configured);
    for (const cls of Object.values(orbCaster.spellcastingClasses ?? {})) {
      const key=cls.spellcasting?.ability ?? cls.system?.spellcasting?.ability;
      if (key) keys.add(key);
    }
  }
  const labels={int:'Інтелект',wis:'Мудрість',cha:'Харизма',str:'Сила',dex:'Спритність',con:'Статура'};
  return [...keys].filter(k=>orbCaster.system.abilities?.[k]).map(value=>({value,label:labels[value]??value}));
}
function orbAttackData() {
  try {
    if (!orbCaster || !orbState.sources.length) {
      if (String(orbState.manualBonus).trim()==='') return null;
      const bonus=Number(orbState.manualBonus);
      return Number.isSafeInteger(bonus) ? {parts:[String(bonus)],data:{},options:{},critical:20} : null;
    }
    const ability=orbState.ability;
    if (!ability) return null;
    let data=orbCaster.getRollData();
    data={...data,mod:orbCaster.system.abilities[ability].mod,
      roll:{type:'attack',ability,actionType:'rsak'}};
    const fields=game.dnd5e?.dataModels?.shared?.D20RollModificationField;
    if (!fields?.combineFields) throw new Error('Немає API бонусів атаки');
    const options=fields.combineFields(orbCaster.system,[`abilities.${ability}.attack.roll`,'rolls.attack','rolls.attack.rsak'],
      {rules:{category:'attack',actor:orbCaster,item:orbSpell ?? undefined,rollData:data}});
    let parts;
    if (orbActivity?.getAttackData) ({parts,data}=orbActivity.getAttackData({ability}));
    else {
      const prof=orbCaster.system.attributes.prof;
      const proficiency=typeof prof==='object' ? prof.term : prof;
      if (proficiency == null || !Number.isFinite(Number(data.mod))) throw new Error('Невідомий бонус');
      parts=[String(data.mod),String(proficiency),options.bonus].filter(p=>p!=null && p!=='');
      orbCaster.addConditionRollReduction?.(parts,data);
    }
    const critical=Number(orbActivity?.criticalThreshold ?? orbCaster.flags?.dnd5e?.spellCriticalThreshold ?? 20);
    return {parts,data,options,critical:Number.isFinite(critical)?critical:20};
  } catch (error) {
    console.warn('Chromatic Orb | Automatic attack unavailable',error);
    const bonus=String(orbState.manualBonus).trim();
    return bonus!=='' && Number.isSafeInteger(Number(bonus)) ? {parts:[bonus],data:{},options:{},critical:20} : null;
  }
}
async function orbEvaluateAttack(info) {
  let {advantage,disadvantage}=info.options;
  if (orbState.mode!=='auto') { advantage=orbState.mode==='adv'; disadvantage=orbState.mode==='dis'; }
  const options={...info.options,advantage:!!advantage,disadvantage:!!disadvantage,criticalSuccess:info.critical,
    criticalFailure:1,elvenAccuracy:!!orbCaster?.getFlag?.('dnd5e','elvenAccuracy') && ['dex','int','wis','cha'].includes(orbState.ability)};
  const Class=CONFIG.Dice?.D20Roll;
  const formula=['1d20',...info.parts].join(' + ');
  if (Class) return new Class(formula,info.data,options).evaluate();
  const die=advantage && !disadvantage ? '2d20kh1' : disadvantage && !advantage ? '2d20kl1' : '1d20';
  return new Roll([die,...info.parts].join(' + '),info.data).evaluate();
}

function orbCanPay() {
  if (!orbCaster?.isOwner) return false;
  if (!orbActivity) return Number(orbCaster.system.spells?.[orbState.slotKey]?.value)>0;
  if (orbActivity.consumption?.spellSlot && orbActivity.requiresSpellSlot
    && !(Number(orbCaster.system.spells?.[orbState.slotKey]?.value)>0)) return false;
  for (const target of orbActivity.consumption?.targets ?? []) {
    if (target.type==='itemUses' && !target.target && Number(orbSpell.system.uses?.value)===0) return false;
  }
  return true;
}
async function orbConsume() {
  if (!orbState.consume) { orbState.resources='none'; return true; }
  let attempted=false;
  try {
    if (!orbCaster?.isOwner) throw new Error('Немає доступу до ресурсів персонажа.');
    if (orbActivity?.consume && orbActivity?._prepareUsageConfig) {
      const usage=orbActivity._prepareUsageConfig({create:false,concentration:false,
        spell:{slot:orbState.slotKey},scaling:Math.max(0,orbState.level-Number(orbSpell.system.level ?? 1))});
      if (!usage.hasConsumption) { orbState.resources='none'; return true; }
      // The native activity validates every linked resource before its bulk update.
      attempted=true;
      const result=await orbActivity.consume(usage,{create:false,data:{}});
      if (result===false) throw new Error('Система не підтвердила списання. Перевір ресурси вручну.');
    } else {
      const entry=orbCaster.system.spells?.[orbState.slotKey];
      const available=Number(entry?.value);
      if (!Number.isFinite(available) || available<1) throw new Error('Немає доступної чарунки цього рівня.');
      attempted=true;
      const updated=await orbCaster.update({[`system.spells.${orbState.slotKey}.value`]:available-1});
      if (!updated) throw new Error('Списання не підтверджено. Перевір ресурси вручну.');
    }
    orbState.resources='spent'; return true;
  } catch (error) {
    orbState.resources=attempted?'uncertain':'none';
    const keep=await foundry.applications.api.DialogV2.wait({window:{title:'Chromatic Orb · ресурси'},
      content:`<p>${orbEsc(error.message)}</p>`,buttons:[
        {action:'continue',label:'Кастувати без списання',default:true,callback:()=>true},
        {action:'cancel',label:'Скасувати',callback:()=>false}],rejectClose:false});
    // Never retry an uncertain mutation, including after returning to the picker.
    orbState.consume=false;
    return !!keep;
  }
}

async function orbResolveDice(roll,label) {
  const dsn=game.modules.get('dice-so-nice');
  if (!dsn?.active || !game.dice3d?.showForRoll) return roll;
  const privacy=orbState.privacy;
  const publicRoll=!privacy.blind && !privacy.whisper.length;
  const probe=new ChatMessage({speaker:orbSpeaker(),rolls:[roll],...privacy});
  // Verified DSN 6.3.1 pending lifecycle: register before creating the message,
  // let physical throws settle, then read the final document rather than cached dice.
  const pending=game.dice3d.pendingThrows;
  if (publicRoll && pending?.shouldStampInteractive?.(probe)) {
    const id=foundry.utils.randomID();
    let complete, deleted;
    const wait=new Promise(resolve=>{complete=resolve;});
    const hook=Hooks.on('diceSoNiceRollComplete',messageId=>{if(messageId===id)complete();});
    const removed=Hooks.on('deleteChatMessage',message=>{if(message.id===id){deleted=true;complete();}});
    try {
      const message=await ChatMessage.create({_id:id,speaker:orbSpeaker(),rolls:[roll],...privacy,
        content:`<p>Chromatic Orb · ${orbEsc(label)}</p>`},{keepId:true});
      if (!message) throw new Error('Не вдалося створити інтерактивний кидок.');
      orbPendingMessages.push(message);
      if (message.getFlag('dice-so-nice','interactiveThrow')?.state==='pending' || pending.isPending(id)) await wait;
      // For a race where rendering completed during create(), the hook already resolved.
      else await orbWaitQueue();
      if (deleted) throw new Error('Кидок видалено. Ланцюжок завершено.');
      const finalRoll=game.messages.get(id)?.rolls[0] ?? message.rolls[0];
      // DSN's interactive cap is per bucket. Display any omitted dice afterwards
      // from their recorded results; never change the cap or re-evaluate them.
      const buckets=game.dice3d.pipeline?._buildRollList?.([finalRoll]) ?? [finalRoll];
      for (const bucket of buckets) {
        const cap=orbDiceCap();
        if (bucket.dice.reduce((n,d)=>n+d.results.length,0)>cap) {
          for (const batch of orbDiceBatches(bucket,cap)) {
            await game.dice3d.showForRoll(batch,game.user,true,null,false,null,orbSpeaker());
            await orbWaitQueue();
          }
        }
      }
      return finalRoll;
    } finally { Hooks.off('diceSoNiceRollComplete',hook); Hooks.off('deleteChatMessage',removed); }
  }
  const viewers=publicRoll?null:[...new Set([...privacy.whisper.map(u=>u.id??u),...(!privacy.blind?[game.user.id]:[])])];
  if (!publicRoll && !viewers.length) return roll;
  try {
    for (const batch of orbDiceBatches(roll)) {
      await game.dice3d.showForRoll(batch,game.user,true,viewers,!orbMaySee(),null,orbSpeaker());
    // DSN's public Promise resolves early with "immediately display messages".
    // Await its actual accumulator/queue state too; never change the user's setting.
      if (orbMaySee()) await orbWaitQueue();
    }
  } catch (error) {
    console.warn('Chromatic Orb | Dice So Nice',error);
    ui.notifications.warn('3D-кубики недоступні; кидок збережено.');
  }
  return roll;
}
function orbDiceCap() {
  const value=Number(orbSetting('dice-so-nice','maxDiceNumber',100));
  // DSN 6.3.1 stops before the result whose index equals maxDiceNumber.
  return Number.isFinite(value) && value>1 ? Math.floor(value)-1 : 99;
}
function orbDiceBatches(roll,skip=0) {
  const cap=orbDiceCap(),count=roll.dice.reduce((n,d)=>n+d.results.length,0);
  if (!skip && count<=cap) return [roll];
  if (!Roll.fromTerms || !foundry.dice?.terms?.RollTerm?.fromData) return [roll];
  const batches=[];let offset=0;
  for (const die of roll.dice) {
    const start=Math.max(0,skip-offset);offset+=die.results.length;
    for (let i=start;i<die.results.length;i+=cap) {
      const results=die.results.slice(i,i+cap).map(r=>({...r,hidden:false}));
      const data={...die.toJSON(),number:results.length,results,evaluated:true};
      const term=foundry.dice.terms.RollTerm.fromData(data);
      // Display views are reconstructed from evaluated terms, not random rolls.
      batches.push(Roll.fromTerms([term],{...roll.options}));
    }
  }
  return batches;
}
async function orbWaitQueue() {
  const queue=game.dice3d?.queue;
  if (!queue?.idle || !queue.nextAnimation) return;
  // Read-only adapter verified against 6.3.1. Wait on real completion state.
  while (queue.nextAnimation._items?.length || queue.nextAnimation._isProcessing || queue.hiddenAnimationQueue?.length) {
    await new Promise(resolve=>setTimeout(resolve,32));
  }
  await queue.idle();
}

function orbBreakdown(roll,{attack=false,doubles=[]}={}) {
  return roll.dice.map(d=>`d${d.faces}: ${d.results.map(r=>{
    const keep=orbRetained(r);
    const color=attack && d.faces===20 && r.result===20?'#62d9a0':attack && d.faces===20 && r.result===1?'#ff919a':'inherit';
    return `<span style="display:inline-block;${!keep?'text-decoration:line-through;opacity:.5;':''}color:${color};${d.faces===8&&keep&&doubles.includes(r.result)?'border-bottom:2px solid currentColor;':''}">${orbEsc(r.result)}</span>`;
  }).join(' · ')}`).join('<br>');
}
function orbDieIcon(faces) {
  const path=faces===20?'M12 1 22 7 22 18 12 23 2 18 2 7ZM12 1 6 9 18 9ZM2 7 6 9 2 18M22 7 18 9 22 18M6 9 12 19 18 9M2 18 12 19 22 18M12 19 12 23':'M12 1 22 12 12 23 2 12ZM12 1 9 12 12 23M2 12 9 12 22 12M12 1 22 12 12 23';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="#d8d4ce" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
  return `<img alt="d${faces}" src="data:image/svg+xml,${encodeURIComponent(svg)}" style="display:inline-block;width:23px;height:23px;border:0;margin:0;vertical-align:middle;">`;
}
function orbTooltip(roll) {
  const dice=[...roll.dice],formula=String(roll.formula),parts=[];
  let cursor=0;
  const values=die=>die.results.map(r=>orbRetained(r)?orbEsc(r.result):`<s style="opacity:.6;">${orbEsc(r.result)}</s>`).join(' | ');
  for(const match of formula.matchAll(/\b\d*d(\d+)(?:[a-z]+(?:[<>=]+\d+|\d+)?)*/gi)){
    const index=dice.findIndex(d=>d.faces===Number(match[1]));
    if(index<0)continue;
    const die=dice.splice(index,1)[0];
    // One retained d20, with both/all advantage dice shown beside it.
    const label=die.faces===20&&/k[hl]1\b/i.test(match[0])?'1d20':match[0];
    parts.push(orbEsc(formula.slice(cursor,match.index)),`${orbEsc(label)}(${values(die)})`);
    cursor=match.index+match[0].length;
  }
  parts.push(orbEsc(formula.slice(cursor)),` = <b>${orbEsc(roll.total)}</b>`);
  // Keep any additional dice exposed by custom terms visible as well.
  for(const die of dice)parts.push(`<br>${orbEsc(die.expression??`d${die.faces}`)}(${values(die)})`);
  return `<span style="overflow-wrap:anywhere;">${parts.join('')}</span>`;
}
function orbAnchor(roll,color='#f4efff',faces=null) {
  const anchor=roll.toAnchor({classes:['inline-dsn-hidden'],dataset:{tooltipHtml:orbTooltip(roll)},attrs:{style:`display:inline-flex;align-items:center;gap:6px;color:${color};background:transparent;border:0;padding:0;font-weight:700;`}});
  if(faces)anchor.innerHTML=`${orbDieIcon(faces)}<span>${orbEsc(roll.total)}</span>`;
  return anchor.outerHTML;
}
function orbArt() {
  const svg=ORB_SPHERE_SVG;
  return `<img alt="Хроматична полігональна сфера" src="data:image/svg+xml,${encodeURIComponent(svg)}" style="display:block;width:100%;height:82px;object-fit:contain;border:0;margin:0;">`;
}
function orbCard(row) {
  const rows=row.cardOnly?orbState.rows:[...orbState.rows,row];
  const {color,label}=orbTypes[orbState.type];
  return `<section class="fantik-spell-card" style="box-sizing:border-box;overflow:hidden;background:#202326;color:#f4efe5;border:1px solid #81745d;border-radius:9px;padding:12px;font:12px/1.45 sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;color:#c6b48d;font-size:9px;letter-spacing:1.2px;"><span>CHROMATIC ORB</span><span style="white-space:nowrap;">${orbState.level} РІВЕНЬ</span></div>
    ${orbArt()}<div style="font:20px/1.2 Georgia,serif;text-align:center;margin:0 0 9px;">Хроматична сфера</div>
    <div style="color:${color};font-size:10px;text-align:center;margin-bottom:10px;">${label} · ${rows.length} / ${orbState.level+1}</div>
    ${rows.length?rows.map((r,i)=>`<div style="border-top:1px solid #575348;padding-top:10px;margin-top:10px;">
      <div style="display:flex;gap:7px;align-items:baseline;"><span style="color:#c6b48d;font-size:10px;">${String(i+1).padStart(2,'0')}</span><b style="font:15px/1.3 Georgia,serif;overflow-wrap:anywhere;">${orbEsc(r.target?.name??'Без цілі')}</b></div>
      <div data-orb-totals style="display:flex;align-items:center;gap:22px;margin-top:7px;font-size:25px;line-height:1.2;">${orbAnchor(r.attack,r.natural===1?'#ee9b96':r.critical?'#a6dfc4':'#f4efe5',20)}${orbAnchor(r.damage,color,8)}</div>
      <div style="font-size:10px;color:#c6b48d;margin-top:5px;">${r.critical?'Крит · ':''}${r.doubles.length?`Дубль: ${r.doubles.join(', ')}`:'Без дубля'}</div>
    </div>`).join(''):'<div style="text-align:center;color:#b9b5ac;">Без цілі</div>'}
    <div data-fantik-damage style="margin-top:10px;"></div>
  </section>`;
}
async function orbPublish(row) {
  const rows=row.cardOnly?orbState.rows:[...orbState.rows,row];
  const allRolls=rows.flatMap(r=>[r.attack,r.damage]);
  const native=game.modules.get('fantik-automations')?.active
    && Number(game.modules.get('fantik-automations').api?.spellCards?.version)>=4;
  const target=row.target?{token:row.target.document.uuid,actor:row.target.actor.uuid,
    name:row.target.name,img:row.target.document.texture?.src??''}:null;
  const targets=target?[target]:[];
  // The native tray aggregates message.rolls. Feed it ONLY this step's damage.
  // Preserve the entire chain, with evaluated dice, in history and inline anchors.
  const rolls=native?(row.damage?[row.damage]:[]):allRolls;
  const history=rows.map(r=>({id:r.id,target:r.target?{token:r.target.document.uuid,
    actor:r.target.actor.uuid,name:r.target.name}:null,attack:r.attack.toJSON(),damage:r.damage.toJSON()}));
  const data={speaker:orbSpeaker(),content:orbCard(row),rolls,...orbState.privacy,
    ...(native&&row.damage?{type:'damage',system:{targets}}:{}),
    flags:{'dice-so-nice':{skip:true},'fantik-automations':{spellCard:{version:2,targets,damage:!!row.damage}},
      world:{fantikChromaticOrb:{version:3,castId:orbState.castId,level:orbState.level,damageType:orbState.type,
        resources:orbState.resources,actor:orbCaster?.uuid??null,history,active:row.damage?row.id:null}}}};
  if (orbState.message) {
    await orbSend({content:data.content,rolls:data.rolls,
      ...(native?{'system.targets':targets}:{}),
      'flags.dice-so-nice.skip':true,'flags.fantik-automations.spellCard':data.flags['fantik-automations'].spellCard,
      'flags.world.fantikChromaticOrb':data.flags.world.fantikChromaticOrb},orbState.message);
  } else orbState.message=await orbSend({...data,_id:orbState.cardId});
  orbRecoveryRolls.length=0;
  for (const pending of orbPendingMessages.splice(0)) {try {await pending.delete();}catch{}}
}
async function orbSend(data, existing=null) {
  for (;;) {
    try {
      const message=existing ? await existing.update(data) : await ChatMessage.create(data,{keepId:true});
      if (!message) throw new Error('Сервер не підтвердив створення картки.');
      return message;
    } catch (error) {
      // A retry publishes the same rolls and never repeats consumption or evaluation.
      console.error('Chromatic Orb | Card data retained',data,error);
      const retry=await foundry.applications.api.DialogV2.wait({window:{title:'Chromatic Orb · картка'},
        content:'<p>Картку не підтверджено. Перевір чат перед повторенням. Кидки збережено в пам’яті та консолі.</p>',
        buttons:[{action:'retry',label:'Повторити надсилання',default:true,callback:()=>true},
          {action:'cancel',label:'Завершити',callback:()=>false}],rejectClose:false});
      if (!retry) { globalThis[Symbol.for('fantik.chromaticOrb.unsent')]=data; error.orbDeliveryCancelled=true; throw error; }
    }
  }
}

function orbTokens() {
  return orbSceneReady() ? canvas.tokens.placeables.filter(t=>t.actor && t.isVisible && t.visible!==false) : [];
}
function orbUnits() {
  const units=String(globalThis.canvas?.scene?.grid?.units??'ft').toLowerCase();
  return {units,metric:/^(m|м|met(?:er|re)s?|метр[иів]*)$/.test(units)};
}
function orbRange() { return (orbUnits().metric?9:30)*(orbState.index?1:2); }
function orbDistance(a,b) {
  if (!a || !b || !orbSceneReady()) return null;
  try { return canvas.grid.measurePath([a.center,b.center]).distance; } catch { return null; }
}
function orbTargetStatus(t) {
  const committing=arguments[1]?.committing;
  const planning=orbState.phase==='plan' && !committing;
  const used=orbState.used.has(orbIdentity(t)) || (planning && orbState.queue.some(q=>orbIdentity(q.target)===orbIdentity(t)));
  const origin=planning ? orbState.queue.at(-1)?.target ?? orbCasterToken : orbState.origin;
  const distance=orbDistance(origin,t);
  const limit=planning && orbState.queue.length ? (orbUnits().metric?9:30) : orbRange();
  const out=distance!=null && distance>limit+1e-6;
  return {allowed:!used && (!out || orbState.overrideRange),used,out,distance};
}
function orbHit(event) {
  if (!orbSceneReady()) return null;
  const p=canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
  return [...orbTokens()].reverse().find(t=>p.x>=t.x && p.x<=t.x+t.w && p.y>=t.y && p.y<=t.y+t.h)??null;
}
function orbRefresh() { orbUI?.render(); }

function orbCreateUI() {
  const root=document.createElement('section');root.id='fantik-orb-chain';root.setAttribute('aria-label','Chromatic Orb');
  root.innerHTML=`<style>
  #fantik-orb-chain{--orb:#b6a3ff;position:fixed;z-index:10000;left:50%;bottom:95px;transform:translateX(-50%);width:390px;max-width:calc(100vw - 24px);padding:14px;box-sizing:border-box;border:1px solid #84765e;border-radius:10px;background:#202326fa;color:#f4efe5;box-shadow:0 12px 42px #0008;font:12px/1.4 sans-serif;pointer-events:auto}
  #fantik-orb-chain *{box-sizing:border-box}#fantik-orb-chain [hidden]{display:none!important}
  #fantik-orb-chain button,#fantik-orb-chain select,#fantik-orb-chain input{appearance:none!important;box-shadow:none!important;font:12px/1.35 sans-serif!important;color:#f4efe5!important;background:#2b2e31!important;border:1px solid #615c52!important;border-radius:5px!important;height:30px;min-height:30px;max-width:100%;min-width:0;padding:4px 8px!important;margin:0!important;line-height:1.35!important;width:auto}
  #fantik-orb-chain button::before,#fantik-orb-chain button::after{content:none!important}#fantik-orb-chain button{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:normal}#fantik-orb-chain button:disabled{opacity:.5;cursor:default}#fantik-orb-chain button:hover{border-color:#d2ba86!important}#fantik-orb-chain button:focus-visible,#fantik-orb-chain select:focus-visible,#fantik-orb-chain input:focus-visible{outline:2px solid #d2ba86;outline-offset:2px}
  #fantik-orb-chain header{display:flex;align-items:center;gap:7px;margin-bottom:12px}#fantik-orb-chain [data-drag]{flex:1;cursor:grab;touch-action:none;user-select:none}#fantik-orb-chain .orb-title{font:18px Georgia,serif}#fantik-orb-chain .orb-muted{font:10px/1.4 sans-serif;color:#b5b2a9}
  #fantik-orb-chain .orb-cast{display:grid;grid-template-columns:1fr 1fr;gap:8px}#fantik-orb-chain .orb-field{display:grid;gap:4px;min-width:0;font-size:10px;color:#c2bcad}#fantik-orb-chain .orb-field select{width:100%}
  #fantik-orb-chain [data-toggle]{justify-content:flex-start;border:0!important;background:transparent!important;padding:4px 0!important;font-size:11px!important}#fantik-orb-chain [data-toggle] i{width:27px;height:15px;background:#535353;border-radius:9px;position:relative;display:inline-block;flex:none;margin-right:3px}#fantik-orb-chain [data-toggle] i:after{content:'';position:absolute;left:2px;top:2px;width:11px;height:11px;border-radius:50%;background:#d2cec4}#fantik-orb-chain [data-toggle][aria-checked=true] i{background:#9e885a}#fantik-orb-chain [data-toggle][aria-checked=true] i:after{left:14px;background:#fff1cb}
  #fantik-orb-chain .orb-switches{display:flex;align-items:center;justify-content:space-between;gap:8px}#fantik-orb-chain .orb-modes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-top:9px}#fantik-orb-chain .orb-modes button{border-radius:0!important;font-size:11px!important}#fantik-orb-chain .orb-modes button:first-child{border-radius:5px 0 0 5px!important}#fantik-orb-chain .orb-modes button:last-child{border-radius:0 5px 5px 0!important}#fantik-orb-chain .orb-modes button[aria-pressed=true]{background:#d4bf8f!important;color:#202326!important;border-color:#d4bf8f!important}
  #fantik-orb-chain [data-settings]{position:absolute;bottom:calc(100% + 8px);left:0;width:100%;max-height:55vh;overflow:auto;background:#25282c;border:1px solid #84765e;border-radius:9px;padding:14px;box-shadow:0 8px 25px #0007}#fantik-orb-chain .orb-setting{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:10px;align-items:center;margin-bottom:10px}#fantik-orb-chain .orb-setting select,#fantik-orb-chain .orb-setting input{width:100%}#fantik-orb-chain [data-status]{padding-top:8px;min-height:26px;color:#dcc89e;overflow-wrap:anywhere}#fantik-orb-chain [data-trail]{max-height:100px;overflow:auto;display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}#fantik-orb-chain .orb-target{border:1px solid #56564e;border-radius:4px;padding:3px 6px;color:#ded7c8;font-size:10px}
  #fantik-orb-chain .orb-actions{display:contents}#fantik-orb-chain .orb-primary{background:#d4bf8f!important;color:#202326!important;border-color:#d4bf8f!important;font-weight:600!important}#fantik-orb-chain .orb-footer{display:flex;flex-wrap:nowrap;gap:5px;margin-top:9px;padding-top:8px;border-top:1px solid #4f4d46}#fantik-orb-chain .orb-footer button{flex:1 1 auto;white-space:nowrap;font-size:10px!important;padding:4px!important;background:transparent!important}#fantik-orb-chain .orb-footer button.orb-primary{background:#d4bf8f!important}#fantik-orb-chain .orb-footer [data-undo]{flex:0 0 25px}
  </style><header><div data-drag><div class="orb-title">Chromatic Orb</div><div class="orb-muted" data-counter></div></div><button type="button" data-gear aria-label="Налаштування">⚙</button><button type="button" data-end aria-label="Завершити">×</button></header>
  <div class="orb-cast"><label class="orb-field">Чарунка<select name="level">${Array.from({length:9},(_,i)=>`<option value="${i+1}">${i+1} рівень</option>`).join('')}${orbCaster?.system.spells?.pact?`<option value="pact">Магія пакту · ${Number(orbCaster.system.spells.pact.level)||1}</option>`:''}</select></label><label class="orb-field">Стихія<select name="type">${Object.entries(orbTypes).map(([v,t])=>`<option value="${v}">${t.label}</option>`).join('')}</select></label></div>
  <div class="orb-switches"><button type="button" data-toggle="consume" role="switch" aria-checked="false"><i></i><span>Списати чарунку</span></button><button type="button" data-toggle="range" role="switch" aria-checked="false"><i></i><span>Ігнорувати відстань</span></button></div>
  <div class="orb-modes" role="group" aria-label="Режим атаки"><button type="button" data-mode="dis">Завада</button><button type="button" data-mode="normal">Нормальна</button><button type="button" data-mode="adv">Перевага</button></div>
  <div data-settings hidden>
  ${orbState.sources.length?`<label class="orb-setting"><span>Джерело заклять</span><select name="ability">${orbState.sources.map(s=>`<option value="${s.value}">${s.label}</option>`).join('')}</select></label>`:''}
  <label class="orb-setting" data-manual><span>Бонус атаки</span><input name="bonus" type="number" step="1" placeholder="Бонус"></label>
  <div class="orb-setting"><span>Анімації JB2A</span><button type="button" data-toggle="effects" role="switch"><i></i><span>Увімкнено</span></button></div>
  </div><div data-status role="status" aria-live="polite"></div>
  <div class="orb-footer"><div class="orb-actions" data-actions></div><button type="button" data-untargeted>Без цілі</button><button type="button" data-card>Лише картка в чат</button></div>`;
  document.body.append(root);
  const field=n=>root.querySelector(`[name="${n}"]`);field('type').value=orbState.type;
  if(field('ability'))field('ability').value=orbState.ability;
  let waiter,closed=false,drag=null;
  const signal=value=>{if(waiter){const resolve=waiter;waiter=null;resolve(value);}};
  const board=()=>globalThis.canvas?.app?.view??globalThis.canvas?.app?.canvas??document.getElementById('board');
  const initialBoard=board(),aimClass=`fantik-orb-aim-${orbState.castId}`;
  const aimStyle=document.createElement('style');root.append(aimStyle);let cursorColor=null;
  function syncCursor(planning){
    initialBoard?.classList.toggle(aimClass,planning&&orbSceneReady());
    if(!planning)return;
    const color=orbState.hover&&!orbTargetStatus(orbState.hover).allowed?'#ff746e':orbTypes[orbState.type].color;
    if(color===cursorColor)return;cursorColor=color;
    const ticks='M2 16H10M22 16H30M16 2V10M16 22V30';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke-linecap="round"><circle cx="16" cy="16" r="9" stroke="#10151c" stroke-width="4"/><circle cx="16" cy="16" r="9" stroke="${color}" stroke-width="1.8"/><path d="${ticks}" stroke="#10151c" stroke-width="4"/><path d="${ticks}" stroke="${color}" stroke-width="1.8"/></g><circle cx="16" cy="16" r="1.5" fill="${color}" stroke="#10151c" stroke-width=".7"/></svg>`;
    // Override PIXI's inline hover cursor without changing its cursor state.
    aimStyle.textContent=`.${aimClass}{cursor:url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16,crosshair!important;}`;
  }
  function hint(text){root.querySelector('[data-status]').textContent=text;}
  const onPointer=event=>{
    if(event.button!==0||event.target!==board()||orbState.phase!=='plan')return;
    event.preventDefault();event.stopImmediatePropagation();const target=orbHit(event);if(!target)return;
    const status=orbTargetStatus(target);if(!status.allowed){hint(status.used?'Ця істота вже у черзі.':'Поза радіусом перескоку.');return;}
    signal({action:'add',target});
  };
  const onMove=event=>{
    if(drag){root.style.left=`${Math.max(8,Math.min(innerWidth-root.offsetWidth-8,event.clientX-drag.x))}px`;root.style.top=`${Math.max(8,Math.min(innerHeight-root.offsetHeight-8,event.clientY-drag.y))}px`;return;}
    const target=event.target===board()&&orbState.phase==='plan'?orbHit(event):null;
    if(target!==orbState.hover){orbState.hover=target;render();}
  };
  const onUp=()=>drag=null;
  const onKey=event=>{
    if(event.key==='Escape'&&orbState.phase!=='rolling'){event.preventDefault();event.stopImmediatePropagation();signal({action:'end'});}
    if(event.key==='Backspace'&&!/INPUT|SELECT|TEXTAREA/.test(event.target?.tagName)&&orbState.phase==='plan'){event.preventDefault();signal({action:'undo'});}
  };
  root.querySelector('[data-gear]').onclick=()=>{root.querySelector('[data-settings]').hidden=!root.querySelector('[data-settings]').hidden;};
  root.querySelector('[data-end]').onclick=()=>{if(orbState.phase==='rolling'){orbRun.stop=true;hint('Завершення після кидка…');}else signal({action:'end'});};
  root.querySelector('[data-card]').onclick=()=>signal({action:'cast',target:null,cardOnly:true});
  root.querySelector('[data-untargeted]').onclick=()=>signal({action:'cast',target:null});
  root.querySelector('[data-drag]').onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();const r=root.getBoundingClientRect();drag={x:event.clientX-r.left,y:event.clientY-r.top};root.style.left=`${r.left}px`;root.style.top=`${r.top}px`;root.style.bottom='auto';root.style.transform='none';};
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
    orbState.mode=b.dataset.mode;
    if(orbState.phase==='decision'&&orbState.queue[orbState.index])orbState.queue[orbState.index].mode=orbState.mode;
    render();
  });
  root.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{
    const key={consume:'consume',effects:'effects',range:'overrideRange'}[b.dataset.toggle];
    orbState[key]=!orbState[key];if(key==='effects')void orbVisual?.refreshEffects();render();
  });
  root.addEventListener('change',event=>{
    const name=event.target.name;
    if(name==='level'&&!orbState.committed){
      const pact=field('level').value==='pact';
      orbState.level=pact?Math.max(1,Math.min(9,Number(orbCaster?.system.spells?.pact?.level)||1)):Number(field('level').value);
      orbState.slotKey=pact?'pact':`spell${orbState.level}`;
      orbState.queue=orbState.queue.slice(0,orbState.level+1);orbState.consume=orbCanPay();
    }
    if(name==='type'&&!orbState.committed){orbState.type=field('type').value;orbRememberType(orbState.type);}
    if(name==='ability')orbState.ability=field('ability').value;
    if(name==='bonus')orbState.manualBonus=field('bonus').value;render();
  });
  window.addEventListener('pointerdown',onPointer,true);window.addEventListener('pointermove',onMove,true);window.addEventListener('pointerup',onUp,true);window.addEventListener('pointercancel',onUp,true);window.addEventListener('keydown',onKey,true);
  function render(){
    if(closed)return;const rolling=orbState.phase==='rolling',planning=orbState.phase==='plan';syncCursor(planning);
    root.querySelector('[data-counter]').textContent=planning?`Цілі ${orbState.queue.length} / ${orbState.level+1}`:`Крок ${orbState.index} / ${orbState.queue.length||1}`;
    for(const name of ['level','type','ability','bonus'])if(field(name))field(name).disabled=orbState.committed||rolling;
    root.querySelector('[data-toggle=consume]').disabled=orbState.committed||rolling;
    for(const b of root.querySelectorAll('[data-toggle]')){const key={consume:'consume',effects:'effects',range:'overrideRange'}[b.dataset.toggle];b.setAttribute('aria-checked',String(orbState[key]));if(key==='effects')b.querySelector('span').textContent=orbState[key]?'Увімкнено':'Вимкнено';}
    for(const b of root.querySelectorAll('[data-mode]')){b.disabled=rolling;b.setAttribute('aria-pressed',String(b.dataset.mode===orbState.mode));}
    root.querySelector('[data-card]').disabled=rolling;root.querySelector('[data-untargeted]').disabled=rolling;
    root.querySelector('[data-toggle=consume]').title=orbState.committed?({spent:'Списано',none:'Без списання',uncertain:'Перевір вручну'}[orbState.resources]):orbCanPay()?'':'Ресурс недоступний — можна кинути без списання';
    const resolved=orbAttackData();root.querySelector('[data-manual]').hidden=!!(resolved&&orbCaster&&orbState.sources.length&&!orbState.manualBonus);
    if(!resolved&&!orbState.sources.length)root.querySelector('[data-settings]').hidden=false;
    root.querySelector('[data-status]').hidden=!planning&&!rolling;
    if(rolling)hint('Кубики…');
    else if(planning){const t=orbState.hover,st=t&&orbTargetStatus(t);hint(t?`${t.name}${st.distance!=null?` · ${Math.round(st.distance*10)/10} ${orbUnits().units}`:''}${st.used?' · уже в черзі':st.out?' · поза радіусом':''}`:!orbSceneReady()?'Без сцени · доступний кидок без цілі':orbState.queue.length?'Обери наступну ціль або почни кидки':'Обери цілі по черзі на сцені');}
    else{const row=orbState.last;hint(!orbMaySee()?'Результат бачить майстер':orbState.index>=orbState.queue.length?'Чергу завершено':row.natural===1?'Натуральна 1 · завершити':row.doubles.length?`Дубль ${row.doubles.join(', ')} · наступна: ${orbState.queue[orbState.index]?.target.name??'—'}`:'Без дубля · завершити');}
    const actions=root.querySelector('[data-actions]');actions.replaceChildren();
    const button=(label,action,primary=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(primary)b.className='orb-primary';b.onclick=()=>signal(action);actions.append(b);};
    if(rolling)return;
    if(planning){if(orbState.queue.length){button('Почати кидки',{action:'start'},true);button('↶',{action:'undo'});actions.lastChild.dataset.undo='';actions.lastChild.title='Назад · Backspace';}button('Скасувати',{action:'end'});}
    else{const row=orbState.last;if(orbState.index<orbState.queue.length&&(!orbMaySee()||(row.doubles.length&&row.natural!==1)))button(orbMaySee()?'Влучання · стрибок':'Стрибок за вказівкою GM',{action:'leap'},true);button('Завершити',{action:'end'});}
  }
  return {render,hint,signal,wait:()=>new Promise(resolve=>waiter=resolve),destroy(){closed=true;signal({action:'end'});root.remove();window.removeEventListener('pointerdown',onPointer,true);window.removeEventListener('pointermove',onMove,true);window.removeEventListener('pointerup',onUp,true);window.removeEventListener('pointercancel',onUp,true);window.removeEventListener('keydown',onKey,true);initialBoard?.classList.remove(aimClass);}};
}

function orbCreateVisual() {
  if(!orbSceneReady()||!canvas.clientCoordinatesFromCanvas)return null;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('aria-hidden','true');svg.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:79;pointer-events:none;overflow:hidden;';
  svg.innerHTML='<g data-range><circle data-range-shadow fill="none" stroke="#111820" stroke-opacity=".8" stroke-width="6"/><circle data-range-tint fill="#b6a3ff" fill-opacity=".075" stroke="#b6a3ff" stroke-opacity=".95" stroke-width="2.5"/><text text-anchor="middle" fill="#f5f1e9" stroke="#111820" stroke-width="5" stroke-linejoin="round" paint-order="stroke" font-family="sans-serif" font-size="12" font-weight="600"></text></g><g data-markers></g><path data-route fill="none" stroke="#d8c899" stroke-opacity=".65" stroke-width="1.5"/><path data-hover fill="none" stroke="#e7dfcd" stroke-opacity=".6" stroke-dasharray="3 6"/>';
  document.body.append(svg);
  let frame,dead=false,effectToken=null,serial=Promise.resolve(),releaseReady=null;
  const name=`fantik-orb-${game.user.id}-${orbState.castId}`;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const publicCast=!orbState.privacy.blind&&!orbState.privacy.whisper.length;
  const canAnimate=()=>orbState.effects&&!reduced&&game.modules.get('sequencer')?.active&&typeof Sequence!=='undefined'&&typeof Sequencer!=='undefined';
  const available=keys=>keys.find(key=>{try{return !!Sequencer.Database.getEntry(key);}catch{return false;}});
  const colors={acid:'dark_green',poison:'dark_green',cold:'blue',fire:'orange',lightning:'purple',thunder:'dark_purple'};
  async function stop(){if(typeof Sequencer!=='undefined')await Sequencer.EffectManager.endEffects({name});}
  async function hold(token){
    await stop();effectToken=token;
    if(dead||!token||!canAnimate()||!orbSceneReady())return;
    const c=colors[orbState.type];
    const key=available(['jb2a.energy_strands.overlay.grey.01',`jb2a.energy_strands.overlay.${c}.01`]);
    if(!key)return;
    // A persistent sequence's play Promise ends only when the effect ends.
    // Await creation, not its lifetime, or the next jump would never become available.
    await new Promise(resolve=>{
      let hook,settled=false;
      const ready=()=>{if(settled)return;settled=true;if(hook!=null)Hooks.off('createSequencerEffect',hook);if(releaseReady===ready)releaseReady=null;resolve();};
      releaseReady=ready;
      hook=Hooks.on('createSequencerEffect',effect=>{if(effect.data?.name===name)ready();});
      try {
        Promise.resolve(new Sequence().effect().file(key).tint(orbTypes[orbState.type].vfx).attachTo(token).scaleToObject(1.4).opacity(.8)
          .persist(true,{persistTokenPrototype:false}).temporary().name(name).fadeIn(200).fadeOut(250)
          .play({local:!publicCast})).then(ready,error=>{console.warn('Chromatic Orb | Loop unavailable',error);ready();});
      } catch(error){console.warn('Chromatic Orb | Loop unavailable',error);ready();}
    });
    if(dead)await stop();
  }
  function enqueue(fn){serial=serial.then(fn).catch(e=>console.warn('Chromatic Orb | JB2A unavailable',e));return serial;}
  function point(t){return canvas.clientCoordinatesFromCanvas(t.center??t);}
  function draw(){
    if(dead)return;
    if(!orbSceneReady()){void destroy();return;}
    const planning=orbState.phase==='plan',origin=planning?(orbState.queue.at(-1)?.target??orbCasterToken):orbState.origin;
    const range=svg.querySelector('[data-range]');range.style.display=planning&&origin?'':'none';
    if(planning&&origin){const p=point(origin),limit=orbState.queue.length?(orbUnits().metric?9:30):orbRange();const radius=limit/Number(canvas.scene.grid.distance||5)*Number(canvas.grid.size||100);const edge=point({x:origin.center.x+radius,y:origin.center.y});range.setAttribute('transform',`translate(${p.x} ${p.y})`);const r=Math.abs(edge.x-p.x);for(const circle of range.querySelectorAll('circle'))circle.setAttribute('r',r);const tint=range.querySelector('[data-range-tint]');tint.setAttribute('fill',orbTypes[orbState.type].color);tint.setAttribute('stroke',orbTypes[orbState.type].color);const text=range.querySelector('text');text.setAttribute('y',-r-12);text.textContent=`${limit} ${orbUnits().units}`;}
    const markers=svg.querySelector('[data-markers]');markers.replaceChildren();
    for(const t of orbTokens()){
      const index=orbState.queue.findIndex(q=>q.target.id===t.id),hover=planning&&t===orbState.hover;
      if(index<0&&!hover)continue;
      const p=point(t),edge=point({x:t.x+t.w,y:t.y+t.h}),size=Math.max(18,Math.abs(edge.x-p.x)+5),g=document.createElementNS(ns,'g');
      const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',size);circle.setAttribute('fill','none');circle.setAttribute('stroke',hover&&!orbTargetStatus(t).allowed?'#d98981':'#dac597');circle.setAttribute('stroke-width',hover?'2':'1');g.append(circle);
      if(index>=0){const label=document.createElementNS(ns,'text');label.setAttribute('x',p.x+size);label.setAttribute('y',p.y-size);label.setAttribute('fill','#fff1cf');label.setAttribute('font-size','13');label.setAttribute('stroke','#202326');label.setAttribute('stroke-width','4');label.setAttribute('paint-order','stroke');label.textContent=String(index+1);g.append(label);}markers.append(g);
    }
    const points=[orbCasterToken,...orbState.queue.map(q=>q.target)].filter(Boolean).map(point);
    svg.querySelector('[data-route]').setAttribute('d',points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '));
    const path=svg.querySelector('[data-hover]');if(planning&&origin&&orbState.hover){const a=point(origin),b=point(orbState.hover);path.setAttribute('d',`M${a.x} ${a.y}L${b.x} ${b.y}`);}else path.setAttribute('d','');
    frame=requestAnimationFrame(draw);
  }
  async function destroy(){if(dead)return serial;dead=true;releaseReady?.();cancelAnimationFrame(frame);svg.remove();await enqueue(stop);}
  frame=requestAnimationFrame(draw);
  return {destroy,clear:()=>enqueue(async()=>{effectToken=null;await stop();}),refreshEffects:()=>enqueue(()=>hold(effectToken)),
    fly:(a,b)=>enqueue(async()=>{
      await stop();if(dead||!orbSceneReady())return;
      if(canAnimate()&&a&&b){const c=colors[orbState.type];const key=available([
        'jb2a.energy_strands.range.standard.grey.01',`jb2a.energy_strands.range.standard.${c}.01`,`jb2a.eldritch_blast.${c}`]);
        if(key)await new Sequence().effect().file(key).tint(orbTypes[orbState.type].vfx).atLocation(a).stretchTo(b).fadeOut(150).play({local:!publicCast});
      }
      await hold(b);
    })};
}
