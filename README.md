# Waystep

A responsive travel checklist app with no runtime dependencies. Trips are saved in localStorage in the current browser; there is no cloud sync.

## Open the app

[Launch Waystep](https://mdabashar.github.io/WayStep/). No ChatGPT account is required.

GitHub Pages publishes the `dist` folder using `.github/workflows/pages.yml`. Each push to `main` runs the app checks before deployment. You can also run the workflow manually from the repository's Actions tab. In Settings → Pages, the publishing source is GitHub Actions.

To move plans from another hosted copy, export a JSON backup there, then import it here. Browser storage is separate for each host. The public website contains only the app; trip details remain in each visitor's browser.

## Run locally

From this directory, run `python -m http.server 5173 --bind 127.0.0.1 --directory dist`, then visit http://127.0.0.1:5173. Use an HTTP server rather than opening index.html directly so offline support works. Keep the server running for online access. After the first successful visit, the service worker caches the app for offline use. Private hosting authentication may require connectivity when entering the hosted site.

## Features

- Blue plane branding and a responsive, streamlined interface.
- Plan with AI: describe the journey, copy a planning prompt into ChatGPT or another LLM, paste or load the returned JSON, review it, then add an editable trip or append steps to the current trip. No API key, automatic AI requests or backend are required.
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

Run checks with `node --check dist/app.js`, `node --check dist/ai.js`, `node --check dist/sw.js` and `node checks.cjs`.

## AI planning format

The in-app wizard generates a complete prompt with the supported fields. The AI should return a single trip object, or a `{ "trips": [...] }` wrapper, containing a title and ordered steps. Each step requires a title. Optional fields are `mode`, `from`, `to`, `service`, `departure`, `arrival`, `booking`, and `notes`. Supported modes: `walk`, `bicycle`, `car`, `taxi`, `bus`, `train`, `ferry`, `flight`, `other`. Use `YYYY-MM-DD` for trip `start`/`end` dates and `YYYY-MM-DDTHH:mm` for local departure/arrival times. Leave unknown details empty. JSON code fences are accepted.

Plans are validated and previewed before saving, with a maximum of 20 trips and 200 steps per trip. Imported AI steps always start unchecked. Existing trips are never replaced by this flow. AI results are drafts; check actual services, times and addresses with the relevant operator before travelling.
