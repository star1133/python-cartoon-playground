import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const out='/tmp/python-playground-qa/python-arrow-demo';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
await c.addInitScript(()=>localStorage.setItem('python_playground_draft_code','total = 120\ntotal = 200\nprint("Done:", total)\n'));
await p.goto(process.env.QA_URL||'http://127.0.0.1:3100',{waitUntil:'networkidle'});
await p.getByRole('button',{name:'รันโค้ด Python',exact:true}).click();
await p.waitForFunction(()=>document.body.innerText.includes('Done: 200'),null,{timeout:120000});
await p.getByTitle('ขั้นตอนแรกสุด',{exact:true}).click();
let found=false;
for(let i=0;i<15;i++){
 const next=p.getByTitle('ก้าวไปข้างหน้า 1 ขั้น',{exact:true});if(!await next.isEnabled())break;await next.click();await p.waitForTimeout(80);
 console.log('STEP',i,await p.locator('.number-board-2d').innerText());
 if(await p.getByTestId('flow-node-prev').count() && (await p.getByTestId('flow-node-prev').innerText()).includes('120')){found=true;break;}
}
assert.ok(found,'actual changed total trace must have 120 before 200');
await p.waitForTimeout(100);assert.ok((await p.getByTestId('phase-indicator').innerText()).includes('1/3'));
assert.ok((await p.getByTestId('flow-arrow-1').getAttribute('class')).includes('inactive'));
await p.waitForTimeout(1500);assert.ok((await p.getByTestId('phase-indicator').innerText()).includes('1/3'),'paused phase must not auto advance');
await p.screenshot({path:out+'/phase1.png'});
await p.getByTestId('phase-next').click();console.log('AFTER PHASE',await p.locator('.number-board-2d').innerText());assert.ok((await p.getByTestId('phase-indicator').innerText()).includes('2/3'));
assert.ok((await p.getByTestId('flow-arrow-1').getAttribute('class')).includes('arrow-active'));
await p.waitForTimeout(500);await p.screenshot({path:out+'/phase2.png'});
await p.getByTestId('phase-next').click();assert.ok((await p.getByTestId('phase-indicator').innerText()).includes('3/3'));
assert.ok((await p.getByTestId('flow-arrow-2').getAttribute('class')).includes('arrow-active'));
await p.waitForTimeout(700);await p.screenshot({path:out+'/phase3.png'});
await p.getByTestId('phase-prev').click();assert.ok((await p.getByTestId('phase-indicator').innerText()).includes('2/3'));
await p.emulateMedia({reducedMotion:'reduce'});await p.getByTestId('phase-next').click();assert.ok(await p.locator('.nb2d-reduced-motion').count());await p.screenshot({path:out+'/reduced.png'});
await p.setViewportSize({width:390,height:844});
console.log('MOBILE BUTTONS',await p.getByRole('button').allTextContents());
await p.getByRole('button',{name:'กระดาน 2D (Board)',exact:true}).click();
assert.ok(await p.getByTestId('flow-explanation').isVisible());
await p.screenshot({path:out+'/mobile.png'});
// Restart real playback and observe automatic phase progression.
await p.setViewportSize({width:1440,height:900});
await p.emulateMedia({reducedMotion:'no-preference'});
await p.getByTitle('ขั้นตอนแรกสุด',{exact:true}).click();
await p.getByRole('button',{name:'เล่นต่อ',exact:true}).click();
await p.waitForFunction(()=>document.querySelector('[data-testid="flow-node-new"]')?.textContent.includes('120'),null,{timeout:10000});
await p.waitForFunction(()=>document.querySelector('[data-testid="phase-indicator"]')?.textContent.includes('2/3'),null,{timeout:3000});
await p.waitForFunction(()=>document.querySelector('[data-testid="phase-indicator"]')?.textContent.includes('3/3'),null,{timeout:3000});
await p.getByTitle('ขั้นตอนแรกสุด',{exact:true}).click();
assert.deepEqual(errors,[]);const video=p.video();await c.close();await b.close();console.log('VIDEO',await video.path());console.log('PASS real trace 120→200→total, phases, arrows, pause, backwards phase, reduced');
