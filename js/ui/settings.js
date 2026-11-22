/**
 * "Настройки" screen: goals and rules, workouts, routine blocks, backup.
 * Every field saves on "change" (when the user finishes editing), so typing is never interrupted.
 */
import { createRenderer, h } from './dom.js';
import { formatDayLabel, formatRange } from './format.js';
import { restoreBackup, saveBackup } from './backup.js';
import { checkForUpdate, installedVersion, isStoragePersistent } from '../pwa.js';
import * as store from '../state/store.js';
import { toDayMinutes, stampTime, parseStamp } from '../logic/time.js';

export const title = 'Настройки';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Block kinds the user can pick. The workout block has its own kind and is not deletable. */
const KINDS = [
  ['focus', 'Дело'],
  ['free', 'Свободное время'],
  ['meal', 'Еда'],
  ['evening', 'Вечер'],
  ['sleep', 'Сон'],
];

const KIND_HINTS = {
  focus: 'Если урок вождения попадает на это время, дело переедет в свободное время.',
  free: 'Сюда переезжают дела, вытесненные уроком вождения.',
  meal: 'Не переносится; при пересечении с уроком будет помечено «конфликт».',
  evening: 'Не переносится; при пересечении с уроком будет помечено «конфликт».',
  sleep: 'Виден и в режиме «болею».',
};

export function render(root) {
  const openBlocks = new Set(); // which block editors are expanded (survives re-renders)
  let notice = null; // { ok, text } after backup actions
  let persistent = null; // is storage protected from automatic eviction?
  let version = null; // version of the installed app (from the service worker), null on a local run

  const draw = () => {
    rememberOpenEditors(root, openBlocks);
    const { settings } = store.getData();
    const nodes = [
      notice && h('div', { class: `banner ${notice.ok ? 'banner--success' : 'banner--warning'}`, role: 'status' },
        h('p', {}, notice.text)),
      goalsCard(settings),
      workoutCard(settings),
      blocksCard(settings, openBlocks),
      backupCard(settings, persistent, setNotice),
      aboutCard(version, setNotice),
    ];
    root.replaceChildren(...nodes.filter(Boolean));
  };

  let active = true; // false once the user leaves this tab (the root element is reused)
  const renderer = createRenderer(root, draw);
  // Results of backup / update actions arrive later (file picker, network): by then the user may
  // be on another tab or typing. The banner is the first thing on the screen, so scroll to it.
  function setNotice(result) {
    if (!active) return;
    notice = result;
    renderer.request();
    window.scrollTo(0, 0);
  }
  draw();
  isStoragePersistent().then((value) => {
    persistent = value;
    if (active) renderer.request();
  });
  installedVersion().then((value) => {
    version = value;
    if (active) renderer.request();
  });
  const unsubscribe = store.subscribe(renderer.request);
  return () => {
    active = false;
    unsubscribe();
    renderer.dispose();
  };
}

const save = (mutator) => store.update((draft) => mutator(draft.settings));

// ---------- goals & rules ----------

function goalsCard(s) {
  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Цели и правила'),
    timeField('Подъём', s.wakeTarget, (v) => save((d) => { d.wakeTarget = v; })),
    numberField('Допуск по подъёму, мин', s.wakeToleranceMin, 0, 180, (v) => save((d) => { d.wakeToleranceMin = v; })),
    timeField('Отбой', s.bedTarget, (v) => save((d) => { d.bedTarget = v; })),
    timeField('«Поздно лёг» — позже', s.lateBedThreshold, (v) => save((d) => { d.lateBedThreshold = v; }),
      'На следующий день предложит режим «минимум».'),
    numberField('Цель по откликам в неделю', s.weeklyApplicationsGoal, 0, 100,
      (v) => save((d) => { d.weeklyApplicationsGoal = v; })),
    numberField('Дорога на вождение, мин (в одну сторону)', s.drivingTravelMin, 0, 180,
      (v) => save((d) => { d.drivingTravelMin = v; })),
    timeField('Закрытие дня — с', s.shutdownFrom, (v) => save((d) => { d.shutdownFrom = v; }),
      'С этого времени карточка «Закрыть день» поднимается наверх экрана «Сегодня».'),
    timeField('Граница суток', s.dayBoundary, (v) => save((d) => { d.dayBoundary = v; }),
      'Всё, что отмечено до этого времени, относится к предыдущему дню.'),
  );
}

// ---------- workouts ----------

function workoutCard(s) {
  const w = s.workout;
  const setWorkout = (mutator) => save((d) => mutator(d.workout));

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Тренировки'),
    h('p', { class: 'field-label' }, 'Дни с гирей'),
    h('div', { class: 'weekday-picker' },
      WEEKDAYS.map((label, i) => {
        const day = i + 1;
        const isOn = s.workoutDays.includes(day);
        return h('button', {
          class: 'weekday-picker__day', 'aria-pressed': String(isOn),
          onclick: () => save((d) => {
            d.workoutDays = isOn ? d.workoutDays.filter((x) => x !== day) : [...d.workoutDays, day].sort((x, y) => x - y);
          }),
        }, label);
      })),
    textField('Тренировка', w.title, (v) => setWorkout((x) => { x.title = v; })),
    textField('Упражнения', w.details, (v) => setWorkout((x) => { x.details = v; }), { multiline: true, allowEmpty: true }),
    numberField('Длительность, мин', w.durationMin, 5, 120, (v) => setWorkout((x) => { x.durationMin = v; })),
    textField('В остальные дни', w.restTitle, (v) => setWorkout((x) => { x.restTitle = v; })),
    numberField('Длительность, мин', w.restDurationMin, 5, 120, (v) => setWorkout((x) => { x.restDurationMin = v; })),
  );
}

// ---------- routine blocks ----------

function blocksCard(s, openBlocks) {
  const blocks = [...s.blocks].sort((a, b) => startMinutes(a, s) - startMinutes(b, s));

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Распорядок дня'),
    h('p', { class: 'muted hint hint--top' }, 'Нажми на блок, чтобы изменить время, название или задачи.'),
    h('div', { class: 'block-editors' }, blocks.map((block) => blockEditor(block, s, openBlocks))),
    h('button', {
      class: 'btn btn--block',
      onclick: () => {
        const id = newId('block');
        openBlocks.add(id);
        save((d) => {
          d.blocks.push({ id, title: 'Новый блок', kind: 'focus', movable: true, start: '16:00', end: '17:00', tasks: [] });
        });
      },
    }, '+ Добавить блок'),
  );
}

function blockEditor(block, s, openBlocks) {
  const isWorkout = block.kind === 'workout';
  const edit = (mutator) => save((d) => {
    const target = d.blocks.find((b) => b.id === block.id);
    if (target) mutator(target);
  });
  const start = toDayMinutes(block.start, s.dayBoundary);
  const end = toDayMinutes(block.end ?? block.start, s.dayBoundary);

  return h('details', { class: 'block-editor', 'data-block-id': block.id, open: openBlocks.has(block.id) },
    h('summary', { class: 'block-editor__summary' },
      h('span', { class: 'block__time' }, isWorkout ? block.start : formatRange(start, end)),
      h('span', { class: 'block-editor__title' }, isWorkout ? `${s.workout.title} / ${s.workout.restTitle}` : block.title),
    ),
    h('div', { class: 'block-editor__body' },
      isWorkout
        ? h('p', { class: 'muted hint hint--top' }, 'Название и длительность — в разделе «Тренировки».')
        : textField('Название', block.title, (v) => edit((b) => { b.title = v; })),
      h('div', { class: 'two-cols' },
        timeField('Начало', block.start, (v) => edit((b) => { b.start = v; })),
        !isWorkout && timeField('Конец', block.end, (v) => edit((b) => { b.end = v; })),
      ),
      !isWorkout && end < start && h('p', { class: 'hint hint--warning' }, 'Конец раньше начала — проверь время.'),
      !isWorkout && selectField('Тип', block.kind, KINDS, (v) => edit((b) => { b.kind = v; b.movable = v === 'focus'; }),
        KIND_HINTS[block.kind]),
      !isWorkout && textField('Группа (необязательно)', block.group ?? '', (v) => edit((b) => {
        if (v) b.group = v;
        else delete b.group;
      }), { allowEmpty: true, placeholder: 'например, «Блок 1»' }),
      !isWorkout && tasksEditor(block, edit),
      !isWorkout && h('button', {
        class: 'btn btn--block btn--danger',
        onclick: () => {
          if (window.confirm(`Удалить блок «${block.title}»? История отметок останется.`)) {
            openBlocks.delete(block.id);
            save((d) => { d.blocks = d.blocks.filter((b) => b.id !== block.id); });
          }
        },
      }, 'Удалить блок'),
    ),
  );
}

/** Reads which block editors are expanded right now, so a re-render keeps them as they are. */
function rememberOpenEditors(root, openBlocks) {
  for (const details of root.querySelectorAll('details[data-block-id]')) {
    if (details.open) openBlocks.add(details.dataset.blockId);
    else openBlocks.delete(details.dataset.blockId);
  }
}

function tasksEditor(block, edit) {
  return h('div', { class: 'tasks-editor' },
    h('p', { class: 'field-label' }, 'Задачи (галочки)'),
    block.tasks.map((task) => h('div', { class: 'task-row' },
      h('input', {
        class: 'input', type: 'text', value: task.title, 'aria-label': 'Задача',
        onchange: (e) => {
          const v = e.target.value.trim();
          if (v) edit((b) => { b.tasks.find((t) => t.id === task.id).title = v; });
        },
      }),
      h('button', {
        class: 'btn task-row__remove', 'aria-label': `Удалить задачу «${task.title}»`,
        onclick: () => edit((b) => { b.tasks = b.tasks.filter((t) => t.id !== task.id); }),
      }, '×'),
    )),
    h('button', {
      class: 'btn btn--ghost btn--small',
      onclick: () => edit((b) => { b.tasks.push({ id: newId('task'), title: 'Новая задача' }); }),
    }, '+ Задача'),
  );
}

// ---------- backup ----------

function backupCard(s, persistent, setNotice) {
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'visually-hidden', tabindex: -1,
    onchange: async (e) => {
      const [file] = e.target.files;
      e.target.value = '';
      if (file) setNotice(await restoreBackup(file));
    },
  });
  const last = s.lastBackupAt
    ? `${formatDayLabel(parseStamp(s.lastBackupAt).key)}, ${stampTime(s.lastBackupAt)}`
    : 'ещё не было';

  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Бэкап'),
    h('p', { class: 'muted hint hint--top' },
      'Данные хранятся только на этом устройстве. Раз в неделю сохраняй бэкап в «Файлы».'),
    h('p', {}, 'Последний бэкап: ', h('strong', {}, last)),
    persistent !== null && h('p', { class: 'muted hint hint--top' },
      persistent
        ? 'Хранилище защищено от автоочистки браузером.'
        : 'Браузер может очистить данные при нехватке места — тем важнее бэкап.'),
    h('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        const saved = await saveBackup();
        if (saved) setNotice({ ok: true, text: 'Бэкап сохранён.' });
      },
    }, 'Сохранить бэкап (JSON)'),
    h('button', { class: 'btn btn--block', onclick: () => fileInput.click() }, 'Восстановить из файла…'),
    fileInput,
  );
}

// ---------- about ----------

const UPDATE_NOTICES = {
  found: { ok: true, text: 'Найдена новая версия. Когда появится «Доступно обновление», нажми «Перезапустить».' },
  latest: { ok: true, text: 'У тебя последняя версия.' },
  offline: { ok: false, text: 'Не получилось проверить: нет связи с сервером.' },
  unsupported: { ok: false, text: 'Обновления работают только в установленном приложении (по ссылке https).' },
};

function aboutCard(version, setNotice) {
  return h('section', { class: 'card' },
    h('h2', { class: 'card__title' }, 'О приложении'),
    h('p', {}, 'Версия: ', h('strong', {}, version ?? 'офлайн-режим ещё не включён')),
    h('button', {
      class: 'btn btn--block',
      onclick: async (e) => {
        e.target.disabled = true;
        setNotice(UPDATE_NOTICES[await checkForUpdate()]);
      },
    }, 'Проверить обновление'),
  );
}

// ---------- fields ----------

function timeField(label, value, onChange, hint = null) {
  return h('label', { class: 'field' },
    h('span', {}, label),
    h('input', {
      type: 'time', class: 'input input--time', value,
      onchange: (e) => { if (e.target.value) onChange(e.target.value); },
    }),
    hint && h('small', { class: 'field__hint' }, hint),
  );
}

function numberField(label, value, min, max, onChange) {
  return h('label', { class: 'field' },
    h('span', {}, label),
    h('input', {
      type: 'number', class: 'input input--number', inputmode: 'numeric', min, max, step: 1, value,
      onchange: (e) => {
        const n = Number.parseInt(e.target.value, 10);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        else e.target.value = value;
      },
    }),
  );
}

function textField(label, value, onChange, { multiline = false, allowEmpty = false, placeholder = null } = {}) {
  const props = {
    class: `input${multiline ? ' textarea' : ''}`, placeholder,
    onchange: (e) => {
      const v = e.target.value.trim();
      if (v || allowEmpty) onChange(v);
      else e.target.value = value;
    },
  };
  return h('label', { class: 'field' },
    h('span', {}, label),
    multiline ? h('textarea', { ...props, rows: 2 }, value) : h('input', { ...props, type: 'text', value }),
  );
}

function selectField(label, value, options, onChange, hint = null) {
  return h('label', { class: 'field' },
    h('span', {}, label),
    h('select', { class: 'input', onchange: (e) => onChange(e.target.value) },
      options.map(([optionValue, optionLabel]) => h('option', { value: optionValue, selected: optionValue === value }, optionLabel))),
    hint && h('small', { class: 'field__hint' }, hint),
  );
}

// ---------- helpers ----------

function startMinutes(block, s) {
  return toDayMinutes(block.start, s.dayBoundary);
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
