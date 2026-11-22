# day-tracker-ai (Cloudflare Worker)

The server side of "Подстроить план с ИИ". It keeps the Claude API key, so the key is never in the app or in this repository.

```
app (GitHub Pages)  ──POST /plan { stats, plan }──▶  worker  ──▶  Claude API (claude-haiku-5-5)
                    ◀── { review, proposals } ─────
```

- `stats` is the week statistics object (`js/logic/weekStats.js`), `plan` is the part of the settings the model may change (`js/logic/aiPlan.js`).
- The reply is constrained to a JSON schema (structured outputs). The app validates every proposal again before showing it, and nothing changes until the user taps "Принять".
- The worker stores nothing and logs no request bodies.

## Who can call it

The app and this code are public, so the worker has three locks:

1. **Origin** — only `ALLOWED_ORIGINS` (the published app) may call it.
2. **Access code** — every request carries a personal code (`ACCESS_CODE` secret). Without the secret the worker refuses everything.
3. **Daily limit** — at most `DAILY_LIMIT` accepted requests per UTC day (a counter in the `LIMITS` KV namespace).

Set a monthly spend limit for the API key in the Anthropic Console as well: it is the last line of defence.

## Deploy

One-time setup (needs a free Cloudflare account and a Claude API key):

```bash
cd worker
npm install
npx wrangler login                          # opens the browser
npx wrangler kv namespace create LIMITS     # copy the printed id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key when asked; it is not echoed
openssl rand -hex 16 | tee /dev/tty | npx wrangler secret put ACCESS_CODE   # prints the new code once: copy it to the phone
npx wrangler deploy                         # prints https://day-tracker-ai.<you>.workers.dev
```

Then in the app: **Настройки → ИИ-помощник** — the worker address and the access code.

Later releases are just `npx wrangler deploy`.

## Run locally (no API key needed)

```bash
cp .dev.vars.example .dev.vars   # test values; MOCK_CLAUDE=1 answers with a canned plan
npm run dev -- --port 8787
```

In the local app (`npm start` in the repo root) set the address to `http://localhost:8787` and the access code from `.dev.vars`.

To call the real model locally, add `ANTHROPIC_API_KEY=…` to `.dev.vars` (never committed) and remove `MOCK_CLAUDE`.

## Tests

```bash
npm test    # node --test: the HTTP handler with a fake model call and a fake KV
```

## Changing the model

`MODEL` in `src/claude.js`. One review is a few thousand tokens in and about a thousand out: roughly a tenth of a cent on Claude Haiku 5.5, a couple of cents on Claude Sonnet 5.5.
