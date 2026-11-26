/**
 * The single source of truth: data lives in memory and is mirrored to localStorage.
 * Screens read with getData(), change with update()/updateDay() and re-render via subscribe().
 *
 * Storage access is isolated here, so switching to IndexedDB later touches only this file.
 */
import { clone, createDay, createInitialData, migrate } from './schema.js';
import { dayKeyFor } from '../logic/time.js';

const STORAGE_KEY = 'day-tracker';

let data = null;
let saveError = null;
const listeners = new Set();

function readStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    saveError = err;
    return createInitialData();
  }
  if (!raw) return createInitialData();

  try {
    return migrate(JSON.parse(raw));
  } catch (err) {
    if (err instanceof ReferenceError) throw err; // a missing browser feature, not bad data: keep it where it is
    // Never silently lose data: keep the unreadable copy aside, then start fresh.
    console.error('Stored data could not be read; a copy was kept aside.', err);
    try {
      localStorage.setItem(`${STORAGE_KEY}:unreadable:${Date.now()}`, raw);
    } catch {
      /* storage full or blocked — nothing more we can do */
    }
    return createInitialData();
  }
}

function writeStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    saveError = null;
  } catch (err) {
    saveError = err;
    console.error('Could not save data.', err);
  }
}

export function getData() {
  if (!data) data = readStorage();
  return data;
}

/** Last storage error, if saving is currently failing (shown as a banner). */
export function getSaveError() {
  return saveError;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Applies `mutator` to a copy of the data, saves it and notifies subscribers.
 * Pass { notify: false } for changes that must not re-render (typing in a note).
 */
export function update(mutator, { notify = true } = {}) {
  const draft = clone(getData());
  mutator(draft);
  data = draft;
  writeStorage();
  if (notify) for (const listener of listeners) listener(data);
}

/**
 * Like update(), but for one day; creates the day record if it does not exist yet.
 * A record made for a later day is marked `planOnly`: until something is changed on the day
 * itself it counts as a day the app was not opened (no workout carry-over, "нет данных").
 */
export function updateDay(dayKey, mutator, options) {
  update((draft) => {
    const todayKey = dayKeyFor(new Date(), draft.settings.dayBoundary);
    // The first mark ever starts tracking today (not on an edited earlier day): days before it are not misses.
    draft.settings.trackingSince ??= todayKey;
    const ahead = dayKey > todayKey;
    const day = (draft.days[dayKey] ??= ahead ? { ...createDay(), planOnly: true } : createDay());
    if (!ahead) delete day.planOnly;
    day.done ??= {}; // a day from an old or hand-edited backup may lack these
    day.minimum ??= {};
    mutator(day);
  }, options);
}

/** Replaces everything (used when restoring a backup). `next` must already be migrated. */
export function replaceAll(next) {
  data = clone(next);
  writeStorage();
  for (const listener of listeners) listener(data);
}
