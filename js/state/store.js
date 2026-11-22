/**
 * The single source of truth: data lives in memory and is mirrored to localStorage.
 * Screens read with getData(), change with update()/updateDay() and re-render via subscribe().
 *
 * Storage access is isolated here, so switching to IndexedDB later touches only this file.
 */
import { createDay, createInitialData, migrate } from './schema.js';

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
  const draft = structuredClone(getData());
  mutator(draft);
  data = draft;
  writeStorage();
  if (notify) for (const listener of listeners) listener(data);
}

/** Like update(), but for one day; creates the day record if it does not exist yet. */
export function updateDay(dayKey, mutator, options) {
  update((draft) => {
    const day = (draft.days[dayKey] ??= createDay());
    day.done ??= {}; // a day from an old or hand-edited backup may lack these
    day.minimum ??= {};
    mutator(day);
  }, options);
}

/** Replaces everything (used when restoring a backup). `next` must already be migrated. */
export function replaceAll(next) {
  data = structuredClone(next);
  writeStorage();
  for (const listener of listeners) listener(data);
}
