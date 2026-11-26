/**
 * "Свои дела": things added to one particular day on top of the routine.
 *
 * Today and on earlier days the ones without a time are ticked right here; the timed ones sit in
 * the timeline at their time and are ticked there. "Изменить" turns the list into fields (time,
 * title, ×). On a later day ("План на день") the list is always editable: there is nothing to tick.
 */
import { h } from './dom.js';
import { taskRow } from './rows.js';
import { showToast } from './toast.js';
import {
  addOwnTask, newOwnTaskId, OWN_TITLE_MAX, removeOwnTask, restoreOwnTask, timedOwnTasks, untimedOwnTasks, updateOwnTask,
} from '../logic/ownTasks.js';

/** Days whose list is open for editing ("Изменить"), kept across re-renders. */
const editing = new Set();
/**
 * What is typed into the add form, per day. The screen redraws (every 30 s, on coming back to
 * the app) as soon as focus leaves the fields, and on iPhone it leaves them before "+" is tapped
 * (closing the time wheel, "Готово" above the keyboard): the draft survives the redraw.
 */
const drafts = new Map();

export function ownTasksCard({ dayKey, day, settings, edit, redraw }, { planning = false } = {}) {
  const timed = timedOwnTasks(day, settings.dayBoundary);
  const untimed = untimedOwnTasks(day);
  const count = timed.length + untimed.length;
  const editMode = planning || editing.has(dayKey);
  const toggle = () => {
    if (editing.has(dayKey)) editing.delete(dayKey);
    else editing.add(dayKey);
    redraw();
  };

  return h('section', { class: 'card own-tasks' },
    h('div', { class: 'card__head' },
      h('h2', { class: 'card__title' }, 'Свои дела'),
      !planning && count > 0 && h('button', { class: 'link-btn', onclick: toggle }, editMode ? 'Готово' : 'Изменить'),
    ),
    count === 0 && h('p', { class: 'muted hint hint--top' },
      'Только для этого дня. Если указать время, дело встанет в распорядок.'),
    editMode && count > 0 && h('ul', { class: 'own-list' }, [...timed, ...untimed].map((task) => editRow(task, edit))),
    !editMode && untimed.map((task) => taskRow(task, day, edit)),
    !editMode && timed.length > 0 && h('p', { class: 'muted hint' },
      `В распорядке: ${timed.map((task) => `${task.time} ${task.title}`).join(', ')}`),
    addForm(dayKey, edit),
  );
}

function editRow(task, edit) {
  return h('li', { class: 'own-row' },
    h('input', {
      type: 'time', class: 'input input--time own-row__time', value: task.time ?? '', 'aria-label': `Время: ${task.title}`,
      onchange: (e) => edit((d) => updateOwnTask(d, task.id, { time: e.target.value })),
    }),
    h('input', {
      type: 'text', class: 'input own-row__title', value: task.title, maxlength: OWN_TITLE_MAX, 'aria-label': 'Название дела',
      onchange: (e) => edit((d) => updateOwnTask(d, task.id, { title: e.target.value })),
    }),
    h('button', {
      type: 'button', class: 'btn own-row__remove', 'aria-label': `Удалить: ${task.title}`,
      onclick: () => removeWithUndo(task, edit),
    }, '×'),
  );
}

function removeWithUndo(task, edit) {
  let removed = null;
  edit((d) => { removed = removeOwnTask(d, task.id); });
  if (removed) showToast(`Удалено: ${task.title}`, () => edit((d) => restoreOwnTask(d, removed)));
}

/** Title, optional time, "+". Enter on the keyboard adds too. */
function addForm(dayKey, edit) {
  const draft = drafts.get(dayKey) ?? { title: '', time: '' };
  const remember = () => {
    if (title.value || time.value) drafts.set(dayKey, { title: title.value, time: time.value });
    else drafts.delete(dayKey);
  };
  const title = h('input', {
    type: 'text', class: 'input own-add__title', placeholder: 'Новое дело', maxlength: OWN_TITLE_MAX,
    'aria-label': 'Новое дело', enterkeyhint: 'done', value: draft.title, oninput: remember,
  });
  const time = h('input', {
    type: 'time', class: 'input input--time own-add__time', 'aria-label': 'Время, необязательно', value: draft.time,
    oninput: remember, onchange: remember,
  });

  return h('form', {
    class: 'own-add',
    onsubmit: (e) => {
      e.preventDefault();
      if (!title.value.trim()) {
        title.focus();
        return;
      }
      drafts.delete(dayKey);
      edit((d) => { addOwnTask(d, { title: title.value, time: time.value }, newOwnTaskId()); });
      // The screen does not redraw while a field has focus (see createRenderer): let go of it.
      document.activeElement?.blur();
    },
  },
  title,
  time,
  h('button', { type: 'submit', class: 'btn btn--primary own-add__btn', 'aria-label': 'Добавить дело' }, '+'),
  // iPhone shows an empty time field as a blank box: say what it is.
  h('span', { class: 'own-add__caption', 'aria-hidden': 'true' }, 'время'));
}
