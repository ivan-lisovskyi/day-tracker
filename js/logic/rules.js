/**
 * Daily rules: minimum of the day, whether a day counts, workout carry-over,
 * the "late night → suggest minimum mode" hint and per-habit status.
 * Pure functions over (dayKey, days, settings).
 */
import { addDays, formatMinutes, localDateKey, stampToDayMinutes, toDayMinutes, toMinutes } from './time.js';
import { isWorkoutDay } from './schedule.js';

export const DAY_MODES = ['normal', 'minimum', 'sick'];

/** How far back a missed workout can be traced (guards against endless recursion). */
const MAX_CARRY_DEPTH = 7;

/** A bedtime earlier than this is "after midnight", i.e. it belongs to the previous day. */
const NOON = 12 * 60;

/** Habits evaluated even in "sick" mode: wake, bed and every task of a sleep block. */
function sleepHabitIds(settings) {
  const ids = new Set(['wake', 'bed']);
  for (const block of settings.blocks) {
    if (block.kind === 'sleep') for (const task of block.tasks ?? []) ids.add(task.id);
  }
  return ids;
}

// ---------- recording wake / bed ----------

/** A wake time typed for a day is on that day's calendar date ("04:50" stays on the 24th). */
export function wakeStampFor(dayKey, hhmm) {
  return `${dayKey}T${formatMinutes(toMinutes(hhmm))}`;
}

/**
 * A bedtime typed for a day: anything before noon happened after midnight,
 * so it goes on the next calendar date (even 05:30, past the 05:00 day boundary).
 */
export function bedStampFor(dayKey, hhmm) {
  const minutes = toMinutes(hhmm);
  return `${minutes < NOON ? addDays(dayKey, 1) : dayKey}T${formatMinutes(minutes)}`;
}

/** Which day a "going to bed now" tap belongs to: before noon it is still last night. */
export function bedDayKeyFor(date) {
  const key = localDateKey(date);
  return date.getHours() * 60 + date.getMinutes() < NOON ? addDays(key, -1) : key;
}

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

/** A check-in value at or below this (sleep or energy, 1–5) suggests a lighter day. */
const LOW_CHECKIN = 2;

/**
 * Why today should probably be a "minimum" day, or null:
 * - 'late-bed': yesterday's bedtime was later than the threshold;
 * - 'low-checkin': this morning's sleep or energy was rated 2 or lower.
 * Only for a normal day whose suggestion was not dismissed. It is a suggestion, never automatic.
 */
export function minimumSuggestionReason(dayKey, days, settings) {
  const today = days[dayKey];
  if (today?.mode && today.mode !== 'normal') return null;
  if (today?.minimumSuggestionDismissed) return null;

  const prevKey = addDays(dayKey, -1);
  const bed = bedMinutes(days[prevKey], prevKey);
  if (bed != null && bed > toDayMinutes(settings.lateBedThreshold, settings.dayBoundary)) return 'late-bed';

  const checkin = today?.checkin;
  if (checkin && (checkin.sleep <= LOW_CHECKIN || checkin.energy <= LOW_CHECKIN)) return 'low-checkin';
  return null;
}

export function shouldSuggestMinimum(dayKey, days, settings) {
  return minimumSuggestionReason(dayKey, days, settings) !== null;
}

// ---------- habits ----------

/** All trackable habits: wake/bed plus every task in the template and the workout variants. */
export function listHabits(settings) {
  const habits = [
    { id: 'wake', title: `Подъём до ${addMinutesLabel(settings.wakeTarget, settings.wakeToleranceMin)}` },
    { id: 'bed', title: `Отбой до ${settings.bedTarget}` },
    { id: 'workout', title: settings.workout.title },
    { id: 'stretch', title: settings.workout.restTitle },
    { id: 'shutdown', title: 'Закрыть день' },
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

  const isSleep = sleepHabitIds(settings).has(habitId);
  if (day.mode === 'sick' && !isSleep) return null;

  let done;
  if (habitId === 'wake') done = isWakeOnTime(day, dayKey, settings);
  else if (habitId === 'bed') done = isBedOnTime(day, dayKey, settings);
  else if (habitId === 'shutdown') done = Boolean(day.closedAt);
  else done = day.done?.[habitId] === true;

  if (!done && day.mode === 'minimum' && !isSleep) return null;
  return done;
}

function addMinutesLabel(hhmm, add) {
  return formatMinutes(toMinutes(hhmm) + add);
}
