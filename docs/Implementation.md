# Implementation.md
## Step-by-Step Developer Guide

---

## Phase 1: Firebase Project Setup & Security Rules

1. Create a Firebase project in the console; enable **Firestore** (Native mode) and **Authentication** (Email/Password, optionally Anonymous for frictionless onboarding).
2. Install tooling locally:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init
   # Select: Firestore, Hosting (and Emulators for local dev)
   ```
3. Add the rules from `Schema.md §7` to `firestore.rules`; add the indexes from `Schema.md §6` to `firestore.indexes.json`.
4. Deploy rules/indexes early so local dev matches production access control:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
5. Set up the Firestore/Auth emulator suite for local development to avoid touching production data while building:
   ```bash
   firebase emulators:start --only firestore,auth,hosting
   ```

## Phase 2: Project Scaffolding & Tailwind Layout

1. Directory structure:
   ```
   /public
     index.html
     /js
       app.js  auth.js  db.js  timer.js  chartManager.js  resetEngine.js
       /views
         hub.js  categoryDetail.js  checklistDetail.js
     /css
       styles.css        # Tailwind build output (production)
   firebase.json
   firestore.rules
   firestore.indexes.json
   ```
2. Build `index.html` with the semantic skeleton from `Design.md §3` (header/nav/main/dialog shell), Tailwind CDN linked for dev, Chart.js CDN linked, `app.js` loaded as `type="module"`.
3. Wire the Tailwind config (inline `<script>` for CDN mode, or `tailwind.config.js` for CLI mode) with the pastel palette extension from `Design.md §1.1`.
4. Confirm `firebase.json` Hosting config points `public` to the `public/` directory and rewrites all routes to `index.html` (SPA fallback):
   ```json
   {
     "hosting": {
       "public": "public",
       "rewrites": [{ "source": "**", "destination": "/index.html" }]
     }
   }
   ```

## Phase 3: Firestore CRUD Operations (Categories & Checklists)

1. In `db.js`, initialize the modular SDK and export a Firestore instance:
   ```js
   import { initializeApp } from "firebase/app";
   import { getFirestore, collection, doc, addDoc,
            updateDoc, deleteDoc, onSnapshot, query,
            orderBy, where, runTransaction } from "firebase/firestore";
   ```
2. Implement category CRUD: `createCategory()`, `subscribeCategories(uid, cb)`, `updateCategory()`, `deleteCategory()` (cascade-delete its checklists + their task subcollections — do this as a batched write or a small sequential delete loop since Firestore doesn't cascade automatically).
3. Implement checklist CRUD mirroring the shape in `Schema.md §3`, including the nested `settings` object written atomically with the document (never partial-written).
4. Wire the Category Hub and Category Detail views (`views/hub.js`, `views/categoryDetail.js`) to `subscribeCategories`/`subscribeChecklists` real-time listeners, per `TechSpec.md §4`.
5. Build the Checklist Creation Modal (`Design.md §2.5`, `AppFlow.md §2`): form validation, write-on-submit, optimistic close.

## Phase 4: Timer Engine & Task Completion Logic

1. In `timer.js`, implement `startTimer(taskId)` (writes `startedAt`), `stopTimer(taskId)` (computes delta, updates `timeSpentSeconds`, clears `startedAt`), and a local tick loop for the live display (`setInterval(1000)`, cleared on stop/unmount).
2. Implement `completeTask(taskId)`: if a timer is running, call `stopTimer` first, then set `isCompleted`, stamp `completedAt`, and write a `timeLogs` entry (`db.js: logTimeEntry()`), per `AppFlow.md §4`.
3. Implement duration formatting (`mm:ss` vs `hh:mm:ss` — see `Rules.md §1` for the exact utility function contract) as a small pure function reused by both the live timer display and historical logs.
4. Handle the settings-toggle edge case: turning `timerEnabled` off while a timer is running must auto-stop and log before persisting the settings change (`AppFlow.md §6`).

## Phase 5: Chart.js Dynamic Rendering & Data Aggregation

1. In `chartManager.js`, implement `getTimeLogsForRange(checklistId, days)` in `db.js` — a single query against `timeLogs` filtered by `checklistId` and `date >= startDate` (using the composite index from `Schema.md §6`).
2. Aggregate raw `timeLogs` client-side into per-day buckets: completion counts (always) and summed `durationSeconds` per task (only if `timerEnabled`).
3. Render two Chart.js instances per `Design.md §2.4`: a completion-rate bar chart and (conditionally) a stacked time-spent bar chart, using the checklist's category accent color as the series color.
4. Ensure chart instances are destroyed (`chart.destroy()`) before re-render on range toggle or data refresh, to prevent Chart.js canvas memory leaks on a long-lived SPA session.

## Phase 6: Midnight Reset Evaluation on Client Init

1. Implement `resetEngine.js` per the transaction-guarded algorithm in `AppFlow.md §5`, using `runTransaction()` so the `lastResetAt` check-and-write is atomic against multi-tab races.
2. Hook the reset pass into `app.js` on: (a) initial load after auth resolves, and (b) the `visibilitychange` event when the tab regains focus (catches the case where a tab was left open across midnight).
3. Write a small unit test (or manual test harness) that mocks `Date.now()` across a midnight boundary to verify idempotency — running the reset twice in the same day must not double-clear already-fresh tasks.

## Phase 7: Deployment to Firebase Hosting

1. Build production assets (Tailwind CLI purge/minify if using CLI mode; otherwise confirm CDN links are pinned to specific versions, not `@latest`).
2. Final rules/index deploy check:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
3. Deploy hosting:
   ```bash
   firebase deploy --only hosting
   ```
4. Full deploy (rules + hosting together) for release cuts:
   ```bash
   firebase deploy
   ```
5. Post-deploy smoke test: sign in, create a category → checklist → task, start/stop a timer, verify a chart renders, and confirm the reset engine doesn't fire spuriously on a fresh checklist.
