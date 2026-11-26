import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addOwnTask, hasPlan, newOwnTaskId, OWN_TITLE_MAX, removeOwnTask, restoreOwnTask, timedOwnTasks, untimedOwnTasks,
  updateOwnTask,
} from '../js/logic/ownTasks.js';

test('add trims the title, cuts it to 80 chars, keeps an empty time as null, rejects a blank title', () => {
  const day = {};
  const task = addOwnTask(day, { title: '  Сходить в банк ', time: '' }, 'own-a');
  assert.deepEqual(task, { id: 'own-a', title: 'Сходить в банк', time: null });
  assert.deepEqual(day.ownTasks, [task]);

  const long = addOwnTask(day, { title: 'x'.repeat(200), time: '14:00' }, 'own-b');
  assert.equal(long.title.length, OWN_TITLE_MAX);
  assert.equal(long.time, '14:00');

  assert.equal(addOwnTask(day, { title: '   ' }, 'own-c'), null);
  assert.equal(day.ownTasks.length, 2);
});

test('new ids start with "own-" and differ', () => {
  const a = newOwnTaskId(1_700_000_000_000, () => 0.123456);
  const b = newOwnTaskId(1_700_000_000_000, () => 0.654321);
  assert.match(a, /^own-[a-z0-9]+$/);
  assert.notEqual(a, b);
});

test('remove clears done/skipped and restore puts task and marks back at the same index', () => {
  const day = { done: { 'own-b': true, cbr: true }, skipped: { 'own-b': true } };
  addOwnTask(day, { title: 'A' }, 'own-a');
  addOwnTask(day, { title: 'B' }, 'own-b');
  addOwnTask(day, { title: 'C' }, 'own-c');

  const removed = removeOwnTask(day, 'own-b');
  assert.deepEqual(day.ownTasks.map((t) => t.id), ['own-a', 'own-c']);
  assert.deepEqual(day.done, { cbr: true });
  assert.deepEqual(day.skipped, {});

  restoreOwnTask(day, removed);
  assert.deepEqual(day.ownTasks.map((t) => t.id), ['own-a', 'own-b', 'own-c']);
  assert.equal(day.done['own-b'], true);
  assert.equal(day.skipped['own-b'], true);

  assert.equal(removeOwnTask(day, 'own-missing'), null);
});

test('update changes the time, clears it with "", ignores a blank title', () => {
  const day = {};
  addOwnTask(day, { title: 'Банк', time: '14:00' }, 'own-a');
  updateOwnTask(day, 'own-a', { time: '15:30' });
  assert.equal(day.ownTasks[0].time, '15:30');
  updateOwnTask(day, 'own-a', { time: '' });
  assert.equal(day.ownTasks[0].time, null);
  updateOwnTask(day, 'own-a', { title: '  ' });
  assert.equal(day.ownTasks[0].title, 'Банк');
  updateOwnTask(day, 'own-a', { title: ' Банк и почта ' });
  assert.equal(day.ownTasks[0].title, 'Банк и почта');
});

test('timed tasks sort by time (after midnight last), untimed keep their order', () => {
  const day = {};
  addOwnTask(day, { title: 'Ночью', time: '00:30' }, 'own-1');
  addOwnTask(day, { title: 'Хлеб' }, 'own-2');
  addOwnTask(day, { title: 'Банк', time: '14:00' }, 'own-3');
  addOwnTask(day, { title: 'Почта' }, 'own-4');
  assert.deepEqual(timedOwnTasks(day, '05:00').map((t) => t.id), ['own-3', 'own-1']);
  assert.deepEqual(untimedOwnTasks(day).map((t) => t.id), ['own-2', 'own-4']);
  assert.deepEqual(timedOwnTasks(undefined, '05:00'), []);
  assert.deepEqual(untimedOwnTasks(undefined), []);
});

test('hasPlan: empty day false; focus, lesson, minimum mode or a task true', () => {
  assert.equal(hasPlan(undefined), false);
  assert.equal(hasPlan({ mode: 'normal', done: {}, drivingLesson: null, note: '' }), false);
  assert.equal(hasPlan({ focus: 'Отклики' }), true);
  assert.equal(hasPlan({ drivingLesson: { start: '10:00', end: '11:00' } }), true);
  assert.equal(hasPlan({ mode: 'minimum' }), true);
  assert.equal(hasPlan({ ownTasks: [{ id: 'own-a', title: 'A', time: null }] }), true);
});
