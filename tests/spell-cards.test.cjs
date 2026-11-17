const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/framework/spell-cards.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');

function setup(version = '6.0.3') {
    const users = new Map([
        ['player', {id:'player', active:true, isGM:false, viewedScene:'scene', character:{uuid:'Actor.caster'}}],
        ['gm', {id:'gm', active:true, isGM:true, viewedScene:'scene', character:{uuid:'Actor.caster'}}],
        ['gm2', {id:'gm2', active:true, isGM:true}]
    ]);
    const fixture = {gm:'gm', hp:18, max:30, reads:0, sent:[], clients:[], drop:false, notices:[]};
    const token = {documentName:'Token', parent:{id:'scene'}, hidden:false,
        actor:{system:{attributes:{get hp(){fixture.reads++;return {value:fixture.hp,max:fixture.max};}}}}};
    const create = id => {
        const handlers = new Map(), timers = new Map();let nextTimer = 0;
        const context = {
            console, AbortController, MODULE_ID:'fantik-automations',
            game:{system:{version}, user:users.get(id), users:{get:key=>users.get(key), get activeGM(){return users.get(fixture.gm);}}},
            foundry:{utils:{randomID:()=>`${id}-${Math.random()}`}},
            fromUuidSync:uuid=>uuid==='Scene.scene.Token.target'?token:null,
            Hooks:{on(){}}, document:{},
            ui:{notifications:{warn:m=>fixture.notices.push(m),error:m=>fixture.notices.push(m)}},
            ChatMessage:{getSpeaker:({actor, token, scene})=>({actor:actor.uuid,token:token.id,scene:scene.id})},
            setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
            registerSocketHandler:(name, fn)=>handlers.set(name,fn),
            emitToOthers:(event, payload)=>{
                fixture.sent.push({sender:id,event,payload:structuredClone(payload)});
                if (!fixture.drop) for (const client of fixture.clients) {
                    if (client.id !== id) client.handlers.get(event)?.(structuredClone(payload));
                }
            }
        };
        vm.runInNewContext(source+'\nglobalThis.api={initSpellCards,getWounded,renderSpellCard,rollRecordedSave,buildCardData,createCard};', context);
        const client = {id,handlers,timers,context,...context.api};fixture.clients.push(client);client.initSpellCards();return client;
    };
    fixture.player=create('player');fixture.master=create('gm');fixture.other=create('gm2');
    return {...fixture, fixture, users, token, request:signal=>fixture.player.getWounded({targetUuid:'Scene.scene.Token.target',actorUuid:'Actor.caster',sceneId:'scene',signal})};
}

test('one designated GM returns only wound boolean; no HP in socket payloads', async()=>{
    const f=setup();assert.equal(await f.request(),true);assert.equal(f.fixture.reads,1);
    const responses=f.fixture.sent.filter(x=>x.event.endsWith('Response'));
    assert.equal(responses.length,1);assert.deepEqual(Object.keys(responses[0].payload).sort(),['gm','id','recipient','wounded']);
    assert.equal(f.player.timers.size,0);
    f.fixture.hp=30;assert.equal(await f.request(),false);
    f.fixture.hp=0;assert.equal(await f.request(),true);
});
test('GM can check directly without broadcasting',async()=>{
    const f=setup();assert.equal(await f.master.getWounded({targetUuid:'Scene.scene.Token.target',actorUuid:'Actor.caster',sceneId:'scene'}),true);
    assert.equal(f.fixture.sent.length,0);
});
test('no GM, timeout, and cancellation reject without a default d8',async()=>{
    const f=setup();f.fixture.gm=null;await assert.rejects(f.request(),/GM/);assert.equal(f.fixture.sent.length,0);
    f.fixture.gm='gm';f.fixture.drop=true;
    const timeout=f.request();for(const fn of [...f.player.timers.values()])fn();await assert.rejects(timeout,/відповів/);assert.equal(f.player.timers.size,0);
    const controller=new AbortController();const aborted=f.request(controller.signal);controller.abort();await assert.rejects(aborted,/скасовано/);assert.equal(f.player.timers.size,0);
});
test('hidden tokens, other scenes, wrong caster and unavailable HP reveal no state',async()=>{
    const f=setup();f.token.hidden=true;await assert.rejects(f.request());assert.equal(f.fixture.reads,0);
    f.token.hidden=false;f.token.parent.id='other';await assert.rejects(f.request());assert.equal(f.fixture.reads,0);
    f.token.parent.id='scene';f.users.get('player').character.uuid='Actor.other';await assert.rejects(f.request());assert.equal(f.fixture.reads,0);
    f.users.get('player').character.uuid='Actor.caster';f.fixture.hp=null;await assert.rejects(f.request());
    assert(f.fixture.sent.filter(x=>x.event.endsWith('Response')).every(x=>!('wounded' in x.payload)));
});
test('unsolicited/wrong-GM replies cannot settle requests, and replies after cancel do nothing',async()=>{
    const f=setup();f.fixture.drop=true;const controller=new AbortController();const promise=f.request(controller.signal);
    const request=f.fixture.sent[0].payload;const reply=f.player.handlers.get('spellCards.woundedResponse');
    reply({id:request.id,recipient:'player',gm:'gm2',wounded:true});assert.equal(f.player.timers.size,1);
    reply({id:request.id,recipient:'other',gm:'gm',wounded:true});assert.equal(f.player.timers.size,1);
    controller.abort();await assert.rejects(promise);
    reply({id:request.id,recipient:'player',gm:'gm',wounded:true});assert.equal(f.player.timers.size,0);
});

function saveMessage() {
    return {id:'message',isContentVisible:true,system:{targets:[{token:'Scene.scene.Token.target'}]},
        getFlag:namespace=>namespace==='world'?{target:'Scene.scene.Token.target',dc:16,ability:'wis'}:{kind:'toll-the-dead'}};
}
test('GM saving throw uses recorded token and DC, prevents duplicate clicks, then unlocks',async()=>{
    const f=setup(), calls=[];let release;
    Object.assign(f.token,{id:'target'});Object.assign(f.token.actor,{uuid:'Actor.enemy',isOwner:true,
        rollSavingThrow:(...args)=>{calls.push(args);return new Promise(resolve=>release=resolve);}});
    const button={disabled:false},event={shiftKey:true},message=saveMessage();
    const pending=f.master.rollRecordedSave(message,{event,button});
    assert.equal(button.disabled,true);
    await f.master.rollRecordedSave(message,{button:{disabled:false}});
    assert.equal(calls.length,1);assert.equal(calls[0][0].ability,'wis');assert.equal(calls[0][0].target,16);
    assert.equal(calls[0][0].event,event);assert.equal(calls[0][2].data.speaker.token,'target');
    assert.equal(calls[0][2].data.speaker.actor,'Actor.enemy');assert.equal(calls[0][2].data.system.origin,'message');
    release(null);await pending;assert.equal(button.disabled,false);
    const retry=f.master.rollRecordedSave(message,{button});assert.equal(calls.length,2);release([]);await retry;
});
test('players, hidden messages, missing tokens and invalid DC never roll another creature',async()=>{
    const f=setup();let calls=0;Object.assign(f.token.actor,{isOwner:true,rollSavingThrow:async()=>{calls++;}});
    await f.player.rollRecordedSave(saveMessage());
    await f.master.rollRecordedSave({...saveMessage(),isContentVisible:false});
    const missing=saveMessage();missing.system.targets[0].token='Scene.scene.Token.deleted';
    missing.getFlag=ns=>ns==='world'?{target:'Scene.scene.Token.deleted',dc:16}:{kind:'toll-the-dead'};
    await f.master.rollRecordedSave(missing);
    const invalid=saveMessage();invalid.getFlag=ns=>ns==='world'?{target:'Scene.scene.Token.target',dc:'invalid'}:{kind:'toll-the-dead'};
    await f.master.rollRecordedSave(invalid);
    assert.equal(calls,0);assert.equal(f.fixture.notices.length,2);
});

test('5.3.3 saving throw resolves the recorded token from flags and uses the native three-argument API',async()=>{
    const f=setup('5.3.3'),calls=[];
    Object.assign(f.token,{id:'target'});
    Object.assign(f.token.actor,{uuid:'Actor.enemy',isOwner:true,rollSavingThrow:async(...args)=>{calls.push(args);return [];}});
    const flags={world:{fantikTollTheDead:{target:'Scene.scene.Token.target',dc:15}},
        'fantik-automations':{spellCard:{kind:'toll-the-dead',version:1}},
        dnd5e:{targets:[{uuid:'Actor.enemy',token:'Scene.scene.Token.target',name:'Enemy'}]}};
    const message={id:'old-message',system:{},isContentVisible:true,getFlag:(ns,key)=>flags[ns]?.[key]};
    await f.master.rollRecordedSave(message);
    assert.equal(calls.length,1);
    assert.equal(calls[0][0].ability,'wis');assert.equal(calls[0][0].target,15);
    assert.equal(calls[0][2].data.speaker.token,'target');
    assert.equal(calls[0][2].data.speaker.actor,'Actor.enemy');
    assert.equal(calls[0][2].data.system,undefined);
    flags.dnd5e.targets=[];
    await f.master.rollRecordedSave(message);assert.equal(calls.length,1);
});

function genericMessage({ability='dex', dc=17, targets=[{token:'Scene.scene.Token.target'}], damage=true}={}) {
    const config={version:2,save:{ability,dc},targets,damage};
    return {id:'generic',isContentVisible:true,system:damage?{targets}:{},
        getFlag:(ns,key)=>ns==='fantik-automations'&&key==='spellCard'?config:undefined};
}

test('generic cards roll all six save abilities without any spell kind or Item',async()=>{
    const f=setup(),calls=[];
    Object.assign(f.token,{id:'target'});
    Object.assign(f.token.actor,{uuid:'Actor.enemy',isOwner:true,rollSavingThrow:async(...args)=>calls.push(args)});
    for(const ability of ['str','dex','con','int','wis','cha']) await f.master.rollRecordedSave(genericMessage({ability}));
    assert.deepEqual(calls.map(c=>c[0].ability),['str','dex','con','int','wis','cha']);
    assert(calls.every(c=>c[0].target===17&&c[2].data.speaker.token==='target'));
    await f.master.rollRecordedSave(genericMessage({ability:'nope'}));
    assert.equal(calls.length,6);
});

test('multiple targets require an explicit recorded UUID; save-only cards work',async()=>{
    const f=setup(),calls=[];
    Object.assign(f.token,{id:'target'});
    Object.assign(f.token.actor,{uuid:'Actor.enemy',isOwner:true,rollSavingThrow:async()=>calls.push('first')});
    const second={documentName:'Token',id:'second',parent:{id:'scene'},actor:{uuid:'Actor.second',isOwner:true,
        rollSavingThrow:async()=>calls.push('second')}};
    f.master.context.fromUuidSync=id=>id==='Scene.scene.Token.second'?second:f.token;
    const message=genericMessage({damage:false,targets:[{token:'Scene.scene.Token.target'},{token:'Scene.scene.Token.second'}]});
    await f.master.rollRecordedSave(message);
    await f.master.rollRecordedSave(message,{targetUuid:'Scene.scene.Token.not-recorded'});
    assert.equal(calls.length,0);
    await f.master.rollRecordedSave(message,{targetUuid:'Scene.scene.Token.second'});
    assert.deepEqual(calls,['second']);
});

test('failed saves unlock the button; player and blind-card requests never roll',async()=>{
    const f=setup();let calls=0;
    Object.assign(f.token.actor,{uuid:'Actor.enemy',isOwner:true,rollSavingThrow:async()=>{calls++;throw Error('test failure');}});
    const button={disabled:false};
    f.master.context.console={...console,error(){}};
    await f.master.rollRecordedSave(genericMessage(),{button});
    assert.equal(button.disabled,false);
    await f.master.rollRecordedSave(genericMessage(),{button});
    await f.player.rollRecordedSave(genericMessage());
    await f.master.rollRecordedSave({...genericMessage(),isContentVisible:false});
    assert.equal(calls,2);
});

test('wound lookup accepts an owned selected synthetic actor, but not somebody else’s actor',async()=>{
    const f=setup();
    for(const client of f.fixture.clients) client.context.fromUuidSync=uuid=>{
        if(uuid==='Scene.scene.Token.target')return f.token;
        if(uuid==='Scene.scene.Token.caster.Actor.selected')return {documentName:'Actor',testUserPermission:(u,p)=>u.id==='player'&&p==='OWNER'};
        return null;
    };
    const request={targetUuid:'Scene.scene.Token.target',actorUuid:'Scene.scene.Token.caster.Actor.selected',sceneId:'scene'};
    assert.equal(await f.player.getWounded(request),true);
    await assert.rejects(f.player.getWounded({...request,actorUuid:'Actor.not-owned'}));
    assert.equal(f.fixture.reads,1);
});

function publicationFixture() {
    const f=setup(),ctx=f.player.context,created=[];
    ctx.game.settings={get:()=> 'publicroll'};
    ctx.ChatMessage.getSpeaker=options=>options.actor?{actor:options.actor.uuid}:{alias:options.alias};
    ctx.ChatMessage.applyRollMode=(data,mode)=>{
        if(mode==='blindroll'){data.blind=true;data.whisper=['gm'];}
        if(mode==='selfroll')data.whisper=['player'];
    };
    ctx.ChatMessage.create=async data=>{created.push(data);return data;};
    return {f,ctx,api:f.player,created};
}

test('card builder records exact targets, typed rolls and save behavior without consuming resources',()=>{
    const {api}=publicationFixture();
    const caster={uuid:'Actor.selected',update(){throw Error('Must not mutate');}};
    const roll={evaluated:true,options:{type:'fire'},dice:[]};
    const target={documentName:'Token',uuid:'Scene.scene.Token.enemy',name:'Enemy',actor:{uuid:'Scene.scene.Token.enemy.Actor.enemy'},texture:{src:'enemy.webp'}};
    const data=api.buildCardData({caster,targets:[target,target],content:'Fire',damageRolls:[roll],save:{ability:'dex',dc:16,onSave:'half'}});
    assert.equal(data.type,'damage');assert.equal(data.system.onSave,'half');
    assert.equal(data.system.targets.length,1);assert.equal(data.system.targets[0].actor,target.actor.uuid);
    assert.equal(data.rolls[0],roll);assert.equal(data.speaker.actor,caster.uuid);
    assert.equal(data.flags['fantik-automations'].spellCard.save.ability,'dex');
    assert.match(data.content,/fantik-spell-card/);
});

test('targetless/card-only publication needs no caster, scene, item or Dice So Nice',async()=>{
    const {api,created}=publicationFixture();
    await api.createCard({content:'Social cast'});
    assert.equal(created.length,1);assert.equal(created[0].type,undefined);
    assert.equal(created[0].flags['fantik-automations'].spellCard.targets.length,0);
    assert.equal(created[0].flags['fantik-automations'].spellCard.damage,false);
});

test('publication waits for dice, preserves blind viewers and never rerolls',async()=>{
    const {api,ctx,created}=publicationFixture();let finish;const shown=[];
    ctx.game.dice3d={showForRoll:(...args)=>{shown.push(args);return new Promise(resolve=>finish=resolve);}};
    const roll={evaluated:true,dice:[],evaluate(){throw Error('No reroll');}};
    const pending=api.createCard({content:'Damage',damageRolls:[roll],rollMode:'blindroll'});
    assert.equal(created.length,0);assert.equal(shown.length,1);
    assert.deepEqual(Array.from(shown[0][3]),['gm']);assert.equal(shown[0][4],true);
    finish();await pending;
    assert.equal(created.length,1);assert.equal(created[0].rolls[0],roll);
    assert.equal(created[0].flags['dice-so-nice'].skip,true);
});

test('animation failure still publishes the evaluated roll; invalid save config does not block a card',async()=>{
    const {api,ctx,created}=publicationFixture();
    ctx.console={...console,warn(){}};
    ctx.game.dice3d={showForRoll:async()=>{throw Error('Unavailable');}};
    await api.createCard({damageRolls:[{evaluated:true,dice:[]}],save:{ability:'oops',dc:NaN}});
    assert.equal(created.length,1);assert.equal(created[0].flags['fantik-automations'].spellCard.save,null);
});

test('default card breakdown keeps discarded and extra damage dice visible and escapes text',()=>{
    const {api}=publicationFixture();
    const roll={evaluated:true,formula:'2d6 + <bonus>',total:7,options:{type:'fire'},
        dice:[{faces:6,results:[{result:2,discarded:true},{result:6,active:true}]},{faces:4,results:[{result:1}]}]};
    const data=api.buildCardData({damageRolls:[roll]});
    assert.match(data.content,/&lt;bonus&gt;/);assert.match(data.content,/line-through[^>]*>2<\/span>/);
    assert.match(data.content,/>6<\/span>/);assert.match(data.content,/d4: <span>1<\/span>/);
    assert.equal(data.rolls[0],roll);
});
