const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scripts/framework/alternative-tokens.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
function setup(){let seq=0;const hooks=new Map();const actor={id:'a',uuid:'Actor.a',name:'Hero',isOwner:true,img:'portrait.png',prototypeToken:{texture:{src:'prototype.png'}},flag:null,getFlag(){return this.flag;},async setFlag(ns,k,v){this.flag=structuredClone(v);}};
const tokens=['t1','t2'].map(id=>({id,actorId:'a',actor,parent:{id:'scene'},isOwner:true,name:id,texture:{src:id+'.png',scaleX:1.2},updates:[],async update(data){this.updates.push(data);this.texture.src=data['texture.src'];}}));
const root={MODULE_ID:'fantik-automations',console,AbortController,game:{modules:new Map(),actors:new Map([['a',actor]])},canvas:{scene:{id:'scene',tokens:{contents:tokens,get:id=>tokens.find(t=>t.id===id)}}},foundry:{utils:{deepClone:structuredClone,randomID:()=>`i${++seq}`},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}},HandlebarsApplicationMixin:c=>c},instances:new Map()}},Hooks:{on:(key,fn)=>hooks.set(key,fn)},ui:{notifications:{error(){},warn(){}}}};
vm.runInNewContext(source+';globalThis.api={galleryImages,libraryActor,tokenImages,saveTokenImage,deleteTokenImage,applyTokenImage,AlternativeTokensApp,initAlternativeTokens,quickUploadAvailable,openAlternativeQuickUpload,installAlternativeTokenHUD};',root);return{root,actor,tokens,hooks,api:root.api};}
test('apply changes exactly one scene texture, preserves original and leaves actor artwork/prototype/scales alone',async()=>{
 const{api,actor,tokens}=setup();await api.saveTokenImage(actor,{name:'Wolf',src:'wolf.webp'});await api.applyTokenImage(actor,tokens[0],api.tokenImages(actor)[0].id);
 assert.equal(tokens[0].texture.src,'wolf.webp');assert.equal(tokens[1].texture.src,'t2.png');assert.equal(tokens[1].updates.length,0);
 assert.deepEqual(Object.keys(tokens[0].updates[0]),['texture.src']);assert.equal(tokens[0].texture.scaleX,1.2);assert.equal(actor.img,'portrait.png');assert.equal(actor.prototypeToken.texture.src,'prototype.png');
 const original=api.tokenImages(actor).find(i=>i.src==='t1.png');assert(original);await api.applyTokenImage(actor,tokens[0],original.id);assert.equal(tokens[0].texture.src,'t1.png');assert.equal(api.tokenImages(actor).length,2);
});
test('synthetic actor resolves to persistent world library; concurrent additions are retained',async()=>{
 const{api,actor}=setup();assert.equal(api.libraryActor({isToken:true,token:{actorId:'a'}}),actor);
 await Promise.all([api.saveTokenImage(actor,{name:'A',src:'a.png'}),api.saveTokenImage(actor,{name:'B',src:'b.png'})]);assert.equal(api.tokenImages(actor).length,2);
 const first=api.tokenImages(actor)[0];await api.saveTokenImage(actor,{...first,name:'Renamed'});assert.equal(api.tokenImages(actor)[0].name,'Renamed');
});
test('off-scene, wrong-actor and unowned tokens cannot be changed',async()=>{
 const{api,actor,tokens,root}=setup();await api.saveTokenImage(actor,{name:'A',src:'a.png'});const id=api.tokenImages(actor)[0].id;
 tokens[0].parent.id='other';await assert.rejects(api.applyTokenImage(actor,tokens[0],id));tokens[0].parent.id='scene';tokens[0].isOwner=false;await assert.rejects(api.applyTokenImage(actor,tokens[0],id));
 tokens[0].isOwner=true;tokens[0].actorId='other';await assert.rejects(api.applyTokenImage(actor,tokens[0],id));assert.equal(tokens[0].updates.length,0);
 actor.isOwner=false;await assert.rejects(api.saveTokenImage(actor,{name:'X',src:'x.png'}));
});
test('multiple tokens require explicit choice, one is automatic, no-token library remains usable',async()=>{
 const{api,actor,tokens,root}=setup();const app=new api.AlternativeTokensApp(actor);let c=await app._prepareContext();assert.equal(c.multiple,true);assert.equal(c.hasToken,false);
 const hud=new api.AlternativeTokensApp(actor,tokens[1]);assert.equal((await hud._prepareContext()).hasToken,true);assert.equal(hud.token(),tokens[1]);
 root.canvas.scene.tokens.contents=[tokens[0]];assert.equal((await app._prepareContext()).hasToken,true);
 root.canvas.scene={id:'other',tokens:{contents:[],get:()=>null}};assert.equal((await app._prepareContext()).hasToken,false);assert.equal(app.token(),null);
 await api.saveTokenImage(actor,{name:'A',src:'a.png'});assert.equal((await app._prepareContext()).images.length,2);
});
test('deleting a library entry never updates tokens; deleted entries cannot be applied',async()=>{
 const{api,actor,tokens}=setup();await api.saveTokenImage(actor,{name:'A',src:'a.png'});const id=api.tokenImages(actor)[0].id;await api.deleteTokenImage(actor,id);
 assert.equal(tokens[0].updates.length,0);await assert.rejects(api.applyTokenImage(actor,tokens[0],id));
});
test('sheet header and HUD entry hooks register; unowned sheets get no control',()=>{
 const{api,actor,hooks}=setup();api.initAlternativeTokens();assert(hooks.has('renderTokenHUD'));
 const controls=[];hooks.get('getHeaderControlsActorSheetV2')({actor},controls);assert.equal(controls[0].label,'Альтернативні токени');
 hooks.get('getHeaderControlsActorSheetV2')({actor},controls);assert.equal(controls.length,1);
 actor.isOwner=false;const hidden=[];hooks.get('getHeaderControlsActorSheetV2')({actor},hidden);assert.equal(hidden.length,0);
});

test('Quick Upload adapter saves library only and requires active integration',async()=>{
 const{api,actor,tokens,root}=setup();assert.equal(api.quickUploadAvailable(),false);assert.throws(()=>api.openAlternativeQuickUpload(actor,{}));
 let target,field,saved=0;root.game.modules.set('foundry-quick-upload',{active:true,api:{openDialog:(d,f)=>{target=d;field=f;}}});
 api.openAlternativeQuickUpload(actor,{name:'Wolf'},()=>saved++);assert.equal(field,'token');assert.notEqual(target,actor);
 await target.update({'prototypeToken.texture.src':'uploads/wolf.webp'});
 assert.equal(api.tokenImages(actor)[0].src,'uploads/wolf.webp');assert.equal(saved,1);assert.equal(tokens[0].updates.length,0);assert.equal(actor.prototypeToken.texture.src,'prototype.png');assert.equal(actor.img,'portrait.png');
 await assert.rejects(target.update({img:'wrong.png'}));
});
test('HUD uses live element, accepts left without col and deduplicates inherited hooks',()=>{
 const{api,actor,tokens,root}=setup();let button;const host={append:b=>{button=b;}};
 const element={querySelector:s=>s==='[data-fantik-alternatives]'?button:host};
 root.document={createElement:()=>({dataset:{},setAttribute(){},addEventListener(){}})};
 api.installAlternativeTokenHUD({object:{document:tokens[0]},element},{});assert.equal(button.title,'Альтернативні токени');
 const first=button;api.installAlternativeTokenHUD({document:tokens[0],element},{});assert.equal(button,first);
});

test('standard prototype image is first, live, deduplicated and protected',async()=>{
 const{api,actor,tokens}=setup();await api.saveTokenImage(actor,{name:'Old default',src:'prototype.png'});
 await api.saveTokenImage(actor,{name:'Wolf',src:'wolf.png'});
 let images=api.galleryImages(actor);assert.equal(images.length,2);assert.equal(images[0].standard,true);assert.equal(images[0].src,'prototype.png');
 await assert.rejects(api.deleteTokenImage(actor,images[0].id));await assert.rejects(api.saveTokenImage(actor,{id:images[0].id,name:'X',src:'x.png'}));
 actor.prototypeToken.texture.src='new-default.png';images=api.galleryImages(actor);assert.equal(images[0].src,'new-default.png');
 await api.applyTokenImage(actor,tokens[0],images[0].id);assert.equal(tokens[0].texture.src,'new-default.png');assert.equal(tokens[1].texture.src,'t2.png');
});
