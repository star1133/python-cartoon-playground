import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(process.env.QA_URL||'http://127.0.0.1:3102');
 const handle=page.getByRole('separator',{name:'ปรับขนาดกระดานและแผงผลลัพธ์'});
 const top=page.locator('#animation-panel');const bottom=page.locator('#result-panel');
 const before=await top.boundingBox();const grip=await handle.boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,grip.y-100,{steps:8});await page.mouse.up();
 const after=await top.boundingBox();assert.ok(after.height<before.height-60);
 const saved=await handle.getAttribute('aria-valuenow');
 await page.reload();assert.equal(await handle.getAttribute('aria-valuenow'),saved);
 await handle.focus();await page.keyboard.press('End');assert.equal(await handle.getAttribute('aria-valuenow'),'80');assert.ok((await bottom.boundingBox()).height>80);
 await page.keyboard.press('Home');assert.equal(await handle.getAttribute('aria-valuenow'),'20');assert.ok((await top.boundingBox()).height>80);
 await page.keyboard.press('Enter');assert.equal(await handle.getAttribute('aria-valuenow'),'60');
 // Touch pointer uses the same captured drag path (tablet desktop layout).
 const cdp=await page.context().newCDPSession(page);const fresh=await handle.boundingBox();
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 const point={x:fresh.x+fresh.width/2,y:fresh.y+fresh.height/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y-60}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(Number(await handle.getAttribute('aria-valuenow'))<60);await cdp.detach();
 console.log(JSON.stringify({mouseResize:true,persistedAfterReload:true,keyboardBounds:true,reset:true,desktopPanelsVisible:true}));
 await page.screenshot({path:'/tmp/python-playground-qa/panel-resize-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await handle.count(),0);await page.getByRole('button',{name:'กระดาน 2D (Board)',exact:true}).click();assert.equal(await top.count(),1);
 console.log('mobile tab layout preserved');
}finally{await browser.close();}
