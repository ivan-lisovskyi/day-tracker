/** Shared rows: a big tappable checkbox row, a read-only status row and a schedule task row. */
import { h } from './dom.js';
import { addDays, weekStart } from '../logic/time.js';
import { isSkipped, isWeeklyWorkoutGoal, isWorkoutPlanned, weeklyWorkoutProgress } from '../logic/rules.js';
import { showToast } from './toast.js';

/** Marks a task done, with "Отменить" in a short note instead of a question before. */
export function tickTask(task, edit) {
  edit((d) => {
    d.done[task.id] = true;
    if (d.skipped) delete d.skipped[task.id];
  });
  showToast(`Отмечено: ${task.title}`, () => edit((d) => { delete d.done[task.id]; }));
}

function skipTask(task, edit) {
  edit((d) => { (d.skipped ??= {})[task.id] = true; });
  showToast(`Пропущено: ${task.title}`, () => edit((d) => { if (d.skipped) delete d.skipped[task.id]; }));
}

export function checkRow({ checked, label, hint = null, disabled = false, nested = false, onChange }) {
  return h('label', { class: `check${checked ? ' is-done' : ''}${nested ? ' check--nested' : ''}` },
    h('input', {
      type: 'checkbox', class: 'check__box', checked, disabled,
      onchange: (e) => onChange(e.target.checked),
    }),
    h('span', { class: 'check__text' }, label, hint && h('small', { class: 'check__hint' }, hint)),
  );
}

export function statusRow(ok, label, hint) {
  return h('div', { class: `status-row${ok ? ' is-done' : ''}` },
    h('span', { class: 'status-row__icon', 'aria-hidden': 'true' }, ok ? '✓' : ''),
    h('span', { class: 'check__text' }, label, hint && h('small', { class: 'check__hint' }, hint)),
    h('span', { class: 'visually-hidden' }, ok ? 'выполнено' : 'не выполнено'),
  );
}

/** A row of 1–5 buttons (check-in ratings). */
export function ratingRow({ label, value, onPick }) {
  return h('div', { class: 'rating', role: 'radiogroup', 'aria-label': label },
    h('span', { class: 'rating__label' }, label),
    h('div', { class: 'rating__buttons' },
      [1, 2, 3, 4, 5].map((n) => h('button', {
        class: 'rating__btn', role: 'radio', 'aria-checked': String(value === n), 'aria-label': `${label}: ${n} из 5`,
        onclick: () => onPick(n),
      }, String(n)))),
  );
}

/**
 * A task of the schedule: a checkbox with a quiet "пропустить" next to it. A skipped task is
 * neutral for streaks (not a miss) and can be brought back; ticking it clears the skip.
 */
export function taskRow(task, day, edit) {
  if (isSkipped(day, task.id)) {
    return h('div', { class: 'task-line' },
      h('div', { class: 'status-row is-skipped' },
        h('span', { class: 'status-row__icon', 'aria-hidden': 'true' }, '–'),
        h('span', { class: 'check__text' }, task.title, h('small', { class: 'check__hint' }, 'пропущено — серия не пострадает'))),
      h('button', {
        class: 'link-btn link-btn--quiet', 'aria-label': `Вернуть: ${task.title}`,
        onclick: () => edit((d) => { delete d.skipped[task.id]; }),
      }, 'вернуть'),
    );
  }

  const checked = day.done?.[task.id] === true;
  return h('div', { class: 'task-line' },
    checkRow({
      checked,
      label: task.title,
      onChange: (value) => {
        if (value) tickTask(task, edit);
        else edit((d) => { delete d.done[task.id]; });
      },
    }),
    !checked && h('button', {
      class: 'link-btn link-btn--quiet', 'aria-label': `Пропустить сегодня: ${task.title}`,
      onclick: () => skipTask(task, edit),
    }, 'пропустить'),
  );
}

/**
 * Workout goal "N times a week": the week's progress and a link that swaps today's plan
 * (workout ↔ stretching). Shown in the workout block; null in fixed-weekday mode.
 */
export function workoutGoalLine({ settings, days, dayKey, day, edit, past }) {
  if (!isWeeklyWorkoutGoal(settings)) return null;
  // On an earlier day the whole week is over (or still going): count all of it, not up to that day.
  const progressKey = past ? addDays(weekStart(dayKey), 6) : dayKey;
  const { done, goal } = weeklyWorkoutProgress(progressKey, days, settings);
  const planned = isWorkoutPlanned(dayKey, days, settings);
  // Short link text: the first word of the other activity's title ("гиря", "растяжка").
  const other = (planned ? settings.workout.restTitle : settings.workout.title).trim().split(/\s+/)[0].toLowerCase();

  return h('p', { class: 'workout-goal' },
    h('span', {}, `За неделю: ${done} из ${goal}`),
    !day.done?.workout && h('button', {
      class: 'link-btn',
      onclick: () => edit((d) => { d.workoutChoice = planned ? 'stretch' : 'workout'; }),
    }, past ? `было: ${other}` : `сегодня ${other}`),
  );
}
