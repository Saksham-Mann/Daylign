/**
 * @file views/hub.js
 * @description Category Hub View for Daylign.
 * Renders the top-level activity hub with category cards, aggregate completion
 * snapshots, pastel accent themes, Google Material Symbols icons, and dark mode support.
 */

import {
  subscribeCategories,
  subscribeAllChecklists,
  deleteCategory
} from "../db.js";
import { openCategoryModal, showConfirmModal } from "../modals.js";
import { renderSectionError } from "./errorStates.js";

// Pastel token mapping for card badges, borders and accents (Design.md §1.1)
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
 * Renders the Category Hub View
 * 
 * @param {HTMLElement} container - DOM container element
 * @param {string} uid - Authenticated user UID
 * @returns {() => void} Unsubscribe/cleanup function
 */
export function renderHub(container, uid) {
  container.innerHTML = `
    <section aria-labelledby="hub-heading" class="space-y-6">
      <!-- Hub Top Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 id="hub-heading" class="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Your Activity Hub</h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Organize your routines, study sessions, and checklists by activity.</p>
        </div>
        <button type="button" id="hub-new-category-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-slate-800">
          <span class="material-symbols-outlined text-lg">add</span>
          New Category
        </button>
      </div>

      <!-- Categories Grid Container -->
      <div id="categories-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pt-2" role="list">
        <div class="col-span-full py-16 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 dark:border-slate-800 border-t-lavender-accent"></div>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-3 font-medium">Loading your activities...</p>
        </div>
      </div>
    </section>
  `;

  // Bind New Category Button
  const newCatBtn = container.querySelector("#hub-new-category-btn");
  newCatBtn?.addEventListener("click", () => openCategoryModal(uid));

  let categories = [];
  let checklists = [];

  const updateUI = () => {
    const grid = container.querySelector("#categories-grid");
    if (!grid) return;

    if (categories.length === 0) {
      // Empty Onboarding State
      grid.innerHTML = `
        <article class="col-span-full py-16 px-6 text-center bg-surface dark:bg-[#131B2E] rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed shadow-sm" role="listitem">
          <div class="w-14 h-14 rounded-2xl bg-lavender-bg dark:bg-indigo-950/60 text-lavender-accent flex items-center justify-center mx-auto mb-4 shadow-sm">
            <span class="material-symbols-outlined text-3xl text-indigo-500 dark:text-indigo-400">category</span>
          </div>
          <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">Create your first activity</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Click <strong>+ New Category</strong> above to group your checklists into calming categories like Study, Health, Chores, or Deep Work.
          </p>
        </article>
      `;
      return;
    }

    grid.innerHTML = categories.map((cat) => {
      const colorToken = cat.colorToken || "lavender";
      const scheme = COLOR_SCHEMES[colorToken] || COLOR_SCHEMES.lavender;
      const catChecklists = checklists.filter((ch) => ch.categoryId === cat.id);

      const totalTasks = catChecklists.reduce((sum, ch) => sum + (ch.taskCount || 0), 0);
      const totalCompleted = catChecklists.reduce((sum, ch) => sum + (ch.completedCount || 0), 0);
      const progressPercent = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

      return `
        <article class="group rounded-3xl bg-surface dark:bg-[#131B2E] p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-card-hover transition-all duration-200 cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender" data-category-id="${cat.id}" role="listitem" tabindex="0" aria-label="Category: ${escapeHtml(cat.name)}, ${catChecklists.length} checklists, ${progressPercent}% completed today">
          <div>
            <!-- Card Header: Icon & Action Menu -->
            <div class="flex items-start justify-between gap-3 mb-4">
              <div class="w-12 h-12 rounded-2xl ${scheme.bg} flex items-center justify-center ${scheme.text} shadow-sm transition-transform duration-200 group-hover:scale-105">
                ${getIconSymbol(cat.icon)}
              </div>

              <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button type="button" class="edit-category-btn p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-id="${cat.id}" aria-label="Edit category: ${escapeHtml(cat.name)}">
                  <span class="material-symbols-outlined text-base">edit</span>
                </button>
                <button type="button" class="delete-category-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors" data-id="${cat.id}" aria-label="Delete category: ${escapeHtml(cat.name)}">
                  <span class="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            </div>

            <!-- Card Content -->
            <h2 class="text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${escapeHtml(cat.name)}</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ${catChecklists.length} checklist${catChecklists.length === 1 ? "" : "s"} · ${totalTasks} task${totalTasks === 1 ? "" : "s"}
            </p>
          </div>

          <!-- Card Progress Footer -->
          <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">
              <span>Today's completion</span>
              <span class="font-semibold text-slate-700 dark:text-slate-300">${progressPercent}%</span>
            </div>
            <div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full ${scheme.accent} rounded-full transition-all duration-500" style="width: ${progressPercent}%"></div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    // Wire Card Click & Keyboard activation
    grid.querySelectorAll("article[data-category-id]").forEach((card) => {
      const navigate = (e) => {
        if (e.target.closest("button")) return;
        const catId = card.getAttribute("data-category-id");
        if (catId) window.location.hash = `#/category/${catId}`;
      };

      card.addEventListener("click", navigate);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(e);
        }
      });
    });

    // Wire Edit Buttons
    grid.querySelectorAll(".edit-category-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const category = categories.find((c) => c.id === id);
        if (category) openCategoryModal(uid, category);
      });
    });

    // Wire Delete Buttons
    grid.querySelectorAll(".delete-category-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const category = categories.find((c) => c.id === id);
        if (!category) return;

        const confirmed = await showConfirmModal({
          title: `Delete "${category.name}"?`,
          message: "Deleting this category will also permanently delete all checklists and tasks within it. This action cannot be undone.",
          confirmText: "Delete Activity"
        });

        if (confirmed) {
          try {
            await deleteCategory(uid, id);
            if (typeof window.showToast === "function") {
              window.showToast(`Deleted category "${category.name}"`, "info");
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

  // Subscribe to real-time categories and checklists
  const unsubCats = subscribeCategories(uid, (cats) => {
    categories = cats;
    updateUI();
  }, (err) => {
    console.error("[Hub:subscribeCategories] Error:", err);
    const grid = container.querySelector("#categories-grid");
    if (grid) {
      renderSectionError(grid, {
        title: "Could not load activities",
        message: "An error occurred while syncing your activities. Please check your connection.",
        icon: "cloud_off",
        retryFn: () => {
          window.location.reload();
        }
      });
    }
  });

  const unsubChecklists = subscribeAllChecklists(uid, (checks) => {
    checklists = checks;
    updateUI();
  }, (err) => {
    console.error("[Hub:subscribeAllChecklists] Error:", err);
  });

  return () => {
    unsubCats();
    unsubChecklists();
  };
}

export default renderHub;
