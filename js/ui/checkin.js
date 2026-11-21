/**
 * Morning check-in: sleep and energy, 1–5, two taps. Saved once both are picked;
 * a low rating makes the Today screen suggest minimum mode (rules.minimumSuggestionReason).
 */
import { h } from './dom.js';
import { ratingRow } from './rows.js';

// The first of the two taps is kept here until the second one, so a re-render does not lose it.
const drafts = new Map(); // dayKey → { sleep, energy }

export function checkinCard({ dayKey, edit }) {
  const draft = drafts.get(dayKey) ?? {};
  const pick = (field, value) => {
    const next = { ...draft, [field]: value };
    if (next.sleep && next.energy) {
      drafts.delete(dayKey);
      edit((d) => { d.checkin = { sleep: next.sleep, energy: next.energy }; });
    } else {
      drafts.set(dayKey, next);
      edit(() => {}); // redraw to show the first pick
    }
  };

  return h('section', { class: 'card checkin' },
    h('h2', { class: 'card__title' }, 'Как ты?'),
    h('p', { class: 'muted hint hint--top' }, '1 — очень плохо, 5 — отлично'),
    ratingRow({ label: 'Сон', value: draft.sleep, onPick: (n) => pick('sleep', n) }),
    ratingRow({ label: 'Энергия', value: draft.energy, onPick: (n) => pick('energy', n) }),
  );
}

/** One line for the mode card once the check-in is done, with a way to redo it. */
export function checkinSummary({ day, edit }) {
  if (!day.checkin) return null;
  return h('p', { class: 'checkin-summary' },
    `Сон ${day.checkin.sleep}/5 · энергия ${day.checkin.energy}/5`,
    h('button', { class: 'link-btn', onclick: () => edit((d) => { delete d.checkin; }) }, 'изменить'),
  );
}
