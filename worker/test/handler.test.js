import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { PlanError } from '../src/errors.js';
import { buildUserMessage, MAX_PROPOSALS, SYSTEM_PROMPT, TARGETS } from '../src/prompt.js';

const ORIGIN = 'https://ivan-lisovskyi.github.io';
const CODE = 'test-access-code-0123456789';
const PLAN = { review: 'Неделя прошла ровно.', proposals: [], model: 'fake', usage: { inputTokens: 1, outputTokens: 1 } };

/** A KV namespace stand-in: get/put on a Map. */
function fakeKv(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, get: async (key) => map.get(key) ?? null, put: async (key, value) => { map.set(key, value); } };
}

function setup({ env = {}, askClaude } = {}) {
  const calls = [];
  const handle = createHandler({
    askClaude: askClaude ?? (async (input) => { calls.push(input); return PLAN; }),
    now: () => new Date('2026-11-23T10:00:00Z'),
  });
  const fullEnv = { ALLOWED_ORIGINS: ORIGIN, ACCESS_CODE: CODE, DAILY_LIMIT: '2', LIMITS: fakeKv(), ...env };
  return { handle, env: fullEnv, calls };
}

function post(body, { origin = ORIGIN, code = CODE, path = '/plan' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (code) headers.Authorization = `Bearer ${code}`;
  return new Request(`https://worker.example${path}`, {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALID = { stats: { version: 4 }, plan: { wakeTarget: '09:00' } };

test('a valid request reaches the model and the plan comes back with CORS headers', async () => {
  const { handle, env, calls } = setup();
  const response = await handle(post(VALID), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), PLAN);
  assert.deepEqual(calls, [VALID]);
});

test('a request from another site is refused before the model is called', async () => {
  const { handle, env, calls } = setup();
  const response = await handle(post(VALID, { origin: 'https://evil.example' }), env);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await response.json()).error, 'origin');
  assert.equal(calls.length, 0);

  const noOrigin = await handle(post(VALID, { origin: null }), env); // curl without an Origin header
  assert.equal(noOrigin.status, 403);
});

test('a wrong or missing access code is refused and does not use up the daily limit', async () => {
  const { handle, env, calls } = setup();
  const wrong = await handle(post(VALID, { code: 'wrong-code-wrong-code-wrong' }), env);
  const missing = await handle(post(VALID, { code: null }), env);

  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, 'access_code');
  assert.equal(missing.status, 401);
  assert.equal(calls.length, 0);
  assert.equal(env.LIMITS.map.size, 0);
});

test('a worker without an access code or a counter is closed, not open', async () => {
  const noCode = setup({ env: { ACCESS_CODE: undefined } });
  assert.equal((await noCode.handle(post(VALID, { code: 'anything-anything-anything' }), noCode.env)).status, 500);

  const shortCode = setup({ env: { ACCESS_CODE: 'short' } });
  assert.equal((await shortCode.handle(post(VALID, { code: 'short' }), shortCode.env)).status, 500);

  const noKv = setup({ env: { LIMITS: undefined } });
  const response = await noKv.handle(post(VALID), noKv.env);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'not_configured');
  assert.equal(noKv.calls.length, 0);
});

test('the daily limit stops further requests for that day', async () => {
  const { handle, env, calls } = setup(); // DAILY_LIMIT = 2
  assert.equal((await handle(post(VALID), env)).status, 200);
  assert.equal((await handle(post(VALID), env)).status, 200);

  const third = await handle(post(VALID), env);
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error, 'daily_limit');
  assert.equal(calls.length, 2);
  assert.equal(env.LIMITS.map.get('count:2026-11-23'), '2');
});

test('malformed and oversized bodies are rejected', async () => {
  const { handle, env, calls } = setup({ env: { DAILY_LIMIT: '100' } });
  assert.equal((await handle(post('not json'), env)).status, 400);
  assert.equal((await handle(post({ stats: {} }), env)).status, 400);
  assert.equal((await handle(post({ stats: [], plan: {} }), env)).status, 400);
  assert.equal((await handle(post({ stats: { note: 'я'.repeat(40_000) }, plan: {} }), env)).status, 413);
  assert.equal(calls.length, 0);
});

test('preflight, health check and unknown paths', async () => {
  const { handle, env } = setup();
  const preflight = await handle(new Request('https://worker.example/plan', {
    method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
  }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /authorization/);

  const badPreflight = await handle(new Request('https://worker.example/plan', {
    method: 'OPTIONS', headers: { Origin: 'https://evil.example' },
  }), env);
  assert.equal(badPreflight.status, 403);

  const health = await handle(new Request('https://worker.example/'), env);
  assert.deepEqual(await health.json(), { ok: true, service: 'day-tracker-ai' });

  assert.equal((await handle(post(VALID, { path: '/other' }), env)).status, 404);
});

test('model errors keep their status and message; unexpected ones become a plain 500', async () => {
  const known = setup({ askClaude: async () => { throw new PlanError(503, 'busy', 'Попробуй через минуту.'); } });
  const busy = await known.handle(post(VALID), known.env);
  assert.equal(busy.status, 503);
  assert.deepEqual(await busy.json(), { error: 'busy', message: 'Попробуй через минуту.' });
  assert.equal(busy.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const unknown = setup({ askClaude: async () => { throw new Error('secret detail'); } });
  const crashed = await unknown.handle(post(VALID), unknown.env);
  assert.equal(crashed.status, 500);
  assert.equal(JSON.stringify(await crashed.json()).includes('secret detail'), false);
});

test('the prompt names every target and carries the data as tagged JSON', () => {
  for (const target of TARGETS) assert.ok(SYSTEM_PROMPT.includes(`"${target}"`), target);
  assert.ok(SYSTEM_PROMPT.includes(`at most ${MAX_PROPOSALS} proposals`));

  const message = buildUserMessage({ totals: { minimumMet: 3 } }, { wakeTarget: '09:00' });
  assert.ok(message.includes('<week_stats>\n{"totals":{"minimumMet":3}}\n</week_stats>'));
  assert.ok(message.includes('<plan>\n{"wakeTarget":"09:00"}\n</plan>'));
});
