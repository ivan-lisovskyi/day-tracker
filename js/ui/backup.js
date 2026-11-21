/**
 * Browser side of backups: save the file (share sheet on iPhone, download elsewhere)
 * and read a file chosen by the user.
 */
import * as store from '../state/store.js';
import { backupFileName, describeBackup, parseBackup, serializeBackup } from '../logic/backup.js';
import { dayKeyFor, toStamp } from '../logic/time.js';

/**
 * Saves a backup. On iPhone the share sheet offers "Save to Files"; elsewhere the file
 * is downloaded. Returns false if the user cancelled the share sheet.
 */
export async function saveBackup() {
  const now = new Date();
  const stamp = toStamp(now);
  const data = store.getData();
  const name = backupFileName(dayKeyFor(now, data.settings.dayBoundary));
  const file = new File([serializeBackup(data, stamp)], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Бэкап трекера' });
    } catch (err) {
      if (err.name === 'AbortError') return false; // closed the share sheet
      download(file);
    }
  } else {
    download(file);
  }

  store.update((draft) => { draft.settings.lastBackupAt = stamp; });
  return true;
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Reads a backup file, asks for confirmation and replaces all data.
 * Returns a message for the UI: { ok: boolean, text: string }.
 */
export async function restoreBackup(file) {
  let data;
  try {
    data = parseBackup(await file.text());
  } catch (err) {
    return { ok: false, text: err.message };
  }

  const { dayCount, firstDay, lastDay } = describeBackup(data);
  const period = dayCount ? ` (с ${firstDay} по ${lastDay})` : '';
  const confirmed = window.confirm(
    `В бэкапе дней: ${dayCount}${period}.\n\nЗаменить ВСЕ текущие данные и настройки данными из файла? Отменить это нельзя.`,
  );
  if (!confirmed) return { ok: false, text: 'Восстановление отменено.' };

  store.replaceAll(data);
  return { ok: true, text: `Восстановлено: дней ${dayCount}.` };
}
