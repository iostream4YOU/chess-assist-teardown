# 8. How the code is obfuscated, and how I reversed it

## Techniques found

| Technique | Example in the original | What it hides |
|---|---|---|
| Identifier mangling | `r6`, `Oz`, `rR`, `OM` | every variable name |
| Numbers as expressions | `-0xc56+-0xb*-0x269+0x1*-0xe2d` (= 0) | constants such as delays and indexes |
| Bracket property access | `chrome['storage']['local']['set']` | greppable API names |
| Object-key transform | `var c={}; c['function_atpl']=![]; chrome.storage.local.set(c)` | object literals |
| Boolean tricks | `!![]`, `![]` | `true`, `false` |
| Comma sequences | `(a=1, b(), c && d())` | control flow |
| String lookup tables | `OX[3]+"\x20"+OX[5]+...` = `"setoption name ..."` | UCI commands and socket events |
| Decoy names | `tunaMeltBasil`, `moveChangeLichorice`, `chestNutPzHp`, `periwinkle`, `marooner` | which site and what the function does |
| Decoy storage keys | `nEw_mv_value`, `fopitu`, `eyleb`, `qowr` | the meaning of each setting |
| Decoy event names | `firefly`, `scarab`, `erifylf`, `resjupl` | the server protocol |
| **Self-defending** | `X.toString().search("(((.+)+)+)+$")` | Tampering. If the code is re-formatted (newlines added), this regex backtracks catastrophically and freezes the tab, so a beautified copy can't simply be run. |
| **Console hijack** | replaces `console.log/warn/info/error/exception/table/trace` with no-ops | debugging output |
| Everything on one line | 124 KB on line 31 of `tne.js` | readability |

Rows 1–6 and the two guards are standard features of the open-source `javascript-obfuscator` tool. The string tables and decoy names were added by the Chess Assist developers.

## My approach (fully static)

I **never executed** the obfuscated code: running unknown code is unsafe, and the self-defending guard would hang anyway. Everything was done with an AST pipeline I wrote, in [`tools/`](../tools):

1. **Split the bundle.** `tne.js` has three parts separated by `/*!` banners: Stockfish.js (lines 1–19), Socket.IO (21–26), and Chess Assist (31). Only the last is proprietary logic.
2. **Pass 1** ([`deob.js`](../tools/deob.js)): Babel parses each file. Arithmetic on numeric literals is folded, `![]` is simplified, `a['b']` becomes `a.b`, and the base64 images and sounds are moved out as placeholders.
3. **Reading.** I read the ~4,200 formatted lines of the content script end to end to work out what every variable and function does.
4. **Pass 2** ([`readable.js`](../tools/readable.js)):
   - removes the two guard blocks;
   - inlines the string tables (`OX`, `Oj`) and folds the string concatenations;
   - rewrites `a && b()`, `c ? d() : e()` and comma sequences into ordinary `if`/`else` blocks, and turns nested `else { if }` into `else if`;
   - collapses the `var X = {}; X.k = v; use(X)` pattern back into `use({ k: v })`;
   - renames using hand-written tables ([`tools/maps/`](../tools/maps)), with scope-aware renaming via Babel. It refuses any rename that would shadow another name;
   - attaches the explanatory comments.
5. Prettier formats the result, and `node --check` verifies that it parses.

Run `bash tools/build.sh` to regenerate `deobfuscated/` (`deobfuscated/`) from `extension/` (`extension/`).

## What was verified, and what is inferred

- **Verified directly from code:** all engine parameters, ELO→depth mapping, UCI commands, storage keys, socket event names and payload shapes, DOM selectors, timings, and the absence of `eval`/`fetch`/cookie access.
- **Inferred:** the server side (what it does with the data, and when it sends which flag) can only be seen from the client's point of view. The option ranges of the embedded Stockfish build are inferred from the popup sliders and the UCI option names it accepts.
