# Waystep

A travel checklist with guest storage, optional Google sign-in and cross-device sync.

## Open the app

- [Waystep](https://mdabashar.github.io/WayStep/) has the travel checklist and AI JSON import.

GitHub Pages publishes the `dist` folder using `.github/workflows/pages.yml`. Each push to `main` runs the app checks before deployment. You can also run the workflow manually from the repository's Actions tab. In Settings → Pages, the publishing source is GitHub Actions.

To move plans from another hosted copy, export a JSON backup there, then import it here. Browser storage is separate for each host. Guest trips stay in the browser. After signing in, use the sync menu to copy selected guest trips into your account. Synced trips are visible on devices signed into the same Google account.

## Run locally

With Node.js 24, run `npm ci` and `npm run build`. Then run `python -m http.server 5173 --bind 127.0.0.1 --directory dist`, then visit http://127.0.0.1:5173. Use an HTTP server rather than opening index.html directly so offline support works. Keep the server running for online access. After the first successful visit, the service worker caches the app for offline use. Private hosting authentication may require connectivity when entering the hosted site.

## Features

- Blue plane branding and a responsive, streamlined interface.
- Atkinson Hyperlegible Next is self-hosted and cached for offline use, with larger journey text, explicit From/To labels, deep navy text, deep blue actions and an amber Up next marker. Main text, secondary text, button text and completed titles use colour pairs above 7:1 contrast. This is a targeted readability improvement, not a claim of complete WCAG conformance.
- Plan with AI: describe the journey, copy a planning prompt into ChatGPT or another LLM, paste or load the returned JSON, review it, then add an editable trip or append steps to the current trip. No API key, automatic AI requests or backend are required.
- Guided planning: Create trip & add steps opens the first step immediately. Save a step, then choose Add another step or Finish planning.
- Clear Open trip buttons, a top-of-page Add travel step action, and a first-step prompt for empty trips.
- A short step form for title, transport and destination, with optional More details for starting point, services, times, bookings and notes.
- Multiple coloured trips, dates and notes; search, copy, archive and restore.
- Ordered travel steps with transport, service numbers, addresses, local departure/arrival times, booking references and notes.
- Check off steps, hide completed items, next-step highlighting and progress.
- Completed steps automatically collapse to a compact checkbox and title. Untick to restore the full step; printed checklists still include all details.
- Reorder with arrows or drag and drop. **View route** opens Google Maps with the step's starting point, destination and walking, cycling, driving or public transport mode already selected. Bus, train and ferry steps request public transport options; confirm the actual service and travel date in Maps. Flights show the arrival airport, and steps without a starting point show the destination location.
- JSON export/import backups (import adds copies without replacing existing trips).
- Printable full checklist, including hidden completed steps and booking notes.
- Web manifest and service worker for supported-browser installation and offline caching.
- A 32-step historical Brisbane–Novotel Wollongong Northbeach–Brisbane example appears automatically for a new library. It includes flights, train changes, hotel tasks and retreat activities. Personal details and real booking references are replaced with demo placeholders. Users can edit or delete it; deleting it does not cause automatic reappearance. Existing libraries can load it using **Load a detailed example trip**.
- Existing steps can also be deleted from their Edit dialog, with confirmation.

Export backups regularly: clearing browser data removes locally saved trips. Guest libraries are separate across devices and site origins. Use export/import to transfer guest trips, or copy them into your synced library. Imports are validated before any data is saved.

Run the checklist and MCP checks with `npm test`.

## Enable Google sign-in and Firestore

1. In a Firebase project for Waystep, register a web app, enable Google under Authentication → Sign-in method, and add the website hostname (for example, `mdabashar.github.io`) under Authentication → Authorized domains.
2. Create a Cloud Firestore database in production mode. From this repository deploy the owner-only rules and index settings with `firebase deploy --only firestore --project YOUR_PROJECT_ID`. Use a dedicated Firebase project so these rules only apply to Waystep.
3. In GitHub, open Settings → Secrets and variables → Actions → Variables. Set `WAYSTEP_FIREBASE_CONFIG` to the web config JSON from Firebase Project settings. It must include `apiKey`, `authDomain`, `projectId`, and `appId`. Use the public web configuration. Keep service credentials out of the build.
4. Run the GitHub Pages workflow again. Sign into Waystep and test that the same trip and checked steps appear on two devices.

Guest storage works without a Firebase config. On a personal device, select **Remember me and keep synced trips offline** before sign-in to cache previously loaded trips and queue checklist changes until reconnecting. Firestore syncs changes to different step fields independently. If two devices change the same field or reorder the same trip, the last write wins. For local builds you can pass the same public config as a `WAYSTEP_FIREBASE_CONFIG` environment variable to `npm run build`.

## Host the MCP server

The MCP server is a small Node.js service. Run `npm start` locally or deploy the included Dockerfile to an HTTPS container host. It serves Streamable HTTP at `/mcp` and a health check at `/health`. Set `WAYSTEP_AI_URL` to your Waystep page if you use a different site. The default points to the published Waystep site. Add the public HTTPS MCP endpoint as the GitHub Actions variable `WAYSTEP_MCP_URL` and rerun the Pages workflow.

To host on Cloudflare Workers, run `npm ci`, `npx wrangler login`, then `npx wrangler deploy`. The Worker uses the published Waystep site for review links. Run `node mcp/checks.mjs https://YOUR-WORKER.workers.dev/mcp` to verify the deployed server before publishing its URL in Waystep.

In an AI client that supports custom remote MCP servers and a public Streamable HTTP endpoint, add that endpoint and ask the AI to call `send_trip_draft` with the finished trip. Open the review link, check the details, and choose **Add** to save it in the active library. The MCP endpoint needs no Firebase credentials or model API key. It validates the draft and returns it in a compressed URL fragment. Anyone with the link can read its contents, so keep it private. For larger drafts or AI clients that cannot open the link, use JSON import.

## AI planning format

Choose **Use my existing AI project** in the AI planner to generate a prompt for an AI project containing your travel files and previous planning. Route and date fields can be left blank for the AI to resolve from its available project materials. Optional project guidance can identify documents to prioritise or the scope of the trip. Paste the prompt into a chat inside that project, then bring the final JSON back to Waystep as usual.

The project prompt asks the AI to reconcile bookings, identify missing or conflicting information, preserve confirmed arrangements, add transfers and arrival/check-in tasks, and cite documents in step notes. It asks for clarification when critical details are missing, rather than fabricating them. Waystep does not connect to project storage or automatically upload documents.

The in-app wizard generates a complete prompt with the supported fields. The AI should return a single trip object, or a `{ "trips": [...] }` wrapper, containing a title and ordered steps. Each step requires a title. Optional fields are `mode`, `from`, `to`, `service`, `departure`, `arrival`, `booking`, and `notes`. Supported modes: `walk`, `bicycle`, `car`, `taxi`, `bus`, `train`, `ferry`, `flight`, `other`. Use `YYYY-MM-DD` for trip `start`/`end` dates and `YYYY-MM-DDTHH:mm` for local departure/arrival times. Leave unknown details empty. JSON code fences are accepted.

Plans are validated and previewed before saving, with a maximum of 20 trips and 200 steps per trip. Imported AI steps always start unchecked. Existing trips are never replaced by this flow. AI results are drafts; check actual services, times and addresses with the relevant operator before travelling.

## Readability references and font licence

- [Braille Institute: Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) — letterform distinction and readable typography.
- [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html) — enhanced text contrast target of 7:1.
- [Home Office typography](https://design.homeoffice.gov.uk/design-system/styles/typography) — readable type scales.

Font sourced from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegiblenext). Distributed unmodified under the SIL Open Font License; see `dist/fonts/OFL.txt`. The app makes no third-party font requests.
