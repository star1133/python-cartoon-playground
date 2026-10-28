import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try {
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.QA_URL||'http://127.0.0.1:3102');
  await page.locator('.cm-content').waitFor();
  assert.equal(await page.locator('.app-container.is-mobile').count(),1);
  const bounds=await page.locator('.cm-editor').boundingBox();assert.ok(bounds.height>=85,'usable editor height '+JSON.stringify(bounds));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.toolbar-more > summary').tap();
  await page.getByRole('button',{name:'เปิดหน้าต่างจัดการแพ็กเกจ'}).tap();
  const dialog=await page.getByRole('dialog').boundingBox();assert.ok(dialog.width<=viewport.width&&dialog.height<=viewport.height);
  const modalOverflow=await page.locator('.modal-content').evaluate(e=>e.scrollWidth>e.clientWidth+1);assert.equal(modalOverflow,false);
  await page.getByRole('button',{name:'ปิดหน้าต่าง',exact:true}).tap();
  await page.locator('.toolbar-more > summary').tap();
  await page.locator('.cm-content').fill('name = input("ชื่อ: ")\nprint("สวัสดี", name)');
  await page.getByRole('button',{name:'รันปกติ',exact:true}).tap();
  await page.getByRole('button',{name:'รันโค้ด Python',exact:true}).tap();
  await page.getByLabel('ช่องป้อนข้อมูลอินพุต').waitFor({timeout:120000});
  assert.ok(await page.getByLabel('ช่องป้อนข้อมูลอินพุต').isVisible(),'auto opens mobile console on stdin');
  await page.getByLabel('ช่องป้อนข้อมูลอินพุต').fill('แม็กซ์');await page.getByRole('button',{name:'ส่งข้อมูลอินพุต'}).tap();
  await page.waitForFunction(()=>document.querySelector('.console-log-area')?.textContent?.includes('สวัสดี แม็กซ์'),{timeout:30000});
  await page.locator('.mobile-tab-button').nth(1).tap();
  assert.ok(await page.locator('.number-board-2d').isVisible());
  await page.locator('.mobile-tab-button').nth(3).tap();
  assert.ok(await page.getByRole('region',{name:'ตัวตรวจสอบตัวแปร (Variable Inspector)'}).isVisible());
  await page.locator('.mobile-tab-button').nth(0).tap();
  assert.match(await page.locator('.cm-content').innerText(),/name = input/);
  await page.screenshot({path:`/tmp/python-playground-qa/mobile-${viewport.width}.png`});
  assert.deepEqual(errors,[]);results.push({viewport,editorHeight:bounds.height,realPythonThaiInput:true,touchTabs:true,packagesFit:true,noPageOverflow:true});
  await context.close();
 }
 console.log(JSON.stringify(results));
}finally{await browser.close();}
