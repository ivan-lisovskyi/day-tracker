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
  assert.deepEqual(minimumStreak('2026-11-23', days, settings), { count: 3, forgiven: 0 });

  days['2026-11-23'] = met('2026-11-23');
  assert.equal(minimumStreak('2026-11-23', days, settings).count, 4);
});

test('a sick day keeps the streak alive without extending it', () => {
  const days = {
    '2026-11-20': met('2026-11-20'),
    '2026-11-21': { mode: 'sick' },
    '2026-11-22': met('2026-11-22'),
  };
  assert.deepEqual(minimumStreak('2026-11-22', days, settings), { count: 2, forgiven: 0 });
});

test('one missed day is forgiven: the streak goes on without counting that day', () => {
  const days = {
    '2026-11-20': met('2026-11-20'),
    // 2026-11-21: app not opened
    '2026-11-22': met('2026-11-22'),
  };
  assert.deepEqual(minimumStreak('2026-11-22', days, settings), { count: 2, forgiven: 1 });
});

test('a second miss within 7 days breaks the streak', () => {
  const keys = ['2026-11-14', '2026-11-15', '2026-11-17', '2026-11-18', '2026-11-20', '2026-11-21', '2026-11-22'];
  const days = Object.fromEntries(keys.map((key) => [key, met(key)]));
  days['2026-11-16'] = { mode: 'normal' }; // missed
  days['2026-11-19'] = { mode: 'normal' }; // missed, 3 days later
  // Back from the 22nd: 22, 21, 20 done, the 19th forgiven, 18, 17 done, the 16th breaks.
  assert.deepEqual(minimumStreak('2026-11-22', days, settings), { count: 5, forgiven: 1 });
});

test('misses a week apart are both forgiven', () => {
  const days = {};
  for (let d = 5; d <= 22; d++) {
    const key = `2026-11-${String(d).padStart(2, '0')}`;
    days[key] = d === 10 || d === 17 ? { mode: 'normal' } : met(key);
  }
  // 16 done days from the 5th to the 22nd, the 10th and the 17th forgiven; the 4th has no record.
  assert.deepEqual(minimumStreak('2026-11-22', days, settings), { count: 16, forgiven: 2 });
});

test('two misses in a row break the streak, and a miss before the first done day is not "forgiven"', () => {
  const days = {
    '2026-11-18': met('2026-11-18'),
    '2026-11-19': { mode: 'normal' },
    '2026-11-20': { mode: 'normal' },
    '2026-11-21': met('2026-11-21'),
    '2026-11-22': met('2026-11-22'),
  };
  assert.deepEqual(minimumStreak('2026-11-22', days, settings), { count: 2, forgiven: 0 });
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
  assert.equal(habitStreak('workout', '2026-11-23', days, settings).count, 3);
});

test('a skipped task is neutral: it neither breaks nor extends the habit streak', () => {
  const days = {
    '2026-11-18': { done: { cbr: true } },
    '2026-11-19': { done: { cbr: true } },
    '2026-11-20': { done: {}, skipped: { cbr: true } },
    '2026-11-21': { done: {}, skipped: { cbr: true } },
    '2026-11-22': { done: { cbr: true } },
  };
  assert.deepEqual(habitStreak('cbr', '2026-11-22', days, settings), { count: 3, forgiven: 0 });
});
