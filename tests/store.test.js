import { test } from 'node:test';
import assert from 'node:assert/strict';

// store.js mirrors data to localStorage: an in-memory one stands in for the browser's.
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const store = await import('../js/state/store.js');
const { addDays, dayKeyFor } = await import('../js/logic/time.js');
const { addOwnTask } = await import('../js/logic/ownTasks.js');

test('planning tomorrow as the very first action starts tracking today', () => {
  const todayKey = dayKeyFor(new Date(), store.getData().settings.dayBoundary);
  const tomorrowKey = addDays(todayKey, 1);
  store.updateDay(tomorrowKey, (d) => addOwnTask(d, { title: 'Банк' }, 'own-x'));

  const data = store.getData();
  assert.equal(data.settings.trackingSince, todayKey);
  assert.deepEqual(data.days[tomorrowKey].ownTasks, [{ id: 'own-x', title: 'Банк', time: null }]);
  assert.ok(memory.get('day-tracker').includes('own-x')); // saved
});

test('a record made ahead is marked planOnly until the day itself is changed', () => {
  const todayKey = dayKeyFor(new Date(), store.getData().settings.dayBoundary);
  const later = addDays(todayKey, 3);
  store.updateDay(later, (d) => { d.focus = 'Отклики'; });
  assert.equal(store.getData().days[later].planOnly, true);

  // The same record once that day has come: simulated by moving the record to today.
  store.update((draft) => { draft.days[todayKey] = { ...draft.days[later] }; });
  store.updateDay(todayKey, (d) => { d.applications = 1; });
  assert.equal('planOnly' in store.getData().days[todayKey], false);
});
