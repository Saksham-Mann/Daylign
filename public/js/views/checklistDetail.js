/**
 * @file views/checklistDetail.js
 * @description Checklist Detail View for Daylign.
 * Manages task list execution, live stopwatch start/pause, task completion logging to timeLogs,
 * inline renaming, task reordering, Google Material Symbols, and integrated Chart.js analytics.
 */

import {
  getChecklist,
  getCategory,
  subscribeTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  uncompleteTask,
  deleteChecklist
} from "../db.js";

import {
  formatDuration,
  createLiveTicker,
  clearLiveTicker,
  clearAllLiveTickers,
  startTimer,
  stopTimer,
  completeTaskWithTimer
} from "../timer.js";

import {
  renderAnalyticsChart,
  destroyActiveChart
} from "../chartManager.js";

import {
  openChecklistSettingsModal,
  showConfirmModal
} from "../modals.js";
import { renderSectionError } from "./errorStates.js";

// Pastel token styling mapping
const COLOR_SCHEMES = {
  lavender: {
    bg: "bg-lavender-bg dark:bg-indigo-950/60",
    text: "text-indigo-600 dark:text-indigo-300",
    accent: "bg-lavender-accent",
    hex: "#818CF8"
  },
  mint: {
    bg: "bg-mint-bg dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    accent: "bg-mint-accent",
    hex: "#34D399"
  },
  peach: {
    bg: "bg-peach-bg dark:bg-rose-950/60",
    text: "text-rose-600 dark:text-rose-300",
    accent: "bg-peach-accent",
    hex: "#FB7185"
  },
  butter: {
    bg: "bg-butter-bg dark:bg-amber-950/60",
    text: "text-amber-700 dark:text-amber-300",
    accent: "bg-butter-accent",
    hex: "#FBBF24"
  },
  sky: {
    bg: "bg-sky-bg dark:bg-sky-950/60",
    text: "text-sky-600 dark:text-sky-300",
    accent: "bg-sky-accent",
    hex: "#38BDF8"
  },
  violet: {
    bg: "bg-violet-bg dark:bg-purple-950/60",
    text: "text-purple-600 dark:text-purple-300",
    accent: "bg-violet-accent",
    hex: "#A855F7"
  },
  coral: {
    bg: "bg-coral-bg dark:bg-orange-950/60",
    text: "text-orange-600 dark:text-orange-300",
    accent: "bg-coral-accent",
    hex: "#FB923C"
  },
  teal: {
    bg: "bg-teal-bg dark:bg-teal-950/60",
    text: "text-teal-600 dark:text-teal-300",
    accent: "bg-teal-accent",
    hex: "#2DD4BF"
  },
  sage: {
    bg: "bg-sage-bg dark:bg-lime-950/60",
    text: "text-lime-700 dark:text-lime-300",
    accent: "bg-sage-accent",
    hex: "#84CC16"
  },
  slate: {
    bg: "bg-slate-bg dark:bg-slate-900/60",
    text: "text-slate-600 dark:text-slate-300",
    accent: "bg-slate-accent",
    hex: "#94A3B8"
  }
};

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Renders the Checklist Detail View
 * 
 * @param {HTMLElement} container - DOM container element
 * @param {string} uid - Authenticated user UID
 * @param {string} checklistId - Target checklist ID
 * @param {Function} setBreadcrumbs - Breadcrumb updater callback
 * @returns {Promise<() => void>} Cleanup function
 */
export async function renderChecklistDetail(container, uid, checklistId, setBreadcrumbs) {
  let checklist = null;
  let category = null;

  try {
    checklist = await getChecklist(uid, checklistId);
    if (checklist) {
      category = await getCategory(uid, checklist.categoryId);
    }
  } catch (err) {
    console.error("[ChecklistDetail] Error loading checklist or category:", err);
  }

  if (!checklist) {
    if (typeof setBreadcrumbs === "function") {
      setBreadcrumbs([{ label: "Checklist Not Found" }]);
    }
    renderSectionError(container, {
      title: "Checklist Not Found",
      message: "The checklist you're looking for doesn't exist, was deleted, or you may not have permission to view it.",
      icon: "assignment_late",
      retryFn: () => { window.location.hash = "#/activities"; },
      retryLabel: "Back to Activities"
    });
    return () => {};
  }

  const categoryName = category ? category.name : "Category";
  const colorToken = category ? category.colorToken : "lavender";
  const scheme = COLOR_SCHEMES[colorToken] || COLOR_SCHEMES.lavender;

  if (typeof setBreadcrumbs === "function") {
    setBreadcrumbs([
      { label: categoryName, href: `#/category/${checklist.categoryId}` },
      { label: checklist.name }
    ]);
  }

  const isDaily = checklist.settings?.resetMode === "daily";
  const timerEnabled = checklist.settings?.timerEnabled !== false;
  const graphEnabled = checklist.settings?.graphEnabled !== false;

  let activeDaysRange = 7;

  container.innerHTML = `
    <section class="space-y-6" aria-labelledby="checklist-title-heading">
      <!-- Top Header Card -->
      <div class="bg-surface dark:bg-[#131B2E] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1.5 flex-wrap">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
              isDaily
                ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            }">
              <span class="material-symbols-outlined text-xs ${isDaily ? "text-amber-600 dark:text-amber-400" : "text-indigo-500"}">${isDaily ? "wb_sunny" : "push_pin"}</span>
              ${isDaily ? "Daily Reset (00:00)" : "Permanent"}
            </span>
            <span class="text-xs text-slate-400 dark:text-slate-500">
              in <a href="#/category/${checklist.categoryId}" class="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">${escapeHtml(categoryName)}</a>
            </span>
          </div>
          <h1 id="checklist-title-heading" class="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">${escapeHtml(checklist.name)}</h1>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" id="checklist-settings-btn" class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5" aria-label="Checklist settings">
            <span class="material-symbols-outlined text-sm">settings</span>
            Settings
          </button>
          <button type="button" id="checklist-delete-btn" class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1.5" aria-label="Delete this checklist">
            <span class="material-symbols-outlined text-sm">delete</span>
            Delete
          </button>
        </div>
      </div>

      <!-- Main Layout: Tasks List (Left) + Analytics Panel (Right/Below) -->
      <div class="grid grid-cols-1 ${graphEnabled ? "lg:grid-cols-[1fr_380px]" : ""} gap-6 items-start">
        
        <!-- Task Execution Section -->
        <section aria-labelledby="tasks-heading" class="bg-surface dark:bg-[#131B2E] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 id="tasks-heading" class="text-base font-bold text-slate-800 dark:text-slate-100">Tasks</h2>
            <span id="tasks-counter-badge" class="text-xs font-semibold text-slate-500 dark:text-slate-400">0 / 0 completed</span>
          </div>

          <!-- Add Task Input Form -->
          <form id="new-task-form" class="flex gap-2">
            <input type="text" id="task-title-input" placeholder="Add a new task..." required maxlength="120" class="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-lavender-accent focus:ring-1 focus:ring-lavender-accent transition-all" />
            <button type="submit" id="add-task-submit-btn" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 focus:ring-2 focus:ring-slate-800">
              <span class="material-symbols-outlined text-base">add</span>
              Add
            </button>
          </form>

          <!-- Task Items List -->
          <ul id="task-list-items" class="space-y-2.5 pt-1" role="list">
            <li class="py-6 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">Loading tasks...</li>
          </ul>
        </section>

        <!-- Analytics Section -->
        ${graphEnabled ? `
          <section aria-label="Checklist analytics" class="bg-surface dark:bg-[#131B2E] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">Analytics</h2>
                <p class="text-[11px] text-slate-400 dark:text-slate-500">Completion & focus audit</p>
              </div>
              <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-0.5 text-xs font-medium" role="group" aria-label="Analytics range toggle">
                <button type="button" id="btn-range-7d" class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm font-semibold transition-all">7d</button>
                <button type="button" id="btn-range-30d" class="px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all">30d</button>
              </div>
            </div>

            <!-- Canvas for Chart.js -->
            <div class="relative w-full h-[220px]">
              <canvas id="checklist-analytics-canvas"></canvas>
            </div>

            <!-- Aggregate Stats Bar -->
            <div id="analytics-summary-stats" class="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2 font-medium">
              <div class="flex items-center justify-between">
                <div>
                  <span>Avg Active Rate: <strong id="stat-avg-rate" class="text-slate-800 dark:text-slate-200">0%</strong></span>
                  <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-normal">Updates every 60 mins</p>
                </div>
                <div class="text-right">
                  <span>Progress: <strong id="stat-checklist-progress" class="text-indigo-600 dark:text-indigo-400 font-semibold">0%</strong></span>
                  ${timerEnabled ? `<span class="block text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">Time: <strong id="stat-total-time">0m</strong></span>` : ""}
                </div>
              </div>
            </div>
          </section>
        ` : ""}

      </div>
    </section>
  `;

  // Bind Settings Modal
  container.querySelector("#checklist-settings-btn")?.addEventListener("click", () => {
    openChecklistSettingsModal(uid, checklist, async () => {
      await renderChecklistDetail(container, uid, checklistId, setBreadcrumbs);
    });
  });

  // Bind Delete Checklist Button
  container.querySelector("#checklist-delete-btn")?.addEventListener("click", async () => {
    const confirmed = await showConfirmModal({
      title: `Delete "${checklist.name}"?`,
      message: "This will permanently delete this checklist and all its tasks and cannot be undone.",
      confirmText: "Delete Checklist"
    });

    if (confirmed) {
      try {
        await deleteChecklist(uid, checklistId);
        if (typeof window.showToast === "function") {
          window.showToast(`Deleted checklist "${checklist.name}"`, "info");
        }
        window.location.hash = `#/category/${checklist.categoryId}`;
      } catch (err) {
        if (typeof window.showToast === "function") {
          window.showToast(err.message, "error");
        }
      }
    }
  });

  // Task Creation Submit
  const taskForm = container.querySelector("#new-task-form");
  const taskTitleInput = container.querySelector("#task-title-input");

  taskForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = taskTitleInput?.value.trim();
    if (!title) return;

    taskTitleInput.value = "";
    try {
      await createTask(uid, checklistId, { title });
    } catch (err) {
      if (typeof window.showToast === "function") {
        window.showToast(err.message, "error");
      }
    }
  });

  // Shared mutable tasks array, updated by real-time subscription
  let localTasks = [];

  // Analytics Chart Refresh Helper
  const refreshAnalytics = () => {
    if (!graphEnabled) return;
    const canvas = container.querySelector("#checklist-analytics-canvas");
    if (!canvas) return;

    // Update overall checklist progress stat
    const progressEl = container.querySelector("#stat-checklist-progress");
    if (progressEl && localTasks.length > 0) {
      const completed = localTasks.filter((t) => t.isCompleted).length;
      const pct = Math.round((completed / localTasks.length) * 100);
      progressEl.textContent = `${pct}% (${completed}/${localTasks.length})`;
    } else if (progressEl) {
      progressEl.textContent = `0%`;
    }

    renderAnalyticsChart(canvas, uid, checklistId, {
      days: activeDaysRange,
      timerEnabled,
      accentColor: scheme.hex,
      onStatsUpdated: ({ avgRate, activeDays, totalDays, totalMinutes }) => {
        const rateEl = container.querySelector("#stat-avg-rate");
        if (rateEl) rateEl.textContent = `${avgRate}% (${activeDays}/${totalDays}d)`;

        const timeEl = container.querySelector("#stat-total-time");
        if (timeEl) {
          const hours = Math.floor(totalMinutes / 60);
          const mins = totalMinutes % 60;
          timeEl.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        }
      }
    });
  };

  // Range button listeners
  if (graphEnabled) {
    const btn7d = container.querySelector("#btn-range-7d");
    const btn30d = container.querySelector("#btn-range-30d");

    btn7d?.addEventListener("click", () => {
      activeDaysRange = 7;
      btn7d.className = "px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm font-semibold transition-all";
      btn30d.className = "px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all";
      refreshAnalytics();
    });

    btn30d?.addEventListener("click", () => {
      activeDaysRange = 30;
      btn30d.className = "px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm font-semibold transition-all";
      btn7d.className = "px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all";
      refreshAnalytics();
    });

    refreshAnalytics();
  }

  // Real-time Tasks Subscription
  const unsubTasks = subscribeTasks(uid, checklistId, (tasks) => {
    localTasks = tasks;
    try {
      renderTasksList(container, uid, checklistId, tasks, {
        timerEnabled,
        categoryId: checklist.categoryId,
        onTasksChanged: () => {
          refreshAnalytics();
        }
      });
    } catch (renderErr) {
      console.error("[ChecklistDetail] renderTasksList error:", renderErr);
    }

    try {
      refreshAnalytics();
    } catch (analyticsErr) {
      console.error("[ChecklistDetail] refreshAnalytics error:", analyticsErr);
    }
  }, (err) => {
    console.error("[ChecklistDetail] Tasks subscription error:", err);
    const listEl = container.querySelector("#task-list-items");
    if (listEl) {
      listEl.innerHTML = `
        <li class="py-8 text-center text-xs text-rose-500 font-medium">
          Couldn't load tasks. Please check your internet connection.
        </li>
      `;
    }
  });

  // Auto-refresh analytics graph every 60 minutes
  let analyticsAutoRefreshInterval = null;
  if (graphEnabled) {
    analyticsAutoRefreshInterval = setInterval(() => {
      refreshAnalytics();
    }, 60 * 60 * 1000); // 60 minutes
  }

  return () => {
    if (analyticsAutoRefreshInterval) clearInterval(analyticsAutoRefreshInterval);
    unsubTasks();
    clearAllLiveTickers();
    destroyActiveChart();
  };
}

/**
 * Render Tasks List Items with Idle, Running, and Completed states
 */
function renderTasksList(container, uid, checklistId, tasks, options = {}) {
  const listEl = container.querySelector("#task-list-items");
  const counterBadge = container.querySelector("#tasks-counter-badge");
  if (!listEl) return;

  const timerEnabled = options.timerEnabled !== false;
  const categoryId = options.categoryId || "";
  const completedCount = tasks.filter((t) => t.isCompleted).length;

  if (counterBadge) {
    counterBadge.textContent = `${completedCount} / ${tasks.length} completed`;
  }

  if (tasks.length === 0) {
    listEl.innerHTML = `
      <li class="py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
        No tasks yet. Type a task title above and press Add.
      </li>
    `;
    return;
  }

  // Clear running tickers before re-attaching
  clearAllLiveTickers();

  const formatTaskDateTime = (val) => {
    if (!val) return "-";
    try {
      let d = null;
      if (typeof val?.toDate === "function") {
        d = val.toDate();
      } else if (val instanceof Date) {
        d = val;
      } else if (typeof val === "number") {
        d = new Date(val);
      } else if (typeof val === "string") {
        d = new Date(val);
      } else if (val && typeof val === "object" && typeof val.seconds === "number") {
        d = new Date(val.seconds * 1000);
      }
      if (!d || isNaN(d.getTime())) return "-";

      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      }) + " at " + d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
      });
    } catch (err) {
      return "-";
    }
  };

  listEl.innerHTML = tasks.map((task, index) => {
    const isRunning = Boolean(task.startedAt);
    const isCompleted = Boolean(task.isCompleted);
    const accumulated = task.timeSpentSeconds || 0;

    const createdDateStr = formatTaskDateTime(task.createdAt);
    const finishedDateStr = isCompleted ? formatTaskDateTime(task.completedAt) : "-";

    return `
      <li class="group rounded-2xl border ${
        isRunning
          ? "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20 animate-timer-active shadow-sm"
          : isCompleted
          ? "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
          : "border-slate-200 dark:border-slate-800 bg-surface dark:bg-[#131B2E] hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-subtle"
      } p-3.5 flex items-center justify-between gap-3 transition-all duration-200" data-task-id="${task.id}" role="listitem" title="Created: ${createdDateStr}&#10;Finished: ${finishedDateStr}">
        
        <!-- Left: Checkbox + Title / Inline Edit + Dates -->
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <button type="button" class="task-checkbox-btn flex-shrink-0 w-5 h-5 rounded-lg border flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
            isCompleted
              ? "bg-mint-accent border-mint-accent text-white animate-task-bounce"
              : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-emerald-400"
          }" data-id="${task.id}" data-completed="${isCompleted}" aria-label="${isCompleted ? "Mark incomplete" : "Mark complete"}: ${escapeHtml(task.title)}">
            ${isCompleted ? `<span class="material-symbols-outlined text-sm font-bold">check</span>` : ""}
          </button>

          <!-- Task Title or Inline Edit Form -->
          <div class="flex-1 min-w-0">
            <span class="task-title-text text-xs sm:text-sm font-medium ${isCompleted ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100"} truncate block cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-id="${task.id}" title="Click to rename">
              ${escapeHtml(task.title)}
            </span>
            <input type="text" class="task-rename-input hidden w-full px-2 py-1 text-xs sm:text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-400" value="${escapeHtml(task.title)}" data-id="${task.id}" maxlength="120" />
            
            <!-- Created & Finished Dates on Hover -->
            <div class="text-[10px] text-slate-400 dark:text-slate-500 font-normal hidden group-hover:flex items-center gap-1.5 transition-all mt-0.5 pointer-events-none">
              <span>Created: <strong class="font-medium text-slate-600 dark:text-slate-300">${createdDateStr}</strong></span>
              <span>•</span>
              <span>Finished: <strong class="font-medium ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}">${finishedDateStr}</strong></span>
            </div>
          </div>
        </div>

        <!-- Right: Stopwatch Controls, Reorder & Options -->
        <div class="flex items-center gap-2 flex-shrink-0">
          
          <!-- Timer Controls -->
          ${timerEnabled ? `
            <div class="flex items-center gap-1.5">
              ${isRunning ? `
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700" aria-live="polite">
                  <span class="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-sm">timer</span>
                  <span class="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300 task-live-counter" data-id="${task.id}">
                    ${formatDuration(accumulated)}
                  </span>
                </div>
                <button type="button" class="pause-timer-btn px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors flex items-center gap-1" data-id="${task.id}" aria-label="Pause stopwatch for ${escapeHtml(task.title)}">
                  <span class="material-symbols-outlined text-sm">pause</span>
                  Pause
                </button>
              ` : `
                ${accumulated > 0 ? `
                  <span class="font-mono text-[11px] ${isCompleted ? "text-emerald-700 dark:text-emerald-300 bg-mint-bg/80 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full font-medium" : "text-slate-400 dark:text-slate-500"}">
                    ${isCompleted ? `✓ ${formatDuration(accumulated)} logged` : formatDuration(accumulated)}
                  </span>
                ` : ""}
                ${!isCompleted ? `
                  <button type="button" class="start-timer-btn px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1" data-id="${task.id}" aria-label="Start stopwatch for ${escapeHtml(task.title)}">
                    <span class="material-symbols-outlined text-sm">play_arrow</span>
                    Start
                  </button>
                ` : ""}
              `}
            </div>
          ` : `
            ${isCompleted ? `
              <span class="text-[11px] text-emerald-700 dark:text-emerald-300 bg-mint-bg/80 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <span class="material-symbols-outlined text-xs">check</span>
                Done
              </span>
            ` : ""}
          `}

          <!-- Reorder Handles (Up / Down) - Crisp, high contrast and accessible -->
          <div class="flex items-center gap-0.5">
            <button type="button" class="reorder-up-btn p-1 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-20 disabled:pointer-events-none" data-id="${task.id}" data-index="${index}" ${index === 0 ? "disabled" : ""} title="Move task up" aria-label="Move task up: ${escapeHtml(task.title)}">
              <span class="material-symbols-outlined text-base font-semibold">arrow_upward</span>
            </button>
            <button type="button" class="reorder-down-btn p-1 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-20 disabled:pointer-events-none" data-id="${task.id}" data-index="${index}" ${index === tasks.length - 1 ? "disabled" : ""} title="Move task down" aria-label="Move task down: ${escapeHtml(task.title)}">
              <span class="material-symbols-outlined text-base font-semibold">arrow_downward</span>
            </button>
          </div>

          <!-- Delete Task Button - High contrast, clearly clickable -->
          <button type="button" class="delete-task-btn p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors" data-id="${task.id}" title="Delete task" aria-label="Delete task: ${escapeHtml(task.title)}">
            <span class="material-symbols-outlined text-lg">delete</span>
          </button>

        </div>
      </li>
    `;
  }).join("");

  // Attach live tickers for running timers
  tasks.forEach((task) => {
    if (task.startedAt) {
      const counterEl = listEl.querySelector(`.task-live-counter[data-id="${task.id}"]`);
      if (counterEl) {
        createLiveTicker(task.id, task.startedAt, task.timeSpentSeconds || 0, (formatted) => {
          counterEl.textContent = formatted;
        });
      }
    }
  });

  // Checkbox Check/Uncheck Completion Flow
  listEl.querySelectorAll(".task-checkbox-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const taskId = btn.getAttribute("data-id");
      const isCompleted = btn.getAttribute("data-completed") === "true";
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      try {
        if (isCompleted) {
          await uncompleteTask(uid, checklistId, taskId);
        } else {
          await completeTaskWithTimer(uid, checklistId, taskId, {
            timerEnabled,
            categoryId,
            startedAt: task.startedAt,
            taskTitle: task.title
          });
        }
        if (typeof options.onTasksChanged === "function") {
          options.onTasksChanged();
        }
      } catch (err) {
        if (typeof window.showToast === "function") {
          window.showToast(err.message, "error");
        }
      }
    });
  });

  // Start Timer Button
  listEl.querySelectorAll(".start-timer-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const taskId = btn.getAttribute("data-id");
      try {
        await startTimer(uid, checklistId, taskId);
      } catch (err) {
        if (typeof window.showToast === "function") {
          window.showToast(err.message, "error");
        }
      }
    });
  });

  // Pause Timer Button
  listEl.querySelectorAll(".pause-timer-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const taskId = btn.getAttribute("data-id");
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      try {
        await stopTimer(uid, checklistId, taskId, task.startedAt, task.timeSpentSeconds || 0, task.title);
      } catch (err) {
        if (typeof window.showToast === "function") {
          window.showToast(err.message, "error");
        }
      }
    });
  });

  // Delete Task Button
  listEl.querySelectorAll(".delete-task-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const taskId = btn.getAttribute("data-id");
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const confirmed = await showConfirmModal({
        title: `Delete "${task.title}"?`,
        message: "This will remove this task from the checklist.",
        confirmText: "Delete Task"
      });

      if (confirmed) {
        clearLiveTicker(taskId);
        try {
          await deleteTask(uid, checklistId, taskId);
          if (typeof options.onTasksChanged === "function") {
            options.onTasksChanged();
          }
        } catch (err) {
          if (typeof window.showToast === "function") {
            window.showToast(err.message, "error");
          }
        }
      }
    });
  });

  // Inline Title Rename Flow
  listEl.querySelectorAll(".task-title-text").forEach((span) => {
    span.addEventListener("click", () => {
      const taskId = span.getAttribute("data-id");
      const input = listEl.querySelector(`.task-rename-input[data-id="${taskId}"]`);
      if (!input) return;

      span.classList.add("hidden");
      input.classList.remove("hidden");
      input.focus();
      input.select();

      const saveRename = async () => {
        const newTitle = input.value.trim();
        span.classList.remove("hidden");
        input.classList.add("hidden");

        if (newTitle && newTitle !== span.textContent.trim()) {
          span.textContent = newTitle;
          try {
            await updateTask(uid, checklistId, taskId, { title: newTitle });
          } catch (err) {
            if (typeof window.showToast === "function") {
              window.showToast(err.message, "error");
            }
          }
        }
      };

      input.addEventListener("blur", saveRename, { once: true });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
        } else if (e.key === "Escape") {
          input.value = span.textContent.trim();
          span.classList.remove("hidden");
          input.classList.add("hidden");
        }
      });
    });
  });

  // Reorder Up Button
  listEl.querySelectorAll(".reorder-up-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.getAttribute("data-index"));
      if (index <= 0) return;

      const newOrderTasks = [...tasks];
      const temp = newOrderTasks[index];
      newOrderTasks[index] = newOrderTasks[index - 1];
      newOrderTasks[index - 1] = temp;

      const payload = newOrderTasks.map((t, idx) => ({ id: t.id, order: idx }));
      try {
        await reorderTasks(uid, checklistId, payload);
      } catch (err) {
        if (typeof window.showToast === "function") {
          window.showToast(err.message, "error");
        }
      }
    });
  });

  // Reorder Down Button
  listEl.querySelectorAll(".reorder-down-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.getAttribute("data-index"));
      if (index >= tasks.length - 1) return;

      const newOrderTasks = [...tasks];
      const temp = newOrderTasks[index];
      newOrderTasks[index] = newOrderTasks[index + 1];
      newOrderTasks[index + 1] = temp;

      const payload = newOrderTasks.map((t, idx) => ({ id: t.id, order: idx }));
      try {
        await reorderTasks(uid, checklistId, payload);
      } catch (err) {
        if (typeof window.showToast === "function") {
          window.showToast(err.message, "error");
        }
      }
    });
  });
}

export default renderChecklistDetail;
