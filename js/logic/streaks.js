/**
 * Streaks: how many days in a row something was done, counting back from today.
 *
 * One slip does not reset a streak: a single missed day is forgiven as long as there was no
 * other miss in the 7 days around it. A forgiven day keeps the streak alive but is not counted.
 */
import { addDays } from './time.js';
import { habitStatus, isDayCounted } from './rules.js';

const MAX_LOOKBACK_DAYS = 400;

/** Two misses closer than this many days apart break the streak ("one slip a week"). */
export const FORGIVE_WINDOW_DAYS = 7;

/**
 * Generic streak counter.
 * `evaluate(key)` returns true (done), false (missed) or null (neutral: skip the day).
 * Today is still in progress, so a "false" today does not break the streak.
 * @returns {{ count: number, forgiven: number }} done days in the streak, and misses forgiven inside it
 */
export function countStreak(todayKey, evaluate) {
  let count = 0;
  let forgiven = 0;
  let lastMiss = null; // days back to the latest miss we let through
  let unconfirmed = false; // that miss only counts as forgiven once an older done day follows it

  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const result = evaluate(addDays(todayKey, -i));
    if (result === true) {
      count += 1;
      if (unconfirmed) {
        forgiven += 1;
        unconfirmed = false;
      }
    } else if (result === false && i > 0) {
      if (unconfirmed || (lastMiss !== null && i - lastMiss < FORGIVE_WINDOW_DAYS)) break;
      lastMiss = i;
      unconfirmed = true;
    }
  }
  return { count, forgiven };
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
