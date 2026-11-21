/**
 * Shown instead of a screen when rendering throws. It must never leave the user stuck:
 * the data can still be saved to a file, a backup can be restored, and the app reloaded.
 */
import { h } from './dom.js';
import { restoreBackup, saveBackup } from './backup.js';

export function renderErrorScreen(root, error) {
  console.error(error);

  const status = h('p', { class: 'hint', role: 'status' });
  const setStatus = (text) => { status.textContent = text; };

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'visually-hidden', tabindex: -1,
    onchange: async (e) => {
      const [file] = e.target.files;
      e.target.value = '';
      if (!file) return;
      const result = await restoreBackup(file);
      setStatus(result.text);
      if (result.ok) window.location.reload();
    },
  });

  root.replaceChildren(
    h('section', { class: 'card error-screen' },
      h('h2', { class: 'card__title' }, 'Что-то пошло не так'),
      h('p', {}, 'Экран не удалось показать. Твои данные на месте — их можно сохранить в файл или восстановить из бэкапа.'),
      h('p', { class: 'muted hint' }, `Ошибка: ${error?.message ?? error}`),
      h('button', {
        class: 'btn btn--primary btn--block',
        onclick: async () => {
          try {
            if (await saveBackup()) setStatus('Данные сохранены в файл.');
          } catch (err) {
            setStatus(`Не удалось сохранить: ${err.message}`);
          }
        },
      }, 'Сохранить данные в файл'),
      h('button', { class: 'btn btn--block', onclick: () => fileInput.click() }, 'Восстановить из бэкапа…'),
      h('button', { class: 'btn btn--block btn--ghost', onclick: () => window.location.reload() }, 'Перезагрузить'),
      status,
      fileInput,
    ),
  );
}
