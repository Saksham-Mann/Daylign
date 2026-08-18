# AppFlow.md
## User Journey, State Flow & Routing Specification

---

## 1. Onboarding / Home Category Hub

```
┌──────────────────────────┐
│      App Load (SPA)      │
└─────────────┬─────────────┘
              │
              ▼
     ┌──────────────────┐        No
     │ Firebase Auth     │───────────────► Show Sign-In View
     │ session present?  │                 (email/password or
     └────────┬──────────┘                  anonymous auth)
              │ Yes                                │
              ▼                                    │ on success
     ┌──────────────────────┐                       │
     │ Run Reset Engine     │◄──────────────────────┘
     │ (see §5) before render│
     └────────┬──────────────┘
              ▼
     ┌──────────────────────────┐
     │ HOME: Category Hub View  │
     │  - Grid of category cards│
     │  - "+ New Category" CTA  │
     │  - Empty state if none   │
     └────────┬──────────────────┘
              │ tap category card
              ▼
     ┌──────────────────────────┐
     │ CATEGORY DETAIL VIEW     │
     │  - List of checklists    │
     │  - "+ New Checklist" CTA │
     └───────────────────────────┘
```

Empty states: zero categories → onboarding prompt with a single "Create your first activity" CTA that opens the category-creation form pre-focused.

---

## 2. Checklist Creation Modal Flow

```
[Category Detail View]
        │ tap "+ New Checklist"
        ▼
┌───────────────────────────────────────┐
│ <dialog> Checklist Creation Modal      │
│                                         │
│ Step (single form, no wizard):         │
│  1. Name input                         │
│  2. Reset Mode toggle: Daily | Permanent│
│  3. Timer Toggle: On | Off             │
│  4. Graph Toggle: On | Off             │
│  5. Optional initial tasks (add rows)  │
│                                         │
│  [Cancel]              [Create]        │
└───────────────┬─────────────────────────┘
                │ Create pressed
                ▼
       validate name non-empty
                │
        ┌───────┴────────┐
      invalid           valid
        │                 │
        ▼                 ▼
  inline error      write to Firestore:
  "Name required"    checklists/{id}
                      + settings{resetMode,
                        timerEnabled,graphEnabled}
                      + tasks (if any)
                            │
                            ▼
                  close modal, optimistic
                  render new checklist card
```

---

## 3. Task Execution & Live Timer Flow

```
[Checklist View — timerEnabled = true]

Task row (not started)
   │ tap "Start" (▶)
   ▼
record startedAt = now()
UI: row enters "active" state (pulse animation,
    mint accent, live mm:ss counter ticking)
   │
   ├── tap "Pause"/"Stop" ─────────────┐
   │                                   ▼
   │                         accumulatedSeconds +=
   │                         (now() - startedAt)
   │                         write timeSpentSeconds
   │                         task returns to "idle"
   │                         (not yet completed)
   │
   └── tap checkbox (complete while running)
                │
                ▼
       auto-stop timer (same as Stop)
       THEN mark isCompleted = true
       stamp completedAt = now()
       → proceeds to §4
```

Multiple start/stop cycles on the same task before completion accumulate into a single `timeSpentSeconds` total (not overwritten).

---

## 4. Task Completion & Time Logging Flow

```
Task marked complete
        │
        ▼
 ┌────────────────────────────┐
 │ isCompleted = true          │
 │ completedAt = timestamp     │
 └──────────────┬───────────────┘
                │ timerEnabled?
        ┌───────┴────────┐
       Yes               No
        │                 │
        ▼                 ▼
 write timeLogs/{id}:   write timeLogs/{id}:
  taskId, checklistId,   taskId, checklistId,
  durationSeconds,       durationSeconds: null,
  date (YYYY-MM-DD),     date, completed: true
  completed: true
        │                 │
        └───────┬─────────┘
                ▼
      if graphEnabled → recompute/append
      chart data point for today (client-side
      aggregation from timeLogs, no server job)
```

`timeLogs` entries are append-only and never mutated by the reset engine — they are the permanent historical record that survives daily resets.

---

## 5. Daily Midnight Reset Algorithm

```
On app load AND on regaining focus/visibility:

  for each checklist where resetMode == "daily":
        lastResetAt = checklist.lastResetAt (stored timestamp)
        todayMidnight = localMidnight(now())

        if lastResetAt < todayMidnight:
              ┌─────────────────────────────┐
              │ BEGIN batched Firestore write │
              │  for each task in checklist:  │
              │    isCompleted = false        │
              │    startedAt = null            │
              │    timeSpentSeconds = 0        │
              │  checklist.lastResetAt = now() │
              └─────────────────────────────┘
        else:
              no-op (already reset today)
```

**Idempotency / multi-tab safety:** the reset write uses `checklist.lastResetAt` as an optimistic guard — a Firestore transaction reads `lastResetAt`, re-checks `< todayMidnight` inside the transaction, and only then applies the batch. A second tab racing the same reset will read the already-updated `lastResetAt` and no-op. This avoids double-resets and avoids needing a server-side scheduled function for v1 (client-triggered, transaction-guarded).

---

## 6. Settings Edit Flow

```
[Checklist View]
   │ tap gear icon
   ▼
┌───────────────────────────────────────┐
│ Settings Modal (same shape as Create)  │
│  pre-filled with current values        │
│                                         │
│  Edits allowed: name, Reset Mode,      │
│  Timer Toggle, Graph Toggle            │
│                                         │
│  [Cancel]           [Save Changes]     │
└───────────────┬─────────────────────────┘
                │ Save
                ▼
   if timerEnabled: false→true
        no side effect (fresh capability)
   if timerEnabled: true→false
        auto-stop any running timer,
        log accumulated time first
   if resetMode changed
        takes effect at next midnight
        boundary (no retroactive reset)
                │
                ▼
      write to checklists/{id}.settings
      close modal, re-render checklist
```

---

## 7. Route / Page State Transitions (SPA Hash Routing)

| Hash Route | View | Notes |
|---|---|---|
| `#/` or `#/home` | Category Hub | Default landing after auth |
| `#/category/:categoryId` | Category Detail | Lists checklists in category |
| `#/checklist/:checklistId` | Checklist Detail | Tasks + optional analytics panel |
| `#/login` | Auth View | Shown when no session |

Navigation is handled by a lightweight `hashchange` listener in `app.js` mapping routes to render functions; no external router library. Back/forward browser buttons work natively via hash history. Deep-linking to `#/checklist/:id` on load re-hydrates by fetching that document directly rather than requiring hub → category → checklist traversal.
