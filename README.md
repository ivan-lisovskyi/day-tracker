# Day Tracker

An offline-first PWA for keeping a daily routine and habits: a timeline of the day, a checklist, a "minimum of the day" that keeps streaks alive on bad days, and a weekly summary to paste into a chat with Claude for review.

**Live app:** <https://ivan-lisovskyi.github.io/day-tracker/>

Built for one real user (me) on iPhone. The UI is in Russian. All data stays on the device (localStorage). The only thing that ever leaves it is the optional AI review: when you tap "Подстроить план с ИИ", that week's summary (including notes and check-ins) goes to your own Cloudflare Worker and from there to the Claude API.

> **Status:** stage 1 is feature-complete and deployed on GitHub Pages. Stage 2 (AI plan adjustment) is built: the app side is live, the worker is deployed separately (see [worker/README.md](worker/README.md)).

## Install on iPhone

1. Open the live app link in **Safari**. You can start tracking without configuring a server or an API key.
2. **Share → Add to Home Screen → Add**.
3. Open it from the new icon. It runs full-screen and works offline; updates arrive as "Доступно обновление" → "Перезапустить".

The Home Screen app keeps its own data, separate from Safari tabs. To move data between devices, use Settings → Backup (save a JSON file, then restore it on the other device).

## Run locally

No build step and no dependencies:

```bash
npm start          # tiny Node static server: scripts/serve.mjs
```

It prints the addresses to open: `http://localhost:8000` on the Mac and `http://<name>.local:8000` on an iPhone in the same Wi-Fi network (the `.local` name stays the same when the Mac's IP changes). The dev server disables caching, so a reload always shows the latest code.

> The service worker is enabled only on HTTPS, so local edits always show up after a reload. To try offline mode on the Mac, open <http://localhost:8000/?sw>. Over plain `http://` on a phone browsers do not allow service workers at all.

### Using it on an iPhone without hosting

1. macOS firewall: allow incoming connections for `node` (System Settings → Network → Firewall → Options), otherwise the phone cannot reach the server.
2. Run `npm start`, open the printed `http://<name>.local:8000` in Safari → Share → **Add to Home Screen**.
3. Limits of this mode: the Mac must be on and in the same Wi-Fi, there is no offline mode, and copying to the clipboard falls back to a manual-copy box. Data lives on the phone and is tied to the exact address — keep using the same one.

### Hosting (HTTPS, offline mode)

The live app is served by **GitHub Pages** straight from the root of `main` — every push deploys automatically (`.nojekyll` makes Pages serve the files as they are).

For other static hosts, `npm run build` copies only the app files into `dist/` (point the host at `dist/`, e.g. Cloudflare Pages).

### Releasing a change

1. Bump `version` in `package.json` and `VERSION` in `sw.js` (a test checks they match).
2. New files must be added to `ASSETS` in `sw.js` (a test checks nothing is missing).
3. After the deploy, the installed app shows "Доступно обновление" → tap "Перезапустить". Settings → "О приложении" shows the installed version and has a "Проверить обновление" button.

## Tests

```bash
npm test           # node --test, no libraries
```

## AI review ("Подстроить план с ИИ")

On the Week screen the app sends the week's statistics and the current plan to a small Cloudflare Worker ([worker/](worker/)), which calls Claude (`claude-haiku-5-5`) and returns a short review plus up to four proposals: a goal time, the weekly applications goal, workouts per week, or the time of one routine block.

- The API key lives only in the worker. The app holds the worker address and a personal access code (Settings → "ИИ-помощник"); they are stored outside the main data, so they never end up in a backup file.
- The model only proposes. `js/logic/aiPlan.js` checks every proposal against the current plan (ranges, order of the day, no overlapping blocks) before it is shown and again before it is applied; each one is applied only on "Принять", and "Вернуть как было" undoes them.
- The worker accepts requests only from the published app, only with the access code, and only up to a daily limit.

## Stack

- **Vanilla JavaScript (ES modules) + plain CSS**, no framework and no bundler — the code the browser runs is the code in this repo.
- **localStorage** behind a small store module, with export/import of a JSON backup.
- **Service worker** for offline use: every file is cached on install; a new version waits until you tap "Перезапустить".

## Roadmap

- [x] App shell: dark theme, tab bar, iOS home-screen meta tags, manifest, icons
- [x] Rules engine + tests (day boundary, driving lessons, workout carry-over, streaks)
- [x] "Today" screen
- [x] "Week" screen + text export
- [x] Open an earlier day from "Week" to see and fix its marks
- [x] One-handed "Today": "Сейчас" bar above the tabs with "✓ Готово", finished blocks fold away, "Отменить" after a mark, week strip; one-row habits table
- [x] Settings + JSON backup
- [x] Offline support (service worker, update banner, persistent storage)
- [x] "Сейчас" card: the current block with time left, its checkboxes and what comes next
- [x] Morning check-in (sleep and energy 1–5); a low rating suggests minimum mode
- [x] Evening "close the day": review, a note, and tomorrow's mode, driving lesson and one main thing
- [x] Skip instead of fail: a task can be skipped for the day without breaking its streak
- [x] Forgiven slip: one missed day in 7 does not reset a streak
- [x] Workout goal "N times a week" on any days, as an alternative to fixed weekdays
- [x] Stage 2: "Adjust plan with AI" — a Cloudflare Worker keeps the Claude API key and returns a review of the week with plan proposals that are accepted one by one (and can be undone)

## License

[MIT](LICENSE)
