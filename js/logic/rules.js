/**
 * Daily rules: minimum of the day, whether a day counts, workout carry-over,
 * the "late night → suggest minimum mode" hint and per-habit status.
 * Pure functions over (dayKey, days, settings).
 */
import { addDays, stampToDayMinutes, toDayMinutes, toMinutes } from './time.js';
import { isWorkoutDay } from './schedule.js';

export const DAY_MODES = ['normal', 'minimum', 'sick'];

/** Habits evaluated even in "sick" mode. */
const SLEEP_HABITS = new Set(['wake', 'bed', 'phone-away']);

/** How far back a missed workout can be traced (guards against endless recursion). */
const MAX_CARRY_DEPTH = 7;

// ---------- wake / bed ----------

export function wakeMinutes(day, dayKey) {
  return day?.wakeAt ? stampToDayMinutes(day.wakeAt, dayKey) : null;
}

export function bedMinutes(day, dayKey) {
  return day?.bedAt ? stampToDayMinutes(day.bedAt, dayKey) : null;
}

export function isWakeOnTime(day, dayKey, settings) {
  const minutes = wakeMinutes(day, dayKey);
  return minutes != null && minutes <= toMinutes(settings.wakeTarget) + settings.wakeToleranceMin;
}

export function isBedOnTime(day, dayKey, settings) {
  const minutes = bedMinutes(day, dayKey);
  return minutes != null && minutes <= toDayMinutes(settings.bedTarget, settings.dayBoundary);
}

// ---------- minimum of the day ----------

/**
 * Minimum = wake on time + 10 min of CBR + (1 job application OR 15 min of code).
 * Doing the full task (1 h of CBR, the code block) also satisfies the minimum part.
 */
export function minimumStatus(day, dayKey, settings) {
  const wake = isWakeOnTime(day, dayKey, settings);
  const cbr = Boolean(day?.minimum?.cbr10 || day?.done?.cbr);
  const work = (day?.applications ?? 0) >= 1 || Boolean(day?.minimum?.code15 || day?.done?.code);
  return { wake, cbr, work, met: wake && cbr && work };
}

/** A day counts when the minimum is met; a sick day always counts. */
export function isDayCounted(day, dayKey, settings) {
  if (!day) return false;
  if (day.mode === 'sick') return true;
  return minimumStatus(day, dayKey, settings).met;
}

// ---------- workout carry-over ----------

/** Is a kettlebell workout planned for this day (regular day or carried over)? */
export function isWorkoutPlanned(dayKey, days, settings, depth = 0) {
  return isWorkoutDay(dayKey, settings) || hasPendingWorkout(dayKey, days, settings, depth);
}

/**
 * A workout planned yesterday but not done moves to today. It never stacks: there is
 * at most one pending workout, and on a regular workout day it simply merges in.
 * Nothing is carried over from a sick day or from a day with no record (app not opened).
 */
export function hasPendingWorkout(dayKey, days, settings, depth = 0) {
  if (depth >= MAX_CARRY_DEPTH) return false;
  const prevKey = addDays(dayKey, -1);
  const prev = days[prevKey];
  if (!prev || prev.mode === 'sick') return false;
  if (!isWorkoutPlanned(prevKey, days, settings, depth + 1)) return false;
  return !prev.done?.workout;
}

// ---------- late night → suggest "minimum" ----------

/** Yesterday's bedtime was later than the threshold and today is still a normal day. */
export function shouldSuggestMinimum(dayKey, days, settings) {
  const today = days[dayKey];
  if (today?.mode && today.mode !== 'normal') return false;
  if (today?.minimumSuggestionDismissed) return false;

  const prevKey = addDays(dayKey, -1);
  const bed = bedMinutes(days[prevKey], prevKey);
  return bed != null && bed > toDayMinutes(settings.lateBedThreshold, settings.dayBoundary);
}

// ---------- habits ----------

/** All trackable habits: wake/bed plus every task in the template and the workout variants. */
export function listHabits(settings) {
  const habits = [
    { id: 'wake', title: `Подъём до ${addMinutesLabel(settings.wakeTarget, settings.wakeToleranceMin)}` },
    { id: 'bed', title: `Отбой до ${settings.bedTarget}` },
    { id: 'workout', title: settings.workout.title },
    { id: 'stretch', title: settings.workout.restTitle },
  ];
  for (const block of settings.blocks) {
    for (const task of block.tasks ?? []) {
      if (!habits.some((h) => h.id === task.id)) habits.push({ id: task.id, title: task.title });
    }
  }
  return habits;
}

/**
 * true = done, false = missed, null = not applicable that day (doesn't break a streak).
 * - sick days: only sleep habits are evaluated;
 * - minimum days: undone non-sleep habits are neutral;
 * - workout/stretch: only on the days they are planned.
 */
export function habitStatus(habitId, dayKey, days, settings) {
  const day = days[dayKey];

  if (habitId === 'workout' && !isWorkoutPlanned(dayKey, days, settings)) return null;
  if (habitId === 'stretch' && isWorkoutPlanned(dayKey, days, settings)) return null;
  if (!day) return false;

  const isSleep = SLEEP_HABITS.has(habitId);
  if (day.mode === 'sick' && !isSleep) return null;

  let done;
  if (habitId === 'wake') done = isWakeOnTime(day, dayKey, settings);
  else if (habitId === 'bed') done = isBedOnTime(day, dayKey, settings);
  else done = day.done?.[habitId] === true;

  if (!done && day.mode === 'minimum' && !isSleep) return null;
  return done;
}

function addMinutesLabel(hhmm, add) {
  const total = toMinutes(hhmm) + add;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
