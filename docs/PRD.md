# Product Requirements Document (PRD)
## Personal Learning, Habit & Activity Tracker

---

## 1. Executive Summary

This application is a single-user, browser-based productivity tool for tracking recurring and one-time activities — study sessions, habits, chores, entertainment — through configurable checklists. Each checklist can optionally track elapsed time per task and visualize completion/time data with charts. The system is built as a lightweight Single Page Application (SPA) using vanilla JS and Tailwind CSS, backed by Firebase for auth, persistence, and hosting, prioritizing minimal dependencies, fast load times, and a calm, uncluttered interface.

## 2. Problem Statement

Existing habit trackers force a rigid mental model: either everything resets daily (habit-tracker apps) or nothing does (todo apps), and few blend lightweight time-tracking into that flow without becoming a heavyweight time-management suite. Users juggling mixed activity types — some cyclical (daily study), some permanent (a one-off packing checklist), some time-sensitive (movie watch time, focused work sessions) — end up splitting effort across three or four apps. This product unifies those patterns under one flexible checklist primitive: category → checklist → task, each checklist independently configurable for reset behavior, timing, and analytics.

## 3. User Personas & Core Use Cases

### Persona 1: The Student (primary)
Tracks daily study checklists (reset each midnight), logs focused study time per subject, and reviews weekly time-spent charts to self-audit study habits.

**Core use cases:**
- Create a "Study" category with a daily-reset checklist of subjects/tasks.
- Start a live timer on "Read Chapter 4," stop on completion, see logged duration.
- View a bar chart of daily study minutes over the last 7/30 days.

### Persona 2: The Household Organizer
Maintains permanent (non-resetting) checklists like "Move-in Groceries" or "Apartment Setup" that persist until manually cleared, without needing timers or graphs.

**Core use cases:**
- Create a checklist with Reset Mode = Permanent, Timer = off, Graph = off.
- Check off items over days/weeks; state persists until manually reset.

### Persona 3: The Habit Builder
Tracks daily recurring habits (exercise, reading, meditation) that must reset every 24 hours, with lightweight completion-rate analytics but no timer.

**Core use cases:**
- Create a daily-reset checklist, Timer = off, Graph = on (completion rate only).
- View a streak/completion-rate chart across the past month.

## 4. Functional Requirements

### FR-1: Activity Hub (Category Management)
- Users can create, rename, recolor (from the pastel palette), and delete top-level Activities/Categories (e.g., Study, Watch Movie, Groceries).
- Each category displays as a card on the home view showing: name, icon/color accent, count of associated checklists, and aggregate completion snapshot.
- Deleting a category prompts confirmation and cascades to its checklists (soft-delete with undo window preferred; hard-delete acceptable for v1).

### FR-2: Checklist Creation & Reset Behavior
- A checklist belongs to exactly one category and contains an ordered list of tasks.
- **Reset Mode** (required at creation, editable later):
  - *Daily Reset*: all task `isCompleted` flags and running timers are cleared at local midnight (00:00). Historical completion/time data is preserved in `timeLogs`, not deleted.
  - *Permanent*: tasks remain checked indefinitely until the user manually unchecks them or triggers a manual reset action.
- Changing Reset Mode from Permanent → Daily takes effect at the next midnight boundary, not retroactively.

### FR-3: Timer Toggle & Time Tracking
- Each checklist has a boolean `timerEnabled` setting, editable anytime.
- When enabled, each task exposes a start/stop stopwatch control.
- Starting a timer records `startedAt`; stopping records `completedAt` and computes `timeSpentSeconds = completedAt - startedAt` (accumulated across multiple start/stop cycles if the task is reopened).
- Duration is displayed formatted as `mm:ss` under 1 hour, `hh:mm:ss` at/above 1 hour.
- If `timerEnabled` is toggled off mid-task, any in-progress timer is stopped and logged before the toggle takes effect.

### FR-4: Graph Toggle & Analytics Display
- Each checklist has a boolean `graphEnabled` setting.
- When enabled, an analytics panel renders directly below the checklist showing:
  - Completion rate over time (daily-reset checklists) as a bar/heatmap.
  - Time spent per task per day (if `timerEnabled` is also true) as a stacked/grouped bar chart.
- When `timerEnabled` is false, only completion-rate visuals render (no time-based charts).

### FR-5: Upfront Creation Modal & Editable Settings
- Checklist creation is a single modal dialog (`<dialog>`) collecting: name, category, Reset Mode, Timer Toggle, Graph Toggle, and initial task list (optional, can add tasks later).
- A gear/settings icon on each checklist reopens the same set of controls in an edit modal at any time.
- Settings changes are persisted immediately to Firestore on save; no separate "publish" step.

### FR-6: Task Execution & Completion
- Tasks support: check/uncheck, reorder (drag or up/down controls), inline rename, delete.
- Completing a timed task auto-stops any running timer and logs the duration.
- Completing a non-timed task simply flips `isCompleted` and stamps `completedAt`.

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | First contentful paint < 1.5s on 4G; checklist interactions (check, timer start/stop) reflect optimistically in < 100ms before Firestore confirms. |
| Responsiveness | Mobile-first layout functional down to 320px width; desktop expands to multi-column category grid at ≥1024px. |
| Accessibility | WCAG 2.1 AA: all interactive elements keyboard-navigable, ARIA labels on icon-only buttons, color contrast ≥ 4.5:1 for text, focus-visible states on all controls. |
| Offline Resilience | Firestore offline persistence enabled; queued writes sync on reconnect; UI shows a subtle "offline" indicator rather than blocking interaction. |
| Data Integrity | Midnight reset logic must be idempotent and safe against multiple tabs/devices triggering it concurrently (see AppFlow.md §5). |
| Security | Firestore Security Rules restrict all reads/writes to the authenticated owner's `uid`; no cross-user data access. |

## 6. Success Metrics

- **Engagement**: ≥ 5 checklist interactions (check/timer actions) per active day for a retained user.
- **Retention proxy**: Daily-reset checklists show non-zero completion on ≥ 60% of days over a 30-day window.
- **Performance**: 95th-percentile interaction latency (optimistic UI) < 150ms.
- **Data trust**: Zero reported cases of lost/duplicated time logs across the midnight reset boundary.

## 7. Out of Scope (v1)

- Multi-user collaboration or shared checklists.
- Native mobile apps (PWA/responsive web only).
- Recurring schedules other than "daily" (e.g., weekly/custom cadences) — flagged as a v2 candidate.
- Push notifications / reminders.
- Third-party calendar integrations.
- Data export (CSV/PDF) — v2 candidate.
