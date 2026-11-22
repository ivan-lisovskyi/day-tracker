/**
 * "Сегодня" screen: mode of the day, minimum, sleep, job applications,
 * driving lesson, the timeline with checkboxes and a note.
 *
 * The whole screen re-renders on every data change (it is small), but never while the user is
 * typing in a field (see createRenderer); the current block highlight is refreshed every 30 s.
 */
import { createRenderer, h } from './dom.js';
import { formatDayLabel, formatDuration, formatRange, plural } from './format.js';
import { checkRow, statusRow } from './rows.js';
import { nowCard } from './nowCard.js';
import { checkinCard, checkinSummary, isCheckinEditing } from './checkin.js';
import { shutdownCard, shutdownPrompt } from './shutdown.js';
import * as store from '../state/store.js';
import { createDay } from '../state/schema.js';
import {
  dayKeyFor, formatMinutes, MINUTES_PER_DAY, nowDayMinutes, stampTime, toDayMinutes, toMinutes, toStamp, weekKeys, weekStart,
} from '../logic/time.js';
import { buildDaySchedule, findCurrentBlock } from '../logic/schedule.js';
import {
  bedDayKeyFor, bedStampFor, hasPendingWorkout, isBedOnTime, minimumStatus, minimumSuggestionReason, wakeStampFor,
} from '../logic/rules.js';
import { minimumStreak } from '../logic/streaks.js';
import { shouldRemindBackup } from '../logic/backup.js';
import { saveBackup } from './backup.js';

export const title = 'Сегодня';

const MODES = [
  ['normal', 'Обычный'],
  ['minimum', 'Минимум'],
  ['sick', 'Болею'],
];

const REFRESH_MS = 30_000;

/** Days whose "close the day" form is expanded (tapped open), kept across re-renders. */
const shutdownExpanded = new Set();

export function render(root) {
  const draw = () => {
    const now = new Date();
    const data = store.getData();
    const dayKey = dayKeyFor(now, data.settings.dayBoundary);
    root.replaceChildren(...buildScreen(data, dayKey, now, () => renderer.request()));
  };

  const renderer = createRenderer(root, draw);
  // Every 30 s: refresh the "Сейчас" card and the highlight (postponed while typing).
  const tick = () => renderer.request();

  const onVisible = () => {
    if (document.visibilityState === 'visible') renderer.request(); // back from background: time has passed
  };

  draw();
  const unsubscribe = store.subscribe(renderer.request);
  const timer = setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    unsubscribe();
    renderer.dispose();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function buildScreen(data, dayKey, now, redraw) {
  const { settings, days } = data;
  const day = days[dayKey] ?? createDay();
  const mode = day.mode ?? 'normal';
  const schedule = buildDaySchedule({
    settings, dayKey, day, pendingWorkout: hasPendingWorkout(dayKey, days, settings),
  });
  const nowMinutes = nowDayMinutes(now, settings.dayBoundary);
  const setExpanded = (open) => {
    if (open) shutdownExpanded.add(dayKey);
    else shutdownExpanded.delete(dayKey);
    redraw();
  };
  const ctx = {
    settings, days, dayKey, day, mode, schedule, now, nowMinutes, redraw,
    edit: (mutator, options) => store.updateDay(dayKey, mutator, options),
    expandShutdown: () => setExpanded(true),
    collapseShutdown: () => setExpanded(false),
  };

  // Morning: the check-in waits at the top until done. Evening (from shutdownFrom): a short
  // "time to close the day" prompt appears at the top; the full form opens on tap, so it never
  // hides the "Сейчас" card by itself. Earlier in the day everything about closing the day lives
  // at the bottom of the screen and stays there, so closing or reopening never jumps away.
  const evening = nowMinutes >= toDayMinutes(settings.shutdownFrom, settings.dayBoundary);
  const closed = Boolean(day.closedAt);
  const showCheckin = isCheckinEditing(dayKey) || (!day.checkin && !evening);
  const expanded = shutdownExpanded.has(dayKey);
  const shutdown = () => (closed || expanded ? shutdownCard(ctx) : shutdownPrompt(ctx));

  const nodes = [
    saveErrorBanner(),
    backupBanner(data, dayKey),
    !evening && !closed && minimumSuggestionBanner(ctx), // pointless once the day is over
    showCheckin && checkinCard(ctx),
    evening && shutdown(),
    nowCard(ctx),
    modeCard(ctx),
    mode !== 'sick' && minimumCard(ctx),
    sleepCard(ctx),
    mode !== 'sick' && applicationsCard(ctx),
    mode !== 'sick' && drivingCard(ctx),
    timelineCard(ctx),
    !evening && (closed || expanded ? shutdownCard(ctx) : noteCard(ctx)),
    !evening && !closed && !expanded && h('button', {
      class: 'btn btn--block btn--ghost', onclick: ctx.expandShutdown,
    }, 'Закрыть день'),
  ].filter(Boolean);

  return nodes;
}

// ---------- banners ----------

function saveErrorBanner() {
  if (!store.getSaveError()) return null;
  return h('div', { class: 'banner banner--danger', role: 'alert' },
    h('p', {}, 'Не получается сохранить данные. Сделай экспорт бэкапа в настройках.'));
}

function backupBanner(data, dayKey) {
  if (!shouldRemindBackup(data, dayKey)) return null;
  const later = () => store.update((d) => { d.settings.backupReminderDismissedAt = toStamp(new Date()); });
  return h('div', { class: 'banner banner--warning' },
    h('p', {}, 'Неделя без бэкапа. Данные хранятся только в этом телефоне — сохрани копию в «Файлы».'),
    h('div', { class: 'banner__actions' },
      h('button', { class: 'btn btn--primary', onclick: () => saveBackup() }, 'Сохранить'),
      h('button', { class: 'btn', onclick: later }, 'Позже'),
    ),
  );
}

function minimumSuggestionBanner({ settings, days, dayKey, edit }) {
  const reason = minimumSuggestionReason(dayKey, days, settings);
  if (!reason) return null;
  const why = reason === 'late-bed'
    ? `Вчера лёг позже ${settings.lateBedThreshold}.`
    : 'Сон или энергия сегодня на 2 из 5 и ниже.';
  return h('div', { class: 'banner banner--warning' },
    h('p', {}, `${why} Включить сегодня режим «минимум»?`),
    h('div', { class: 'banner__actions' },
      h('button', { class: 'btn btn--primary', onclick: () => edit((d) => { d.mode = 'minimum'; }) }, 'Включить'),
      h('button', { class: 'btn', onclick: () => edit((d) => { d.minimumSuggestionDismissed = true; }) }, 'Нет, обычный'),
    ),
  );
}

// ---------- mode ----------

function modeCard(ctx) {
  const { dayKey, mode, edit } = ctx;
  return h('section', { class: 'card' },
    h('p', { class: 'day-label' }, formatDayLabel(dayKey)),
    checkinSummary(ctx),
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

function sleepCard({ settings, days, dayKey, day, now, nowMinutes }) {
  // Before noon the "Отбой" row is still about last night: after 05:00 the screen already shows the
  // new day, but a bedtime recorded then (the button or a typed "01:30") belongs to the previous
  // one. The button and the field always write to the same day whose value the row shows.
  const bedKey = bedDayKeyFor(now);
  const lastNight = bedKey !== dayKey;
  const bedDay = lastNight ? days[bedKey] ?? {} : day;
  const afterMidnight = nowMinutes >= MINUTES_PER_DAY; // 00:00–05:00: nobody wakes up "now" for this day
  const lateBed = !lastNight && Boolean(day.bedAt) && !isBedOnTime(day, dayKey, settings);

  const set = (key, field, stamp) => store.updateDay(key, (d) => {
    if (stamp) d[field] = stamp;
    else delete d[field];
  });

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Сон'),
    timeRow({
      label: 'Подъём',
      value: day.wakeAt ? stampTime(day.wakeAt) : '',
      buttonLabel: 'Проснулся',
      onNow: afterMidnight ? null : () => set(dayKey, 'wakeAt', toStamp(new Date())),
      onChange: (value) => set(dayKey, 'wakeAt', value && wakeStampFor(dayKey, value)),
    }),
    timeRow({
      label: 'Отбой',
      value: bedDay.bedAt ? stampTime(bedDay.bedAt) : '',
      buttonLabel: 'Ложусь',
      onNow: () => set(bedKey, 'bedAt', toStamp(new Date())),
      onChange: (value) => set(bedKey, 'bedAt', value && bedStampFor(bedKey, value)),
    }),
    lastNight && h('p', { class: 'muted hint' }, 'До 12:00 отбой записывается за прошлую ночь.'),
    lateBed && h('p', { class: 'hint hint--warning' }, `Позже ${settings.bedTarget} — завтра не дави на себя.`),
  );
}

/**
 * Once a time is recorded, the "now" button disappears: a stray tap in the evening must not
 * overwrite the morning wake-up time. The time stays editable in the field.
 */
function timeRow({ label, value, buttonLabel, onNow, onChange }) {
  const id = `time-${label}`;
  return h('div', { class: 'time-row' },
    h('label', { class: 'time-row__label', for: id }, label),
    h('input', {
      id, type: 'time', class: 'input input--time', value,
      onchange: (e) => onChange(e.target.value),
    }),
    value
      ? h('span', { class: 'time-row__done', 'aria-hidden': 'true' }, '✓')
      : onNow ? h('button', { class: 'btn btn--primary', onclick: onNow }, buttonLabel) : h('span'),
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

function drivingCard({ settings, day, schedule, edit }) {
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

  // Same rule as the schedule: a lesson ending after midnight (23:00–00:30) is fine.
  const invalid = !(toDayMinutes(lesson.end, settings.dayBoundary) > toDayMinutes(lesson.start, settings.dayBoundary));
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
    !invalid && h('p', { class: 'muted hint' }, `День перестроен: +${settings.drivingTravelMin} мин на дорогу до и после.`),
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

function addMinutes(hhmm, add) {
  return formatMinutes(toMinutes(hhmm) + add);
}
