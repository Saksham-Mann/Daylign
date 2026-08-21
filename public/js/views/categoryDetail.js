/**
 * @file views/categoryDetail.js
 * @description Category Detail View for Daylign.
 * Displays all checklists under a specific category, settings badges (Daily/Permanent,
 * Timer, Graph), task progress ratios, Google Material Symbols, and dark mode styling.
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
import { renderSectionError } from "./errorStates.js";

// Pastel token mapping
const COLOR_SCHEMES = {
  lavender: {
    bg: "bg-lavender-bg dark:bg-indigo-950/60",
    text: "text-indigo-600 dark:text-indigo-300",
    accent: "bg-lavender-accent",
    border: "border-indigo-200 dark:border-indigo-900/60"
  },
  mint: {
    bg: "bg-mint-bg dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    accent: "bg-mint-accent",
    border: "border-emerald-200 dark:border-emerald-900/60"
  },
  peach: {
    bg: "bg-peach-bg dark:bg-rose-950/60",
    text: "text-rose-600 dark:text-rose-300",
    accent: "bg-peach-accent",
    border: "border-rose-200 dark:border-rose-900/60"
  },
  butter: {
    bg: "bg-butter-bg dark:bg-amber-950/60",
    text: "text-amber-700 dark:text-amber-300",
    accent: "bg-butter-accent",
    border: "border-amber-200 dark:border-amber-900/60"
  },
  sky: {
    bg: "bg-sky-bg dark:bg-sky-950/60",
    text: "text-sky-600 dark:text-sky-300",
    accent: "bg-sky-accent",
    border: "border-sky-200 dark:border-sky-900/60"
  },
  violet: {
    bg: "bg-violet-bg dark:bg-purple-950/60",
    text: "text-purple-600 dark:text-purple-300",
    accent: "bg-violet-accent",
    border: "border-purple-200 dark:border-purple-900/60"
  },
  coral: {
    bg: "bg-coral-bg dark:bg-orange-950/60",
    text: "text-orange-600 dark:text-orange-300",
    accent: "bg-coral-accent",
    border: "border-orange-200 dark:border-orange-900/60"
  },
  teal: {
    bg: "bg-teal-bg dark:bg-teal-950/60",
    text: "text-teal-600 dark:text-teal-300",
    accent: "bg-teal-accent",
    border: "border-teal-200 dark:border-teal-900/60"
  },
  sage: {
    bg: "bg-sage-bg dark:bg-lime-950/60",
    text: "text-lime-700 dark:text-lime-300",
    accent: "bg-sage-accent",
    border: "border-lime-200 dark:border-lime-900/60"
  },
  slate: {
    bg: "bg-slate-bg dark:bg-slate-900/60",
    text: "text-slate-600 dark:text-slate-300",
    accent: "bg-slate-accent",
    border: "border-slate-300 dark:border-slate-700"
  }
};

/**
 * Map icon key to Google Material Symbol
 */
function getIconSymbol(iconKey) {
  const map = {
    "book-open": "menu_book",
    "briefcase": "work",
    "heart": "favorite",
    "check-circle": "task_alt",
    "sparkles": "auto_awesome",
    "shopping-cart": "shopping_cart",
    "fitness": "fitness_center",
    "code": "code"
  };
  const iconName = map[iconKey] || "category";
  return `<span class="material-symbols-outlined text-2xl">${iconName}</span>`;
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
    if (typeof setBreadcrumbs === "function") {
      setBreadcrumbs([{ label: "Category Not Found" }]);
    }
    renderSectionError(container, {
      title: "Category Not Found",
      message: "The activity category you're looking for doesn't exist, was deleted, or you may not have permission to view it.",
      icon: "folder_off",
      retryFn: () => { window.location.hash = "#/activities"; },
      retryLabel: "Back to Activities"
    });
    return () => {};
  }

  if (typeof setBreadcrumbs === "function") {
    setBreadcrumbs([{ label: category.name }]);
  }

  const scheme = COLOR_SCHEMES[category.colorToken || "lavender"] || COLOR_SCHEMES.lavender;

  container.innerHTML = `
    <section aria-labelledby="category-heading" class="space-y-6">
      <!-- Category Header Card -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface dark:bg-[#131B2E] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl ${scheme.bg} flex items-center justify-center ${scheme.text} shadow-sm">
            ${getIconSymbol(category.icon)}
          </div>
          <div>
            <h1 id="category-heading" class="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">${escapeHtml(category.name)}</h1>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage and track your checklists under this activity</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" id="edit-category-btn" class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5" aria-label="Edit category settings">
            <span class="material-symbols-outlined text-sm">edit</span>
            Edit Activity
          </button>
          <button type="button" id="new-checklist-btn" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-slate-800">
            <span class="material-symbols-outlined text-base">add</span>
            New Checklist
          </button>
        </div>
      </div>

      <!-- Checklists Grid / List -->
      <div id="checklists-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
        <div class="col-span-full py-12 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 dark:border-slate-800 border-t-lavender-accent"></div>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-3 font-medium">Loading checklists...</p>
        </div>
      </div>
    </section>
  `;

  container.querySelector("#edit-category-btn")?.addEventListener("click", () => {
    openCategoryModal(uid, category, async () => {
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
        <article class="col-span-full py-16 px-6 text-center bg-surface dark:bg-[#131B2E] rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed shadow-sm" role="listitem">
          <div class="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-3">
            <span class="material-symbols-outlined text-2xl">checklist</span>
          </div>
          <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">No checklists in this activity yet</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Click <strong>+ New Checklist</strong> above to create a daily recurring habit checklist or a permanent task list.
          </p>
        </article>
      `;
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
        <article class="group rounded-3xl bg-surface dark:bg-[#131B2E] p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-card-hover transition-all duration-200 cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender" data-checklist-id="${ch.id}" role="listitem" tabindex="0" aria-label="Checklist: ${escapeHtml(ch.name)}, ${completedCount} of ${taskCount} completed">
          <div>
            <!-- Settings Pills & Actions -->
            <div class="flex items-start justify-between gap-2 mb-3">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                  isDaily
                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }">
                  <span class="material-symbols-outlined text-xs ${isDaily ? "text-amber-600 dark:text-amber-400" : "text-indigo-500"}">${isDaily ? "wb_sunny" : "push_pin"}</span>
                  ${isDaily ? "Daily Reset" : "Permanent"}
                </span>
                ${
                  hasTimer
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-mint-bg dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300" title="Stopwatch Timer Enabled"><span class="material-symbols-outlined text-xs">timer</span> Timer</span>`
                    : ""
                }
                ${
                  hasGraph
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-lavender-bg dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300" title="Analytics Graph Enabled"><span class="material-symbols-outlined text-xs">bar_chart</span> Analytics</span>`
                    : ""
                }
              </div>

              <div class="flex items-center gap-1">
                <button type="button" class="checklist-settings-btn p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-id="${ch.id}" aria-label="Open settings for checklist ${escapeHtml(ch.name)}">
                  <span class="material-symbols-outlined text-base">settings</span>
                </button>
                <button type="button" class="checklist-delete-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors" data-id="${ch.id}" aria-label="Delete checklist ${escapeHtml(ch.name)}">
                  <span class="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            </div>

            <!-- Title & Progress Count -->
            <h2 class="text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${escapeHtml(ch.name)}</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${completedCount} of ${taskCount} task${taskCount === 1 ? "" : "s"} completed (${pct}%)</p>
          </div>

          <!-- Progress Bar & Link -->
          <div class="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div class="flex-1 mr-3 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full ${scheme.accent} rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Open
              <span class="material-symbols-outlined text-sm">arrow_forward</span>
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
  }, (err) => {
    console.error("[CategoryDetail] Checklist subscription error:", err);
    const grid = container.querySelector("#checklists-grid");
    if (grid) {
      renderSectionError(grid, {
        title: "Couldn't load",
        message: "Couldn't fetch checklists. Please check your internet connection and try again.",
        icon: "wifi_off",
        retryFn: () => {
          window.location.reload();
        }
      });
    }
  });

  return () => {
    unsub();
  };
}

export default renderCategoryDetail;
