// The browser half of the gate (scripts/check.sh runs it). Serves the site from this folder's
// parent on a local port and checks it in Playwright's Chromium:
//
//   hosts      every src, href, srcset, content URL and CSS url() stays on the site, except
//              apps.apple.com and freedom-terminal.com
//   requests   loading the page, at 390 and 1440, asks nothing of any other host; no console
//              message and no page error
//   overflow   nothing scrolls sideways at 320, 390, 1440 or 1920
//   lines      at 1440 no paragraph is wider than its measure and no line runs to 75 characters
//   keyboard   Tab reaches the skip link, the header, the button, the dial and every footer link,
//              each with a visible 3px cherry ring; the arrow keys, Home and End move the dial
//   dial       a click or a tap at each place picks it, a drag along the track follows, and a
//              touch that heads up the page scrolls it and leaves the dial alone
//   shots      full pages at 1920, 1440 and 390, the dial at levels 1 and 5, and the page with
//              reduced motion, saved to $SHOTS for review
//   lighthouse three mobile runs; the median must reach 100 in accessibility, best practices
//              and SEO, and 95 in performance
//
// ONLY=hosts,shots (any of the names above) runs a subset.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const SHOTS = process.env.SHOTS || path.join(os.homedir(), 'Code/dnd-build/landing/shots');
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (step) => !ONLY.length || ONLY.includes(step);
const ALLOWED_HOSTS = ['apps.apple.com', 'freedom-terminal.com', 'donotdisturb.vishutdhar.com'];
const CHERRY = 'rgb(240, 74, 104)';
const WORDS = ['Fine.', 'Solid.', 'Good.', 'Great.', 'Legendary.'];
const LINES = ['Noted without comment.', 'Filed under: good decisions.', 'Noted for the record.', 'Another one for the archive.', 'Full marks. The bar has been moved.'];

let failures = 0;
const fail = (message) => { failures++; console.log(`  FAIL ${message}`); };
const pass = (message) => console.log(`  ok   ${message}`);
const check = (ok, message) => (ok ? pass(message) : fail(message));

// A static server for the site folder: "/" is index.html, anything else is a file or a 404.
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, body) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

async function open(width, height, options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: options.scale || 1, hasTouch: !!options.touch, isMobile: !!options.touch, reducedMotion: options.reducedMotion || 'no-preference' });
    const page = await context.newPage();
    const log = { requests: [], console: [], errors: [] };
    page.on('request', (r) => log.requests.push(r.url()));
    page.on('console', (m) => log.console.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => log.errors.push(String(e)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(options.settle ?? 1500);
    return { context, page, log };
}

// Scrolls the whole page so every lazy image loads, then returns to the top.
async function loadEverything(page) {
    await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
        await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
}

const dialState = (page) => page.evaluate(() => {
    const input = document.querySelector('#heat');
    return {
        value: +input.value,
        valuetext: input.getAttribute('aria-valuetext'),
        word: document.querySelector('.dial-word').textContent,
        line: document.querySelector('.dial-line').textContent,
        lit: document.querySelectorAll('.flame.is-lit').length,
        t: getComputedStyle(document.querySelector('.dial')).getPropertyValue('--t').trim(),
    };
});

function expectLevel(state, level, how) {
    const ok = state.value === level && state.word === WORDS[level - 1] && state.line === `“${LINES[level - 1]}”`
        && state.lit === level && state.valuetext === `${level} of 5, ${WORDS[level - 1]}` && Math.abs(parseFloat(state.t) - (level - 1) / 4) < 1e-6;
    check(ok, `${how}: level ${level} (${state.lit} lit, ${state.word} ${state.line})`);
}

// The x of a place along the dial's track, from the input's box: places sit where the native
// thumb's centre does, half a thumb in from each end.
const placeX = (box, level) => box.x + box.height / 2 + (box.width - box.height) * (level - 1) / 4;

if (want('hosts')) {
    console.log('hosts');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    const urls = [];
    for (const m of html.matchAll(/\s(?:src|href|content)="([^"]*)"/g)) urls.push(m[1]);
    for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) urls.push(...m[1].split(',').map((s) => s.trim().split(/\s+/)[0]));
    for (const m of (html + css).matchAll(/url\(\s*["']?([^"')]+)/g)) urls.push(m[1]);
    const outside = urls.filter((u) => /^(https?:)?\/\//i.test(u)).filter((u) => !ALLOWED_HOSTS.includes(new URL(u, 'https://x').hostname));
    check(outside.length === 0, `no outside hosts in ${urls.length} URLs${outside.length ? ': ' + outside.join(' ') : ''}`);
}

if (want('requests')) {
    console.log('requests');
    for (const [w, h, touch] of [[390, 844, true], [1440, 900, false]]) {
        const { context, page, log } = await open(w, h, { touch });
        await loadEverything(page);
        const away = log.requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'));
        check(away.length === 0, `${w}: ${log.requests.length} requests, none off the site${away.length ? ': ' + away.join(' ') : ''}`);
        check(log.console.length === 0 && log.errors.length === 0, `${w}: no console messages or page errors${log.console.concat(log.errors).map((m) => '\n       ' + m).join('')}`);
        await context.close();
    }
}

if (want('overflow')) {
    console.log('overflow');
    for (const w of [320, 390, 1440, 1920]) {
        const { context, page } = await open(w, 900, { touch: w < 500, settle: 300 });
        // The dial's row is widest at level 5, where "Legendary." sits beside five flames.
        for (const key of ['Home', 'End']) {
            await page.focus('#heat');
            await page.keyboard.press(key);
            await page.waitForTimeout(300);
            const m = await page.evaluate(() => {
                const dial = document.querySelector('.dial').getBoundingClientRect();
                const word = document.querySelector('.dial-word').getBoundingClientRect();
                const flames = document.querySelector('.flames').getBoundingClientRect();
                return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, dialRight: dial.right, wordRight: word.right, gap: word.left - flames.right };
            });
            check(m.scroll <= m.client && m.wordRight <= m.dialRight + 0.5 && m.gap >= 8,
                `${w}, dial at ${key === 'Home' ? 1 : 5}: scroll width ${m.scroll} within ${m.client}, the word ends at ${Math.round(m.wordRight)} inside the dial's ${Math.round(m.dialRight)}, ${Math.round(m.gap)}px after the flames`);
        }
        await context.close();
    }
}

if (want('lines')) {
    console.log('lines');
    const { context, page } = await open(1440, 900, { settle: 1500 });
    const paragraphs = await page.evaluate(() => [...document.querySelectorAll('main p, footer p, footer li')].filter((p) => p.offsetParent && p.textContent.trim()).map((p) => {
        const style = getComputedStyle(p);
        const lines = new Map();
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (let i = 0; i < node.length; i++) {
                range.setStart(node, i); range.setEnd(node, i + 1);
                const rect = range.getClientRects()[0];
                if (!rect) continue;
                const top = Math.round(rect.top / 4);
                lines.set(top, (lines.get(top) || '') + node.data[i]);
            }
        }
        const longest = Math.max(...[...lines.values()].map((s) => s.trim().length));
        return { text: p.textContent.trim().slice(0, 40), width: p.getBoundingClientRect().width, max: style.maxWidth, longest };
    }));
    for (const p of paragraphs) {
        const measured = p.max === 'none' ? null : parseFloat(p.max);
        check(p.longest < 75 && (measured === null ? p.width < 75 * 9 : p.width <= measured + 0.5),
            `"${p.text}": longest line ${p.longest} characters, ${Math.round(p.width)}px wide, measure ${p.max}`);
    }
    await context.close();
}

if (want('keyboard')) {
    console.log('keyboard');
    const { context, page } = await open(1440, 900, { settle: 1500 });
    const stops = [];
    for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const s = getComputedStyle(el, el.matches(':focus-visible') ? null : null);
            const label = el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent.trim() || (el.querySelector('img') && el.querySelector('img').alt) || el.tagName;
            const r = el.getBoundingClientRect();
            return { label: label.replace(/\s+/g, ' ').trim(), focusVisible: el.matches(':focus-visible'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor, inView: r.bottom > 0 && r.top < innerHeight && r.width > 0 };
        });
        if (!stop || (stops.length && stop.label === stops[0].label)) break;
        stops.push(stop);
    }
    console.log('       order: ' + stops.map((s) => s.label).join(' | '));
    const expected = ['Skip to main content', 'Do Not Disturb', 'Support', 'Download on the App Store', 'How was it', 'Download on the App Store', 'Privacy', 'Support', 'A Freedom Terminal product', 'Download on the App Store'];
    check(JSON.stringify(stops.map((s) => s.label)) === JSON.stringify(expected), 'tab order: skip link, header, the button, the dial, the price button, the footer links');
    for (const s of stops) check(s.focusVisible && s.style === 'solid' && s.width >= 3 && s.color === CHERRY && s.inView, `${s.label}: ${s.width}px ${s.style} ${s.color} ring, in view`);
    await page.focus('#heat');
    for (const [key, level] of [['ArrowRight', 4], ['ArrowRight', 5], ['ArrowRight', 5], ['ArrowLeft', 4], ['Home', 1], ['ArrowUp', 2], ['End', 5], ['ArrowDown', 4], ['ArrowLeft', 3]]) {
        await page.keyboard.press(key);
        expectLevel(await dialState(page), level, key);
    }
    await context.close();
}

if (want('dial')) {
    console.log('dial');
    {
        const { context, page } = await open(1440, 900, { settle: 600 });
        await page.locator('#heat').scrollIntoViewIfNeeded();
        const box = await page.locator('#heat').boundingBox();
        for (const level of [5, 1, 4, 2, 3]) {
            await page.mouse.click(placeX(box, level), box.y + box.height / 2);
            expectLevel(await dialState(page), level, `click at place ${level}`);
        }
        await page.mouse.move(placeX(box, 1), box.y + box.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) await page.mouse.move(placeX(box, 1) + (placeX(box, 5) - placeX(box, 1)) * i / 10, box.y + box.height / 2);
        await page.mouse.up();
        expectLevel(await dialState(page), 5, 'mouse drag from 1 to 5');
        await context.close();
    }
    {
        const { context, page } = await open(390, 844, { touch: true, settle: 600 });
        await page.locator('#heat').scrollIntoViewIfNeeded();
        const box = await page.locator('#heat').boundingBox();
        const y = box.y + box.height / 2;
        for (const level of [1, 5, 2, 4]) {
            await page.touchscreen.tap(placeX(box, level), y);
            await page.waitForTimeout(150);
            expectLevel(await dialState(page), level, `tap at place ${level}`);
        }
        const cdp = await context.newCDPSession(page);
        const touch = async (type, x, yy) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }] });
        await touch('touchStart', placeX(box, 4), y);
        for (let i = 1; i <= 12; i++) await touch('touchMove', placeX(box, 4) - (placeX(box, 4) - placeX(box, 1)) * i / 12, y);
        await touch('touchEnd');
        await page.waitForTimeout(150);
        expectLevel(await dialState(page), 1, 'touch drag from 4 to 1');
        const before = await page.evaluate(() => window.scrollY);
        await touch('touchStart', placeX(box, 4), y);
        for (let i = 1; i <= 12; i++) await touch('touchMove', placeX(box, 4) + 2 * i / 12, y - 220 * i / 12);
        await touch('touchEnd');
        await page.waitForTimeout(600);
        const after = await page.evaluate(() => window.scrollY);
        const state = await dialState(page);
        check(after > before + 50 && state.value === 1, `a touch heading up the page scrolled it ${Math.round(after - before)}px and left the dial at ${state.value}`);
        await context.close();
    }
}

if (want('shots')) {
    console.log('shots');
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const [w, h, touch] of [[1920, 1080, false], [1440, 900, false], [390, 844, true]]) {
        const { context, page } = await open(w, h, { touch, scale: w < 500 ? 3 : 1 });
        await loadEverything(page);
        await page.screenshot({ path: path.join(SHOTS, `page-${w}.png`), fullPage: true });
        for (const [key, level] of [['Home', 1], ['End', 5]]) {
            await page.focus('#heat');
            await page.keyboard.press(key);
            await page.evaluate(() => document.activeElement.blur());
            await page.waitForTimeout(700);
            await page.locator('.dial-section').screenshot({ path: path.join(SHOTS, `dial-${w}-level-${level}.png`) });
        }
        pass(`page-${w}.png, dial-${w}-level-1.png, dial-${w}-level-5.png`);
        await context.close();
    }
    for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
        const { context, page } = await open(w, h, { touch, scale: w < 500 ? 3 : 1, reducedMotion: 'reduce', settle: 200 });
        await loadEverything(page);
        await page.screenshot({ path: path.join(SHOTS, `page-${w}-reduced-motion.png`), fullPage: true });
        const pose = await page.evaluate(() => getComputedStyle(document.querySelector('.phone')).transform);
        check(pose === 'none' || pose === 'matrix(1, 0, 0, 1, 0, 0)' || /^matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\)$/.test(pose), `page-${w}-reduced-motion.png, the phone square (${pose.slice(0, 40)})`);
        await context.close();
    }
}

await browser.close();

if (want('lighthouse')) {
    console.log('lighthouse');
    const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules/.bin/lighthouse');
    const runs = [];
    for (let i = 1; i <= 3; i++) {
        const out = path.join(SHOTS, `lighthouse-mobile-${i}.json`);
        fs.mkdirSync(SHOTS, { recursive: true });
        // Spawned without blocking: this process is also the page's web server, and a blocking
        // spawn would leave every request from the audited page unanswered.
        const r = await new Promise((resolve) => {
            const child = spawn(bin, [ORIGIN + '/', '--quiet', '--output=json', `--output-path=${out}`, '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new'], { env: { ...process.env, CHROME_PATH: chromium.executablePath() } });
            let stderr = '';
            child.stderr.on('data', (d) => { stderr += d; });
            child.on('close', (status) => resolve({ status, stderr }));
        });
        if (r.status !== 0) { fail(`lighthouse run ${i} exited ${r.status}: ${r.stderr.slice(-400)}`); continue; }
        const report = JSON.parse(fs.readFileSync(out, 'utf8'));
        const score = (id) => Math.round(report.categories[id].score * 100);
        const run = { performance: score('performance'), accessibility: score('accessibility'), 'best-practices': score('best-practices'), seo: score('seo'), lcp: report.audits['largest-contentful-paint'].displayValue, tbt: report.audits['total-blocking-time'].displayValue, cls: report.audits['cumulative-layout-shift'].displayValue, fcp: report.audits['first-contentful-paint'].displayValue };
        runs.push(run);
        console.log(`       run ${i}: ${JSON.stringify(run)}`);
        for (const [id, a] of Object.entries(report.audits)) if (a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'notApplicable' && i === 1) console.log(`       below full marks: ${id} (${a.score}) ${a.displayValue || ''}`);
    }
    if (runs.length) {
        const median = (key) => runs.map((r) => r[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
        for (const [key, bar] of [['performance', 95], ['accessibility', 100], ['best-practices', 100], ['seo', 100]]) check(median(key) >= bar, `${key} median ${median(key)} (bar ${bar}; runs ${runs.map((r) => r[key]).join(', ')})`);
    }
}

server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
