/**
 * Streaks: how many days in a row something was done, counting back from today.
 */
import { addDays } from './time.js';
import { habitStatus, isDayCounted } from './rules.js';

const MAX_LOOKBACK_DAYS = 400;

/**
 * Generic streak counter.
 * `evaluate(key)` returns true (done), false (missed) or null (neutral: skip the day).
 * Today is still in progress, so a "false" today does not break the streak.
 */
export function countStreak(todayKey, evaluate) {
  let count = 0;
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const result = evaluate(addDays(todayKey, -i));
    if (result === true) count += 1;
    else if (result === false && i > 0) break;
  }
  return count;
}

/** Days in a row with the minimum met. Sick days neither break nor extend the streak. */
export function minimumStreak(todayKey, days, settings) {
  return countStreak(todayKey, (key) => {
    const day = days[key];
    if (day?.mode === 'sick') return null;
    return isDayCounted(day, key, settings);
  });
}

export function habitStreak(habitId, todayKey, days, settings) {
  return countStreak(todayKey, (key) => habitStatus(habitId, key, days, settings));
}
