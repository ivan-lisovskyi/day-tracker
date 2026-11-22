/**
 * Morning check-in: sleep and energy, 1–5, two taps. Saved once both are picked;
 * a low rating makes the Today screen suggest minimum mode (rules.minimumSuggestionReason).
 */
import { h } from './dom.js';
import { ratingRow } from './rows.js';

// Picks that are not saved yet, so a re-render does not lose them:
// the first of the two taps, or the values being changed after "изменить" (editing: true).
const drafts = new Map(); // dayKey → { sleep, energy, editing }

/** True while a saved check-in is being changed: the card is shown again, at any time of day. */
export const isCheckinEditing = (dayKey) => drafts.get(dayKey)?.editing === true;

export function checkinCard({ dayKey, edit, redraw }) {
  const draft = drafts.get(dayKey) ?? {};
  const save = ({ sleep, energy }) => {
    drafts.delete(dayKey);
    edit((d) => { d.checkin = { sleep, energy }; });
  };
  const pick = (field, value) => {
    const next = { ...draft, [field]: value };
    if (!draft.editing && next.sleep && next.energy) {
      save(next); // first time: the second tap saves
    } else {
      drafts.set(dayKey, next);
      redraw(); // nothing is saved yet
    }
  };

  return h('section', { class: 'card checkin' },
    h('h2', { class: 'card__title' }, 'Как ты?'),
    h('p', { class: 'muted hint hint--top' }, '1 — очень плохо, 5 — отлично'),
    ratingRow({ label: 'Сон', value: draft.sleep, onPick: (n) => pick('sleep', n) }),
    ratingRow({ label: 'Энергия', value: draft.energy, onPick: (n) => pick('energy', n) }),
    draft.editing && h('button', { class: 'btn btn--primary btn--block', onclick: () => save(draft) }, 'Готово'),
  );
}

/** One line for the mode card once the check-in is done, with a way to change it. */
export function checkinSummary({ day, dayKey, redraw }) {
  if (!day.checkin || isCheckinEditing(dayKey)) return null;
  return h('p', { class: 'checkin-summary' },
    `Сон ${day.checkin.sleep}/5 · энергия ${day.checkin.energy}/5`,
    h('button', {
      class: 'link-btn',
      onclick: () => {
        drafts.set(dayKey, { ...day.checkin, editing: true }); // the saved values stay until "Готово"
        redraw();
        window.scrollTo(0, 0); // the card opens at the top of the screen
      },
    }, 'изменить'),
  );
}
