/**
 * Own tasks: things added to one particular day on top of the routine ("Сходить в банк", "Банк 14:00").
 * Stored in the day record as `ownTasks: [{ id, title, time }]`; their marks live in `done` and
 * `skipped` like any routine task. Functions that change a day mutate the draft given by
 * store.updateDay(), so they fit straight into its mutator.
 */
import { toDayMinutes } from './time.js';

export const OWN_TITLE_MAX = 80;

/** "own-…": never the same as a routine task id. */
export function newOwnTaskId(now = Date.now(), random = Math.random) {
  return `own-${now.toString(36)}${random().toString(36).slice(2, 6)}`;
}

const cleanTitle = (title) => String(title ?? '').trim().slice(0, OWN_TITLE_MAX);

/** Adds a task; a blank title adds nothing and returns null. An empty time means "no time". */
export function addOwnTask(day, { title, time = null }, id) {
  const text = cleanTitle(title);
  if (!text) return null;
  const task = { id, title: text, time: time || null };
  (day.ownTasks ??= []).push(task);
  return task;
}

/** Changes the title and/or time; a blank title keeps the old one, time "" removes the time. */
export function updateOwnTask(day, id, { title, time }) {
  const task = day.ownTasks?.find((t) => t.id === id);
  if (!task) return;
  if (title !== undefined && cleanTitle(title)) task.title = cleanTitle(title);
  if (time !== undefined) task.time = time || null;
}

/**
 * Removes a task together with its marks. Returns what restoreOwnTask() needs to undo it, or null.
 */
export function removeOwnTask(day, id) {
  const index = day.ownTasks?.findIndex((t) => t.id === id) ?? -1;
  if (index < 0) return null;
  const [task] = day.ownTasks.splice(index, 1);
  const removed = { task, index, done: day.done?.[id] === true, skipped: day.skipped?.[id] === true };
  if (day.done) delete day.done[id];
  if (day.skipped) delete day.skipped[id];
  return removed;
}

export function restoreOwnTask(day, { task, index, done, skipped }) {
  (day.ownTasks ??= []).splice(index, 0, task);
  if (done) (day.done ??= {})[task.id] = true;
  if (skipped) (day.skipped ??= {})[task.id] = true;
}

/** Tasks with a time, in the order of the day (00:30 at night comes after the evening). */
export function timedOwnTasks(day, boundary) {
  return (day?.ownTasks ?? [])
    .filter((t) => t.time)
    .sort((a, b) => toDayMinutes(a.time, boundary) - toDayMinutes(b.time, boundary));
}

export function untimedOwnTasks(day) {
  return (day?.ownTasks ?? []).filter((t) => !t.time);
}

/** Something is planned for this day: own tasks, the main thing, a driving lesson or "минимум". */
export function hasPlan(day) {
  return Boolean(day && (day.ownTasks?.length || day.focus || day.drivingLesson || day.mode === 'minimum'));
}
