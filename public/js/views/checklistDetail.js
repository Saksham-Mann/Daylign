/**
 * @file views/checklistDetail.js
 * @description Checklist Detail View for Daylign.
 * Manages task list execution, live stopwatch start/pause, task completion logging to timeLogs,
 * inline renaming, task reordering, and integrated Chart.js analytics visualization.
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

// Pastel token styling mapping
const COLOR_SCHEMES = {
  lavender: {
    bg: "bg-lavender-bg",
    text: "text-indigo-600",
    accent: "bg-lavender-accent",
    hex: "#818CF8"
  },
  mint: {
    bg: "bg-mint-bg",
    text: "text-emerald-700",
    accent: "bg-mint-accent",
    hex: "#34D399"
  },
  peach: {
    bg: "bg-peach-bg",
    text: "text-rose-600",
    accent: "bg-peach-accent",
    hex: "#FB7185"
  },
  butter: {
    bg: "bg-butter-bg",
    text: "text-amber-700",
    accent: "bg-butter-accent",
    hex: "#FBBF24"
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
    if (typeof window.showToast === "function") {
      window.showToast("Checklist not found", "error");
    }
    window.location.hash = "#/";
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
      <div class="bg-surface p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1.5 flex-wrap">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${isDaily ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-700"}">
              ${isDaily ? "☀️ Daily Reset (00:00)" : "📌 Permanent"}
            </span>
            <span class="text-xs text-slate-400">
              in <a href="#/category/${checklist.categoryId}" class="text-indigo-600 hover:underline font-medium">${escapeHtml(categoryName)}</a>
            </span>
          </div>
          <h1 id="checklist-title-heading" class="text-2xl font-bold text-slate-800 tracking-tight">${escapeHtml(checklist.name)}</h1>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" id="checklist-settings-btn" class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5" aria-label="Checklist settings">
            <svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Settings
          </button>
          <button type="button" id="checklist-delete-btn" class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors" aria-label="Delete this checklist">
            Delete
          </button>
        </div>
      </div>

      <!-- Main Layout: Tasks List (Left) + Analytics Panel (Right/Below) -->
      <div class="grid grid-cols-1 ${graphEnabled ? "lg:grid-cols-[1fr_380px]" : ""} gap-6 items-start">
        
        <!-- Task Execution Section -->
        <section aria-labelledby="tasks-heading" class="bg-surface p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 id="tasks-heading" class="text-base font-bold text-slate-800">Tasks</h2>
            <span id="tasks-counter-badge" class="text-xs font-semibold text-slate-500">0 / 0 completed</span>
          </div>

          <!-- Add Task Input Form -->
          <form id="new-task-form" class="flex gap-2">
            <input type="text" id="task-title-input" placeholder="Add a new task..." required maxlength="120" class="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-lavender-accent focus:ring-1 focus:ring-lavender-accent transition-all" />
            <button type="submit" id="add-task-submit-btn" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 focus:ring-2 focus:ring-slate-800">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              Add
            </button>
          </form>

          <!-- Task Items List (UL/LI semantic list per Rules.md §2) -->
          <ul id="task-list-items" class="space-y-2.5 pt-1" role="list">
            <li class="py-6 text-center text-xs text-slate-400 font-medium">Loading tasks...</li>
          </ul>
        </section>

        <!-- Analytics Section (Design.md §2.4) -->
        ${graphEnabled ? `
          <section aria-label="Checklist analytics" class="bg-surface p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 class="text-base font-bold text-slate-800">Analytics</h2>
                <p class="text-[11px] text-slate-400">Completion & focus audit</p>
              </div>
              <div class="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium" role="group" aria-label="Analytics range toggle">
                <button type="button" id="btn-range-7d" class="px-2.5 py-1 rounded-md bg-white text-slate-800 shadow-sm font-semibold transition-all">7d</button>
                <button type="button" id="btn-range-30d" class="px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 transition-all">30d</button>
              </div>
            </div>

            <!-- Canvas for Chart.js -->
            <div class="relative w-full h-[220px]">
              <canvas id="checklist-analytics-canvas"></canvas>
            </div>

            <!-- Aggregate Stats Bar -->
            <div id="analytics-summary-stats" class="text-xs text-slate-500 border-t border-slate-100 pt-3 flex items-center justify-between font-medium">
              <span>Avg Active Rate: <strong id="stat-avg-rate" class="text-slate-800">0%</strong></span>
              ${timerEnabled ? `<span>Time Logged: <strong id="stat-total-time" class="text-emerald-700 font-semibold">0m</strong></span>` : ""}
            </div>
          </section>
        ` : ""}

      </div>
    </section>
  `;

  // Bind Settings Modal
  container.querySelector("#checklist-settings-btn")?.addEventListener("click", () => {
    openChecklistSettingsModal(uid, checklist, async () => {
      // Re-mount view on settings change
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

  // Analytics Chart Refresh Helper
  const refreshAnalytics = () => {
    if (!graphEnabled) return;
    const canvas = container.querySelector("#checklist-analytics-canvas");
    if (!canvas) return;

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
      btn7d.className = "px-2.5 py-1 rounded-md bg-white text-slate-800 shadow-sm font-semibold transition-all";
      btn30d.className = "px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 transition-all";
      refreshAnalytics();
    });

    btn30d?.addEventListener("click", () => {
      activeDaysRange = 30;
      btn30d.className = "px-2.5 py-1 rounded-md bg-white text-slate-800 shadow-sm font-semibold transition-all";
      btn7d.className = "px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 transition-all";
      refreshAnalytics();
    });

    // Initial Chart Render
    refreshAnalytics();
  }

  // Real-time Tasks Subscription
  let localTasks = [];
  const unsubTasks = subscribeTasks(uid, checklistId, (tasks) => {
    localTasks = tasks;
    renderTasksList(container, uid, checklistId, tasks, {
      timerEnabled,
      categoryId: checklist.categoryId,
      onTasksChanged: () => {
        refreshAnalytics();
      }
    });
    refreshAnalytics();
  });

  return () => {
    unsubTasks();
    clearAllLiveTickers();
    destroyActiveChart();
  };
}

/**
 * Render Tasks List Items with Idle, Running, and Completed states (Design.md §2.2)
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
      <li class="py-8 text-center text-xs text-slate-400 font-medium">
        No tasks yet. Type a task title above and press Add.
      </li>
    `;
    return;
  }

  // Clear running tickers before re-attaching
  clearAllLiveTickers();

  listEl.innerHTML = tasks.map((task, index) => {
    const isRunning = Boolean(task.startedAt);
    const isCompleted = Boolean(task.isCompleted);
    const accumulated = task.timeSpentSeconds || 0;

    return `
      <li class="group rounded-2xl border ${isRunning ? "border-emerald-400 bg-emerald-50/30 animate-timer-active shadow-sm" : isCompleted ? "border-slate-100 bg-slate-50/60" : "border-slate-200/80 bg-surface hover:border-slate-300 hover:shadow-subtle"} p-3.5 flex items-center justify-between gap-3 transition-all duration-200" data-task-id="${task.id}" role="listitem">
        
        <!-- Left: Checkbox + Title / Inline Edit -->
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <button type="button" class="task-checkbox-btn flex-shrink-0 w-5 h-5 rounded-lg border flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${isCompleted ? "bg-mint-accent border-mint-accent text-white animate-task-bounce" : "border-slate-300 bg-white hover:border-emerald-400"}" data-id="${task.id}" data-completed="${isCompleted}" aria-label="${isCompleted ? "Mark incomplete" : "Mark complete"}: ${escapeHtml(task.title)}">
            ${isCompleted ? `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ""}
          </button>

          <!-- Task Title or Inline Edit Form -->
          <div class="flex-1 min-w-0">
            <span class="task-title-text text-xs sm:text-sm font-medium ${isCompleted ? "line-through text-slate-400" : "text-slate-800"} truncate block cursor-pointer hover:text-indigo-600 transition-colors" data-id="${task.id}" title="Click to rename">
              ${escapeHtml(task.title)}
            </span>
            <input type="text" class="task-rename-input hidden w-full px-2 py-1 text-xs sm:text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400" value="${escapeHtml(task.title)}" data-id="${task.id}" maxlength="120" />
          </div>
        </div>

        <!-- Right: Stopwatch Controls, Reorder & Options -->
        <div class="flex items-center gap-2 flex-shrink-0">
          
          <!-- Timer Controls -->
          ${timerEnabled ? `
            <div class="flex items-center gap-1.5">
              ${isRunning ? `
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-100/70 border border-emerald-300" aria-live="polite">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span class="font-mono text-xs font-bold text-emerald-800 task-live-counter" data-id="${task.id}">
                    ${formatDuration(accumulated)}
                  </span>
                </div>
                <button type="button" class="pause-timer-btn px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors flex items-center gap-1" data-id="${task.id}" aria-label="Pause stopwatch for ${escapeHtml(task.title)}">
                  ⏸ Pause
                </button>
              ` : `
                ${accumulated > 0 ? `
                  <span class="font-mono text-[11px] ${isCompleted ? "text-emerald-700 bg-mint-bg/80 px-2 py-0.5 rounded-full font-medium" : "text-slate-400"}">
                    ${isCompleted ? `✓ ${formatDuration(accumulated)} logged` : formatDuration(accumulated)}
                  </span>
                ` : ""}
                ${!isCompleted ? `
                  <button type="button" class="start-timer-btn px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1" data-id="${task.id}" aria-label="Start stopwatch for ${escapeHtml(task.title)}">
                    ▶ Start
                  </button>
                ` : ""}
              `}
            </div>
          ` : `
            ${isCompleted ? `
              <span class="text-[11px] text-emerald-700 bg-mint-bg/80 px-2 py-0.5 rounded-full font-medium">✓ Done</span>
            ` : ""}
          `}

          <!-- Reorder Handles (Up / Down) -->
          <div class="flex items-center opacity-40 group-hover:opacity-100 transition-opacity">
            <button type="button" class="reorder-up-btn p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 disabled:opacity-20" data-id="${task.id}" data-index="${index}" ${index === 0 ? "disabled" : ""} aria-label="Move task up: ${escapeHtml(task.title)}">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
            </button>
            <button type="button" class="reorder-down-btn p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 disabled:opacity-20" data-id="${task.id}" data-index="${index}" ${index === tasks.length - 1 ? "disabled" : ""} aria-label="Move task down: ${escapeHtml(task.title)}">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>

          <!-- Delete Task Button -->
          <button type="button" class="delete-task-btn p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-50 group-hover:opacity-100 transition-all" data-id="${task.id}" aria-label="Delete task: ${escapeHtml(task.title)}">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
          // Complete with timer flow (auto-stop timer & log to timeLogs)
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
        await stopTimer(uid, checklistId, taskId, task.startedAt, task.title);
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
