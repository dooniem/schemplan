// Lager bildene til hjelpen (src/help/img/*.webp) fra en oppdiktet testplan.
// Kjør utviklingsserveren først (npm run dev), deretter: node scripts/hjelpebilder.mjs
// Krever Playwright med Chromium. Kjør på nytt når utseendet i appen endrer seg.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try { return require('playwright'); } catch { return require(`${process.env.PLAYWRIGHT_DIR ?? '/opt/node-tools/node_modules/playwright'}`); }
})();

const APP = process.env.APP_URL ?? 'http://localhost:5173/schemplan/';
const UT = new URL('../src/help/img/', import.meta.url);
const BREDDE = 1000; // største bredde på bildene i piksler
const bare = process.argv.slice(2); // valgfritt: bare disse bildene
mkdirSync(UT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const conv = await ctx.newPage();

/** PNG fra Playwright gjøres om til WebP i nettleseren, så vi slipper flere avhengigheter. */
async function lagre(navn, png) {
  const data = await conv.evaluate(async ({ b64, max }) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const s = Math.min(1, max / img.width);
    const c = new OffscreenCanvas(Math.round(img.width * s), Math.round(img.height * s));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.8 });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s2 = '';
    for (let i = 0; i < buf.length; i += 0x8000) s2 += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s2);
  }, { b64: png.toString('base64'), max: BREDDE });
  const buf = Buffer.from(data, 'base64');
  writeFileSync(new URL(`${navn}.webp`, UT), buf);
  console.log(`${navn}.webp  ${(buf.length / 1024).toFixed(0)} kB`);
}

/** Ny side med testplanen åpnet. */
async function side(form = 'middels') {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('Feil i siden:', e.message));
  await p.goto(APP);
  const json = await p.evaluate(async (f) => {
    const m = await import(`${location.pathname}src/test/testplaner.ts`);
    return JSON.stringify(m.testform(f));
  }, form);
  await p.setInputFiles('#file-input', { name: 'Eksempelplan.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await p.waitForSelector('#sheet [data-id]');
  await p.waitForTimeout(300);
  return p;
}

const midt = async (p, sel) => {
  const b = await p.locator(sel).first().boundingBox();
  if (!b) throw new Error(`Fant ikke ${sel}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};
const boks = (id) => `#sheet [data-id="${id}"]`;
const klikk = async (p, sel, opt = {}) => { const m = await midt(p, sel); await p.mouse.click(m.x, m.y, opt); await p.waitForTimeout(200); };
/** Lane-navnet står i venstre kolonne; vi finner teksten i lane nr. i. */
const laneNavn = async (p, i) => {
  const r = await p.evaluate((i) => {
    const t = document.querySelectorAll('#sheet g.lanes > text')[i];
    const b = t.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, i);
  return r;
};
const rediger = async (p) => { await p.click('#edit'); await p.waitForTimeout(250); };
const ta = async (p, navn, clip) => {
  await p.mouse.move(1, 1).catch(() => {});
  await lagre(navn, await p.screenshot({ clip, animations: 'disabled' }));
};
/** Utsnitt rundt et element, med marg, holdt innenfor vinduet. */
const rundt = async (p, sel, m = 16, min = {}) => {
  const b = await p.locator(sel).first().boundingBox();
  let x = Math.max(0, b.x - m), y = Math.max(0, b.y - m);
  let w = Math.max(min.w ?? 0, b.width + 2 * m), h = Math.max(min.h ?? 0, b.height + 2 * m);
  w = Math.min(w, 1440 - x); h = Math.min(h, 900 - y);
  return { x, y, width: w, height: h };
};
const KRITISKE = ['6_1', '5_8', '4_2', '7_4', '7_5', '7_1'];
const ARK = { x: 0, y: 0, width: 1440, height: 900 };

const bilder = {
  async oversikt() {
    const p = await side();
    await ta(p, 'oversikt', ARK);
  },
  async zoom() {
    const p = await side();
    for (let i = 0; i < 3; i++) await p.click('#zoom-in');
    await p.waitForTimeout(300);
    await ta(p, 'zoom', ARK);
  },
  async fremhev() {
    const p = await side();
    await klikk(p, '#sheet g[data-trade="Betong"]');
    await ta(p, 'fremhev', { x: 120, y: 40, width: 760, height: 480 });
  },
  async sok() {
    const p = await side();
    await p.fill('#search', 'lorem');
    await p.waitForTimeout(300);
    await ta(p, 'sok', { x: 640, y: 0, width: 800, height: 520 });
  },
  async utkikk() {
    const p = await side();
    await p.click('#lookahead-menu');
    await p.waitForTimeout(250);
    await ta(p, 'utkikk', await rundt(p, '#menu-lookahead', 24, { w: 520 }));
  },
  async data() {
    const p = await side();
    await p.click('#view-data');
    await p.waitForTimeout(300);
    await ta(p, 'data', { x: 0, y: 0, width: 960, height: 600 });
  },
  async rediger() {
    const p = await side();
    await rediger(p);
    await klikk(p, boks('4_2'));
    await ta(p, 'rediger', { x: 700, y: 50, width: 740, height: 620 });
  },
  async flytte() {
    const p = await side();
    await rediger(p);
    await klikk(p, boks('4_2'));
    const m = await midt(p, boks('4_2'));
    const utsnitt = { x: m.x - 330, y: m.y - 190, width: 660, height: 400 };
    await ta(p, 'flytte-1', utsnitt);
    await p.mouse.move(m.x, m.y);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(m.x + i * 4, m.y + i * 7);
    await p.mouse.up();
    await p.waitForTimeout(300);
    await ta(p, 'flytte-2', utsnitt);
  },
  async flervalg() {
    const p = await side();
    await rediger(p);
    await klikk(p, boks('5_1'));
    await klikk(p, boks('5_2'), { modifiers: ['Shift'] });
    await klikk(p, boks('5_3'), { modifiers: ['Shift'] });
    const m = await midt(p, boks('5_2'));
    await ta(p, 'flervalg', { x: m.x - 340, y: m.y - 200, width: 680, height: 400 });
  },
  async boksmeny() {
    const p = await side();
    await rediger(p);
    await klikk(p, boks('4_2'));
    await klikk(p, boks('4_2'), { button: 'right' });
    await ta(p, 'boksmeny', await rundt(p, '.ctx-menu:popover-open', 24, { w: 560, h: 420 }));
  },
  async tekst() {
    const p = await side();
    await rediger(p);
    await klikk(p, boks('4_2'));
    const m = await midt(p, boks('4_2'));
    await p.mouse.dblclick(m.x, m.y);
    await p.waitForTimeout(300);
    await ta(p, 'tekst', { x: Math.max(0, m.x - 300), y: Math.max(0, m.y - 180), width: 600, height: 360 });
  },
  async lanes() {
    const p = await side();
    await rediger(p);
    const l = await laneNavn(p, 2);
    await p.mouse.click(l.x, l.y);
    await p.waitForTimeout(250);
    await ta(p, 'lanes', { x: 0, y: 50, width: 720, height: 560 });
    await ta(p, 'lanepanel', { x: 860, y: 50, width: 580, height: 700 });
  },
  async lanemeny() {
    const p = await side();
    await rediger(p);
    const l = await laneNavn(p, 2);
    await p.mouse.click(l.x, l.y, { button: 'right' });
    await p.waitForTimeout(250);
    await ta(p, 'lanemeny', await rundt(p, '.ctx-menu:popover-open', 24, { w: 560, h: 420 }));
  },
  async fag() {
    const p = await side();
    await rediger(p);
    await klikk(p, '#sheet g[data-trade="Betong"]');
    await ta(p, 'fag', { x: 700, y: 50, width: 740, height: 560 });
  },
  async kritisk() {
    const p = await side();
    await rediger(p);
    await p.click('#critical-mode');
    for (const id of KRITISKE) await klikk(p, boks(id));
    await p.waitForTimeout(250);
    await ta(p, 'kritisk', { x: 170, y: 250, width: 920, height: 440 });
  },
  async innstillinger() {
    const p = await side();
    await p.click('#settings');
    await p.waitForTimeout(150);
    await p.click('[data-sub="sub-kal"]');
    await p.waitForTimeout(250);
    await ta(p, 'innstillinger', { x: 0, y: 0, width: 900, height: 620 });
  },
  async lagre() {
    const p = await side();
    await p.click('#save-menu');
    await p.waitForTimeout(250);
    await ta(p, 'lagre', await rundt(p, '#menu-save', 24, { w: 520 }));
  },
  async oppdater() {
    const p = await side();
    await p.evaluate(() => (document.getElementById('update-dialog')).showModal());
    await p.waitForTimeout(250);
    await ta(p, 'oppdater', await rundt(p, '#update-dialog', 40));
  },
};

for (const [navn, lag] of Object.entries(bilder)) {
  if (bare.length && !bare.some((b) => b === navn || b.startsWith(`${navn}-`))) continue;
  try { await lag(); } catch (e) { console.error(`${navn}: ${e.message}`); }
}
await browser.close();
