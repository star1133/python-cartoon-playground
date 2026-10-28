import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('BROWSER_LOG', m.type(), m.text()));

const base = process.env.QA_URL || 'http://127.0.0.1:3100';
await page.goto(base, { waitUntil: 'networkidle' });

const assets = fs.readdirSync('dist/assets');
const languageWorkerAsset = '/assets/' + assets.find((x) => x.startsWith('language.worker-'));

const acceptanceResult = await page.evaluate(async ({ workerUrl }) => {
  const timeout = (ms) =>
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    );

  const lw = new Worker(workerUrl, { type: 'module' });
  const pending = [];

  const wait = (type, id) =>
    Promise.race([
      new Promise((resolve, reject) =>
        pending.push({ type, id, resolve, reject })
      ),
      timeout(60000),
    ]);

  lw.onmessage = (e) => {
    const idx = pending.findIndex(
      (x) =>
        (x.type === e.data.type || e.data.type === 'error') &&
        (x.id === undefined || x.id === e.data.id)
    );
    if (idx >= 0) {
      const item = pending.splice(idx, 1)[0];
      if (e.data.type === 'error') item.reject(new Error(e.data.error));
      else item.resolve(e.data);
    }
  };

  // 1. Initialize
  const initPromise = wait('init_done');
  lw.postMessage({ type: 'init' });
  await initPromise;

  // 2. Builtin function completion ('pri' -> 'print')
  const pPri = wait('complete_res', 1);
  lw.postMessage({ type: 'complete', id: 1, code: 'pri', line: 1, column: 3 });
  const pri = await pPri;

  // 3. Module member completion ('import math\nmath.' -> 60+ members)
  const pMath = wait('complete_res', 2);
  lw.postMessage({
    type: 'complete',
    id: 2,
    code: 'import math\nmath.',
    line: 2,
    column: 5,
  });
  const math = await pMath;

  // 4. Truly dynamic user-defined function (proves dynamic Jedi inference vs static catalog)
  const dynamicFnCode = [
    'def compute_hyperspace_jump_vector(azimuth, elevation=45):',
    '    return azimuth * elevation',
    '',
    'comp',
  ].join('\n');
  const pDynamicFn = wait('complete_res', 3);
  lw.postMessage({
    type: 'complete',
    id: 3,
    code: dynamicFnCode,
    line: 4,
    column: 4,
  });
  const dynamicFn = await pDynamicFn;

  // 5. Truly dynamic user-defined class and method
  const dynamicClassCode = [
    'class CartoonSpaceship:',
    '    def engage_warp(self, speed_factor):',
    '        return speed_factor * 100',
    '',
    'ship = CartoonSpaceship()',
    'ship.',
  ].join('\n');
  const pDynamicClass = wait('complete_res', 4);
  lw.postMessage({
    type: 'complete',
    id: 4,
    code: dynamicClassCode,
    line: 6,
    column: 5,
  });
  const dynamicClass = await pDynamicClass;

  // 6. Dynamic function signature help
  const sigCode = [
    'def configure_reactor(core_temp: float, coolant_rate: int = 50) -> bool:',
    '    return True',
    '',
    'configure_reactor(',
  ].join('\n');
  const pSig = wait('signature_res', 5);
  lw.postMessage({
    type: 'signature',
    id: 5,
    code: sigCode,
    line: 4,
    column: 18,
  });
  const sig = await pSig;

  // 7. Dynamic hover documentation
  const hoverCode = [
    'def activate_shield_generator():',
    '    """Activate planetary defense shield against space debris."""',
    '    return True',
    '',
    'activate_shield_generator()',
  ].join('\n');
  const pHov = wait('hover_res', 6);
  lw.postMessage({
    type: 'hover',
    id: 6,
    code: hoverCode,
    line: 5,
    column: 5,
  });
  const hover = await pHov;

  // 8. Robustness to 1-based column clamping (e.g. column=4 on 'pri')
  const pClamp = wait('complete_res', 7);
  lw.postMessage({
    type: 'complete',
    id: 7,
    code: 'pri',
    line: 1,
    column: 4, // 1-based column passed directly
  });
  const clamp = await pClamp;

  lw.terminate();

  return {
    pri,
    math,
    dynamicFn,
    dynamicClass,
    sig,
    hover,
    clamp,
  };
}, { workerUrl: languageWorkerAsset });

// Assertions on browser execution evidence
assert.ok(
  acceptanceResult.pri.completions.some(
    (c) => c.label === 'print' && c.kind === 'function' && c.insertText === 'print'
  ),
  'Builtin print completion must succeed with lowercase kind and exact insertText'
);

assert.ok(
  acceptanceResult.math.completions.length >= 40,
  'Math module must contain all standard math functions'
);
assert.ok(
  acceptanceResult.math.completions.some((c) => c.label === 'sqrt'),
  'Math completions must include sqrt'
);

assert.ok(
  acceptanceResult.dynamicFn.completions.some(
    (c) =>
      c.label === 'compute_hyperspace_jump_vector' &&
      c.kind === 'function' &&
      c.insertText === 'compute_hyperspace_jump_vector'
  ),
  'Dynamic user-defined function must be inferred dynamically by Jedi'
);

assert.ok(
  acceptanceResult.dynamicClass.completions.some(
    (c) =>
      c.label === 'engage_warp' &&
      c.kind === 'function' &&
      c.insertText === 'engage_warp'
  ),
  'Dynamic user-defined class method must be inferred on instance'
);

assert.match(
  acceptanceResult.sig.signature,
  /configure_reactor\(core_temp: float, coolant_rate: int\s*=\s*50\)/,
  'Function signature must return parameter types and default values'
);

assert.match(
  acceptanceResult.hover.hover,
  /Activate planetary defense shield/,
  'Hover documentation must extract docstrings'
);

assert.ok(
  acceptanceResult.clamp.completions.some((c) => c.label === 'print'),
  'Column clamping must prevent ValueError when 1-based column is passed'
);

fs.mkdirSync('.runtime', { recursive: true });
fs.writeFileSync(
  '.runtime/language-acceptance.json',
  JSON.stringify(acceptanceResult, null, 2)
);

console.log(
  JSON.stringify(
    {
      status: 'passed',
      priCompletions: acceptanceResult.pri.completions.length,
      mathCompletions: acceptanceResult.math.completions.length,
      dynamicFnFound: acceptanceResult.dynamicFn.completions.some(
        (c) => c.label === 'compute_hyperspace_jump_vector'
      ),
      dynamicClassMethodFound: acceptanceResult.dynamicClass.completions.some(
        (c) => c.label === 'engage_warp'
      ),
      signature: acceptanceResult.sig.signature,
      hoverSnippet: acceptanceResult.hover.hover.slice(0, 80),
      clampedColSuccess: acceptanceResult.clamp.completions.some(
        (c) => c.label === 'print'
      ),
    },
    null,
    2
  )
);

await browser.close();
