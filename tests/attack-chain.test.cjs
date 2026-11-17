const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/framework/spell-cards.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
function setup(){
 const f={reads:0,applies:[],writes:[],errors:[],failWrite:false,failApply:false};
 class DamageRoll{constructor(total,type='fire'){this.total=total;this.evaluated=true;this.options={type,properties:['mgc']};}}
 const attack={total:19,evaluated:true,isCritical:false,dice:[{faces:20,results:[{result:12,active:true}]}]};
 const entries=[{id:'first',attackRoll:0,damageRoll:1,target:{token:'Scene.s.Token.a',actor:'Actor.a',name:'A'}},
  {id:'second',attackRoll:2,damageRoll:3,target:{token:'Scene.s.Token.b',actor:'Actor.b',name:'B'}}];
 const message={id:'m',isContentVisible:true,rolls:[attack,new DamageRoll(12),{...attack,total:28},new DamageRoll(7,'cold')],
  flags:{'fantik-automations':{spellCard:{version:3,attacks:entries,active:'second'}}},
  getFlag(ns,key){return this.flags[ns]?.[key];},async update(changes){if(f.failWrite)throw Error('write');f.writes.push(changes);for(const[k,v]of Object.entries(changes)){let obj=this;const parts=k.split('.');for(const p of parts.slice(0,-1))obj=obj[p]??={};obj[parts.at(-1)]=v;}return this;}};
 const tokens=Object.fromEntries(['a','b'].map(id=>['Scene.s.Token.'+id,{documentName:'Token',actor:{uuid:'Actor.'+id,isOwner:true,system:{attributes:{ac:{value:17}}},async applyDamage(damage,options){f.applies.push({id,damage,options});if(f.deferApply)await f.deferApply;if(f.failApply)throw Error('apply');}}}]));
 const context={console:{error(){},warn(){}},Set,CONFIG:{Dice:{DamageRoll}},MODULE_ID:'fantik-automations',game:{user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}}},
  fromUuidSync:id=>{f.reads++;return tokens[id];},ui:{notifications:{warn:m=>f.errors.push(m),error:m=>f.errors.push(m)}}};
 vm.runInNewContext(source+';globalThis.api={applyRecordedAttack,recordedAttackHint};',context);
 return{f,message,entries,tokens,context,...context.api};
}
test('player and invisible messages never read target data or mutate HP',async()=>{
 const t=setup();t.context.game.user.isGM=false;
 assert.equal(t.recordedAttackHint(t.message,t.entries[0]),null);
 assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'damage'}),false);
 t.context.game.user.isGM=true;t.message.isContentVisible=false;
 assert.equal(t.recordedAttackHint(t.message,t.entries[0]),null);
 assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'healing'}),false);
 assert.equal(t.f.reads,0);assert.equal(t.f.applies.length,0);assert.equal(t.f.writes.length,0);
});
test('GM hint uses retained d20 and current AC without document writes',()=>{
 const t=setup();assert.equal(t.recordedAttackHint(t.message,t.entries[0]),'Ймовірно влучає');
 t.message.rolls[0].total=14;t.message.rolls[0].dice[0].results=[{result:20,active:false,discarded:true},{result:7,active:true}];
 assert.equal(t.recordedAttackHint(t.message,t.entries[0]),'Ймовірно не влучає');
 t.message.rolls[0].dice[0].results=[{result:1,active:true}];assert.equal(t.recordedAttackHint(t.message,t.entries[0]),'Натуральна 1');
 t.message.rolls[0].dice[0].results=[{result:19,active:true}];t.message.rolls[0].isCritical=true;
 assert.equal(t.recordedAttackHint(t.message,t.entries[0]),'Критичне влучання');assert.equal(t.f.writes.length,0);
});
test('one exact row applies native typed damage, not attack or chain totals',async()=>{
 const t=setup();assert.equal(await t.applyRecordedAttack(t.message,{entryId:'second',kind:'damage'}),true);
 const call=t.f.applies[0];assert.equal(call.id,'b');assert.equal(call.damage[0].value,7);assert.equal(call.damage[0].type,'cold');
 assert(call.damage[0].properties.has('mgc'));assert.equal(call.options.origin,t.message);assert.equal(call.options.isDelta,true);
 assert.equal(t.message.getFlag('fantik-automations','attackApplications').second.state,'done');
 assert.equal(await t.applyRecordedAttack(t.message,{entryId:'second',kind:'healing'}),false);assert.equal(t.f.applies.length,1);
});
test('healing uses native healing type and the same roll amount',async()=>{
 const t=setup();await t.applyRecordedAttack(t.message,{entryId:'first',kind:'healing'});
 assert.equal(t.f.applies[0].damage[0].type,'healing');assert.equal(t.f.applies[0].damage[0].value,12);
 assert.equal(t.f.applies[0].damage[0].properties.size,0);
});
test('concurrent clicks are locked; receipt survives re-entry',async()=>{
 const t=setup();let release;t.f.deferApply=new Promise(r=>release=r);
 const first=t.applyRecordedAttack(t.message,{entryId:'first',kind:'damage'});
 assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'healing'}),false);
 release();assert.equal(await first,true);assert.equal(t.f.applies.length,1);
});
test('receipt failure prevents HP update; uncertain HP update is not retried',async()=>{
 const t=setup();t.f.failWrite=true;assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'damage'}),false);assert.equal(t.f.applies.length,0);
 t.f.failWrite=false;t.f.failApply=true;assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'damage'}),false);
 assert.equal(t.message.getFlag('fantik-automations','attackApplications').first.state,'pending');
 t.f.failApply=false;assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'damage'}),false);assert.equal(t.f.applies.length,1);
});
test('stale/mismatched targets, wrong roll type and invalid IDs cannot apply',async()=>{
 const t=setup();t.tokens['Scene.s.Token.a'].actor.uuid='Actor.other';
 assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'damage'}),false);
 t.entries[1].damageRoll=2;assert.equal(await t.applyRecordedAttack(t.message,{entryId:'second',kind:'damage'}),false);
 assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first.injected',kind:'damage'}),false);
 assert.equal(t.f.applies.length,0);assert.equal(t.f.writes.length,0);
});
test('another GM cannot race the active GM',async()=>{
 const t=setup();t.context.game.users.activeGM.id='other';assert.equal(await t.applyRecordedAttack(t.message,{entryId:'first',kind:'damage'}),false);
 assert.equal(t.f.reads,0);assert.equal(t.f.writes.length,0);
});
