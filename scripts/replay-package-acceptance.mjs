import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.QA_URL||'http://127.0.0.1:3101';
const dist=process.env.QA_DIST||'/tmp/python-playground-qa/python-replay-stage/dist';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const uncaught=[];page.on('pageerror',e=>uncaught.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});
 await page.locator('.replay-cache-controls > summary').first().click();await page.getByLabel('เก็บ replay หลังปิดหน้า').check();
 // Choose original variable lesson; it runs actual CPython in a new worker.
 await page.locator('select').filter({has:page.locator('option[value="visual_names"]')}).selectOption('visual_names');
 await page.getByRole('button',{name:'รันโค้ด Python',exact:true}).click();
 await page.getByRole('button',{name:'ดูแอนิเมชันเดิม',exact:true}).waitFor();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='ดูแอนิเมชันเดิม')?.disabled,{timeout:120000});
 // Stop the outer animation only after execution done, preserving cache.
 let runtimeRequests=0;page.on('request',r=>{if(/python.worker|\/runtime\//.test(r.url()))runtimeRequests++;});
 await page.getByRole('button',{name:'ดูแอนิเมชันเดิม',exact:true}).click();
 assert.match(await page.locator('body').innerText(),/กำลังดูผลเดิม/);
 await page.reload({waitUntil:'networkidle'});await page.evaluate(()=>{const d=document.querySelector('.replay-cache-controls');if(d&&!d.open)d.open=true;});
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='ดูแอนิเมชันเดิม')?.disabled,{timeout:20000});
 runtimeRequests=0;
 await page.getByRole('button',{name:'ดูแอนิเมชันเดิม',exact:true}).click();
 assert.equal(runtimeRequests,0,'Explicit saved replay must not initialize runtime or execute Python');
 const idb=await page.evaluate(async()=>{
  return await new Promise((resolve,reject)=>{let req=indexedDB.open('python_playground_replay_db');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('replays');const get=tx.objectStore('replays').getAll();get.onsuccess=()=>{const rows=get.result;resolve(rows.map(r=>({events:r.eventCount,mode:r.mode,status:r.status,exact:r.code.includes('score = 4')})));db.close();};get.onerror=()=>reject(get.error);};});
 });
 assert.ok(idb.length&&idb[0].events>1&&idb[0].exact);
 assert.ok(await page.getByTestId('visual-teaching-card').count());
 await page.setViewportSize({width:390,height:844});
 const cacheBounds=await page.locator('.replay-cache-controls').boundingBox();
 assert.ok(cacheBounds&&cacheBounds.x>=0&&cacheBounds.x+cacheBounds.width<=391);
 await page.getByRole('button',{name:'ล้างแคช replay',exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='ดูแอนิเมชันเดิม')?.disabled);
 const remaining=await page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('python_playground_replay_db');req.onsuccess=()=>{const db=req.result;const get=db.transaction('replays').objectStore('replays').count();get.onsuccess=()=>{resolve(get.result);db.close()};get.onerror=()=>reject(get.error)};req.onerror=()=>reject(req.error)}));
 assert.equal(remaining,0,'Clear must delete actual persistent records');
 const assets=fs.readdirSync(dist+'/assets');const worker='/assets/'+assets.find(n=>n.startsWith('python.worker-'));
 const packages=await page.evaluate(async worker=>{
  const w=new Worker(worker,{type:'module'}),messages=[],waiters=[];
  const wait=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Worker timeout '+type)),150000);waiters.push({type,resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}})});
  w.onmessage=e=>{messages.push(e.data);const i=waiters.findIndex(a=>a.type===e.data.type||e.data.type==='error');if(i>=0){const item=waiters.splice(i,1)[0];e.data.type==='error'?item.reject(new Error(e.data.error)):item.resolve(e.data)}};
  try{
   let ready=wait('init_done');w.postMessage({type:'init',sab:new SharedArrayBuffer(65536)});await ready;
   const code=`import numpy as np\nimport pandas as pd\nimport scipy\nimport sympy\nimport mpmath\nimport networkx as nx\nimport matplotlib\nfrom PIL import Image\nimport regex\nfrom bs4 import BeautifulSoup\nimport pytz\nfrom dateutil import parser\nimport jinja2\nimport yaml\nimport tqdm\nimport micropip\nfrom sklearn.linear_model import LinearRegression\nassert int(np.array([1,2,3]).sum()) == 6\nassert pd.DataFrame({'x':[1,2]}).x.sum()==3\nassert sympy.expand((sympy.Symbol('x')+1)**2).is_polynomial()\nassert nx.path_graph(3).number_of_edges()==2\nassert Image.new('RGB',(2,2)).size==(2,2)\nassert BeautifulSoup('<b>yes</b>','html.parser').b.text=='yes'\nassert yaml.safe_load('x: 3')['x']==3\nassert jinja2.Template('{{x}}').render(x=7)=='7'\nmodel=LinearRegression(n_jobs=1).fit([[0],[1],[2]],[0,2,4])\nassert abs(model.predict([[3]])[0]-6)<0.001\nassert matplotlib.get_backend().lower()=='agg'\nprint('PACKAGE_ACCEPTANCE_OK_17')`;
   const done=wait('done');w.postMessage({type:'run',code,mode:'normal'});await done;
   return messages.filter(m=>m.type==='output').map(m=>m.text).join('');
  }finally{w.terminate()}
 },worker);
 assert.match(packages,/PACKAGE_ACCEPTANCE_OK_17/);
 assert.deepEqual(uncaught,[]);
 console.log(JSON.stringify({persistentReplayReload:true,replayRuntimeRequests:0,actualIndexedDB:idb,mobileControlsFit:true,cleared:true,packageImportSmoke:17,selectedOperations:true,teachingCard:true,uncaughtErrors:uncaught}));
} finally {await browser.close();}
