# Schema.md
## Data Models & Firestore Structure

---

## 1. Collection Overview

```
users/{uid}
  categories/{categoryId}
  checklists/{checklistId}
    tasks/{taskId}          <- subcollection
  timeLogs/{timeLogId}
```

All top-level data is scoped under `users/{uid}/...` so Security Rules can enforce ownership with a single rule pattern rather than per-document `ownerId` checks. (An alternative flat structure with an `ownerId` field on every document is also viable — see §5 note.)

---

## 2. `categories` Collection

**Path:** `users/{uid}/categories/{categoryId}`

```ts
interface Category {
  id: string;                 // doc id
  name: string;                // "Study"
  colorToken: "lavender" | "mint" | "peach" | "butter";
  icon: string;                 // icon identifier, e.g. "book-open"
  createdAt: Timestamp;
  order: number;                // manual sort position on hub
}
```

---

## 3. `checklists` Collection

**Path:** `users/{uid}/checklists/{checklistId}`

```ts
interface Checklist {
  id: string;
  categoryId: string;           // FK -> categories/{id}
  name: string;                  // "Daily Study Checklist"
  createdAt: Timestamp;
  order: number;                 // sort position within category

  settings: {
    resetMode: "daily" | "permanent";
    timerEnabled: boolean;
    graphEnabled: boolean;
  };

  lastResetAt: Timestamp;        // used by the reset engine (AppFlow.md §5)
  taskCount: number;             // denormalized for hub-card display
  completedCount: number;        // denormalized; recomputed on task writes
}
```

**Denormalization note:** `taskCount`/`completedCount` are maintained client-side on every task write (increment/decrement) to avoid an aggregation query on every hub render. Acceptable for single-user scale; if multi-device write races become an issue, migrate to a Cloud Function trigger.

---

## 4. `tasks` Subcollection

**Path:** `users/{uid}/checklists/{checklistId}/tasks/{taskId}`

```ts
interface Task {
  id: string;
  title: string;
  order: number;                  // manual reorder position

  isCompleted: boolean;
  startedAt: Timestamp | null;    // set when a timer is actively running
  timeSpentSeconds: number;       // accumulated across start/stop cycles
  completedAt: Timestamp | null;

  createdAt: Timestamp;
}
```

- `startedAt` is non-null **only** while a timer is actively running; on stop it is cleared back to `null` and its elapsed delta is folded into `timeSpentSeconds`.
- On a daily reset, `isCompleted`, `startedAt`, `timeSpentSeconds`, and `completedAt` are all cleared to their defaults (`false`, `null`, `0`, `null`) — task documents are never deleted by the reset engine.

---

## 5. `timeLogs` Collection (Analytics Source of Truth)

**Path:** `users/{uid}/timeLogs/{timeLogId}`

```ts
interface TimeLog {
  id: string;
  checklistId: string;
  taskId: string;
  categoryId: string;             // denormalized for cross-category queries
  date: string;                    // "YYYY-MM-DD", local date of completion
  durationSeconds: number | null;  // null if timerEnabled was false
  completed: boolean;
  createdAt: Timestamp;
}
```

- **Append-only**: written once per task-completion event; never mutated or deleted by the reset engine. This is what survives daily resets and powers all historical charts.
- If a task is un-checked and re-completed within the same day (permanent checklists), a new `timeLog` entry is written rather than overwriting the prior one — the analytics layer aggregates by `date` + `taskId` client-side.

---

## 6. Indexing Requirements

Firestore composite indexes needed for the app's query patterns:

| Query | Index |
|---|---|
| Checklists by category, ordered | `checklists`: `categoryId ASC, order ASC` |
| Tasks by checklist, ordered | `tasks` (subcollection): `order ASC` (single-field, auto-indexed) |
| Time logs for a checklist within a date range | `timeLogs`: `checklistId ASC, date ASC` |
| Time logs for a category within a date range (cross-checklist analytics) | `timeLogs`: `categoryId ASC, date ASC` |

Declared in `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "checklists",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "categoryId", "order": "ASCENDING" },
        { "fieldPath": "order", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "timeLogs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "checklistId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "timeLogs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "categoryId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## 7. Firestore Security Rules

**`firestore.rules`:**

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read, write: if isOwner(uid);

      match /categories/{categoryId} {
        allow read, write: if isOwner(uid);
      }

      match /checklists/{checklistId} {
        allow read, write: if isOwner(uid);

        match /tasks/{taskId} {
          allow read, write: if isOwner(uid);
        }
      }

      match /timeLogs/{timeLogId} {
        // Append-only from the client: allow create, disallow update/delete
        // to preserve historical integrity.
        allow read, create: if isOwner(uid);
        allow update, delete: if false;
      }
    }

    // Deny everything else by default (implicit with explicit match blocks
    // above; no catch-all match to keep the rule surface minimal).
  }
}
```

**Rationale for `timeLogs` immutability:** since this collection is the historical source of truth for analytics that must survive daily resets, allowing client-side updates/deletes risks silent data loss or tampering with past records. If a correction is ever needed, it should be a new compensating entry, not a mutation.
