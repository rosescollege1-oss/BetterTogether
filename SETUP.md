# Better Together — Same GitHub Site, Shared Data

This version keeps the Better Together website you already have on GitHub Pages.

**The design is not being rebuilt.** `index.html`, `styles.css`, and the `assets` folder are the same as the v3.1 site. The GitHub change is the replacement `app.js`, which swaps the unreliable iframe bridge for a direct JSONP connection to Apps Script.

The shared backend is a separate Google Apps Script project containing `apps-script/Code.gs`.

## 1. Update the existing GitHub repo

In the same Better Together repository you already use:

1. Replace **only `app.js`** with the `app.js` in this package.
2. Leave `index.html`, `styles.css`, and `assets/` where they already are.
3. Commit/push the change and let GitHub Pages redeploy.

The URL stays exactly the same.

This build intentionally starts the shared connection fresh. It does **not** import the old browser-only data or the old failed sync queue.

## 2. Create a fresh Apps Script backend

1. Go to Google Apps Script and create a **new standalone project** named something like `Better Together Shared`.
2. Replace the default `Code.gs` with `apps-script/Code.gs` from this package.
3. Save.
4. Select the function **`setupBetterTogether`** and click **Run**.
5. Approve Google's permission request.

That creates a Google Sheet named **Better Together Data**.

Open the sheet and go to the **Settings** tab. It contains the shared access code.

## 3. Deploy Apps Script

In Apps Script:

1. **Deploy → New deployment**
2. Choose **Web app**
3. **Execute as:** Me
4. **Who has access:** Anyone
5. Deploy
6. Copy the URL ending in `/exec`

Opening that URL directly should show:

**Better Together sync is running 🍓**

## 4. Connect Rose's copy

After the GitHub Pages update is live:

1. Open your existing Better Together site/app.
2. Tap the sync pill in the upper-right. It should say **Local only** on the first load of this version.
3. Paste the new Apps Script `/exec` URL.
4. Enter the access code from the Settings sheet.
5. Tap **Connect & sync**.
6. Wait for the pill to say **Shared ✓**.

When it connects, the new shared copy replaces the old browser-only data on the screen. Rose's default goals are already in the fresh shared copy; the rest can be re-entered.

## 5. Connect Adrian

On Adrian's phone:

1. Open the **same GitHub Pages URL**.
2. Tap **Local only**.
3. Enter the **same `/exec` URL** and **same access code**.
4. Tap **Connect & sync**.

Both phones now read and write the same shared state.

The app checks for changes about every 15 seconds while open and also refreshes when you return to it.

## 6. Quick two-phone test

1. On Rose's phone, add a calendar event called `SYNC TEST` for tomorrow.
2. Wait a few seconds or bring Adrian's app back into focus.
3. Adrian should see `SYNC TEST`.
4. Adrian deletes it.
5. Rose should see it disappear after the next refresh.

If that works, goals, check-ins, moods, to-dos, and calendar events are all using the shared copy.

## Repeating calendar items

The existing calendar UI is unchanged and still supports:

- Does not repeat
- Every day
- **Every weekday (Mon–Fri)**
- Every week
- Custom days each week
- Optional repeat-until date
- Edit/delete one occurrence or the whole series

Example:

**Work → Rose → 9:00 AM–5:00 PM → Every weekday (Mon–Fri)**

The Hangout Finder includes repeating events when deciding when you are both free.

## Important difference from the older sync build

There is no `Bridge.html` and no hidden iframe anymore.

The GitHub front end calls Apps Script through a small JSONP API served by `doGet`. The backend uses a lock and applies each individual change to the shared state, so Rose and Adrian can make separate updates without replacing the entire database with whichever phone saved last.

## If the installed phone app appears to be using old JavaScript

You should not need to change the site URL or rebuild the home-screen shortcut. Fully close Better Together and reopen it after GitHub Pages deploys. If needed, open the same site once in Safari/Chrome and refresh it, then reopen the home-screen app.

## Intentional reset later

If you ever want to wipe the shared tracker and start fresh again, run this manually in Apps Script:

`resetBetterTogetherData()`

That resets the shared state to Rose's original goals and an empty Adrian/calendar/to-do history.
