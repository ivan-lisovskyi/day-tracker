# Day Tracker

An offline-first PWA for keeping a daily routine and habits: a timeline of the day, a checklist, a "minimum of the day" that keeps streaks alive on bad days, and a weekly summary to paste into a chat with Claude for review.

Built for one real user (me) on iPhone: open in Safari → **Share → Add to Home Screen**. The UI is in Russian.

> **Status:** work in progress — stage 1, step 4 ("Week" screen).

## Run locally

No build step and no dependencies:

```bash
npm start          # tiny Node static server: scripts/serve.mjs
```

It prints two addresses: `http://localhost:8000` for the Mac and `http://<Mac's IP>:8000` for an iPhone in the same Wi-Fi network. The dev server disables caching, so a reload always shows the latest code.

> Offline mode (service worker) only works over HTTPS, so it is tested on GitHub Pages, not over the local network.

## Tests

```bash
npm test           # node --test, no libraries
```

## Stack

- **Vanilla JavaScript (ES modules) + plain CSS**, no framework and no bundler — the code GitHub Pages serves is the code in this repo.
- **localStorage** behind a small store module, with export/import of a JSON backup.
- **Service worker** for offline use (planned).

## Roadmap

- [x] App shell: dark theme, tab bar, iOS home-screen meta tags, manifest, icons
- [x] Rules engine + tests (day boundary, driving lessons, workout carry-over, streaks)
- [x] "Today" screen
- [x] "Week" screen + text export
- [ ] Settings + JSON backup
- [ ] Offline support
- [ ] Stage 2: "Adjust plan with AI" via a Cloudflare Worker proxy to the Claude API

## License

[MIT](LICENSE)
