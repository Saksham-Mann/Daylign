/**
 * @file views/notes.js
 * @description Sticky Notes Board View for Daylign.
 * Allows users to create, view, edit, search, and pin/star important notes
 * with pastel themes and real-time Firestore persistence.
 */

import {
  subscribeNotes,
  deleteNote,
  toggleNoteImportant
} from "../db.js";
import { openNoteModal, showConfirmModal } from "../modals.js";
import { renderSectionError } from "./errorStates.js";

// Pastel color palette configuration for sticky notes
const NOTE_THEMES = {
  butter: {
    bg: "bg-amber-100/90 dark:bg-[#2A2312]",
    border: "border-amber-300/80 dark:border-amber-800/80",
    text: "text-amber-950 dark:text-amber-100",
    muted: "text-amber-800/70 dark:text-amber-300/70",
    accent: "bg-amber-400"
  },
  peach: {
    bg: "bg-rose-100/90 dark:bg-[#2D161D]",
    border: "border-rose-300/80 dark:border-rose-800/80",
    text: "text-rose-950 dark:text-rose-100",
    muted: "text-rose-800/70 dark:text-rose-300/70",
    accent: "bg-rose-400"
  },
  mint: {
    bg: "bg-emerald-100/90 dark:bg-[#122A20]",
    border: "border-emerald-300/80 dark:border-emerald-800/80",
    text: "text-emerald-950 dark:text-emerald-100",
    muted: "text-emerald-800/70 dark:text-emerald-300/70",
    accent: "bg-emerald-400"
  },
  sky: {
    bg: "bg-sky-100/90 dark:bg-[#102434]",
    border: "border-sky-300/80 dark:border-sky-800/80",
    text: "text-sky-950 dark:text-sky-100",
    muted: "text-sky-800/70 dark:text-sky-300/70",
    accent: "bg-sky-400"
  },
  lavender: {
    bg: "bg-indigo-100/90 dark:bg-[#1C1F38]",
    border: "border-indigo-300/80 dark:border-indigo-800/80",
    text: "text-indigo-950 dark:text-indigo-100",
    muted: "text-indigo-800/70 dark:text-indigo-300/70",
    accent: "bg-indigo-400"
  },
  coral: {
    bg: "bg-orange-100/90 dark:bg-[#301A0E]",
    border: "border-orange-300/80 dark:border-orange-800/80",
    text: "text-orange-950 dark:text-orange-100",
    muted: "text-orange-800/70 dark:text-orange-300/70",
    accent: "bg-orange-400"
  },
  violet: {
    bg: "bg-purple-100/90 dark:bg-[#281335]",
    border: "border-purple-300/80 dark:border-purple-800/80",
    text: "text-purple-950 dark:text-purple-100",
    muted: "text-purple-800/70 dark:text-purple-300/70",
    accent: "bg-purple-400"
  },
  teal: {
    bg: "bg-teal-100/90 dark:bg-[#0E2725]",
    border: "border-teal-300/80 dark:border-teal-800/80",
    text: "text-teal-950 dark:text-teal-100",
    muted: "text-teal-800/70 dark:text-teal-300/70",
    accent: "bg-teal-400"
  },
  sage: {
    bg: "bg-lime-100/90 dark:bg-[#1F2B0E]",
    border: "border-lime-300/80 dark:border-lime-800/80",
    text: "text-lime-950 dark:text-lime-100",
    muted: "text-lime-800/70 dark:text-lime-300/70",
    accent: "bg-lime-500"
  },
  slate: {
    bg: "bg-slate-100/90 dark:bg-[#1E293B]",
    border: "border-slate-300/80 dark:border-slate-700/80",
    text: "text-slate-900 dark:text-slate-100",
    muted: "text-slate-600 dark:text-slate-400",
    accent: "bg-slate-400"
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
 * Format timestamp into readable date
 */
function formatNoteDate(timestamp) {
  if (!timestamp) return "Recently";
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return `Today at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * Renders the Sticky Notes Board View
 * 
 * @param {HTMLElement} container - DOM container element
 * @param {string} uid - Authenticated user UID
 * @returns {() => void} Cleanup function
 */
export function renderNotes(container, uid) {
  container.innerHTML = `
    <section aria-labelledby="notes-heading" class="space-y-6">
      <!-- Notes Top Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 id="notes-heading" class="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <span class="material-symbols-outlined text-amber-500 text-3xl">sticky_note_2</span>
            Sticky Notes
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Capture quick thoughts, reminders, and ideas. Starred notes appear directly on your Homescreen.
          </p>
        </div>
        <button type="button" id="new-note-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-slate-800">
          <span class="material-symbols-outlined text-lg">add</span>
          New Note
        </button>
      </div>

      <!-- Search & Filter Controls -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface dark:bg-[#131B2E] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <!-- Search Input -->
        <div class="relative flex-1">
          <span class="material-symbols-outlined text-slate-400 text-lg absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
          <input type="text" id="notes-search-input" placeholder="Search your notes..." class="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
        </div>

        <!-- Filter Segmented Tabs -->
        <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl flex-shrink-0">
          <button type="button" id="filter-all-notes" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm transition-all">
            All (<span id="count-all-notes">0</span>)
          </button>
          <button type="button" id="filter-important-notes" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-1">
            <span class="material-symbols-outlined text-amber-500 text-sm">star</span>
            Important (<span id="count-important-notes">0</span>)
          </button>
        </div>
      </div>

      <!-- Notes Grid -->
      <div id="notes-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5" role="list">
        <div class="col-span-full py-16 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 dark:border-slate-800 border-t-amber-400"></div>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-3 font-medium">Loading sticky notes...</p>
        </div>
      </div>
    </section>
  `;

  // Bind New Note Button
  const newNoteBtn = container.querySelector("#new-note-btn");
  newNoteBtn?.addEventListener("click", () => openNoteModal(uid));

  let rawNotes = [];
  let currentFilter = "all"; // "all" | "important"
  let searchQuery = "";

  const searchInput = container.querySelector("#notes-search-input");
  const filterAllBtn = container.querySelector("#filter-all-notes");
  const filterImportantBtn = container.querySelector("#filter-important-notes");

  searchInput?.addEventListener("input", (e) => {
    searchQuery = (e.target.value || "").trim().toLowerCase();
    renderGrid();
  });

  filterAllBtn?.addEventListener("click", () => {
    currentFilter = "all";
    filterAllBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm transition-all";
    filterImportantBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-1";
    renderGrid();
  });

  filterImportantBtn?.addEventListener("click", () => {
    currentFilter = "important";
    filterImportantBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm transition-all flex items-center gap-1";
    filterAllBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all";
    renderGrid();
  });

  const renderGrid = () => {
    const grid = container.querySelector("#notes-grid");
    const countAllEl = container.querySelector("#count-all-notes");
    const countImpEl = container.querySelector("#count-important-notes");

    if (!grid) return;

    const importantNotes = rawNotes.filter((n) => n.isImportant);
    if (countAllEl) countAllEl.textContent = String(rawNotes.length);
    if (countImpEl) countImpEl.textContent = String(importantNotes.length);

    let filtered = rawNotes;
    if (currentFilter === "important") {
      filtered = importantNotes;
    }
    if (searchQuery) {
      filtered = filtered.filter((n) =>
        (n.title && n.title.toLowerCase().includes(searchQuery)) ||
        (n.content && n.content.toLowerCase().includes(searchQuery))
      );
    }

    if (rawNotes.length === 0) {
      grid.innerHTML = `
        <article class="col-span-full py-16 px-6 text-center bg-surface dark:bg-[#131B2E] rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed shadow-sm">
          <div class="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <span class="material-symbols-outlined text-3xl">sticky_note_2</span>
          </div>
          <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">No sticky notes yet</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Click <strong>+ New Note</strong> above to jot down thoughts, ideas, or reminders.
          </p>
        </article>
      `;
      return;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400 dark:text-slate-500">
          <span class="material-symbols-outlined text-3xl mb-2 text-slate-300 dark:text-slate-600">search_off</span>
          <p class="text-xs font-medium">No notes match your filter or search query.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map((note) => {
      const theme = NOTE_THEMES[note.colorToken || "butter"] || NOTE_THEMES.butter;
      const isImportant = Boolean(note.isImportant);

      return `
        <article class="group relative rounded-2xl p-5 border ${theme.bg} ${theme.border} shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between" data-note-id="${note.id}" role="listitem">
          <!-- Card Header & Star Pin -->
          <div class="flex items-start justify-between gap-2 mb-2.5">
            <button type="button" class="star-note-btn p-1 -ml-1 rounded-lg text-slate-400 hover:text-amber-500 transition-colors" data-id="${note.id}" data-important="${isImportant}" title="${isImportant ? 'Pinned to Homescreen (Click to unpin)' : 'Mark as Important & Pin to Homescreen'}">
              <span class="material-symbols-outlined text-xl ${isImportant ? 'text-amber-500 fill-current' : 'text-slate-400/80 hover:text-amber-500'}">
                ${isImportant ? 'star' : 'star_outline'}
              </span>
            </button>

            <div class="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
              <button type="button" class="edit-note-btn p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 ${theme.text} transition-colors" data-id="${note.id}" title="Edit note">
                <span class="material-symbols-outlined text-base">edit</span>
              </button>
              <button type="button" class="delete-note-btn p-1 rounded-lg hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors" data-id="${note.id}" title="Delete note">
                <span class="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          </div>

          <!-- Note Content -->
          <div class="space-y-1.5 flex-1">
            ${note.title ? `<h3 class="text-sm font-bold ${theme.text} leading-snug tracking-tight">${escapeHtml(note.title)}</h3>` : ""}
            ${note.content ? `<p class="text-xs ${theme.text} leading-relaxed whitespace-pre-wrap break-words ${note.title ? 'mt-1' : ''}">${escapeHtml(note.content)}</p>` : ""}
          </div>

          <!-- Note Footer Timestamp -->
          <div class="mt-4 pt-2.5 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-[11px] ${theme.muted}">
            <span>${formatNoteDate(note.createdAt)}</span>
            ${isImportant ? `<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300"><span class="material-symbols-outlined text-xs">push_pin</span> Pinned</span>` : ""}
          </div>
        </article>
      `;
    }).join("");

    // Wire Star / Important toggles
    grid.querySelectorAll(".star-note-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const noteId = btn.getAttribute("data-id");
        const currentImp = btn.getAttribute("data-important") === "true";
        try {
          await toggleNoteImportant(uid, noteId, !currentImp);
          if (typeof window.showToast === "function") {
            window.showToast(!currentImp ? "Note pinned to Homescreen ⭐" : "Note unpinned from Homescreen", "success");
          }
        } catch (err) {
          if (typeof window.showToast === "function") {
            window.showToast(err.message, "error");
          }
        }
      });
    });

    // Wire Edit buttons
    grid.querySelectorAll(".edit-note-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const noteId = btn.getAttribute("data-id");
        const note = rawNotes.find((n) => n.id === noteId);
        if (note) {
          openNoteModal(uid, note);
        }
      });
    });

    // Wire Delete buttons
    grid.querySelectorAll(".delete-note-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const noteId = btn.getAttribute("data-id");
        const note = rawNotes.find((n) => n.id === noteId);
        const title = note?.title || "this note";

        const confirmed = await showConfirmModal({
          title: "Delete Sticky Note",
          message: `Are you sure you want to delete "${title}"? This cannot be undone.`,
          confirmText: "Delete Note"
        });

        if (confirmed) {
          try {
            await deleteNote(uid, noteId);
            if (typeof window.showToast === "function") {
              window.showToast("Note deleted", "success");
            }
          } catch (err) {
            if (typeof window.showToast === "function") {
              window.showToast(err.message, "error");
            }
          }
        }
      });
    });
  };

  // Real-time Firestore subscription
  const unsubscribe = subscribeNotes(uid, (notes) => {
    rawNotes = notes;
    renderGrid();
  }, (err) => {
    console.error("[Notes:subscribeNotes] Error:", err);
    const grid = container.querySelector("#notes-grid");
    if (grid) {
      renderSectionError(grid, {
        title: "Could not load sticky notes",
        message: "An error occurred while syncing your notes. Please check your connection.",
        icon: "cloud_off",
        retryFn: () => {
          window.location.reload();
        }
      });
    }
  });

  return () => {
    unsubscribe();
  };
}

export default {
  renderNotes
};
