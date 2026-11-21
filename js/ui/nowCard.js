/**
 * "Сейчас" card at the top of the Today screen: the block running now with a progress bar
 * and its checkboxes, plus what comes next — so the day's main action needs no scrolling.
 */
import { h } from './dom.js';
import { checkRow } from './rows.js';
import { formatDuration, formatRange } from './format.js';
import { formatMinutes } from '../logic/time.js';
import { nowAndNext } from '../logic/schedule.js';

export function nowCard({ day, schedule, nowMinutes, edit }) {
  const { current, next, remainingMin, progress } = nowAndNext(schedule.blocks, nowMinutes);
  const focus = day.focus && h('p', { class: 'now-card__focus' },
    h('span', { class: 'now-card__label' }, 'Главное сегодня'), day.focus);
  const nextLine = next && h('p', { class: 'now-card__next' },
    `Дальше в ${formatMinutes(next.start)} — ${next.title}`);

  if (!current && !next) {
    return h('section', { class: 'card now-card' },
      focus,
      h('p', { class: 'now-card__label' }, 'Сейчас'),
      h('p', { class: 'now-card__title' }, 'День закончен'),
      h('p', { class: 'muted hint' }, day.closedAt ? 'Спокойной ночи.' : 'Закрой день и ложись спать.'),
    );
  }

  if (!current) {
    return h('section', { class: 'card now-card' },
      focus,
      h('p', { class: 'now-card__label' }, 'Сейчас'),
      h('p', { class: 'now-card__title' }, 'Окно между делами'),
      h('p', { class: 'muted hint' }, `Ещё ${formatDuration(next.start - nowMinutes)}`),
      nextLine,
    );
  }

  return h('section', { class: 'card now-card now-card--active' },
    focus,
    h('div', { class: 'now-card__head' },
      h('span', { class: 'now-card__label' }, 'Сейчас'),
      h('span', { class: 'now-card__time' }, formatRange(current.start, current.end)),
    ),
    h('p', { class: 'now-card__title' }, current.title),
    current.details && h('p', { class: 'block__details' }, current.details),
    h('div', {
      class: 'progress', role: 'progressbar', 'aria-label': 'Прошло времени в блоке',
      'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(progress * 100),
    }, h('div', { class: 'progress__bar', style: `width: ${Math.round(progress * 100)}%` })),
    h('p', { class: 'muted hint' }, `Осталось ${formatDuration(remainingMin)}`),
    current.tasks.map((task) => checkRow({
      checked: day.done?.[task.id] === true,
      label: task.title,
      onChange: (checked) => edit((d) => {
        if (checked) d.done[task.id] = true;
        else delete d.done[task.id];
      }),
    })),
    nextLine,
  );
}
