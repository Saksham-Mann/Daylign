# Tracker.md
## Project Progress & Milestone Tracker

**Status Legend:** 🔴 Blocked · 🟡 In Progress · ⚪ Pending · 🟢 Complete

---

## Phase 1 — Firebase Project Setup & Security Rules
- [x] 🟢 Create Firebase project; enable Firestore (Native mode) + Auth
- [x] 🟢 Install `firebase-tools`; run `firebase login` / `firebase init`
- [x] 🟢 Author `firestore.rules` per Schema.md §7
- [x] 🟢 Author `firestore.indexes.json` per Schema.md §6
- [ ] ⚪ Deploy rules & indexes to a dev project
- [x] 🟢 Set up local Firestore/Auth emulator suite

## Phase 2 — Project Scaffolding & Tailwind Layout
- [x] 🟢 Create `/public` directory structure (see Implementation.md §2)
- [x] 🟢 Build `index.html` semantic skeleton (Design.md §3)
- [x] 🟢 Wire Tailwind config with pastel palette tokens
- [x] 🟢 Link Chart.js and confirm CDN/module loading
- [x] 🟢 Configure `firebase.json` Hosting rewrites for SPA fallback

## Phase 3 — Firestore CRUD Operations (Categories & Checklists)
- [x] 🟢 `db.js`: Firestore init + modular SDK imports
- [x] 🟢 Category CRUD: create / subscribe / update / delete (with cascade)
- [x] 🟢 Checklist CRUD: create / subscribe / update / delete
- [x] 🟢 Category Hub view wired to real-time listener
- [x] 🟢 Category Detail view wired to real-time listener
- [x] 🟢 Checklist Creation Modal: form, validation, submit-to-Firestore
- [x] 🟢 Checklist Settings Modal (edit flow, AppFlow.md §6)

## Phase 4 — Timer Engine & Task Completion Logic
- [x] 🟢 `timer.js`: `startTimer()` / `stopTimer()` with accumulation logic
- [x] 🟢 Live tick loop + `formatDuration()` utility (Rules.md §1)
- [x] 🟢 `completeTask()`: auto-stop-on-complete + `timeLogs` write
- [x] 🟢 Settings-toggle edge case: auto-stop on `timerEnabled` → false
- [x] 🟢 Task row UI states: idle / running / completed (Design.md §2.2)

## Phase 5 — Chart.js Dynamic Rendering & Data Aggregation
- [x] 🟢 `db.js`: `getTimeLogsForRange()` query helper
- [x] 🟢 `chartManager.js`: client-side aggregation into per-day buckets
- [x] 🟢 Completion-rate chart (always shown when `graphEnabled`)
- [x] 🟢 Time-spent stacked chart (shown when `timerEnabled` also true)
- [x] 🟢 7d / 30d range toggle
- [x] 🟢 Chart instance teardown on re-render (memory leak guard)

## Phase 6 — Midnight Reset Evaluation on Client Init
- [x] 🟢 `resetEngine.js`: transaction-guarded reset per AppFlow.md §5
- [x] 🟢 Hook into app load (post-auth) and `visibilitychange`
- [x] 🟢 Idempotency test across a mocked midnight boundary
- [x] 🟢 Multi-tab race verification

## Phase 7 — Deployment to Firebase Hosting
- [x] 🟢 Production Tailwind build (CLI purge) or pinned CDN versions
- [x] 🟢 Final `firebase deploy --only firestore:rules,firestore:indexes`
- [x] 🟢 `firebase deploy --only hosting`
- [x] 🟢 Post-deploy smoke test (full user flow end-to-end)

---

## Cross-Cutting / Non-Phase Items
- [x] 🟢 Accessibility pass: keyboard nav, ARIA labels, contrast check (WCAG 2.1 AA)
- [x] 🟢 Offline persistence enabled + offline indicator banner
- [x] 🟢 `prefers-reduced-motion` handling for all micro-interactions
- [x] 🟢 Empty states (no categories, no checklists, no tasks)
- [x] 🟢 Responsive QA at 320px / 768px / 1024px+ breakpoints

---

## Milestone Summary

| Phase | Status | Notes |
|---|---|---|
| 1. Firebase Setup | 🟢 Complete | Rules, indexes, and Auth setup |
| 2. Scaffolding | 🟢 Complete | Semantic index.html, Tailwind pastel tokens |
| 3. Core CRUD | 🟢 Complete | Category & checklist CRUD + native dialogs |
| 4. Timer Engine | 🟢 Complete | Live ticking stopwatch & timeLogs logging |
| 5. Analytics | 🟢 Complete | Dual-axis Chart.js visualization & 7d/30d toggles |
| 6. Reset Engine | 🟢 Complete | Transaction-guarded midnight reset & race guard |
| 7. Deployment | 🟢 Complete | Firebase Hosting SPA rewrites & smoke tests |
