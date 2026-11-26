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
