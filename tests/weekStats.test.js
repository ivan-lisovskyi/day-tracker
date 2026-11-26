import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekStats } from '../js/logic/weekStats.js';
import { forgivenNote, formatWeekRange, weekToText } from '../js/logic/exportText.js';
import { createDefaultSettings } from '../js/state/defaults.js';

const MONDAY = '2026-11-16';
const TODAY = '2026-11-21'; // Saturday

/** One realistic week; Sunday is still in the future. */
function sampleData() {
  return {
    settings: createDefaultSettings(),
    days: {
      '2026-11-16': { // Mon: minimum met, workout done
        mode: 'normal', wakeAt: '2026-11-16T09:10', bedAt: '2026-11-17T00:50',
        minimum: { cbr10: true }, applications: 1, done: { workout: true }, note: 'Хороший   день',
      },
      '2026-11-17': { // Tue: bad day, overslept
        mode: 'minimum', wakeAt: '2026-11-17T09:40', bedAt: '2026-11-18T01:10', minimum: {}, applications: 0, done: {},
      },
      '2026-11-18': { mode: 'sick', done: {} }, // Wed: sick on a workout day
      // Thu 19: app not opened
      '2026-11-20': { // Fri: lesson, code instead of an application, workout missed
        mode: 'normal', wakeAt: '2026-11-20T09:00', minimum: { cbr10: true, code15: true },
        applications: 2, drivingLesson: { start: '14:00', end: '15:00' }, done: { cbr: true },
      },
      '2026-11-21': { mode: 'normal', wakeAt: '2026-11-21T09:20', applications: 0, done: {} }, // Sat: today
    },
  };
}

test('changing fixed workout weekdays keeps completed workouts and stretches in the weekly report', () => {
  const data = sampleData();
  data.days['2026-11-17'].done.stretch = true;
  data.settings.workoutDays = [2, 4];
  const stats = buildWeekStats(data, MONDAY, TODAY);
  assert.equal(stats.totals.workoutsDone, 1);
  assert.equal(stats.days[0].workout, 'workout');
  assert.equal(stats.days[0].habits.workout, true);
  assert.equal(stats.days[1].workout, 'stretch');
  assert.equal(stats.days[1].habits.stretch, true);
});

test('weekly totals', () => {
  const stats = buildWeekStats(sampleData(), MONDAY, TODAY);

  assert.deepEqual(stats.week, { start: '2026-11-16', end: '2026-11-22' });
  assert.deepEqual(stats.totals, {
    daysElapsed: 6,
    minimumMet: 2, // Mon, Fri
    sickDays: 1,
    minimumModeDays: 1,
    applications: 3,
    drivingLessons: 1,
    workoutsPlanned: 3, // Mon, Fri, Sat (carried from Fri); Wed was sick and is not carried
    workoutsDone: 1,
    averageWake: '09:18', // mean of 09:10, 09:40, 09:00, 09:20 = 09:17.5, rounded
    averageBed: '01:00', // 00:50 and 01:10 — averaged across midnight
    checkins: 0,
    averageSleep: null,
    averageEnergy: null,
    daysClosed: 0,
    skippedTasks: 0,
  });
});

test('per-day details, future days and habits', () => {
  const stats = buildWeekStats(sampleData(), MONDAY, TODAY);
  const [mon, , wed, thu, fri, sat, sun] = stats.days;

  assert.equal(mon.counted, true);
  assert.equal(mon.note, 'Хороший   день');
  assert.equal(wed.counted, true); // sick days count
  assert.equal(wed.habits.code, null);
  assert.equal(thu.hasRecord, false);
  assert.equal(thu.counted, false);
  assert.deepEqual(fri.drivingLesson, { start: '14:00', end: '15:00' });
  assert.equal(sat.isToday, true);
  assert.equal(sat.workout, 'workout'); // carried over from Friday
  assert.equal(sun.isFuture, true);
  assert.equal(sun.counted, null);

  const wake = stats.habits.find((h) => h.id === 'wake');
  assert.deepEqual([wake.done, wake.applicable], [3, 5]); // Mon, Fri, Sat on time
});

test('streaks are included only for the current week', () => {
  const current = buildWeekStats(sampleData(), MONDAY, TODAY);
  assert.equal(current.streaks.asOf, TODAY);
  assert.equal(current.streaks.minimum, 1); // Fri; Thu has no record

  const past = buildWeekStats(sampleData(), '2026-11-09', TODAY);
  assert.equal(past.streaks, null);
});

test('the stats are plain JSON (ready to send to a server in stage 2)', () => {
  const stats = buildWeekStats(sampleData(), MONDAY, TODAY);
  assert.deepEqual(JSON.parse(JSON.stringify(stats)), stats);
});

test('text export contains the summary, every day and the note', () => {
  const text = weekToText(buildWeekStats(sampleData(), MONDAY, TODAY));

  for (const expected of [
    'Неделя 16–22 ноября 2026',
    '(прошло дней: 6 из 7)',
    '- Минимум дня выполнен: 2 из 5 (болел: 1), дней в режиме «минимум»: 1',
    '- Отклики на работу: 3 из 5',
    '- Тренировки с гирей: 1 из 3',
    '- Отбой в среднем: 01:00 (цель 01:00)',
    'Пн 16.11 — минимум ✓ | подъём 09:10, отбой 00:50 | откликов 1',
    '  заметка: Хороший день',
    'Ср 18.11 — болел',
    'Чт 19.11 — нет данных',
    'Пт 20.11 — минимум ✓ | подъём 09:00, отбой — | откликов 2 | вождение 14:00–15:00',
    'Сб 21.11 (сегодня) — минимум ✗',
    '  пока не отмечено: Гиря 12 кг;',
    'Вс 22.11 — ещё не наступил',
    '- Подъём до 09:30: 3/5, серия 2',
  ]) {
    assert.ok(text.includes(expected), `missing "${expected}" in:\n${text}`);
  }
  assert.ok(!text.includes('серия 0'), 'zero streaks should be omitted');
});

test('week range label across months and years', () => {
  assert.equal(formatWeekRange('2026-11-16', '2026-11-22'), '16–22 ноября 2026');
  assert.equal(formatWeekRange('2026-11-30', '2026-12-06'), '30 ноября – 6 декабря 2026');
  assert.equal(formatWeekRange('2026-12-28', '2027-01-03'), '28 декабря 2026 – 3 января 2027');
});

test('check-ins, focus of the day and closed days are in the stats and the export', () => {
  const data = sampleData();
  data.days['2026-11-16'].checkin = { sleep: 4, energy: 3 };
  data.days['2026-11-16'].focus = 'Два отклика';
  data.days['2026-11-16'].closedAt = '2026-11-16T23:30';
  data.days['2026-11-17'].checkin = { sleep: 2, energy: 2 };

  const stats = buildWeekStats(data, MONDAY, TODAY);
  assert.equal(stats.totals.checkins, 2);
  assert.equal(stats.totals.averageSleep, 3);
  assert.equal(stats.totals.averageEnergy, 2.5);
  assert.equal(stats.totals.daysClosed, 1);
  assert.deepEqual(stats.days[0].checkin, { sleep: 4, energy: 3 });
  assert.equal(stats.days[0].focus, 'Два отклика');
  assert.equal(stats.days[0].closed, true);

  const text = weekToText(stats);
  for (const expected of [
    '- Самочувствие (чек-инов: 2): сон 3/5, энергия 2.5/5',
    '- Дней закрыто вечером: 1 из 6',
    'подъём 09:10, отбой 00:50 | сон 4/5, энергия 3/5',
    '  главное дня: Два отклика',
  ]) {
    assert.ok(text.includes(expected), `missing "${expected}" in:\n${text}`);
  }
});

test('days before the first record (before the app was installed) are not misses', () => {
  const data = {
    settings: createDefaultSettings(),
    days: { '2026-11-20': { mode: 'normal', wakeAt: '2026-11-20T09:00', done: {} } }, // first use: Friday
  };
  const stats = buildWeekStats(data, MONDAY, TODAY);
  const [mon, , , thu, fri] = stats.days;

  assert.equal(mon.isBeforeStart, true);
  assert.equal(mon.habits.wake, null);
  assert.equal(thu.counted, null);
  assert.equal(fri.isBeforeStart, false);
  assert.equal(stats.totals.daysElapsed, 2); // Fri and Sat
  const wake = stats.habits.find((h) => h.id === 'wake');
  assert.deepEqual([wake.done, wake.applicable], [1, 2]);
});

test('a lesson planned for a day that turned out sick is not counted', () => {
  const data = {
    settings: createDefaultSettings(),
    days: { '2026-11-17': { mode: 'sick', drivingLesson: { start: '14:00', end: '15:00' }, done: {} } },
  };
  const stats = buildWeekStats(data, MONDAY, TODAY);
  assert.equal(stats.totals.drivingLessons, 0);
  assert.equal(weekToText(stats).includes('вождение'), false);
});

test('skipped tasks are listed per day, counted per habit and shown in the export', () => {
  const data = sampleData();
  data.days['2026-11-20'].skipped = { walk: true, cbr: true }; // cbr was done on Friday: not a skip
  const stats = buildWeekStats(data, MONDAY, TODAY);
  const fri = stats.days[4];

  assert.deepEqual(fri.skipped, ['walk']);
  assert.equal(fri.habits.walk, null);
  assert.equal(stats.habits.find((h) => h.id === 'walk').skipped, 1);
  assert.equal(stats.totals.skippedTasks, 1);

  const text = weekToText(stats);
  assert.ok(text.includes('  пропущено осознанно: Прогулка 20–30 мин'), text);
  assert.ok(/Прогулка 20–30 мин: \d\/\d, пропусков 1/.test(text), text);
});

test('a forgiven miss is reported with the streak', () => {
  const data = sampleData();
  data.days['2026-11-19'] = { mode: 'normal', wakeAt: '2026-11-19T09:00', minimum: { cbr10: true }, applications: 1, done: {} };
  data.days['2026-11-17'].mode = 'normal'; // Tue: a plain missed day between Mon and Thu (Wed is sick)
  const stats = buildWeekStats(data, MONDAY, TODAY);
  assert.equal(stats.streaks.minimum, 3); // Fri, Thu, Mon
  assert.equal(stats.streaks.forgiven.minimum, 1);
  assert.ok(weekToText(stats).includes('- Серия минимума сейчас: 3 дн. (1 срыв прощён)'));
});

test('forgiven note: Russian plural forms, empty when nothing was forgiven', () => {
  assert.equal(forgivenNote(0, ' (', ')'), '');
  assert.equal(forgivenNote(1), '1 срыв прощён');
  assert.equal(forgivenNote(2, ' · '), ' · 2 срыва прощено');
  assert.equal(forgivenNote(5), '5 срывов прощено');
});

test('weekly workout goal: the goal is the denominator, in the stats and in the export', () => {
  const data = sampleData();
  data.settings.workoutMode = 'weekly';
  data.settings.workoutsPerWeek = 4;
  const stats = buildWeekStats(data, MONDAY, TODAY);

  assert.equal(stats.goals.workoutsPerWeek, 4);
  assert.equal(stats.totals.workoutsPlanned, 4);
  assert.equal(stats.totals.workoutsDone, 1); // Monday
  assert.ok(weekToText(stats).includes('- Тренировки с гирей: 1 из 4 (цель: 4 раза в неделю)'));
});

test('filling in a day from before tracking started does not turn the days around it into misses', () => {
  const data = sampleData();
  delete data.days['2026-11-16'];
  delete data.days['2026-11-17'];
  delete data.days['2026-11-18'];
  data.settings.trackingSince = '2026-11-19';
  const before = buildWeekStats(data, MONDAY, TODAY);

  data.days['2026-11-16'] = { checkin: { sleep: 3, energy: 3 }, done: {}, minimum: {} }; // added later
  const after = buildWeekStats(data, MONDAY, TODAY);

  assert.deepEqual(after.days.map((d) => d.isBeforeStart), [true, true, true, false, false, false, false]);
  assert.deepEqual(after.totals, before.totals);
});

test('own tasks do not change week stats (they are not sent to the AI)', () => {
  const withRecords = () => {
    const data = sampleData();
    data.days['2026-11-22'] = { mode: 'normal', done: {} }; // Sunday, planned ahead
    return data;
  };
  const plain = buildWeekStats(withRecords(), MONDAY, TODAY);
  const data = withRecords();
  data.days['2026-11-16'].ownTasks = [{ id: 'own-a', title: 'Банк', time: '14:00' }];
  data.days['2026-11-16'].done['own-a'] = true;
  data.days['2026-11-22'].ownTasks = [{ id: 'own-b', title: 'Хлеб', time: null }];
  const stats = buildWeekStats(data, MONDAY, TODAY);
  assert.deepEqual(stats, plain);
  assert.doesNotMatch(JSON.stringify(stats), /Банк|Хлеб|own-/);
});
