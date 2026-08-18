/**
 * @file app.js
 * @description Single Page Application (SPA) entry point, hash router,
 * and orchestrator for Daylign. Integrates modular views (hub, categoryDetail, checklistDetail),
 * modal handlers, authentication state, offline sync indicator, and the Daily Reset Engine.
 */

import {
  auth,
  onAuthStateChange,
  getCurrentUser,
  getUserId,
  signInWithEmail,
  signUpWithEmail,
  signInAnonymouslyUser,
  signOutUser
} from "./auth.js";

import { runResetEngine } from "./resetEngine.js";

import {
  openCategoryModal,
  openChecklistModal,
  openChecklistSettingsModal,
  showConfirmModal
} from "./modals.js";

import { renderHub } from "./views/hub.js";
import { renderCategoryDetail } from "./views/categoryDetail.js";
import { renderChecklistDetail } from "./views/checklistDetail.js";

/* ==========================================================================
   APPLICATION STATE & REFERENCES
   ========================================================================== */

const viewState = {
  currentRoute: "",
  activeCleanup: null
};

const appRoot = document.getElementById("app-root");
const breadcrumbLinks = document.getElementById("breadcrumb-links");
const userControls = document.getElementById("user-controls");
const offlineBanner = document.getElementById("offline-banner");
const currentDateText = document.getElementById("current-date-text");

/* ==========================================================================
   GLOBAL TOAST NOTIFICATION HELPER
   ========================================================================== */

/**
 * Display a non-blocking toast notification in the corner
 * 
 * @param {string} message 
 * @param {"info"|"success"|"error"} [type="info"] 
 * @param {number} [duration=3500] 
 */
export function showToast(message, type = "info", duration = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const bgStyles = {
    info: "bg-slate-800 text-white",
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white"
  }[type] || "bg-slate-800 text-white";

  toast.className = `${bgStyles} pointer-events-auto px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg flex items-center gap-2 transform transition-all duration-200 translate-y-2 opacity-0`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="ml-auto opacity-70 hover:opacity-100 p-0.5 rounded focus:outline-none" aria-label="Dismiss">
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  `;

  toast.querySelector("button")?.addEventListener("click", () => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 200);
  });

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "translate-y-2");
  });

  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => toast.remove(), 200);
    }
  }, duration);
}

// Make showToast accessible globally for modal callbacks
window.showToast = showToast;

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

/* ==========================================================================
   VIEW CLEANUP & BREADCRUMB HELPERS
   ========================================================================== */

/**
 * Clean up active route listeners, intervals, and chart instances
 */
function cleanupCurrentView() {
  if (typeof viewState.activeCleanup === "function") {
    try {
      viewState.activeCleanup();
    } catch (err) {
      console.warn("[App] Note during view cleanup:", err);
    }
    viewState.activeCleanup = null;
  }
}

/**
 * Update dynamic breadcrumbs in navigation bar
 * 
 * @param {Array<{ label: string, href?: string }>} crumbs 
 */
export function renderBreadcrumbs(crumbs = []) {
  if (!breadcrumbLinks) return;
  const items = [{ label: "Home", href: "#/" }, ...crumbs];

  breadcrumbLinks.innerHTML = items.map((crumb, idx) => {
    const isLast = idx === items.length - 1;
    if (isLast || !crumb.href) {
      return `<span class="font-semibold text-slate-800" aria-current="page">${escapeHtml(crumb.label)}</span>`;
    }
    return `
      <a href="${crumb.href}" class="text-slate-500 hover:text-slate-900 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded">${escapeHtml(crumb.label)}</a>
      <span class="text-slate-300" aria-hidden="true">/</span>
    `;
  }).join("");
}

/* ==========================================================================
   AUTH / SIGN-IN VIEW RENDERER
   ========================================================================== */

/**
 * Render Auth / Sign-in View ( #/login )
 */
function renderAuthView() {
  cleanupCurrentView();
  renderBreadcrumbs([{ label: "Sign In" }]);

  appRoot.innerHTML = `
    <section class="max-w-md mx-auto py-10 px-6 sm:px-8 bg-surface rounded-2xl border border-slate-100 shadow-sm" aria-labelledby="auth-heading">
      <div class="text-center mb-8">
        <div class="w-12 h-12 rounded-2xl bg-lavender-bg text-lavender-accent flex items-center justify-center mx-auto mb-3 shadow-sm">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h1 id="auth-heading" class="text-2xl font-bold text-slate-800 tracking-tight">Welcome to Daylign</h1>
        <p class="text-xs text-slate-500 mt-1">Calm, unified habit & activity alignment</p>
      </div>

      <div class="flex border-b border-slate-100 mb-6">
        <button type="button" id="auth-tab-signin" class="flex-1 pb-3 text-xs font-semibold border-b-2 border-lavender-accent text-slate-800 transition-colors">Sign In</button>
        <button type="button" id="auth-tab-signup" class="flex-1 pb-3 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-colors">Create Account</button>
      </div>

      <form id="auth-form" class="space-y-4">
        <div>
          <label for="auth-email" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Email</label>
          <input type="email" id="auth-email" required placeholder="you@domain.com" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-lavender-accent focus:ring-1 focus:ring-lavender-accent" />
        </div>
        <div>
          <label for="auth-password" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Password</label>
          <input type="password" id="auth-password" required minlength="6" placeholder="••••••••" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-lavender-accent focus:ring-1 focus:ring-lavender-accent" />
        </div>
        <button type="submit" id="auth-submit-btn" class="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-900 text-white shadow-sm transition-all mt-2 focus:ring-2 focus:ring-slate-800">Sign In</button>
      </form>

      <div class="relative my-6 text-center">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-100"></div></div>
        <span class="relative bg-surface px-3 text-[11px] text-slate-400 font-medium uppercase">Or explore frictionless</span>
      </div>

      <button type="button" id="auth-anonymous-btn" class="w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center justify-center gap-2">
        <svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        Continue as Guest (Anonymous)
      </button>
    </section>
  `;

  let isSignUpMode = false;
  const tabSignIn = document.getElementById("auth-tab-signin");
  const tabSignUp = document.getElementById("auth-tab-signup");
  const submitBtn = document.getElementById("auth-submit-btn");
  const authForm = document.getElementById("auth-form");
  const anonBtn = document.getElementById("auth-anonymous-btn");

  tabSignIn?.addEventListener("click", () => {
    isSignUpMode = false;
    tabSignIn.className = "flex-1 pb-3 text-xs font-semibold border-b-2 border-lavender-accent text-slate-800 transition-colors";
    tabSignUp.className = "flex-1 pb-3 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-colors";
    submitBtn.textContent = "Sign In";
  });

  tabSignUp?.addEventListener("click", () => {
    isSignUpMode = true;
    tabSignUp.className = "flex-1 pb-3 text-xs font-semibold border-b-2 border-lavender-accent text-slate-800 transition-colors";
    tabSignIn.className = "flex-1 pb-3 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-colors";
    submitBtn.textContent = "Create Account";
  });

  authForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email")?.value;
    const password = document.getElementById("auth-password")?.value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";

    try {
      if (isSignUpMode) {
        await signUpWithEmail(email, password);
        showToast("Account created successfully!", "success");
      } else {
        await signInWithEmail(email, password);
        showToast("Welcome back!", "success");
      }
      window.location.hash = "#/";
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isSignUpMode ? "Create Account" : "Sign In";
    }
  });

  anonBtn?.addEventListener("click", async () => {
    anonBtn.disabled = true;
    try {
      await signInAnonymouslyUser();
      showToast("Signed in as Guest", "success");
      window.location.hash = "#/";
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      anonBtn.disabled = false;
    }
  });
}

/* ==========================================================================
   SPA HASH ROUTER
   ========================================================================== */

/**
 * SPA Hash Router dispatcher
 */
async function router() {
  const hash = window.location.hash || "#/";
  viewState.currentRoute = hash;

  const user = getCurrentUser();

  // Route Guard: Unauthenticated users redirected to #/login
  if (!user && hash !== "#/login") {
    window.location.hash = "#/login";
    return;
  }

  // Redirect authenticated user away from #/login
  if (user && hash === "#/login") {
    window.location.hash = "#/";
    return;
  }

  // 1. Auth View
  if (hash === "#/login") {
    renderAuthView();
    return;
  }

  // 2. Category Hub View
  if (hash === "#/" || hash === "#/home") {
    cleanupCurrentView();
    renderBreadcrumbs();
    viewState.activeCleanup = renderHub(appRoot, user.uid);
    return;
  }

  // 3. Category Detail View
  const categoryMatch = hash.match(/^#\/category\/([^/?]+)/);
  if (categoryMatch) {
    const categoryId = categoryMatch[1];
    cleanupCurrentView();
    viewState.activeCleanup = await renderCategoryDetail(appRoot, user.uid, categoryId, renderBreadcrumbs);
    return;
  }

  // 4. Checklist Detail View
  const checklistMatch = hash.match(/^#\/checklist\/([^/?]+)/);
  if (checklistMatch) {
    const checklistId = checklistMatch[1];
    cleanupCurrentView();
    viewState.activeCleanup = await renderChecklistDetail(appRoot, user.uid, checklistId, renderBreadcrumbs);
    return;
  }

  // Fallback -> Hub
  cleanupCurrentView();
  renderBreadcrumbs();
  viewState.activeCleanup = renderHub(appRoot, user.uid);
}

/* ==========================================================================
   USER PROFILE HEADER CONTROLLER
   ========================================================================== */

function updateUserUI(user) {
  if (!userControls) return;

  if (!user) {
    userControls.innerHTML = `
      <a href="#/login" class="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 transition-colors shadow-sm focus:ring-2 focus:ring-slate-800">
        Sign In
      </a>
    `;
    return;
  }

  const isGuest = user.isAnonymous;
  const displayName = isGuest ? "Guest" : (user.email ? user.email.split("@")[0] : "User");

  userControls.innerHTML = `
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
        <span class="w-2 h-2 rounded-full ${isGuest ? "bg-amber-400" : "bg-emerald-400"}" aria-hidden="true"></span>
        <span class="truncate max-w-[120px]">${escapeHtml(displayName)}</span>
      </div>
      <button type="button" id="header-signout-btn" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Sign Out" aria-label="Sign Out">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
      </button>
    </div>
  `;

  document.getElementById("header-signout-btn")?.addEventListener("click", async () => {
    try {
      await signOutUser();
      showToast("Signed out", "info");
      window.location.hash = "#/login";
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

/* ==========================================================================
   APP BOOTSTRAP
   ========================================================================== */

function bootstrap() {
  if (currentDateText) {
    const today = new Date();
    currentDateText.textContent = today.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
  }

  // Network Connectivity Watcher (TechSpec.md §5)
  const updateNetworkStatus = () => {
    if (!offlineBanner) return;
    if (navigator.onLine) {
      offlineBanner.classList.add("hidden");
    } else {
      offlineBanner.classList.remove("hidden");
    }
  };
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  updateNetworkStatus();

  // Register Auth Observer
  onAuthStateChange(async (user) => {
    updateUserUI(user);

    if (user) {
      // Execute Daily Reset Engine on boot post-auth (AppFlow.md §5)
      try {
        await runResetEngine(user.uid);
      } catch (err) {
        console.warn("[ResetEngine] Initial reset check note:", err.message);
      }
    }

    router();
  });

  // Listen to hash changes for routing
  window.addEventListener("hashchange", router);

  // Trigger daily reset on visibility change (handles tab left open across midnight boundary)
  document.addEventListener("visibilitychange", async () => {
    const user = getCurrentUser();
    if (document.visibilityState === "visible" && user) {
      try {
        await runResetEngine(user.uid);
      } catch (err) {
        console.warn("[ResetEngine] Visibility reset check note:", err.message);
      }
    }
  });
}

// Start application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}

export default {
  bootstrap,
  router,
  showToast
};
