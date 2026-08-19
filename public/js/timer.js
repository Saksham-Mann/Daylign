/**
 * @file timer.js
 * @description Timer & Stopwatch Engine for Daylign.
 * Manages live stopwatch ticking, duration calculations, start/stop accumulation,
 * auto-stopping on task completion, and accessible screen-reader announcements.
 */

import { updateTask, completeTask } from "./db.js";

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
 * @param {number|Date|string} startedAt 
 * @param {number} [baseAccumulatedSeconds=0] 
 * @returns {number} Current total seconds
 */
export function calculateCurrentElapsed(startedAt, baseAccumulatedSeconds = 0) {
  if (!startedAt) return baseAccumulatedSeconds;
  const startMs = startedAt?.toDate
    ? startedAt.toDate().getTime()
    : (startedAt instanceof Date ? startedAt.getTime() : Number(new Date(startedAt)) || Date.now());
  const liveDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  return baseAccumulatedSeconds + liveDelta;
}

/**
 * Start a live ticking loop for a task's stopwatch display.
 * Uses setInterval (~1s tick) for smooth second updates.
 * 
 * @param {string} taskId - Unique task ID
 * @param {number|Date|string} startedAt - Timestamp when timer started
 * @param {number} baseAccumulatedSeconds - Previously accumulated seconds
 * @param {(formatted: string, totalSeconds: number) => void} onTick - Callback executed on each tick
 * @returns {() => void} Unsubscribe/stop ticker function
 */
export function createLiveTicker(taskId, startedAt, baseAccumulatedSeconds, onTick) {
  clearLiveTicker(taskId);

  const startMs = startedAt?.toDate
    ? startedAt.toDate().getTime()
    : (startedAt instanceof Date ? startedAt.getTime() : Number(new Date(startedAt)) || Date.now());

  const tick = () => {
    const liveDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const total = baseAccumulatedSeconds + liveDelta;
    if (typeof onTick === "function") {
      onTick(formatDuration(total), total);
    }
  };

  tick();
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
   STOPWATCH STATE TRANSITIONS & API CALLS
   ========================================================================== */

/**
 * Start a task's stopwatch timer on the backend.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function startTimer(uid, checklistId, taskId) {
  try {
    await updateTask(uid, checklistId, taskId, {
      startedAt: true
    });
  } catch (error) {
    console.error(`[Timer] Failed to start timer for task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Stop/Pause a task's stopwatch timer, calculating the live elapsed delta and persisting.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {string} taskId - Task ID
 * @param {number|Date|string} [startedAt] - Task's startedAt timestamp
 * @param {string} [taskTitle=""] - Optional task title for accessibility announcement
 * @returns {Promise<number>} New total accumulated seconds
 */
export async function stopTimer(uid, checklistId, taskId, startedAt, baseAccumulatedSeconds = 0, taskTitle = "") {
  clearLiveTicker(taskId);

  let elapsedDelta = 0;
  if (startedAt) {
    const startMs = startedAt?.toDate
      ? startedAt.toDate().getTime()
      : (startedAt instanceof Date ? startedAt.getTime() : Number(new Date(startedAt)) || Date.now());
    elapsedDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  }

  const newTotal = (Number(baseAccumulatedSeconds) || 0) + elapsedDelta;

  try {
    const res = await updateTask(uid, checklistId, taskId, {
      startedAt: null,
      timeSpentSeconds: newTotal
    });

    const finalTotal = res?.timeSpentSeconds || newTotal;

    // Announce to screen readers on stop only (Design.md §2.3)
    announceTimerStop(taskTitle, formatDuration(finalTotal));

    return finalTotal;
  } catch (error) {
    console.error(`[Timer] Failed to stop timer for task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Complete a task with timer integration:
 * Sends completion request to the serverless backend, which computes duration,
 * auto-stops timer, stamps completion, increments counters, and writes immutable timeLog.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {string} taskId - Task ID
 * @param {Object} options
 * @param {boolean} [options.timerEnabled=false] - Whether timer is enabled on checklist
 * @param {string} [options.categoryId=""] - Category foreign key
 * @param {number|Date|string} [options.startedAt=null] - If timer was running
 * @param {string} [options.taskTitle=""] - Title for announcement
 * @returns {Promise<void>}
 */
export async function completeTaskWithTimer(uid, checklistId, taskId, options = {}) {
  clearLiveTicker(taskId);

  try {
    const result = await completeTask(uid, checklistId, taskId, {
      timerEnabled: options.timerEnabled !== false,
      categoryId: options.categoryId || ""
    });

    if (options.taskTitle && options.timerEnabled && result?.totalDurationSeconds) {
      announceTimerStop(options.taskTitle, formatDuration(result.totalDurationSeconds));
    }
  } catch (error) {
    console.error(`[Timer] Failed to complete task ${taskId}:`, error);
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
  announceTimerStop
};
