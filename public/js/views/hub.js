/**
 * @file views/hub.js
 * @description Category Hub View for Daylign.
 * Renders the top-level activity hub with category cards, aggregate completion
 * snapshots, pastel accent themes, "+ New Category" CTA, and onboarding empty state.
 */

import {
  subscribeCategories,
  subscribeAllChecklists,
  deleteCategory
} from "../db.js";
import { openCategoryModal, showConfirmModal } from "../modals.js";

// Pastel token mapping for card badges, borders and accents (Design.md §1.1)
const COLOR_SCHEMES = {
  lavender: {
    bg: "bg-lavender-bg",
    text: "text-indigo-600",
    accent: "bg-lavender-accent",
    border: "border-indigo-200",
    hoverBorder: "hover:border-indigo-300"
  },
  mint: {
    bg: "bg-mint-bg",
    text: "text-emerald-700",
    accent: "bg-mint-accent",
    border: "border-emerald-200",
    hoverBorder: "hover:border-emerald-300"
  },
  peach: {
    bg: "bg-peach-bg",
    text: "text-rose-600",
    accent: "bg-peach-accent",
    border: "border-rose-200",
    hoverBorder: "hover:border-rose-300"
  },
  butter: {
    bg: "bg-butter-bg",
    text: "text-amber-700",
    accent: "bg-butter-accent",
    border: "border-amber-200",
    hoverBorder: "hover:border-amber-300"
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
          <h1 id="hub-heading" class="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Your Activity Hub</h1>
          <p class="text-xs sm:text-sm text-slate-500 mt-1">Organize your routines, study sessions, and checklists by activity.</p>
        </div>
        <button type="button" id="hub-new-category-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-slate-800">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Category
        </button>
      </div>

      <!-- Categories Grid Container -->
      <div id="categories-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pt-2" role="list">
        <div class="col-span-full py-16 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-lavender-accent"></div>
          <p class="text-xs text-slate-400 mt-3 font-medium">Loading your activities...</p>
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
      // Empty Onboarding State (AppFlow.md §1)
      grid.innerHTML = `
        <article class="col-span-full py-16 px-6 text-center bg-surface rounded-2xl border border-slate-100 border-dashed shadow-sm" role="listitem">
          <div class="w-14 h-14 rounded-2xl bg-lavender-bg text-lavender-accent flex items-center justify-center mx-auto mb-4 shadow-sm">
            <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 class="text-base font-bold text-slate-800">Create your first activity</h2>
          <p class="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Group your checklists into calming categories like Study, Health, Chores, or Deep Work.
          </p>
          <button type="button" id="empty-create-category-btn" class="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-all">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
            Create Category
          </button>
        </article>
      `;
      grid.querySelector("#empty-create-category-btn")?.addEventListener("click", () => openCategoryModal(uid));
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
        <article class="group rounded-2xl bg-surface p-5 border border-slate-100 shadow-sm hover:shadow-card-hover transition-all duration-200 cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender" data-category-id="${cat.id}" role="listitem" tabindex="0" aria-label="Category: ${escapeHtml(cat.name)}, ${catChecklists.length} checklists, ${progressPercent}% completed today">
          <div>
            <!-- Card Header: Icon & Action Menu -->
            <div class="flex items-start justify-between gap-3 mb-4">
              <div class="w-12 h-12 rounded-2xl ${scheme.bg} flex items-center justify-center ${scheme.text} text-xl shadow-sm transition-transform duration-200 group-hover:scale-105">
                <span aria-hidden="true">${getIconGlyph(cat.icon)}</span>
              </div>

              <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button type="button" class="edit-category-btn p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" data-id="${cat.id}" aria-label="Edit category: ${escapeHtml(cat.name)}">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button type="button" class="delete-category-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" data-id="${cat.id}" aria-label="Delete category: ${escapeHtml(cat.name)}">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Card Content -->
            <h2 class="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">${escapeHtml(cat.name)}</h2>
            <p class="text-xs text-slate-500 mt-1">
              ${catChecklists.length} checklist${catChecklists.length === 1 ? "" : "s"} · ${totalTasks} task${totalTasks === 1 ? "" : "s"}
            </p>
          </div>

          <!-- Card Progress Footer -->
          <div class="mt-6 pt-4 border-t border-slate-50">
            <div class="flex items-center justify-between text-xs text-slate-500 mb-1.5 font-medium">
              <span>Today's completion</span>
              <span class="font-semibold text-slate-700">${progressPercent}%</span>
            </div>
            <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100">
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
  });

  const unsubChecklists = subscribeAllChecklists(uid, (checks) => {
    checklists = checks;
    updateUI();
  });

  return () => {
    unsubCats();
    unsubChecklists();
  };
}

export default renderHub;
