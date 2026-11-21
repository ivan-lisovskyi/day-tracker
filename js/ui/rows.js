/** Shared rows: a big tappable checkbox row and a read-only status row. */
import { h } from './dom.js';

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
