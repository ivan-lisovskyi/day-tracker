/**
 * The one call to the Claude API. The response is constrained to the Plan schema
 * (structured outputs), so it always parses; the app still validates every proposal.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { PlanError } from './errors.js';
import { buildUserMessage, SYSTEM_PROMPT, TARGETS } from './prompt.js';

export const MODEL = 'claude-haiku-5-5';

// Thinking is on by default on this model and counts towards max_tokens: leave room for it.
const MAX_TOKENS = 8000;

const Proposal = z.object({
  target: z.enum(TARGETS),
  blockId: z.string().nullable(),
  value: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  reason: z.string(),
});

const Plan = z.object({
  review: z.string(),
  proposals: z.array(Proposal),
});

export async function askClaude({ stats, plan }, env) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(stats, plan) }],
      output_config: { effort: 'medium', format: zodOutputFormat(Plan) },
    });
  } catch (error) {
    throw toPlanError(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new PlanError(502, 'refused', 'Модель отказалась разбирать эту неделю. Попробуй ещё раз позже.');
  }
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new PlanError(502, 'incomplete', 'Ответ модели оборвался. Попробуй ещё раз.');
  }

  return {
    review: response.parsed_output.review,
    proposals: response.parsed_output.proposals,
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}

/** Most specific first: what the user can act on differs between these cases. */
function toPlanError(error) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new PlanError(500, 'server_key', 'На сервере неверный ключ Claude API. Проверь секрет ANTHROPIC_API_KEY.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new PlanError(503, 'busy', 'Claude API сейчас ограничивает запросы. Попробуй через минуту.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    // Includes "credit balance is too low": the message from the API says which it is.
    return new PlanError(502, 'rejected', `Claude API не принял запрос: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new PlanError(502, 'unreachable', 'Сервер не смог связаться с Claude API. Попробуй ещё раз.');
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ? ` ${error.status}` : '';
    return new PlanError(502, 'upstream', `Claude API ответил ошибкой${status}. Попробуй позже.`);
  }
  return error;
}
