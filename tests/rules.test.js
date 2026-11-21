import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  habitStatus, hasPendingWorkout, isBedOnTime, isDayCounted, isWorkoutPlanned,
  minimumStatus, shouldSuggestMinimum,
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
