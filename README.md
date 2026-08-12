# Better Together — Shared v3 🍓

This is the shared-data version of Better Together.

## New in this build
- Shared Google Sheets + Apps Script sync for Rose and Adrian
- Automatic first-connect migration from the existing browser copy
- Offline-safe pending sync queue
- Live refresh while the app is open / when returning to it
- Visible sync status in the top-right
- Repeating calendar events
- Every day, weekdays, weekly, and custom weekday patterns
- Optional repeat-until date
- Edit/delete one occurrence or the entire recurring series
- Repeating events are included in the hangout finder

## Files
- `index.html`, `styles.css`, `app.js` — the website
- `assets/` — the existing strawberry theme assets
- `apps-script/Code.gs` — shared backend
- `apps-script/Bridge.html` — secure browser-to-Apps-Script bridge
- `apps-script/appsscript.json` — optional manifest
- `SETUP.md` — exact deployment steps

Start with `SETUP.md`.
