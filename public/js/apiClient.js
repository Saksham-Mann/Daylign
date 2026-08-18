/**
 * @file apiClient.js
 * @description Decoupled REST API client for Daylign.
 * Handles authenticated communication with the Firebase Cloud Functions backend (/api/*),
 * injecting the Firebase Auth Bearer ID Token on every request.
 */

import { getIdToken } from "./auth.js";

const API_BASE = "/api";

/**
 * Standardized HTTP request handler with automatic token injection and error parsing.
 * 
 * @param {string} endpoint - API path (e.g. "/categories")
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
  const token = await getIdToken();
  if (!token) {
    throw new Error("Authentication required. Please sign in.");
  }

  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg = (typeof data === "object" && (data.message || data.error)) || `API Request failed with status ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/* ==========================================================================
   CATEGORY API METHODS
   ========================================================================== */

export async function fetchCategories() {
  const data = await apiRequest("/categories", { method: "GET" });
  return data.categories || [];
}

export async function createCategory(data) {
  return await apiRequest("/categories", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateCategory(id, updates) {
  return await apiRequest(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
}

export async function deleteCategory(id) {
  return await apiRequest(`/categories/${id}`, {
    method: "DELETE"
  });
}

/* ==========================================================================
   CHECKLIST API METHODS
   ========================================================================== */

export async function fetchChecklists(categoryId = null) {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : "";
  const data = await apiRequest(`/checklists${query}`, { method: "GET" });
  return data.checklists || [];
}

export async function fetchChecklist(id) {
  return await apiRequest(`/checklists/${id}`, { method: "GET" });
}

export async function createChecklist(data) {
  return await apiRequest("/checklists", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateChecklist(id, updates) {
  return await apiRequest(`/checklists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
}

export async function deleteChecklist(id) {
  return await apiRequest(`/checklists/${id}`, {
    method: "DELETE"
  });
}

/* ==========================================================================
   TASK API METHODS
   ========================================================================== */

export async function fetchTasks(checklistId) {
  const data = await apiRequest(`/checklists/${checklistId}/tasks`, { method: "GET" });
  return data.tasks || [];
}

export async function createTask(checklistId, data) {
  return await apiRequest(`/checklists/${checklistId}/tasks`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateTask(checklistId, taskId, updates) {
  return await apiRequest(`/checklists/${checklistId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
}

export async function deleteTask(checklistId, taskId) {
  return await apiRequest(`/checklists/${checklistId}/tasks/${taskId}`, {
    method: "DELETE"
  });
}

export async function reorderTasks(checklistId, items) {
  return await apiRequest(`/checklists/${checklistId}/tasks/reorder`, {
    method: "POST",
    body: JSON.stringify({ items })
  });
}

/* ==========================================================================
   TIMER, COMPLETION & ANALYTICS API METHODS
   ========================================================================== */

export async function completeTaskWithTimer(checklistId, taskId, payload = {}) {
  return await apiRequest("/timer/complete", {
    method: "POST",
    body: JSON.stringify({
      checklistId,
      taskId,
      ...payload
    })
  });
}

export async function fetchAnalyticsData(checklistId = null, days = 7) {
  const params = new URLSearchParams();
  if (checklistId) params.append("checklistId", checklistId);
  if (days) params.append("days", String(days));

  return await apiRequest(`/analytics?${params.toString()}`, { method: "GET" });
}

export async function triggerDailyReset() {
  return await apiRequest("/engine/reset", {
    method: "POST"
  });
}

export default {
  apiRequest,
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchChecklists,
  fetchChecklist,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  completeTaskWithTimer,
  fetchAnalyticsData,
  triggerDailyReset
};
