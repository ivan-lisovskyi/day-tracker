/**
 * "Сейчас" bar: pinned at the bottom of the Today screen, just above the tabs, where the thumb
 * is. It shows the block running now, the time left and one "✓ Готово" for its next open task,
 * so the day's main action needs no scrolling. Tapping the text scrolls to the block.
 */
import { h } from './dom.js';
import { tickTask } from './rows.js';
import { formatDuration } from './format.js';
import { formatMinutes } from '../logic/time.js';
import { nowAndNext } from '../logic/schedule.js';
import { nextOpenTask } from '../logic/dayView.js';

export function nowBar({ day, schedule, nowMinutes, edit }) {
  const { current, next, remainingMin, progress } = nowAndNext(schedule.blocks, nowMinutes);
  if (!current && !next) return null; // the day is over: the evening review takes over

  const task = current && nextOpenTask(current, day);
  const nextText = next ? `дальше ${formatMinutes(next.start)} ${next.title}` : null;
  let title;
  let sub;
  if (current) {
    title = current.title;
    sub = [`осталось ${formatDuration(remainingMin)}`, nextText].filter(Boolean).join(' · ');
  } else {
    const started = schedule.blocks.some((block) => block.start <= nowMinutes);
    title = started ? 'Окно между делами' : 'День ещё не начался';
    sub = `${next.title} в ${formatMinutes(next.start)} · через ${formatDuration(next.start - nowMinutes)}`;
  }

  const showBlock = () => {
    const target = current ?? next;
    document.querySelector(`[data-block-id="${target.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return h('section', { class: `now-bar${current ? ' now-bar--active' : ''}`, 'aria-label': 'Сейчас' },
    current && h('div', {
      class: 'now-bar__progress', role: 'progressbar', 'aria-label': 'Прошло времени в блоке',
      'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(progress * 100),
    }, h('div', { class: 'now-bar__progress-bar', style: `width: ${Math.round(progress * 100)}%` })),
    h('button', { class: 'now-bar__info', onclick: showBlock },
      h('span', { class: 'now-bar__label' }, 'Сейчас'),
      h('span', { class: 'now-bar__title' }, title),
      h('span', { class: 'now-bar__sub' }, sub),
    ),
    task && h('button', {
      class: 'btn btn--primary now-bar__done',
      'aria-label': `Готово: ${task.title}`,
      onclick: () => tickTask(task, edit),
    }, '✓ Готово'),
  );
}
