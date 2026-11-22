import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDaySchedule, findCurrentBlock, nowAndNext } from '../js/logic/schedule.js';
import { createDefaultSettings } from '../js/state/defaults.js';
import { formatMinutes } from '../js/logic/time.js';

const settings = createDefaultSettings();
const MONDAY = '2026-11-23';
const TUESDAY = '2026-11-24';
const SATURDAY = '2026-11-21';

/** Compact view of a schedule: "10:30–11:30 cbr" lines, easy to compare. */
const view = (blocks) => blocks.map((b) => `${formatMinutes(b.start)}–${formatMinutes(b.end)} ${b.id}`);
const byId = (blocks, id) => blocks.find((b) => b.id === id);

test('Monday is a kettlebell day, Tuesday is a stretching day', () => {
  const monday = buildDaySchedule({ settings, dayKey: MONDAY });
  const workout = byId(monday.blocks, 'workout');
  assert.equal(workout.title, 'Гиря 12 кг');
  assert.equal(formatMinutes(workout.end), '09:35');
  assert.deepEqual(workout.tasks.map((t) => t.id), ['workout']);

  const tuesday = buildDaySchedule({ settings, dayKey: TUESDAY });
  const stretch = byId(tuesday.blocks, 'workout');
  assert.equal(stretch.title, 'Растяжка');
  assert.equal(formatMinutes(stretch.end), '09:30');
  assert.deepEqual(stretch.tasks.map((t) => t.id), ['stretch']);
});

test('a carried-over workout replaces stretching and is marked as carried over', () => {
  const { blocks, workoutToday } = buildDaySchedule({ settings, dayKey: SATURDAY, pendingWorkout: true });
  const workout = byId(blocks, 'workout');
  assert.equal(workoutToday, true);
  assert.equal(workout.title, 'Гиря 12 кг');
  assert.equal(workout.carriedOver, true);
});

test('night blocks come after midnight on the same day', () => {
  const { blocks } = buildDaySchedule({ settings, dayKey: TUESDAY });
  assert.equal(byId(blocks, 'phone').start, 1470); // 00:30
  assert.equal(byId(blocks, 'bedtime').start, 1500); // 01:00
  assert.equal(blocks.at(-1).id, 'bedtime');
});

test('driving lesson over Block 1 moves CBR and job search into free time', () => {
  const day = { drivingLesson: { start: '11:00', end: '12:00' } };
  const { blocks, unplaced } = buildDaySchedule({ settings, dayKey: TUESDAY, day });

  assert.deepEqual(unplaced, []);
  const lines = view(blocks);
  for (const expected of [
    '10:30–11:00 driving-to',
    '11:00–12:00 driving',
    '12:00–12:30 driving-back',
    '16:00–17:00 cbr~moved',
    '17:00–18:00 jobs~moved',
    '18:00–19:00 free',
  ]) {
    assert.ok(lines.includes(expected), `missing "${expected}" in\n${lines.join('\n')}`);
  }
  assert.equal(byId(blocks, 'cbr'), undefined);
  assert.equal(byId(blocks, 'breakfast').conflict, undefined); // ends exactly when travel starts
  assert.equal(byId(blocks, 'cbr~moved').moved, true);
});

test('driving lesson in the middle of the code block keeps the remainder in place', () => {
  const day = { drivingLesson: { start: '14:00', end: '15:00' } };
  const { blocks, unplaced } = buildDaySchedule({ settings, dayKey: TUESDAY, day });

  assert.deepEqual(unplaced, []);
  const lines = view(blocks);
  assert.ok(lines.includes('15:30–16:00 code'));
  assert.ok(lines.includes('16:00–18:00 code~moved'));
  assert.ok(lines.includes('18:00–19:00 free'));
});

test('a fixed block hit by the lesson is flagged as a conflict, not moved', () => {
  const day = { drivingLesson: { start: '12:00', end: '13:00' } };
  const { blocks } = buildDaySchedule({ settings, dayKey: TUESDAY, day });
  assert.equal(byId(blocks, 'lunch').conflict, true);
  assert.ok(byId(blocks, 'jobs~moved'));
});

test('what does not fit into free time is reported as unplaced', () => {
  // Window 12:30–17:00 eats the code block (2.5 h) and one hour of free time; only 2 h are left.
  const day = { drivingLesson: { start: '13:00', end: '16:30' } };
  const { blocks, unplaced } = buildDaySchedule({ settings, dayKey: TUESDAY, day });

  assert.ok(view(blocks).includes('17:00–19:00 code~moved'));
  assert.equal(byId(blocks, 'free'), undefined);
  assert.deepEqual(unplaced.map((u) => [u.sourceId, u.minutes]), [['code', 30]]);
});

test('an invalid lesson (end before start) leaves the day unchanged', () => {
  const day = { drivingLesson: { start: '15:00', end: '14:00' } };
  const plain = buildDaySchedule({ settings, dayKey: TUESDAY });
  const withBadLesson = buildDaySchedule({ settings, dayKey: TUESDAY, day });
  assert.deepEqual(view(withBadLesson.blocks), view(plain.blocks));
});

test('sick mode shows only the sleep routine, even with a lesson planned', () => {
  const day = { mode: 'sick', drivingLesson: { start: '11:00', end: '12:00' } };
  const { blocks, unplaced } = buildDaySchedule({ settings, dayKey: TUESDAY, day });
  assert.deepEqual(blocks.map((b) => b.id), ['wake', 'phone', 'bedtime']);
  assert.deepEqual(unplaced, []);
});

test('findCurrentBlock picks the block running now', () => {
  const { blocks } = buildDaySchedule({ settings, dayKey: MONDAY });
  assert.equal(findCurrentBlock(blocks, 11 * 60 + 40).id, 'jobs');
  assert.equal(findCurrentBlock(blocks, 17 * 60).id, 'free');
  assert.equal(findCurrentBlock(blocks, 9 * 60 + 40), null); // gap between workout and breakfast
  assert.equal(findCurrentBlock(blocks, 1480).id, 'phone'); // 00:40 at night
});

test('nowAndNext: current block with remaining time, and what comes next', () => {
  const { blocks } = buildDaySchedule({ settings, dayKey: MONDAY });

  const midBlock = nowAndNext(blocks, 11 * 60 + 40); // 11:40, inside "Поиск работы" 11:30–12:30
  assert.equal(midBlock.current.id, 'jobs');
  assert.equal(midBlock.remainingMin, 50);
  assert.ok(Math.abs(midBlock.progress - 10 / 60) < 1e-9);
  assert.equal(midBlock.next.id, 'lunch');

  const gap = nowAndNext(blocks, 9 * 60 + 40); // 09:40, between workout and breakfast
  assert.equal(gap.current, null);
  assert.equal(gap.next.id, 'breakfast');

  const night = nowAndNext(blocks, 1480); // 00:40: phone block, then the bedtime marker
  assert.equal(night.current.id, 'phone');
  assert.equal(night.next.id, 'bedtime');

  const after = nowAndNext(blocks, 1510); // 01:10: the day is over
  assert.equal(after.current, null);
  assert.equal(after.next, null);
});

test('during a lesson the "now" block is the lesson, not the fixed block it overlaps', () => {
  const day = { drivingLesson: { start: '12:00', end: '13:00' } }; // over lunch (12:30–13:30)
  const { blocks } = buildDaySchedule({ settings, dayKey: TUESDAY, day });
  const current = findCurrentBlock(blocks, 12 * 60 + 40);
  assert.equal(current.kind, 'driving');
  assert.equal(nowAndNext(blocks, 12 * 60 + 40).current.kind, 'driving');
});

test('sick mode ignores a planned lesson: no conflict marks on the sleep routine', () => {
  const day = { mode: 'sick', drivingLesson: { start: '08:45', end: '09:10' } }; // over "Подъём"
  const { blocks, unplaced } = buildDaySchedule({ settings, dayKey: TUESDAY, day });
  assert.equal(blocks.some((b) => b.conflict), false);
  assert.deepEqual(unplaced, []);
});

test('the caller can decide whether today is a workout day (weekly goal mode)', () => {
  const tuesday = buildDaySchedule({ settings, dayKey: TUESDAY, workoutPlanned: true });
  assert.equal(byId(tuesday.blocks, 'workout').title, 'Гиря 12 кг');
  const monday = buildDaySchedule({ settings, dayKey: MONDAY, workoutPlanned: false });
  assert.equal(byId(monday.blocks, 'workout').title, 'Растяжка');
});
