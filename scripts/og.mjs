// Renders docs/og.html to the social card, assets/og-<date>.png, 1200 by 630.
//   node scripts/og.mjs 20261031
// Served over a local port so the page's font loads as it does on the site.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const date = process.argv[2];
if (!/^\d{8}$/.test(date || '')) { console.error('usage: node scripts/og.mjs <yyyymmdd>'); process.exit(1); }
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
    const file = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, body) => err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`http://127.0.0.1:${server.address().port}/docs/og.html`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const loaded = await page.evaluate(() => document.fonts.check("900 100px Nunito"));
if (!loaded) { console.error('Nunito did not load'); process.exit(1); }
const out = path.join(ROOT, 'assets', `og-${date}.png`);
await page.screenshot({ path: out });
await browser.close();
server.close();
console.log(out);
