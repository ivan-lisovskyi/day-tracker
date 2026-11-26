import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDayTasks, finishedBlockIds, nextOpenTask, weekStripDays } from '../js/logic/dayView.js';

const block = (id, start, end, taskIds = []) => ({ id, start, end, tasks: taskIds.map((t) => ({ id: t, title: t })) });
const items = (...blocks) => blocks.map((b) => ({ block: b, tasks: b.tasks }));

test('a block folds away once it is over and nothing in it is left open', () => {
  const list = items(
    block('wake', 540, 555, ['no-phone']), // over, done
    block('breakfast', 555, 630), // over, no tasks
    block('cbr', 630, 690, ['cbr']), // over, still open
    block('jobs', 690, 750, ['jobs']), // over, skipped
    block('code', 810, 960, ['code']), // running now
  );
  const day = { done: { 'no-phone': true }, skipped: { jobs: true } };
  assert.deepEqual([...finishedBlockIds(list, day, 800, false)], ['wake', 'breakfast', 'jobs']);
  // An earlier day is over as a whole: a done block late in the day folds too.
  day.done.code = true;
  assert.deepEqual([...finishedBlockIds(list, day, -1, true)], ['wake', 'breakfast', 'jobs', 'code']);
});

test('"✓ Готово" ticks the first task that is neither done nor skipped', () => {
  const b = block('evening', 1200, 1380, ['a', 'b', 'c']);
  assert.equal(nextOpenTask(b, { done: {} }).id, 'a');
  assert.equal(nextOpenTask(b, { done: { a: true }, skipped: { b: true } }).id, 'c');
  assert.equal(nextOpenTask(b, { done: { a: true, b: true, c: true } }), null);
  assert.equal(nextOpenTask(block('meal', 0, 60), {}), null);
});

test('week strip: one mark per day and where a tap goes', () => {
  const base = { hasRecord: true, isToday: false, isFuture: false, isBeforeStart: false, mode: 'normal', minimum: { met: false } };
  const days = [
    { ...base, date: '2026-11-23', weekday: 1, isBeforeStart: true, hasRecord: false },
    { ...base, date: '2026-11-24', weekday: 2, minimum: { met: true } },
    { ...base, date: '2026-11-25', weekday: 3 },
    { ...base, date: '2026-11-26', weekday: 4, mode: 'sick' },
    { ...base, date: '2026-11-27', weekday: 5, hasRecord: false },
    { ...base, date: '2026-11-28', weekday: 6, isToday: true },
    { ...base, date: '2026-11-29', weekday: 7, isFuture: true, hasRecord: false },
  ];
  const strip = weekStripDays(days);
  assert.deepEqual(strip.map((d) => d.state), ['before', 'met', 'missed', 'sick', 'empty', 'today', 'future']);
  assert.deepEqual(strip.map((d) => d.href), [
    null, '#day/2026-11-24', '#day/2026-11-25', '#day/2026-11-26', '#day/2026-11-27', '#today', '#day/2026-11-29',
  ]);
});

test('future days link to their plan and show "planned" when something is planned', () => {
  const future = (date, weekday) => ({
    date, weekday, isFuture: true, isToday: false, isBeforeStart: false, hasRecord: false, mode: null, minimum: null,
  });
  const strip = weekStripDays([future('2026-11-27', 5), future('2026-11-28', 6)], new Set(['2026-11-28']));
  assert.deepEqual(strip.map((d) => [d.state, d.href]), [
    ['future', '#day/2026-11-27'],
    ['planned', '#day/2026-11-28'],
  ]);
});

test('countDayTasks counts timed own tasks once and untimed ones too', () => {
  const schedule = {
    blocks: [
      block('cbr', 630, 690, ['cbr']),
      block('own-bank', 870, 870, ['own-bank']), // a timed own task, already in the schedule
    ],
  };
  const day = {
    done: { cbr: true, 'own-bread': true },
    skipped: { 'own-bank': true },
    ownTasks: [
      { id: 'own-bank', title: 'Банк', time: '14:30' },
      { id: 'own-bread', title: 'Хлеб', time: null },
      { id: 'own-mail', title: 'Почта', time: null },
    ],
  };
  assert.deepEqual(countDayTasks(schedule, day), { done: 2, total: 3, skipped: 1 });
});
