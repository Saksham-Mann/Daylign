/**
 * @file db.js
 * @description Frontend Data Access Adapter for Daylign.
 * Decoupled from direct Firestore SDK operations — delegates all CRUD,
 * cascade operations, timer persistence, analytics, and reset checks
 * to the secure backend REST API via apiClient.js.
 */

import * as apiClient from "./apiClient.js";

/* ==========================================================================
   DATE HELPERS
   ========================================================================== */

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalMidnightDate(date = new Date()) {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

/* ==========================================================================
   CATEGORY DATA METHODS
   ========================================================================== */

export async function getCategories(uid) {
  return await apiClient.fetchCategories();
}

export async function getCategory(uid, categoryId) {
  const categories = await apiClient.fetchCategories();
  return categories.find((c) => c.id === categoryId) || null;
}

export async function createCategory(uid, data) {
  return await apiClient.createCategory(data);
}

export async function updateCategory(uid, categoryId, updates) {
  return await apiClient.updateCategory(categoryId, updates);
}

export async function deleteCategory(uid, categoryId) {
  return await apiClient.deleteCategory(categoryId);
}

/**
 * Real-time or poll-based Category subscription adapter.
 * Performs immediate initial fetch and exposes polling refresh.
 */
export function subscribeCategories(uid, callback) {
  let isMounted = true;

  const load = async () => {
    try {
      const categories = await apiClient.fetchCategories();
      if (isMounted && typeof callback === "function") {
        callback(categories);
      }
    } catch (err) {
      console.warn("[DB:subscribeCategories] Fetch error:", err.message);
    }
  };

  load();
  const pollInterval = setInterval(load, 15000); // Background refresh

  return () => {
    isMounted = false;
    clearInterval(pollInterval);
  };
}

/* ==========================================================================
   CHECKLIST DATA METHODS
   ========================================================================== */

export async function getChecklists(uid, categoryId = null) {
  return await apiClient.fetchChecklists(categoryId);
}

export async function getChecklist(uid, checklistId) {
  const res = await apiClient.fetchChecklist(checklistId);
  return res.checklist || null;
}

export async function createChecklist(uid, data) {
  return await apiClient.createChecklist(data);
}

export async function updateChecklist(uid, checklistId, updates) {
  return await apiClient.updateChecklist(checklistId, updates);
}

export async function deleteChecklist(uid, checklistId) {
  return await apiClient.deleteChecklist(checklistId);
}

/**
 * Checklist subscription adapter
 */
export function subscribeChecklists(uid, categoryId, callback) {
  let isMounted = true;

  const load = async () => {
    try {
      const checklists = await apiClient.fetchChecklists(categoryId);
      if (isMounted && typeof callback === "function") {
        callback(checklists);
      }
    } catch (err) {
      console.warn("[DB:subscribeChecklists] Fetch error:", err.message);
    }
  };

  load();
  const pollInterval = setInterval(load, 15000);

  return () => {
    isMounted = false;
    clearInterval(pollInterval);
  };
}

/* ==========================================================================
   TASK DATA METHODS
   ========================================================================== */

export async function getTasks(uid, checklistId) {
  return await apiClient.fetchTasks(checklistId);
}

export async function createTask(uid, checklistId, data) {
  return await apiClient.createTask(checklistId, data);
}

export async function updateTask(uid, checklistId, taskId, updates) {
  return await apiClient.updateTask(checklistId, taskId, updates);
}

export async function deleteTask(uid, checklistId, taskId) {
  return await apiClient.deleteTask(checklistId, taskId);
}

export async function reorderTasks(uid, checklistId, items) {
  return await apiClient.reorderTasks(checklistId, items);
}

export async function completeTask(uid, checklistId, taskId, payload = {}) {
  return await apiClient.completeTaskWithTimer(checklistId, taskId, payload);
}

export async function uncompleteTask(uid, checklistId, taskId) {
  return await apiClient.updateTask(checklistId, taskId, {
    isCompleted: false,
    startedAt: null
  });
}

/**
 * Tasks subscription adapter
 */
export function subscribeTasks(uid, checklistId, callback) {
  let isMounted = true;

  const load = async () => {
    try {
      const tasks = await apiClient.fetchTasks(checklistId);
      if (isMounted && typeof callback === "function") {
        callback(tasks);
      }
    } catch (err) {
      console.warn("[DB:subscribeTasks] Fetch error:", err.message);
    }
  };

  load();

  return () => {
    isMounted = false;
  };
}

/* ==========================================================================
   ANALYTICS & RESET METHODS
   ========================================================================== */

export async function getTimeLogsForRange(uid, checklistId, days = 7) {
  return await apiClient.fetchAnalyticsData(checklistId, days);
}

export async function runDailyResetCheck(uid) {
  try {
    return await apiClient.triggerDailyReset();
  } catch (err) {
    console.warn("[DB:runDailyResetCheck] Reset note:", err.message);
    return { success: false, reason: err.message };
  }
}

export default {
  getLocalDateString,
  getLocalMidnightDate,
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  subscribeCategories,
  getChecklists,
  getChecklist,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  subscribeChecklists,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  completeTask,
  uncompleteTask,
  subscribeTasks,
  getTimeLogsForRange,
  runDailyResetCheck
};
