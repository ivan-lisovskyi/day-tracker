import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bedDayKeyFor, bedStampFor, habitStatus, hasPendingWorkout, isBedOnTime, isDayCounted, isWorkoutPlanned,
  listHabits, minimumStatus, minimumSuggestionReason, shouldSuggestMinimum, wakeStampFor, weeklyWorkoutProgress,
} from '../js/logic/rules.js';
import { createDefaultSettings } from '../js/state/defaults.js';

const settings = createDefaultSettings();
const FRIDAY = '2026-11-20';
const SATURDAY = '2026-11-21';
const SUNDAY = '2026-11-22';
const MONDAY = '2026-11-23';
const TUESDAY = '2026-11-24';

test('minimum: wake by 09:30 + CBR + (application or code)', () => {
  const base = { wakeAt: `${TUESDAY}T09:30`, minimum: { cbr10: true } };

  assert.equal(minimumStatus({ ...base, applications: 1 }, TUESDAY, settings).met, true);
  assert.equal(minimumStatus({ ...base, minimum: { cbr10: true, code15: true } }, TUESDAY, settings).met, true);
  assert.equal(minimumStatus(base, TUESDAY, settings).met, false); // neither application nor code

  const late = { ...base, wakeAt: `${TUESDAY}T09:31`, applications: 1 };
  assert.deepEqual(minimumStatus(late, TUESDAY, settings), { wake: false, cbr: true, work: true, met: false });
});

test('minimum: the full tasks (1 h CBR, code block) also satisfy it', () => {
  const day = { wakeAt: `${TUESDAY}T09:05`, done: { cbr: true, code: true } };
  assert.equal(minimumStatus(day, TUESDAY, settings).met, true);
});

test('a sick day counts, an empty day does not', () => {
  assert.equal(isDayCounted({ mode: 'sick' }, TUESDAY, settings), true);
  assert.equal(isDayCounted(undefined, TUESDAY, settings), false);
  assert.equal(isDayCounted({ mode: 'normal' }, TUESDAY, settings), false);
});

test('bedtime after midnight is compared within the same tracked day', () => {
  assert.equal(isBedOnTime({ bedAt: '2026-11-25T01:00' }, TUESDAY, settings), true);
  assert.equal(isBedOnTime({ bedAt: '2026-11-25T01:05' }, TUESDAY, settings), false);
  assert.equal(isBedOnTime({ bedAt: '2026-11-24T23:40' }, TUESDAY, settings), true);
  assert.equal(isBedOnTime({}, TUESDAY, settings), false);
});

test('a workout missed on Friday moves to Saturday', () => {
  const days = { [FRIDAY]: { done: {} } };
  assert.equal(hasPendingWorkout(SATURDAY, days, settings), true);
  assert.equal(isWorkoutPlanned(SATURDAY, days, settings), true);
});

test('a workout done on Friday does not move', () => {
  const days = { [FRIDAY]: { done: { workout: true } } };
  assert.equal(hasPendingWorkout(SATURDAY, days, settings), false);
});

test('a carried workout keeps moving until done, but never stacks', () => {
  const days = { [FRIDAY]: { done: {} }, [SATURDAY]: { done: {} }, [SUNDAY]: { done: {} } };
  assert.equal(hasPendingWorkout(SUNDAY, days, settings), true);
  // Monday is a regular workout day: the pending one merges in, there is still one workout.
  assert.equal(isWorkoutPlanned(MONDAY, days, settings), true);

  days[SATURDAY].done.workout = true;
  assert.equal(hasPendingWorkout(SUNDAY, days, settings), false);
});

test('no record for the previous day → nothing is carried over', () => {
  assert.equal(hasPendingWorkout(SATURDAY, {}, settings), false);
});

test('a workout is not carried over from a sick day', () => {
  const days = { [FRIDAY]: { mode: 'sick', done: {} } };
  assert.equal(hasPendingWorkout(SATURDAY, days, settings), false);
});

test('going to bed after 02:00 suggests minimum mode the next day', () => {
  const late = { [FRIDAY]: { bedAt: `${SATURDAY}T02:10` } };
  assert.equal(shouldSuggestMinimum(SATURDAY, late, settings), true);

  const fine = { [FRIDAY]: { bedAt: `${SATURDAY}T01:50` } };
  assert.equal(shouldSuggestMinimum(SATURDAY, fine, settings), false);

  const alreadyMinimum = { ...late, [SATURDAY]: { mode: 'minimum' } };
  assert.equal(shouldSuggestMinimum(SATURDAY, alreadyMinimum, settings), false);

  const dismissed = { ...late, [SATURDAY]: { minimumSuggestionDismissed: true } };
  assert.equal(shouldSuggestMinimum(SATURDAY, dismissed, settings), false);
});

test('habit status respects sick and minimum modes', () => {
  const days = {
    [MONDAY]: { mode: 'sick', bedAt: `${TUESDAY}T00:50` },
    [TUESDAY]: { mode: 'minimum', done: { cbr: true } },
  };
  assert.equal(habitStatus('code', MONDAY, days, settings), null); // hidden while sick
  assert.equal(habitStatus('bed', MONDAY, days, settings), true); // sleep still tracked
  assert.equal(habitStatus('code', TUESDAY, days, settings), null); // undone on a minimum day: neutral
  assert.equal(habitStatus('cbr', TUESDAY, days, settings), true);
});

test('workout and stretching are only evaluated on their own days', () => {
  const days = { [MONDAY]: { done: {} }, [TUESDAY]: { done: { workout: true } } };
  assert.equal(habitStatus('stretch', MONDAY, days, settings), null);
  assert.equal(habitStatus('workout', MONDAY, days, settings), false);
  // Monday's missed workout carries into Tuesday, where it was done.
  assert.equal(habitStatus('workout', TUESDAY, days, settings), true);
});

test('a typed bedtime before noon belongs to the night after the day', () => {
  assert.equal(bedStampFor(TUESDAY, '23:40'), '2026-11-24T23:40');
  assert.equal(bedStampFor(TUESDAY, '01:20'), '2026-11-25T01:20');
  assert.equal(bedStampFor(TUESDAY, '05:30'), '2026-11-25T05:30'); // after the 05:00 boundary, still last night
  const late = { [TUESDAY]: { bedAt: bedStampFor(TUESDAY, '05:30') } };
  assert.equal(isBedOnTime(late[TUESDAY], TUESDAY, settings), false);
  assert.equal(shouldSuggestMinimum('2026-11-25', late, settings), true);
});

test('"going to bed now" before noon is recorded for the previous day', () => {
  assert.equal(bedDayKeyFor(new Date(2026, 10, 25, 5, 30)), TUESDAY);
  assert.equal(bedDayKeyFor(new Date(2026, 10, 25, 1, 0)), TUESDAY);
  assert.equal(bedDayKeyFor(new Date(2026, 10, 24, 23, 50)), TUESDAY);
});

test('a typed wake time stays on the calendar date of the day', () => {
  assert.equal(wakeStampFor(TUESDAY, '04:50'), '2026-11-24T04:50');
  assert.equal(wakeStampFor(TUESDAY, '9:05'), '2026-11-24T09:05');
});

test('tasks of sleep blocks count on sick days', () => {
  const days = { [TUESDAY]: { mode: 'sick', done: { 'no-phone': true } } };
  assert.equal(habitStatus('no-phone', TUESDAY, days, settings), true);
  assert.equal(habitStatus('code', TUESDAY, days, settings), null);
});

test('a low sleep or energy check-in suggests minimum mode, with the reason', () => {
  const checkin = (sleep, energy, extra = {}) => ({ [TUESDAY]: { checkin: { sleep, energy }, ...extra } });
  assert.equal(minimumSuggestionReason(TUESDAY, checkin(4, 2), settings), 'low-checkin');
  assert.equal(minimumSuggestionReason(TUESDAY, checkin(1, 4), settings), 'low-checkin');
  assert.equal(minimumSuggestionReason(TUESDAY, checkin(3, 3), settings), null);
  assert.equal(minimumSuggestionReason(TUESDAY, checkin(1, 1, { mode: 'minimum' }), settings), null);
  assert.equal(minimumSuggestionReason(TUESDAY, checkin(1, 1, { minimumSuggestionDismissed: true }), settings), null);

  const lateNight = { [MONDAY]: { bedAt: `${TUESDAY}T02:30` } };
  assert.equal(minimumSuggestionReason(TUESDAY, lateNight, settings), 'late-bed');
});

test('"close the day" is a habit', () => {
  assert.ok(listHabits(settings).some((h) => h.id === 'shutdown'));
  const days = {
    [MONDAY]: { closedAt: `${MONDAY}T23:10`, done: {} },
    [TUESDAY]: { done: {} },
    [FRIDAY]: { mode: 'sick', done: {} },
  };
  assert.equal(habitStatus('shutdown', MONDAY, days, settings), true);
  assert.equal(habitStatus('shutdown', TUESDAY, days, settings), false);
  assert.equal(habitStatus('shutdown', FRIDAY, days, settings), null);
});

test('a sick day never counts as a miss, so sleep streaks survive it', () => {
  const days = { [MONDAY]: { mode: 'sick', wakeAt: `${MONDAY}T11:40`, done: {} } };
  assert.equal(habitStatus('wake', MONDAY, days, settings), null); // overslept while sick: neutral
  assert.equal(habitStatus('bed', MONDAY, days, settings), null);
  assert.equal(habitStatus('phone-away', MONDAY, days, settings), null);
});

test('a skipped task is neutral unless it was done after all; a skipped workout is not carried over', () => {
  const days = {
    [FRIDAY]: { done: {}, skipped: { workout: true, walk: true } }, // Friday is a kettlebell day
    [SATURDAY]: { done: { walk: true }, skipped: { walk: true } },
  };
  assert.equal(habitStatus('walk', FRIDAY, days, settings), null);
  assert.equal(habitStatus('workout', FRIDAY, days, settings), null);
  assert.equal(habitStatus('walk', SATURDAY, days, settings), true); // done wins
  assert.equal(hasPendingWorkout(SATURDAY, days, settings), false);
});

// ---------- workout goal "N times a week" ----------

const weekly = { ...createDefaultSettings(), workoutMode: 'weekly', workoutsPerWeek: 3 };
const W = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']; // Mon…Sun
const trained = { done: { workout: true } };

test('weekly goal: a workout is offered until the goal is met, with a rest day after each one', () => {
  assert.equal(isWorkoutPlanned(W[0], {}, weekly), true); // Monday, nothing done yet

  const days = { [W[0]]: trained };
  assert.equal(isWorkoutPlanned(W[0], days, weekly), true); // done → a workout day
  assert.equal(isWorkoutPlanned(W[1], days, weekly), false); // Tue: rest
  assert.equal(isWorkoutPlanned(W[2], days, weekly), true); // Wed

  const met = { [W[0]]: trained, [W[2]]: trained, [W[4]]: trained };
  assert.equal(isWorkoutPlanned(W[5], met, weekly), false); // goal met → stretching
  assert.equal(isWorkoutPlanned(W[6], met, weekly), false);
});

test('weekly goal: no rest day when the remaining days are all needed; nothing is carried over', () => {
  const days = { [W[3]]: trained }; // only Thursday so far
  assert.equal(isWorkoutPlanned(W[4], days, weekly), false); // Fri: 2 needed, 3 days left → rest
  assert.equal(isWorkoutPlanned(W[5], days, weekly), true); // Sat: 2 needed, 2 left → no room for rest

  const sat = { ...days, [W[5]]: trained };
  assert.equal(isWorkoutPlanned(W[6], sat, weekly), true); // Sun, right after Saturday's workout
  assert.equal(hasPendingWorkout(W[1], { [W[0]]: { done: {} } }, weekly), false);
});

test('weekly goal: Sunday workout makes Monday a rest day, and the count starts again', () => {
  const days = { '2026-11-22': trained };
  assert.equal(isWorkoutPlanned(W[0], days, weekly), false);
  assert.equal(isWorkoutPlanned(W[1], days, weekly), true);
});

test('weekly goal: the choice for the day wins over the suggestion', () => {
  const days = { [W[0]]: trained, [W[1]]: { done: {}, workoutChoice: 'workout' }, [W[2]]: { done: {}, workoutChoice: 'stretch' } };
  assert.equal(isWorkoutPlanned(W[1], days, weekly), true);
  assert.equal(isWorkoutPlanned(W[2], days, weekly), false);
});

test('weekly goal: a day without a workout is a miss only when the goal can no longer wait', () => {
  const days = { [W[0]]: { done: {} }, [W[1]]: { done: {} }, [W[4]]: { done: {} }, [W[5]]: trained };
  assert.equal(habitStatus('workout', W[0], days, weekly), null); // Mon: plenty of time
  assert.equal(habitStatus('workout', W[3], days, weekly), null); // Thu, no record: 3 needed, 4 days left
  assert.equal(habitStatus('workout', W[4], days, weekly), false); // Fri: 3 needed, 3 left → had to
  assert.equal(habitStatus('workout', W[5], days, weekly), true);
  assert.equal(habitStatus('workout', W[6], days, weekly), false); // Sun, no record: still owed
});

test('weekly goal: stretching counts only on days planned for it', () => {
  const days = { [W[0]]: trained, [W[1]]: { done: {} }, [W[2]]: { done: {} } };
  assert.equal(habitStatus('stretch', W[1], days, weekly), false); // rest day, not stretched
  assert.equal(habitStatus('stretch', W[2], days, weekly), null); // a workout was offered
  assert.equal(habitStatus('stretch', W[0], days, weekly), null);
});

test('weekly goal: progress of the week up to a day', () => {
  const days = { [W[0]]: trained, [W[2]]: trained, '2026-11-22': trained };
  assert.deepEqual(weeklyWorkoutProgress(W[2], days, weekly), { done: 2, goal: 3 });
  assert.deepEqual(weeklyWorkoutProgress(W[1], days, weekly), { done: 1, goal: 3 });
});

test('weekly goal: a stretch that was done stays a stretch day when earlier days or the goal change', () => {
  const days = { [W[0]]: { done: { workout: true } }, [W[1]]: { done: { stretch: true } } };
  assert.equal(isWorkoutPlanned(W[1], days, weekly), false);
  days[W[0]].done.workout = false; // Monday unticked later from the past-day screen
  assert.equal(isWorkoutPlanned(W[1], days, weekly), false);
  // A higher goal makes every remaining day a must-do, but not a day already spent stretching.
  assert.equal(isWorkoutPlanned(W[1], days, { ...weekly, workoutsPerWeek: 7 }), false);
});
