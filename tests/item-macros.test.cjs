const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../scripts/framework/item-macros.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function setup() {
    const f = {notices:[], native:[], executions:[], writes:[], hooks:new Map(), listeners:new Map(), items:new Map(), dialogs:[]};
    class Item {
        constructor(type = 'spell') {
            Object.assign(this, {type, uuid:`Actor.owner.Item.${type}`, name:`Test ${type}`, isOwner:true,
                actor:{id:'owner'}, flag:null});
            f.items.set(this.uuid, this);
        }
        getFlag() { return this.flag; }
        async setFlag(ns, key, value) {
            f.writes.push({ns,key,value});
            if (f.failWrite) throw Error('Write failed');
            if (key.endsWith('.enabled')) this.flag.enabled=value;
            else this.flag=value;
        }
        use(...args) { f.native.push({item:this,args}); return 'native-result'; }
    }
    class Dialog {
        constructor(options) { this.options=options; this.events={}; f.dialogs.push(this); }
        addEventListener(name, fn) { this.events[name]=fn; }
        render() { this.rendered=true; return this; }
        bringToFront() { this.focused=true; }
        async close() { this.closed=true;this.events.close?.(); }
    }
    class Macro {
        constructor(data) { this.data=data; }
        async execute(scope) {
            f.executions.push({scope,data:this.data});
            if (f.execute) return f.execute(scope);
            const {speaker,actor,token,...rest}=scope;
            return new AsyncFunction('speaker','actor','token','character','scope',...Object.keys(rest),
                `{${this.data.command}\n}`)(speaker,actor,token,f.character,rest,...Object.values(rest));
        }
    }
    f.character={id:'assigned',name:'Assigned character',getActiveTokens:()=>[{id:'own-token',document:{parent:{id:'scene'}}}]};
    const context={MODULE_ID:'fantik-automations',console:{error(){}},
        ownPublicAutomation:()=>null, publishItemAutomation:async()=>{},
        foundry:{utils:{AsyncFunction},applications:{api:{DialogV2:Dialog},sidebar:{apps:{Compendium:class{}}}}},
        game:{user:{id:'player',name:'Player',get character(){return f.character;},can:()=>!f.noScripts},
            items:{get:id=>[...f.items.values()].find(item=>item.uuid.endsWith(id))}},
        CONFIG:{Item:{documentClass:Item},Macro:{documentClass:Macro}},CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OWNER:3}},
        Hooks:{on:(key,fn)=>f.hooks.set(key,fn)},document:{addEventListener:(key,fn)=>f.listeners.set(key,fn)},
        fromUuid:async uuid=>f.items.get(uuid),ui:{notifications:{warn:m=>f.notices.push(m),error:m=>f.notices.push(m)}}};
    vm.runInNewContext(source+'\nglobalThis.api={itemMacroState,validateItemMacro,saveItemMacro,openItemMacroEditor,executeItemMacro,interceptItemMacroActivity,installItemMacroUseWrapper,initItemMacros};',context);
    Object.assign(f,context.api,{Item});
    f.initItemMacros();f.installItemMacroUseWrapper();
    return f;
}

test('all item kinds get the menu; read-only items and compendiums do not',()=>{
    const f=setup();
    for(const type of ['spell','feat','weapon','equipment','consumable','tool']) {
        const item=new f.Item(type), entries=[];
        f.hooks.get('dnd5e.getItemContextOptions')(item,entries);
        assert.equal(entries[0].name,'Use macros instead');
        item.isOwner=false;const hidden=[];f.hooks.get('dnd5e.getItemContextOptions')(item,hidden);assert.equal(hidden.length,0);
        item.isOwner=true;item.pack='locked';f.hooks.get('dnd5e.getItemContextOptions')(item,hidden);assert.equal(hidden.length,0);
    }
});

test('unconfigured and disabled items retain exact native arguments, receiver and result',()=>{
    const f=setup(),item=new f.Item(),args=[{chooseActivity:true},{configure:true},{create:true}];
    assert.equal(item.use(...args),'native-result');
    item.flag={enabled:false,command:'throw Error("must not run")'};
    assert.equal(item.use(...args),'native-result');
    assert.equal(f.native.length,2);assert.equal(f.native[1].item,item);assert.deepEqual(f.native[1].args,args);
    assert.equal(f.executions.length,0);
});

test('enabled replacement runs once before native dialogs or resource use, preserving item context',async()=>{
    const f=setup(),item=new f.Item('feat'),event={shiftKey:true};
    item.flag={enabled:true,command:'const actor = "local declaration"; item.ran = actor; return {message:"not a native result"};'};
    assert.equal(await item.use({event}),undefined);
    assert.equal(item.ran,'local declaration');assert.equal(f.native.length,0);assert.equal(f.executions.length,1);
    const {scope,data}=f.executions[0];
    assert.equal(scope.item,item);assert.equal(scope.itemActor,item.actor);assert.equal(scope.actor,f.character);
    assert.equal(scope.event,event);assert.equal(scope.token.id,'own-token');assert.equal(data.ownership.player,3);
});

test('direct activity use cancels synchronously, then runs its replacement locally',async()=>{
    const f=setup(),item=new f.Item(),activity={item},event={ctrlKey:true};
    item.flag={enabled:true,command:'item.ran = true;'};
    assert.equal(f.interceptItemMacroActivity(activity,{event}),false);
    assert.equal(f.executions.length,0);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(item.ran,true);assert.equal(f.executions[0].scope.activity,activity);
    item.flag.enabled=false;assert.equal(f.interceptItemMacroActivity(activity),undefined);
});

test('duplicate and recursive use is blocked, cancellation and errors release the lock',async()=>{
    const f=setup(),item=new f.Item();item.flag={enabled:true,command:'return;'};
    let release;f.execute=()=>new Promise(r=>release=r);
    const pending=item.use();await item.use();assert.equal(f.executions.length,1);
    release(null);await pending;
    f.execute=async()=>{await item.use();throw Error('failure');};
    await item.use();assert.equal(f.executions.length,2);assert.equal(f.native.length,0);
    f.execute=async()=>{};await item.use();assert.equal(f.executions.length,3);
});

test('invalid/empty scripts, execution denial and unowned items never fall through to vanilla',async()=>{
    const f=setup(),item=new f.Item();
    for(const command of ['', 'const = bad']) {item.flag={enabled:true,command};await item.use();}
    item.flag.command='item.ran=true';f.noScripts=true;await item.use();
    f.noScripts=false;item.isOwner=false;await item.use();
    assert.equal(f.executions.length,0);assert.equal(f.native.length,0);assert.equal(f.notices.length,4);
});

test('saving validates without executing, persists per item and supports disabled code',async()=>{
    const f=setup(),item=new f.Item('weapon');
    await f.saveItemMacro(item,{command:'item.ran = true;',enabled:false});
    assert.equal(item.flag.enabled,false);assert.equal(item.ran,undefined);
    await assert.rejects(f.saveItemMacro(item,{command:'const = invalid',enabled:true}));
    assert.equal(item.flag.command,'item.ran = true;');
    item.isOwner=false;await assert.rejects(f.saveItemMacro(item,{command:'return;',enabled:true}));
    assert.equal(f.writes.length,1);
});

test('editor escapes code, refocuses an existing window, and keeps invalid or unsaved edits open',async()=>{
    const f=setup(),item=new f.Item();item.flag={enabled:false,command:'// </textarea><img src=x onerror=alert(1)>'};
    const dialog=f.openItemMacroEditor(item);assert.equal(f.openItemMacroEditor(item),dialog);assert.equal(dialog.focused,true);
    assert(!dialog.options.content.includes('</textarea><img'));assert(dialog.options.content.includes('&lt;/textarea&gt;'));
    const save=dialog.options.buttons[0].callback;
    const button={form:{elements:{command:{value:'const = invalid'},enabled:{checked:true}}}};
    await save(null,button);assert(!dialog.closed);assert.equal(f.writes.length,0);
    button.form.elements.command.value='return;';f.failWrite=true;
    await save(null,button);assert(!dialog.closed);
    f.failWrite=false;await save(null,button);assert.equal(dialog.closed,true);assert.equal(item.flag.enabled,true);
    assert.notEqual(f.openItemMacroEditor(item),dialog);
});

test('wrapper installation is idempotent and a completed macro can run again',async()=>{
    const f=setup(),item=new f.Item();item.flag={enabled:true,command:'item.count=(item.count??0)+1;'};
    const use=f.Item.prototype.use;f.installItemMacroUseWrapper();assert.equal(f.Item.prototype.use,use);
    await item.use();await item.use();assert.equal(item.count,2);assert.equal(f.native.length,0);
});

test('no assigned character passes no unrelated actor or token into the macro',async()=>{
    const f=setup(),item=new f.Item();f.character=null;item.flag={enabled:true,command:'return;'};
    await item.use();const scope=f.executions[0].scope;
    assert.equal(scope.actor,null);assert.equal(scope.token,null);assert.equal(scope.speaker.actor,null);
    assert.equal(scope.itemActor,item.actor);
});

test('configured items keep one Manage macros entry and editor access without script permission',async()=>{
    const f=setup(),item=new f.Item();item.flag={enabled:true,command:'return 42;'};f.noScripts=true;
    const entries=[];f.hooks.get('dnd5e.getItemContextOptions')(item,entries);
    assert.equal(entries[0].name,'Manage macros');assert(entries[0].classes.includes('fantik-item-macro-active'));
    assert(entries[0].icon.includes('color:#51b986'));assert.equal(entries.length,1);
    const dialog=entries[0].callback();
    await dialog.options.buttons.find(b=>b.action==='disable').callback();assert.equal(item.flag.enabled,false);assert.equal(item.flag.command,'return 42;');
    assert.equal(await item.use(),'native-result');
    const disabled=[];f.hooks.get('dnd5e.getItemContextOptions')(item,disabled);
    assert.equal(disabled[0].name,'Manage macros');assert(!disabled[0].classes.includes('fantik-item-macro-active'));
    assert.equal(disabled.length,1);assert.equal(item.flag.enabled,false);
});

test('editor has an independent disable action, including broken code and no script permission',async()=>{
    const f=setup(),item=new f.Item();item.flag={enabled:true,command:'const = broken'};f.noScripts=true;
    const dialog=f.openItemMacroEditor(item);
    assert(dialog.options.content.includes('readonly'));
    assert(dialog.options.buttons.find(b=>b.action==='save').disabled);
    await dialog.options.buttons.find(b=>b.action==='disable').callback();
    assert.equal(item.flag.enabled,false);assert.equal(item.flag.command,'const = broken');assert(dialog.closed);
});

test('directory has only one entry and refreshes its name and accent when reopened',async()=>{
    const f=setup(),item=new f.Item(),entries=[];
    f.hooks.get('getItemContextOptions')({},entries);
    const li={dataset:{entryId:'spell'}};
    assert(entries[0].condition(li));assert.equal(entries[0].name,'Use macros instead');assert.equal(entries.length,1);
    item.flag={enabled:true,command:'return;'};
    assert(entries[0].condition(li));assert.equal(entries[0].name,'Manage macros');assert(entries[0].classes.includes('active'));
    const dialog=entries[0].callback(li);await dialog.options.buttons.find(b=>b.action==='disable').callback();
    assert(entries[0].condition(li));assert(!entries[0].classes.includes('active'));
    assert.equal(entries.length,1);
});
