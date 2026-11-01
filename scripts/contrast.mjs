// Measures every text and accent pair on the page with APCA (SAPC 0.0.98G-4g constants) and,
// for reference, the WCAG 2 ratio. Prints a Markdown table for the spec.
//   node scripts/contrast.mjs
// Lc is reported as a magnitude: light text on a dark ground comes out negative in APCA.

const pairs = [
    // [what, text, ground, bar]
    ['Headings: Ink on Ground', '#FFEFE6', '#1E0F1A', 90],
    ['Ink 2 on Ground (the app\'s token; not used)', '#D7B7C0', '#1E0F1A', 75],
    ['Body: body ink on Ground', '#E5CBCD', '#1E0F1A', 75],
    ['Copyright line: Muted on Ground', '#AA929C', '#1E0F1A', null],
    ['Cherry as text on Ground (not used for text)', '#F04A68', '#1E0F1A', 60],
    ['Primary button: Ground ink on Ink fill', '#1E0F1A', '#FFEFE6', 75],
    ['White on Cherry fill, the app\'s filled button (not used)', '#FFFFFF', '#CF2547', 75],
    ['Dark ink on Cherry fill (rejected)', '#1E0F1A', '#F04A68', 75],
    ['Dark ink on Cherry fill #CF2547 (rejected)', '#1E0F1A', '#CF2547', 75],
    ['Price band: Ink on Card', '#FFEFE6', '#2C1826', 90],
    ['Price band: body ink on Card', '#E5CBCD', '#2C1826', 75],
];

// Non-text pairs: WCAG 2 asks 3:1 of a focus indicator against what it sits on.
const marks = [
    ['Focus ring: Cherry on Ground', '#F04A68', '#1E0F1A'],
    ['Focus ring: Cherry on Card (price band)', '#F04A68', '#2C1826'],
];

const channel = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;

// APCA 0.0.98G-4g.
function apcaY(hex) {
    const [r, g, b] = [0, 1, 2].map((i) => channel(hex, i) ** 2.4);
    return 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
}
function apca(text, ground) {
    const clamp = (y) => (y > 0.022 ? y : y + (0.022 - y) ** 1.414);
    const t = clamp(apcaY(text)), g = clamp(apcaY(ground));
    if (Math.abs(g - t) < 0.0005) return 0;
    let c;
    if (g > t) { const s = (g ** 0.56 - t ** 0.57) * 1.14; c = s < 0.1 ? 0 : s - 0.027; }
    else { const s = (g ** 0.65 - t ** 0.62) * 1.14; c = s > -0.1 ? 0 : s + 0.027; }
    return Math.abs(c * 100);
}

// WCAG 2 relative luminance and ratio.
function luminance(hex) {
    const [r, g, b] = [0, 1, 2].map((i) => { const c = channel(hex, i); return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

console.log('| Pair | Text | Ground | APCA Lc | WCAG 2 | Bar | Result |');
console.log('|---|---|---|---|---|---|---|');
for (const [what, text, ground, bar] of pairs) {
    const lc = apca(text, ground);
    const result = bar === null ? 'fine print only' : (lc >= bar ? 'passes' : 'fails');
    console.log(`| ${what} | ${text} | ${ground} | ${lc.toFixed(1)} | ${ratio(text, ground).toFixed(1)}:1 | ${bar === null ? 'none' : 'Lc ' + bar} | ${result} |`);
}
console.log('');
console.log('| Mark | Colour | Ground | WCAG 2 | Bar | Result |');
console.log('|---|---|---|---|---|---|');
for (const [what, mark, ground] of marks) {
    const r = ratio(mark, ground);
    console.log(`| ${what} | ${mark} | ${ground} | ${r.toFixed(1)}:1 | 3:1 | ${r >= 3 ? 'passes' : 'fails'} |`);
}
