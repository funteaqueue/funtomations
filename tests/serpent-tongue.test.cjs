const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const {makeFixture}=require('./serpent-fixture.cjs');
const source=fs.readFileSync(path.join(__dirname,'../scripts/framework/serpent-tongue.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
function setup(){const root={console,structuredClone};const f=makeFixture(root);vm.runInNewContext(source+'\nglobalThis.api={useSerpentTongue,consume,expired,poisonFromMessage,cleanupSerpentEffects,cardHTML,breakdown};',root);return{...f,f,root,api:root.api};}

test('initial cast uses assigned character, consumes selected slot once and stores upcast duration',async()=>{
    const {f,api}=setup();f.slot='pact';await api.useSerpentTongue({item:f.item});
    assert.equal(f.actor.system.spells.pact.value,1);assert.equal(f.consumed.length,1);assert.equal(f.actor.effects.length,1);
    const s=f.actor.effects[0].getFlag('fantik-automations','serpentTongue');assert.equal(s.level,5);assert.equal(s.expires,160);
    assert.equal(f.messages.length,1);assert.equal(f.attacks.length,0);assert.equal(f.messages[0].speaker.actor,f.actor.uuid);assert.match(f.messages[0].content,/3d12/);
});
test('cancelling configuration or insufficient slots creates no state/card',async()=>{
    const {f,api}=setup();f.dialogCancel=true;await api.useSerpentTongue({item:f.item});assert.equal(f.consumed.length,0);
    f.dialogCancel=false;f.actor.system.spells.spell3.value=0;await api.useSerpentTongue({item:f.item});
    assert.equal(f.actor.effects.length,0);assert.equal(f.messages.length,0);assert.match(f.notices.at(-1),/ресурси/);
});
test('repeat activity consumption preserves action cost but never recharges the casting resources',async()=>{
    const {f,api}=setup();await api.consume(f.activity,{initial:false,sameActivity:true});
    assert.equal(f.dialogs,0);assert.equal(f.actor.system.spells.spell3.value,2);assert.equal(f.consumed[0].consume.action,true);
    assert.equal(f.consumed[0].consume.spellSlot,false);assert.equal(f.consumed[0].consume.resources.length,0);
});
test('distinct bite activity keeps its configured linked resources',async()=>{
    const {f,api}=setup();await api.consume(f.activity,{initial:false,sameActivity:false,level:5});assert.equal(f.dialogs,1);
    assert.deepEqual(f.consumed[0].consume.resources,['linked']);assert.equal(f.actor.system.spells.spell3.value,2);assert.equal(f.consumed[0].scaling,2);
});
test('invalid binding and invalid level spend nothing',async()=>{
    const {f,api}=setup();await api.useSerpentTongue({item:{...f.item,actor:f.enemy}});assert.equal(f.consumed.length,0);
    f.slot='missing';f.item.system.level=2;await api.useSerpentTongue({item:f.item});assert.equal(f.consumed.length,0);
});
test('old cards cannot end a newer cast',async()=>{
    const {f,api}=setup();await api.useSerpentTongue({item:f.item});const old=f.messages[0].getFlag('fantik-automations','serpentTongue');
    await api.useSerpentTongue({item:f.item,action:'end',castId:old.castId});assert.equal(f.actor.effects.length,0);
    await api.useSerpentTongue({item:f.item});await api.useSerpentTongue({item:f.item,action:'end',castId:old.castId});assert.equal(f.actor.effects.length,1);
});
async function castAndBiteMetadata(x){await x.api.useSerpentTongue({item:x.f.item});const s=x.f.messages[0].getFlag('fantik-automations','serpentTongue');return {id:'bite',isContentVisible:true,getFlag:(_ns,key)=>key==='spellCard'?{kind:'serpent-tongue'}:{...s,role:'bite',target:x.f.token.document.uuid}};}
test('only GM can poison exact recorded target; duplicates and immunity are respected',async()=>{
    const x=setup();const m=await castAndBiteMetadata(x);await x.api.poisonFromMessage(m);assert.equal(x.f.enemy.effects.length,0);
    x.root.game.user.isGM=true;x.f.enemy.system.traits.ci.value.add('poisoned');await x.api.poisonFromMessage(m);assert.equal(x.f.enemy.effects.length,0);
    x.f.enemy.system.traits.ci.value.clear();x.root.game.time.worldTime=125;await x.api.poisonFromMessage(m);assert.equal(x.f.enemy.effects[0].duration.seconds,35);
    assert.equal(x.f.enemy.effects[0].type,'condition');assert.equal(x.f.enemy.effects[0].system.type,'poisoned');assert.equal(x.f.enemy.effects[0]._id,undefined);
    await x.api.poisonFromMessage(m);assert.equal(x.f.enemy.effects.length,1);
});
test('expiry and ending remove only this spell poison; cleanup includes off-scene token actors',async()=>{
    const x=setup();const m=await castAndBiteMetadata(x);x.root.game.user.isGM=true;x.root.game.user.id='gm';
    await x.api.poisonFromMessage(m);await x.f.enemy.createEmbeddedDocuments('ActiveEffect',[{name:'Other poison',statuses:['poisoned'],flags:{}}]);
    x.root.game.actors.splice(x.root.game.actors.indexOf(x.f.enemy),1); // Only scene token remains.
    x.root.game.time.worldTime=160;await x.api.cleanupSerpentEffects();
    assert.equal(x.f.actor.effects.length,0);assert.equal(x.f.enemy.effects.length,1);assert.equal(x.f.enemy.effects[0].name,'Other poison');
    await x.api.poisonFromMessage(m);assert.equal(x.f.enemy.effects.length,1);
});
test('combat duration expires at the original turn ten rounds later',()=>{
    const {root,api}=setup();root.game.combats.set('combat',{started:true,round:12,turn:1});const s={expires:999,combatId:'combat',round:2,turn:2};
    assert.equal(api.expired(s),false);root.game.combats.get('combat').turn=2;assert.equal(api.expired(s),true);
});
test('card keeps discarded 1 and 20, escapes names, and does not label hits',()=>{
    const {api}=setup();const r={formula:'2d20kh+7',total:27,isCritical:true,dice:[{faces:20,results:[{result:1,discarded:true,active:false},{result:20,active:true}]}]};
    const html=api.cardHTML({state:{level:3},target:{name:'<evil>'},attacks:[r],damage:{formula:'2d12',total:13,dice:[{faces:12,results:[{result:9},{result:4}]}]}});
    assert.match(html,/&lt;evil&gt;/);assert.match(html,/text-decoration:line-through/);assert.match(html,/#e26868/);assert.match(html,/#48a568/);assert.match(html,/d12: /);assert.doesNotMatch(html,/>Влучання</);
});
