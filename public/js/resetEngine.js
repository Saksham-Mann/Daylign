/**
 * @file resetEngine.js
 * @description Client-Side Transaction-Guarded Daily Midnight Reset Engine for Daylign.
 * Implements AppFlow.md §5:
 *   - Evaluates on app boot and document visibilitychange.
 *   - Idempotently resets daily checklists across local midnight boundaries.
 *   - Multi-tab race safe via Firestore transactions (runTransaction).
 *   - Handles running timer snapshotting to timeLogs before resetting.
 */

import {
  db,
  getChecklistsCol,
  getTasksCol,
  getTimeLogsCol,
  getLocalDateString,
  getLocalMidnightDate
} from "./db.js";

import {
  doc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";

/**
 * Pure evaluation helper: checks whether a stored lastResetAt timestamp is older than local midnight.
 * 
 * @param {import('firebase/firestore').Timestamp|Date|string|number|null} lastResetAt 
 * @param {Date} [targetDate=new Date()] 
 * @returns {boolean} True if checklist is due for a daily reset
 */
export function isEligibleForDailyReset(lastResetAt, targetDate = new Date()) {
  const midnightMs = getLocalMidnightDate(targetDate).getTime();
  if (!lastResetAt) return true;

  let resetMs = 0;
  if (typeof lastResetAt.toMillis === "function") {
    resetMs = lastResetAt.toMillis();
  } else if (typeof lastResetAt.toDate === "function") {
    resetMs = lastResetAt.toDate().getTime();
  } else if (lastResetAt instanceof Date) {
    resetMs = lastResetAt.getTime();
  } else if (typeof lastResetAt === "number") {
    resetMs = lastResetAt;
  } else if (typeof lastResetAt === "string") {
    resetMs = new Date(lastResetAt).getTime();
  }

  return resetMs < midnightMs;
}

/**
 * Idempotently executes a transaction-guarded daily midnight reset for a specific checklist.
 * If concurrent tabs race, Firestore transactions guarantee only one will write,
 * while the other tab reads the updated lastResetAt and cleanly exits.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {Date} [targetDate=new Date()] - Reference date (defaults to now)
 * @returns {Promise<{ success: boolean, reason?: string, tasksReset?: number, timeLogged?: boolean }>}
 */
export async function resetChecklistIdempotent(uid, checklistId, targetDate = new Date()) {
  if (!uid || !checklistId) {
    return { success: false, reason: "Missing uid or checklistId" };
  }

  const checklistRef = doc(db, "users", uid, "checklists", checklistId);
  const midnightMs = getLocalMidnightDate(targetDate).getTime();

  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Read checklist document inside the transaction
      const checkSnap = await transaction.get(checklistRef);
      if (!checkSnap.exists()) {
        return { success: false, reason: "Checklist does not exist" };
      }

      const checklistData = checkSnap.data();

      // Ensure resetMode is "daily"
      if (checklistData.settings?.resetMode !== "daily") {
        return { success: false, reason: "Checklist is not in daily reset mode" };
      }

      // Check if already reset today after midnight (Idempotency / Multi-tab guard)
      if (!isEligibleForDailyReset(checklistData.lastResetAt, targetDate)) {
        return { success: false, reason: "Already reset for today" };
      }

      // 2. Fetch all tasks for this checklist
      const tasksSnap = await getDocs(getTasksCol(uid, checklistId));
      let tasksResetCount = 0;
      let timerSnapped = false;

      // Calculate yesterday's date string for any active timer snapshots
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDateStr = getLocalDateString(yesterday);

      // 3. Process each task inside the transaction
      tasksSnap.forEach((taskDoc) => {
        const taskData = taskDoc.data();

        // EDGE CASE (AppFlow.md §5): Active Timer at Midnight
        // If timer was actively running across midnight, snapshot logged time to timeLogs
        if (taskData.startedAt) {
          const startMs = taskData.startedAt.toDate ? taskData.startedAt.toDate().getTime() : Date.now();
          const elapsedDelta = Math.max(0, Math.floor((midnightMs - startMs) / 1000));
          const totalDuration = (taskData.timeSpentSeconds || 0) + elapsedDelta;

          if (totalDuration > 0) {
            const timeLogRef = doc(getTimeLogsCol(uid));
            transaction.set(timeLogRef, {
              checklistId,
              taskId: taskDoc.id,
              categoryId: checklistData.categoryId || "",
              date: yesterdayDateStr,
              durationSeconds: totalDuration,
              completed: Boolean(taskData.isCompleted),
              createdAt: serverTimestamp()
            });
            timerSnapped = true;
          }
        }

        // Reset task fields to fresh daily defaults
        transaction.update(taskDoc.ref, {
          isCompleted: false,
          startedAt: null,
          timeSpentSeconds: 0,
          completedAt: null
        });
        tasksResetCount++;
      });

      // 4. Update checklist document: set lastResetAt and clear completedCount
      transaction.update(checklistRef, {
        lastResetAt: serverTimestamp(),
        completedCount: 0
      });

      return {
        success: true,
        tasksReset: tasksResetCount,
        timeLogged: timerSnapped
      };
    });

    if (result.success) {
      console.info(`[ResetEngine] Checklist "${checklistId}" successfully reset. Tasks reset: ${result.tasksReset}`);
    }
    return result;
  } catch (error) {
    console.warn(`[ResetEngine] Transaction aborted or failed for checklist "${checklistId}":`, error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Scan all daily-reset checklists for a user and trigger daily midnight resets where eligible.
 * Invoked on app boot (post-auth) and on document visibilitychange.
 * 
 * @param {string} uid - User ID
 * @param {Date} [targetDate=new Date()] - Reference date
 * @returns {Promise<{ checked: number, resetCount: number, details: Array }>}
 */
export async function runResetEngine(uid, targetDate = new Date()) {
  if (!uid) return { checked: 0, resetCount: 0, details: [] };

  try {
    const q = query(getChecklistsCol(uid), where("settings.resetMode", "==", "daily"));
    const snap = await getDocs(q);

    let resetCount = 0;
    const details = [];

    for (const checkDoc of snap.docs) {
      const data = checkDoc.data();
      if (isEligibleForDailyReset(data.lastResetAt, targetDate)) {
        const res = await resetChecklistIdempotent(uid, checkDoc.id, targetDate);
        if (res.success) {
          resetCount++;
          details.push({ id: checkDoc.id, name: data.name, ...res });
        }
      }
    }

    if (resetCount > 0) {
      console.info(`[ResetEngine] Midnight reset completed for ${resetCount} checklist(s).`);
    }

    return {
      checked: snap.size,
      resetCount,
      details
    };
  } catch (error) {
    console.error("[ResetEngine] Error during runResetEngine pass:", error);
    return { checked: 0, resetCount: 0, error: error.message };
  }
}

/* ==========================================================================
   DEVELOPMENT & SMOKE TESTING HARNESS
   ========================================================================== */

/**
 * Test harness: Simulates crossing a midnight boundary for a checklist.
 * Useful in console during testing.
 * 
 * Usage from browser console:
 *   window.mockMidnightReset("checklistId123", "2026-08-19")
 * 
 * @param {string} uid 
 * @param {string} checklistId 
 * @param {string|Date} mockFutureDate 
 * @returns {Promise<Object>}
 */
export async function mockMidnightReset(uid, checklistId, mockFutureDate) {
  const futureDate = typeof mockFutureDate === "string" ? new Date(mockFutureDate) : mockFutureDate;
  console.info(`[ResetEngine:Test] Simulating midnight reset for date: ${futureDate.toISOString()}`);
  return await resetChecklistIdempotent(uid, checklistId, futureDate);
}

// Expose mock helper on window for manual QA
if (typeof window !== "undefined") {
  window.runResetEngine = runResetEngine;
  window.mockMidnightReset = mockMidnightReset;
}

export default {
  isEligibleForDailyReset,
  resetChecklistIdempotent,
  runResetEngine,
  mockMidnightReset
};

/**
 * ==========================================================================
 * SMOKE TEST VALIDATION CHECKLIST (Phase 7):
 * ==========================================================================
 * 1. Category Creation:
 *    - Click "+ New Category" -> Enter "Deep Study" -> Select Lavender -> Save.
 *    - Verify card renders with icon, Lavender theme, 0 checklists, 0% progress.
 * 
 * 2. Checklist Creation:
 *    - Click "Deep Study" -> Click "+ New Checklist".
 *    - Title: "Morning Revision" -> Reset Mode: "Daily Reset" -> Timer: On -> Graph: On.
 *    - Add initial tasks: "Math Revision\nPhysics Notes\nProblem Set 1".
 *    - Click "Create Checklist".
 *    - Verify redirection to #/checklist/:id with 3 tasks.
 * 
 * 3. Stopwatch & Timing:
 *    - Click "▶ Start" on "Math Revision".
 *    - Verify active state: mint pulse glow, live ticking mm:ss counter, aria-live polite container.
 *    - Click "⏸ Pause". Verify timer stops and folds delta into timeSpentSeconds.
 * 
 * 4. Task Completion:
 *    - Click checkbox on "Math Revision".
 *    - Verify celebration bounce animation, strikethrough text, "✓ 00:xx logged" badge.
 *    - Verify append-only document written to users/{uid}/timeLogs.
 * 
 * 5. Chart.js Analytics:
 *    - Verify Analytics panel renders below/aside task list.
 *    - Bar chart displays completed task count for today with Lavender color.
 *    - Toggle between 7d and 30d range pills; verify smooth re-render without memory leaks.
 * 
 * 6. Daily Reset Engine:
 *    - In browser console, run: window.mockMidnightReset(user.uid, checklistId, "2026-08-19").
 *    - Verify tasks are reset: isCompleted: false, startedAt: null, timeSpentSeconds: 0.
 *    - Verify historical timeLogs remain intact.
 *    - Run second time on same date -> Verify clean no-op (idempotency verified).
 * ==========================================================================
 */
