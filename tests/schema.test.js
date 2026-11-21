import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, migrate, SCHEMA_VERSION } from '../js/state/schema.js';

test('initial data has the current schema version and no days', () => {
  const data = createInitialData();
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(data.days, {});
  assert.equal(data.settings.weeklyApplicationsGoal, 5);
});

test('migrate keeps valid data as is', () => {
  const data = createInitialData();
  data.days['2026-11-23'] = { mode: 'normal', applications: 2 };
  assert.deepEqual(migrate(data), data);
});

test('migrate fills in settings missing from older data and does not mutate the input', () => {
  const data = createInitialData();
  delete data.settings.bedTarget;
  delete data.settings.workout.restTitle;

  const result = migrate(data);
  assert.equal(result.settings.bedTarget, '01:00');
  assert.equal(result.settings.workout.restTitle, 'Растяжка');
  assert.equal(data.settings.bedTarget, undefined);
});

test('migrate rejects garbage and data from a newer app version', () => {
  assert.throws(() => migrate(null), /бэкап/);
  assert.throws(() => migrate([]), /бэкап/);
  assert.throws(() => migrate({ days: {} }), /версии/);
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }), /новой версии/);
});

test('broken settings fall back to defaults instead of crashing the app', () => {
  const data = createInitialData();
  data.settings.dayBoundary = null;
  data.settings.wakeTarget = '25:99';
  data.settings.weeklyApplicationsGoal = 'five';
  data.settings.workoutDays = [1, 9, 'x'];
  data.settings.blocks = [
    { id: 'ok', title: 'Ок', kind: 'focus', start: '10:00', end: '11:00', tasks: [{ id: 't', title: 'T' }] },
    { id: 'bad-time', title: 'X', kind: 'focus', start: 'soon', end: '11:00', tasks: [] },
    { id: 'bad-kind', title: 'Y', kind: 'party', start: '10:00', end: '11:00', tasks: [] },
    'not a block',
  ];
  const result = migrate(data);
  assert.equal(result.settings.dayBoundary, '05:00');
  assert.equal(result.settings.wakeTarget, '09:00');
  assert.equal(result.settings.weeklyApplicationsGoal, 5);
  assert.deepEqual(result.settings.workoutDays, [1]);
  assert.deepEqual(result.settings.blocks.map((b) => b.id), ['ok']);
});

test('broken day fields are dropped, the rest of the day is kept', () => {
  const data = createInitialData();
  data.days['2026-11-23'] = {
    mode: 'party', wakeAt: 'bad', bedAt: '2026-11-24T01:10', applications: -3,
    drivingLesson: { start: 'x', end: '12:00' }, done: { cbr: true }, note: 42,
  };
  data.days['not-a-date'] = { mode: 'normal' };
  data.days['2026-11-22'] = 'garbage';
  const day = migrate(data).days['2026-11-23'];
  assert.equal(day.mode, 'normal');
  assert.equal(day.wakeAt, undefined);
  assert.equal(day.bedAt, '2026-11-24T01:10');
  assert.equal(day.applications, 0);
  assert.equal(day.drivingLesson, null);
  assert.deepEqual(day.done, { cbr: true });
  assert.equal(day.note, '');
  assert.deepEqual(Object.keys(migrate(data).days), ['2026-11-23']);
});

test('check-in, focus and closedAt are validated', () => {
  const data = createInitialData();
  data.days['2026-11-23'] = { checkin: { sleep: 4, energy: 2 }, focus: 'Отправить 2 отклика', closedAt: '2026-11-23T23:05' };
  data.days['2026-11-24'] = { checkin: { sleep: 9, energy: 'high' }, focus: 7, closedAt: 'yesterday' };
  const { days, settings } = migrate(data);
  assert.deepEqual(days['2026-11-23'].checkin, { sleep: 4, energy: 2 });
  assert.equal(days['2026-11-23'].focus, 'Отправить 2 отклика');
  assert.equal(days['2026-11-23'].closedAt, '2026-11-23T23:05');
  assert.equal(days['2026-11-24'].checkin, undefined);
  assert.equal(days['2026-11-24'].focus, undefined);
  assert.equal(days['2026-11-24'].closedAt, undefined);
  assert.equal(settings.shutdownFrom, '21:00');
});
