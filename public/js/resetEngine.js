/**
 * @file resetEngine.js
 * @description Daily Midnight Reset Engine Trigger for Daylign.
 * Invoked on app boot (post-auth) and on document visibilitychange.
 * Dispatches reset evaluation to the backend API (/api/engine/reset),
 * which performs transactional reset with multi-tab race protection.
 */

import { triggerDailyReset } from "./apiClient.js";

/**
 * Scan all daily-reset checklists for a user and trigger daily midnight resets.
 * Invoked on app boot (post-auth) and on document visibilitychange.
 * 
 * @param {string} [uid] - User ID
 * @returns {Promise<Object>}
 */
export async function runResetEngine(uid) {
  try {
    const result = await triggerDailyReset();
    if (result?.resetCount > 0) {
      console.info(`[ResetEngine] Midnight reset completed for ${result.resetCount} checklist(s).`);
    }
    return result;
  } catch (error) {
    console.warn("[ResetEngine] Reset engine note:", error.message);
    return { success: false, error: error.message };
  }
}

// Expose on window for manual testing if needed
if (typeof window !== "undefined") {
  window.runResetEngine = runResetEngine;
}

export default {
  runResetEngine
};
