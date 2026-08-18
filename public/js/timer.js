/**
 * @file timer.js
 * @description Timer & Stopwatch Engine for Daylign.
 * Manages live stopwatch ticking, duration calculations, start/stop accumulation,
 * auto-stopping on task completion or settings toggles, and accessible screen-reader announcements.
 */

import {
  startTaskTimer,
  stopTaskTimer,
  completeTask,
  stopAllRunningTimersInChecklist
} from "./db.js";

/* ==========================================================================
   ACTIVE LIVE TICKER STORE
   ========================================================================== */

/**
 * Map of active live ticker intervals keyed by taskId
 * @type {Map<string, number>}
 */
const activeTickers = new Map();

/**
 * Single source of truth for duration formatting (Rules.md §1).
 * Formats totalSeconds as mm:ss (under 1 hour) or h:mm:ss (1 hour and above).
 * 
 * @param {number} totalSeconds - Elapsed duration in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Calculate the total accumulated seconds including live delta since startedAt.
 * 
 * @param {number|Date|import('firebase/firestore').Timestamp} startedAt 
 * @param {number} [baseAccumulatedSeconds=0] 
 * @returns {number} Current total seconds
 */
export function calculateCurrentElapsed(startedAt, baseAccumulatedSeconds = 0) {
  if (!startedAt) return baseAccumulatedSeconds;
  const startMs = startedAt.toDate
    ? startedAt.toDate().getTime()
    : (startedAt instanceof Date ? startedAt.getTime() : Number(startedAt) || Date.now());
  const liveDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  return baseAccumulatedSeconds + liveDelta;
}

/**
 * Start a live ticking loop for a task's stopwatch display.
 * Uses setInterval (~1s tick) for smooth second updates without unnecessary layout thrashing.
 * 
 * @param {string} taskId - Unique task ID
 * @param {number|Date|import('firebase/firestore').Timestamp} startedAt - Timestamp when timer started
 * @param {number} baseAccumulatedSeconds - Previously accumulated seconds
 * @param {(formatted: string, totalSeconds: number) => void} onTick - Callback executed on each tick
 * @returns {() => void} Unsubscribe/stop ticker function
 */
export function createLiveTicker(taskId, startedAt, baseAccumulatedSeconds, onTick) {
  // Clear any existing ticker for this task
  clearLiveTicker(taskId);

  const startMs = startedAt.toDate
    ? startedAt.toDate().getTime()
    : (startedAt instanceof Date ? startedAt.getTime() : Number(startedAt) || Date.now());

  const tick = () => {
    const liveDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const total = baseAccumulatedSeconds + liveDelta;
    if (typeof onTick === "function") {
      onTick(formatDuration(total), total);
    }
  };

  // Immediate first tick
  tick();

  // Setup interval (~1s tick)
  const intervalId = window.setInterval(tick, 1000);
  activeTickers.set(taskId, intervalId);

  return () => clearLiveTicker(taskId);
}

/**
 * Clear a specific live ticker by taskId
 * 
 * @param {string} taskId 
 */
export function clearLiveTicker(taskId) {
  if (activeTickers.has(taskId)) {
    clearInterval(activeTickers.get(taskId));
    activeTickers.delete(taskId);
  }
}

/**
 * Clear all currently active live tickers across the entire view
 */
export function clearAllLiveTickers() {
  activeTickers.forEach((intervalId) => clearInterval(intervalId));
  activeTickers.clear();
}

/* ==========================================================================
   STOPWATCH STATE TRANSITIONS & FIRESTORE CALLS
   ========================================================================== */

/**
 * Start a task's stopwatch timer in Firestore.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function startTimer(uid, checklistId, taskId) {
  try {
    await startTaskTimer(uid, checklistId, taskId);
  } catch (error) {
    console.error(`[Timer] Failed to start timer for task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Stop/Pause a task's stopwatch timer, calculating the live elapsed delta and persisting to Firestore.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {string} taskId - Task ID
 * @param {number|Date|import('firebase/firestore').Timestamp} [startedAt] - Task's startedAt timestamp
 * @param {string} [taskTitle=""] - Optional task title for accessibility announcement
 * @returns {Promise<number>} New total accumulated seconds
 */
export async function stopTimer(uid, checklistId, taskId, startedAt, taskTitle = "") {
  clearLiveTicker(taskId);

  let elapsedDelta = 0;
  if (startedAt) {
    const startMs = startedAt.toDate
      ? startedAt.toDate().getTime()
      : (startedAt instanceof Date ? startedAt.getTime() : Number(startedAt) || Date.now());
    elapsedDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  }

  try {
    const newTotal = await stopTaskTimer(uid, checklistId, taskId, elapsedDelta);

    // Announce to screen readers on stop only (Design.md §2.3)
    announceTimerStop(taskTitle, formatDuration(newTotal));

    return newTotal;
  } catch (error) {
    console.error(`[Timer] Failed to stop timer for task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Complete a task with timer integration:
 * If the timer is actively running, compute elapsed time delta, stop the timer,
 * stamp completion, increment counters, and write append-only record to timeLogs.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {string} taskId - Task ID
 * @param {Object} options
 * @param {boolean} [options.timerEnabled=false] - Whether timer is enabled on checklist
 * @param {string} [options.categoryId=""] - Category foreign key
 * @param {number|Date|import('firebase/firestore').Timestamp} [options.startedAt=null] - If timer was running
 * @param {string} [options.taskTitle=""] - Title for announcement
 * @returns {Promise<void>}
 */
export async function completeTaskWithTimer(uid, checklistId, taskId, options = {}) {
  clearLiveTicker(taskId);

  let activeElapsedSeconds = 0;
  if (options.startedAt) {
    const startMs = options.startedAt.toDate
      ? options.startedAt.toDate().getTime()
      : (options.startedAt instanceof Date ? options.startedAt.getTime() : Number(options.startedAt) || Date.now());
    activeElapsedSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  }

  try {
    await completeTask(uid, checklistId, taskId, {
      timerEnabled: options.timerEnabled !== false,
      categoryId: options.categoryId || "",
      activeElapsedSeconds
    });

    if (options.taskTitle && options.timerEnabled) {
      announceTimerStop(options.taskTitle, formatDuration(activeElapsedSeconds));
    }
  } catch (error) {
    console.error(`[Timer] Failed to complete task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Auto-stop all active timers in a checklist (e.g. when timerEnabled is toggled off)
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @returns {Promise<void>}
 */
export async function stopAllTimersForChecklist(uid, checklistId) {
  clearAllLiveTickers();
  try {
    await stopAllRunningTimersInChecklist(uid, checklistId);
  } catch (error) {
    console.error(`[Timer] Failed to auto-stop timers for checklist ${checklistId}:`, error);
    throw error;
  }
}

/* ==========================================================================
   ACCESSIBILITY: THROTTLED SCREEN-READER ANNOUNCEMENT (Design.md §2.3)
   ========================================================================== */

/**
 * Announce stopwatch stop event to screen readers via aria-live region.
 * Throttled to announce ONLY upon stop (not every second) to prevent screen-reader noise.
 * 
 * @param {string} taskTitle 
 * @param {string} formattedDuration 
 */
export function announceTimerStop(taskTitle, formattedDuration) {
  let announcer = document.getElementById("a11y-timer-announcer");
  if (!announcer) {
    announcer = document.createElement("div");
    announcer.id = "a11y-timer-announcer";
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    announcer.className = "sr-only";
    document.body.appendChild(announcer);
  }

  const label = taskTitle ? `Timer stopped for "${taskTitle}". Duration: ${formattedDuration}.` : `Timer stopped: ${formattedDuration}.`;
  announcer.textContent = label;
}

export default {
  formatDuration,
  calculateCurrentElapsed,
  createLiveTicker,
  clearLiveTicker,
  clearAllLiveTickers,
  startTimer,
  stopTimer,
  completeTaskWithTimer,
  stopAllTimersForChecklist,
  announceTimerStop
};
