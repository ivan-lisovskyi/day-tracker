# Day Planning (own tasks on any day) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open any upcoming day, add own tasks to it (title + optional time), and tick them on the day like routine tasks.

**Architecture:** A day record gets an `ownTasks` list. Pure logic in a new `js/logic/ownTasks.js` handles it; `buildDaySchedule` turns timed tasks into marker blocks in the timeline. `#day/<future date>` opens a new "План на день" screen, built by `today.js` like the past-day screen. "Неделя" and the week strip link to future days.

**Tech Stack:** Vanilla JS ES modules, no build step, `node --test`; PWA with service worker `sw.js`.

**Spec:** `docs/superpowers/specs/2026-11-26-day-planning-design.md`

## Global Constraints

- UI copy in Russian; code, comments, commits and README in English.
- The day field is `ownTasks: [{ id, title, time }]`; the spec says `tasks`, renamed so it is not confused with `block.tasks`. Marks stay in `day.done[id]` and `day.skipped[id]`.
- `id` starts with `own-`, so it never matches a routine task id. `title` is trimmed, 1–80 characters. `time` is `"HH:MM"` or `null`.
- Own tasks never enter `buildWeekStats()` output: it is the AI payload, and the AI must not see them. `WEEK_STATS_VERSION` stays 4.
- `settings.trackingSince` is never set to a future date.
- Every new file goes into `ASSETS` in `sw.js`. `VERSION` in `sw.js` and `"version"` in `package.json` become `0.15.0`; `tests/sw.test.js` checks both.

## Review Focus

1. The first action ever is planning tomorrow. Tracking must start today, not tomorrow, so today's minimum still counts. Covered by `tests/store.test.js` in Task 1.
2. A timed task appears in the schedule; an untimed one only in the card. "Задач отмечено" must count each once (Task 2 test).
3. Removing a ticked task also removes its mark, and "Отменить" brings back both the task and the mark (Task 1 test).
4. Own tasks are absent from week stats, even on past days (Task 2 test).
5. A task at 00:30 sorts after evening blocks; own tasks stay on sick days and are not moved by a driving lesson (Task 2 test).

---

### Task 1: Own tasks data

**Files:**
- Create: `js/logic/ownTasks.js`
- Modify: `js/state/schema.js` (doc comment; `normalizeDay`)
- Test: `tests/ownTasks.test.js`, `tests/schema.test.js`

**Interfaces:**
- Produces:
  - `OWN_TITLE_MAX = 80`
  - `newOwnTaskId(now = Date.now(), random = Math.random) → string` returns `own-<base36 now><4 base36 chars>`.
  - `addOwnTask(day, { title, time }, id) → task | null` mutates `day.ownTasks` (creating it); returns null for an empty title.
  - `updateOwnTask(day, id, { title?, time? }) → void` ignores an empty title; `time: ''` becomes null.
  - `removeOwnTask(day, id) → removed | null`, where `removed = { task, index, done, skipped }`; it also deletes `day.done[id]` and `day.skipped[id]`.
  - `restoreOwnTask(day, removed) → void` puts the task back at `index` with its marks.
  - `timedOwnTasks(day) → task[]` sorted by time.
  - `untimedOwnTasks(day) → task[]` in insertion order.
  - `hasPlan(day) → boolean`: own tasks, focus, a driving lesson or mode `minimum`.
  - `isOwnTask(value) → boolean`: the validator `schema.js` uses.

- [ ] **Step 1: Write the failing tests** in `tests/ownTasks.test.js`:
  - `add trims the title, cuts it to 80 chars, keeps an empty time as null, rejects a blank title`
  - `remove clears done/skipped and restore puts task and marks back at the same index`
  - `update changes the time, clears it with "", ignores a blank title`
  - `timed tasks sort by time, untimed keep their order`
  - `hasPlan: empty day false; focus, lesson, minimum mode or a task true`
- [ ] **Step 2: Add a test to `tests/schema.test.js`**: `own tasks: broken entries and duplicate ids are dropped, valid ones kept`. A valid entry is `{ id: 'own-a', title: 'Банк', time: '14:00' }`. Dropped: missing id, blank title, `time: '25:00'`, a non-object, a repeated id. `ownTasks: 'x'` is deleted.
- [ ] **Step 3: Add `tests/store.test.js`**: `planning tomorrow as the very first action starts tracking today`. Before importing `store.js`, install an in-memory `globalThis.localStorage` (`getItem`/`setItem`/`removeItem`). Then call `updateDay(<tomorrow>, d => addOwnTask(d, { title: 'Банк' }, 'own-x'))` and assert `getData().settings.trackingSince === <today>`. `store.updateDay` should already pass; the test pins it.
- [ ] **Step 4: Run** `node --test tests/ownTasks.test.js tests/schema.test.js tests/store.test.js` and expect FAIL (no module yet).
- [ ] **Step 5: Implement** `js/logic/ownTasks.js` and the `ownTasks` validation in `normalizeDay`.
- [ ] **Step 6: Run** `npm test` and expect all to pass.
- [ ] **Step 7: Commit** with the message `feat: own tasks in the day record`.

### Task 2: Schedule, counting and stats

**Files:**
- Modify: `js/logic/schedule.js` (`buildDaySchedule`), `js/logic/dayView.js`, `js/ui/shutdown.js` (use `countDayTasks`)
- Test: `tests/schedule.test.js`, `tests/dayView.test.js`, `tests/weekStats.test.js`

**Interfaces:**
- Consumes: `timedOwnTasks`, `untimedOwnTasks` from Task 1.
- Produces:
  - `buildDaySchedule` also returns timed own tasks as blocks: `{ id: task.id, sourceId: null, kind: 'own', title, group: null, movable: false, start, end: start, tasks: [{ id, title }], details: null }`. They are added after the sick filter and after `applyDrivingLesson`, then sorted with the rest.
  - `countDayTasks(schedule, day) → { done, total, skipped }`, moved from `shutdown.js`; it also counts untimed own tasks.

- [ ] **Step 1: Write the failing tests**:
  - in `schedule.test.js`, `own timed tasks become marker blocks in time order, also on sick days and around a driving lesson`. A task at 00:30 gets `start === 1470` with boundary 05:00. On a sick day only the sleep blocks and the own block remain. A lesson over 14:00–15:00 leaves an own block at 14:30 unmoved, with no `conflict`.
  - in `dayView.test.js`, `countDayTasks counts timed own tasks once and untimed ones too`.
  - in `weekStats.test.js`, `own tasks do not change week stats`: `deepEqual` of the stats with and without `ownTasks` on a past day.
- [ ] **Step 2: Run** the three files and expect FAIL.
- [ ] **Step 3: Implement**, then switch `shutdown.js` to `countDayTasks`.
- [ ] **Step 4: Run** `npm test` and expect all to pass.
- [ ] **Step 5: Commit** with the message `feat: own tasks in the timeline and in the day's task count`.

### Task 3: Routes and week-strip marks for future days

**Files:**
- Modify: `js/logic/routes.js`, `js/logic/dayView.js` (`weekStripDays`)
- Test: `tests/routes.test.js`, `tests/dayView.test.js`

**Interfaces:**
- Produces:
  - `parseRoute('#day/<future>', todayKey) → { name: 'plan', dayKey }`; past dates stay `{ name: 'day', dayKey }`; today and broken dates still give `{ name: 'today' }`.
  - `weekStripDays(statsDays, plannedDates = new Set())`: a future day gets `href: '#day/<date>'`, and its state is `'planned'` when its date is in `plannedDates` (otherwise `'future'`).

- [ ] **Step 1: Update the tests**. In `routes.test.js`, the line expecting `'#day/2026-11-23'` to give today now expects `{ name: 'plan', dayKey: '2026-11-23' }`; add a far-future case. In `dayView.test.js`, add `future days link to their plan and show "planned" when something is planned`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and expect all to pass.
- [ ] **Step 5: Commit** with the message `feat: routes and strip marks for upcoming days`.

### Task 4: «Свои дела» card and «План на день» screen

**Files:**
- Create: `js/ui/ownTasks.js`
- Modify: `js/ui/today.js`, `js/app.js`, `js/ui/shutdown.js`, `css/app.css`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `ownTasksCard(ctx, { planning }) → section` in `js/ui/ownTasks.js`.
  - `renderPlanDay(root, dayKey)` exported from `today.js`.
  - In `app.js`: `routes.plan = { title: 'План на день', tab: 'week', render: today.renderPlanDay }`; `forgetReturnWeek()` is skipped for `plan` too.

The card's behaviour:
- **Title.** «Свои дела».
- **Today and past days, view mode:**
  - untimed tasks are `taskRow`s, with tick and skip;
  - timed tasks are one muted line, `В распорядке: 14:00 Банк, 18:00 …`;
  - an «Изменить» link at the head when tasks exist.
- **Edit mode** (always on the plan screen; on other days toggled by «Изменить»/«Готово», state kept in a module `Set` by dayKey):
  - each task is a row with a title input, a time input and a `×` button;
  - changes save on `change`;
  - `×` removes the task and shows the toast `Удалено: <title>` with undo (`removeOwnTask`/`restoreOwnTask`).
- **Adding.** The bottom of the card is always a form: title input with the placeholder «Новое дело», an optional time input, and a «+» button.
  - On submit, `addOwnTask(..., newOwnTaskId())`, then blur the focused field, so `createRenderer` redraws.
- **Empty state.** The hint «Дела только на этот день. Со временем — встанут в распорядок.»

The plan screen, `buildPlanScreen(data, dayKey, now, redraw)`, in this order:
1. Save-error banner.
2. `‹ Неделя` back link, with the hint «Рутина из настроек добавится сама».
3. `weekStrip`.
4. Plan mode card:
   - date label;
   - «Главное» input (`day.focus`, deleted when empty);
   - two-way segmented control «Обычный» / «Минимум».
5. `ownTasksCard(ctx, { planning: true })`.
6. `drivingCard` with the wording «+ Урок вождения».
7. `timelineCard` in read-only mode: no `taskRow`s, no workout footer, nothing folded, nothing current.
   - `dayContext` gains `planning`; `nowMinutes` is `-1` and `past` is false.

Today and past screens get `ownTasksCard(ctx, { planning: false })` right after `modeCard`. Own blocks in the timeline use the class `block--own`.

`shutdown.js` adds the link `Спланировать завтра ›` (`href: '#day/<tomorrow>'`) under the «Завтра» label and in the closed-day card.

- [ ] **Step 1: Implement** the card, the screen, the route and the links.
- [ ] **Step 2: Run** `npm test` and expect all to pass.
- [ ] **Step 3: Verify in the browser** at phone size (375×812), on `npm start` (port 8000):
  1. Open tomorrow from the strip and add «Банк 14:00» and «Купить хлеб».
  2. Go back to today, then into tomorrow again: both tasks are still there, and the timeline shows Банк at 14:00.
  3. Add a task on today and tick it; «Задач отмечено» goes up.
  4. Delete it, then press «Отменить»: the task and its tick are back.
  5. There are no console errors.
- [ ] **Step 4: Commit** with the message `feat: "Свои дела" card and the plan screen for upcoming days`.

### Task 5: «Неделя» and week strip for future days

**Files:**
- Modify: `js/ui/week.js`, `js/ui/weekStrip.js`, `css/app.css`

**Interfaces:**
- Consumes: `hasPlan`, `weekStripDays(statsDays, plannedDates)`.
- Produces: no new exports.

- `navCard`: the `›` button is always enabled; the label for offset `1` is «следующая неделя».
- A week whose start is after `todayKey` shows only `navCard` and `daysCard`.
- `daysCard(stats, days, onOpen)`: future days are links (`#day/<date>`). Their facts are:
  - `вождение HH:MM`;
  - `дел: N` (from `days[date].ownTasks`);
  - `режим «минимум»`;
  - the existing «Главное» line.
- The hint under the list becomes «Нажми на день: прошлый — исправить отметки, будущий — спланировать.»
- `weekStrip` builds `plannedDates` from `data.days` (future keys where `hasPlan`). It adds `MARKS.planned = '•'` and `STATE_TEXT.planned = 'запланировано'`; CSS colours it as the accent.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and expect all to pass.
- [ ] **Step 3: Verify in the browser**:
  1. «Неделя» → `›` shows next week with only the list.
  2. A planned day shows `дел: 2`, and tapping it opens the plan.
  3. `‹ Неделя` returns to that week.
  4. The strip marks the planned day.
  5. There are no console errors.
- [ ] **Step 4: Commit** with the message `feat: plan upcoming days from "Неделя"`.

### Task 6: Release 0.15.0

**Files:**
- Modify: `sw.js` (`VERSION`, `ASSETS` adds `./js/logic/ownTasks.js` and `./js/ui/ownTasks.js`), `package.json`, `README.md` (roadmap line «Планирование дней: свои дела на любой день»), and the spec (field name `ownTasks`).

- [ ] **Step 1: Make the changes.** Run `npm test`; all must pass, including `sw.test.js`.
- [ ] **Step 2: Commit** with the message `release: plan upcoming days with own tasks (v0.15.0)`, then push to `origin main`.
- [ ] **Step 3: Verify live**: `curl` on `sw.js` shows `0.15.0`, and both new files return 200.
