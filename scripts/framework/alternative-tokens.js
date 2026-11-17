import {MODULE_ID} from './constants.js';

const FLAG = 'alternativeTokens';
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const queues = new Map();
export function libraryActor(actor) {
    return actor?.isToken ? game.actors.get(actor.token?.actorId) : actor;
}
export function tokenImages(actor) { return actor?.getFlag(MODULE_ID, FLAG)?.images ?? []; }
const STANDARD_IMAGE_ID = 'actor-standard-token';
export function galleryImages(actor) {
    const src=actor?.prototypeToken?.texture?.src;
    const images=tokenImages(actor);
    return src ? [{id:STANDARD_IMAGE_ID,name:'Стандартний токен',src,standard:true},
        ...images.filter(image=>image.src!==src)] : images;
}
export function sceneTokens(actor) {
    return (canvas.scene?.tokens?.contents ?? []).filter(t => t.actorId === actor.id && t.isOwner);
}
function requireOwner(actor) {
    if (!actor?.isOwner || actor.pack) throw new Error('Немає дозволу змінювати цього персонажа.');
}
function mutate(actor, fn) {
    requireOwner(actor);
    const previous = queues.get(actor.uuid) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
        requireOwner(actor);
        const images = foundry.utils.deepClone(tokenImages(actor));
        fn(images);
        await actor.setFlag(MODULE_ID, FLAG, {images});
    });
    queues.set(actor.uuid, next);
    next.finally(() => {if (queues.get(actor.uuid) === next) queues.delete(actor.uuid);}).catch(() => {});
    return next;
}
export async function saveTokenImage(actor, {id, name, src}) {
    if(id===STANDARD_IMAGE_ID)throw new Error('Стандартний токен змінюється в налаштуваннях актора.');
    name = String(name ?? '').trim(); src = String(src ?? '').trim();
    if (!name || name.length > 80) throw new Error('Назва: від 1 до 80 символів.');
    if (!src || /^(?:javascript|data|vbscript):/i.test(src)) throw new Error('Оберіть файл зображення.');
    await mutate(actor, images => {
        const existing = images.find(i => i.id === id);
        if (id && !existing) throw new Error('Це зображення вже видалено.');
        if (existing) Object.assign(existing, {name, src});
        else images.push({id:foundry.utils.randomID(), name, src});
    });
}
export async function deleteTokenImage(actor, id) {
    if(id===STANDARD_IMAGE_ID)throw new Error('Стандартний токен не можна видалити.');
    await mutate(actor, images => {const index=images.findIndex(i=>i.id===id);if(index>=0)images.splice(index,1);});
}
function requireToken(actor, token) {
    requireOwner(actor);
    if (!token || !token.isOwner || token.parent?.id !== canvas.scene?.id ||
        token.actorId !== actor.id || canvas.scene.tokens.get(token.id) !== token) {
        throw new Error('Оберіть доступний токен цього персонажа на поточній сцені.');
    }
}
export async function applyTokenImage(actor, token, id) {
    requireToken(actor, token);
    const image = galleryImages(actor).find(i=>i.id===id);
    if (!image) throw new Error('Зображення більше не існує.');
    const src=image.src;
    // Preserve this token's original appearance before changing its texture.
    if (token.texture.src && !galleryImages(actor).some(i=>i.src===token.texture.src)) {
        const original = token.texture.src;
        await mutate(actor, images => {
            if (!images.some(i=>i.src===original)) images.push({id:foundry.utils.randomID(), name:'Початковий вигляд', src:original});
        });
    }
    requireToken(actor, token); // Scene/permissions may have changed during the flag write.
    await token.update({'texture.src':src});
}

export function quickUploadAvailable() {
    const module=game.modules?.get('foundry-quick-upload');
    return !!module?.active && typeof module.api?.openDialog==='function';
}
export function openAlternativeQuickUpload(actor, draft, onSaved = () => {}) {
    requireOwner(actor);
    if(!quickUploadAvailable())throw new Error('Quick Upload недоступний. Скористайтеся вибором файла.');
    // Quick Upload accepts a document-shaped update target. Never give it the
    // real Actor: Actor:token would otherwise overwrite prototypeToken.texture.src.
    const target={documentName:'Actor',name:draft.name || actor.name,
        update:async changes=>{
            const src=changes?.['prototypeToken.texture.src'];
            if(typeof src!=='string'||!src)throw new Error('Quick Upload не повернув шлях до зображення.');
            await saveTokenImage(actor,{id:draft.id,name:draft.name || 'Альтернативний токен',src});
            await onSaved();
        }};
    return game.modules.get('foundry-quick-upload').api.openDialog(target,'token');
}

export class AlternativeTokensApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {classes:['fantik-alternative-tokens'],window:{title:'Альтернативні токени',icon:'fa-solid fa-images',resizable:true},position:{width:420,height:'auto'}};
    static PARTS = {body:{template:`modules/${MODULE_ID}/templates/alternative-tokens.hbs`}};
    actor;
    tokenId;
    sceneId;
    manage = false;
    editor = null;
    busy = false;
    listeners;
    constructor(actor, token = null, options = {}) {
        super({...options,id:`fantik-alternative-tokens-${actor.id}`});
        this.actor=actor;this.tokenId=token?.id ?? '';this.sceneId=canvas.scene?.id;
    }
    get title() { return `Альтернативні токени · ${this.actor.name}`; }
    async _prepareContext() {
        const tokens=sceneTokens(this.actor);
        if (this.sceneId!==canvas.scene?.id) {this.tokenId='';this.sceneId=canvas.scene?.id;}
        if (!tokens.some(t=>t.id===this.tokenId)) this.tokenId=tokens.length===1?tokens[0].id:'';
        const token=tokens.find(t=>t.id===this.tokenId);
        return {tokens:tokens.map(t=>({id:t.id,name:t.name,selected:t.id===this.tokenId})),
            multiple:tokens.length>1,hasToken:!!token,currentSrc:token?.texture.src,manage:this.manage,editor:this.editor,quickUpload:quickUploadAvailable(),
            images:galleryImages(this.actor).map(i=>({...i,active:i.src===token?.texture.src})),busy:this.busy};
    }
    token() {return canvas.scene?.id===this.sceneId ? canvas.scene.tokens.get(this.tokenId) : null;}
    async run(fn) {
        if(this.busy)return;this.busy=true;
        try {await fn();}catch(error){ui.notifications.error(error.message);}
        finally{this.busy=false;if(this.rendered)await this.render();}
    }
    _onClose(options){this.listeners?.abort();super._onClose(options);}
    _onRender(context,options){
        super._onRender(context,options);this.listeners?.abort();this.listeners=new AbortController();
        const root=this.element;
        const on=(sel,event,fn)=>root.querySelectorAll(sel).forEach(e=>e.addEventListener(event,fn,{signal:this.listeners.signal}));
        const edit=(data)=>{this.editor=data;this.render();};
        on('[data-token]','change',e=>{this.tokenId=e.target.value;this.render();});
        on('[data-manage]','click',()=>{this.manage=!this.manage;this.editor=null;this.render();});
        on('[data-add]','click',()=>edit({name:'',src:''}));
        on('[data-quick]','click',()=>{
            const draft={...(this.editor ?? {name:'',src:''})};
            try {openAlternativeQuickUpload(this.actor,draft,async()=>{this.editor=null;if(this.rendered)await this.render();});}
            catch(error){ui.notifications.error(error.message);}
        });
        on('[data-edit]','click',e=>edit({...tokenImages(this.actor).find(i=>i.id===e.currentTarget.dataset.edit)}));
        on('[data-cancel]','click',()=>edit(null));
        on('[name="imageName"]','input',e=>{if(this.editor)this.editor.name=e.target.value;});
        on('[name="imageSrc"]','input',e=>{if(this.editor)this.editor.src=e.target.value;});
        on('[data-browse]','click',()=>{
            this.editor.name=root.querySelector('[name="imageName"]').value;
            this.editor.src=root.querySelector('[name="imageSrc"]').value;
            const draft=this.editor;
            new foundry.applications.apps.FilePicker.implementation({type:'image',current:draft.src,
                callback:path=>{if(this.editor===draft && this.rendered){draft.src=path;this.render();}}}).render({force:true});
        });
        on('[data-save]','click',()=>this.run(async()=>{
            await saveTokenImage(this.actor,{id:this.editor.id,name:root.querySelector('[name="imageName"]').value,src:root.querySelector('[name="imageSrc"]').value});
            this.editor=null;
        }));
        on('[data-apply]','click',e=>this.run(async()=>{await applyTokenImage(this.actor,this.token(),e.currentTarget.dataset.apply);await this.close();}));
        on('[data-delete]','click',e=>this.run(async()=>{
            const id=e.currentTarget.dataset.delete;
            if(await foundry.applications.api.DialogV2.confirm({window:{title:'Видалити з бібліотеки?'},content:'<p>Файл і вигляд токенів на сценах залишаться без змін.</p>'}))await deleteTokenImage(this.actor,id);
        }));
    }
}
export function openAlternativeTokens(actor, token = null) {
    actor=libraryActor(actor);
    try{requireOwner(actor);}catch(error){ui.notifications.warn(error.message);return;}
    const app=foundry.applications.instances.get(`fantik-alternative-tokens-${actor.id}`) ?? new AlternativeTokensApp(actor,token);
    if(token){app.tokenId=token.id;app.sceneId=token.parent.id;}
    return app.render({force:true});
}
export function installAlternativeTokenHUD(hud, html) {
    const token=hud.document ?? hud.object?.document;
    if(!token || (token.documentName && token.documentName!=='Token'))return;
    const actor=game.actors.get(token.actorId) ?? libraryActor(token.actor ?? hud.actor);
    if(!actor?.isOwner||!token.isOwner)return;
    const root=hud.element?.querySelector ? hud.element : (html?.[0] ?? html);
    if(!root?.querySelector || root.querySelector('[data-fantik-alternatives]'))return;
    // Use .left, not .col.left: V14/system HUD templates don't all use "col".
    const host=root.querySelector('.col.left, .left, [data-column="left"]') ?? root;
    const button=document.createElement('button');button.type='button';button.className='control-icon fantik-alternatives-hud';button.dataset.fantikAlternatives='true';
    button.title='Альтернативні токени';button.setAttribute('aria-label',button.title);button.innerHTML='<i class="fa-solid fa-images" inert></i>';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openAlternativeTokens(actor,token);});
    host.append(button);
}
export function initAlternativeTokens(){
    Hooks.on('getHeaderControlsActorSheetV2',(app,controls)=>{
        const actor=libraryActor(app.actor ?? app.document);
        if(!actor?.isOwner||actor.pack)return;
        if(controls.some(c=>c.action==='fantikAlternativeTokens'))return;
        controls.push({action:'fantikAlternativeTokens',icon:'fa-solid fa-images',label:'Альтернативні токени',onClick:()=>openAlternativeTokens(actor,app.actor?.isToken?app.actor.token:null)});
    });
    // V14 system HUDs can dispatch their concrete class or base HUD hook.
    for(const hook of ['renderTokenHUD','renderTokenHUD5e','renderBasePlaceableHUD']) Hooks.on(hook,installAlternativeTokenHUD);
    const refresh=()=>{for(const app of foundry.applications.instances.values())if(app instanceof AlternativeTokensApp&&app.rendered&&!app.busy)app.render();};
    Hooks.on('canvasReady',refresh);Hooks.on('deleteToken',refresh);Hooks.on('updateToken',refresh);
    Hooks.on('updateActor',(actor)=>{for(const app of foundry.applications.instances.values())if(app instanceof AlternativeTokensApp&&app.actor.id===actor.id&&app.rendered&&!app.busy)app.render();});
}
