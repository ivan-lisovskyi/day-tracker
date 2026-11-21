import { h } from './dom.js';

export const title = 'Настройки';

/** Placeholder until the screen is implemented (see README → Roadmap). */
export function render(root) {
  root.append(
    h('section', { class: 'card placeholder' },
      h('p', {}, 'Здесь будут блоки распорядка, цели и бэкап.'),
      h('p', { class: 'muted' }, 'Этап 1: каркас приложения.'),
    ),
  );
}
