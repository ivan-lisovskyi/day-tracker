/**
 * Default routine. Everything here is editable in Settings.
 *
 * Block fields:
 *   id        stable identifier
 *   title     shown on the timeline
 *   group     optional label that joins blocks ("Блок 1")
 *   kind      sleep | workout | meal | focus | free | evening
 *             - focus blocks are `movable`: a driving lesson pushes them into free time
 *             - free blocks are the capacity that moved blocks go into
 *             - sleep blocks are the only ones shown in "sick" mode
 *   start/end "HH:MM"; times before the day boundary (05:00) belong to the night after
 *   tasks     checklist items; their ids are also habit ids for streaks
 *
 * The workout block is special: its title, length and task come from `workout`,
 * depending on whether today is a kettlebell day or a stretching day.
 */
export function createDefaultSettings() {
  return {
    dayBoundary: '05:00',
    wakeTarget: '09:00',
    wakeToleranceMin: 30,
    bedTarget: '01:00',
    lateBedThreshold: '02:00',
    drivingTravelMin: 30,
    weeklyApplicationsGoal: 5,
    workoutDays: [1, 3, 5], // Mon, Wed, Fri (ISO weekdays)

    workout: {
      title: 'Гиря 12 кг',
      details: 'Махи, гоблет-присед, жим одной рукой, тяга в наклоне — 3 круга по 8–12',
      durationMin: 20,
      restTitle: 'Растяжка',
      restDetails: '',
      restDurationMin: 15,
    },

    blocks: [
      {
        id: 'wake', title: 'Подъём', kind: 'sleep', start: '09:00', end: '09:15', movable: false,
        tasks: [{ id: 'no-phone', title: 'Первые 30 мин без телефона' }],
      },
      { id: 'workout', title: 'Тренировка', kind: 'workout', start: '09:15', end: '09:35', movable: false, tasks: [] },
      {
        id: 'breakfast', title: 'Завтрак, потом 15 мин телефон/сообщения', kind: 'meal',
        start: '09:45', end: '10:30', movable: false, tasks: [],
      },
      {
        id: 'cbr', title: 'Теория CBR', group: 'Блок 1', kind: 'focus', start: '10:30', end: '11:30', movable: true,
        tasks: [{ id: 'cbr', title: 'Теория CBR — 1 ч' }],
      },
      {
        id: 'jobs', title: 'Поиск работы', group: 'Блок 1', kind: 'focus', start: '11:30', end: '12:30', movable: true,
        tasks: [{ id: 'jobs', title: 'Поиск работы — 1 ч' }],
      },
      {
        id: 'lunch', title: 'Обед + прогулка', kind: 'meal', start: '12:30', end: '13:30', movable: false,
        tasks: [{ id: 'walk', title: 'Прогулка 20–30 мин' }],
      },
      {
        id: 'code', title: 'Код', group: 'Блок 2', kind: 'focus', start: '13:30', end: '16:00', movable: true,
        tasks: [{ id: 'code', title: 'Код — 2,5 ч' }],
      },
      { id: 'free', title: 'Свободно / дела', kind: 'free', start: '16:00', end: '19:00', movable: false, tasks: [] },
      { id: 'dinner', title: 'Ужин', kind: 'meal', start: '19:00', end: '20:00', movable: false, tasks: [] },
      {
        id: 'evening', title: 'Вечер свободно', kind: 'evening', start: '20:00', end: '00:30', movable: false,
        tasks: [{ id: 'cs2-cutoff', title: 'Последний матч CS2 начат не позже 23:30' }],
      },
      {
        id: 'phone', title: 'Телефон на зарядку', kind: 'sleep', start: '00:30', end: '01:00', movable: false,
        tasks: [{ id: 'phone-away', title: 'Телефон на зарядке не у кровати' }],
      },
      { id: 'bedtime', title: 'Отбой', kind: 'sleep', start: '01:00', end: '01:00', movable: false, tasks: [] },
    ],

    lastBackupAt: null,
    backupReminderDismissedAt: null,
  };
}
