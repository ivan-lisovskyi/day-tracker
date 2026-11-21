/**
 * Evening "close the day": a short review of today and a plan for tomorrow
 * (mode, driving lesson, the one main thing). Closing the day is itself a habit with a streak.
 */
import { h } from './dom.js';
import * as store from '../state/store.js';
import { addDays, stampTime, toDayMinutes, toStamp } from '../logic/time.js';
import { minimumStatus } from '../logic/rules.js';

const TOMORROW_MODES = [['normal', 'Обычный'], ['minimum', 'Минимум']];

export function shutdownCard({ days, dayKey, day, settings, schedule, edit }) {
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
      h('button', { class: 'link-btn', onclick: () => edit((d) => { delete d.closedAt; }) }, 'Открыть снова'),
    );
  }

  const { done, total } = countTasks(schedule, day);
  const minimum = day.mode === 'sick' ? null : minimumStatus(day, dayKey, settings);

  return h('section', { class: 'card shutdown' },
    h('h2', { class: 'card__title' }, 'Закрыть день'),

    h('ul', { class: 'shutdown__summary' },
      minimum && h('li', {}, minimum.met ? 'Минимум выполнен ✓' : 'Минимум не выполнен — завтра новый день'),
      h('li', {}, `Задач отмечено: ${done} из ${total}`),
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

/** Tomorrow's driving lesson: two optional time fields; saved once both are filled. */
function lessonFields(lesson, editTomorrow, boundary) {
  const start = h('input', { type: 'time', class: 'input input--time', value: lesson?.start ?? '', 'aria-label': 'Начало урока' });
  const end = h('input', { type: 'time', class: 'input input--time', value: lesson?.end ?? '', 'aria-label': 'Конец урока' });
  const save = () => editTomorrow((d) => {
    if (start.value && end.value) d.drivingLesson = { start: start.value, end: end.value };
    else if (!start.value && !end.value) d.drivingLesson = null;
  });
  start.addEventListener('change', save);
  end.addEventListener('change', save);
  const invalid = lesson && !(toDayMinutes(lesson.end, boundary) > toDayMinutes(lesson.start, boundary));

  return h('div', { class: 'field' },
    h('span', {}, 'Урок вождения завтра (если есть)'),
    h('div', { class: 'lesson-times' }, start, end),
    invalid && h('p', { class: 'hint hint--warning' }, 'Конец урока должен быть позже начала.'),
  );
}

function countTasks(schedule, day) {
  const ids = new Set(schedule.blocks.flatMap((block) => block.tasks.map((task) => task.id)));
  const done = [...ids].filter((id) => day.done?.[id]).length;
  return { done, total: ids.size };
}
