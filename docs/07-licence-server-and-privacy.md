# 7. The licence server, and what it means for your privacy and security

## The server

```js
socket = io.connect("wss://162.248.93.34:45494", { transports: ["websocket"], auth: { ntko: "blink" } });
```

- It's a **raw IP address**, not a domain, on a non-standard port, over Socket.IO 4 using websockets.
- A new connection is opened every time you open a new game or puzzle URL (`connectToServer` (`deobfuscated/02-content-script.js`, line 963)).
- The event names are deliberately meaningless: `jscbsh`, `vcnk`, `gregha`, `scarab`, `firefly`, `erifylf`, `resjupl`, `bjiwrji`, `islisw`.

## Protocol (as seen from the client)

| Direction | Event | Payload | Effect |
|---|---|---|---|
| → server | `jscbsh` | `[token, "", "", "a"]` on connect | auto-login with the saved token |
| → server | `jscbsh` | `[username, password, confirm, "l" \| "r"]` | login / register from the popup form |
| → server | `jscbsh` | `[token, "", "", "i" \| "m"]` | account info / manage membership |
| ← server | `vcnk` | `(ok, token, isPremium)` | stores `ioeu` (token) and premium flag. If not premium, turns off autoplay, auto-requeue, hotkeys, threats and advanced mode |
| → server | `scarab` | `[siteCode, siteUsername, pageURL, siteCode \| verifiedUsername]` | sent right after every successful login (see below) |
| ← server | `firefly` | `(2, selectors)` | the CSS/tag names used to read lichess and chess.com → `selectorsReady` |
| ← server | `erifylf` | `(1, base64Flag, version)` | **kill switch**: `"dg6"` enables, `"85b"` disables. Starts the board loop and shows a "new version" prompt |
| ← server | `resjupl` | `(3, base64("tPOl"))` | unlocks STYLE/FUSION switching, fun modes, threats, advanced mode |
| ← server | `bjiwrji` | `("cilo", "WFa")` | unlocks STYLE levels, threats and hotkeys |
| ← server | `gregha` | `(true, info)` | account info for the popup (name, created time, free/premium) |
| ← server | `islisw` | `(true, url)` | a URL the popup opens in a new tab ("manage membership") |
| ← server | `disconnect` / `connect_error` | – | clears the overlay and logs out in the UI |

## What this means

1. **The extension is remotely controlled.** Nothing happens until the server sends `firefly` + `erifylf`. The site selectors aren't even in the code. The vendor can switch the extension off for everyone, or for one account, at any time, and it stops working the day the server goes away.
2. **Premium is enforced only by flags the server sends** (`isPremium`, `tPOl`, `WFa`). The client simply trusts them.
3. **It reports which games you play.** After login, the `scarab` message carries:
   - your **username on the chess site**, scraped from the page (lichess `body[data-user]`; chess.com `.user-tagline-username`, cross-checked with `#notifications-request[username]`),
   - the **full URL** of the game or puzzle you opened,
   - the site code.
   This links your Chess Assist account to your lichess/chess.com identity and your game history.
4. **Your Chess Assist password is stored in plain text.** The login form writes `[username, password, confirm]` into `chrome.storage.local` under `qowr`, and nothing ever clears it. Any code with access to the extension's storage can read it. If you reused that password anywhere, change it.
5. **The `debugger` permission** gives DevTools-level control over the tab while attached. This version only uses it for `Input.dispatchMouseEvent`, but it's the most powerful permission an extension can request.
6. **Server-supplied text and URLs are trusted as-is.** The account name is inserted with `innerHTML`, and `islisw` URLs are opened without validation. Extension-page CSP blocks inline scripts, which limits the damage, but it's still poor hygiene.

## What was *not* found

A static search of all three scripts found:
- no `eval`, `new Function`, dynamically created `<script>`, or `importScripts`, so the server **cannot push code** to run. Server data is only used as flags, CSS selectors, text and a URL;
- no `fetch` / `XMLHttpRequest`, no `document.cookie`, and no access to the page's `localStorage` or `sessionStorage`;
- no `tabs`, `cookies`, `history`, `webRequest` or `scripting` APIs. Only `storage`, `runtime` and `debugger` are used.

These findings apply to **this copy (v28.5)**. The vendor controls the server and future updates, so this can change.

## Detection and fair play

Some design choices exist specifically to avoid detection by chess sites:
- the overlay lives in a **closed shadow root** on a randomly chosen board element;
- moves are clicked with **trusted CDP input events**, after **random delays**;
- `web_accessible_resources` uses `use_dynamic_url`, so a page can't probe a fixed extension URL;
- the code is obfuscated and silences `console` output.

None of this changes the move statistics that sites actually analyse. As shown in [03-elo-levels-and-modes.md](03-elo-levels-and-modes.md), the default "ELO" setting still plays full-strength engine moves at a reduced depth. Using this or any engine assistance in games against people breaks the fair-play rules of lichess, chess.com and the other supported sites, and gets accounts closed.
