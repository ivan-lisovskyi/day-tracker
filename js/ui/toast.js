/**
 * A short note at the bottom after a mark — "Отмечено: Код · Отменить" — instead of asking
 * before. One at a time; it goes away by itself after a few seconds.
 */
import { h } from './dom.js';

const SHOW_MS = 4000;
let current = null;
let timer = null;

export function showToast(text, onUndo) {
  hideToast();
  current = h('div', {
    // Above the "Сейчас" bar when it is on screen, so its button stays reachable.
    class: `toast${document.querySelector('.now-bar') ? ' toast--raised' : ''}`,
    role: 'status',
  },
  h('span', { class: 'toast__text' }, text),
  onUndo && h('button', {
    class: 'toast__undo',
    onclick: () => {
      hideToast();
      onUndo();
    },
  }, 'Отменить'));
  document.body.append(current);
  timer = setTimeout(hideToast, SHOW_MS);
}

export function hideToast() {
  clearTimeout(timer);
  current?.remove();
  current = null;
}
