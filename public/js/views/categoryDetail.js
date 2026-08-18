/**
 * @file views/categoryDetail.js
 * @description Category Detail View for Daylign.
 * Displays all checklists under a specific category, settings badges (Daily/Permanent,
 * Timer, Graph), task progress ratios, and "+ New Checklist" CTA.
 */

import {
  getCategory,
  subscribeChecklists,
  deleteChecklist
} from "../db.js";
import {
  openCategoryModal,
  openChecklistModal,
  openChecklistSettingsModal,
  showConfirmModal
} from "../modals.js";

// Pastel token mapping
const COLOR_SCHEMES = {
  lavender: {
    bg: "bg-lavender-bg",
    text: "text-indigo-600",
    accent: "bg-lavender-accent",
    border: "border-indigo-200"
  },
  mint: {
    bg: "bg-mint-bg",
    text: "text-emerald-700",
    accent: "bg-mint-accent",
    border: "border-emerald-200"
  },
  peach: {
    bg: "bg-peach-bg",
    text: "text-rose-600",
    accent: "bg-peach-accent",
    border: "border-rose-200"
  },
  butter: {
    bg: "bg-butter-bg",
    text: "text-amber-700",
    accent: "bg-butter-accent",
    border: "border-amber-200"
  }
};

/**
 * Map icon key to emoji glyph
 */
function getIconGlyph(iconKey) {
  const map = {
    "book-open": "📖",
    "briefcase": "💼",
    "heart": "💖",
    "check-circle": "✅",
    "sparkles": "✨",
    "shopping-cart": "🛒"
  };
  return map[iconKey] || "📋";
}

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
 * Renders the Category Detail View
 * 
 * @param {HTMLElement} container - DOM container element
 * @param {string} uid - Authenticated user UID
 * @param {string} categoryId - Target category ID
 * @param {Function} setBreadcrumbs - Breadcrumb updater callback
 * @returns {Promise<() => void>} Cleanup function
 */
export async function renderCategoryDetail(container, uid, categoryId, setBreadcrumbs) {
  let category = null;

  try {
    category = await getCategory(uid, categoryId);
  } catch (err) {
    console.error("[CategoryDetail] Failed to fetch category:", err);
  }

  if (!category) {
    if (typeof window.showToast === "function") {
      window.showToast("Category not found", "error");
    }
    window.location.hash = "#/";
    return () => {};
  }

  if (typeof setBreadcrumbs === "function") {
    setBreadcrumbs([{ label: category.name }]);
  }

  const scheme = COLOR_SCHEMES[category.colorToken || "lavender"] || COLOR_SCHEMES.lavender;

  container.innerHTML = `
    <section aria-labelledby="category-heading" class="space-y-6">
      <!-- Category Header Card -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl ${scheme.bg} flex items-center justify-center ${scheme.text} text-2xl shadow-sm">
            <span aria-hidden="true">${getIconGlyph(category.icon)}</span>
          </div>
          <div>
            <h1 id="category-heading" class="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">${escapeHtml(category.name)}</h1>
            <p class="text-xs text-slate-500 mt-0.5">Manage and track your checklists under this activity</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" id="edit-category-btn" class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors" aria-label="Edit category settings">
            Edit Activity
          </button>
          <button type="button" id="new-checklist-btn" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-slate-800">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
            New Checklist
          </button>
        </div>
      </div>

      <!-- Checklists Grid / List -->
      <div id="checklists-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
        <div class="col-span-full py-12 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-lavender-accent"></div>
          <p class="text-xs text-slate-400 mt-3 font-medium">Loading checklists...</p>
        </div>
      </div>
    </section>
  `;

  container.querySelector("#edit-category-btn")?.addEventListener("click", () => {
    openCategoryModal(uid, category, async () => {
      // Re-fetch and re-render header on update
      const updated = await getCategory(uid, categoryId);
      if (updated) {
        category = updated;
        const heading = container.querySelector("#category-heading");
        if (heading) heading.textContent = updated.name;
        if (typeof setBreadcrumbs === "function") {
          setBreadcrumbs([{ label: updated.name }]);
        }
      }
    });
  });

  container.querySelector("#new-checklist-btn")?.addEventListener("click", () => {
    openChecklistModal(uid, categoryId, (newId) => {
      window.location.hash = `#/checklist/${newId}`;
    });
  });

  let checklists = [];

  const updateUI = () => {
    const grid = container.querySelector("#checklists-grid");
    if (!grid) return;

    if (checklists.length === 0) {
      grid.innerHTML = `
        <article class="col-span-full py-16 px-6 text-center bg-surface rounded-2xl border border-slate-100 border-dashed shadow-sm" role="listitem">
          <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <h2 class="text-base font-bold text-slate-800">No checklists in this activity yet</h2>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
            Create a daily recurring habit checklist or a permanent task list to get started.
          </p>
          <button type="button" id="empty-create-checklist-btn" class="mt-4 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-all">
            Create Checklist
          </button>
        </article>
      `;
      grid.querySelector("#empty-create-checklist-btn")?.addEventListener("click", () => {
        openChecklistModal(uid, categoryId, (newId) => {
          window.location.hash = `#/checklist/${newId}`;
        });
      });
      return;
    }

    grid.innerHTML = checklists.map((ch) => {
      const isDaily = ch.settings?.resetMode === "daily";
      const hasTimer = ch.settings?.timerEnabled !== false;
      const hasGraph = ch.settings?.graphEnabled !== false;
      const taskCount = ch.taskCount || 0;
      const completedCount = ch.completedCount || 0;
      const pct = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;

      return `
        <article class="group rounded-2xl bg-surface p-5 border border-slate-100 shadow-sm hover:shadow-card-hover transition-all duration-200 cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender" data-checklist-id="${ch.id}" role="listitem" tabindex="0" aria-label="Checklist: ${escapeHtml(ch.name)}, ${completedCount} of ${taskCount} completed">
          <div>
            <!-- Settings Pills & Actions -->
            <div class="flex items-start justify-between gap-2 mb-3">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${isDaily ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-700"}">
                  ${isDaily ? "☀️ Daily Reset" : "📌 Permanent"}
                </span>
                ${hasTimer ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-mint-bg text-emerald-800" title="Stopwatch Timer Enabled">⏱️ Timer</span>` : ""}
                ${hasGraph ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-lavender-bg text-indigo-800" title="Analytics Graph Enabled">📊 Analytics</span>` : ""}
              </div>

              <div class="flex items-center gap-1">
                <button type="button" class="checklist-settings-btn p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" data-id="${ch.id}" aria-label="Open settings for checklist ${escapeHtml(ch.name)}">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button type="button" class="checklist-delete-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" data-id="${ch.id}" aria-label="Delete checklist ${escapeHtml(ch.name)}">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Title & Progress Count -->
            <h2 class="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">${escapeHtml(ch.name)}</h2>
            <p class="text-xs text-slate-500 mt-1">${completedCount} of ${taskCount} task${taskCount === 1 ? "" : "s"} completed (${pct}%)</p>
          </div>

          <!-- Progress Bar & Link -->
          <div class="mt-5 pt-3 border-t border-slate-50 flex items-center justify-between">
            <div class="flex-1 mr-3 h-1.5 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full ${scheme.accent} rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
            <span class="text-xs font-semibold text-slate-700 flex items-center gap-1 group-hover:text-indigo-600 transition-colors">
              Open
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </span>
          </div>
        </article>
      `;
    }).join("");

    // Wire Card Click & Keyboard Navigation
    grid.querySelectorAll("article[data-checklist-id]").forEach((card) => {
      const navigate = (e) => {
        if (e.target.closest("button")) return;
        const chId = card.getAttribute("data-checklist-id");
        if (chId) window.location.hash = `#/checklist/${chId}`;
      };

      card.addEventListener("click", navigate);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(e);
        }
      });
    });

    // Wire Settings Button
    grid.querySelectorAll(".checklist-settings-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const checklist = checklists.find((c) => c.id === id);
        if (checklist) {
          openChecklistSettingsModal(uid, checklist);
        }
      });
    });

    // Wire Delete Button
    grid.querySelectorAll(".checklist-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const checklist = checklists.find((c) => c.id === id);
        if (!checklist) return;

        const confirmed = await showConfirmModal({
          title: `Delete "${checklist.name}"?`,
          message: "This will permanently delete this checklist and all its tasks.",
          confirmText: "Delete Checklist"
        });

        if (confirmed) {
          try {
            await deleteChecklist(uid, id);
            if (typeof window.showToast === "function") {
              window.showToast(`Deleted checklist "${checklist.name}"`, "info");
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

  const unsub = subscribeChecklists(uid, categoryId, (items) => {
    checklists = items;
    updateUI();
  });

  return () => {
    unsub();
  };
}

export default renderCategoryDetail;
