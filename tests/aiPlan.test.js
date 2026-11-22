import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProposal, buildPlanContext, describeProposal, MAX_PROPOSALS, revertProposal, sanitizeProposals,
} from '../js/logic/aiPlan.js';
import { createDefaultSettings } from '../js/state/defaults.js';

const proposal = (fields) => ({ target: null, blockId: null, value: null, start: null, end: null, reason: 'потому что', ...fields });

test('the plan sent to the model: goals and blocks, nothing private', () => {
  const settings = createDefaultSettings();
  settings.lastBackupAt = '2026-11-20T10:00';
  const plan = buildPlanContext(settings);

  assert.equal(plan.wakeTarget, '09:00');
  assert.equal(plan.workoutsPerWeek, null); // fixed-weekday mode: nothing to change
  assert.equal('lastBackupAt' in plan, false);
  assert.deepEqual(plan.blocks.find((b) => b.id === 'cbr'), {
    id: 'cbr', title: 'Теория CBR', kind: 'focus', start: '10:30', end: '11:30',
  });
  // The workout block is as long as the longer variant (20 min) and cannot be moved.
  assert.deepEqual(plan.blocks.find((b) => b.id === 'workout'), {
    id: 'workout', title: 'Тренировка', kind: 'workout', start: '09:15', end: '09:35', fixed: true,
  });
  assert.equal('tasks' in plan.blocks[0], false);
});

test('sanitize keeps well-formed proposals, one per target, at most the cap', () => {
  const raw = [
    proposal({ target: 'wakeTarget', value: ' 09:30 ' }),
    proposal({ target: 'wakeTarget', value: '10:00' }), // duplicate target
    proposal({ target: 'deleteEverything', value: '1' }), // unknown target
    'nonsense',
    proposal({ target: 'block', blockId: 'cbr', start: '10:30', end: '11:00' }),
    proposal({ target: 'block', blockId: 'cbr', start: '10:30', end: '11:15' }), // same block again
    proposal({ target: 'block', blockId: 'code', start: '13:30', end: '15:00' }),
    proposal({ target: 'bedTarget', value: '00:30' }),
    proposal({ target: 'shutdownFrom', value: '22:00' }), // over the cap
  ];
  const clean = sanitizeProposals(raw);

  assert.equal(clean.length, MAX_PROPOSALS);
  assert.deepEqual(clean.map((p) => p.blockId ?? p.target), ['wakeTarget', 'cbr', 'code', 'bedTarget']);
  assert.equal(clean[0].value, '09:30');
  assert.deepEqual(sanitizeProposals(null), []);
  assert.deepEqual(sanitizeProposals({ proposals: [] }), []);
});

test('time goals: described as "from → to", rejected when unchanged, malformed or out of order', () => {
  const settings = createDefaultSettings(); // wake 09:00, close 21:00, bed 01:00, late 02:00
  assert.deepEqual(describeProposal(proposal({ target: 'wakeTarget', value: '9:30' }), settings), {
    title: 'Подъём', from: '09:00', to: '09:30', next: '09:30',
  });
  assert.equal(describeProposal(proposal({ target: 'wakeTarget', value: '09:00' }), settings), null); // no change
  assert.equal(describeProposal(proposal({ target: 'wakeTarget', value: '25:00' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'wakeTarget', value: 'пораньше' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'wakeTarget', value: '22:00' }), settings), null); // after closing the day
  assert.equal(describeProposal(proposal({ target: 'bedTarget', value: '03:00' }), settings), null); // later than "late"
  assert.equal(describeProposal(proposal({ target: 'bedTarget', value: '00:30' }), settings).to, '00:30');
  assert.equal(describeProposal(proposal({ target: 'lateBedThreshold', value: '00:30' }), settings), null); // before bedtime
});

test('AI cannot put the evening review after bedtime, even across midnight', () => {
  const settings = createDefaultSettings();
  assert.equal(describeProposal(proposal({ target: 'shutdownFrom', value: '01:30' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'bedTarget', value: '20:00' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'shutdownFrom', value: '00:30' }), settings).to, '00:30');
});

test('counts: whole numbers in range; workouts per week only with the weekly goal on', () => {
  const settings = createDefaultSettings();
  assert.deepEqual(describeProposal(proposal({ target: 'weeklyApplicationsGoal', value: '3' }), settings), {
    title: 'Отклики в неделю', from: '5', to: '3', next: 3,
  });
  assert.equal(describeProposal(proposal({ target: 'weeklyApplicationsGoal', value: '5' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'weeklyApplicationsGoal', value: '3.5' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'weeklyApplicationsGoal', value: '500' }), settings), null);

  assert.equal(describeProposal(proposal({ target: 'workoutsPerWeek', value: '2' }), settings), null);
  settings.workoutMode = 'weekly';
  assert.equal(describeProposal(proposal({ target: 'workoutsPerWeek', value: '2' }), settings).to, '2');
  assert.equal(describeProposal(proposal({ target: 'workoutsPerWeek', value: '0' }), settings), null);
});

test('blocks: can shrink or move into free time, never overlap another block', () => {
  const settings = createDefaultSettings(); // … lunch 12:30–13:30, code 13:30–16:00, free 16:00–19:00 …
  assert.deepEqual(describeProposal(proposal({ target: 'block', blockId: 'code', start: '13:30', end: '15:00' }), settings), {
    title: 'Код', from: '13:30–16:00', to: '13:30–15:00', next: { start: '13:30', end: '15:00' },
  });
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'code', start: '13:00', end: '15:00' }), settings), null); // into lunch
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'code', start: '13:30', end: '16:30' }), settings), null); // into free time block
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'code', start: '13:30', end: '16:00' }), settings), null); // unchanged
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'code', start: '15:00', end: '14:00' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'nope', start: '10:00', end: '11:00' }), settings), null);
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'workout', start: '09:20', end: '09:40' }), settings), null); // fixed
  // "Завтрак" ends 10:30 and the workout before it takes 09:15–09:35: moving breakfast earlier is fine up to 09:35.
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'breakfast', start: '09:35', end: '10:30' }), settings).to, '09:35–10:30');
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'breakfast', start: '09:30', end: '10:30' }), settings), null);
  // A marker ("Отбой 01:00") stays a point in time.
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'bedtime', start: '00:45', end: '00:45' }), settings), null); // inside "Телефон на зарядку"
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'bedtime', start: '01:15', end: '01:15' }), settings).to, '01:15');
  assert.equal(describeProposal(proposal({ target: 'block', blockId: 'bedtime', start: '01:00', end: '01:30' }), settings), null);
});

test('apply changes exactly one thing and revert puts it back', () => {
  const settings = createDefaultSettings();
  const before = structuredClone(settings);

  const goal = applyProposal(settings, proposal({ target: 'weeklyApplicationsGoal', value: '3' }));
  const block = applyProposal(settings, proposal({ target: 'block', blockId: 'code', start: '14:00', end: '15:30' }));
  assert.equal(settings.weeklyApplicationsGoal, 3);
  assert.deepEqual(
    [settings.blocks.find((b) => b.id === 'code').start, settings.blocks.find((b) => b.id === 'code').end],
    ['14:00', '15:30'],
  );

  // A proposal that no longer fits changes nothing.
  assert.equal(applyProposal(settings, proposal({ target: 'weeklyApplicationsGoal', value: '3' })), null);
  assert.equal(applyProposal(settings, proposal({ target: 'block', blockId: 'jobs', start: '11:30', end: '14:30' })), null);

  revertProposal(settings, block);
  revertProposal(settings, goal);
  assert.deepEqual(settings, before);
});

test('accepting one proposal can make another one stale', () => {
  const settings = createDefaultSettings();
  const longerCbr = proposal({ target: 'block', blockId: 'cbr', start: '10:30', end: '12:00' }); // needs jobs to move first
  assert.equal(describeProposal(longerCbr, settings), null);

  applyProposal(settings, proposal({ target: 'block', blockId: 'jobs', start: '12:00', end: '12:30' }));
  assert.equal(describeProposal(longerCbr, settings).to, '10:30–12:00');
});
