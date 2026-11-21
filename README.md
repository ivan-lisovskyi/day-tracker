# Day Tracker

An offline-first PWA for keeping a daily routine and habits: a timeline of the day, a checklist, a "minimum of the day" that keeps streaks alive on bad days, and a weekly summary to paste into a chat with Claude for review.

Built for one real user (me) on iPhone: open in Safari → **Share → Add to Home Screen**. The UI is in Russian.

> **Status:** work in progress — stage 1, step 1 (app shell).

## Run locally

No build step and no dependencies. Any static server works:

```bash
npm start          # same as: python3 -m http.server 8000
```

Open <http://localhost:8000>. To try it on an iPhone in the same Wi-Fi network, find the Mac's IP with `ipconfig getifaddr en0` and open `http://<that-ip>:8000` in Safari.

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
- [ ] Rules engine + tests (day boundary, driving lessons, workout carry-over, streaks)
- [ ] "Today" screen
- [ ] "Week" screen + text export
- [ ] Settings + JSON backup
- [ ] Offline support
- [ ] Stage 2: "Adjust plan with AI" via a Cloudflare Worker proxy to the Claude API

## License

[MIT](LICENSE)
