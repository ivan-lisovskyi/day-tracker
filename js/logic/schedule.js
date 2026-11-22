/**
 * Builds the timeline of a single day from the settings template.
 * Pure functions: settings + day record in, list of blocks out.
 *
 * Output blocks use day minutes (see time.js), so 01:00 at night is 1500.
 */
import { isoWeekday, toDayMinutes } from './time.js';

/** Kinds still shown in "sick" mode: only the sleep routine counts on those days. */
const SICK_MODE_KINDS = new Set(['sleep']);

export function isWorkoutDay(dayKey, settings) {
  return settings.workoutDays.includes(isoWeekday(dayKey));
}

/**
 * @param {object} p
 * @param {object} p.settings
 * @param {string} p.dayKey          "YYYY-MM-DD"
 * @param {object} [p.day]           the day record (mode, drivingLesson, …)
 * @param {boolean} [p.pendingWorkout] a missed workout carried over from yesterday
 * @returns {{ blocks: object[], unplaced: object[], workoutToday: boolean }}
 *   unplaced — parts of blocks that a driving lesson displaced and no free time could fit
 */
export function buildDaySchedule({ settings, dayKey, day = {}, pendingWorkout = false }) {
  const regularWorkout = isWorkoutDay(dayKey, settings);
  const workoutToday = regularWorkout || pendingWorkout;

  let blocks = expandTemplate(settings, { workoutToday, carriedOver: pendingWorkout && !regularWorkout });
  let unplaced = [];

  if (day?.mode === 'sick') {
    // No lesson on a sick day, so nothing is moved or marked as a conflict either.
    blocks = blocks.filter((block) => SICK_MODE_KINDS.has(block.kind));
  } else if (day?.drivingLesson) {
    ({ blocks, unplaced } = applyDrivingLesson(blocks, day.drivingLesson, settings));
  }

  blocks.sort((a, b) => a.start - b.start || a.end - b.end);
  return { blocks, unplaced, workoutToday };
}

/**
 * The block happening at `minutes` (day minutes), or null. Zero-length markers are skipped.
 * When blocks overlap, one that a driving lesson pushed aside (`conflict`) loses to the lesson
 * itself; otherwise the latest start wins.
 */
export function findCurrentBlock(blocks, minutes) {
  let current = null;
  for (const block of blocks) {
    if (!(block.start <= minutes && minutes < block.end)) continue;
    if (current && block.conflict && !current.conflict) continue;
    current = block;
  }
  return current;
}

/**
 * What is happening now and what comes next, for the "Сейчас" card.
 * @returns {{ current: object|null, next: object|null, remainingMin: number|null, progress: number|null }}
 *   progress is 0..1 through the current block; next is the first block starting after now
 *   (zero-length markers such as "Отбой 01:00" included).
 */
export function nowAndNext(blocks, minutes) {
  const current = findCurrentBlock(blocks, minutes);
  const next = blocks
    .filter((block) => block.start > minutes && block !== current)
    .sort((a, b) => a.start - b.start)[0] ?? null;

  if (!current) return { current: null, next, remainingMin: null, progress: null };
  return {
    current,
    next,
    remainingMin: current.end - minutes,
    progress: (minutes - current.start) / (current.end - current.start),
  };
}

// ---------- internals ----------

function expandTemplate(settings, { workoutToday, carriedOver }) {
  const boundary = settings.dayBoundary;

  return settings.blocks.map((template) => {
    const start = toDayMinutes(template.start, boundary);
    const end = Math.max(start, toDayMinutes(template.end ?? template.start, boundary));
    const block = {
      id: template.id,
      sourceId: template.id,
      title: template.title,
      group: template.group ?? null,
      kind: template.kind,
      movable: Boolean(template.movable),
      start,
      end,
      tasks: template.tasks ?? [],
      details: template.details ?? null,
    };
    return template.kind === 'workout' ? workoutVariant(block, settings.workout, workoutToday, carriedOver) : block;
  });
}

function workoutVariant(block, workout, isWorkout, carriedOver) {
  if (isWorkout) {
    return {
      ...block,
      title: workout.title,
      details: workout.details || null,
      end: block.start + workout.durationMin,
      tasks: [{ id: 'workout', title: workout.title }],
      carriedOver,
    };
  }
  return {
    ...block,
    title: workout.restTitle,
    details: workout.restDetails || null,
    end: block.start + workout.restDurationMin,
    tasks: [{ id: 'stretch', title: workout.restTitle }],
  };
}

/**
 * Rebuilds the day around a driving lesson:
 * - inserts "travel → lesson → travel back" blocks;
 * - movable blocks lose the overlapping part, which is moved into free blocks (earliest first);
 * - free blocks shrink;
 * - fixed blocks (meals, sleep…) stay and get `conflict: true`;
 * - whatever does not fit is returned in `unplaced`.
 */
function applyDrivingLesson(blocks, lesson, settings) {
  const boundary = settings.dayBoundary;
  const lessonStart = toDayMinutes(lesson.start, boundary);
  const lessonEnd = toDayMinutes(lesson.end, boundary);
  if (!(lessonEnd > lessonStart)) return { blocks, unplaced: [] };

  const travel = settings.drivingTravelMin;
  const windowStart = lessonStart - travel;
  const windowEnd = lessonEnd + travel;

  const kept = [];
  const freeSlots = [];
  const displaced = [];

  for (const block of blocks) {
    const overlap = Math.min(block.end, windowEnd) - Math.max(block.start, windowStart);
    const markerInside = block.start === block.end && block.start > windowStart && block.start < windowEnd;

    if (overlap <= 0 && !markerInside) {
      (block.kind === 'free' ? freeSlots : kept).push({ ...block });
    } else if (block.kind === 'free') {
      freeSlots.push(...outsidePieces(block, windowStart, windowEnd));
    } else if (block.movable) {
      kept.push(...outsidePieces(block, windowStart, windowEnd));
      displaced.push({ block, minutes: overlap });
    } else {
      kept.push({ ...block, conflict: true });
    }
  }

  const { placed, unplaced } = placeIntoFreeSlots(displaced, freeSlots);
  const remainingFree = freeSlots.filter((slot) => slot.end > slot.start);

  return {
    blocks: [...kept, ...placed, ...remainingFree, ...drivingBlocks(windowStart, lessonStart, lessonEnd, windowEnd)],
    unplaced,
  };
}

/** Parts of `block` outside [windowStart, windowEnd): zero, one or two pieces. */
function outsidePieces(block, windowStart, windowEnd) {
  const pieces = [];
  if (block.start < windowStart) pieces.push({ ...block, end: Math.min(block.end, windowStart) });
  if (block.end > windowEnd) pieces.push({ ...block, start: Math.max(block.start, windowEnd) });
  return pieces.map((piece, i) => ({ ...piece, id: pieces.length > 1 ? `${block.id}#${i + 1}` : block.id }));
}

/** Fills free slots from their start, in time order. Mutates the slots (they are copies). */
function placeIntoFreeSlots(displaced, freeSlots) {
  freeSlots.sort((a, b) => a.start - b.start);
  displaced.sort((a, b) => a.block.start - b.block.start);

  const placed = [];
  const unplaced = [];

  for (const { block, minutes } of displaced) {
    let left = minutes;
    let part = 0;
    for (const slot of freeSlots) {
      if (left === 0) break;
      const take = Math.min(slot.end - slot.start, left);
      if (take <= 0) continue;
      part += 1;
      placed.push({
        ...block,
        id: `${block.id}~moved${part > 1 ? part : ''}`,
        start: slot.start,
        end: slot.start + take,
        moved: true,
      });
      slot.start += take;
      left -= take;
    }
    if (left > 0) unplaced.push({ sourceId: block.id, title: block.title, minutes: left, tasks: block.tasks });
  }

  return { placed, unplaced };
}

function drivingBlocks(windowStart, lessonStart, lessonEnd, windowEnd) {
  const base = { group: null, kind: 'driving', movable: false, details: null, sourceId: 'driving' };
  const blocks = [
    { ...base, id: 'driving', title: 'Урок вождения', start: lessonStart, end: lessonEnd,
      tasks: [{ id: 'driving', title: 'Урок вождения' }] },
  ];
  if (lessonStart > windowStart) {
    blocks.unshift({ ...base, id: 'driving-to', title: 'Дорога на урок', start: windowStart, end: lessonStart, tasks: [] });
  }
  if (windowEnd > lessonEnd) {
    blocks.push({ ...base, id: 'driving-back', title: 'Дорога обратно', start: lessonEnd, end: windowEnd, tasks: [] });
  }
  return blocks;
}
