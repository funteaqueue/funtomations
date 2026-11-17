function makeFixture(root) {
    const collection = array => Object.assign(array,{get(id){return this.find(e=>e.id===id);}});
    const f={messages:[],notices:[],consumed:[],throws:[],hooks:new Map(),slot:'spell3',mode:'publicroll',targets:['old'],dialogs:0,attacks:[],next:1,dialogCancel:false,consumeFail:false};
    const docs=new Map();
    function actor(id){
        const a={id,uuid:`Actor.${id}`,name:id,isOwner:true,items:collection([]),effects:collection([]),
            system:{spells:{spell3:{level:3,value:2},spell5:{level:5,value:2},pact:{level:5,value:2}},traits:{ci:{value:new Set()}}},
            async createEmbeddedDocuments(type,values){return values.map(v=>{const e={...v,id:`effect${f.next++}`,parent:a,getFlag:(ns,key)=>v.flags?.[ns]?.[key],async delete(){a.effects.splice(a.effects.indexOf(e),1);}};a.effects.push(e);return e;});},
            async deleteEmbeddedDocuments(type,ids){a.effects.splice(0,a.effects.length,...a.effects.filter(e=>!ids.includes(e.id)));}};
        docs.set(a.uuid,a);return a;
    }
    f.actor=actor('arlin');f.enemy=actor('enemy');
    f.item={id:'serpent',uuid:'Actor.arlin.Item.serpent',actor:f.actor,type:'spell',name:'Serpent Tongue',img:'icons/magic/poison/strike-vine-tendril-green.webp',system:{level:3,identifier:'serpent-tongue',activities:collection([])}};
    f.actor.items.push(f.item);docs.set(f.item.uuid,f.item);
    f.activity={id:'bite',type:'attack',name:'Укус',item:f.item,actor:f.actor,damage:{critical:{}},
        _requiresConfigurationDialog:()=>true,
        _prepareUsageConfig(config){return {...config,hasConsumption:true,spell:{slot:'spell3'},scaling:0,consume:{action:true,spellSlot:true,resources:['linked'],...config.consume}};},
        metadata:{usage:{dialog:{async create(_a,usage){f.dialogs++;if(f.dialogCancel)throw Error('Cancelled');usage.spell.slot=f.slot;}}}},
        async consume(usage){f.consumed.push(structuredClone(usage));if(f.consumeFail)return false;if(usage.consume.spellSlot){const slot=f.actor.system.spells[usage.spell.slot];if(slot.value<=0)return false;slot.value--;}return {};},
        async rollAttack(config,dialog,message){f.attacks.push({config,dialog,message});const mode=config.rolls[0].options;
            const results=mode.advantage?[{result:1,active:false,discarded:true},{result:20,active:true}]:mode.disadvantage?[{result:20,active:false,discarded:true},{result:1,active:true}]:[{result:12,active:true}];
            return [{formula:mode.advantage?'2d20kh + 7':mode.disadvantage?'2d20kl + 7':'1d20 + 7',total:mode.advantage?27:mode.disadvantage?8:19,isCritical:!!mode.advantage,isFumble:!!mode.disadvantage,options:{},dice:[{faces:20,options:{},results}]}];}}
    f.item.system.activities.push(f.activity);
    f.token={id:'target',name:'Лицар Забутої Клятви',actor:f.enemy,visible:true,center:{x:170,y:90},bounds:{contains:(x,y)=>x>140&&x<200&&y>60&&y<120},document:{documentName:'Token',uuid:'Scene.scene.Token.target',actor:f.enemy,texture:{src:''}}};
    docs.set(f.token.document.uuid,f.token.document);
    f.old={id:'old'};
    const board=root.document?.getElementById('board');
    Object.assign(root,{
        MODULE_ID:'fantik-automations',
        game:{time:{worldTime:100},user:{id:'player',isGM:false,character:f.actor,targets:[f.old]},users:{activeGM:{id:'gm'}},
            system:{id:'dnd5e',version:'6.0.3'},actors:collection([f.actor,f.enemy]),scenes:[{tokens:[f.token.document]}],combats:new Map(),
            settings:{get:(ns,key)=>ns==='core'?f.mode:false},dice3d:{async showForRoll(...args){f.throws.push(args);if(f.hold)await new Promise(resolve=>f.release=resolve);}},
            modules:{get:()=>({active:true})}},
        ui:{notifications:Object.fromEntries(['warn','error','info'].map(k=>[k,m=>f.notices.push(m)]))},
        fromUuid:async uuid=>docs.get(uuid),fromUuidSync:uuid=>docs.get(uuid),
        ActiveEffect:{implementation:{fromStatusEffect:async id=>({toObject:()=>({_id:'native-poison-id',name:'Poisoned',type:'condition',system:{type:id},img:'poison.svg',statuses:[id],flags:{}})})}},
        foundry:{utils:{randomID:()=>`cast${f.next++}`,deepClone:structuredClone},applications:{api:{DialogV2:{wait:async()=>null}}}},
        Hooks:{on:(n,fn)=>{const id=f.next++;f.hooks.set(id,{n,fn});return id;},once(){},off:(_n,id)=>f.hooks.delete(id)},
        ChatMessage:{getSpeaker:({actor})=>({actor:actor.uuid}),applyRollMode:(m,mode)=>{m.whisper=mode==='blindroll'||mode==='gmroll'?['gm']:mode==='selfroll'?['player']:[];m.blind=mode==='blindroll';},
            async create(data){data.id=`msg${f.next++}`;data.isContentVisible=true;data.getFlag=(ns,key)=>data.flags?.[ns]?.[key];f.messages.push(data);return data;}},
        CONFIG:{statusEffects:[{id:'poisoned',img:'poison.svg'}],Dice:{D20Roll:class{},DamageRoll:class{
            constructor(formula,data,options){this.options=options;this.formula=formula;this.faces=12;this.count=Number(formula.match(/^(\d+)d/)[1])*(options.isCritical?2:1);if(options.isCritical)this.formula=formula.replace(/^\d+d/,this.count+'d');}
            async evaluate(){this.dice=[{faces:12,options:{},results:Array.from({length:this.count},(_,i)=>({result:i%2?4:9,active:true}))}];this.total=this.dice[0].results.reduce((sum,r)=>sum+r.result,0)+(Number(this.formula.match(/ \+ (-?\d+)/)?.[1])||0);return this;}
        }}},
        canvas:{ready:true,scene:{id:'scene'},app:{view:board,renderer:{events:{cursorStyles:{default:'auto',grab:'grab',pointer:'pointer'},setCursor(){}}}},
            tokens:{controlled:[{actor:{uuid:'Actor.wrong'}}],placeables:[f.token],get:id=>id==='old'?f.old:id==='target'?f.token:null,setTargets:ids=>{f.targets=ids;root.game.user.targets=ids.map(id=>id==='old'?f.old:f.token);}},
            canvasCoordinatesFromClient:({x,y})=>{const r=board.getBoundingClientRect();return{x:x-r.left,y:y-r.top};},clientCoordinatesFromCanvas:({x,y})=>{const r=board.getBoundingClientRect();return{x:x+r.left,y:y+r.top};}}});
    return f;
}
module.exports={makeFixture};
