#!/bin/bash
# Makes every derived image on the page from the sources in assets/src.
#
#   scripts/build-assets.sh
#
# The captures are real screens of the shipping app on the iPhone 18 Pro Max simulator, dark
# appearance, 1320 by 2868 (see the README for how they were taken). Each is encoded as WebP at
# the width it is shown (300) and twice that, the way the Dose Pop site does it. Every phone on the
# page stands on a rule and is cut by it, so each capture is cut first, in a calm band of its own
# screen (measured: rows where nothing crosses the middle 90% of the width):
#   home           visible to row 1864: the Headache button ends at 1828, the next card starts at
#                  1871; the plate runs on to 2164 so the turned phone's body continues below
#                  the hero rule
#   headache       to 2030: the last excuse ends at 1980, the notes label starts at 2061
#   belt-ceremony  to 2040: the last line ends at 1944, the Next belt button starts at 2449
#   reports        to 2148: the tiles end at 2119, the timeline card starts at 2162
#   year           to 2040: the line ends at 1816, the page dots start at 2667
#
# Files under assets/ are cached for a year as immutable: a changed image gets a new date in its
# name, never the same name again.
#
# Needs ImageMagick 7.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/assets/src"
OUT="$ROOT/assets"
DATE=20261031

webp() {
    # webp <source png> <name> <width> <geometry to keep>
    magick "$1" -crop "$4" +repage -strip -resize "$3x" -quality 82 -define webp:method=6 "$OUT/$2-$3.webp"
}

# The hero plate: the top of the Log tab.
for width in 300 600; do webp "$SRC/home-$DATE.png" "home-plate-$DATE" "$width" 1320x2164+0+0; done

# The rows.
for cut in headache:2030 belt-ceremony:2040 reports:2148 year:2040; do
    name=${cut%%:*}
    for width in 300 600; do webp "$SRC/$name-$DATE.png" "$name-$DATE" "$width" "1320x${cut##*:}+0+0"; done
done

# Icons from the app icon.
for size in 32 180 192; do
    magick "$SRC/app-icon.png" -strip -resize "${size}x${size}" "PNG24:$OUT/icon-$size-$DATE.png"
done

ls -l "$OUT"
