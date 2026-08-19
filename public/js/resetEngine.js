/**
 * @file resetEngine.js
 * @description Daily Midnight Reset Engine Trigger for Daylign.
 * Invoked on app boot (post-auth) and on document visibilitychange.
 * Evaluates and executes the transaction-guarded daily reset across all daily checklists.
 */

import { runDailyResetCheck } from "./db.js";

/**
 * Scan all daily-reset checklists for a user and trigger daily midnight resets.
 * 
 * @param {string} [uid] - User ID
 * @returns {Promise<Object>}
 */
export async function runResetEngine(uid) {
  try {
    const result = await runDailyResetCheck(uid);
    if (result?.resetCount > 0) {
      console.info(`[ResetEngine] Midnight reset completed for ${result.resetCount} checklist(s).`);
    }
    return result;
  } catch (error) {
    console.warn("[ResetEngine] Reset engine note:", error.message);
    return { success: false, error: error.message };
  }
}

// Expose on window for manual testing in local development only
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  window.runResetEngine = runResetEngine;
}

export default {
  runResetEngine
};
