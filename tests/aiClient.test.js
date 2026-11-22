import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEndpoint, requestPlan } from '../js/aiClient.js';

const config = { endpoint: 'https://ai.example.workers.dev/', accessCode: 'code-code-code-code' };
const reply = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('the endpoint must be https (http only for a local server)', () => {
  assert.equal(normalizeEndpoint(' https://ai.example.workers.dev/ '), 'https://ai.example.workers.dev');
  assert.equal(normalizeEndpoint('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(normalizeEndpoint('http://ai.example.com'), null);
  assert.equal(normalizeEndpoint('ai.example.com'), null);
  assert.equal(normalizeEndpoint(''), null);
});

test('a request carries the access code and returns the plan', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ review: 'Ок', proposals: [] }), { status: 200 });
  };
  const plan = await requestPlan({ stats: { a: 1 }, plan: { b: 2 } }, { fetch, config });

  assert.deepEqual(plan, { review: 'Ок', proposals: [] });
  assert.equal(calls[0].url, 'https://ai.example.workers.dev/plan');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer code-code-code-code');
  assert.deepEqual(JSON.parse(calls[0].options.body), { stats: { a: 1 }, plan: { b: 2 } });
});

test('errors become messages that can be shown as is', async () => {
  const input = { stats: {}, plan: {} };
  await assert.rejects(requestPlan(input, { fetch: reply(200, {}), config: { endpoint: '', accessCode: '' } }), /настройках/);
  await assert.rejects(requestPlan(input, { fetch: reply(401, { error: 'access_code', message: 'Неверный код доступа.' }), config }),
    /Неверный код доступа/);
  await assert.rejects(requestPlan(input, { fetch: reply(502, '<html>Bad gateway</html>'), config }), /ошибкой 502/);
  await assert.rejects(requestPlan(input, { fetch: reply(200, { review: 5 }), config }), /неожиданном формате/);
  await assert.rejects(requestPlan(input, { fetch: async () => { throw new TypeError('Failed to fetch'); }, config }), /Нет связи/);
  await assert.rejects(requestPlan(input, {
    fetch: async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }, config,
  }), /не ответил/);
});

test('works on browsers without AbortSignal.timeout (iOS before 16)', async () => {
  const original = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const fetch = async (_url, options) => {
      assert.equal(options.signal, undefined);
      return new Response(JSON.stringify({ review: 'Ок', proposals: [] }), { status: 200 });
    };
    assert.equal((await requestPlan({ stats: {}, plan: {} }, { fetch, config })).review, 'Ок');
  } finally {
    AbortSignal.timeout = original;
  }
});
