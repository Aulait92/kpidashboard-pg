const EV=process.env.EV_DIR||'/var/tmp/ev'; require('fs').mkdirSync(EV,{recursive:true});
const { chromium } = require('playwright');
const B='http://localhost:3123';
const W=1440,H=810;const SC=W/1920;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const INIT=`(()=>{const mk=()=>{ if(document.getElementById('__cur'))return;
 const st=document.createElement('style');st.textContent='nextjs-portal{display:none!important}#__cur{position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;pointer-events:none;transform:translate(-4px,-3px);transition:transform .05s}#__cur svg{filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}#__cap{position:fixed;z-index:2147483646;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);opacity:0;transition:all .45s ease;background:#0b1220;color:#fff;font:600 23px/1.3 Geist,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.3px;padding:14px 26px;border-radius:999px;box-shadow:0 20px 50px -15px rgba(11,18,32,.6);display:flex;gap:16px;align-items:center;white-space:nowrap}#__cap.on{opacity:1;transform:translateX(-50%) translateY(0)}#__cap i{width:12px;height:12px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 6px rgba(37,99,235,.3);display:block}#__ring{position:fixed;z-index:2147483645;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(37,99,235,.28);pointer-events:none;transform:scale(0);opacity:0}#__ring.go{animation:rg .5s ease-out}@keyframes rg{0%{transform:scale(.2);opacity:1}100%{transform:scale(1.6);opacity:0}}';
 document.head.appendChild(st);
 const c=document.createElement('div');c.id='__cur';c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#0b1220" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';document.body.appendChild(c);
 const r=document.createElement('div');r.id='__ring';document.body.appendChild(r);
 const cap=document.createElement('div');cap.id='__cap';cap.innerHTML='<i></i><span></span>';document.body.appendChild(cap);
 const p=window.__pos||{x:${W/2},y:${H/2}};c.style.left=p.x+'px';c.style.top=p.y+'px';
 document.addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px';window.__pos={x:e.clientX,y:e.clientY};sessionStorage.setItem('__pos',JSON.stringify(window.__pos))},true);
 document.addEventListener('mousedown',e=>{r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';r.classList.remove('go');void r.offsetWidth;r.classList.add('go')},true);
 const t=location.protocol==='file:'?null:sessionStorage.getItem('__capt');if(t){cap.querySelector('span').textContent=t;cap.classList.add('on');}
};
 try{window.__pos=JSON.parse(sessionStorage.getItem('__pos'))}catch(e){}
 if(document.readyState!=='loading')mk();else document.addEventListener('DOMContentLoaded',mk);
 window.__cap=(t)=>{const cap=document.getElementById('__cap');if(!cap)return;if(t&&cap.classList.contains('on')&&cap.querySelector('span').textContent===t)return;if(!t){cap.classList.remove('on');sessionStorage.removeItem('__capt');return}sessionStorage.setItem('__capt',t);cap.classList.remove('on');setTimeout(()=>{cap.querySelector('span').textContent=t;cap.classList.add('on')},350)};
})()`;
let cur={x:W/2,y:H/2};
async function moveTo(p,x,y,ms=900){const steps=Math.max(12,Math.round(ms/16));const sx=cur.x,sy=cur.y;
 for(let i=1;i<=steps;i++){const t=i/steps;const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;await p.mouse.move(sx+(x-sx)*e,sy+(y-sy)*e);await sleep(ms/steps);}cur={x,y};}
async function clickLoc(p,loc,ms=900){await loc.scrollIntoViewIfNeeded().catch(()=>{});const b=await loc.boundingBox();if(!b){console.log('nobox');return false;}
 await moveTo(p,b.x+Math.min(b.width/2,120),b.y+b.height/2,ms);await sleep(250);await p.mouse.down();await sleep(90);await p.mouse.up();return true;}
async function cap(p,t){await p.evaluate(t=>window.__cap&&window.__cap(t),t).catch(()=>{});}
async function smoothScroll(p,sel,dy,ms=1600){await p.evaluate(async([sel,dy,ms])=>{const el=sel?document.querySelector(sel):document.scrollingElement;const s=el.scrollTop,st=performance.now();
 await new Promise(r=>{const f=n=>{const t=Math.min(1,(n-st)/ms);const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;el.scrollTop=s+dy*e;t<1?requestAnimationFrame(f):r()};requestAnimationFrame(f)})},[sel,dy,ms]);}
async function wheel(p,dy,ms=1600){const n=Math.round(ms/40);for(let i=0;i<n;i++){await p.mouse.wheel(0,dy/n);await sleep(40);}}

const CARDS='file://'+__dirname+'/cards/';
const VERSION='wa'; const scenes=JSON.parse(require('fs').readFileSync(EV+'/wa.json'));
async function nav(p,name){await clickLoc(p,p.getByRole('link',{name:new RegExp('^\\s*'+name)}).first());await p.waitForLoadState('networkidle').catch(()=>{});await sleep(900);}
let CUR='';
async function go(p,u){await p.goto(B+u,{waitUntil:'networkidle'}).catch(()=>{});await sleep(150);await cap(p,CUR);}

const MOCK=CARDS+'wa_mock.html';
async function mock(p,step){ if(!p.url().includes('wa_mock.html')){await p.goto(MOCK);await sleep(300);} await cap(p,CUR); await p.evaluate(st=>{window.__run=window.S[st]();},step); }
async function clickSel(p,sel,ms=900){await clickLoc(p,p.locator(sel).first(),ms);}
const A={
 card_intro: async p=>{await p.goto(CARDS+'wa_intro.html');await p.evaluate(()=>sessionStorage.clear());},
 card_outro: async p=>{await p.goto(CARDS+'wa_outro.html');await p.evaluate(()=>{sessionStorage.clear();const c=document.getElementById('__cap');if(c)c.classList.remove('on')});},
 bereit: async p=>{await mock(p,'bereit');await p.mouse.move(-50,-50);},
 app_open: async p=>{await go(p,'/buyer/hilfe/whatsapp');await sleep(800);await moveTo(p,700*SC,220*SC,900);await sleep(400);await moveTo(p,800*SC,300*SC,800);await sleep(500);await moveTo(p,800*SC,400*SC,800);},
 app_business: async p=>{await clickLoc(p,p.getByText('Meine Nummer aus der WhatsApp Business App').first());await sleep(1500);await moveTo(p,900*SC,560*SC,1000);},
 app_anbieter: async p=>{const n=p.getByText('Nein',{exact:true}).first();await n.scrollIntoViewIfNeeded().catch(()=>{});await clickLoc(p,n);await sleep(1600);const b=p.getByText('Jetzt WhatsApp verbinden').first();await b.scrollIntoViewIfNeeded().catch(()=>{});await sleep(600);const bb=await b.boundingBox();if(bb){await moveTo(p,bb.x+bb.width/2,bb.y+bb.height/2,1100);}},
 s360: async p=>{await p.goto(MOCK);await sleep(200);await cap(p,CUR);await p.evaluate(()=>window.S.s360());await moveTo(p,720*SC,560*SC,900);await sleep(6200);await clickSel(p,'#b360');await p.evaluate(()=>window.S.press('b360'));},
 mlogin: async p=>{await mock(p,'mlogin');await sleep(1500);await clickSel(p,'#bml');await p.evaluate(()=>window.S.press('bml'));},
 mport: async p=>{await mock(p,'mport');await sleep(900);await clickSel(p,'#po1');await p.evaluate(()=>window.S.sel('po1'));await sleep(900);await clickSel(p,'#bpo');await p.evaluate(()=>window.S.press('bpo'));},
 mbiz: async p=>{await mock(p,'mbiz');await sleep(1500);await clickSel(p,'#bz1');await p.evaluate(()=>window.S.sel('bz1'));await sleep(1000);await clickSel(p,'#bbz');await p.evaluate(()=>window.S.press('bbz'));},
 qr: async p=>{await mock(p,'qr');await p.mouse.move(-50,-50);},
 done: async p=>{await mock(p,'done');},
 wege: async p=>{await mock(p,'wege');},
};

(async()=>{
 const b=await chromium.launch();
 const c0=await b.newContext({viewport:{width:W,height:H},locale:'de-DE',timezoneId:'Europe/Berlin'});
 const q=await c0.newPage();await q.goto(B+'/login');await q.fill('input[type=email]','demo@pg.local');await q.fill('input[type=password]','Demo12345!');await q.click('button[type=submit]');await q.waitForTimeout(5000);
 for(const u of ['/buyer/hilfe/whatsapp','/buyer','/buyer/chats','/buyer/kontakte','/buyer/kontakte?modus=pipeline','/buyer/zahlen','/buyer/kalender','/buyer/wachstum','/buyer/team']){await q.goto(B+u,{waitUntil:'networkidle'}).catch(()=>{});}
 const state=await c0.storageState();await c0.close();
 const ctx=await b.newContext({viewport:{width:W,height:H},locale:'de-DE',timezoneId:'Europe/Berlin',storageState:state,recordVideo:{dir:EV+'/raw_wa',size:{width:W,height:H}}});
 await ctx.addInitScript(INIT);
 const p=await ctx.newPage(); const T0=Date.now(); await p.goto('about:blank'); await sleep(300);
 const log=[];
 for(const s of scenes){
   const st=(Date.now()-T0)/1000; log.push(st);
   CUR=s.cap||''; await cap(p,CUR);
   try{await A[s.act](p);}catch(e){console.log('ERR',s.act,e.message);}
   if(s.cap) await cap(p,s.cap);
   if(s.cap===''){} 
   const need=s.dur+0.9 - ((Date.now()-T0)/1000-st);
   if(need>0) await sleep(need*1000);
 }
 const end=(Date.now()-T0)/1000;
 await p.close(); const v=await p.video().path(); await ctx.close(); await b.close();
 require('fs').writeFileSync(EV+'/'+VERSION+'_log.json',JSON.stringify({video:v,starts:log,end}));
 console.log(VERSION,v,end);
})();
