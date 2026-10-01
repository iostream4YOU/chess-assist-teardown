# 4. Reading the board from four different websites

The extension never uses any site's API. It **scrapes the rendered HTML** of the board and move list and rebuilds the position as a [FEN](https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation) string. Each site is handled by a separate branch of `onTurnState()` (`deobfuscated/02-content-script.js`, line 3067) and its own polling loop.

Internally, sites are hidden behind code names:

| Code name (`site`) | Site | Polling loop | "My turn?" | "Board settled?" |
|---|---|---|---|---|
| `periwinkle` | lichess.org | `loopLichess` | `isMyTurnLichess` | `isBoardSettledLichess` |
| `marooner` | chess.com | `loopChessCom` | `isMyTurnChessCom` | `isBoardSettledChessCom` |
| `frolic` | chessarena.com | `loopChessArena` | `isMyTurnChessArena` | `isBoardSettledChessArena` |
| `beached` | immortal.game | `loopImmortal` | `isMyTurnImmortal` | `isBoardSettledImmortal` |

## Common idea

1. Find the board element and compute `squareSize = boardWidth / 8`.
2. Build `squareOffsets = [0, s, 2s, 3s, 4s, 5s, 6s, 7s]`.
3. For every piece element, get its **position** (a CSS `transform` or a class name) and its **identity** (class names such as `white knight` or `wn`).
4. Walk the 64 squares rank 8 → 1, file a → h, and emit FEN letters. Uppercase is White, lowercase is Black, and runs of empty squares become digits.
5. Append the side to move, worked out from the **parity of the move-list length** (even means White to move).
6. If you are playing Black the site draws the board upside down, so the placement string is **reversed**. That is a 180° rotation.

## lichess.org (chessground)

```html
<cg-board>
  <piece class="white rook" style="transform: translate(0px, 420px);"></piece>
  <piece class="ghost white rook" ...></piece>   <!-- drag preview: ignored -->
```

- Position: `translate(Xpx, Ypx)` matched against `squareOffsets`. Fractional square sizes are rounded with `toFixed(3)` / `toFixed(4)` plus a second, shortened candidate string, because the browser's printed pixel values vary.
- Orientation: `<coords class="... black">` exists when you are Black.
- Move list: the tag name of move entries comes **from the licence server** (`serverSelectors[0]`), not from the extension's code.
- Busy/idle: `.anim` means an animation is running. The last move entry must carry the server-provided "active" class (`serverSelectors[1]`), otherwise you're browsing history.
- Game over: `.outoftime`, `.rematch`, or a "New opponent" button.
- Castling: the SAN move texts are scanned (see below).

## chess.com

```html
<wc-chess-board class="board flipped">
  <div class="piece wp square-52"></div>    <!-- white pawn on file 5 (e), rank 2 -->
```

- Board tag: the first non-div element whose id contains "board", else `chess-board`.
- Position and identity come entirely from classes: `square-FR` gives file and rank digits, and the shortest class (`wp`, `bn`, …) gives colour + piece (`readChessComBoard` (`deobfuscated/02-content-script.js`, line 2909)).
- Orientation: the board has class `flipped`.
- Side to move: the count of `.node` move entries. In puzzles it's the colour of the sidebar status square.
- Game over: `.game-over-controls-topControls`, `.live-game-buttons-game-over`, Rematch buttons, theatre mode.
- It shows a one-time alert if the chess.com **Animation Type** setting isn't default, because other animation types break the reading.
- Puzzles (`/puzzles`) are supported (turn state 4). So is `/play/computer`.

## chessarena.com

```html
<cg-board>
  <piece data-cg-type="piece" class="wn ..." style="transform: translate(96px, 672px)">
```

- The board is treated as a fixed **768 px** grid (96 px squares), whatever its on-screen size.
- Side to move: the highest `#move_N_table` id. Odd means White to move.
- Castling rights are **never** sent (empty string). The engine will never suggest castling here.
- Refuses to run when browser zoom (`devicePixelRatio`) is above 125%.

## immortal.game

- Pieces are children of `div.relative.h-full.w-full.touch-none.select-none` positioned with `translate(X%, Y%)` in steps of 100%. The two last class names give piece and colour.
- Orientation: whether the first coordinate label in the board SVG is `h`.
- Castling rights: read from the move list's piece icons (rook or king, and whether the icon is "inverted", i.e. black).

## Castling rights: a heuristic

`completeFenAndAnalyse()` (`deobfuscated/02-content-script.js`, line 1472) starts from `KQkq` and removes rights while scanning the move list in order. Even indexes are White's moves and odd indexes are Black's.

| Move text | Effect |
|---|---|
| contains `o-o` (so `O-O-O` too), or starts with `k` | both rights removed for that side |
| starts with `rh`, `rg`, `rf` | king-side right removed |
| starts with `ra` … `rd` | queen-side right removed |

This is approximate. `Rf1` means a rook moved **to** f1, not from the h-file, yet it still removes the right. The engine may therefore occasionally think castling is illegal when it isn't.

## Things the FEN always lacks

- **En-passant square**: always `-`.
- **Half-move clock / full-move number**: omitted.
- Consequence: en-passant captures are never suggested, and the 50-move rule is invisible to the engine.
