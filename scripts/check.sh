#!/bin/bash
# The gate for the Do Not Disturb site. Every step must pass before a pull request.
#
#   scripts/check.sh            all of it
#   ONLY=lines scripts/check.sh one browser step (see scripts/gate.mjs for the names)
#
#   1. Text scan (scripts/scan.mjs): no AI names, no long dashes, no emoji but the flame, and
#      nothing that ships uses the app's own name for its year in review.
#   2. HTML validity (html-validate) of the page and the social card.
#   3. The browser checks (scripts/gate.mjs) in Playwright's Chromium: no outside hosts in any
#      URL and no request leaving the site, no sideways scroll from 320 to 1920, line lengths at
#      1440, the keyboard pass with its cherry focus rings, the dial by keys, clicks, taps and
#      drags, the review screenshots, and Lighthouse at mobile.
#
# Screenshots and Lighthouse reports go to $SHOTS (default ~/Code/dnd-build/landing/shots).
# The tools are pinned in scripts/package.json and installed on first run; the page itself
# needs none of them.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT/scripts"
[ -d node_modules ] || npm ci --no-audit --no-fund

echo "scan"
node scan.mjs "$ROOT"

if [ -z "${ONLY:-}" ]; then
    echo "html"
    ./node_modules/.bin/html-validate --config .htmlvalidate.json "$ROOT/index.html" "$ROOT/docs/og.html"
    echo "  ok   index.html and docs/og.html are valid"
fi

node gate.mjs "$ROOT"
