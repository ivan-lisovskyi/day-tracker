/**
 * Renders weekly stats (see weekStats.js) as plain text to paste into a chat with Claude.
 * Pure and deterministic: month and weekday names are spelled out here, not taken from Intl.
 */

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function parts(key) {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** "16–22 ноября 2026", "30 ноября – 6 декабря 2026", "29 декабря 2026 – 4 января 2027" */
export function formatWeekRange(startKey, endKey) {
  const a = parts(startKey);
  const b = parts(endKey);
  if (a.year !== b.year) {
    return `${a.day} ${MONTHS_GENITIVE[a.month - 1]} ${a.year} – ${b.day} ${MONTHS_GENITIVE[b.month - 1]} ${b.year}`;
  }
  if (a.month !== b.month) {
    return `${a.day} ${MONTHS_GENITIVE[a.month - 1]} – ${b.day} ${MONTHS_GENITIVE[b.month - 1]} ${b.year}`;
  }
  return `${a.day}–${b.day} ${MONTHS_GENITIVE[b.month - 1]} ${b.year}`;
}

/** "Пн 16.11" */
export function formatDayShort(key, weekday) {
  const { month, day } = parts(key);
  return `${WEEKDAYS_SHORT[weekday - 1]} ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
}

export function weekToText(stats) {
  const t = stats.totals;
  const titles = Object.fromEntries(stats.habits.map((h) => [h.id, h.title]));
  const lines = [];

  lines.push(`Неделя ${formatWeekRange(stats.week.start, stats.week.end)}`);
  if (t.daysElapsed < 7) lines.push(`(прошло дней: ${t.daysElapsed} из 7)`);
  lines.push('');

  lines.push('ИТОГ');
  lines.push(`- Минимум дня выполнен: ${t.minimumMet} из ${t.daysElapsed - t.sickDays}`
    + `${t.sickDays ? ` (болел: ${t.sickDays})` : ''}${t.minimumModeDays ? `, дней в режиме «минимум»: ${t.minimumModeDays}` : ''}`);
  lines.push(`- Отклики на работу: ${t.applications} из ${stats.goals.weeklyApplications}`);
  lines.push(`- Уроков вождения: ${t.drivingLessons}`);
  lines.push(`- Тренировки с гирей: ${t.workoutsDone} из ${t.workoutsPlanned}`);
  lines.push(`- Подъём в среднем: ${t.averageWake ?? 'нет данных'} (цель ${stats.goals.wakeTarget}, допуск ${stats.goals.wakeToleranceMin} мин)`);
  lines.push(`- Отбой в среднем: ${t.averageBed ?? 'нет данных'} (цель ${stats.goals.bedTarget})`);
  if (stats.streaks) lines.push(`- Серия минимума сейчас: ${stats.streaks.minimum} дн.`);
  lines.push('');

  lines.push('ПО ДНЯМ');
  for (const day of stats.days) {
    lines.push(...dayLines(day, titles));
  }
  lines.push('');

  lines.push('ПРИВЫЧКИ (сделано / из скольких дней)');
  for (const habit of stats.habits) {
    if (habit.applicable === 0) continue;
    const streakDays = stats.streaks?.habits[habit.id] ?? 0;
    const streak = streakDays > 0 ? `, серия ${streakDays}` : '';
    lines.push(`- ${habit.title}: ${habit.done}/${habit.applicable}${streak}`);
  }

  return lines.join('\n');
}

function dayLines(day, titles) {
  const label = formatDayShort(day.date, day.weekday);
  if (day.isFuture) return [`${label} — ещё не наступил`];
  if (!day.hasRecord) return [`${label} — нет данных`];

  const status = day.mode === 'sick' ? 'болел' : (day.minimum?.met ? 'минимум ✓' : 'минимум ✗');
  const facts = [
    status,
    day.mode === 'minimum' ? 'режим «минимум»' : null,
    `подъём ${day.wakeAt ?? '—'}, отбой ${day.bedAt ?? '—'}`,
    day.applications ? `откликов ${day.applications}` : null,
    day.drivingLesson ? `вождение ${day.drivingLesson.start}–${day.drivingLesson.end}` : null,
  ].filter(Boolean);

  const done = [];
  const missed = [];
  for (const [id, value] of Object.entries(day.habits)) {
    if (id === 'wake' || id === 'bed') continue; // already shown as times
    if (value === true) done.push(titles[id]);
    if (value === false) missed.push(titles[id]);
  }

  const lines = [`${label}${day.isToday ? ' (сегодня)' : ''} — ${facts.join(' | ')}`];
  if (done.length) lines.push(`  сделано: ${done.join('; ')}`);
  if (missed.length) lines.push(`  ${day.isToday ? 'пока не отмечено' : 'не сделано'}: ${missed.join('; ')}`);
  if (day.note) lines.push(`  заметка: ${day.note.replace(/\s+/g, ' ')}`);
  return lines;
}
