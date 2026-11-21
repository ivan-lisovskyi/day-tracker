# Day Tracker

An offline-first PWA for keeping a daily routine and habits: a timeline of the day, a checklist, a "minimum of the day" that keeps streaks alive on bad days, and a weekly summary to paste into a chat with Claude for review.

Built for one real user (me) on iPhone: open in Safari → **Share → Add to Home Screen**. The UI is in Russian.

> **Status:** work in progress — stage 1, step 6 (offline support).

## Run locally

No build step and no dependencies:

```bash
npm start          # tiny Node static server: scripts/serve.mjs
```

It prints two addresses: `http://localhost:8000` for the Mac and `http://<Mac's IP>:8000` for an iPhone in the same Wi-Fi network. The dev server disables caching, so a reload always shows the latest code.

> The service worker is enabled only on HTTPS (GitHub Pages), so local edits always show up after a reload. To try offline mode on the Mac, open <http://localhost:8000/?sw>. Over `http://192.168.x.x` browsers do not allow service workers at all.

### Releasing a change

1. Bump `version` in `package.json` and `VERSION` in `sw.js` (a test checks they match).
2. New files must be added to `ASSETS` in `sw.js` (a test checks nothing is missing).
3. After the deploy, the installed app shows "Доступно обновление" → tap "Перезапустить".

## Tests

```bash
npm test           # node --test, no libraries
```

## Stack

- **Vanilla JavaScript (ES modules) + plain CSS**, no framework and no bundler — the code GitHub Pages serves is the code in this repo.
- **localStorage** behind a small store module, with export/import of a JSON backup.
- **Service worker** for offline use: every file is cached on install; a new version waits until you tap "Перезапустить".

## Roadmap

- [x] App shell: dark theme, tab bar, iOS home-screen meta tags, manifest, icons
- [x] Rules engine + tests (day boundary, driving lessons, workout carry-over, streaks)
- [x] "Today" screen
- [x] "Week" screen + text export
- [x] Settings + JSON backup
- [x] Offline support (service worker, update banner, persistent storage)
- [ ] Stage 2: "Adjust plan with AI" via a Cloudflare Worker proxy to the Claude API

## License

[MIT](LICENSE)
