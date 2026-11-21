import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, dayKeyFor, formatMinutes, isoWeekday, nowDayMinutes, stampToDayMinutes,
  toDayMinutes, toMinutes, toStamp, weekKeys, weekStart,
} from '../js/logic/time.js';

test('toMinutes / formatMinutes round-trip and wrap past midnight', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(toMinutes('0:05'), 5);
  assert.equal(formatMinutes(570), '09:30');
  assert.equal(formatMinutes(1500), '01:00');
  assert.throws(() => toMinutes('25:00'), RangeError);
  assert.throws(() => toMinutes('9.30'), RangeError);
});

test('toDayMinutes puts night times after midnight into the same day', () => {
  assert.equal(toDayMinutes('23:30'), 1410);
  assert.equal(toDayMinutes('01:00'), 1500);
  assert.equal(toDayMinutes('05:00'), 300);
  assert.equal(toDayMinutes('04:59'), 1739);
});

test('date keys: adding days across month and year, weekdays, weeks start on Monday', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(isoWeekday('2026-11-23'), 1); // Monday
  assert.equal(isoWeekday('2026-11-22'), 7); // Sunday
  assert.equal(weekStart('2026-11-22'), '2026-11-16');
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.deepEqual(weekKeys('2026-11-23').at(-1), '2026-11-29');
});

test('day boundary: before 05:00 still belongs to the previous day', () => {
  assert.equal(dayKeyFor(new Date(2026, 10, 24, 1, 20)), '2026-11-23');
  assert.equal(dayKeyFor(new Date(2026, 10, 24, 4, 59)), '2026-11-23');
  assert.equal(dayKeyFor(new Date(2026, 10, 24, 5, 0)), '2026-11-24');
  assert.equal(dayKeyFor(new Date(2026, 10, 24, 1, 20), '00:00'), '2026-11-24');
  assert.equal(nowDayMinutes(new Date(2026, 10, 24, 1, 20)), 1520);
  assert.equal(nowDayMinutes(new Date(2026, 10, 24, 10, 0)), 600);
});

test('stamps: bedtime after midnight is measured from the tracked day', () => {
  assert.equal(toStamp(new Date(2026, 10, 24, 1, 20)), '2026-11-24T01:20');
  assert.equal(stampToDayMinutes('2026-11-24T01:20', '2026-11-23'), 1520);
  assert.equal(stampToDayMinutes('2026-11-23T23:40', '2026-11-23'), 1420);
  assert.equal(stampToDayMinutes('2026-11-23T09:12:00', '2026-11-23'), 552);
});
