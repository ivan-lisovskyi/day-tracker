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

/** Day modes (kept here, not imported from logic, so the data layer has no dependencies). */
const DAY_MODES = ['normal', 'minimum', 'sick'];

export const SCHEMA_VERSION = 1;

/** MIGRATIONS[n] turns version n data into version n + 1. */
const MIGRATIONS = {
  // 1: (data) => ({ ...data, newField: ... }),
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createInitialData() {
  return { schemaVersion: SCHEMA_VERSION, settings: createDefaultSettings(), days: {} };
}

/** An empty day record. Days are created lazily, on the first change. */
export function createDay() {
  return {
    mode: 'normal',
    done: {},
    minimum: { cbr10: false, code15: false },
    applications: 0,
    drivingLesson: null,
    note: '',
  };
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

// ---------- validation ----------
// Data can come from an old version, a hand-edited backup or a foreign file. Anything broken is
// replaced by the default (settings) or dropped (day fields), so one bad value can never make
// the app crash on start. Valid data passes through unchanged.

const BLOCK_KINDS = new Set(['sleep', 'workout', 'meal', 'focus', 'free', 'evening']);
const TIME_SETTINGS = ['dayBoundary', 'wakeTarget', 'bedTarget', 'lateBedThreshold', 'shutdownFrom'];
const NUMBER_SETTINGS = ['wakeToleranceMin', 'drivingTravelMin', 'weeklyApplicationsGoal'];
const STAMP_SETTINGS = ['lastBackupAt', 'backupReminderDismissedAt'];

const isString = (value) => typeof value === 'string';
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isDateKey = (value) => isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);

function isTime(value) {
  if (!isString(value)) return false;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return Boolean(match) && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function isStamp(value) {
  return isString(value) && isDateKey(value.slice(0, 10)) && value[10] === 'T' && isTime(value.slice(11, 16));
}

const isRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

function isCheckin(checkin) {
  return isPlainObject(checkin) && isRating(checkin.sleep) && isRating(checkin.energy);
}

function isTask(task) {
  return isPlainObject(task) && isString(task.id) && isString(task.title);
}

function isBlock(block) {
  return isPlainObject(block) && isString(block.id) && isString(block.title) && BLOCK_KINDS.has(block.kind)
    && isTime(block.start) && (block.end === undefined || isTime(block.end))
    && (block.tasks === undefined || (Array.isArray(block.tasks) && block.tasks.every(isTask)));
}

function normalizeSettings(input) {
  const defaults = createDefaultSettings();
  const settings = isPlainObject(input) ? input : {};
  const result = { ...defaults, ...settings };

  for (const key of TIME_SETTINGS) if (!isTime(result[key])) result[key] = defaults[key];
  for (const key of NUMBER_SETTINGS) if (!isCount(result[key])) result[key] = defaults[key];
  for (const key of STAMP_SETTINGS) if (result[key] !== null && !isStamp(result[key])) result[key] = null;

  result.workoutDays = Array.isArray(settings.workoutDays)
    ? settings.workoutDays.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    : defaults.workoutDays;

  const workout = { ...defaults.workout, ...(isPlainObject(settings.workout) ? settings.workout : {}) };
  for (const key of ['title', 'restTitle', 'details', 'restDetails']) {
    if (!isString(workout[key])) workout[key] = defaults.workout[key];
  }
  for (const key of ['durationMin', 'restDurationMin']) {
    if (!isCount(workout[key]) || workout[key] === 0) workout[key] = defaults.workout[key];
  }
  result.workout = workout;

  result.blocks = Array.isArray(settings.blocks) ? settings.blocks.filter(isBlock) : defaults.blocks;
  return result;
}

function normalizeDay(day) {
  const result = { ...day };
  if ('mode' in result && !DAY_MODES.includes(result.mode)) result.mode = 'normal';
  for (const key of ['wakeAt', 'bedAt', 'closedAt']) if (key in result && !isStamp(result[key])) delete result[key];
  if ('focus' in result && !isString(result.focus)) delete result.focus;
  if ('checkin' in result && !isCheckin(result.checkin)) delete result.checkin;
  if ('applications' in result && !isCount(result.applications)) result.applications = 0;
  if ('note' in result && !isString(result.note)) result.note = '';
  for (const key of ['done', 'minimum']) if (key in result && !isPlainObject(result[key])) result[key] = {};
  if ('drivingLesson' in result && result.drivingLesson !== null) {
    const lesson = result.drivingLesson;
    if (!isPlainObject(lesson) || !isTime(lesson.start) || !isTime(lesson.end)) result.drivingLesson = null;
  }
  return result;
}

function normalizeDays(input) {
  if (!isPlainObject(input)) return {};
  const days = {};
  for (const [key, day] of Object.entries(input)) {
    if (isDateKey(key) && isPlainObject(day)) days[key] = normalizeDay(day);
  }
  return days;
}

function normalize(data) {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: normalizeSettings(data.settings),
    days: normalizeDays(data.days),
  };
}
