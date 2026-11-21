/**
 * App entry point: hash-based router between the three tabs.
 * Each screen module exports { title, render(root) }; render may return a cleanup
 * function (unsubscribe, clear timers) that runs when another tab opens.
 */
import * as today from './ui/today.js';
import * as week from './ui/week.js';
import * as settings from './ui/settings.js';

const routes = { today, week, settings };
const DEFAULT_ROUTE = 'today';

const screenEl = document.getElementById('screen');
const titleEl = document.getElementById('screen-title');
let cleanupScreen = null;

function currentRoute() {
  const name = location.hash.replace('#', '');
  return name in routes ? name : DEFAULT_ROUTE;
}

function render() {
  const name = currentRoute();
  const screen = routes[name];

  titleEl.textContent = screen.title;
  document.title = `${screen.title} · Мой день`;

  for (const link of document.querySelectorAll('.tabbar__item')) {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  cleanupScreen?.();
  screenEl.replaceChildren();
  cleanupScreen = screen.render(screenEl) ?? null;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
