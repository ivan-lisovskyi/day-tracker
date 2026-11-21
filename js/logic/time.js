/**
 * Time and date helpers. Pure functions, no DOM.
 *
 * Conventions used across the app:
 * - Time of day is a string "HH:MM".
 * - A day is identified by a date key "YYYY-MM-DD".
 * - "Day minutes" are minutes since midnight of that day's date. Times before the
 *   day boundary (default 05:00) belong to the *previous* day and get +1440,
 *   so 01:00 after a long evening is 1500, not 60.
 * - A moment (wake-up, bedtime) is stored as a local stamp "YYYY-MM-DDTHH:MM".
 *
 * Calendar arithmetic on date keys is done in UTC so DST changes never shift a day.
 */

export const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86_400_000;

const pad2 = (n) => String(n).padStart(2, '0');

/** "09:30" → 570 */
export function toMinutes(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!match) throw new RangeError(`Invalid time: "${hhmm}"`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Invalid time: "${hhmm}"`);
  return hours * 60 + minutes;
}

/** 570 → "09:30"; 1500 → "01:00" (wraps past midnight) */
export function formatMinutes(minutes) {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Time of day → day minutes, respecting the day boundary ("01:00" → 1500). */
export function toDayMinutes(hhmm, boundary = '05:00') {
  const minutes = toMinutes(hhmm);
  return minutes < toMinutes(boundary) ? minutes + MINUTES_PER_DAY : minutes;
}

// ---------- Date keys ----------

function keyToUtc(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`Invalid date key: "${key}"`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function utcToKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(key, n) {
  return utcToKey(keyToUtc(key) + n * MS_PER_DAY);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / MS_PER_DAY);
}

/** ISO weekday: 1 = Monday … 7 = Sunday */
export function isoWeekday(key) {
  const day = new Date(keyToUtc(key)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week containing `key`. */
export function weekStart(key) {
  return addDays(key, 1 - isoWeekday(key));
}

export function weekKeys(mondayKey) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayKey, i));
}

// ---------- Local wall clock (Date objects) ----------

export function localDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Date → "YYYY-MM-DDTHH:MM" in local time. */
export function toStamp(date) {
  return `${localDateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function parseStamp(stamp) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(stamp));
  if (!match) throw new RangeError(`Invalid stamp: "${stamp}"`);
  return { key: match[1], minutes: toMinutes(match[2]) };
}

/** A stamp expressed in day minutes of `dayKey` (bed at 01:20 next day → 1520). */
export function stampToDayMinutes(stamp, dayKey) {
  const { key, minutes } = parseStamp(stamp);
  return daysBetween(dayKey, key) * MINUTES_PER_DAY + minutes;
}

/** Which tracked day a moment belongs to: before the boundary it is still "yesterday". */
export function dayKeyFor(date, boundary = '05:00') {
  const key = localDateKey(date);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes < toMinutes(boundary) ? addDays(key, -1) : key;
}

/** Current moment in day minutes of the day returned by dayKeyFor(). */
export function nowDayMinutes(date, boundary = '05:00') {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes < toMinutes(boundary) ? minutes + MINUTES_PER_DAY : minutes;
}
