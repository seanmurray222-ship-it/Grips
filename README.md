# Open Grips Trainer

Finger-strength training app for the Prometheus and Sisyphus grippers.
An offline-first PWA for a Samsung Galaxy S24 Ultra, hosted on GitHub Pages.
All data stays on the phone (IndexedDB). No account, no server.

Live: https://seanmurray222-ship-it.github.io/Grips/

## Install on the phone

1. Open the live URL in Chrome on the phone.
2. Tap ⋮ then **Install app** (or **Add to home screen**).
3. Open the app, go to **Settings**, tap **Import**, and choose
   `data/my-data-export.json` (send it to the phone first, for example by email
   or Google Drive).
4. Back up now and then with **Settings → Export**. The app reminds you after 30 days.

## Develop

```bash
npm install
npm run dev       # local dev server
npm test          # unit tests (curve fit, next zone, rotation, program weeks, push)
npm run build     # type-check and production build into dist/
npm run preview   # serve dist/ at http://localhost:4173/Grips/
npm run icons     # regenerate public/icons from scripts/make-icons.mjs
```

Pushing to `main` runs the tests, builds, and deploys to GitHub Pages
(`.github/workflows/deploy.yml`). The Vite `base` comes from the repo name.

## Layout

- `src/logic/` – pure training logic (force curve, zones, rolling rotation, import/export), unit-tested in `tests/`
- `src/ui/` – screens (Today, Log, Plan, Curve, Settings), hold timer, confirmation sheet
- `src/store.ts`, `src/db.ts` – app state and IndexedDB persistence
- `src/sw-template.js` – service worker; `vite.config.ts` fills in the precache list at build time
- `reference/open-grips-trainer.html` – the original single-file prototype (the functional spec)
