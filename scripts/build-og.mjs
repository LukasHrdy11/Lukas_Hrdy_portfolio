// Renders the Open Graph image (public/og.jpg, 1200 × 630) from the live hero.
// Local tool, not part of CI: the image is committed. Needs Google Chrome and a running
// dev server:  npm run dev  →  npm run og   (other address: OG_URL=http://… npm run og)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const URL = process.env.OG_URL ?? 'http://localhost:4321/';
const OUT = 'public/og.jpg';
const [W, H] = [1200, 630];

// Only the name, the role and the sky: no header, buttons, caption or simulation controls.
const CSS = `
  .header, .hero__actions, .hero__caption, .solar__controls, astro-dev-toolbar { display: none !important; }
  .hero { min-height: ${H}px !important; }
  .hero__content { padding-block: 11rem 0 !important; }
`;

const profileDir = mkdtempSync(join(tmpdir(), 'og-chrome-'));
const chrome = spawn(
  process.env.CHROME ?? 'google-chrome',
  ['--headless=new', '--no-first-run', '--hide-scrollbars', '--enable-unsafe-swiftshader',
    `--user-data-dir=${profileDir}`, `--window-size=${W},${H}`, '--remote-debugging-pipe', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);

// Chrome DevTools Protocol over the pipe: JSON messages separated by a NUL byte.
let nextId = 0;
let buffer = '';
const pending = new Map();
const waiters = [];
chrome.stdio[4].on('data', (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const w of waiters.filter((w) => w.method === msg.method)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg.params);
      }
    }
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    chrome.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
  });
const event = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  await page('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const loaded = event('Page.loadEventFired');
  await page('Page.navigate', { url: URL });
  await loaded;
  await page('Runtime.evaluate', {
    expression: `document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(CSS)} }))`,
  });
  // Wait until the 3D scene has replaced the static drawing, then let it fade in and settle.
  for (let i = 0; i < 40; i++) {
    const { result } = await page('Runtime.evaluate', { expression: `!!document.querySelector('.solar.is-live')` });
    if (result.value) break;
    await sleep(250);
  }
  await sleep(1500);
  const { data } = await page('Page.captureScreenshot', { format: 'png' });
  await sharp(Buffer.from(data, 'base64')).jpeg({ quality: 88, mozjpeg: true }).toFile(OUT);
  console.log(`wrote ${OUT}`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profileDir, { recursive: true, force: true });
}
