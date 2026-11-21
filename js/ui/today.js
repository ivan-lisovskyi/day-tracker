import { h } from './dom.js';

export const title = 'Сегодня';

/** Placeholder until the screen is implemented (see README → Roadmap). */
export function render(root) {
  root.append(
    h('section', { class: 'card placeholder' },
      h('p', {}, 'Здесь будет таймлайн дня, чек-лист и «Минимум дня».'),
      h('p', { class: 'muted' }, 'Этап 1: каркас приложения.'),
    ),
  );
}
