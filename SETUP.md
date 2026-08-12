# Better Together — Shared Sync Setup

This version keeps the website on the same URL you already use, but adds a Google Sheets + Apps Script shared backend. Keeping the same website URL is important because your current phone data lives in that site's browser storage.

## Do this in this order

### 1. Update the Better Together website files
Replace the old site files with the files in the root of this package (`index.html`, `styles.css`, `app.js`, and the `assets` folder). If you use GitHub Pages, update the same repository/site rather than creating a brand-new URL.

Do **not** clear Safari/site data.

### 2. Create the shared backend
1. Go to Google Apps Script and create a new standalone project named **Better Together Sync**.
2. Replace the default `Code.gs` with the included `apps-script/Code.gs`.
3. Add a new HTML file named **Bridge** and paste in `apps-script/Bridge.html`.
4. Optional: in Project Settings, enable viewing `appsscript.json` and replace it with the included manifest.
5. Select the function `setupBetterTogether` and click **Run**.
6. Approve Google's permission prompt.

That function creates a Google Sheet called **Better Together Data**. Open it and look at the **Settings** tab. Copy the shared access code.

### 3. Deploy the backend
1. In Apps Script choose **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Deploy and copy the Web App URL ending in `/exec`.

### 4. Connect Rose's phone FIRST
Open the updated Better Together app on Rose's phone. Tap **Local only** in the top-right.

Paste:
- the Apps Script `/exec` URL
- the shared access code from the Settings sheet

Tap **Connect & sync** and wait until the top-right says **Shared ✓**.

The first connected phone becomes the starting shared copy, so doing Rose's phone first gives the app the best chance of preserving the calendar, check-ins, goals, moods, and to-dos already saved there.

### 5. Connect Adrian's phone
Open Better Together on Adrian's phone and connect using the exact same backend URL and access code. If Adrian already used her local copy, unique to-dos, check-ins, events, and custom goals from her phone are merged into the shared copy on that device's first connection.

After that, both phones read and write the same shared data. The app also refreshes while it is open and whenever you return to it.

## Repeating calendar items
When adding a calendar item, use **Repeats**. Options included are:
- Does not repeat
- Every day
- Every weekday (Mon–Fri)
- Every week
- Custom days each week

Example: for work every weekday, set the date you want the schedule to begin, choose **9:00 AM–5:00 PM**, and set **Repeats → Every weekday (Mon–Fri)**. You can optionally set a repeat-until date.

When editing a repeating event, you can apply the edit to **this occurrence only** or **the entire repeating series**. Deleting also respects that choice.

## Sync behavior
- Changes save to the phone immediately.
- When connected, changes are queued and sent to the shared backend.
- If the phone temporarily loses internet, the app keeps the changes locally and syncs them when it reconnects.
- The top-right badge tells you whether you are shared, syncing, waiting, or local-only.

## Changing the access code later
In Apps Script, run:

`setAccessCode('NEW-CODE-HERE')`

Then reconnect both phones with the new code.
