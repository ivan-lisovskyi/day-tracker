/**
 * Cloudflare Worker entry point: wires the HTTP handler to the real Claude call.
 *
 * Secrets (set with `wrangler secret put`, never committed): ANTHROPIC_API_KEY, ACCESS_CODE.
 * For local runs `.dev.vars` can set MOCK_CLAUDE=1 to answer with a canned plan, so the app
 * can be developed without an API key. That variable must never be set in production.
 */
import { askClaude, MODEL } from './claude.js';
import { createHandler } from './handler.js';

const MOCK_PLAN = {
  review: 'Это тестовый ответ локального сервера: настоящий Claude не вызывался. '
    + 'Подъём в среднем позже цели, код сделан реже, чем запланировано.',
  proposals: [
    { target: 'wakeTarget', blockId: null, value: '09:30', start: null, end: null,
      reason: 'Тестовое предложение: в большинстве дней подъём был после 09:30.' },
    { target: 'weeklyApplicationsGoal', blockId: null, value: '3', start: null, end: null,
      reason: 'Тестовое предложение: откликов за неделю было меньше цели.' },
    { target: 'block', blockId: 'code', value: null, start: '13:30', end: '15:00',
      reason: 'Тестовое предложение: блок кода короче — проще начать.' },
    { target: 'block', blockId: 'no-such-block', value: null, start: '10:00', end: '11:00',
      reason: 'Некорректное предложение: приложение должно его отбросить.' },
  ],
};

const handle = createHandler({
  askClaude: (input, env) => (env.MOCK_CLAUDE === '1'
    ? { ...MOCK_PLAN, model: `${MODEL} (mock)`, usage: { inputTokens: 0, outputTokens: 0 } }
    : askClaude(input, env)),
});

export default { fetch: handle };
