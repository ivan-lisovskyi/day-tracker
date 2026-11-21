/**
 * Backup helpers: file contents, parsing an imported file and the weekly reminder.
 * Pure functions; the download/share/file-picker parts live in ui/backup.js.
 */
import { migrate } from '../state/schema.js';
import { daysBetween, parseStamp } from './time.js';

export const BACKUP_REMINDER_DAYS = 7;

export function backupFileName(todayKey) {
  return `day-tracker-backup-${todayKey}.json`;
}

/**
 * The whole data object, pretty-printed. The file records its own time as the last
 * backup, so restoring it does not immediately trigger the backup reminder.
 */
export function serializeBackup(data, exportedAt) {
  const settings = { ...data.settings, lastBackupAt: exportedAt };
  return JSON.stringify({ ...data, settings, exportedAt }, null, 2);
}

/**
 * Text of an imported file → validated, migrated data.
 * Throws an Error with a Russian message suitable for the UI.
 */
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или это не JSON.');
  }
  return migrate(raw);
}

/** Short description of a backup for the confirmation dialog. */
export function describeBackup(data) {
  const keys = Object.keys(data.days).sort();
  return { dayCount: keys.length, firstDay: keys[0] ?? null, lastDay: keys.at(-1) ?? null };
}

/**
 * Remind once a week: counting from the last backup, the last "later",
 * or — if there was never a backup — from the first tracked day.
 * No data yet → nothing to back up, no reminder.
 */
export function shouldRemindBackup(data, todayKey) {
  const firstDay = Object.keys(data.days).sort()[0];
  if (!firstDay) return false;

  const { lastBackupAt, backupReminderDismissedAt } = data.settings;
  const references = [firstDay, lastBackupAt, backupReminderDismissedAt]
    .filter(Boolean)
    .map((value) => (value.includes('T') ? parseStamp(value).key : value));
  const latest = references.sort().at(-1);

  return daysBetween(latest, todayKey) >= BACKUP_REMINDER_DAYS;
}
