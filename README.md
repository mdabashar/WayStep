# Waystep

A responsive travel checklist app with no runtime dependencies. Trips are saved in localStorage in the current browser; there is no cloud sync.

## Run locally

From this directory, run `python -m http.server 5173 --bind 127.0.0.1 --directory dist`, then visit http://127.0.0.1:5173. Use an HTTP server rather than opening index.html directly so offline support works. Keep the server running for online access. After the first successful visit, the service worker caches the app for offline use. Private hosting authentication may require connectivity when entering the hosted site.

## Features

- Guided planning: Create trip & add steps opens the first step immediately. Save a step, then choose Add another step or Finish planning.
- Clear Open trip buttons, a top-of-page Add travel step action, and a first-step prompt for empty trips.
- A short step form for title, transport and destination, with optional More details for starting point, services, times, bookings and notes.
- Multiple coloured trips, dates and notes; search, copy, archive and restore.
- Ordered travel steps with transport, service numbers, addresses, local departure/arrival times, booking references and notes.
- Check off steps, hide completed items, next-step highlighting and progress.
- Reorder with arrows or drag and drop; open destinations in Google Maps.
- JSON export/import backups (import adds copies without replacing existing trips).
- Printable full checklist, including hidden completed steps and booking notes.
- Web manifest and service worker for supported-browser installation and offline caching.
- An optional Brisbane-to-Wollongong example with placeholder services; no live route or timetable data.

Export backups regularly: clearing browser data removes locally saved trips. Different browsers/devices and local/hosted origins have separate storage. Use export/import to transfer plans. Imports are validated before any data is saved.

Run checks with `node --check dist/app.js`, `node --check dist/sw.js` and `node checks.cjs`.
