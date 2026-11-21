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
