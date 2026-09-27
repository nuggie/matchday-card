// Screenshots of the dev harness with Playwright (desktop + phone).
//   node dev/snap.mjs [filter]         -> dev/shots/<name>.png
//   node dev/snap.mjs --docs           -> additionally copies the README images to docs/
// Playwright is not a dependency of this repo: set PLAYWRIGHT_MODULE to its path
// (default: ~/dashboard-screenshot/node_modules/playwright) or install it globally.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || join(homedir(), 'dashboard-screenshot/node_modules/playwright');
let playwright;
try {
  playwright = require(modulePath);
} catch (e) {
  playwright = require('playwright');
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dev/shots');
const DOCS = join(ROOT, 'docs');
const CACHE = join(ROOT, 'dev/.image-cache');

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 430, height: 932 };

// w: card width (a two-column section on a 1280 px screen is ~976 px wide).
const SHOTS = [
  { name: 'overview-desktop', scenario: 'overview', viewport: DESKTOP, w: 976, docs: true },
  { name: 'overview-mobile', scenario: 'overview', viewport: PHONE, w: 'full' },
  { name: 'overview-light-desktop', scenario: 'overview', viewport: DESKTOP, w: 976, theme: 'light', docs: true },
  { name: 'pl-desktop', scenario: 'overview-pl', viewport: DESKTOP, w: 976 },
  { name: 'pl-mobile', scenario: 'overview-pl', viewport: PHONE, w: 'full' },
  { name: 'bl2-mobile', scenario: 'overview-bl2', viewport: PHONE, w: 'full' },
  { name: 'live-desktop', scenario: 'live', viewport: DESKTOP, w: 976, open: ['83187'], docs: true },
  { name: 'live-mobile', scenario: 'live', viewport: PHONE, w: 'full', open: ['83187'], docs: true },
  { name: 'live-compact-mobile', scenario: 'live-compact', viewport: PHONE, w: 'full' },
  { name: 'live-en-desktop', scenario: 'live', viewport: DESKTOP, w: 976, lang: 'en', open: ['83189'] },
  { name: 'replay-mobile', scenario: 'replay', viewport: PHONE, w: 'full', open: ['3003'] },
  { name: 'pokal-desktop', scenario: 'pokal', viewport: DESKTOP, w: 520, open: ['81849'] },
  { name: 'pokal-shootout-live-mobile', scenario: 'pokal-shootout-live', viewport: PHONE, w: 'full', open: ['81849'], docs: true },
  { name: 'team-mobile', scenario: 'team', viewport: PHONE, w: 'full', docs: true },
  { name: 'unavailable-mobile', scenario: 'unavailable', viewport: PHONE, w: 'full' },
];

const args = process.argv.slice(2);
const toDocs = args.includes('--docs');
const filter = args.find((a) => !a.startsWith('--'));

await mkdir(OUT, { recursive: true });
if (toDocs) await mkdir(DOCS, { recursive: true });
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/dev/`;
const browser = await playwright.chromium.launch({ headless: true });
const errors = [];

// Crest images are fetched once by node (with retries: Wikimedia throttles bursts) and
// served from dev/.image-cache afterwards, so screenshots do not depend on the hosts.
await mkdir(CACHE, { recursive: true });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let fetchChain = Promise.resolve();
async function cachedImage(url) {
  const key = join(CACHE, createHash('sha1').update(url).digest('hex'));
  try {
    return { body: await readFile(key), contentType: (await readFile(key + '.type', 'utf8')) || 'image/png' };
  } catch (e) {
    // not cached yet
  }
  const run = fetchChain.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url.replace(/^http:/, 'https:'), { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (res && res.ok) {
        const body = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') || 'image/png';
        await writeFile(key, body);
        await writeFile(key + '.type', contentType);
        return { body, contentType };
      }
      await sleep(1500 * (attempt + 1));
    }
    return null;
  });
  fetchChain = run.catch(() => null);
  return run;
}
const failed = new Set();
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

for (const shot of SHOTS.filter((s) => !filter || s.name.includes(filter))) {
  // Some crest hosts (Wikimedia) refuse the HeadlessChrome user agent.
  const ctx = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 1, userAgent: USER_AGENT });
  await ctx.route(
    (url) => !url.hostname.startsWith('127.0.0.1'),
    async (route) => {
      if (route.request().resourceType() !== 'image') return route.continue();
      const img = await cachedImage(route.request().url());
      if (!img) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, body: img.body, contentType: img.contentType });
    },
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${shot.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(`${shot.name}: console: ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && failed.add(`${r.status()} ${r.url()}`));
  const q = new URLSearchParams({ scenario: shot.scenario, theme: shot.theme || 'dark', lang: shot.lang || 'de', w: String(shot.w), shot: '1' });
  await page.goto(base + '?' + q, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true);
  for (const id of shot.open || []) {
    for (const row of await page.locator(`.row[data-id="${id}"]`).all()) await row.click();
  }
  await page.waitForTimeout(700);
  const file = join(OUT, shot.name + '.png');
  await page.locator('#stage').screenshot({ path: file });
  if (toDocs && shot.docs) await copyFile(file, join(DOCS, shot.name + '.png'));
  console.log('OK', file);
  await ctx.close();
}

await browser.close();
server.close();
if (failed.size) console.warn('Failed requests (crest hosts):\n' + [...failed].join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
