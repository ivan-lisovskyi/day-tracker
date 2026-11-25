/**
 * What the "Сегодня" screen shows in short form: which timeline blocks can fold away, which
 * task "✓ Готово" ticks, and the marks of the week strip. Pure functions, tested without a DOM.
 */
import { isSkipped } from './rules.js';

const settled = (day, task) => day?.done?.[task.id] === true || isSkipped(day ?? {}, task.id);

/**
 * Blocks that are over and need nothing more: they ended (or the whole day is in the past) and
 * every task in them is done or skipped. A past block with an open task stays in view, so it
 * can still be ticked.
 * @param {{ block: object, tasks: object[] }[]} items  timeline rows with the tasks each one shows
 * @returns {Set<string>} block ids
 */
export function finishedBlockIds(items, day, nowMinutes, past) {
  const ids = new Set();
  for (const { block, tasks } of items) {
    const ended = past || block.end <= nowMinutes;
    if (ended && tasks.every((task) => settled(day, task))) ids.add(block.id);
  }
  return ids;
}

/** The task "✓ Готово" ticks in this block: the first one not done or skipped, or null. */
export function nextOpenTask(block, day) {
  return block?.tasks.find((task) => !settled(day, task)) ?? null;
}

/**
 * One mark per day of a week, from buildWeekStats().days:
 * met ✓ · missed ✗ · sick · today (in progress) · empty (no record) · future · before (tracking).
 * `href` is where a tap goes: today → "Сегодня", an earlier tracked day → its own screen.
 */
export function weekStripDays(statsDays) {
  return statsDays.map((day) => {
    let state;
    if (day.isFuture) state = 'future';
    else if (day.isBeforeStart) state = 'before';
    else if (day.mode === 'sick') state = 'sick';
    else if (day.minimum?.met) state = 'met';
    else if (day.isToday) state = 'today';
    else if (!day.hasRecord) state = 'empty';
    else state = 'missed';

    let href = null;
    if (day.isToday) href = '#today';
    else if (!day.isFuture && !day.isBeforeStart) href = `#day/${day.date}`;

    return { date: day.date, weekday: day.weekday, state, href };
  });
}
