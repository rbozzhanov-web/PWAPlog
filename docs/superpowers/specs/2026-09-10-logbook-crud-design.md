# Pilot Logbook CRUD and navigation design

## Goal

Turn the PWA foundation into a useful local logbook: pilots can view, add, edit, and delete manual flight entries while retaining the existing month grouping, totals, and December-targeted year navigation behavior.

## Routes and data flow

- `/logbook` reads entries through the typed flight-entry repository and renders month groups newest first.
- `/logbook/new` renders a manual-entry form and creates a validated entry.
- `/logbook/:id` renders the same form populated from the repository and supports update or explicit deletion.

The route layer owns loading/error/empty states. Feature components receive domain entries and callbacks, rather than using Dexie tables directly. Every mutation refreshes the route data from the repository so totals and groups reflect the committed store state.

## Navigation

All data is shown by default. There is no All-year control. Year chips are the unique descending entry years; selecting one scrolls to its December anchor, and scroll position updates the active chip. Months with no entry are not fabricated: if a selected year lacks December, the app scrolls to that year's newest available month while retaining the selected chip.

## Entry form

The manual form uses the existing core entry contract and validates required date, departure, arrival, and non-negative minute/count fields before persistence. It starts new entries with stable UUIDs, ISO timestamps, `source: 'manual'`, and zero-valued counters. Time entries are optional; total time is entered in minutes for this slice. Delete requires a distinct confirmation action and removes only the selected entry.

## Visual design

Use the approved aviation-inspired system: off-white canvas; white, rounded cards; soft-gray dividers; deep-navy headings/numbers; blue primary actions and active year chips; muted gold only for supporting emphasis. Month cards emphasize total flight time and entry count. Individual entry rows prioritize route, date, aircraft, and block time; forms use a focused single-column phone layout that expands cleanly on desktop.

## Verification

Add Vitest coverage for repository CRUD, required validation, grouping/totals after a mutation, December-target selection/fallback, and delete confirmation behavior. Preserve the existing core grouping/navigation tests. Browser UI tests must use fake IndexedDB and assert visible behavior, not Dexie mocks.

## Non-goals

- PDF import/review and document extraction.
- Salary UI or schedule management.
- Browser logbook-PDF export.
- Cloud sync, authentication, or automatic backup.
