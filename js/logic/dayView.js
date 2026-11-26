/**
 * What the "Сегодня" screen shows in short form: which timeline blocks can fold away, which
 * task "✓ Готово" ticks, and the marks of the week strip. Pure functions, tested without a DOM.
 */
import { isSkipped } from './rules.js';
import { untimedOwnTasks } from './ownTasks.js';

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

/**
 * "Задач отмечено: 5 из 7, пропущено 1": routine tasks in the schedule (timed own tasks are
 * there too) plus own tasks without a time. Skipped ones are left out of the total.
 */
export function countDayTasks(schedule, day) {
  const ids = new Set(schedule.blocks.flatMap((block) => block.tasks.map((task) => task.id)));
  for (const task of untimedOwnTasks(day)) ids.add(task.id);
  const done = [...ids].filter((id) => day?.done?.[id] === true).length;
  const skipped = [...ids].filter((id) => isSkipped(day ?? {}, id)).length;
  return { done, total: ids.size - skipped, skipped };
}

/** The task "✓ Готово" ticks in this block: the first one not done or skipped, or null. */
export function nextOpenTask(block, day) {
  return block?.tasks.find((task) => !settled(day, task)) ?? null;
}

/**
 * One mark per day of a week, from buildWeekStats().days:
 * met ✓ · missed ✗ · sick · today (in progress) · empty (no record) · future · planned (a later
 * day with something planned, see ownTasks.hasPlan) · before (tracking started later).
 * `href` is where a tap goes: today → "Сегодня", any other day after tracking began → its own screen
 * (an earlier day to fix marks, a later one to plan it).
 * @param {Set<string>} plannedDates later days that have a plan
 */
export function weekStripDays(statsDays, plannedDates = new Set()) {
  return statsDays.map((day) => {
    let state;
    if (day.isFuture) state = plannedDates.has(day.date) ? 'planned' : 'future';
    else if (day.isBeforeStart) state = 'before';
    else if (day.mode === 'sick') state = 'sick';
    else if (day.minimum?.met) state = 'met';
    else if (day.isToday) state = 'today';
    else if (!day.hasRecord) state = 'empty';
    else state = 'missed';

    let href = null;
    if (day.isToday) href = '#today';
    else if (!day.isBeforeStart) href = `#day/${day.date}`;

    return { date: day.date, weekday: day.weekday, state, href };
  });
}
