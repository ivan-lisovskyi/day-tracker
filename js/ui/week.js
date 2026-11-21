import { h } from './dom.js';

export const title = 'Неделя';

/** Placeholder until the screen is implemented (see README → Roadmap). */
export function render(root) {
  root.append(
    h('section', { class: 'card placeholder' },
      h('p', {}, 'Здесь будет статистика недели и экспорт сводки.'),
      h('p', { class: 'muted' }, 'Этап 1: каркас приложения.'),
    ),
  );
}
