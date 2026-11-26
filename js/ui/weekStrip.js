/**
 * Seven days across the top of "Сегодня" (and of an earlier or a planned day): how each day went
 * at a glance, which later days have a plan, and one tap to open any of them. The day on screen
 * is highlighted.
 */
import { h } from './dom.js';
import { weekStart } from '../logic/time.js';
import { buildWeekStats } from '../logic/weekStats.js';
import { weekStripDays } from '../logic/dayView.js';
import { hasPlan } from '../logic/ownTasks.js';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MARKS = { met: '✓', missed: '✗', sick: '–', today: '•', empty: '·', future: '', planned: '•', before: '' };
const STATE_TEXT = {
  met: 'минимум засчитан', missed: 'минимум не засчитан', sick: 'болел', today: 'сегодня',
  empty: 'нет отметок', future: 'впереди', planned: 'запланировано', before: 'до начала',
};

export function weekStrip(data, shownKey, todayKey) {
  const stats = buildWeekStats(data, weekStart(shownKey), todayKey);
  const planned = new Set(stats.days.filter((d) => d.isFuture && hasPlan(data.days[d.date])).map((d) => d.date));
  return h('nav', { class: 'week-strip', 'aria-label': 'Дни недели' },
    weekStripDays(stats.days, planned).map((day) => {
      const shown = day.date === shownKey;
      const label = `${WEEKDAYS[day.weekday - 1]}, ${Number(day.date.slice(8))}: ${STATE_TEXT[day.state]}`;
      const content = [
        h('span', { class: 'week-strip__wd' }, WEEKDAYS[day.weekday - 1]),
        h('span', { class: 'week-strip__num' }, String(Number(day.date.slice(8)))),
        h('span', { class: 'week-strip__mark', 'aria-hidden': 'true' }, MARKS[day.state]),
      ];
      const cls = `week-strip__day week-strip__day--${day.state}${shown ? ' is-shown' : ''}`;
      return day.href && !shown
        ? h('a', { class: cls, href: day.href, 'aria-label': label }, content)
        : h('span', { class: cls, 'aria-label': label, 'aria-current': shown ? 'date' : null }, content);
    }));
}
