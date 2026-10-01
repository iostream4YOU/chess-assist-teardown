# 3. What "ELO" really means, and every engine mode

Everything here comes from `completeFenAndAnalyse()` (`deobfuscated/02-content-script.js`, line 1472). That function turns the popup settings into the five Stockfish options passed to `analysePosition(settings, fen, depth)` (`deobfuscated/02-content-script.js`, line 1423):

```text
settings = [ Contempt, MultiPV, Skill Level, Skill Level Maximum Error, Skill Level Probability ]
```

## The five Stockfish knobs, in plain words

| Option | Range | Effect |
|---|---|---|
| **depth** (`go depth N`) | 1–15 here | How many half-moves (plies) ahead the engine searches. Deeper is stronger and slower. |
| **Contempt** | −100 … 100 | Positive: the engine treats a draw as bad for itself and plays on and takes risks. Negative: it's happy to simplify and draw. |
| **MultiPV** | 1 or 3 | How many best lines to report. 3 is used for Suggestion mode. |
| **Skill Level** | 0 … 20 | 20 is full strength. Below 20, Stockfish searches several candidate moves and then **deliberately picks a worse one**, with some randomness. |
| **Skill Level Maximum Error** | 0 … 5000 | Only matters when Skill < 20. Caps how bad the deliberately chosen move may be. |
| **Skill Level Probability** | 1 … 1000 | Only matters when Skill < 20. How often the engine deviates from its best move. |

The ranges above are the limits of the Stockfish.js build's UCI options. The popup's ADVANCED sliders use exactly these ranges.

Three more options are always set the same way: `Move Overhead 0`, `Minimum Thinking Time 0`, `Slow Mover 10`. These are time-management settings. They don't matter because the search always ends on a fixed depth.

---

## ENGINE mode (`HUNT`): the "ELO" slider

```js
var ELO_LEVELS = [525, 800, 1075, 1350, 1625, 1900, 2175, 2450, 2725, 3000, 3275, 3550];
...
analysePosition(["11", "1", "20", "0", "1"], fen, eloIndex + 1);
```

| Popup shows | `eloIndex` | Search depth | Skill Level | Contempt |
|---|---|---|---|---|
| 525 ELO  | 0  | **1**  | 20 | 11 |
| 800 ELO  | 1  | **2**  | 20 | 11 |
| 1075 ELO | 2  | **3**  | 20 | 11 |
| 1350 ELO | 3  | **4**  | 20 | 11 |
| 1625 ELO | 4  | **5**  | 20 | 11 |
| 1900 ELO | 5  | **6**  | 20 | 11 |
| 2175 ELO | 6  | **7**  | 20 | 11 |
| 2450 ELO | 7  | **8**  | 20 | 11 |
| 2725 ELO | 8  | **9**  | 20 | 11 |
| 3000 ELO | 9  | **10** | 20 | 11 |
| 3275 ELO | 10 | **11** | 20 | 11 |
| 3550 ELO | 11 | **12** | 20 | 11 |

**Key finding:** the ELO numbers are only labels, evenly spaced 275 apart. The engine always runs at **full skill (20)**, and the *only* thing the ELO changes is the **search depth, `eloIndex + 1`**. Nothing in the code measures, calibrates or targets a rating.

A shallow search at full skill still plays the locally best move it can see: it doesn't make human-style mistakes. It just misses deeper tactics. The label is stored as `save_seeker` and changed with the `<` `>` `<<` `>>` buttons (`stepEloLevel` (`deobfuscated/02-content-script.js`, line 1862)). The ELO wraps around from 3550 to 525.

## NEURAL mode (`NURL`)

```js
analysePosition(["99", "1", "20", "111", "111"], fen, eloIndex + 1);
```

This is the same depth-from-ELO mapping as ENGINE, but with **Contempt 99**, the most draw-averse, aggressive setting. The Error/Probability values have no effect because Skill is 20. Despite the name, there is no neural network: it's the same Stockfish.js build.

## HUMAN mode (`HUMN`): 8 levels

This is the only mode that weakens the engine the way Stockfish intends, with Skill < 20 plus random error. The depth is fixed at 8.

| Level | Contempt | Skill | Max error | Probability | Depth |
|---|---|---|---|---|---|
| 1 | −99 | 1  | 999 | 11  | 8 |
| 2 | −66 | 3  | 666 | 33  | 8 |
| 3 | −33 | 6  | 333 | 66  | 8 |
| 4 | −11 | 9  | 111 | 99  | 8 |
| 5 | 11  | 12 | 99  | 111 | 8 |
| 6 | 33  | 15 | 66  | 333 | 8 |
| 7 | 66  | 18 | 33  | 666 | 8 |
| 8 | 99  | 20 | 11  | 999 | 8 |

Low levels mean low skill, a large allowed error and passive contempt. High levels mean full skill and aggressive contempt. (At level 8 Skill is 20, so the error settings are ignored.)

## STYLE mode (`STYK`): 5 personalities

The depth is fixed at 8 and Skill at 19, so there's a little randomness. The only thing that varies is attitude.

| Level | Popup label | Contempt | Skill | Max error | Probability |
|---|---|---|---|---|---|
| 1 | SCARED   | −100 | 19 | 125 | 25  |
| 2 | DEFENSE  | −50  | 19 | 100 | 50  |
| 3 | BALANCED | 0    | 19 | 75  | 75  |
| 4 | ATTACK   | 50   | 19 | 50  | 100 |
| 5 | RUTHLESS | 100  | 19 | 25  | 125 |

Switching to STYLE (or FUSION) only works after the licence server has sent its unlock flags (`engineExtrasUnlock`, `extrasUnlock`). See [07-licence-server-and-privacy.md](07-licence-server-and-privacy.md).

## FUSION mode (`HBRY`): match the opponent

It reads the **opponent's** rating from the page. The opponent is the player shown at the top: lichess `<rating>`, chess.com `.user-tagline-rating`, chessarena `GameLayoutOpponentInfo`, immortal `.text-xs.leading-none`. Then it picks a bracket:

| Opponent rating | Contempt | Skill | Max error | Probability | Depth |
|---|---|---|---|---|---|
| ≤ 800   | 96  | 1  | 900 | 75  | 1  |
| ≤ 1000  | 80  | 2  | 825 | 150 | 2  |
| ≤ 1200  | 64  | 3  | 750 | 225 | 2  |
| ≤ 1400  | 48  | 4  | 675 | 300 | 3  |
| ≤ 1600  | 32  | 5  | 600 | 375 | 4  |
| ≤ 1800  | 16  | 6  | 525 | 450 | 5  |
| ≤ 2000  | −16 | 7  | 450 | 525 | 6  |
| ≤ 2200  | −32 | 8  | 375 | 600 | 6  |
| ≤ 2400  | −48 | 9  | 300 | 675 | 7  |
| ≤ 2600  | −64 | 10 | 225 | 750 | 8  |
| ≤ 2800  | −80 | 11 | 150 | 825 | 9  |
| > 2800  | −96 | 12 | 75  | 900 | 10 |
| not found ("DYNAMIC") | 0 | 15 | 100 | 100 | 8 |

Interesting detail: contempt goes **down** as the opponent gets stronger. Against strong players the engine is steered towards safe, drawish play, and against weak players towards aggression. The detected rating is shown in the popup (storage key `turij_va`). This mode is premium only.

## Other analysis modes

| Situation | Settings | Depth | Notes |
|---|---|---|---|
| **Opponent's turn** (`isOpponentTurn`) | `[66, 1, 20, 0, 1]` | 8 | Predicts the opponent's reply. Drawn in orange only if "show opponent move" is on. |
| **SUGGESTION MODE** (`suggestionMode`) | `[33, 3, 20, 0, 1]` | 8 | MultiPV 3: three arrows at 115% / 75% / 35% opacity, plus 3 lines with scores in the popup. |
| **ADVANCED MODE** (`advancedMode`) | user sliders `[contempt, 1, skill, error, probability]` | 1–15 slider | Stored as `eyleb`. It warns once about lag above "100%", which is depth 12. Importable/exportable as `Config.chessassist`: the array base64-encoded 12 times. |

## "Fun" modes: not engine moves at all

When a fun mode is selected (`setFunMode` (`deobfuscated/02-content-script.js`, line 1342), storage `value_lgrd` 1–12), the extension doesn't ask for `go depth`. It sends Stockfish's `d` command, which prints `Legal uci moves: e2e4 d2d4 ...`, and highlights **every legal move matching a geometric pattern**. With autoplay, one of them is played at random.

| # | Popup id | Pattern (helper in `engine.onmessage`) |
|---|---|---|
| 1 | random | any legal move |
| 2 | knight | `isKnightMove`: file Δ=2 and rank Δ=1, or the reverse |
| 3 | retreat | `isRetreatMove`: towards your own back rank |
| 4 | charge | `isAdvanceMove`: towards the enemy |
| 5 | left | `isQueensideMove`: starts on the left half from your view (files a–d as White, e–h as Black) |
| 6 | right | `isKingsideMove`: starts on the right half from your view |
| 7 | edge | `isEdgeFileMove`: from the a- or h-file |
| 8 | diagonal | `isDiagonalMove`: file Δ = rank Δ |
| 9 | leap | retreats if any exist, otherwise advances from the rearmost rank |
| 10 | sacrifice | advances that land furthest into enemy territory |
| 11 | slow | moves whose destination is the least advanced |
| 12 | opening | `isDevelopingMove`: from ranks 1–2 to ranks ≤ 4 (mirrored for Black) |

The patterns are purely geometric on the UCI string (e.g. `"g1f3"`). They know nothing about piece types except through the move shape. The popup greys out patterns with no legal move in the current position (storage `value_lgav`).
