/**
 * "Неделя" screen: weekly summary, days, habits and the text export for Claude.
 * Everything shown here comes from buildWeekStats() — the same JSON stage 2 will send.
 */
import { h } from './dom.js';
import { plural } from './format.js';
import * as store from '../state/store.js';
import { addDays, dayKeyFor, weekStart } from '../logic/time.js';
import { buildWeekStats } from '../logic/weekStats.js';
import { formatDayShort, formatWeekRange, weekToText } from '../logic/exportText.js';

export const title = 'Неделя';

const WEEKDAY_LETTERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function render(root) {
  let weekOffset = 0; // 0 = this week, -1 = last week…
  let exportState = null; // null | { status: 'copied' } | { status: 'manual', text }

  const draw = () => {
    const data = store.getData();
    const todayKey = dayKeyFor(new Date(), data.settings.dayBoundary);
    const monday = addDays(weekStart(todayKey), weekOffset * 7);
    const stats = buildWeekStats(data, monday, todayKey);

    root.replaceChildren(
      navCard(stats, weekOffset, (delta) => { weekOffset += delta; exportState = null; redraw(); }),
      summaryCard(stats),
      exportCard(stats, exportState, async () => { exportState = await copyWeek(stats); redraw(); }),
      daysCard(stats),
      habitsCard(stats),
    );
  };

  let active = true; // false once the user leaves this tab (the root element is reused)
  const redraw = () => { if (active) draw(); };
  draw();
  const unsubscribe = store.subscribe(redraw);
  return () => {
    active = false;
    unsubscribe();
  };
}

// ---------- navigation ----------

function navCard(stats, weekOffset, move) {
  return h('section', { class: 'card week-nav' },
    h('button', { class: 'btn week-nav__btn', 'aria-label': 'Предыдущая неделя', onclick: () => move(-1) }, '‹'),
    h('div', { class: 'week-nav__label' },
      h('strong', {}, formatWeekRange(stats.week.start, stats.week.end)),
      h('span', { class: 'muted' }, weekOffset === 0 ? 'эта неделя' : weekOffset === -1 ? 'прошлая неделя' : ''),
    ),
    h('button', {
      class: 'btn week-nav__btn', 'aria-label': 'Следующая неделя', disabled: weekOffset >= 0, onclick: () => move(1),
    }, '›'),
  );
}

// ---------- summary ----------

function summaryCard({ totals: t, goals, streaks }) {
  const effectiveDays = t.daysElapsed - t.sickDays;
  const applicationsPercent = goals.weeklyApplications
    ? Math.min(100, Math.round((t.applications / goals.weeklyApplications) * 100))
    : 100;

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Итог'),
    h('div', { class: 'tiles' },
      tile('Минимум дня', `${t.minimumMet} из ${effectiveDays}`, t.sickDays ? `болел: ${t.sickDays}` : null),
      tile('Отклики', `${t.applications} из ${goals.weeklyApplications}`, null,
        h('div', { class: 'progress progress--small' },
          h('div', {
            class: `progress__bar${t.applications >= goals.weeklyApplications ? ' progress__bar--done' : ''}`,
            style: `width: ${applicationsPercent}%`,
          }))),
      tile('Вождение', `${t.drivingLessons} ${plural(t.drivingLessons, 'урок', 'урока', 'уроков')}`),
      tile('Гиря', `${t.workoutsDone} из ${t.workoutsPlanned}`),
    ),
    h('p', { class: 'week-times' },
      h('span', {}, 'Подъём в среднем ', h('strong', {}, t.averageWake ?? '—')),
      h('span', {}, 'Отбой в среднем ', h('strong', {}, t.averageBed ?? '—')),
    ),
    t.checkins > 0 && h('p', { class: 'week-times' },
      h('span', {}, 'Сон в среднем ', h('strong', {}, `${t.averageSleep}/5`)),
      h('span', {}, 'Энергия ', h('strong', {}, `${t.averageEnergy}/5`)),
    ),
    h('p', { class: 'week-times' }, h('span', {}, 'Дней закрыто вечером ', h('strong', {}, `${t.daysClosed} из ${t.daysElapsed}`))),
    streaks && h('p', { class: 'streak' },
      `Серия минимума: ${streaks.minimum} ${plural(streaks.minimum, 'день', 'дня', 'дней')}`),
  );
}

function tile(label, value, hint = null, extra = null) {
  return h('div', { class: 'tile' },
    h('span', { class: 'tile__label' }, label),
    h('strong', { class: 'tile__value' }, value),
    hint && h('span', { class: 'tile__hint' }, hint),
    extra,
  );
}

// ---------- export ----------

function exportCard(stats, state, onCopy) {
  return h('section', { class: 'card' },
    h('button', { class: 'btn btn--primary btn--block', onclick: onCopy },
      state?.status === 'copied' ? 'Скопировано ✓' : 'Экспорт недели'),
    h('p', { class: 'muted hint' },
      state?.status === 'copied'
        ? 'Вставь сводку в чат с Claude для разбора недели.'
        : 'Копирует текстовую сводку недели, чтобы вставить её в чат с Claude.'),
    state?.status === 'manual' && h('div', { class: 'manual-copy' },
      h('p', { class: 'hint hint--warning' }, 'Не получилось скопировать автоматически. Выдели текст и скопируй вручную:'),
      h('textarea', { class: 'input textarea manual-copy__text', rows: 10, readonly: true, onfocus: (e) => e.target.select() }, state.text),
    ),
  );
}

const CLIPBOARD_TIMEOUT_MS = 2000;

async function copyWeek(stats) {
  const text = weekToText(stats);
  try {
    // The Clipboard API exists only on HTTPS (or localhost). Over http://192.168.x.x
    // on an iPhone it is missing; some browsers also leave the request hanging behind
    // a permission prompt. In both cases the manual-copy box is shown instead.
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clipboard timeout')), CLIPBOARD_TIMEOUT_MS)),
    ]);
    return { status: 'copied' };
  } catch {
    return { status: 'manual', text };
  }
}

// ---------- days ----------

function daysCard(stats) {
  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'По дням'),
    h('ol', { class: 'days' }, stats.days.map(dayRow)),
  );
}

function dayRow(day) {
  const [label, modifier] = dayStatus(day);
  const facts = day.hasRecord && !day.isFuture
    ? [
      day.mode !== 'sick' && `↑ ${day.wakeAt ?? '—'}`,
      `↓ ${day.bedAt ?? '—'}`,
      day.applications > 0 && `откликов: ${day.applications}`,
      day.drivingLesson && `вождение ${day.drivingLesson.start}`,
      day.mode === 'minimum' && 'режим «минимум»',
      day.checkin && `сон ${day.checkin.sleep}, энергия ${day.checkin.energy}`,
    ].filter(Boolean)
    : [];

  return h('li', { class: `day-row${day.isToday ? ' is-today' : ''}` },
    h('div', { class: 'day-row__head' },
      h('span', { class: 'day-row__date' }, formatDayShort(day.date, day.weekday)),
      h('span', { class: `pill pill--${modifier}` }, label),
    ),
    facts.length > 0 && h('p', { class: 'day-row__facts' }, facts.join(' · ')),
    day.focus && h('p', { class: 'day-row__facts' }, `Главное: ${day.focus}`),
    day.note && h('p', { class: 'day-row__note' }, day.note),
  );
}

function dayStatus(day) {
  if (day.isFuture) return ['впереди', 'muted'];
  if (day.mode === 'sick') return ['болел', 'sick'];
  if (day.minimum?.met) return ['засчитан', 'success'];
  if (day.isToday) return ['в процессе', 'accent'];
  if (!day.hasRecord) return ['нет данных', 'muted'];
  return ['не засчитан', 'danger'];
}

// ---------- habits ----------

function habitsCard(stats) {
  const habits = stats.habits.filter((habit) => habit.applicable > 0);

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Привычки'),
    habits.length === 0
      ? h('p', { class: 'muted' }, 'За эту неделю пока нет отметок.')
      : [
        h('div', { class: 'habit__cells habit__cells--header', 'aria-hidden': 'true' },
          WEEKDAY_LETTERS.map((letter) => h('span', {}, letter))),
        h('ul', { class: 'habits' }, habits.map((habit) => habitRow(habit, stats))),
        h('p', { class: 'muted hint' }, '✓ сделано · ✗ пропущено · пунктир — сегодня, ещё не отмечено'),
      ],
  );
}

function habitRow(habit, stats) {
  const streak = stats.streaks?.habits[habit.id];
  return h('li', { class: 'habit' },
    h('div', { class: 'habit__head' },
      h('span', { class: 'habit__title' }, habit.title),
      h('span', { class: 'habit__count' },
        `${habit.done}/${habit.applicable}`,
        streak ? h('small', {}, ` · серия ${streak}`) : null),
    ),
    h('div', { class: 'habit__cells' },
      stats.days.map((day) => {
        const value = day.habits[habit.id];
        const [symbol, modifier, text] = cellLook(value, day.isToday);
        return h('span', {
          class: `cell cell--${modifier}`,
          title: `${formatDayShort(day.date, day.weekday)}: ${text}`,
        }, symbol);
      })),
  );
}

/** Today is still in progress: an unchecked habit is "pending", not "missed". */
function cellLook(value, isToday) {
  if (value === true) return ['✓', 'done', 'сделано'];
  if (value === false) return isToday ? ['', 'pending', 'ещё не отмечено'] : ['✗', 'missed', 'пропущено'];
  return ['', 'none', 'не нужно'];
}
