# Better Together

A simple shared goal, to-do, mood, and calendar tracker for Rose + Adrian.

## Included in this version
- Rose and Adrian weekly percentages
- Previous-week browsing with a one-click return to this week
- Rose's starting goals preloaded
- "Up by 8" tracked with a simple strawberry checkbox
- Goal types:
  - Daily checkbox
  - Certain number of days per week
  - Maximum weekly amount
  - Minimum weekly amount
  - Daily percentage
- Pause/resume goals without deleting them
- Drag-and-drop goal reordering, plus arrow controls on smaller screens
- Daily to-do lists on Home and on each person's page
- Automatic daily to-do completion percentage
- Cumulative five-strawberry mood selector with hover preview
- Shared calendar with Rose / Adrian / Both colors
- Click calendar events to edit them
- Three-dot event menus with Edit and Delete
- Free-day strawberry markers on calendar dates with a 90+ minute overlap
- Smarter hangout suggestions such as "free after 6:30 PM"
- Stronger visual markers for today
- Fixed strawberry alignment in weekly goal rows
- Responsive phone layout

## Run it
Open `index.html` in a browser. For the cleanest experience, use a local server such as VS Code Live Server or run:

`python -m http.server 8000`

Then open `http://localhost:8000`.

## Saving and syncing
This version saves data in the browser with `localStorage`. It keeps the same storage key as the earlier version so existing browser data can carry forward, including converting the old wake-up time entry into a simple before-8 checkbox when possible.

To use the same live data from two different phones/computers, the next step is connecting a shared backend such as Google Sheets + Apps Script, Supabase, or Firebase.
