# 6. The popup and the storage "message bus"

## How the popup is built

`03-popup.js` (`deobfuscated/03-popup.js`) builds a fixed 276 × 276 px UI entirely with `document.createElement` and inline `style` properties. `layoutPopup()` (`deobfuscated/03-popup.js`, line 2869) positions each element absolutely. There's no framework and almost no CSS. `ain.css` only loads the font and styles the sliders and scrollbars. Every button plays one of two embedded click sounds.

Main areas:
- **Header logo** (opens chessassist.net) and **HIDE / move / score** row: the move and score are mirrored from the content script.
- **ELO row**: `<<` `<` `[1900 ELO]` `>` `>>`. Clicking the label toggles **SUGGESTION MODE**.
- **Mode buttons**: ENGINE, HUMAN (8 levels), NEURAL, STYLE (SCARED … RUTHLESS), FUSION.
- **AUTO** (autoplay) with 6 speed buttons; volume, voice, floating panel, and square-highlight toggles.
- **ADVANCED MODE** panel with DEPTH / SCORN (contempt) / SKILL / ERROR / DEVIATE sliders, plus IMPORT/EXPORT.
- **Fun mode** panel (12 pattern buttons), the eval breakdown, and the 3 suggestion lines.
- **LOGIN / REGISTER** form (username, password, confirm) and the account page (Free / Premium).

On open, the popup writes `update_function = "get"`. The content script answers by publishing every current value. `waitForContentScript()` (`deobfuscated/03-popup.js`, line 3542) then keeps the UI disabled until the content script reports an active board.

## The bus: every `chrome.storage.local` key

The popup and the content script communicate **only** through these keys. Writing a key triggers `chrome.storage.onChanged` on the other side (content-script listener (`deobfuscated/02-content-script.js`, line 351)).

### Popup → content script (commands and settings)

| Key | Values | Meaning |
|---|---|---|
| `leri_function` | `SUB` `ADD` `MIN` `MAX` | change ELO index (persisted as `save_seeker`, 0–11) |
| `mode_function` | `HUNT` `HUMN` `NURL` `STYK` `HBRY` | switch mode (persisted as `mode_save`) |
| `value_humn` | `"1"`…`"8"` | HUMAN level (persisted as `val_save`) |
| `value_styk` | `"1"`…`"5"` | STYLE level (persisted as `val_saveyk`) |
| `elos_function` | `sugg` | toggle SUGGESTION MODE (persisted as `subway_save`) |
| `show_function` | `shhd` | toggle HIDE |
| `function_atpl` | bool | autoplay on/off |
| `value_atpl` | `"1"`…`"6"` | autoplay speed (1 = slowest) |
| `value_nEw_ar` | bool | auto-start next game (premium) |
| `lgms_value` | bool | voice mode |
| `lgep_value` | bool | floating panel in page |
| `hnb_save` | bool | square ring instead of arrow |
| `fopitu` | 0–100 | overlay opacity % |
| `lgrt_value` | int | colour theme (hue-rotate step × 45°) |
| `jobas_value` | bool | show threatened squares |
| `trafl_value` | bool | show opponent's predicted move |
| `lab_vel` | bool | ADVANCED MODE on/off |
| `eyleb` | `[depth, contempt, skill, error, probability]` | ADVANCED sliders |
| `value_lgrd` | 0–12 | fun mode (0 = off) |
| `value_ckbx` | bool | hotkeys enabled |
| `fwyes_save` | 12 `KeyboardEvent.code`s | hotkey bindings |
| `lgvl_value` | 0/1 | popup click-sound volume |
| `update_function` | `get` | "please publish your state" |
| `qowr` | `[token, [user, pass, confirm, "l"/"r"]]` | **login / register**, forwarded to the server |
| `qowa`, `qowm`, `qowl`, `qowf` | – | account info, manage membership, logout, refresh |

### Content script → popup (results and state)

| Key | Example | Meaning |
|---|---|---|
| `nEw_mv_value` | `"g1f3"` | best move |
| `nEw_sc_value` | `"+0.34"`, `"MATE IN 3"` | score from your side's perspective |
| `value_nEw_el` | `"1900 ELO"`, `"SUGGESTION MODE"` | label on the ELO button |
| `nEw_sh_value` | `"HIDE"`/`"SHOW"` | label of the hide button |
| `state_function` | `YES` / `EH` / `NO` | your move (or puzzle) / opponent's move or idle / game over |
| `lines_value` | `["+0.34\|g1f3,b8c6,...", ...]` | suggestion lines (score \| principal variation) |
| `epap_value` | `[labels, values]` | eval breakdown |
| `value_lgav` | `[0,1,2,...]` | which fun modes are possible now |
| `turij_va` | `["1640 ELO", token]` | opponent rating detected in FUSION mode |
| `gfgr`, `gfga`, `gfgm`, `gfgf`, `dfgd` | `[token, payload]` | login result, account info, URL to open, logout, premium flag |
| `ioeu` | string | auth token returned by the server |
| `zzqp` | string | last seen extension version |
| `hdrzwf`, `jhopp` | bool | one-time warnings already shown |
| `bonh` | bool | re-enable autoplay in the next game |

The `[randomToken(), payload]` wrapping on the account keys makes sure every write is a *change*, so `onChanged` fires even if the payload is the same as last time.
