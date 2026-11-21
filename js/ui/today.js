/**
 * "Сегодня" screen: mode of the day, minimum, sleep, job applications,
 * driving lesson, the timeline with checkboxes and a note.
 *
 * The whole screen re-renders on every data change (it is small); the current
 * block highlight is refreshed every 30 s without a re-render.
 */
import { h } from './dom.js';
import { formatDayLabel, formatDuration, formatRange, plural } from './format.js';
import * as store from '../state/store.js';
import { createDay } from '../state/schema.js';
import {
  dayKeyFor, nowDayMinutes, stampFromDayTime, stampTime, toMinutes, toStamp, weekKeys, weekStart,
} from '../logic/time.js';
import { buildDaySchedule, findCurrentBlock } from '../logic/schedule.js';
import { hasPendingWorkout, isBedOnTime, minimumStatus, shouldSuggestMinimum } from '../logic/rules.js';
import { minimumStreak } from '../logic/streaks.js';

export const title = 'Сегодня';

const MODES = [
  ['normal', 'Обычный'],
  ['minimum', 'Минимум'],
  ['sick', 'Болею'],
];

const REFRESH_MS = 30_000;

export function render(root) {
  let dayKey = null;
  let schedule = null;

  const draw = () => {
    const now = new Date();
    const data = store.getData();
    dayKey = dayKeyFor(now, data.settings.dayBoundary);
    const view = buildScreen(data, dayKey, now);
    schedule = view.schedule;
    root.replaceChildren(...view.nodes);
  };

  const tick = () => {
    const now = new Date();
    const { settings } = store.getData();
    if (dayKeyFor(now, settings.dayBoundary) !== dayKey) draw(); // a new day started
    else highlightCurrent(root, schedule, nowDayMinutes(now, settings.dayBoundary));
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') draw(); // back from background: time has passed
  };

  draw();
  const unsubscribe = store.subscribe(draw);
  const timer = setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    unsubscribe();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function buildScreen(data, dayKey, now) {
  const { settings, days } = data;
  const day = days[dayKey] ?? createDay();
  const mode = day.mode ?? 'normal';
  const schedule = buildDaySchedule({
    settings, dayKey, day, pendingWorkout: hasPendingWorkout(dayKey, days, settings),
  });
  const ctx = {
    settings, days, dayKey, day, mode, schedule,
    nowMinutes: nowDayMinutes(now, settings.dayBoundary),
    edit: (mutator, options) => store.updateDay(dayKey, mutator, options),
  };

  const nodes = [
    saveErrorBanner(),
    lateNightBanner(ctx),
    modeCard(ctx),
    mode !== 'sick' && minimumCard(ctx),
    sleepCard(ctx),
    mode !== 'sick' && applicationsCard(ctx),
    mode !== 'sick' && drivingCard(ctx),
    timelineCard(ctx),
    noteCard(ctx),
  ].filter(Boolean);

  return { nodes, schedule };
}

// ---------- banners ----------

function saveErrorBanner() {
  if (!store.getSaveError()) return null;
  return h('div', { class: 'banner banner--danger', role: 'alert' },
    h('p', {}, 'Не получается сохранить данные. Сделай экспорт бэкапа в настройках.'));
}

function lateNightBanner({ settings, days, dayKey, edit }) {
  if (!shouldSuggestMinimum(dayKey, days, settings)) return null;
  return h('div', { class: 'banner banner--warning' },
    h('p', {}, 'Вчера лёг позже 02:00. Включить сегодня режим «минимум»?'),
    h('div', { class: 'banner__actions' },
      h('button', { class: 'btn btn--primary', onclick: () => edit((d) => { d.mode = 'minimum'; }) }, 'Включить'),
      h('button', { class: 'btn', onclick: () => edit((d) => { d.minimumSuggestionDismissed = true; }) }, 'Нет, обычный'),
    ),
  );
}

// ---------- mode ----------

function modeCard({ dayKey, mode, edit }) {
  return h('section', { class: 'card' },
    h('p', { class: 'day-label' }, formatDayLabel(dayKey)),
    h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Режим дня' },
      MODES.map(([value, label]) => h('button', {
        class: 'segmented__item',
        role: 'radio',
        'aria-checked': String(mode === value),
        onclick: () => edit((d) => { d.mode = value; }),
      }, label)),
    ),
    mode === 'minimum' && h('p', { class: 'muted hint' }, 'Плохой день — достаточно минимума. Остальное по желанию.'),
    mode === 'sick' && h('p', { class: 'muted hint' }, 'Выздоравливай. Сегодня отмечается только сон, серии не прервутся.'),
  );
}

// ---------- minimum ----------

function minimumCard({ settings, days, dayKey, day, mode, edit }) {
  const status = minimumStatus(day, dayKey, settings);
  const doneCount = [status.wake, status.cbr, status.work].filter(Boolean).length;
  const streak = minimumStreak(dayKey, days, settings);
  const deadline = addMinutes(settings.wakeTarget, settings.wakeToleranceMin);
  const applications = day.applications ?? 0;

  return h('section', { class: `card${mode === 'minimum' ? ' card--accent' : ''}` },
    h('div', { class: 'card__head' },
      h('h2', { class: 'card__title' }, 'Минимум дня'),
      h('span', { class: `badge${status.met ? ' badge--success' : ''}` }, status.met ? 'Засчитан' : `${doneCount} из 3`),
    ),
    statusRow(status.wake, `Подъём до ${deadline}`,
      day.wakeAt ? `встал в ${stampTime(day.wakeAt)}` : 'отметь подъём в блоке «Сон»'),
    checkRow({
      checked: status.cbr,
      disabled: Boolean(day.done?.cbr),
      label: '10 мин теории CBR',
      hint: day.done?.cbr ? 'засчитано: сделан час CBR' : null,
      onChange: (checked) => edit((d) => { d.minimum.cbr10 = checked; }),
    }),
    statusRow(status.work, '1 отклик или 15 мин кода',
      applications > 0 ? `откликов сегодня: ${applications}` : 'отклик можно добавить ниже'),
    checkRow({
      checked: Boolean(day.minimum?.code15 || day.done?.code),
      disabled: Boolean(day.done?.code),
      label: '15 мин кода',
      hint: day.done?.code ? 'засчитано: сделан блок кода' : null,
      nested: true,
      onChange: (checked) => edit((d) => { d.minimum.code15 = checked; }),
    }),
    h('p', { class: 'streak' }, `Серия: ${streak} ${plural(streak, 'день', 'дня', 'дней')}`),
  );
}

// ---------- sleep ----------

function sleepCard({ settings, dayKey, day, edit }) {
  const boundary = settings.dayBoundary;
  const setStamp = (field, value) => edit((d) => {
    if (value) d[field] = stampFromDayTime(dayKey, value, boundary);
    else delete d[field];
  });
  const lateBed = Boolean(day.bedAt) && !isBedOnTime(day, dayKey, settings);

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Сон'),
    timeRow({
      label: 'Подъём',
      value: day.wakeAt ? stampTime(day.wakeAt) : '',
      buttonLabel: 'Проснулся',
      onNow: () => edit((d) => { d.wakeAt = toStamp(new Date()); }),
      onChange: (value) => setStamp('wakeAt', value),
    }),
    timeRow({
      label: 'Отбой',
      value: day.bedAt ? stampTime(day.bedAt) : '',
      buttonLabel: 'Ложусь',
      onNow: () => edit((d) => { d.bedAt = toStamp(new Date()); }),
      onChange: (value) => setStamp('bedAt', value),
    }),
    lateBed && h('p', { class: 'hint hint--warning' }, `Позже ${settings.bedTarget} — завтра не дави на себя.`),
  );
}

function timeRow({ label, value, buttonLabel, onNow, onChange }) {
  const id = `time-${label}`;
  return h('div', { class: 'time-row' },
    h('label', { class: 'time-row__label', for: id }, label),
    h('input', {
      id, type: 'time', class: 'input input--time', value,
      onchange: (e) => onChange(e.target.value),
    }),
    h('button', { class: `btn${value ? '' : ' btn--primary'}`, onclick: onNow }, value ? 'Сейчас' : buttonLabel),
  );
}

// ---------- job applications ----------

function applicationsCard({ settings, days, dayKey, day, edit }) {
  const today = day.applications ?? 0;
  const goal = settings.weeklyApplicationsGoal;
  const weekTotal = weekKeys(weekStart(dayKey)).reduce((sum, key) => sum + (days[key]?.applications ?? 0), 0);
  const percent = goal > 0 ? Math.min(100, Math.round((weekTotal / goal) * 100)) : 100;

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Отклики на работу'),
    h('div', { class: 'stepper' },
      h('button', {
        class: 'btn stepper__btn', 'aria-label': 'Убрать отклик', disabled: today === 0,
        onclick: () => edit((d) => { d.applications = Math.max(0, (d.applications ?? 0) - 1); }),
      }, '−'),
      h('div', { class: 'stepper__value' }, h('strong', {}, String(today)), h('span', { class: 'muted' }, 'сегодня')),
      h('button', {
        class: 'btn btn--primary stepper__btn', 'aria-label': 'Добавить отклик',
        onclick: () => edit((d) => { d.applications = (d.applications ?? 0) + 1; }),
      }, '+'),
    ),
    h('div', {
      class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': goal, 'aria-valuenow': weekTotal,
      'aria-label': 'Отклики за неделю',
    }, h('div', { class: `progress__bar${weekTotal >= goal ? ' progress__bar--done' : ''}`, style: `width: ${percent}%` })),
    h('p', { class: 'muted hint' }, `За неделю: ${weekTotal} из ${goal}`),
  );
}

// ---------- driving lesson ----------

function drivingCard({ day, schedule, edit }) {
  const lesson = day.drivingLesson;

  if (!lesson) {
    return h('section', { class: 'card' },
      h('h2', { class: 'card__title' }, 'Вождение'),
      h('button', {
        class: 'btn btn--block',
        onclick: () => edit((d) => { d.drivingLesson = defaultLesson(new Date()); }),
      }, '+ Урок вождения сегодня'),
    );
  }

  const invalid = !(toMinutes(lesson.end) > toMinutes(lesson.start));
  const setTime = (field, value) => edit((d) => { if (value) d.drivingLesson[field] = value; });
  const conflicts = schedule.blocks.filter((b) => b.conflict);

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Урок вождения'),
    h('div', { class: 'lesson-times' },
      h('label', { class: 'field' }, h('span', {}, 'Начало'),
        h('input', { type: 'time', class: 'input input--time', value: lesson.start, onchange: (e) => setTime('start', e.target.value) })),
      h('label', { class: 'field' }, h('span', {}, 'Конец'),
        h('input', { type: 'time', class: 'input input--time', value: lesson.end, onchange: (e) => setTime('end', e.target.value) })),
    ),
    invalid && h('p', { class: 'hint hint--warning' }, 'Конец урока должен быть позже начала.'),
    !invalid && h('p', { class: 'muted hint' }, 'День перестроен: +30 мин на дорогу до и после.'),
    conflicts.length > 0 && h('p', { class: 'hint hint--warning' },
      `Пересекается: ${conflicts.map((b) => b.title).join(', ')}`),
    schedule.unplaced.length > 0 && h('div', { class: 'unplaced' },
      h('p', { class: 'hint hint--warning' }, 'Не помещается сегодня:'),
      h('ul', {}, schedule.unplaced.map((u) => h('li', {}, `${u.title} — ${formatDuration(u.minutes)}`))),
    ),
    h('button', { class: 'btn btn--block btn--ghost', onclick: () => edit((d) => { d.drivingLesson = null; }) }, 'Убрать урок'),
  );
}

function defaultLesson(now) {
  const hour = Math.min(20, Math.max(8, now.getHours() + 1));
  const pad = (n) => String(n).padStart(2, '0');
  return { start: `${pad(hour)}:00`, end: `${pad(hour + 1)}:00` };
}

// ---------- timeline ----------

function timelineCard({ day, mode, schedule, nowMinutes, edit }) {
  const current = findCurrentBlock(schedule.blocks, nowMinutes);
  const renderedTasks = new Set(); // a block split by a lesson shows its checkbox only once

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, mode === 'sick' ? 'Режим сна' : 'Распорядок'),
    h('ol', { class: 'timeline' },
      schedule.blocks.map((block) => {
        const tasks = block.tasks.filter((t) => !renderedTasks.has(t.id));
        tasks.forEach((t) => renderedTasks.add(t.id));
        return blockItem(block, tasks, block === current, day, edit);
      }),
    ),
  );
}

function blockItem(block, tasks, isCurrent, day, edit) {
  const classes = ['block', `block--${block.kind}`];
  if (isCurrent) classes.push('is-current');
  if (block.start === block.end) classes.push('block--marker');

  const chips = [
    block.group && h('span', { class: 'chip' }, block.group),
    block.carriedOver && h('span', { class: 'chip chip--accent' }, 'перенесено со вчера'),
    block.moved && h('span', { class: 'chip chip--accent' }, 'перенесено'),
    block.conflict && h('span', { class: 'chip chip--warning' }, 'конфликт с уроком'),
  ].filter(Boolean);

  return h('li', { class: classes.join(' '), 'data-block-id': block.id },
    h('div', { class: 'block__head' },
      h('span', { class: 'block__time' }, formatRange(block.start, block.end)),
      h('span', { class: 'block__title' }, block.title),
      h('span', { class: 'block__now' }, 'сейчас'),
    ),
    chips.length > 0 && h('div', { class: 'block__chips' }, chips),
    block.details && h('p', { class: 'block__details' }, block.details),
    tasks.map((task) => checkRow({
      checked: day.done?.[task.id] === true,
      label: task.title,
      onChange: (checked) => edit((d) => {
        if (checked) d.done[task.id] = true;
        else delete d.done[task.id];
      }),
    })),
  );
}

function highlightCurrent(root, schedule, minutes) {
  if (!schedule) return;
  const current = findCurrentBlock(schedule.blocks, minutes);
  for (const el of root.querySelectorAll('[data-block-id]')) {
    el.classList.toggle('is-current', el.dataset.blockId === current?.id);
  }
}

// ---------- note ----------

function noteCard({ day, edit }) {
  return h('section', { class: 'card' },
    h('label', { class: 'card__title', for: 'day-note' }, 'Заметка'),
    h('textarea', {
      id: 'day-note', class: 'input textarea', rows: 3, placeholder: 'Как прошёл день? (необязательно)',
      // Saved on every keystroke without re-rendering, so the keyboard stays open.
      oninput: (e) => edit((d) => { d.note = e.target.value; }, { notify: false }),
    }, day.note ?? ''),
  );
}

// ---------- shared rows ----------

function checkRow({ checked, label, hint = null, disabled = false, nested = false, onChange }) {
  return h('label', { class: `check${checked ? ' is-done' : ''}${nested ? ' check--nested' : ''}` },
    h('input', {
      type: 'checkbox', class: 'check__box', checked, disabled,
      onchange: (e) => onChange(e.target.checked),
    }),
    h('span', { class: 'check__text' }, label, hint && h('small', { class: 'check__hint' }, hint)),
  );
}

function statusRow(ok, label, hint) {
  return h('div', { class: `status-row${ok ? ' is-done' : ''}` },
    h('span', { class: 'status-row__icon', 'aria-hidden': 'true' }, ok ? '✓' : ''),
    h('span', { class: 'check__text' }, label, hint && h('small', { class: 'check__hint' }, hint)),
    h('span', { class: 'visually-hidden' }, ok ? 'выполнено' : 'не выполнено'),
  );
}

function addMinutes(hhmm, add) {
  const total = toMinutes(hhmm) + add;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
