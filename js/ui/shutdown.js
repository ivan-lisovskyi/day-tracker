/**
 * Evening "close the day": a short review of today and a plan for tomorrow
 * (mode, driving lesson, the one main thing). Closing the day is itself a habit with a streak.
 */
import { h } from './dom.js';
import * as store from '../state/store.js';
import { addDays, stampTime, toDayMinutes, toStamp } from '../logic/time.js';
import { minimumStatus } from '../logic/rules.js';
import { countDayTasks } from '../logic/dayView.js';

const TOMORROW_MODES = [['normal', 'Обычный'], ['minimum', 'Минимум']];
const DEFAULT_LESSON = { start: '10:00', end: '11:00' };

/** Collapsed evening prompt: one line of summary and a button that opens the full form. */
export function shutdownPrompt({ dayKey, day, settings, schedule, expandShutdown }) {
  const minimum = day.mode === 'sick' ? null : minimumStatus(day, dayKey, settings);
  const summary = [
    tasksLine(schedule, day),
    minimum && (minimum.met ? 'минимум выполнен ✓' : 'минимум пока не выполнен'),
  ].filter(Boolean).join(' · ');

  return h('section', { class: 'card shutdown shutdown--prompt' },
    h('h2', { class: 'card__title' }, 'Пора закрыть день'),
    h('p', { class: 'muted hint hint--top' }, summary),
    h('button', { class: 'btn btn--primary btn--block', onclick: expandShutdown }, 'Подвести итог'),
  );
}

export function shutdownCard({ days, dayKey, day, settings, schedule, edit, expandShutdown, collapseShutdown }) {
  const tomorrowKey = addDays(dayKey, 1);
  const tomorrow = days[tomorrowKey] ?? {};
  const editTomorrow = (mutator) => store.updateDay(tomorrowKey, mutator);

  if (day.closedAt) {
    return h('section', { class: 'card shutdown shutdown--closed' },
      h('div', { class: 'card__head' },
        h('h2', { class: 'card__title' }, 'День закрыт'),
        h('span', { class: 'badge badge--success' }, `✓ ${stampTime(day.closedAt)}`),
      ),
      tomorrow.focus && h('p', {}, h('span', { class: 'muted' }, 'Главное на завтра: '), tomorrow.focus),
      h('button', {
        class: 'link-btn',
        onclick: () => { expandShutdown(); edit((d) => { delete d.closedAt; }); }, // reopen straight into the form
      }, 'Открыть снова'),
    );
  }

  const minimum = day.mode === 'sick' ? null : minimumStatus(day, dayKey, settings);

  return h('section', { class: 'card shutdown' },
    h('div', { class: 'card__head' },
      h('h2', { class: 'card__title' }, 'Закрыть день'),
      h('button', { class: 'link-btn', onclick: collapseShutdown }, 'Свернуть'),
    ),

    h('ul', { class: 'shutdown__summary' },
      minimum && h('li', {}, minimum.met ? 'Минимум выполнен ✓' : 'Минимум не выполнен — завтра новый день'),
      h('li', {}, tasksLine(schedule, day)),
      day.mode !== 'sick' && h('li', {}, `Откликов сегодня: ${day.applications ?? 0}`),
    ),

    h('label', { class: 'field' },
      h('span', {}, 'Как прошёл день? Что помогло, что мешало'),
      h('textarea', {
        class: 'input textarea', rows: 3, placeholder: 'Пара слов — для разбора недели с Claude',
        oninput: (e) => edit((d) => { d.note = e.target.value; }, { notify: false }),
      }, day.note ?? ''),
    ),

    h('p', { class: 'field-label' }, 'Завтра'),
    h('label', { class: 'field' },
      h('span', {}, 'Главное на завтра (одно дело)'),
      h('input', {
        class: 'input', type: 'text', value: tomorrow.focus ?? '', placeholder: 'например, «отправить 2 отклика»',
        onchange: (e) => editTomorrow((d) => {
          const v = e.target.value.trim();
          if (v) d.focus = v;
          else delete d.focus;
        }),
      }),
    ),
    h('div', { class: 'segmented segmented--two', role: 'radiogroup', 'aria-label': 'Режим на завтра' },
      TOMORROW_MODES.map(([value, label]) => h('button', {
        class: 'segmented__item', role: 'radio', 'aria-checked': String((tomorrow.mode ?? 'normal') === value),
        onclick: () => editTomorrow((d) => { d.mode = value; }),
      }, label))),
    lessonFields(tomorrow.drivingLesson, editTomorrow, settings.dayBoundary),

    h('button', {
      class: 'btn btn--primary btn--block',
      onclick: () => edit((d) => { d.closedAt = toStamp(new Date()); }),
    }, 'Закрыть день'),
  );
}

/** Tomorrow's driving lesson, same as today's card: a button adds it, then both times are editable. */
function lessonFields(lesson, editTomorrow, boundary) {
  if (!lesson) {
    return h('button', {
      class: 'btn btn--block shutdown__lesson',
      onclick: () => editTomorrow((d) => { d.drivingLesson = { ...DEFAULT_LESSON }; }),
    }, '+ Урок вождения завтра');
  }

  const setTime = (field, value) => editTomorrow((d) => { if (value && d.drivingLesson) d.drivingLesson[field] = value; });
  const timeField = (label, field) => h('label', { class: 'field' },
    h('span', {}, label),
    h('input', {
      type: 'time', class: 'input input--time', value: lesson[field], onchange: (e) => setTime(field, e.target.value),
    }));
  const invalid = !(toDayMinutes(lesson.end, boundary) > toDayMinutes(lesson.start, boundary));

  return h('div', { class: 'shutdown__lesson' },
    h('p', { class: 'field-label' }, 'Урок вождения завтра'),
    h('div', { class: 'lesson-times' }, timeField('Начало', 'start'), timeField('Конец', 'end')),
    invalid && h('p', { class: 'hint hint--warning' }, 'Конец урока должен быть позже начала.'),
    h('button', { class: 'link-btn', onclick: () => editTomorrow((d) => { d.drivingLesson = null; }) }, 'Убрать урок'),
  );
}

/** "Задач отмечено: 5 из 7, пропущено 1" */
function tasksLine(schedule, day) {
  const { done, total, skipped } = countDayTasks(schedule, day);
  return `Задач отмечено: ${done} из ${total}${skipped ? `, пропущено ${skipped}` : ''}`;
}
