// Aufnahme „WhatsApp verbinden“ (Ablauf Stand 15.11.2026): App-Teile in der echten App mit Demo-Daten
// (local/wa_einrichtung.mjs, Zustände über local/wa_state.mjs), Schritte bei 360dialog und Meta als
// vereinfachte Darstellung (cards/wa_mock.html). Ton und Szenen aus $EV_DIR/wa.json (wa_scenes.py).
// Aufruf: APP=http://localhost:3123 DATABASE_URL=… [PW_CHROME=/usr/bin/google-chrome] node wa_rec.js
const EV=process.env.EV_DIR||'/var/tmp/ev'; require('fs').mkdirSync(EV,{recursive:true});
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B=process.env.APP||'http://localhost:3123';
const USER=process.env.WA_USER||'max.mustermann@gmail.com', PASS=process.env.WA_PASS||'Demo12345!';
const W=1440,H=810;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const state=s=>execFileSync('node',[__dirname+'/local/wa_state.mjs',s],{cwd:__dirname,env:process.env}).toString();
const INIT=`(()=>{const mk=()=>{ if(document.getElementById('__cur'))return;
 const st=document.createElement('style');st.textContent='nextjs-portal{display:none!important}#__cur{position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;pointer-events:none;transform:translate(-4px,-3px);transition:transform .05s}#__cur svg{filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}#__cap{position:fixed;z-index:2147483646;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);opacity:0;transition:all .45s ease;background:#0b1220;color:#fff;font:600 23px/1.3 Geist,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.3px;padding:14px 26px;border-radius:999px;box-shadow:0 20px 50px -15px rgba(11,18,32,.6);display:flex;gap:16px;align-items:center;white-space:nowrap}#__cap.on{opacity:1;transform:translateX(-50%) translateY(0)}#__cap i{width:12px;height:12px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 6px rgba(37,99,235,.3);display:block}#__ring{position:fixed;z-index:2147483645;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(37,99,235,.28);pointer-events:none;transform:scale(0);opacity:0}#__ring.go{animation:rg .5s ease-out}@keyframes rg{0%{transform:scale(.2);opacity:1}100%{transform:scale(1.6);opacity:0}}';
 document.head.appendChild(st);
 const c=document.createElement('div');c.id='__cur';c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#0b1220" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';document.body.appendChild(c);
 const r=document.createElement('div');r.id='__ring';document.body.appendChild(r);
 const cap=document.createElement('div');cap.id='__cap';cap.innerHTML='<i></i><span></span>';document.body.appendChild(cap);
 const p=window.__pos||{x:${W/2},y:${H/2}};c.style.left=p.x+'px';c.style.top=p.y+'px';
 document.addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px';window.__pos={x:e.clientX,y:e.clientY};try{sessionStorage.setItem('__pos',JSON.stringify(window.__pos))}catch(e){}},true);
 document.addEventListener('mousedown',e=>{r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';r.classList.remove('go');void r.offsetWidth;r.classList.add('go')},true);
 const t=location.protocol==='file:'?null:sessionStorage.getItem('__capt');if(t){cap.querySelector('span').textContent=t;cap.classList.add('on');}
};
 try{window.__pos=JSON.parse(sessionStorage.getItem('__pos'))}catch(e){}
 if(document.readyState!=='loading')mk();else document.addEventListener('DOMContentLoaded',mk);
 window.__cap=(t)=>{const cap=document.getElementById('__cap');if(!cap)return;if(t&&cap.classList.contains('on')&&cap.querySelector('span').textContent===t)return;if(!t){cap.classList.remove('on');try{sessionStorage.removeItem('__capt')}catch(e){}return}try{sessionStorage.setItem('__capt',t)}catch(e){}cap.classList.remove('on');setTimeout(()=>{cap.querySelector('span').textContent=t;cap.classList.add('on')},350)};
})()`;
let cur={x:W/2,y:H/2};
async function moveTo(p,x,y,ms=900){const steps=Math.max(12,Math.round(ms/16));const sx=cur.x,sy=cur.y;
 for(let i=1;i<=steps;i++){const t=i/steps;const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;await p.mouse.move(sx+(x-sx)*e,sy+(y-sy)*e);await sleep(ms/steps);}cur={x,y};}
async function box(p,loc){const b=await loc.boundingBox().catch(()=>null);if(!b)console.log('nobox',loc.toString());return b;}
async function hover(p,loc,ms=900){const b=await box(p,loc);if(b)await moveTo(p,b.x+Math.min(b.width/2,120),b.y+b.height/2,ms);return b;}
async function clickLoc(p,loc,ms=900){const b=await hover(p,loc,ms);if(!b)return false;await sleep(250);await p.mouse.down();await sleep(90);await p.mouse.up();return true;}
async function cap(p,t){await p.evaluate(t=>window.__cap&&window.__cap(t),t).catch(()=>{});}
/** Sanft scrollen, bis das Element bei y=top steht. */
async function scrollTo(p,sel,top=160,ms=1200){await p.evaluate(async([sel,top,ms])=>{const el=document.querySelector(sel);if(!el)return;const se=document.scrollingElement;const s=se.scrollTop,dy=el.getBoundingClientRect().top-top,st=performance.now();
 await new Promise(r=>{const f=n=>{const t=Math.min(1,(n-st)/ms);const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;se.scrollTop=s+dy*e;t<1?requestAnimationFrame(f):r()};requestAnimationFrame(f)})},[sel,top,ms]);}
async function scrollBy(p,dy,ms=1200){await p.evaluate(async([dy,ms])=>{const se=document.scrollingElement;const s=se.scrollTop,st=performance.now();
 await new Promise(r=>{const f=n=>{const t=Math.min(1,(n-st)/ms);const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;se.scrollTop=s+dy*e;t<1?requestAnimationFrame(f):r()};requestAnimationFrame(f)})},[dy,ms]);}
/** Link im Video „klicken“, ohne die echte Seite zu verlassen (kein 360dialog-Aufruf). */
async function fakeClick(p,sel){await p.evaluate(sel=>{const a=document.querySelector(sel);if(a)a.addEventListener('click',e=>e.preventDefault(),{once:true});},sel);return clickLoc(p,p.locator(sel).first());}

const CARDS='file://'+__dirname+'/cards/';
const VERSION='wa'; const scenes=JSON.parse(require('fs').readFileSync(EV+'/wa.json'));
let CUR='';
async function go(p,u){await p.goto(B+u,{waitUntil:'networkidle'}).catch(()=>{});await sleep(300);await cap(p,CUR);}
const MOCK=CARDS+'wa_mock.html';
async function mock(p,step,arg){ if(!p.url().includes('wa_mock.html')){await p.evaluate(()=>{try{sessionStorage.removeItem('__capt')}catch(e){}}).catch(()=>{});await p.goto(MOCK);await sleep(300);} await cap(p,CUR); await p.evaluate(([st,a])=>{window.__run=window.S[st](a);},[step,arg]); }
const S=(p,fn,arg)=>p.evaluate(([f,a])=>window.S[f](a),[fn,arg]);
async function tap(p,id,after){await clickLoc(p,p.locator('#'+id).first());if(after)await S(p,after[0],after[1]);else await S(p,'press',id);}
const INVITED='/buyer/einrichtung?wa=invited&weg=neu#whatsapp';
const A={
 card_intro: async p=>{await p.goto(CARDS+'wa_intro.html');await p.evaluate(()=>sessionStorage.clear());},
 card_outro: async p=>{await p.goto(CARDS+'wa_outro.html');await p.evaluate(()=>{sessionStorage.clear();const c=document.getElementById('__cap');if(c)c.classList.remove('on')});},
 bereit: async p=>{await mock(p,'bereit');await p.mouse.move(-50,-50);},
 app_open: async p=>{state('neu');await go(p,'/buyer/einrichtung?schritt=whatsapp#whatsapp');await scrollTo(p,'#whatsapp',20,10);await sleep(900);
   await clickLoc(p,p.locator('[data-weg="neu"]').first(),1100);await sleep(900);await scrollBy(p,330,1500);},
 app_start: async p=>{await scrollTo(p,'a[href^="/buyer/whatsapp-verbinden"]',520,1300);await sleep(500);
   await fakeClick(p,'a[href^="/buyer/whatsapp-verbinden"]');await sleep(700);state('invited');await go(p,INVITED);await scrollTo(p,'#whatsapp',20,10);},
 app_invited: async p=>{await sleep(600);await hover(p,p.locator('[data-wa-invite-mail] p').first(),1000);await sleep(1500);
   await hover(p,p.getByText('max.mustermann@gmail.com').first(),900);await sleep(1600);await hover(p,p.locator('[data-wa-invite-mail] a').first(),900);},
 mail: async p=>{await mock(p,'mail');await sleep(2600);await tap(p,'b_join');await S(p,'pw');await tap(p,'b_pw');},
 app_check: async p=>{await go(p,INVITED);await scrollTo(p,'#whatsapp',20,10);await sleep(500);
   await clickLoc(p,p.locator('[data-wa-invite-done]').first(),1000);await sleep(800);
   await clickLoc(p,p.locator('[data-wa-invited-steps] summary').first(),900);await sleep(500);await scrollBy(p,430,1200);await sleep(900);await scrollBy(p,-430,900);
   await fakeClick(p,'[data-wa-weiter]');},
 login: async p=>{await mock(p,'login');await sleep(2700);await tap(p,'b_login');},
 verify: async p=>{await mock(p,'verify');await sleep(2500);await tap(p,'c_rem',['chk','c_rem']);await sleep(300);await tap(p,'b_ver');},
 number: async p=>{await mock(p,'number');await sleep(900);await tap(p,'cc',['ccopen']);await sleep(600);await tap(p,'cc_de',['ccde']);await sleep(1300);await hover(p,p.locator('#number .no'));await sleep(900);await tap(p,'b_num');},
 question: async p=>{await mock(p,'question');await sleep(1600);await tap(p,'q_no',['sel','q_no']);},
 sms: async p=>{await mock(p,'sms');await sleep(500);await tap(p,'r_sms',['sel','r_sms']);await S(p,'smscode');await sleep(300);await tap(p,'b_sms');},
 signup: async p=>{await mock(p,'signup');await sleep(900);await hover(p,p.locator('#signup .warn').first(),1000);await sleep(1300);await tap(p,'b_es');},
 mcontinue: async p=>{await mock(p,'m',1);await sleep(900);await tap(p,'b_m1');await sleep(300);await S(p,'m',2);await sleep(1200);await tap(p,'b_m2');},
 massets: async p=>{await mock(p,'m',3);await sleep(700);await hover(p,p.locator('#sel_bp'),800);await sleep(500);await tap(p,'sel_wa',['waopen']);await sleep(500);await tap(p,'wa_create',['wacreate']);await sleep(700);await tap(p,'b_m3');},
 minfo: async p=>{await mock(p,'m',4);await sleep(1000);await tap(p,'tz',['tzopen']);await sleep(500);await tap(p,'tz_b',['tzb']);await sleep(900);await tap(p,'b_m4');},
 mreview: async p=>{await mock(p,'m',5);await sleep(600);await hover(p,p.locator('#m5 .hint'),900);await sleep(1300);await tap(p,'b_m5');},
 mfinish: async p=>{await mock(p,'m',6);await sleep(800);await tap(p,'c1',['uncheck','c1']);await sleep(300);await tap(p,'c2',['uncheck','c2']);await sleep(400);await tap(p,'b_m6');},
 app_done: async p=>{state('pending');await go(p,'/buyer/einrichtung?wa=pending#whatsapp');await scrollTo(p,'#whatsapp',20,10);await sleep(400);
   await hover(p,p.getByText('Fast geschafft').first(),1000);await sleep(4200);state('connected');
   CUR='Nach wenigen Minuten: „Verbunden“';await go(p,'/buyer/einrichtung?schritt=whatsapp#whatsapp');await scrollTo(p,'#whatsapp',20,10);await sleep(400);await hover(p,p.getByText('Verbunden:').first(),900);},
 business: async p=>{await mock(p,'question');await sleep(900);await tap(p,'q_biz',['sel','q_biz']);await sleep(900);await p.mouse.move(-50,-50);cur={x:-50,y:-50};await S(p,'show','qr');await p.evaluate(()=>{window.__run=window.S.qr();});},
};

(async()=>{
 const b=await chromium.launch(process.env.PW_CHROME?{executablePath:process.env.PW_CHROME}:{});
 const c0=await b.newContext({viewport:{width:W,height:H},locale:'de-DE',timezoneId:'Europe/Berlin'});
 const q=await c0.newPage();await q.goto(B+'/login');await q.fill('input[type=email]',USER);await q.fill('input[type=password]',PASS);await q.click('button[type=submit]');await q.waitForURL(u=>!String(u).includes('/login'),{timeout:120000}).catch(()=>{});
 // Seiten vorab übersetzen lassen (Entwicklungsserver), damit die Aufnahme nicht hängt
 for(const s of ['neu','invited','pending','connected']){state(s);for(const u of ['/buyer/einrichtung?schritt=whatsapp',INVITED,'/buyer/einrichtung?wa=pending']){await q.goto(B+u,{waitUntil:'networkidle'}).catch(()=>{});}}
 const st=await c0.storageState();await c0.close();
 const ctx=await b.newContext({viewport:{width:W,height:H},locale:'de-DE',timezoneId:'Europe/Berlin',storageState:st,recordVideo:{dir:EV+'/raw_wa',size:{width:W,height:H}}});
 await ctx.addInitScript(INIT);
 const p=await ctx.newPage(); const T0=Date.now(); await p.goto('about:blank'); await sleep(300);
 const log=[];
 for(const s of scenes){
   const st=(Date.now()-T0)/1000; log.push(st);
   CUR=s.cap||''; await cap(p,CUR);
   try{await A[s.act](p);}catch(e){console.log('ERR',s.act,e.message);}
   const took=(Date.now()-T0)/1000-st; if(took>s.dur+0.9) console.log('lang',s.act,took.toFixed(1),'>',(s.dur+0.9).toFixed(1));
   const need=s.dur+0.9-took;
   if(need>0) await sleep(need*1000);
 }
 const end=(Date.now()-T0)/1000;
 await p.close(); const v=await p.video().path(); await ctx.close(); await b.close();
 state('neu');
 require('fs').writeFileSync(EV+'/'+VERSION+'_log.json',JSON.stringify({video:v,starts:log,end}));
 console.log(VERSION,v,end);
})();
