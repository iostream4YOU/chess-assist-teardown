#!/usr/bin/env bash
# Rebuild ../deobfuscated/*.js from the original extension files.
# Purely static: the obfuscated code is parsed with Babel, never executed.
set -euo pipefail
cd "$(dirname "$0")"
ASSETS=../extension/assets
mkdir -p build/raw build/pass1 ../deobfuscated

# 1. Split the bundles. tne.js = Stockfish.js (lines 1-19) + Socket.IO 4.7.2 (21-26) + Chess Assist (31).
sed -n '31p' "$ASSETS/tne.js" > build/raw/content.js
sed -n '4p'  "$ASSETS/upo.js" > build/raw/popup.js
cp "$ASSETS/rgn.js" build/raw/background.js

# 2. Pass 1: constant folding, a['b'] -> a.b, ![] -> false, pull out base64 blobs.
for f in background content popup; do
  node deob.js "build/raw/$f.js" "build/pass1/$f.js" "build/pass1/$f.blobs.json"
done

# 3. Pass 2: strip anti-tamper, restructure statements, rename with maps/*.json, add comments.
node readable.js build/pass1/background.js ../deobfuscated/01-background.js     maps/background.json
node readable.js build/pass1/content.js    ../deobfuscated/02-content-script.js maps/content.json
node readable.js build/pass1/popup.js      ../deobfuscated/03-popup.js          maps/popup.json

npx prettier --print-width 110 --write ../deobfuscated/*.js > /dev/null
for f in ../deobfuscated/*.js; do node --check "$f"; done
echo "done -> ../deobfuscated/"
