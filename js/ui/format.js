/** Small text formatting helpers for the Russian UI. */
import { formatMinutes, keyToLocalDate } from '../logic/time.js';

/** plural(3, 'день', 'дня', 'дней') → 'дня' */
export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const dayLabelFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric' });

/** "2026-11-21" → "Суббота, 21 ноября" */
export function formatDayLabel(key) {
  const text = dayLabelFormat.format(keyToLocalDate(key));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2026-11-21" → "сб, 21" */
export function formatShortDay(key) {
  return shortDayFormat.format(keyToLocalDate(key));
}

/** Block time range: "10:30–11:30", or just "01:00" for a zero-length marker. */
export function formatRange(start, end) {
  return start === end ? formatMinutes(start) : `${formatMinutes(start)}–${formatMinutes(end)}`;
}

/** 90 → "1 ч 30 мин", 30 → "30 мин" */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  return h ? `${h} ч` : `${m} мин`;
}
