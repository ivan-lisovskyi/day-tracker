import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../js/logic/routes.js';

const TODAY = '2026-11-22';

test('tabs open by name; anything unknown opens "Сегодня"', () => {
  assert.deepEqual(parseRoute('#week', TODAY), { name: 'week' });
  assert.deepEqual(parseRoute('#settings', TODAY), { name: 'settings' });
  assert.deepEqual(parseRoute('', TODAY), { name: 'today' });
  assert.deepEqual(parseRoute('#nonsense', TODAY), { name: 'today' });
});

test('an earlier day opens by its date; today, the future and broken dates do not', () => {
  assert.deepEqual(parseRoute('#day/2026-11-21', TODAY), { name: 'day', dayKey: '2026-11-21' });
  assert.deepEqual(parseRoute('#day/2025-12-31', TODAY), { name: 'day', dayKey: '2025-12-31' });
  assert.deepEqual(parseRoute('#day/2026-11-22', TODAY), { name: 'today' }); // today has its own tab
  assert.deepEqual(parseRoute('#day/2026-11-23', TODAY), { name: 'today' });
  assert.deepEqual(parseRoute('#day/2026-02-30', TODAY), { name: 'today' });
  assert.deepEqual(parseRoute('#day/21.11.2026', TODAY), { name: 'today' });
  assert.deepEqual(parseRoute('#day', TODAY), { name: 'today' });
});
