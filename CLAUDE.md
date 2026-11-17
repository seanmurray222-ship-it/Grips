# Open Grips Trainer

A personal finger-strength training app for climbers, used with two 3D-printed
grippers from the Open Grips project:

- **Prometheus** (Micro-style, trains FDP, lighter loads, roughly 10–70 lbs)
- **Sisyphus** (Crusher-style, trains FDS, heavier loads, roughly 2–3× Prometheus)

Every gripper session is an isometric hold to failure (RPE 10). The app logs
holds, fits a force curve per gripper per hand, prescribes the next session,
times holds and rests, and runs a weekly training plan.

`reference/open-grips-trainer.html` is a working single-file prototype of the
whole app. Treat it as the functional spec: match its behavior and math, then
improve the structure. It was built for the claude.ai artifact runtime, so replace
its `window.claude` storage calls with IndexedDB.

`data/my-data-export.json` is the user's real data from the prototype (logged
sessions, settings including their rotation and starter weights, and plan
progress). Import must load it exactly.

## Target device

The app is for one person on a **Samsung Galaxy S24 Ultra** (Android, Chrome as
the main browser; Samsung Internet should also work).

- Design for a portrait viewport of about **384 × 830 CSS px** (the S24 Ultra at
  default display size). Test at 384 px and 412 px wide. Nothing should scroll
  sideways.
- Android uses edge-to-edge gesture navigation: respect `env(safe-area-inset-*)`,
  keep the bottom tab bar clear of the gesture bar, and set `theme-color` for light
  and dark mode.
- Installed from Chrome's menu (**Install app** / **Add to home screen**). The
  manifest needs `display: "standalone"`, `orientation: "portrait"`, a start URL and
  scope matching the Pages path, and 192 px, 512 px and maskable icons so the
  Samsung launcher shows a clean adaptive icon.
- Use the hardware where Chrome on Android supports it: Vibration API for the
  target-reached and rest-over buzz, Screen Wake Lock during the timer (re-request
  it on `visibilitychange`), Web Audio beeps started from a tap.
- Call `navigator.storage.persist()` on first run so Android doesn't evict the
  IndexedDB data under storage pressure, and show a gentle export reminder in
  Settings if the last export is older than 30 days.
- Big touch targets (at least 48 px) and high contrast: it's used mid-workout
  with chalky hands, often in bright gyms.

## Goal for this repo

Build an installable **Progressive Web App**, hosted free on **GitHub Pages**:

- Works offline (service worker caches the app shell).
- Installable to the phone home screen (web app manifest, icons, standalone display).
- All data stored on the device in **IndexedDB**. No account, no server.
- **Export / Import** of all data as one JSON file (Settings tab), so the user can
  back up and move between devices. Import must accept the export format of
  `{ version, sessions, settings, checks }`.

Stack: Vite + vanilla TypeScript (or Preact if components help). Keep dependencies
minimal. No backend. Deploy with a GitHub Actions workflow to GitHub Pages
(set Vite `base` to the repo name).

## Data model

```ts
type Gripper = "prometheus" | "sisyphus";
type Hand = "LH" | "RH";

interface Session {
  id: string; created: number;      // created = ms timestamp, tiebreak for same-day order
  date: string;                     // "YYYY-MM-DD", local date
  gripper: Gripper;                 // missing on old records => "prometheus"
  zone: string;                     // one of the zone names below
  hand: Hand;
  weight: number;                   // lbs, as measured at the fingers
  reps: number[];                   // hold times in whole seconds, rep 1 first
}

interface Zone { name: string; bottom: number; top: number; target: number; reps: number; }

interface Settings {
  zones: Zone[];
  rest: number;                     // seconds between reps, default 20
  oneRMTime: number;                // seconds, default 20
  steps: Record<Gripper, number>;   // weight increment per gripper, default 1
  starter: Record<Gripper, number[]>; // starter weight per zone, same order as zones
  starterCount: number;             // use starter weights for the first N sessions per gripper+hand, default 5
  seq: Activity[][];                // the rotation: Day 1, Day 2, ... in order; [] = planned rest day
  program: {
    start: string; end: string;     // "" when unset; end is a target only
    block: number;                  // training weeks per block, default 4
    rest: number;                   // rest weeks after each block, default 1
  };
}

type Activity = "grip" | "board" | "open" | "outdoor" | "strA" | "strB" | "cardio" | "mobility";
interface Track {
  days: { n: number; date: string; idx: number; items: Activity[] }[]; // finished training days
  carry: { a: Activity; from: number; to: number }[];                  // pushed sessions, by training-day number
  done: Record<string /* "n" + day number */, Partial<Record<Activity, true>>>; // manual ticks
}
```

Default zones (name, bottom, top, target, max reps):
Power 20/47/40/3, Power/Strength 48/81/72/3, Strength 82/128/120/3,
Strength/Endurance 129/179/160/2, Endurance 180/300/240/1.

Default rotation: Day 1 grip+strA, Day 2 board, Day 3 grip+cardio, Day 4 board,
Day 5 grip+strB, Day 6 board, Day 7 grip+cardio.

## Core logic (must match the prototype)

- **Force curve**, per gripper and hand: least-squares fit of
  `ln(rep1 time) = ln(a) + b·ln(weight)` over all sessions with weight > 0 and rep 1 > 0.
  Needs at least 2 points and a negative slope, otherwise "no curve yet".
  - predicted time = `a · w^b`; weight for a target time = `(t / a)^(1/b)`
  - round weights to that gripper's step (never below one step).
  - Estimated 1RM = weight for `oneRMTime`.
- **Suggested weight**: while a gripper+hand has fewer than `starterCount` logged sessions,
  use the starter weight for the next zone (defaults: Prometheus 32/22/15/13/10,
  Sisyphus 90/62.5/45/35/27.5 lbs, Power to Endurance). After that, use the curve.
  If there's no curve yet, fall back to the starter weight.
- **Next zone**, per gripper AND hand: the zone with the fewest logged sessions on that
  gripper for that hand; ties go to the earlier zone in the list. Logging one hand
  must never change the other hand's next zone.
- **Keeping hands in step**: after saving a session, if the other hand now has fewer
  sessions on that gripper, switch the selected hand to it. When the selected hand is
  ahead, Today shows a note naming the zone the other hand still owes, with a
  "Switch to LH/RH" button; starting the ahead hand is still allowed.
- **Recent trend**: mean of (rep1 / predicted − 1) over the last 5 sessions for
  that gripper and hand, shown as a percentage above or below the curve.
- **Rolling rotation**: the plan is not tied to weekdays. Training days are numbered
  `n` = 0, 1, 2, ... The active day is `n = days.length` (or today's entry if already
  finished today). Its rotation index is `(last finished idx + 1) % seq.length`.
  The rotation only advances when the user taps "Finish Day X", so missed calendar
  days never pile up and a week can stretch past 7 calendar days.
  Finishing stores `{n, date, idx, items}`; history uses the stored items.
  "Undo" removes today's entry if it is the latest.
- **Editing the rotation**: reorder days (up/down), add or remove days, toggle
  activities per day. Because the pointer is stored as an index, editing never
  loses your place.
- **Program**: a "week" is one pass through the rotation, counted in training days
  finished since `start`. Within each cycle of `block + rest` weeks, weeks after
  `block` are rest weeks: only `grip` stays on. The grippers never deload.
- **Push (postpone)** moves one activity from training day n to the next training
  day that doesn't already have it. Pushing an already-pushed item updates its `to`.
  "Move back" deletes the push.
- **Grip tick** is automatic: done when at least one session was logged on each
  gripper between the previous finished day's date (exclusive) and this day's date.
  Other activities are ticked by hand, keyed by training-day number.
- **Recent adherence**: sessions done ÷ planned across days finished in the last 7 calendar days.

## Screens

Bottom tabs: Today, Log, Plan, Curve, Settings.

- **Today**: today's training day checklist (push / move back, Finish Day X, Undo), gripper switch,
  next-session card (zone, suggested weight, target time, max reps, start button),
  one-line preview of the other gripper, zone balance ladder.
- **Hold timer** (full screen): weight with ± step buttons, ring that fills to the
  target time, start / "weight dropped" button, automatic rest countdown, rep chips,
  save or discard. Vibrate and beep on target and at end of rest. Keep the screen
  awake with the Wake Lock API.
- **Log**: filter by gripper, list newest first, delete with confirm, add a past session.
- **Plan**: program card (start, target end, block, rest weeks), "Up next" list of
  coming training days (tap a chip to push or move back), "Recent" finished days,
  rotation editor (reorder, add, remove, toggle), session guide.
- **Curve**: gripper and hand switch, SVG chart of rep-1 points over shaded zone bands
  with the fitted curve, table of weights per zone and estimated 1RM.
- **Settings**: zones, rest, 1RM hold time, weight step per gripper, export, import.

## Design

Keep the prototype's visual identity:
- Lichen-grey stone background, Barlow Condensed for numbers and headings, Barlow for body.
- Zone colors are the only bright colors: Power red, Power/Strength amber,
  Strength blue, Strength/Endurance green, Endurance ochre.
- Gripper identity: Prometheus pine green, Sisyphus rust. The accent color follows
  the selected gripper.
- Light and dark mode via `prefers-color-scheme`. Respect safe-area insets.
- Large touch targets; the timer must be usable with chalky hands.

## Done means

- `npm run build` succeeds and the GitHub Pages workflow deploys it.
- Chrome on Android offers to install it, it opens standalone from the home
  screen, and it works in airplane mode after the first load.
- Importing `data/my-data-export.json` restores every session, the rotation,
  starter weights and plan progress, and Today shows the same next sessions as the
  prototype did with that data.
- Lighthouse PWA checks pass: installable, works offline after first load.
- Given the same logged sessions, the curve suggests the same weights as the prototype.
- Unit tests cover the curve fit, next zone, rotation advance, reorder, program weeks,
  and push logic.

## Gotchas

- Use in-app confirmation sheets, not `window.confirm` / `alert`. Embedded or sandboxed contexts can block native dialogs, which silently answer "no".
