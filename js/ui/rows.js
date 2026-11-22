/** Shared rows: a big tappable checkbox row, a read-only status row and a schedule task row. */
import { h } from './dom.js';
import { isSkipped } from '../logic/rules.js';

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
      onChange: (value) => edit((d) => {
        if (value) {
          d.done[task.id] = true;
          if (d.skipped) delete d.skipped[task.id];
        } else {
          delete d.done[task.id];
        }
      }),
    }),
    !checked && h('button', {
      class: 'link-btn link-btn--quiet', 'aria-label': `Пропустить сегодня: ${task.title}`,
      onclick: () => edit((d) => { (d.skipped ??= {})[task.id] = true; }),
    }, 'пропустить'),
  );
}
