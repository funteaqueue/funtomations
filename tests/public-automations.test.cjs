const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function setup(){
 const f={hooks:new Map(),dialogs:[],confirm:true,confirmed:0,items:new Map()};let seq=0;
 const users=['author','reader'].map(id=>({id,name:id,flags:{},can:()=>true,getFlag(ns,k){return this.flags[k];},async setFlag(ns,k,v){this.flags[k]=structuredClone(v);}}));
 class App{constructor(options={}){this.options=options;}render(){this.rendered=true;return Promise.resolve(this);} _onRender(){} _onClose(){}}
 class Dialog extends App{constructor(options){super(options);f.dialogs.push(this);}addEventListener(){} static async confirm(){f.confirmed++;if(f.duringConfirm)await f.duringConfirm();return f.confirm;}}
 const root={MODULE_ID:'fantik-automations',console,Set,Map,setTimeout,AbortController,
  game:{user:users[0],users:{contents:users},modules:new Map(),items:{get:id=>f.items.get(id)},settings:{get:()=>true}},
  foundry:{utils:{AsyncFunction,deepClone:structuredClone,randomID:()=>`pub${++seq}`},applications:{api:{ApplicationV2:App,HandlebarsApplicationMixin:cls=>cls,DialogV2:Dialog},instances:new Map(),sidebar:{apps:{Compendium:class{}}}}},
  Hooks:{on:(k,fn)=>{f.hooks.set(k,fn);},once:()=>{}},ui:{notifications:{error:()=>{},warn:()=>{}}}};
 vm.createContext(root);
 function load(file,names){const source=fs.readFileSync(path.join(__dirname,'../scripts/framework',file),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');vm.runInContext(`Object.assign(globalThis,(()=>{${source};return {${names}};})());`,root);}
 load('public-automations.js','publicAutomations,publicAutomationMatches,loadAutomationTranslations,ownPublicAutomation,publishItemAutomation,unpublishAutomation');
 load('item-macros.js','itemMacroState,saveItemMacro,setItemMacroEnabled,validateItemMacro,openItemMacroEditor');
 load('manager.js','AutomationManager,initAutomationManager,applyPublicAutomation');
 load('registry.js','registry');
 function item(name,id='source'){const obj={uuid:`Item.${id}`,name,isOwner:true,flags:{},getFlag(ns,k){return this.flags[k];},async setFlag(ns,k,v){if(k.endsWith('.enabled'))this.flags.useMacroInstead.enabled=v;else this.flags[k]=structuredClone(v);}};f.items.set(id,obj);return obj;}
 return {...f,f,root,users,item};
}
test('public checkbox publishes a disabled macro for other users without executing it',async()=>{
 const {root,users,item,f}=setup();const source=item('Fire Bolt');
 await root.saveItemMacro(source,{command:'throw new Error("not executed");',enabled:false,publicAutomation:true});
 assert.equal(root.publicAutomations().length,1);assert.equal(root.itemMacroState(source).enabled,false);
 assert.equal(root.ownPublicAutomation(source).revision,1);
 root.openItemMacroEditor(source);assert.match(f.dialogs[0].options.content,/name="publicAutomation" checked/);
 root.game.user=users[1];const rows=await new root.AutomationManager(item('Fire Bolt','target'))._prepareContext();
 assert.equal(rows.rows[0].author,'author');assert.equal(rows.rows[0].byName,true);
});
test('applying takes an independent copy; update and unpublish never mutate recipients',async()=>{
 const {root,users,item}=setup();const source=item('Spell');
 await root.saveItemMacro(source,{command:'return 1;',enabled:false,publicAutomation:true});const entry=root.publicAutomations()[0];
 root.game.user=users[1];const target=item('Spell','target');await root.applyPublicAutomation(target,entry.key);
 assert.equal(root.itemMacroState(target).command,'return 1;');assert.equal(root.itemMacroState(target).enabled,true);
 root.game.user=users[0];await root.saveItemMacro(source,{command:'return 2;',enabled:true,publicAutomation:true});
 assert.equal(root.publicAutomations()[0].revision,2);assert.equal(root.itemMacroState(target).command,'return 1;');
 await root.saveItemMacro(source,{command:'return 2;',enabled:true,publicAutomation:false});
 assert.equal(root.publicAutomations().length,0);assert.equal(root.itemMacroState(target).command,'return 1;');
});
test('exact names normalize whitespace and case, never substrings or stale nameEn flags',()=>{
 const {root,item}=setup();assert(root.publicAutomationMatches({name:' FIRE  BOLT '},item('Fire Bolt')));
 assert(!root.publicAutomationMatches({name:'Fire Bolt'},item('Greater Fire Bolt')));
 const renamed=item('My special spell');renamed.flags['1d20-ua-plutonium']={nameEn:'Fire Bolt'};
 assert(!root.publicAutomationMatches({name:'Fire Bolt'},renamed));
});
test('translator dictionary matches English, Ukrainian and bilingual names both ways; custom renames do not',async()=>{
 const {root,item}=setup();root.game.modules.set('1d20-ua-plutonium',{active:true,api:{data:{getManifest:async()=>({uk:{spells:{}}}),loadPack:async()=>new Map([['fire',{name_en:'Fire Bolt',name_uk:'Вогняний промінь'}]])}}});
 await root.loadAutomationTranslations();
 assert(root.publicAutomationMatches({name:'Fire Bolt'},item('Вогняний промінь')));
 assert(root.publicAutomationMatches({name:'Вогняний промінь'},item('Fire Bolt')));
 assert(root.publicAutomationMatches({name:'Fire Bolt'},item('Вогняний промінь (Fire Bolt)')));
 const renamed=item('Мій промінь');renamed.flags['1d20-ua-plutonium']={nameEn:'Fire Bolt'};
 assert(!root.publicAutomationMatches({name:'Fire Bolt'},renamed));
 root.game.modules.get('1d20-ua-plutonium').active=false;
 assert(!root.publicAutomationMatches({name:'Fire Bolt'},item('Вогняний промінь')));
});
test('replacing personal code requires confirmation; permission and publication races prevent writes',async()=>{
 const {root,users,item,f}=setup();const source=item('Spell');await root.saveItemMacro(source,{command:'return 1;',enabled:true,publicAutomation:true});const entry=root.publicAutomations()[0];
 root.game.user=users[1];const target=item('Spell','target');await root.saveItemMacro(target,{command:'return 9;',enabled:false});
 f.confirm=false;assert.equal(await root.applyPublicAutomation(target,entry.key),false);assert.equal(root.itemMacroState(target).command,'return 9;');
 f.confirm=true;await root.applyPublicAutomation(target,entry.key);assert.equal(f.confirmed,2);
 users[1].can=()=>false;await assert.rejects(root.applyPublicAutomation(target,entry.key),/дозволу/);users[1].can=()=>true;
 await root.saveItemMacro(target,{command:'return 3;',enabled:true});
 f.duringConfirm=async()=>{users[0].flags.publicAutomations[0].revision++;};
 await assert.rejects(root.applyPublicAutomation(target,entry.key),/змінилася/);assert.equal(root.itemMacroState(target).command,'return 3;');
 await assert.rejects(root.unpublishAutomation(entry.key),/автор/);
});
test('built-in automation remains executable but does not appear in catalogue or green recommendations',async()=>{
 const {root,item,f}=setup();const target=item('Legacy');
 root.registry.register({id:'legacy',name:'Legacy',match:{itemNames:['Legacy']},events:[{event:'test',handler:()=>{}}]});
 assert.equal(root.registry.findForItem(target).length,1);
 assert.equal((await new root.AutomationManager(target)._prepareContext()).rows.length,0);
 root.initAutomationManager();const entries=[];f.hooks.get('dnd5e.getItemContextOptions')(target,entries);
 assert.equal(entries.length,1);assert(!entries[0].icon.includes('color:'));
});
test('context menu refreshes green matching per item and drops it after unpublishing',async()=>{
 const {root,item,f}=setup();const source=item('Spell','source');await root.saveItemMacro(source,{command:'return;',enabled:true,publicAutomation:true});
 root.initAutomationManager();const entries=[];f.hooks.get('getItemContextOptions')({},entries);
 item('Spell','matched');item('Other','other');const entry=entries[0];
 assert(entry.condition({dataset:{entryId:'matched'}}));assert(entry.icon.includes('color:'));
 assert(entry.condition({dataset:{entryId:'other'}}));assert(!entry.icon.includes('color:'));
 await root.unpublishAutomation(root.publicAutomations()[0].key);
 assert(entry.condition({dataset:{entryId:'matched'}}));assert(!entry.icon.includes('color:'));
});
test('independent authors and simultaneous publications keep distinct entries',async()=>{
 const {root,users,item}=setup();const a=item('Spell','a'),b=item('Spell','b');
 await Promise.all([root.saveItemMacro(a,{command:'return 1;',enabled:true,publicAutomation:true}),root.saveItemMacro(b,{command:'return 2;',enabled:true,publicAutomation:true})]);
 assert.equal(root.publicAutomations().length,2);
 root.game.user=users[1];await root.saveItemMacro(item('Spell','c'),{command:'return 3;',enabled:true,publicAutomation:true});
 assert.equal(root.publicAutomations().length,3);assert.equal(new Set(root.publicAutomations().map(e=>e.key)).size,3);
});
