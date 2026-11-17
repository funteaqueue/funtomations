// Requires Playwright and Chromium. This tests browser DOM behavior, not live Foundry.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

test('generic GM controls preserve the native tray, target each token, and survive rerenders',async()=>{
    const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    try {
        const page=await browser.newPage();
        const source=fs.readFileSync(path.join(__dirname,'../scripts/framework/spell-cards.js'),'utf8')
            .replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
        const result=await page.evaluate(async source=>{
            window.MODULE_ID='fantik-automations';
            window.game={user:{isGM:true},system:{version:'6.0.3'}};
            window.ui={notifications:{warn(){},error(){}}};
            window.ChatMessage={getSpeaker:({token})=>({token:token.id})};
            const calls=[];
            window.fromUuidSync=uuid=>({documentName:'Token',id:uuid,parent:{},actor:{isOwner:true,
                rollSavingThrow:async options=>calls.push([uuid,options.ability,options.target])}});
            const render=new Function(source+';return renderSpellCard;')();
            const targets=[{token:'Token.a',name:'<b>Enemy A</b>'},{token:'Token.b',name:'Enemy B'}];
            const config={version:2,damage:true,targets,save:{ability:'con',dc:18}};
            const message={id:'m',type:'damage',isContentVisible:true,system:{targets},
                content:'<section class="fantik-spell-card"><h3>Spell</h3><div data-fantik-save></div><div data-fantik-damage></div></section>',
                getFlag:()=>config};
            const html=document.createElement('article');html.dataset.messageId='m';
            html.innerHTML='<div class="message-content"><damage-application><button>Apply</button></damage-application></div>';
            document.body.append(html);
            const tray=html.querySelector('damage-application');let applies=0;
            tray.querySelector('button').addEventListener('click',()=>applies++);
            render(message,html);
            const retained=html.querySelector('damage-application')===tray;
            const buttons=html.querySelectorAll('.fantik-recorded-save');
            const literalName=buttons[0].textContent.includes('<b>Enemy A</b>')&&!buttons[0].querySelector('b');
            buttons[1].click();await new Promise(resolve=>setTimeout(resolve,0));
            const automaticApplies=applies;
            tray.querySelector('button').click();
            render(message,html);
            const rerender={buttons:html.querySelectorAll('.fantik-recorded-save').length,trays:html.querySelectorAll('damage-application').length};
            game.user.isGM=false;render(message,html);
            const playerControls=html.querySelectorAll('.fantik-recorded-save, damage-application').length;
            game.user.isGM=true;message.system.targets=[];render(message,html);
            const untargetedControls=html.querySelectorAll('.fantik-recorded-save, damage-application').length;
            message.isContentVisible=false;html.innerHTML='<div class="message-content">Private</div>';render(message,html);
            const privateUnchanged=html.textContent==='Private';
            // A save-only message has no damage model; use recorded flags.
            message.isContentVisible=true;message.system={};config.damage=false;render(message,html);
            const saveOnly={buttons:html.querySelectorAll('.fantik-recorded-save').length,trays:html.querySelectorAll('damage-application').length};
            return {retained,literalName,calls,automaticApplies,applies,rerender,playerControls,untargetedControls,privateUnchanged,saveOnly};
        },source);
        assert.equal(result.retained,true);assert.equal(result.literalName,true);
        assert.deepEqual(result.calls,[['Token.b','con',18]]);
        assert.equal(result.automaticApplies,0);assert.equal(result.applies,1);
        assert.deepEqual(result.rerender,{buttons:2,trays:1});
        assert.equal(result.playerControls,0);assert.equal(result.untargetedControls,0);
        assert.equal(result.privateUnchanged,true);assert.deepEqual(result.saveOnly,{buttons:2,trays:0});
    } finally {await browser.close();}
});
