import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habitStreak, minimumStreak } from '../js/logic/streaks.js';
import { createDefaultSettings } from '../js/state/defaults.js';

const settings = createDefaultSettings();

/** A day where the minimum is met. */
const met = (key) => ({ wakeAt: `${key}T09:00`, minimum: { cbr10: true }, applications: 1 });

test('consecutive days with the minimum met form a streak; unfinished today does not break it', () => {
  const days = {
    '2026-11-20': met('2026-11-20'),
    '2026-11-21': met('2026-11-21'),
    '2026-11-22': met('2026-11-22'),
    '2026-11-23': { mode: 'normal' }, // today, nothing done yet
  };
  assert.equal(minimumStreak('2026-11-23', days, settings), 3);

  days['2026-11-23'] = met('2026-11-23');
  assert.equal(minimumStreak('2026-11-23', days, settings), 4);
});

test('a sick day keeps the streak alive without extending it', () => {
  const days = {
    '2026-11-20': met('2026-11-20'),
    '2026-11-21': { mode: 'sick' },
    '2026-11-22': met('2026-11-22'),
  };
  assert.equal(minimumStreak('2026-11-22', days, settings), 2);
});

test('a missed day breaks the streak', () => {
  const days = {
    '2026-11-20': met('2026-11-20'),
    // 2026-11-21: app not opened
    '2026-11-22': met('2026-11-22'),
  };
  assert.equal(minimumStreak('2026-11-22', days, settings), 1);
});

test('workout streak skips days without a planned workout', () => {
  const days = {
    '2026-11-18': { done: { workout: true } }, // Wed
    '2026-11-19': { done: {} }, // Thu, rest day
    '2026-11-20': { done: { workout: true } }, // Fri
    '2026-11-21': { done: {} }, // Sat
    '2026-11-22': { done: {} }, // Sun
    '2026-11-23': { done: { workout: true } }, // Mon
  };
  // Monday 16 has no record → the streak stops there.
  assert.equal(habitStreak('workout', '2026-11-23', days, settings), 3);
});
