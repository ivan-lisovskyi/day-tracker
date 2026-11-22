/**
 * Which screen a URL hash opens. Pure, so it is tested without a browser.
 *
 *   #today, #week, #settings  → that tab
 *   #day/2026-11-21           → an earlier day, to look back and fix its marks
 * Anything else, and a "day" that is today or in the future, opens "Сегодня".
 */
const TABS = ['today', 'week', 'settings'];
const DAY_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** @returns {{ name: string, dayKey?: string }} */
export function parseRoute(hash, todayKey) {
  const [name, param] = String(hash ?? '').replace(/^#/, '').split('/');
  if (name === 'day') {
    return isRealDay(param) && param < todayKey ? { name: 'day', dayKey: param } : { name: 'today' };
  }
  return { name: TABS.includes(name) ? name : 'today' };
}

/** "2026-02-30" matches the pattern but is not a date. */
function isRealDay(key) {
  if (!DAY_KEY.test(key ?? '')) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
