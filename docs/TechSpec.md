# TechSpec.md
## Technical Architecture & Implementation Specification

---

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        Browser (Client)                  │
│                                                            │
│   index.html  ──►  app.js (SPA router + orchestration)    │
│        │                  │                                │
│        │        ┌─────────┼─────────┬───────────┐          │
│        │        ▼         ▼         ▼           ▼          │
│        │     auth.js   db.js   timer.js   resetEngine.js   │
│        │        │         │         │           │          │
│        │        └────┬────┴────┬────┴───────────┘          │
│        │             ▼         ▼                            │
│        │      chartManager.js  (reads aggregated data)      │
│        │             │                                       │
│        │   Tailwind CSS (CDN) · Chart.js (CDN)               │
└────────┼──────────────┼──────────────────────────────────────┘
         │              │
         ▼              ▼
┌──────────────────────────────────────────┐
│           Firebase JS SDK (v10+, modular)  │
└───────────────┬───────────────┬────────────┘
                │               │
                ▼               ▼
       ┌────────────────┐  ┌───────────────────┐
       │ Firebase Auth   │  │  Cloud Firestore   │
       └────────────────┘  └───────────────────┘
                │
                ▼
       ┌────────────────────┐
       │  Firebase Hosting   │  (serves the static SPA)
       └────────────────────┘
```

Single deployable unit: static assets (HTML/JS/CSS) served from Firebase Hosting; all dynamic behavior happens client-side against Firestore/Auth via the modular SDK. No custom backend server.

---

## 2. Frontend Architecture — Module Breakdown

| Module | Responsibility |
|---|---|
| `app.js` | Entry point. Initializes Firebase, mounts the hash router, wires top-level event delegation, orchestrates initial reset-engine pass on load. |
| `auth.js` | Wraps Firebase Auth: sign-in/sign-up, session state observer (`onAuthStateChanged`), sign-out. Exposes a simple `getCurrentUser()` / `requireAuth()` API to other modules. |
| `db.js` | Thin Firestore access layer: typed CRUD helpers per collection (`createCategory`, `getChecklists`, `updateTaskSettings`, etc.), all queries and writes go through here — no other module talks to Firestore directly. |
| `timer.js` | Manages live stopwatch state per task: start/stop, `requestAnimationFrame`/`setInterval`-driven tick, computes `timeSpentSeconds` deltas, hands off final duration to `db.js` on stop/complete. |
| `chartManager.js` | Builds Chart.js configs from raw `timeLogs` data, handles range toggling (7d/30d), destroys/recreates chart instances on data refresh to avoid Chart.js memory leaks. |
| `resetEngine.js` | Implements the midnight-reset transaction logic (AppFlow.md §5); invoked on app load and on `visibilitychange`. |
| `router.js` (optional split from `app.js`) | Hash-based route table mapping `#/...` patterns to view-render functions. |
| `views/*.js` | Pure render functions per view (Hub, CategoryDetail, ChecklistDetail) — take data, return/inject DOM, no direct Firestore calls (call through `db.js`). |

**Dependency direction:** `views/*` → `db.js`/`timer.js`/`chartManager.js` → Firebase SDK. No circular imports; `db.js` never imports from `views/`.

---

## 3. Third-Party Libraries

| Library | Delivery | Purpose |
|---|---|---|
| Tailwind CSS | CDN (`cdn.tailwindcss.com`) with a small inline config for the pastel palette extension, OR a prebuilt static CSS via Tailwind CLI for production (recommended — see note) | Utility-first styling |
| Chart.js | CDN (`cdn.jsdelivr.net/npm/chart.js`) | Analytics bar charts |
| Firebase JS SDK | npm, v10+ modular (`firebase/app`, `firebase/auth`, `firebase/firestore`) bundled via a lightweight build step (esbuild/Vite) OR CDN ESM imports for a true zero-build setup | Auth, Firestore, Hosting |

**Production note:** the Tailwind Play CDN is fine for prototyping but ships the full JIT compiler to the browser. For production, run the Tailwind CLI at build/deploy time to generate a purged static `styles.css` — keeps the "zero heavy dependencies" constraint (Rules.md) honest without sacrificing the utility-class workflow.

---

## 4. Client-Side State Management Strategy

No external state library (Redux/Zustand) — deliberately, to keep the bundle minimal per the vanilla-JS constraint. Instead:

- **Source of truth**: Firestore, accessed via real-time `onSnapshot` listeners scoped to the currently active view (e.g., subscribe to the current checklist's `tasks` subcollection only while that view is mounted; unsubscribe on route change).
- **Ephemeral UI state** (modal open/closed, active timer ticking display, selected chart range) lives in small per-view module-scoped objects — not global singletons — reset on view teardown.
- **Optimistic updates**: local DOM mutation happens immediately on user action (e.g., checkbox toggle), Firestore write is fired async; the `onSnapshot` listener's echo of the same write is a no-op reconcile (Firestore SDK naturally dedupes local-origin snapshot events via `metadata.hasPendingWrites`).

---

## 5. Error Handling, Offline Fallback & Caching

- **Firestore offline persistence** enabled via `enableIndexedDbPersistence()` (or `persistentLocalCache` in v10 modular) at app init — queued writes survive reconnects automatically.
- **Offline indicator**: a lightweight `navigator.onLine` + Firestore's own network-state listener drives a small non-blocking banner ("You're offline — changes will sync when reconnected"); UI never disables interaction while offline.
- **Write failures** (e.g., permission errors from expired auth) are caught at the `db.js` layer, surfaced via a shared toast/notification utility — never a silent failure or a raw console-only error.
- **Reset engine failures**: if the transactional reset write fails (e.g., offline), it's retried on the next app-load/visibility event rather than blocking initial render — the UI renders with stale (pre-reset) state and self-corrects once the transaction succeeds.
- **LocalStorage usage**: limited to non-sensitive UI preferences only (last-selected chart range, last-active route for restore-on-reload) — never used as a data cache substitute for Firestore's own offline persistence, avoiding dual-source-of-truth bugs.
