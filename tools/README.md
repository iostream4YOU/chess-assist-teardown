# Deobfuscation tools

I wrote these scripts to produce everything in `../deobfuscated/` (`deobfuscated/`). They work **statically**: the obfuscated code is parsed into an AST with Babel and rewritten. It is never executed.

```bash
cd tools
npm install
bash build.sh
```

| File | What it does |
|---|---|
| `build.sh` | Splits the bundles, runs both passes, formats with Prettier, syntax-checks the output. |
| `deob.js` | **Pass 1.** Folds hex arithmetic (`-0xc56+-0xb*-0x269+0x1*-0xe2d` → `0`), turns `![]`/`!![]` into `false`/`true` and `a['b']` into `a.b`, and replaces base64 `data:` URIs (images, sounds) with `<<BLOB_n:type:size>>` placeholders. |
| `readable.js` | **Pass 2.** Removes the self-defending and console-hijack guards and inlines string-lookup tables (UCI words, socket event names). It splits comma-sequences, `a && b()` and `a ? b() : c()` into real `if`/`else`, and collapses the `var X = {}; X.k = v; use(X)` pattern into `use({ k: v })`. Then it renames identifiers and adds the explanatory comments. |
| `maps/*.json` | My hand-written rename and comment tables, one per file. I chose every name by reading what the code does. The originals are 1–3 letter mangled names (or decoys like `tunaMeltBasil`). |

The renamer refuses any rename that would shadow an existing name, and the output is checked with `node --check`.

**Why the readable files are not loadable:** they're a reading aid. They depend on the Stockfish and Socket.IO globals that only exist inside the original `tne.js` bundle. Use `../extension/` (`extension/`) to see the real behaviour.
