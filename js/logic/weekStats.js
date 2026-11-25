/**
 * Weekly statistics as plain JSON.
 *
 * This object is the contract for stage 2: the text export is rendered from it,
 * and the "Adjust plan with AI" button will send it to the Cloudflare Worker as is.
 * Bump WEEK_STATS_VERSION when the shape changes.
 */
import { formatMinutes, isoWeekday, stampTime, weekKeys } from './time.js';
import {
  bedMinutes, habitStatus, isDayCounted, isSkipped, isWeeklyWorkoutGoal, isWorkoutPlanned, listHabits, minimumStatus,
  wakeMinutes,
} from './rules.js';
import { habitStreak, minimumStreak } from './streaks.js';

export const WEEK_STATS_VERSION = 4; // v4: workout goal per week (goals.workoutMode, goals.workoutsPerWeek)

/**
 * @param {object} data      { settings, days }
 * @param {string} mondayKey first day of the week
 * @param {string} todayKey  days after it are "future" and not evaluated;
 *                           neither are days before settings.trackingSince
 */
export function buildWeekStats(data, mondayKey, todayKey) {
  const { settings, days } = data;
  const habits = listHabits(settings);
  const keys = weekKeys(mondayKey);
  // Days before tracking started (before the app was installed) are not misses, even if
  // something was filled in for them later.
  const firstKey = settings.trackingSince ?? Object.keys(days).concat(todayKey).sort()[0];
  const dayStats = keys.map((key) => buildDay(key, days, settings, habits, todayKey, firstKey));
  const past = dayStats.filter((d) => !d.isFuture && !d.isBeforeStart);

  const wakeTimes = past.map((d) => wakeMinutes(days[d.date], d.date)).filter((m) => m != null);
  const bedTimes = past.map((d) => bedMinutes(days[d.date], d.date)).filter((m) => m != null);
  const checkins = past.map((d) => d.checkin).filter(Boolean);
  const isCurrentWeek = keys.includes(todayKey);
  const minimum = isCurrentWeek ? minimumStreak(todayKey, days, settings) : null;
  const habitStreaks = isCurrentWeek
    ? habits.map((habit) => [habit.id, habitStreak(habit.id, todayKey, days, settings)])
    : [];

  return {
    version: WEEK_STATS_VERSION,
    week: { start: keys[0], end: keys[6] },
    goals: {
      weeklyApplications: settings.weeklyApplicationsGoal,
      wakeTarget: settings.wakeTarget,
      wakeToleranceMin: settings.wakeToleranceMin,
      bedTarget: settings.bedTarget,
      workoutDays: settings.workoutDays,
      workoutMode: settings.workoutMode,
      workoutsPerWeek: isWeeklyWorkoutGoal(settings) ? settings.workoutsPerWeek : null,
    },
    totals: {
      daysElapsed: past.length,
      minimumMet: past.filter((d) => d.mode !== 'sick' && d.minimum?.met).length,
      sickDays: past.filter((d) => d.mode === 'sick').length,
      minimumModeDays: past.filter((d) => d.mode === 'minimum').length,
      applications: dayStats.reduce((sum, d) => sum + d.applications, 0),
      drivingLessons: past.filter((d) => d.drivingLesson).length,
      workoutsPlanned: isWeeklyWorkoutGoal(settings)
        ? settings.workoutsPerWeek // the goal for the whole week
        : past.filter((d) => d.habits.workout !== null).length,
      workoutsDone: past.filter((d) => d.habits.workout === true).length,
      averageWake: average(wakeTimes),
      averageBed: average(bedTimes),
      checkins: checkins.length,
      averageSleep: averageRating(checkins.map((c) => c.sleep)),
      averageEnergy: averageRating(checkins.map((c) => c.energy)),
      daysClosed: past.filter((d) => d.closed).length,
      skippedTasks: past.reduce((sum, d) => sum + d.skipped.length, 0),
    },
    habits: habits.map((habit) => {
      const statuses = past.map((d) => d.habits[habit.id]);
      return {
        id: habit.id,
        title: habit.title,
        done: statuses.filter((s) => s === true).length,
        applicable: statuses.filter((s) => s !== null).length,
        skipped: past.filter((d) => d.skipped.includes(habit.id)).length,
      };
    }),
    streaks: isCurrentWeek
      ? {
        asOf: todayKey,
        minimum: minimum.count,
        habits: Object.fromEntries(habitStreaks.map(([id, streak]) => [id, streak.count])),
        // Misses inside each streak that were forgiven (one slip a week does not reset a streak).
        forgiven: {
          minimum: minimum.forgiven,
          habits: Object.fromEntries(habitStreaks.map(([id, streak]) => [id, streak.forgiven])),
        },
      }
      : null,
    days: dayStats,
  };
}

function buildDay(key, days, settings, habits, todayKey, firstKey) {
  const day = days[key];
  const isFuture = key > todayKey; // ISO dates compare correctly as strings
  const isBeforeStart = key < firstKey;
  const skippedDay = isFuture || isBeforeStart; // not evaluated

  return {
    date: key,
    weekday: isoWeekday(key),
    isToday: key === todayKey,
    isFuture,
    isBeforeStart,
    hasRecord: Boolean(day),
    mode: day?.mode ?? null,
    counted: skippedDay ? null : isDayCounted(day, key, settings),
    minimum: day ? minimumStatus(day, key, settings) : null,
    wakeAt: day?.wakeAt ? stampTime(day.wakeAt) : null,
    bedAt: day?.bedAt ? stampTime(day.bedAt) : null,
    applications: day?.applications ?? 0,
    drivingLesson: day?.mode === 'sick' ? null : day?.drivingLesson ?? null, // no lesson while sick
    workout: isWorkoutPlanned(key, days, settings) ? 'workout' : 'stretch',
    habits: Object.fromEntries(habits.map((h) => [h.id, skippedDay ? null : habitStatus(h.id, key, days, settings)])),
    note: day?.note?.trim() || null,
    checkin: day?.checkin ?? null,
    focus: day?.focus?.trim() || null,
    closed: Boolean(day?.closedAt),
    skipped: skippedDay ? [] : habits.filter((h) => isSkipped(day, h.id)).map((h) => h.id), // habit ids
  };
}

/** Average of 1–5 ratings, one decimal (3.75 → 3.8), or null. */
function averageRating(values) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** Average of day minutes as "HH:MM" (works across midnight: 00:50 and 01:10 → 01:00). */
function average(values) {
  if (values.length === 0) return null;
  return formatMinutes(values.reduce((a, b) => a + b, 0) / values.length);
}
