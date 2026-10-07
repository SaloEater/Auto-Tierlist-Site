#!/bin/sh
# Copy the mod's export into site/data/ for local development.
# Usage: ./copy-export.sh [path/to/tierlist_export]   (default: ../run/tierlist_export)
set -e
SRC="${1:-$(dirname "$0")/../run/tierlist_export}"
DST="$(dirname "$0")/data"
rm -rf "$DST"
mkdir -p "$DST"
cp -R "$SRC"/. "$DST"/
echo "Copied $(ls "$DST" | wc -l | tr -d ' ') entries from $SRC to $DST"
