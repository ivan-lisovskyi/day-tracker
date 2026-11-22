/**
 * Settings and state of "Подстроить план с ИИ" that live outside the main data:
 * - the server address and the personal access code (kept out of the JSON backup on purpose:
 *   a backup file may be shared, the access code must not be);
 * - the last review with its proposals, so closing the app mid-review does not lose it.
 */
const CONFIG_KEY = 'day-tracker:ai';
const SESSION_KEY = 'day-tracker:ai-plan';

/** Filled in once the worker is deployed; until then the address is typed in Settings. */
export const DEFAULT_ENDPOINT = '';

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return typeof value === 'object' && value !== null ? value : null;
  } catch {
    return null; // storage blocked or the value is not JSON
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the feature still works for this session.
  }
}

/** @returns {{ endpoint: string, accessCode: string }} */
export function getAiConfig() {
  const saved = read(CONFIG_KEY) ?? {};
  return {
    endpoint: typeof saved.endpoint === 'string' && saved.endpoint ? saved.endpoint : DEFAULT_ENDPOINT,
    accessCode: typeof saved.accessCode === 'string' ? saved.accessCode : '',
  };
}

export function setAiConfig(patch) {
  write(CONFIG_KEY, { ...getAiConfig(), ...patch });
}

export const isAiConfigured = () => {
  const { endpoint, accessCode } = getAiConfig();
  return Boolean(endpoint && accessCode);
};

/** The saved review: { weekStart, review, model, proposals: [{ …, status, undo? }] }, or null. */
export function loadPlanSession() {
  const session = read(SESSION_KEY);
  return session && typeof session.weekStart === 'string' && Array.isArray(session.proposals) ? session : null;
}

export function savePlanSession(session) {
  write(SESSION_KEY, session);
}
