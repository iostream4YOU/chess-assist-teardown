# Notice

## What's mine and what isn't

| Path | Author | Licence |
|---|---|---|
| `tools/`, `docs/`, `README.md` | iostream4YOU | [MIT](LICENSE) |
| `deobfuscated/` (generated locally, not included) | names, comments and restructuring by iostream4YOU; underlying program logic by chessassist.net | not redistributed |
| `extension/` (not included) | Chess Assist v28.5, chessassist.net | proprietary; supply your own copy to reproduce |
| Stockfish.js (in `extension/assets/tne.js`, lines 1–19) | nmrugg / Stockfish authors | GNU GPL, see `extension/assets/licenses/` |
| Socket.IO client 4.7.2 (in `tne.js`, lines 21–26) | Guillermo Rauch & contributors | MIT, see `extension/assets/licenses/` |

Neither the analysed extension nor the readable source derived from it is redistributed here. Only my tools, maps and write-ups are published.

## Fair play

Engine assistance (arrows, suggestions, voice hints, autoplay) in games against other people violates the fair-play policies of lichess.org, chess.com, chessarena.com and immortal.game, and gets accounts closed. This project documents how such a tool works; it isn't meant for use in real games.

## If you have this extension installed

See [docs/07-licence-server-and-privacy.md](docs/07-licence-server-and-privacy.md):
- it holds the `debugger` permission;
- it reports your chess-site username and game URLs to a raw-IP server;
- it stores the account password in plain text.
