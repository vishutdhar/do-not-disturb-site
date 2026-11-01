// The text half of the gate (scripts/check.sh runs it). Reads every file git tracks or would
// track, and fails on:
//   - the name of any AI product, model or vendor, in any file
//   - an em dash, an en dash or any other long dash, as a character or an HTML entity, in any file
//   - any emoji but the flame, as a character or an HTML entity, in any file
//   - the app's own name for its year in review, in any file that ships (anything a deploy does
//     not leave out by .vercelignore); the page says "your year"
// The names are kept encoded so this file does not itself name them.
//   node scripts/scan.mjs [root]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const NAMES = new RegExp(Buffer.from('XGIoY2xhdWRlfGFudGhyb3BpY3xvcGVuYWl8Y2hhdGdwdHxncHQtP1swLTldfGNvZGV4fGdlbWluaXxjb3BpbG90fG9wdXN8c29ubmV0fGhhaWt1fGZhYmxlfG15dGhvc3xhc3RyYXxsbGFtYXxtaXN0cmFsfGxsbXxsYXJnZSBsYW5ndWFnZSBtb2RlbClcYg==', 'base64').toString(), 'gi');
const YEAR_NAME = new RegExp(Buffer.from('d3JhcHBlZA==', 'base64').toString(), 'gi');
const DASHES = /[\u2012-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]/g;
const DASH_ENTITIES = /&(mdash|ndash|horbar);|&#(8210|8211|8212|8213);|&#x(2012|2013|2014|2015);/gi;
const EMOJI = /\p{Emoji_Presentation}|\uFE0F/gu;
const FLAME = 0x1F525;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => fs.existsSync(path.join(ROOT, f)));
const ignore = fs.existsSync(path.join(ROOT, '.vercelignore'))
    ? fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim().replace(/^\/|\/$/g, '')).filter((l) => l && !l.startsWith('#'))
    : [];
const ships = (f) => !ignore.some((p) => f === p || f.startsWith(p + '/'));

let failures = 0, scanned = 0;
const report = (file, text, index, what) => {
    const line = text.slice(0, index).split('\n').length;
    console.log(`  FAIL ${file}:${line} ${what}`);
    failures++;
};

for (const file of files) {
    const buffer = fs.readFileSync(path.join(ROOT, file));
    if (buffer.subarray(0, 8000).includes(0)) continue;   // binary
    scanned++;
    const raw = buffer.toString('utf8');
    // Numeric character references are read as the characters they stand for.
    const text = raw.replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
                    .replace(/&#([0-9]+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)));
    for (const m of raw.matchAll(NAMES)) report(file, raw, m.index, 'names an AI product or vendor');
    for (const m of raw.matchAll(DASHES)) report(file, raw, m.index, `a long dash (U+${m[0].codePointAt(0).toString(16).toUpperCase()})`);
    for (const m of raw.matchAll(DASH_ENTITIES)) report(file, raw, m.index, `a long dash entity ${m[0]}`);
    for (const m of text.matchAll(EMOJI)) if (m[0].codePointAt(0) !== FLAME) report(file, text, m.index, `an emoji (U+${m[0].codePointAt(0).toString(16).toUpperCase()})`);
    if (ships(file)) for (const m of raw.matchAll(YEAR_NAME)) report(file, raw, m.index, 'the in-app name of the year in review, on a file that ships');
}

console.log(failures ? `  ${failures} problem(s) in ${scanned} text files` : `  ok   ${scanned} text files: no AI names, no long dashes, no emoji but the flame; nothing that ships uses the in-app year name`);
process.exit(failures ? 1 : 0);
