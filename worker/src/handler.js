/**
 * The HTTP side of the worker: who may call it, how often and with what. No Claude SDK in
 * here: the model call is injected (`askClaude`), so this file is tested with plain node.
 *
 * POST /plan  { stats, plan }  →  { review, proposals, model, usage }
 *
 * Three locks, because the app and this code are public:
 *   1. the Origin must be on the allow-list (ALLOWED_ORIGINS);
 *   2. the request must carry the personal access code (Authorization: Bearer …, ACCESS_CODE);
 *   3. at most DAILY_LIMIT accepted requests per UTC day (counter in the LIMITS KV namespace).
 * Nothing from the request is stored or logged.
 */
import { PlanError } from './errors.js';

const MAX_BODY_BYTES = 64 * 1024;
const MIN_ACCESS_CODE_LENGTH = 16;
const DEFAULT_DAILY_LIMIT = 20;
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

export function createHandler({ askClaude, now = () => new Date() }) {
  return async function handle(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    try {
      if (request.method === 'OPTIONS') {
        if (!cors) throw new PlanError(403, 'origin', 'Этот сайт не может обращаться к серверу.');
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method === 'GET' && url.pathname === '/') {
        return json(200, { ok: true, service: 'day-tracker-ai' }, cors);
      }
      if (request.method !== 'POST' || url.pathname !== '/plan') {
        throw new PlanError(404, 'not_found', 'Такого адреса нет.');
      }

      if (!cors) throw new PlanError(403, 'origin', 'Этот сайт не может обращаться к серверу.');
      await checkAccessCode(request, env);
      await checkDailyLimit(env, now());
      const input = await readInput(request);

      return json(200, await askClaude(input, env), cors);
    } catch (error) {
      if (error instanceof PlanError) return json(error.status, { error: error.code, message: error.message }, cors);
      console.error('Unexpected error', error?.name, error?.message); // never the request body
      return json(500, { error: 'internal', message: 'На сервере что-то сломалось. Попробуй позже.' }, cors);
    }
  };
}

// ---------- lock 1: origin ----------

/** CORS headers for an allowed origin, or null. Without them a browser will not show the reply. */
function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ---------- lock 2: access code ----------

async function checkAccessCode(request, env) {
  const expected = env.ACCESS_CODE;
  if (typeof expected !== 'string' || expected.length < MIN_ACCESS_CODE_LENGTH) {
    // Fail closed: a worker deployed without the secret must not be open to everyone.
    throw new PlanError(500, 'not_configured', 'На сервере не задан код доступа (секрет ACCESS_CODE).');
  }
  const header = request.headers.get('Authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!(await sameText(given, expected))) {
    throw new PlanError(401, 'access_code', 'Неверный код доступа. Проверь его в настройках приложения.');
  }
}

/** Compares two strings without leaking, through timing, how much of the code was right. */
async function sameText(a, b) {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const left = new Uint8Array(x);
  const right = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

// ---------- lock 3: daily limit ----------

/**
 * A counter per UTC day. Read-then-write is not atomic, so two simultaneous requests may be
 * counted as one; for a personal cap that only guards the bill this is accurate enough.
 */
async function checkDailyLimit(env, date) {
  if (!env.LIMITS) throw new PlanError(500, 'not_configured', 'На сервере не подключён счётчик запросов (KV LIMITS).');
  const limit = Number.parseInt(env.DAILY_LIMIT, 10) || DEFAULT_DAILY_LIMIT;
  const key = `count:${date.toISOString().slice(0, 10)}`;
  const used = Number.parseInt(await env.LIMITS.get(key), 10) || 0;
  if (used >= limit) {
    throw new PlanError(429, 'daily_limit', `На сегодня лимит запросов исчерпан (${limit} в сутки). Попробуй завтра.`);
  }
  await env.LIMITS.put(key, String(used + 1), { expirationTtl: COUNTER_TTL_SECONDS });
}

// ---------- input ----------

async function readInput(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new PlanError(413, 'too_large', 'Слишком большой запрос.');
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new PlanError(400, 'bad_request', 'Запрос должен быть в формате JSON.');
  }
  if (!isPlainObject(body) || !isPlainObject(body.stats) || !isPlainObject(body.plan)) {
    throw new PlanError(400, 'bad_request', 'В запросе нужны поля stats и plan.');
  }
  return { stats: body.stats, plan: body.plan };
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function json(status, body, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cors ?? {}) },
  });
}
