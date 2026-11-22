/**
 * "Подстроить план с ИИ": what is sent to the server and what may come back.
 *
 * The model only proposes; this module decides what a proposal means and whether it is
 * acceptable. Every proposal is checked against the current settings before it is shown and
 * again before it is applied, so a broken or stale proposal can never change the plan.
 * Pure functions, no network and no storage.
 */
import { formatMinutes, toDayMinutes } from './time.js';

export const MAX_PROPOSALS = 4;
const MIN_BLOCK_MINUTES = 5;

const TIME_TARGETS = {
  wakeTarget: 'Подъём',
  bedTarget: 'Отбой',
  lateBedThreshold: '«Поздно лёг» — позже',
  shutdownFrom: 'Закрытие дня — с',
};

const COUNT_TARGETS = {
  weeklyApplicationsGoal: { title: 'Отклики в неделю', min: 0, max: 50 },
  workoutsPerWeek: { title: 'Тренировок в неделю', min: 1, max: 7 },
};

/** Blocks whose length comes from elsewhere (workout settings), so the model may not move them. */
const isFixedBlock = (block) => block.kind === 'workout';

// ---------- request ----------

/** The part of the settings the model sees and may propose to change. */
export function buildPlanContext(settings) {
  return {
    dayBoundary: settings.dayBoundary,
    wakeTarget: settings.wakeTarget,
    wakeToleranceMin: settings.wakeToleranceMin,
    bedTarget: settings.bedTarget,
    lateBedThreshold: settings.lateBedThreshold,
    shutdownFrom: settings.shutdownFrom,
    weeklyApplicationsGoal: settings.weeklyApplicationsGoal,
    workoutMode: settings.workoutMode,
    workoutsPerWeek: settings.workoutMode === 'weekly' ? settings.workoutsPerWeek : null,
    blocks: settings.blocks.map((block) => {
      const [start, end] = blockSpan(block, settings);
      return {
        id: block.id,
        title: block.title,
        kind: block.kind,
        start: formatMinutes(start),
        end: formatMinutes(end),
        ...(isFixedBlock(block) ? { fixed: true } : {}),
      };
    }),
  };
}

// ---------- response ----------

/**
 * Keeps only well-formed proposals from a server reply: known fields with the right types,
 * one per target (or per block), at most MAX_PROPOSALS. Whether a proposal fits the current
 * plan is a separate question: describeProposal.
 */
export function sanitizeProposals(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    const proposal = {
      target: text(item.target),
      blockId: text(item.blockId),
      value: text(item.value),
      start: text(item.start),
      end: text(item.end),
      reason: text(item.reason) ?? '',
    };
    const key = proposal.target === 'block' ? `block:${proposal.blockId}` : proposal.target;
    if (!key || seen.has(key)) continue;
    if (!(proposal.target === 'block' || proposal.target in TIME_TARGETS || proposal.target in COUNT_TARGETS)) continue;
    seen.add(key);
    result.push(proposal);
    if (result.length === MAX_PROPOSALS) break;
  }
  return result;
}

/**
 * What a proposal would change in these settings: { title, from, to, next }, or null when it
 * does not fit (unknown block, bad value, no change, breaks the order of the day, overlaps).
 * `next` is the normalized new value: a string, a number, or { start, end } for a block.
 */
export function describeProposal(proposal, settings) {
  const { target } = proposal;
  const boundary = settings.dayBoundary;

  if (target in TIME_TARGETS) {
    const next = normalizeTime(proposal.value);
    if (!next || next === settings[target]) return null;
    if (!isDayOrderValid({ ...settings, [target]: next }, target)) return null;
    return { title: TIME_TARGETS[target], from: settings[target], to: next, next };
  }

  if (target in COUNT_TARGETS) {
    if (target === 'workoutsPerWeek' && settings.workoutMode !== 'weekly') return null;
    const { title, min, max } = COUNT_TARGETS[target];
    if (!/^\d{1,3}$/.test(proposal.value ?? '')) return null;
    const next = Number(proposal.value);
    if (next < min || next > max || next === settings[target]) return null;
    return { title, from: String(settings[target]), to: String(next), next };
  }

  if (target === 'block') {
    const block = settings.blocks.find((item) => item.id === proposal.blockId);
    if (!block || isFixedBlock(block)) return null;
    const start = normalizeTime(proposal.start);
    const end = normalizeTime(proposal.end);
    if (!start || !end) return null;

    const [oldStart, oldEnd] = blockSpan(block, settings);
    const newStart = toDayMinutes(start, boundary);
    const newEnd = toDayMinutes(end, boundary);
    const isMarker = oldStart === oldEnd; // a point in time such as "Отбой 01:00"
    if (isMarker ? newEnd !== newStart : newEnd - newStart < MIN_BLOCK_MINUTES) return null;
    if (newStart === oldStart && newEnd === oldEnd) return null;

    const overlaps = settings.blocks.some((other) => {
      if (other.id === block.id) return false;
      const [otherStart, otherEnd] = blockSpan(other, settings);
      return otherStart < otherEnd && newStart < otherEnd && otherStart < newEnd;
    });
    if (overlaps) return null;

    return {
      title: block.title,
      from: spanLabel(oldStart, oldEnd),
      to: spanLabel(newStart, newEnd),
      next: { start, end },
    };
  }

  return null;
}

/**
 * Applies a proposal to a settings draft. Returns what is needed to undo it, or null when the
 * proposal no longer fits (then nothing is changed).
 */
export function applyProposal(settings, proposal) {
  const described = describeProposal(proposal, settings);
  if (!described) return null;

  if (proposal.target === 'block') {
    const block = settings.blocks.find((item) => item.id === proposal.blockId);
    const undo = { target: 'block', blockId: block.id, previous: { start: block.start, end: block.end } };
    block.start = described.next.start;
    block.end = described.next.end;
    return undo;
  }

  const undo = { target: proposal.target, previous: settings[proposal.target] };
  settings[proposal.target] = described.next;
  return undo;
}

/** Puts back what applyProposal changed (the block may have been deleted since: then nothing). */
export function revertProposal(settings, undo) {
  if (undo.target === 'block') {
    const block = settings.blocks.find((item) => item.id === undo.blockId);
    if (!block) return;
    block.start = undo.previous.start;
    if (undo.previous.end === undefined) delete block.end;
    else block.end = undo.previous.end;
    return;
  }
  settings[undo.target] = undo.previous;
}

// ---------- internals ----------

/** "9:5" is not a time; "09:05" and "9:05" are. Returns "HH:MM" or null. */
function normalizeTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** The day must still read wake → close the day → bed → "late", around the changed time. */
function isDayOrderValid(settings, changed) {
  const at = (key) => toDayMinutes(settings[key], settings.dayBoundary);
  const checks = {
    wakeTarget: () => at('wakeTarget') < at('bedTarget') && at('wakeTarget') < at('shutdownFrom'),
    bedTarget: () => at('wakeTarget') < at('bedTarget') && at('bedTarget') <= at('lateBedThreshold'),
    lateBedThreshold: () => at('bedTarget') <= at('lateBedThreshold'),
    shutdownFrom: () => at('wakeTarget') < at('shutdownFrom'),
  };
  return checks[changed]();
}

/** Start and end of a template block in day minutes; a workout block is as long as the longer variant. */
function blockSpan(block, settings) {
  const start = toDayMinutes(block.start, settings.dayBoundary);
  if (isFixedBlock(block)) {
    return [start, start + Math.max(settings.workout.durationMin, settings.workout.restDurationMin)];
  }
  return [start, Math.max(start, toDayMinutes(block.end ?? block.start, settings.dayBoundary))];
}

const spanLabel = (start, end) => (start === end ? formatMinutes(start) : `${formatMinutes(start)}–${formatMinutes(end)}`);
