# TV display boards

Show live work order status on a TV or wall screen, like a restaurant "order ready" board
(migration `0092_display_boards.sql`, screen `src/pages/DisplayBoard.tsx`).

## Setting one up

1. **Settings → TV displays** (org admins and managers), or **Work orders → TV display**.
2. **New display**: name, site (or all sites), which columns (New, In progress, On hold, Done),
   how long finished work stays in Done (0–24 hours), which details each job shows (priority,
   due date & overdue, location, assignee's first name, asset, when opened), priorities, layout
   (status columns or list), colours (dark/light) and screen language (English/Vietnamese).
3. Open the link (or scan the QR code) in the TV's browser — a smart TV, Fire TV, Chromecast or
   Android TV box — and press **Full screen**. No sign-in.

## What the screen does

- Refreshes every 20 seconds; a job that just arrived or changed status pulses. If the network
  drops it keeps the last data and says it's reconnecting.
- Header: organisation, site, number of open and overdue jobs, clock and date.
- Most urgent first (critical → low, then due date). Finished jobs show newest first.
- Columns that don't fit page through every 12 seconds (dots show the page); cards are measured,
  so none is cut off. Text scales with the screen size; the cursor hides; the screen is kept
  awake where the browser supports it.
- Settings shows whether a screen is showing each board ("On screen now" / last seen).

## Privacy and control

- The link is a 32-character random key. Anyone with it can view the board, so share it only
  with the screen.
- The screen only receives what it shows: title, short reference, status, priority, dates,
  location, asset name and the assignee's first name. Never instructions, requester details,
  costs, emails or internal ids.
- **Switch off** shows "switched off" on the screen; **New link** replaces the link (the old one
  stops working at once); **Delete** removes it. Boards of a suspended organisation show nothing.
- Covered by `supabase/security-tests/display_boards.sql`.
