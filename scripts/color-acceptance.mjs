import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sample = `# Reference colors
import math
class GaussianProfile:
    def calculate(self, value):
        if(value > 42):
            return math.cos(value)
        return 0.9
message = "black"
enabled = True
empty = None
print(message)
`;
const expected = [
  ['# Reference colors', 'rgb(106, 153, 85)'],
  ['import', 'rgb(197, 134, 192)'],
  ['if', 'rgb(197, 134, 192)'],
  ['GaussianProfile', 'rgb(78, 201, 176)'],
  ['calculate', 'rgb(220, 220, 170)'],
  ['cos', 'rgb(220, 220, 170)'],
  ['print', 'rgb(220, 220, 170)'],
  ['math', 'rgb(156, 220, 254)'],
  ['42', 'rgb(181, 206, 168)'],
  ['"black"', 'rgb(206, 145, 120)'],
  ['True', 'rgb(181, 206, 168)'],
  ['None', 'rgb(181, 206, 168)'],
];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];
fs.mkdirSync('.runtime', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await context.addInitScript(code => localStorage.setItem('python_playground_draft_code', code), sample);
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:3100', { waitUntil: 'networkidle' });
    await page.waitForSelector(mobile ? '.cm-content span' : '.view-lines span');
    await page.waitForTimeout(800);
    const readTokens = () => page.evaluate(mobile => {
      const root = document.querySelector(mobile ? '.cm-content' : '.view-lines');
      return [...root.querySelectorAll('span')].filter(s => !s.querySelector('span')).map(s => ({
        text: s.textContent.replace(/\u00a0/g, ' ').trim(), color: getComputedStyle(s).color,
      })).filter(t => t.text);
    }, mobile);
    const initial = await readTokens();
    // Exercise the actual user edit path without clicking Run.
    const input = page.locator(mobile ? '.cm-content' : '.view-lines');
    await input.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nnew_number = 12345');
    await page.waitForTimeout(250);
    const edited = await readTokens();
    await page.screenshot({ path: `.runtime/colors-${mobile ? 'mobile' : 'desktop'}.png` });
    results.push({ mobile, initial, edited, errors });
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync('.runtime/color-acceptance.json', JSON.stringify(results, null, 2));
for (const r of results) {
  const name = r.mobile ? 'Mobile' : 'Desktop';
  assert.deepEqual(r.errors, [], `${name} browser errors`);
  for (const [text, color] of expected) {
    assert.ok(r.initial.some(t => t.text === text && t.color === color), `${name}: ${text} expected ${color}; got ${JSON.stringify(r.initial.filter(t => t.text.includes(text)))}`);
  }
  assert.ok(r.edited.some(t => t.text === '12345' && t.color === 'rgb(181, 206, 168)'), `${name}: edits must be colored before Run`);
  console.log(`${name}: ${expected.length} token-category checks + live edit passed`);
}
