/**
 * App entry point: hash-based router between the three tabs and an earlier day (#day/<date>).
 * Each screen exports { title, render(root, dayKey) }; render may return a cleanup
 * function (unsubscribe, clear timers) that runs when another screen opens.
 */
import * as today from './ui/today.js';
import * as week from './ui/week.js';
import * as settings from './ui/settings.js';
import { renderErrorScreen } from './ui/errorScreen.js';
import { registerServiceWorker, requestPersistentStorage } from './pwa.js';
import { parseRoute } from './logic/routes.js';
import { dayKeyFor } from './logic/time.js';
import * as store from './state/store.js';

/** An earlier day reuses the "Сегодня" screen and keeps the "Неделя" tab lit: it is opened from there. */
const pastDay = { title: 'Прошлый день', tab: 'week', render: today.renderPastDay };
const routes = { today, week, settings, day: pastDay };

const screenEl = document.getElementById('screen');
const titleEl = document.getElementById('screen-title');
let cleanupScreen = null;

function currentRoute() {
  return parseRoute(location.hash, dayKeyFor(new Date(), store.getData().settings.dayBoundary));
}

function render() {
  const { name, dayKey } = currentRoute();
  const screen = routes[name];
  const tab = screen.tab ?? name;

  titleEl.textContent = screen.title;
  document.title = `${screen.title} · Мой день`;

  for (const link of document.querySelectorAll('.tabbar__item')) {
    if (link.dataset.route === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  cleanupScreen?.();
  cleanupScreen = null;
  screenEl.replaceChildren();
  try {
    cleanupScreen = screen.render(screenEl, dayKey) ?? null;
  } catch (err) {
    renderErrorScreen(screenEl, err);
  }
  window.scrollTo(0, 0);
}

// An error in a later redraw (after a tap) also lands on the error screen instead of a frozen page.
window.addEventListener('error', (event) => {
  cleanupScreen?.();
  cleanupScreen = null;
  renderErrorScreen(screenEl, event.error ?? event.message);
});

window.addEventListener('hashchange', render);
render();

registerServiceWorker();
requestPersistentStorage();
