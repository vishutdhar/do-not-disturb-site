# Do Not Disturb site

The landing page for Do Not Disturb: Couples Log, the scoreboard for the two of you, on iPhone.

Canonical site: https://donotdisturb.vishutdhar.com/ (Vercel). Plain static files: no framework and
no build step. The privacy policy the App Store links to lives on the studio site, at
https://freedom-terminal.com/do-not-disturb/privacy/.

## Files

- `index.html` and `styles.css`: the page. One dark look in the app's own palette (every colour is
  a dark value from the app's `Theme.swift`), one typeface. The only script is inline: one line in
  the head that marks the page for script and for motion unless the visitor asked for less, and
  one block at the end that runs the heat dial, turns the hero phone square as the page scrolls,
  and tilts it toward a mouse pointer. With reduced motion everything is in its final state; with
  no script the dial is the plain range input at level 3.
- `fonts/`: Nunito, the variable font from the google/fonts repository, cut to its latin range
  and to weights 500 to 900, with its licence, `OFL.txt`. Nothing loads from a third party.
- `assets/`: the captures, the icons, the App Store badge, the door hanger mark (`hanger.svg`) and
  the social card. `assets/src/` holds the full size PNG captures and the app icon they are made
  from; `scripts/build-assets.sh` makes every derived image from them.
- `vercel.json`: clean URLs, no trailing slash, a one year immutable cache on `assets/` and
  `fonts/`. `.vercelignore` keeps `assets/src/`, `docs/`, `scripts/` and this README out of every
  deployment.
- `docs/superpowers/specs/2026-10-31-landing-page-design.md`: the design plan, with the measured
  contrast table, the gate's numbers and every deviation from the plan.
- `docs/og.html`: the social card, rendered by `scripts/og.mjs`.
- `scripts/`: the gate (`check.sh`, `scan.mjs`, `gate.mjs`), the contrast measurement
  (`contrast.mjs`), and the asset and card builders. Their tools are pinned in
  `scripts/package.json`; the page needs none of them.

## Rules for changes

- Files under `assets/` and `fonts/` are cached for a year as immutable. Never change one in
  place: save the new version under a new name (the date suffix, for example
  `home-plate-20261031-600.webp`) and update the references.
- Every claim on the page must be true of the shipped app. Check the app repository before adding
  one, and change the page only after the change is live in the App Store.
- The dial's words and lines are the app's own: `HeatLevel.word` in
  `DoNotDisturb/Views/Controls/HeatDial.swift`, and one line per level from `SaveLine.sessionRules`
  in `DoNotDisturb/Model/FunCopy.swift`.
- Colours come from the app. Take a new value from `Theme.swift` and measure it with
  `node scripts/contrast.mjs` before using it (the spec lists the bars).
- The page never says the app's own name for its year in review; it says "your year". The gate
  fails on it.

## The captures

Real screens of the shipping build (main 7d41c9e of the app repository) on the iPhone 18 Pro Max
simulator, iOS 27.0, dark appearance, on the made-up sample year with the partners named Alex and
Sam, under a 9:41 status bar. They were taken by the app repository's
`docs/store/capture-screenshots.sh` with `SIZES="6.9" APPEARANCES="dark"`, on 31 October 2026:

| Source | Frame from the capture run | Shown |
|---|---|---|
| `home-20261031.png` | `home` | the hero |
| `headache-20261031.png` | `log-headache` | Headache. |
| `belt-ceremony-20261031.png` | `belt-headache` | The rivalry. |
| `reports-20261031.png` | `reports-year-p1` | The reports. |
| `year-20261031.png` | the year in review, longest streak card | Your year. |

Every phone on the page stands on a rule and is cut by it, so `scripts/build-assets.sh` cuts each
capture in a calm band of its own screen; the rows it cuts at are listed at the top of that script.
A new capture needs those rows measured again.

## Run it locally

Any static server works, for example `python3 -m http.server 8000` from this folder.

## The gate

`scripts/check.sh` runs every check the plan asks for and must pass before a pull request: the
text scan, HTML validity, no outside hosts and no request leaving the site, no sideways scroll from
320 to 1920 wide, line lengths, the keyboard pass with its focus rings, the dial by keys, clicks,
taps and drags, review screenshots, and Lighthouse at mobile (100 in accessibility, best practices
and SEO, 95 or more in performance). Screenshots and reports go to `$SHOTS`.

## Social card

`docs/og.html` is a 1200 by 630 page that loads `styles.css`. Render it with
`node scripts/og.mjs <yyyymmdd>`, which writes `assets/og-<yyyymmdd>.png`, then point `og:image`
and `twitter:image` in `index.html` at the new file.
