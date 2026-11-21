/**
 * Shape and versioning of the stored data.
 *
 * {
 *   schemaVersion: 1,
 *   settings: { ...see defaults.js },
 *   days: {
 *     "2026-11-23": {
 *       mode: "normal" | "minimum" | "sick",
 *       wakeAt: "2026-11-23T09:12",          // local stamp
 *       bedAt:  "2026-11-24T01:20",          // may be after midnight
 *       drivingLesson: { start: "14:00", end: "15:00" } | null,
 *       done: { [taskId]: true },
 *       minimum: { cbr10: bool, code15: bool },
 *       applications: 1,
 *       note: "",
 *       minimumSuggestionDismissed: bool
 *     }
 *   }
 * }
 *
 * When the shape changes: bump SCHEMA_VERSION and add MIGRATIONS[oldVersion].
 * Pure module (no storage access) so it can be tested in Node.
 */
import { createDefaultSettings } from './defaults.js';

export const SCHEMA_VERSION = 1;

/** MIGRATIONS[n] turns version n data into version n + 1. */
const MIGRATIONS = {
  // 1: (data) => ({ ...data, newField: ... }),
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createInitialData() {
  return { schemaVersion: SCHEMA_VERSION, settings: createDefaultSettings(), days: {} };
}

/**
 * Validates data (from storage or an imported backup), upgrades it to the current
 * schema and fills in settings that older versions did not have.
 * Throws an Error with a user-facing (Russian) message if the data is unusable.
 */
export function migrate(input) {
  if (!isPlainObject(input)) throw new Error('Файл не похож на бэкап трекера.');

  let version = input.schemaVersion;
  if (!Number.isInteger(version) || version < 1) throw new Error('В данных нет корректной версии схемы.');
  if (version > SCHEMA_VERSION) throw new Error('Данные из более новой версии приложения — обнови приложение.');

  let data = structuredClone(input);
  while (version < SCHEMA_VERSION) {
    data = MIGRATIONS[version](data);
    version += 1;
    data.schemaVersion = version;
  }

  return normalize(data);
}

function normalize(data) {
  const defaults = createDefaultSettings();
  const settings = isPlainObject(data.settings) ? data.settings : {};

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      ...defaults,
      ...settings,
      workout: { ...defaults.workout, ...(isPlainObject(settings.workout) ? settings.workout : {}) },
      blocks: Array.isArray(settings.blocks) ? settings.blocks : defaults.blocks,
      workoutDays: Array.isArray(settings.workoutDays) ? settings.workoutDays : defaults.workoutDays,
    },
    days: isPlainObject(data.days) ? data.days : {},
  };
}
