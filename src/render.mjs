// Renders the scene frame-by-frame in headless Chromium.
// usage: node src/render.mjs [--fps 30] [--from 0] [--to N] [--only t1,t2,...] [--out build/frames]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const fps = Number(args.fps || 30);
const outDir = path.resolve(ROOT, args.out || 'build/frames');
fs.mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => { console.error('[page error]', e); process.exit(1); });
await page.goto(`http://localhost:${port}/src/scene.html`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 });

const duration = await page.evaluate(() => window.DURATION);
fs.writeFileSync(path.join(ROOT, 'build/events.json'), JSON.stringify(await page.evaluate(() => window.getEvents()), null, 1));

const total = Math.round(duration * fps);
let frames;
if (args.only) frames = args.only.split(',').map(s => ({ t: Number(s), name: `still_${s}.jpg` }));
else {
  const from = Number(args.from || 0), to = Math.min(total, Number(args.to || total));
  frames = [];
  for (let i = from; i < to; i++) frames.push({ t: i / fps, name: `${String(i).padStart(5, '0')}.jpg` });
}

const t0 = Date.now();
for (const [n, f] of frames.entries()) {
  const dataUrl = await page.evaluate(t => window.renderFrame(t), f.t);
  fs.writeFileSync(path.join(outDir, f.name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  if (n % 30 === 0) console.log(`frame ${n + 1}/${frames.length} t=${f.t.toFixed(2)} (${((Date.now() - t0) / (n + 1)).toFixed(0)} ms/frame)`);
}
console.log(`done: ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
server.close();
