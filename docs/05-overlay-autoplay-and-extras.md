# 5. Drawing the suggestion, autoplay, and the extra features

## The overlay canvas

`drawOverlay()` (`deobfuscated/02-content-script.js`, line 2355):

1. **Host element.** The first time, it picks an element of the board and attaches a **closed shadow root** to it (`createClosedShadowRoot` (`deobfuscated/02-content-script.js`, line 2343)):
   ```js
   shadowRoot = host.attachShadow({ mode: "closed" });
   shadowRoot.innerHTML = "<slot></slot>";   // keeps the host's own children visible
   ```
   On lichess and chess.com the host is **chosen at random** among the elements matching a selector sent by the licence server. It must be visible and have at least one class. A closed shadow root is invisible to the page's own JavaScript (`host.shadowRoot === null`, and `querySelector` can't reach inside). This is an anti-detection measure: the site can't easily find the arrow in its DOM.
2. **Canvas.** It creates `<canvas>` with `width = height = squareSize * 8` and `position: fixed` at the board's `getBoundingClientRect()`. It uses `z-index: 9998` and `pointer-events: none`, so clicks go through to the board.
3. **Look.** Opacity comes from the popup (`fopitu`, default 75 %). The CSS filter is `drop-shadow(0 0 1px black) hue-rotate(step × 45°)`, where the step is the `lgrt_value` colour theme.
4. **Arrow** (`drawArrow` (`deobfuscated/02-content-script.js`, line 2426)): a line from the centre of the from-square to the centre of the to-square. Its width is `s / 2.75 / 2.75` (≈ 13 % of a square). The arrowhead is two strokes of length `s / 2.75` at ±36° (π/5).
5. **Square mode** (`hnb_save`): instead of an arrow, a rounded ring on the **from** square only, which is less conspicuous ("move this piece").
6. Everything is removed by `clearOverlay()` (`deobfuscated/02-content-script.js`, line 1299) when the position, window size, scroll position or square size changes.

### Arrow colours

| Situation | Colour |
|---|---|
| ENGINE (default) | `rgb(128,0,0)` dark red |
| NEURAL | `rgb(204,204,0)` yellow |
| FUSION | `rgb(255,255,0)` bright yellow |
| HUMAN 1…8 | sienna, rosy brown, dark cyan, salmon, orange, plum, dark purple, sea green |
| STYLE 1…5 | light blue, dodger blue, forest green, firebrick, magenta-red |
| SUGGESTION MODE | `rgb(72,61,139)`, 3 arrows at 115 % / 75 % / 35 % of the opacity setting |
| Opponent's predicted move | `rgb(204,85,0)` orange |
| ADVANCED / fun modes | random hue each time (fun modes use a hue range per pattern) |

### Threats (`jobas_value`)

It asks Stockfish for legal moves twice: once for you, and once with the side to move flipped in the FEN to get the opponent's moves. Then it draws:
- **blue squares**: your pieces that an opponent move can land on (pieces under attack),
- **red squares**: opponent pieces that one of your moves can land on (pieces you can take).

## Autoplay

Enabled with the AUTO button or hotkey (storage `function_atpl`). What happens:

1. The content script sends `"lga-datas-atch"`, and the background worker attaches `chrome.debugger` to the tab. Chrome shows its "started debugging this browser" warning bar. Closing that bar detaches the debugger, which turns autoplay off.
2. After an arrow is drawn, `autoplayTick` polls every 99 ms, or 297 ms in HUMAN/STYLE/FUSION/ADVANCED. It waits until `canAutoMoveNow()` (`deobfuscated/02-content-script.js`, line 1268) is true: it's your turn, nothing is animating, and you're not dragging.
3. It picks **one of the drawn arrows at random**. There's one normally, and several in fun modes.
4. It waits a random delay (`scheduleAutoMove` (`deobfuscated/02-content-script.js`, line 2711)): `delay = min + random() × span`.

   | Speed (`value_atpl`) | min (ms) | span (ms) | Resulting delay |
   |---|---|---|---|
   | 1 (slowest) | 8019 | 16038 | 8.0 – 24.1 s |
   | 2 | 2673 | 5346 | 2.7 – 8.0 s |
   | 3 | 891 | 2673 | 0.9 – 3.6 s |
   | 4 | 297 | 891 | 0.3 – 1.2 s |
   | 5 | 99 | 297 | 0.1 – 0.4 s |
   | 6 (fastest, also the default if never set) | 33 | 99 | 0.03 – 0.13 s |

   The randomised delay exists to avoid a constant, bot-like move time.
5. It clicks through the background worker (`dispatchMouse` (`deobfuscated/02-content-script.js`, line 2329)): press/release on the from-square, then 6 ms later press/release on the to-square. For promotions (a 5-character UCI move like `e7e8q`) it clicks the to-square again 500 ms later, which picks the first option in the site's promotion menu (the queen).
6. When the game ends, autoplay switches itself off. For premium accounts, `bonh` remembers to switch it back on when the next game starts.

**Auto new game** (premium, `value_nEw_ar`): after a game ends, it looks for buttons whose text contains "new", "rematch", "launch", "choose" or "play" and clicks them. That queues the next game without the user.

## Voice mode (`lgms_value`)

It speaks the move with the Web Speech API (`SpeechSynthesisUtterance`, rate 0.7), e.g. "g1 to f3". While voice is on, the arrow opacity is set to **0**, so the move is only heard, not seen. It's available in ENGINE and NEURAL mode.

## Evaluation breakdown

When the position changes, Stockfish's `eval` command is also sent. Its classical evaluation table (Material, Imbalance, Initiative, Pawns, Knights, Bishops, Rooks, Queens, Mobility, King safety, Threats, Passed, Space, Total) is parsed. The "Total" column of each row is stored in `epap_value` for the popup.

## Floating panel (`lgep_value`)

`spawnFloatingPanel()` (`deobfuscated/02-content-script.js`, line 1216) embeds the popup page itself (`chrome.runtime.getURL("assets/edn.html")`) into the chess site as a 276×276 `<object>`, inside the same closed shadow root. It has a draggable handle, so all controls are available without opening the toolbar popup.

## Hotkeys (`value_ckbx`, premium)

`bindHotkeys()` (`deobfuscated/02-content-script.js`, line 675) assigns `document.onkeyup` on the chess page. The default codes (`fwyes_save`) can be rebound in the popup:

| Key | Action |
|---|---|
| Space | hide / show arrows |
| Q / W / E / R / T | ENGINE / HUMAN / NEURAL / STYLE / FUSION |
| D | toggle arrow ↔ square highlight |
| A | toggle autoplay |
| 1 / 2 | ELO or level down / up |
| 3 / 4 | autoplay slower / faster |
