/**
 * "Неделя" screen: weekly summary, days, habits and the text export for Claude.
 * Everything shown here comes from buildWeekStats() — the same JSON stage 2 will send.
 */
import { h } from './dom.js';
import { plural } from './format.js';
import * as store from '../state/store.js';
import { addDays, dayKeyFor, weekStart } from '../logic/time.js';
import { buildWeekStats } from '../logic/weekStats.js';
import { forgivenNote, formatDayShort, formatWeekRange, weekToText } from '../logic/exportText.js';
import {
  applyProposal, buildPlanContext, describeProposal, revertProposal, sanitizeProposals,
} from '../logic/aiPlan.js';
import { requestPlan } from '../aiClient.js';
import { isAiConfigured, loadPlanSession, savePlanSession } from '../state/aiConfig.js';

export const title = 'Неделя';

const WEEKDAY_LETTERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// "Подстроить план с ИИ": the request state outlives a tab switch (the answer takes a few seconds).
let aiState = { status: 'idle' }; // { status: 'idle' | 'loading' } | { status: 'error', message }
let redrawWeek = null; // redraw of the Week screen that is on screen now, if any

export function render(root) {
  let weekOffset = 0; // 0 = this week, -1 = last week…
  let exportState = null; // null | { status: 'copied' } | { status: 'manual', text }

  const draw = () => {
    const data = store.getData();
    const todayKey = dayKeyFor(new Date(), data.settings.dayBoundary);
    const monday = addDays(weekStart(todayKey), weekOffset * 7);
    const stats = buildWeekStats(data, monday, todayKey);

    root.replaceChildren(
      navCard(stats, weekOffset, (delta) => {
        weekOffset += delta;
        exportState = null;
        if (aiState.status === 'error') aiState = { status: 'idle' }; // that error was about another week
        redraw();
      }),
      summaryCard(stats),
      exportCard(stats, exportState, async () => { exportState = await copyWeek(stats); redraw(); }),
      aiCard(stats, data.settings, redraw),
      daysCard(stats),
      habitsCard(stats),
    );
  };

  let active = true; // false once the user leaves this tab (the root element is reused)
  const redraw = () => { if (active) draw(); };
  // The app can stay open on this tab overnight: "today" and "this week" are worked out again.
  const onVisible = () => {
    if (document.visibilityState === 'visible') redraw();
  };
  draw();
  redrawWeek = redraw;
  const unsubscribe = store.subscribe(redraw);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    active = false;
    if (redrawWeek === redraw) redrawWeek = null;
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
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

/** "2 из 5"; with nothing to count against (no goal, no planned days yet) just the number or a dash. */
const outOf = (done, total) => (total > 0 ? `${done} из ${total}` : done > 0 ? String(done) : '—');

function summaryCard({ totals: t, goals, streaks }) {
  const effectiveDays = t.daysElapsed - t.sickDays;
  const applicationsPercent = goals.weeklyApplications
    ? Math.min(100, Math.round((t.applications / goals.weeklyApplications) * 100))
    : 100;

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Итог'),
    h('div', { class: 'tiles' },
      tile('Минимум дня', outOf(t.minimumMet, effectiveDays), t.sickDays ? `болел: ${t.sickDays}` : null),
      tile('Отклики', outOf(t.applications, goals.weeklyApplications), null,
        h('div', { class: 'progress progress--small' },
          h('div', {
            class: `progress__bar${t.applications >= goals.weeklyApplications ? ' progress__bar--done' : ''}`,
            style: `width: ${applicationsPercent}%`,
          }))),
      tile('Вождение', `${t.drivingLessons} ${plural(t.drivingLessons, 'урок', 'урока', 'уроков')}`),
      tile('Гиря', outOf(t.workoutsDone, t.workoutsPlanned)),
    ),
    h('p', { class: 'week-times' },
      h('span', {}, 'Подъём в среднем ', h('strong', {}, t.averageWake ?? '—')),
      h('span', {}, 'Отбой в среднем ', h('strong', {}, t.averageBed ?? '—')),
    ),
    t.checkins > 0 && h('p', { class: 'week-times' },
      h('span', {}, 'Сон в среднем ', h('strong', {}, `${t.averageSleep}/5`)),
      h('span', {}, 'Энергия ', h('strong', {}, `${t.averageEnergy}/5`)),
    ),
    h('p', { class: 'week-times' }, h('span', {}, 'Дней закрыто вечером ', h('strong', {}, outOf(t.daysClosed, t.daysElapsed)))),
    streaks && h('p', { class: 'streak' },
      `Серия минимума: ${streaks.minimum} ${plural(streaks.minimum, 'день', 'дня', 'дней')}`,
      streaks.forgiven.minimum > 0 && h('small', { class: 'streak__note' }, forgivenNote(streaks.forgiven.minimum, ' · '))),
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

// ---------- AI review ----------

async function askAi(stats) {
  aiState = { status: 'loading' };
  redrawWeek?.();
  try {
    const reply = await requestPlan({ stats, plan: buildPlanContext(store.getData().settings) });
    savePlanSession({
      weekStart: stats.week.start,
      review: reply.review,
      model: typeof reply.model === 'string' ? reply.model : null,
      proposals: sanitizeProposals(reply.proposals).map((proposal) => ({ ...proposal, status: 'pending' })),
    });
    aiState = { status: 'idle' };
  } catch (error) {
    aiState = { status: 'error', message: error.message };
  }
  redrawWeek?.();
}

/** Changes the saved review and redraws; `change` gets the session and may return false to do nothing. */
function updateSession(redraw, change) {
  const session = loadPlanSession();
  if (!session || change(session) === false) return;
  savePlanSession(session);
  redraw();
}

function acceptProposal(index, redraw) {
  updateSession(redraw, (session) => {
    const proposal = session.proposals[index];
    let shown = null;
    let undo = null;
    store.update((draft) => {
      shown = describeProposal(proposal, draft.settings);
      undo = applyProposal(draft.settings, proposal);
    }, { notify: false });
    if (!undo) return false; // stale: nothing was changed
    Object.assign(proposal, { status: 'accepted', undo, shown: { title: shown.title, from: shown.from, to: shown.to } });
    return true;
  });
}

/** "Вернуть как было": undoes every accepted proposal, newest first; they become pending again. */
function undoAccepted(redraw) {
  updateSession(redraw, (session) => {
    const accepted = session.proposals.filter((proposal) => proposal.status === 'accepted').reverse();
    store.update((draft) => {
      for (const proposal of accepted) revertProposal(draft.settings, proposal.undo);
    }, { notify: false });
    for (const proposal of accepted) {
      proposal.status = 'pending';
      delete proposal.undo;
      delete proposal.shown;
    }
  });
}

function aiCard(stats, settings, redraw) {
  const session = loadPlanSession();
  if (session?.weekStart === stats.week.start) return aiReviewCard(session, settings, redraw);

  const loading = aiState.status === 'loading';
  const configured = isAiConfigured();
  const empty = stats.days.every((day) => !day.hasRecord || day.isFuture);
  const hint = !configured
    ? ['Сначала укажи адрес сервера и код доступа в ', h('a', { href: '#settings', class: 'link' }, 'настройках'), '.']
    : empty
      ? 'В этой неделе пока нет данных для разбора.'
      : 'Отправит итоги этой недели, заметки и чек-ины на твой сервер и в Claude. План изменится, только если ты нажмёшь «Принять».';

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Разбор недели с ИИ'),
    aiState.status === 'error' && h('p', { class: 'hint hint--warning hint--top', role: 'alert' }, aiState.message),
    h('button', {
      class: 'btn btn--block', disabled: loading || !configured || empty, onclick: () => askAi(stats),
    }, loading ? 'Claude разбирает неделю…' : 'Подстроить план с ИИ'),
    h('p', { class: 'muted hint' }, hint),
  );
}

function aiReviewCard(session, settings, redraw) {
  const rows = session.proposals.map((proposal, index) => {
    if (proposal.status === 'rejected') return null;
    if (proposal.status === 'accepted') return proposalRow(proposal, proposal.shown, null);
    const described = describeProposal(proposal, settings);
    return described && proposalRow(proposal, described, {
      accept: () => acceptProposal(index, redraw),
      reject: () => updateSession(redraw, (s) => { s.proposals[index].status = 'rejected'; }),
    });
  });
  const pending = session.proposals.filter((proposal) => proposal.status === 'pending');
  const stale = pending.filter((proposal) => !describeProposal(proposal, settings)).length;
  const accepted = session.proposals.some((proposal) => proposal.status === 'accepted');

  return h('section', { class: 'card ai-review' },
    h('h2', { class: 'card__title' }, 'Разбор недели с ИИ'),
    h('p', { class: 'ai-review__text' }, session.review),
    session.proposals.length === 0 && h('p', { class: 'muted hint' }, 'Менять план Claude не предложил.'),
    h('ul', { class: 'proposals' }, rows),
    stale > 0 && h('p', { class: 'muted hint' },
      `Не показано предложений: ${stale} — они не подходят к текущему плану (например, блок наехал бы на соседний).`),
    h('div', { class: 'ai-review__actions' },
      accepted && h('button', { class: 'btn', onclick: () => undoAccepted(redraw) }, 'Вернуть как было'),
      h('button', {
        class: 'btn btn--ghost',
        onclick: () => { savePlanSession(null); aiState = { status: 'idle' }; redraw(); },
      }, 'Закрыть разбор'),
    ),
  );
}

/** One proposal: what changes, why, and the two buttons (none once it is accepted). */
function proposalRow(proposal, shown, actions) {
  return h('li', { class: `proposal${actions ? '' : ' is-accepted'}` },
    h('div', { class: 'proposal__head' },
      h('span', { class: 'proposal__title' }, shown.title),
      !actions && h('span', { class: 'badge badge--success' }, 'Принято ✓'),
    ),
    h('p', { class: 'proposal__change' },
      h('span', { class: 'proposal__from' }, shown.from), ' → ', h('strong', {}, shown.to)),
    proposal.reason && h('p', { class: 'proposal__reason' }, proposal.reason),
    actions && h('div', { class: 'proposal__actions' },
      h('button', { class: 'btn btn--primary', onclick: actions.accept }, 'Принять'),
      h('button', { class: 'btn', onclick: actions.reject }, 'Отклонить'),
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
  const habits = stats.habits.filter((habit) => habit.applicable > 0 || habit.skipped > 0);

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Привычки'),
    habits.length === 0
      ? h('p', { class: 'muted' }, 'За эту неделю пока нет отметок.')
      : [
        h('div', { class: 'habit__cells habit__cells--header', 'aria-hidden': 'true' },
          WEEKDAY_LETTERS.map((letter) => h('span', {}, letter))),
        h('ul', { class: 'habits' }, habits.map((habit) => habitRow(habit, stats))),
        h('p', { class: 'muted hint' }, '✓ сделано · ✗ не сделано · – пропущено осознанно · пунктир — сегодня, ещё не отмечено'),
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
        streak ? h('small', {}, ` · серия ${streak}${forgivenNote(stats.streaks.forgiven.habits[habit.id], ' (', ')')}`) : null),
    ),
    h('div', { class: 'habit__cells' },
      stats.days.map((day) => {
        const value = day.habits[habit.id];
        const [symbol, modifier, text] = day.skipped.includes(habit.id)
          ? ['–', 'skipped', 'пропущено осознанно']
          : cellLook(value, day.isToday);
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
  if (value === false) return isToday ? ['', 'pending', 'ещё не отмечено'] : ['✗', 'missed', 'не сделано'];
  return ['', 'none', 'не нужно'];
}
