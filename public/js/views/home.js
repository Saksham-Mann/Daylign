/**
 * @file views/home.js
 * @description Homescreen Dashboard View for Daylign.
 * Features:
 * 1. Overview greeting with quick metric stats.
 * 2. Real-time Live Running Task Timers with live ticking stopwatch, pause, and complete actions.
 * 3. Important Sticky Notes pinned board with unpin/edit/delete.
 * 4. Active Categories & Activities grid with progress bars and quick creation.
 */

import {
  subscribeCategories,
  subscribeAllChecklists,
  subscribeNotes,
  subscribeRunningTasks,
  toggleNoteImportant,
  deleteNote
} from "../db.js";

import {
  formatDuration,
  calculateCurrentElapsed,
  stopTimer,
  completeTaskWithTimer
} from "../timer.js";

import {
  openCategoryModal,
  openNoteModal,
  openStickyNotePad,
  showConfirmModal
} from "../modals.js";
import { renderSectionError } from "./errorStates.js";

// Pastel token mapping
const COLOR_SCHEMES = {
  lavender: {
    bg: "bg-lavender-bg dark:bg-indigo-950/60",
    text: "text-indigo-600 dark:text-indigo-300",
    accent: "bg-lavender-accent",
    border: "border-indigo-200 dark:border-indigo-900/60",
    hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-700"
  },
  mint: {
    bg: "bg-mint-bg dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    accent: "bg-mint-accent",
    border: "border-emerald-200 dark:border-emerald-900/60",
    hoverBorder: "hover:border-emerald-300 dark:hover:border-emerald-700"
  },
  peach: {
    bg: "bg-peach-bg dark:bg-rose-950/60",
    text: "text-rose-600 dark:text-rose-300",
    accent: "bg-peach-accent",
    border: "border-rose-200 dark:border-rose-900/60",
    hoverBorder: "hover:border-rose-300 dark:hover:border-rose-700"
  },
  butter: {
    bg: "bg-butter-bg dark:bg-amber-950/60",
    text: "text-amber-700 dark:text-amber-300",
    accent: "bg-butter-accent",
    border: "border-amber-200 dark:border-amber-900/60",
    hoverBorder: "hover:border-amber-300 dark:hover:border-amber-700"
  },
  sky: {
    bg: "bg-sky-bg dark:bg-sky-950/60",
    text: "text-sky-600 dark:text-sky-300",
    accent: "bg-sky-accent",
    border: "border-sky-200 dark:border-sky-900/60",
    hoverBorder: "hover:border-sky-300 dark:hover:border-sky-700"
  },
  violet: {
    bg: "bg-violet-bg dark:bg-purple-950/60",
    text: "text-purple-600 dark:text-purple-300",
    accent: "bg-violet-accent",
    border: "border-purple-200 dark:border-purple-900/60",
    hoverBorder: "hover:border-purple-300 dark:hover:border-purple-700"
  },
  coral: {
    bg: "bg-coral-bg dark:bg-orange-950/60",
    text: "text-orange-600 dark:text-orange-300",
    accent: "bg-coral-accent",
    border: "border-orange-200 dark:border-orange-900/60",
    hoverBorder: "hover:border-orange-300 dark:hover:border-orange-700"
  },
  teal: {
    bg: "bg-teal-bg dark:bg-teal-950/60",
    text: "text-teal-600 dark:text-teal-300",
    accent: "bg-teal-accent",
    border: "border-teal-200 dark:border-teal-900/60",
    hoverBorder: "hover:border-teal-300 dark:hover:border-teal-700"
  },
  sage: {
    bg: "bg-sage-bg dark:bg-lime-950/60",
    text: "text-lime-700 dark:text-lime-300",
    accent: "bg-sage-accent",
    border: "border-lime-200 dark:border-lime-900/60",
    hoverBorder: "hover:border-lime-300 dark:hover:border-lime-700"
  },
  slate: {
    bg: "bg-slate-bg dark:bg-slate-900/60",
    text: "text-slate-600 dark:text-slate-300",
    accent: "bg-slate-accent",
    border: "border-slate-300 dark:border-slate-700",
    hoverBorder: "hover:border-slate-400 dark:hover:border-slate-600"
  }
};

const NOTE_THEMES = {
  butter: {
    bg: "bg-amber-100/90 dark:bg-[#2A2312]",
    border: "border-amber-300/80 dark:border-amber-800/80",
    text: "text-amber-950 dark:text-amber-100",
    muted: "text-amber-800/70 dark:text-amber-300/70"
  },
  peach: {
    bg: "bg-rose-100/90 dark:bg-[#2D161D]",
    border: "border-rose-300/80 dark:border-rose-800/80",
    text: "text-rose-950 dark:text-rose-100",
    muted: "text-rose-800/70 dark:text-rose-300/70"
  },
  mint: {
    bg: "bg-emerald-100/90 dark:bg-[#122A20]",
    border: "border-emerald-300/80 dark:border-emerald-800/80",
    text: "text-emerald-950 dark:text-emerald-100",
    muted: "text-emerald-800/70 dark:text-emerald-300/70"
  },
  sky: {
    bg: "bg-sky-100/90 dark:bg-[#102434]",
    border: "border-sky-300/80 dark:border-sky-800/80",
    text: "text-sky-950 dark:text-sky-100",
    muted: "text-sky-800/70 dark:text-sky-300/70"
  },
  lavender: {
    bg: "bg-indigo-100/90 dark:bg-[#1C1F38]",
    border: "border-indigo-300/80 dark:border-indigo-800/80",
    text: "text-indigo-950 dark:text-indigo-100",
    muted: "text-indigo-800/70 dark:text-indigo-300/70"
  },
  coral: {
    bg: "bg-orange-100/90 dark:bg-[#301A0E]",
    border: "border-orange-300/80 dark:border-orange-800/80",
    text: "text-orange-950 dark:text-orange-100",
    muted: "text-orange-800/70 dark:text-orange-300/70"
  },
  violet: {
    bg: "bg-purple-100/90 dark:bg-[#281335]",
    border: "border-purple-300/80 dark:border-purple-800/80",
    text: "text-purple-950 dark:text-purple-100",
    muted: "text-purple-800/70 dark:text-purple-300/70"
  },
  teal: {
    bg: "bg-teal-100/90 dark:bg-[#0E2725]",
    border: "border-teal-300/80 dark:border-teal-800/80",
    text: "text-teal-950 dark:text-teal-100",
    muted: "text-teal-800/70 dark:text-teal-300/70"
  },
  sage: {
    bg: "bg-lime-100/90 dark:bg-[#1F2B0E]",
    border: "border-lime-300/80 dark:border-lime-800/80",
    text: "text-lime-950 dark:text-lime-100",
    muted: "text-lime-800/70 dark:text-lime-300/70"
  },
  slate: {
    bg: "bg-slate-100/90 dark:bg-[#1E293B]",
    border: "border-slate-300/80 dark:border-slate-700/80",
    text: "text-slate-900 dark:text-slate-100",
    muted: "text-slate-600 dark:text-slate-400"
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
 * Renders the Homescreen Dashboard View
 * 
 * @param {HTMLElement} container - DOM container element
 * @param {string} uid - Authenticated user UID
 * @returns {() => void} Cleanup function
 */
export function renderHome(container, uid) {
  container.innerHTML = `
    <section class="space-y-8" aria-labelledby="home-heading">
      <!-- 1. Top Welcome Banner & Quick Metric Badges -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent dark:from-indigo-950/30 dark:via-purple-950/20 p-4.5 sm:p-7 rounded-2xl sm:rounded-3xl border border-indigo-100 dark:border-indigo-900/40 shadow-sm">
        <div>
          <h1 id="home-heading" class="text-xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Today's Focus & Activities
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time hub for live focus sessions, pinned notes, and active routines.
          </p>
        </div>

        <!-- Quick Metric Badges -->
        <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div class="flex-1 min-w-[95px] sm:flex-initial px-3 sm:px-3.5 py-2 rounded-2xl bg-surface dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-1.5 sm:gap-2">
            <span class="material-symbols-outlined text-emerald-500 text-base">timer</span>
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              <strong id="home-stat-timers" class="text-emerald-600 dark:text-emerald-400">0</strong> Active Timers
            </span>
          </div>

          <div class="flex-1 min-w-[95px] sm:flex-initial px-3 sm:px-3.5 py-2 rounded-2xl bg-surface dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-1.5 sm:gap-2">
            <span class="material-symbols-outlined material-symbols-filled text-amber-500 text-base" style="font-variation-settings: 'FILL' 1;">star</span>
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              <strong id="home-stat-notes" class="text-amber-600 dark:text-amber-400">0</strong> Pinned Notes
            </span>
          </div>

          <div class="flex-1 min-w-[95px] sm:flex-initial px-3 sm:px-3.5 py-2 rounded-2xl bg-surface dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-1.5 sm:gap-2">
            <span class="material-symbols-outlined text-indigo-500 text-base">task_alt</span>
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              <strong id="home-stat-tasks" class="text-indigo-600 dark:text-indigo-400">0%</strong> Done Today
            </span>
          </div>
        </div>
      </div>

      <!-- 2. Live Running Timers Section -->
      <div class="space-y-3.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-emerald-500 text-xl">timer</span>
            <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Active Timers & Focus</h2>
          </div>
          <span id="active-timers-count-badge" class="text-xs font-semibold text-slate-400 dark:text-slate-500">0 active</span>
        </div>

        <div id="home-timers-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="col-span-full py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Checking running timers...
          </div>
        </div>
      </div>

      <!-- 3. Pinned Important Notes Section -->
      <div class="space-y-3.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined material-symbols-filled text-amber-500 text-xl" style="font-variation-settings: 'FILL' 1;">star</span>
            <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Important Notes</h2>
          </div>
          <a href="#/notes" class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            View all notes
            <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </a>
        </div>

        <div id="home-notes-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div class="col-span-full py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Loading important notes...
          </div>
        </div>
      </div>

      <!-- 4. Active Activities Section -->
      <div class="space-y-3.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-indigo-500 text-xl">category</span>
            <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Active Activities</h2>
          </div>
          <a href="#/activities" class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            All activities
            <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </a>
        </div>

        <div id="home-categories-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <div class="col-span-full py-8 text-center text-xs text-slate-400 dark:text-slate-500">
            Loading your activities...
          </div>
        </div>
      </div>
    </section>
  `;

  let categories = [];
  let checklists = [];
  let importantNotes = [];
  let runningTasks = [];
  let timerIntervals = new Map(); // taskId -> intervalId

  const clearTimerIntervals = () => {
    timerIntervals.forEach((id) => clearInterval(id));
    timerIntervals.clear();
  };

  // 1. Render Running Timers
  const renderRunningTimers = () => {
    const el = container.querySelector("#home-timers-container");
    const countBadge = container.querySelector("#active-timers-count-badge");
    const statTimers = container.querySelector("#home-stat-timers");

    if (!el) return;

    clearTimerIntervals();

    if (countBadge) countBadge.textContent = `${runningTasks.length} active`;
    if (statTimers) statTimers.textContent = String(runningTasks.length);

    if (runningTasks.length === 0) {
      el.innerHTML = `
        <div class="col-span-full p-5 rounded-2xl bg-surface dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-xl">timer_off</span>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">No timers currently running</p>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Start a stopwatch on any task in your checklists to track live focus sessions here.</p>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = runningTasks.map(({ task, checklist, category }) => {
      const colorToken = category?.colorToken || "lavender";
      const scheme = COLOR_SCHEMES[colorToken] || COLOR_SCHEMES.lavender;
      const initialSeconds = calculateCurrentElapsed(task.startedAt, task.timeSpentSeconds || 0);

      return `
        <article class="relative rounded-2xl p-4 bg-surface dark:bg-[#131B2E] border-2 border-emerald-500/40 dark:border-emerald-500/30 shadow-md flex flex-col justify-between transition-all" data-task-id="${task.id}" data-checklist-id="${checklist.id}">
          <div>
            <!-- Header: Category & Checklist Badges -->
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${scheme.bg} ${scheme.text}">
                ${escapeHtml(category?.name || "Activity")}
              </span>
              <a href="#/checklist/${checklist.id}" class="text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[120px]">
                ${escapeHtml(checklist.name)}
              </a>
            </div>

            <!-- Task Title -->
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
              ${escapeHtml(task.title)}
            </h3>
          </div>

          <!-- Live Stopwatch Display & Actions -->
          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
              <span class="material-symbols-outlined text-lg text-emerald-600 dark:text-emerald-400">timer</span>
              <span id="live-timer-${task.id}">${formatDuration(initialSeconds)}</span>
            </div>

            <div class="flex items-center gap-1.5">
              <button type="button" class="home-pause-timer-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors flex items-center gap-1" data-task-id="${task.id}" data-checklist-id="${checklist.id}" data-spent="${task.timeSpentSeconds || 0}" title="Pause / Stop Stopwatch">
                <span class="material-symbols-outlined text-sm">pause</span>
                Pause
              </button>
              <button type="button" class="home-complete-task-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 shadow-sm" data-task-id="${task.id}" data-checklist-id="${checklist.id}" data-category-id="${category?.id || ''}" title="Complete Task & Save Time">
                <span class="material-symbols-outlined text-sm">check</span>
                Done
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    // Setup live ticks for each running task
    runningTasks.forEach(({ task }) => {
      const displayEl = el.querySelector(`#live-timer-${task.id}`);
      if (!displayEl) return;

      const baseSeconds = Number(task.timeSpentSeconds) || 0;
      const startMs = task.startedAt?.toDate
        ? task.startedAt.toDate().getTime()
        : (task.startedAt instanceof Date ? task.startedAt.getTime() : Number(new Date(task.startedAt)) || Date.now());

      const updateTicker = () => {
        const liveDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        const total = baseSeconds + liveDelta;
        displayEl.textContent = formatDuration(total);
      };

      updateTicker();
      const intervalId = window.setInterval(updateTicker, 1000);
      timerIntervals.set(task.id, intervalId);
    });

    // Wire Pause Timer buttons
    el.querySelectorAll(".home-pause-timer-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const taskId = btn.getAttribute("data-task-id");
        const checklistId = btn.getAttribute("data-checklist-id");
        const baseSpent = Number(btn.getAttribute("data-spent")) || 0;
        const taskObj = runningTasks.find((r) => r.task.id === taskId);

        btn.disabled = true;
        try {
          await stopTimer(uid, checklistId, taskId, taskObj?.task.startedAt, baseSpent, taskObj?.task.title);
          if (typeof window.showToast === "function") {
            window.showToast("Timer paused & time saved", "success");
          }
        } catch (err) {
          if (typeof window.showToast === "function") {
            window.showToast(err.message, "error");
          }
        }
      });
    });

    // Wire Complete Task buttons
    el.querySelectorAll(".home-complete-task-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const taskId = btn.getAttribute("data-task-id");
        const checklistId = btn.getAttribute("data-checklist-id");
        const categoryId = btn.getAttribute("data-category-id");
        const taskObj = runningTasks.find((r) => r.task.id === taskId);

        btn.disabled = true;
        try {
          await completeTaskWithTimer(uid, checklistId, taskId, {
            timerEnabled: true,
            categoryId: categoryId || "",
            startedAt: taskObj?.task.startedAt,
            taskTitle: taskObj?.task.title
          });
          if (typeof window.showToast === "function") {
            window.showToast(`Completed "${taskObj?.task.title || 'Task'}" 🎉`, "success");
          }
        } catch (err) {
          if (typeof window.showToast === "function") {
            window.showToast(err.message, "error");
          }
        }
      });
    });
  };

  // 2. Render Important Notes
  const renderImportantNotes = () => {
    const el = container.querySelector("#home-notes-container");
    const statNotes = container.querySelector("#home-stat-notes");

    if (!el) return;

    if (statNotes) statNotes.textContent = String(importantNotes.length);

    if (importantNotes.length === 0) {
      el.innerHTML = `
        <div class="col-span-full p-5 rounded-2xl bg-surface dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-xl">star</span>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">No notes marked as important yet</p>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Click the star icon on any note in the Notes page to pin it to your Homescreen.</p>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = importantNotes.map((note) => {
      const theme = NOTE_THEMES[note.colorToken || "butter"] || NOTE_THEMES.butter;

      return `
        <article class="home-note-card group relative rounded-2xl p-4 border ${theme.bg} ${theme.border} shadow-sm hover:shadow-md transition-all flex flex-col justify-between cursor-pointer select-none hover:-translate-y-0.5" data-note-id="${note.id}" role="listitem" tabindex="0" title="Click to open and edit note">
          <!-- Card Top Bar -->
          <div class="flex items-start justify-between gap-2 mb-2">
            <button type="button" class="home-unpin-note-btn p-1 -ml-1 text-amber-500 hover:text-slate-400 transition-colors" data-id="${note.id}" title="Unpin from Homescreen">
              <span class="material-symbols-outlined material-symbols-filled text-lg text-amber-500" style="font-variation-settings: 'FILL' 1;">star</span>
            </button>
            <button type="button" class="home-edit-note-btn p-1 rounded-lg opacity-60 hover:opacity-100 ${theme.text} transition-all" data-id="${note.id}" title="Open sticky note pad">
              <span class="material-symbols-outlined text-sm">edit</span>
            </button>
          </div>

          <!-- Note Body -->
          <div class="space-y-1 flex-1 pointer-events-none">
            ${note.title ? `<h3 class="text-xs font-bold ${theme.text} leading-snug tracking-tight">${escapeHtml(note.title)}</h3>` : ""}
            ${note.content ? `<p class="text-xs ${theme.text} line-clamp-4 whitespace-pre-wrap ${note.title ? 'mt-1' : ''}">${escapeHtml(note.content)}</p>` : `<p class="text-xs ${theme.muted} italic leading-relaxed mt-1">Empty note — click to type...</p>`}
          </div>

          <!-- Note Footer Pin Label -->
          <div class="mt-3 pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-[10px] ${theme.muted} pointer-events-none">
            <span>Pinned Note</span>
            <span class="material-symbols-outlined text-xs text-amber-600">push_pin</span>
          </div>
        </article>
      `;
    }).join("");

    // Wire Card Click -> Open Sticky Note Pad
    el.querySelectorAll(".home-note-card").forEach((card) => {
      card.addEventListener("click", () => {
        const noteId = card.getAttribute("data-note-id");
        const note = importantNotes.find((n) => n.id === noteId);
        if (note) openStickyNotePad(uid, note);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const noteId = card.getAttribute("data-note-id");
          const note = importantNotes.find((n) => n.id === noteId);
          if (note) openStickyNotePad(uid, note);
        }
      });
    });

    // Wire unpin (stopPropagation)
    el.querySelectorAll(".home-unpin-note-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const noteId = btn.getAttribute("data-id");
        try {
          await toggleNoteImportant(uid, noteId, false);
          if (typeof window.showToast === "function") {
            window.showToast("Note unpinned from Homescreen", "info");
          }
        } catch (err) {
          if (typeof window.showToast === "function") {
            window.showToast(err.message, "error");
          }
        }
      });
    });

    // Wire edit (stopPropagation)
    el.querySelectorAll(".home-edit-note-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const noteId = btn.getAttribute("data-id");
        const note = importantNotes.find((n) => n.id === noteId);
        if (note) openStickyNotePad(uid, note);
      });
    });
  };

  // 3. Render Active Categories
  const renderCategories = () => {
    const el = container.querySelector("#home-categories-container");
    const statTasks = container.querySelector("#home-stat-tasks");

    if (!el) return;

    const totalTasks = checklists.reduce((sum, ch) => sum + (ch.taskCount || 0), 0);
    const totalCompleted = checklists.reduce((sum, ch) => sum + (ch.completedCount || 0), 0);
    const globalPercent = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

    if (statTasks) statTasks.textContent = `${globalPercent}%`;

    if (categories.length === 0) {
      el.innerHTML = `
        <div class="col-span-full p-5 rounded-2xl bg-surface dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-xl">category</span>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">No activities created yet</p>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Create your first category in Activities to start organizing your routines.</p>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = categories.map((cat) => {
      const colorToken = cat.colorToken || "lavender";
      const scheme = COLOR_SCHEMES[colorToken] || COLOR_SCHEMES.lavender;
      const catChecklists = checklists.filter((ch) => ch.categoryId === cat.id);

      const catTasks = catChecklists.reduce((sum, ch) => sum + (ch.taskCount || 0), 0);
      const catDone = catChecklists.reduce((sum, ch) => sum + (ch.completedCount || 0), 0);
      const pct = catTasks > 0 ? Math.round((catDone / catTasks) * 100) : 0;

      return `
        <article class="group rounded-2xl bg-surface dark:bg-[#131B2E] p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-card-hover transition-all duration-200 cursor-pointer flex flex-col justify-between" data-category-id="${cat.id}" role="listitem" tabindex="0">
          <div>
            <div class="flex items-center justify-between gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl ${scheme.bg} flex items-center justify-center ${scheme.text} shadow-sm group-hover:scale-105 transition-transform">
                <span class="material-symbols-outlined text-xl">category</span>
              </div>
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${pct}%</span>
            </div>

            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              ${escapeHtml(cat.name)}
            </h3>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              ${catChecklists.length} checklist${catChecklists.length === 1 ? "" : "s"} · ${catTasks} task${catTasks === 1 ? "" : "s"}
            </p>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full ${scheme.accent} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    // Wire Category clicks
    el.querySelectorAll("article[data-category-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const catId = card.getAttribute("data-category-id");
        if (catId) window.location.hash = `#/category/${catId}`;
      });
    });
  };

  // Real-time subscriptions with component-level error isolation
  const unsubCategories = subscribeCategories(uid, (cats) => {
    categories = cats;
    renderCategories();
  }, (err) => {
    console.error("[Home:subscribeCategories] Error:", err);
    const el = container.querySelector("#home-categories-grid");
    if (el) {
      renderSectionError(el, {
        title: "Couldn't load",
        message: "An error occurred while loading activities. Please check your connection.",
        icon: "wifi_off"
      });
    }
  });

  const unsubChecklists = subscribeAllChecklists(uid, (checks) => {
    checklists = checks;
    renderCategories();
  }, (err) => {
    console.error("[Home:subscribeAllChecklists] Error:", err);
  });

  const unsubNotes = subscribeNotes(uid, (notes) => {
    importantNotes = notes.filter((n) => n.isImportant);
    renderImportantNotes();
  }, (err) => {
    console.error("[Home:subscribeNotes] Error:", err);
    const el = container.querySelector("#home-notes-grid");
    if (el) {
      renderSectionError(el, {
        title: "Couldn't load",
        message: "An error occurred while syncing your notes. Please check your connection.",
        icon: "wifi_off"
      });
    }
  });

  const unsubRunning = subscribeRunningTasks(uid, (tasks) => {
    runningTasks = tasks;
    renderRunningTimers();
  });

  return () => {
    clearTimerIntervals();
    unsubCategories();
    unsubChecklists();
    unsubNotes();
    unsubRunning();
  };
}

export default {
  renderHome
};
