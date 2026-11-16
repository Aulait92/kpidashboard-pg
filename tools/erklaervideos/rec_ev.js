const EV=process.env.EV_DIR||'/var/tmp/ev'; require('fs').mkdirSync(EV,{recursive:true});
const { chromium } = require('playwright');
// Aufruf: APP=http://localhost:3123 [PW_CHROME=/usr/bin/google-chrome] node rec_ev.js kurz|lang
const B=process.env.APP||'http://localhost:3123';
const W=1440,H=810;const SC=W/1920;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const INIT=`(()=>{try{localStorage.setItem('pg-push-hint-dismissed',String(Date.now()))}catch(e){}
 const mk=()=>{ if(document.getElementById('__cur'))return;
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

async function hoverEl(p,loc,ms=900){const b=await loc.boundingBox({timeout:4000}).catch(()=>null);if(!b)console.log('nobox',String(loc));if(b)await moveTo(p,b.x+Math.min(b.width/2,120),b.y+b.height/2,ms);}
async function hoverText(p,t,ms=900){return hoverEl(p,p.getByText(t).first(),ms);}
// Termin in der Karte „Termine“ auf „Heute“ (Stand 16.11.2026: Termine direkt unter „Wartet auf Sie“)
const termineItem=p=>p.locator('#termine').locator('..').getByText('Verena Martin').first();
const cardHead=(p,id,t)=>p.locator('#'+id).locator('..').getByText(t).first();
const CARDS='file://'+__dirname+'/cards/';
const VERSION=process.argv[2]; const scenes=JSON.parse(require('fs').readFileSync(EV+'/'+VERSION+'.json'));
async function nav(p,name){const l=p.getByRole('link',{name:new RegExp('^\\s*'+name)}).first();const href=await l.getAttribute('href').catch(()=>null);await clickLoc(p,l);if(href){const ok=await p.waitForURL(u=>u.pathname===href.split('?')[0],{timeout:15000}).then(()=>true).catch(()=>false);if(!ok){console.log('nav fallback',name);await p.goto(B+href,{waitUntil:'load',timeout:15000}).catch(()=>{});}}await p.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await sleep(900);}
let CUR='';
async function go(p,u){await p.goto(B+u,{waitUntil:'load',timeout:15000}).catch(()=>{});await p.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await sleep(150);await cap(p,CUR);}
const A={
 intro: async p=>{await p.goto(CARDS+'ev_intro_'+VERSION+'.html');await p.evaluate(()=>sessionStorage.clear());},
 outro: async p=>{await p.goto(CARDS+'ev_outro.html');await p.evaluate(()=>{sessionStorage.clear();const c=document.getElementById('__cap');if(c)c.classList.remove('on')});},
 heute: async p=>{const t0=Date.now();const L=m=>process.env.EV_DEBUG&&console.log(m,Date.now()-t0);await go(p,'/buyer');L('go');await p.waitForSelector('#termine',{state:'attached',timeout:15000}).catch(()=>{});L('sel');await sleep(600);await hoverEl(p,cardHead(p,'chats','Wartet auf Sie'),900);L('h1');await sleep(700);await hoverEl(p,termineItem(p),900);L('h2');await sleep(700);await hoverEl(p,cardHead(p,'anrufen','Anrufen'),900);L('h3');},
 // Am Desktop ist rechts schon die erste Aufgabe offen; Klick auf den Termin zeigt den Kontakt mit der Zusammenfassung
 termin: async p=>{if(!/\/buyer$/.test(new URL(p.url()).pathname))await go(p,'/buyer');await clickLoc(p,termineItem(p));await sleep(1500);const pr=await p.getByText('Präsentation',{exact:true}).filter({visible:true}).first().boundingBox().catch(()=>null);if(pr)await moveTo(p,pr.x-60,pr.y+75,1200);else console.log('nobox Präsentation');},
 nachrichten_chat: async p=>{await nav(p,'Nachrichten');await clickLoc(p,p.getByText('Eva Pohl').first());await sleep(1200);await moveTo(p,1100*SC,600*SC,1000);},
 kontakte_pipeline: async p=>{await nav(p,'Kontakte');await sleep(600);await clickLoc(p,p.getByText('Pipeline').first());await sleep(1200);await moveTo(p,1300*SC,520*SC,1100);},
 // Wachstum ohne Zwischenseite (16.11.2026): Vertriebstrichter oben, darunter Werbebudget
 wachstum_zahlen: async p=>{await nav(p,'Wachstum');await p.getByText('Ihr Vertriebstrichter').first().waitFor({timeout:15000}).catch(()=>{});for(const t of ['Leads','Termin','Abschluss']){const l=p.locator('main').getByText(t,{exact:true}).first();await hoverEl(p,l,600);await sleep(250);}await clickLoc(p,p.getByRole('link',{name:'Werbebudget',exact:true}).first(),800);await sleep(1200);await hoverText(p,'pro Tag · zum Eintippen antippen',800);},
 nav: async p=>{await go(p,'/buyer');await sleep(500);for(const y of [195,260,325,390]){await moveTo(p,130*SC,y*SC,700);await sleep(650);} },
 heute_lang: async p=>{await go(p,'/buyer');await p.waitForSelector('#termine',{state:'attached',timeout:15000}).catch(()=>{});await sleep(500);for(const [id,t] of [['chats','Wartet auf Sie'],['termine','Termine'],['ergebnis','Wie lief es?'],['anrufen','Anrufen']]){await hoverEl(p,cardHead(p,id,t),800);await sleep(650);}await moveTo(p,1060,260,1000);},
 braucht: async p=>{const l=p.getByText('Franziska Albrecht').first();const b=await l.boundingBox();if(b){await moveTo(p,b.x+60,b.y+10,900);await sleep(900);}const a=p.getByRole('button',{name:/Antworten/}).first();const bb=await a.boundingBox();if(bb)await moveTo(p,bb.x+bb.width/2,bb.y+bb.height/2,900);},
 phase: async p=>{const g=p.getByRole('button',{name:/Gewonnen/}).first();const bb=await g.boundingBox();await moveTo(p,1250*SC,145*SC,900);await sleep(800);if(bb){await moveTo(p,bb.x+bb.width/2,bb.y+bb.height/2,900);await sleep(700);}const v=p.getByRole('button',{name:/Verloren/}).first();const vb=await v.boundingBox();if(vb)await moveTo(p,vb.x+vb.width/2,vb.y+vb.height/2,700);},
 notizen: async p=>{await hoverText(p,'Angaben zum Lead',1000);await sleep(500);await wheel(p,380,1600);await sleep(400);const n=p.getByText('Notizen',{exact:true}).first();const b=await n.boundingBox().catch(()=>null);if(b&&b.y<H-20)await moveTo(p,b.x+120,Math.min(b.y+40,H-30),1000);},
 // Link „Vorbereiten: Angebot rechnen“ in der Terminzeile (die Karte „Termine vorbereiten“ gibt es nicht mehr)
 vorbereiten: async p=>{await clickLoc(p,p.locator('[data-termin-vorbereiten]').first());await p.waitForURL(/vorbereitung/,{timeout:15000}).catch(()=>{});await p.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await sleep(700);await cap(p,CUR);await hoverText(p,'Angebote hochladen',1000);await sleep(900);await hoverEl(p,p.getByText('Präsentation',{exact:true}).first(),900);},
 anrufliste: async p=>{await go(p,'/buyer');await sleep(500);const a=p.getByText('Anrufliste starten').first();const b=await a.boundingBox();await moveTo(p,500*SC,700*SC,900);if(b){await moveTo(p,b.x-260,b.y+12,700);}await sleep(400);await wheel(p,260,1500);await sleep(500);await moveTo(p,480*SC,620*SC,700);},
 nachrichten: async p=>{await nav(p,'Nachrichten');await moveTo(p,450*SC,500*SC,1000);await sleep(400);await moveTo(p,450*SC,700*SC,800);},
 chat: async p=>{await clickLoc(p,p.getByText('Eva Pohl').first());await sleep(1200);await moveTo(p,1100*SC,560*SC,900);await sleep(600);await p.evaluate(async()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+50&&getComputedStyle(e).overflowY.match(/auto|scroll/)&&e.getBoundingClientRect().left>500&&e.getBoundingClientRect().left<900);const el=els[0];if(!el)return;const s=el.scrollTop;const st=performance.now();await new Promise(r=>{const f=n=>{const t=Math.min(1,(n-st)/2500);el.scrollTop=s-600*(t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2);t<1?requestAnimationFrame(f):r()};requestAnimationFrame(f)});await new Promise(r=>setTimeout(r,1500));const s2=el.scrollTop;const st2=performance.now();await new Promise(r=>{const f=n=>{const t=Math.min(1,(n-st2)/2500);el.scrollTop=s2+700*(t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2);t<1?requestAnimationFrame(f):r()};requestAnimationFrame(f)});});await moveTo(p,1500*SC,560*SC,1000);},
 selbst: async p=>{const s=p.getByText('Selbst schreiben').first();const b=await s.boundingBox();if(b){await moveTo(p,b.x+b.width/2,b.y+b.height/2,900);await sleep(900);}const i=p.getByPlaceholder(/Nachricht/).first();const ib=await i.boundingBox();if(ib)await moveTo(p,ib.x+150,ib.y+ib.height/2,900);},
 kontakte: async p=>{await nav(p,'Kontakte');await hoverEl(p,p.locator('th',{hasText:'Phase'}).first(),900);await sleep(500);await hoverEl(p,p.locator('th',{hasText:'Nächster Schritt'}).first(),900);await sleep(400);await wheel(p,420,1500);await sleep(300);await hoverEl(p,p.getByRole('button',{name:'Festlegen'}).filter({visible:true}).first(),900);},
 pipeline: async p=>{await smoothScroll(p,null,-2000,600);await clickLoc(p,p.getByText('Pipeline').first());await sleep(1200);await moveTo(p,700*SC,500*SC,900);await sleep(600);await moveTo(p,1250*SC,500*SC,1200);await sleep(600);await hoverEl(p,p.getByText('Verloren',{exact:true}).filter({visible:true}).first(),900);},
 wachstum: async p=>{await nav(p,'Wachstum');await p.getByText('Ihr Vertriebstrichter').first().waitFor({timeout:15000}).catch(()=>{});await hoverText(p,'Ihr Vertriebstrichter',800);await sleep(300);for(const t of ['Leads','Erreicht','Termin','Abschluss']){const l=p.locator('main').getByText(t,{exact:true}).first();await hoverEl(p,l,700);await sleep(500);}},
 budget: async p=>{await wheel(p,330,1400);await hoverText(p,'Kosten & Ertrag',800);await sleep(800);await smoothScroll(p,null,-2000,500);await clickLoc(p,p.getByRole('link',{name:'Werbebudget',exact:true}).first(),900);await sleep(1400);await hoverText(p,'pro Tag · zum Eintippen antippen',900);await sleep(1200);await hoverEl(p,p.getByText('Produkte',{exact:true}).last(),900);await sleep(700);await wheel(p,520,1600);await hoverText(p,'Pause / Urlaub',900);},
 kalender: async p=>{await go(p,'/buyer/kalender');await sleep(600);await moveTo(p,620*SC,250*SC,900);await sleep(700);await wheel(p,330,1600);await moveTo(p,700*SC,560*SC,900);},
 team: async p=>{await go(p,'/buyer/team');await sleep(600);await moveTo(p,900*SC,250*SC,900);await sleep(600);await moveTo(p,800*SC,570*SC,900);},
};
(async()=>{
 const b=await chromium.launch(process.env.PW_CHROME?{executablePath:process.env.PW_CHROME}:{});
 const c0=await b.newContext({viewport:{width:W,height:H},locale:'de-DE',timezoneId:'Europe/Berlin'});
 const q=await c0.newPage();await q.goto(B+'/login');await q.fill('input[type=email]','demo@pg.local');await q.fill('input[type=password]','Demo12345!');await q.click('button[type=submit]');await q.waitForTimeout(5000);
 await q.goto(B+'/buyer',{waitUntil:'networkidle'}).catch(()=>{});await q.waitForTimeout(1500);
 for(let i=0;i<4;i++){const l=q.locator('button[aria-label="Video ausblenden"], button[aria-label="Hinweis ausblenden"]').filter({visible:true}).first();if(!(await l.count()))break;await l.click().catch(()=>{});await q.waitForTimeout(900);}
 for(const u of ['/buyer','/buyer/chats','/buyer/kontakte','/buyer/kontakte?modus=pipeline','/buyer/zahlen','/buyer/kalender','/buyer/wachstum','/buyer/team']){await q.goto(B+u,{waitUntil:'networkidle'}).catch(()=>{});}
 const state=await c0.storageState();await c0.close();
 const ctx=await b.newContext({viewport:{width:W,height:H},locale:'de-DE',timezoneId:'Europe/Berlin',storageState:state,recordVideo:{dir:EV+'/raw_'+VERSION,size:{width:W,height:H}}});
 await ctx.addInitScript(INIT);
 const p=await ctx.newPage(); p.setDefaultTimeout(5000); const T0=Date.now(); await p.goto('about:blank'); await sleep(300);
 const log=[];
 for(const s of scenes){
   const st=(Date.now()-T0)/1000; log.push(st);
   CUR=s.cap||''; await cap(p,CUR);
   try{await A[(VERSION==='lang'&&A[s.act+'_lang'])?s.act+'_lang':s.act](p);}catch(e){console.log('ERR',s.act,e.message);}
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
