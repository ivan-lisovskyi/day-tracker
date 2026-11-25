import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backupFileName, describeBackup, parseBackup, serializeBackup, shouldRemindBackup,
} from '../js/logic/backup.js';
import { createInitialData } from '../js/state/schema.js';

function dataWithDays(...keys) {
  const data = createInitialData();
  for (const key of keys) data.days[key] = { mode: 'normal', done: {} };
  data.settings.trackingSince = [...keys].sort()[0] ?? null;
  return data;
}

test('a backup survives a round trip', () => {
  const data = dataWithDays('2026-11-20', '2026-11-21');
  data.days['2026-11-21'].note = 'тест';
  const restored = parseBackup(serializeBackup(data, '2026-11-21T22:00'));
  assert.equal(restored.settings.lastBackupAt, '2026-11-21T22:00'); // the file knows when it was made
  restored.settings.lastBackupAt = null;
  assert.deepEqual(restored, data); // everything else is kept as is
});

test('broken files are rejected with a readable message', () => {
  assert.throws(() => parseBackup('{not json'), /не JSON/);
  assert.throws(() => parseBackup('[1, 2]'), /бэкап/);
  assert.throws(() => parseBackup('{"schemaVersion": 99}'), /новой версии/);
});

test('file name and description', () => {
  assert.equal(backupFileName('2026-11-21'), 'day-tracker-backup-2026-11-21.json');
  assert.deepEqual(describeBackup(dataWithDays('2026-11-21', '2026-11-03')),
    { dayCount: 2, firstDay: '2026-11-03', lastDay: '2026-11-21' });
  assert.deepEqual(describeBackup(dataWithDays()), { dayCount: 0, firstDay: null, lastDay: null });
});

test('reminder: never with no data, weekly after the first day or the last backup', () => {
  assert.equal(shouldRemindBackup(dataWithDays(), '2026-11-21'), false);

  const data = dataWithDays('2026-11-15');
  assert.equal(shouldRemindBackup(data, '2026-11-21'), false); // 6 days of data
  assert.equal(shouldRemindBackup(data, '2026-11-22'), true); // a week, never backed up

  data.settings.lastBackupAt = '2026-11-20T21:30';
  assert.equal(shouldRemindBackup(data, '2026-11-26'), false);
  assert.equal(shouldRemindBackup(data, '2026-11-27'), true);

  data.settings.backupReminderDismissedAt = '2026-11-27T10:00'; // "later"
  assert.equal(shouldRemindBackup(data, '2026-11-28'), false);
  assert.equal(shouldRemindBackup(data, '2026-12-04'), true);
});
