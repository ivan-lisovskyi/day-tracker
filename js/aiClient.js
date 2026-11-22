/**
 * Talks to the worker (worker/ in this repo) that holds the Claude API key.
 * The app never sees the key: it sends the week's stats and the current plan, and gets back
 * a review and proposals.
 */
import { getAiConfig } from './state/aiConfig.js';

const TIMEOUT_MS = 60_000;

/** "https://x.workers.dev/" → "https://x.workers.dev"; null unless it is https (or a local http address). */
export function normalizeEndpoint(value) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) return null;
  return text;
}

/**
 * @returns {Promise<{ review: string, proposals: object[], model?: string }>}
 * @throws {Error} with a message in Russian that can be shown as is
 */
export async function requestPlan({ stats, plan }, { fetch: fetchImpl = fetch, config = getAiConfig() } = {}) {
  const endpoint = normalizeEndpoint(config.endpoint);
  if (!endpoint || !config.accessCode) {
    throw new Error('Сначала укажи адрес сервера и код доступа в настройках.');
  }

  let response;
  try {
    response = await fetchImpl(`${endpoint}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.accessCode}` },
      body: JSON.stringify({ stats, plan }),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined, // iOS < 16 has none
    });
  } catch (error) {
    throw new Error(error?.name === 'TimeoutError'
      ? 'Сервер ИИ не ответил за минуту. Попробуй ещё раз.'
      : 'Нет связи с сервером ИИ. Проверь интернет и адрес сервера в настройках.');
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: handled below as an unexpected reply.
  }

  if (!response.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : `Сервер ИИ ответил ошибкой ${response.status}.`);
  }
  if (typeof body?.review !== 'string' || !Array.isArray(body.proposals)) {
    throw new Error('Сервер ИИ прислал ответ в неожиданном формате.');
  }
  return body;
}
