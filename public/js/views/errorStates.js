/**
 * @file views/errorStates.js
 * @description Reusable error state UI components for Daylign.
 * Implements the 3-part error UX standard:
 *   1. What happened
 *   2. Why it happened (without leaking internals)
 *   3. A clear next step (retry button, navigation CTA)
 *
 * Used for component-level graceful degradation and in-app error routes.
 */

/**
 * Escape HTML to prevent XSS in error messages
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
 * Render a component-level inline error state with retry button.
 * Designed to be placed inside a section that failed to load, without
 * crashing the rest of the page.
 *
 * @param {HTMLElement} container - Target DOM element
 * @param {Object} options
 * @param {string} [options.title="Failed to load"] - What happened
 * @param {string} [options.message="Something went wrong loading this section."] - Why
 * @param {string} [options.icon="error"] - Material icon name
 * @param {Function} [options.retryFn] - Retry callback (renders Retry button if provided)
 * @param {string} [options.retryLabel="Try Again"] - Retry button text
 */
export function renderSectionError(container, options = {}) {
  const {
    title = "Failed to load",
    message = "Something went wrong loading this section. This may be a temporary issue.",
    icon = "error",
    retryFn = null,
    retryLabel = "Try Again"
  } = options;

  const retryId = `retry-btn-${Date.now()}`;

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center py-10 px-6 text-center bg-surface dark:bg-[#131B2E] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm" role="alert">
      <div class="w-12 h-12 rounded-2xl bg-peach-bg dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 flex items-center justify-center mb-4 shadow-sm">
        <span class="material-symbols-outlined text-2xl">${escapeHtml(icon)}</span>
      </div>
      <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">${escapeHtml(title)}</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed mb-4">${escapeHtml(message)}</p>
      ${retryFn ? `
        <button type="button" id="${retryId}" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white shadow-sm transition-all focus:ring-2 focus:ring-indigo-500">
          <span class="material-symbols-outlined text-sm">refresh</span>
          ${escapeHtml(retryLabel)}
        </button>
      ` : ""}
    </div>
  `;

  if (retryFn) {
    document.getElementById(retryId)?.addEventListener("click", retryFn);
  }
}

/**
 * Render an in-app 404 "Not Found" view for unmatched hash routes.
 * Follows the 3-part error UX standard.
 *
 * @param {HTMLElement} container - Target DOM element
 */
export function renderNotFoundView(container) {
  container.innerHTML = `
    <section class="flex flex-col items-center justify-center py-16 px-6 text-center" aria-labelledby="not-found-heading">
      <!-- Badge -->
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lavender-bg dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-6">
        <span class="w-2 h-2 rounded-full bg-lavender-accent animate-pulse" aria-hidden="true"></span>
        Error 404
      </div>

      <!-- Large number with icon overlay -->
      <div class="relative mb-6">
        <span class="text-7xl sm:text-8xl font-black text-slate-100 dark:text-slate-800/50 tracking-tighter select-none" aria-hidden="true">404</span>
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-14 h-14 rounded-2xl bg-lavender-bg dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm border border-indigo-100 dark:border-indigo-900/40">
            <span class="material-symbols-outlined text-3xl">search_off</span>
          </div>
        </div>
      </div>

      <!-- What happened -->
      <h1 id="not-found-heading" class="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-2">Page Not Found</h1>

      <!-- Why -->
      <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm leading-relaxed">
        The page you're looking for doesn't exist or the URL may be incorrect. Check the address and try again.
      </p>

      <!-- Next steps -->
      <div class="flex flex-col sm:flex-row gap-3">
        <a href="#/" class="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-indigo-500">
          <span class="material-symbols-outlined text-base">home</span>
          Go to Home
        </a>
        <a href="#/activities" class="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-base">category</span>
          View Activities
        </a>
      </div>
    </section>
  `;
}

/**
 * Render an in-app 403 "Forbidden" view for permission errors.
 *
 * @param {HTMLElement} container - Target DOM element
 * @param {string} [reason] - Optional reason to display
 */
export function renderForbiddenView(container, reason) {
  container.innerHTML = `
    <section class="flex flex-col items-center justify-center py-16 px-6 text-center" aria-labelledby="forbidden-heading">
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-peach-bg dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-xs font-semibold mb-6">
        <span class="w-2 h-2 rounded-full bg-peach-accent animate-pulse" aria-hidden="true"></span>
        Access Denied
      </div>

      <div class="w-14 h-14 rounded-2xl bg-peach-bg dark:bg-rose-950/60 text-rose-500 dark:text-rose-400 flex items-center justify-center mb-6 shadow-sm border border-rose-100 dark:border-rose-900/40">
        <span class="material-symbols-outlined text-3xl">lock</span>
      </div>

      <h1 id="forbidden-heading" class="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-2">Permission Required</h1>

      <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm leading-relaxed">
        ${reason ? escapeHtml(reason) : "You don't have permission to access this resource. Please sign in with the correct account."}
      </p>

      <div class="flex flex-col sm:flex-row gap-3">
        <a href="#/login" class="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-indigo-500">
          <span class="material-symbols-outlined text-base">login</span>
          Sign In
        </a>
        <a href="#/" class="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-base">home</span>
          Go to Home
        </a>
      </div>
    </section>
  `;
}

/**
 * Render a lightweight empty state for sections with no data.
 *
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {string} [options.icon="inbox"] - Material icon name
 * @param {string} [options.title="Nothing here yet"]
 * @param {string} [options.message=""]
 */
export function renderEmptyState(container, options = {}) {
  const {
    icon = "inbox",
    title = "Nothing here yet",
    message = ""
  } = options;

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center py-10 px-6 text-center" role="status">
      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-3">
        <span class="material-symbols-outlined text-xl">${escapeHtml(icon)}</span>
      </div>
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">${escapeHtml(title)}</p>
      ${message ? `<p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">${escapeHtml(message)}</p>` : ""}
    </div>
  `;
}

export default {
  renderSectionError,
  renderNotFoundView,
  renderForbiddenView,
  renderEmptyState
};
