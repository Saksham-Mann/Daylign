/**
 * @file app.js
 * @description Single Page Application (SPA) entry point, hash router,
 * and orchestrator for Daylign. Integrates Google & Email authentication,
 * circular profile avatar & dropdown menu, Light/Dark mode theme switcher with Sun/Moon icon,
 * modal coordinators, and the Daily Reset Engine.
 */

import {
  auth,
  onAuthStateChange,
  getCurrentUser,
  getUserId,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signInAnonymouslyUser,
  getUseGooglePhotoPreference,
  setUseGooglePhotoPreference,
  signOutUser
} from "./auth.js";

import { runResetEngine } from "./resetEngine.js";

import {
  openCategoryModal,
  openChecklistModal,
  openChecklistSettingsModal,
  showConfirmModal,
  initModalBackdrops
} from "./modals.js";

import { renderHome } from "./views/home.js";
import { renderHub } from "./views/hub.js";
import { renderNotes } from "./views/notes.js";
import { renderCategoryDetail } from "./views/categoryDetail.js";
import { renderChecklistDetail } from "./views/checklistDetail.js";
import { renderNotFoundView } from "./views/errorStates.js";

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
   DARK / LIGHT THEME ENGINE
   ========================================================================== */

/**
 * Get the current active theme ("dark" | "light")
 */
export function getCurrentTheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Set the application theme and persist in localStorage
 * 
 * @param {"light"|"dark"} theme 
 */
export function setTheme(theme) {
  const isDark = theme === "dark";
  if (isDark) {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
  }
  localStorage.setItem("daylign-theme", theme);

  // Update theme switch UI elements if mounted
  updateThemeSwitchUI(isDark);
}

/**
 * Toggle between light and dark themes
 */
export function toggleTheme() {
  const newTheme = getCurrentTheme() === "dark" ? "light" : "dark";
  setTheme(newTheme);
  return newTheme;
}

/**
 * Synchronize dropdown theme toggle switch state
 */
function updateThemeSwitchUI(isDark) {
  const toggleIcon = document.getElementById("theme-switch-icon");
  const toggleCheckbox = document.getElementById("theme-toggle-checkbox");
  const toggleText = document.getElementById("theme-switch-label");

  if (toggleIcon) {
    toggleIcon.textContent = isDark ? "dark_mode" : "light_mode";
    toggleIcon.className = `material-symbols-outlined text-lg transition-transform duration-300 ${
      isDark ? "text-indigo-400 rotate-0" : "text-amber-500 rotate-180"
    }`;
  }
  if (toggleCheckbox) {
    toggleCheckbox.checked = isDark;
  }
  if (toggleText) {
    toggleText.textContent = isDark ? "Dark Mode" : "Light Mode";
  }
}

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
    info: "bg-slate-800 dark:bg-slate-700 text-white",
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white"
  }[type] || "bg-slate-800 text-white";

  const iconName = {
    info: "info",
    success: "check_circle",
    error: "error"
  }[type] || "info";

  toast.className = `${bgStyles} pointer-events-auto px-4 py-2.5 rounded-2xl text-xs font-medium shadow-lg flex items-center gap-2 transform transition-all duration-200 translate-y-2 opacity-0`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <span class="material-symbols-outlined text-base">${iconName}</span>
    <span>${escapeHtml(message)}</span>
    <button type="button" class="ml-auto opacity-70 hover:opacity-100 p-0.5 rounded focus:outline-none" aria-label="Dismiss">
      <span class="material-symbols-outlined text-sm">close</span>
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

export function renderBreadcrumbs(crumbs = []) {
  if (!breadcrumbLinks) return;
  const items = [{ label: "Home", href: "#/" }, ...crumbs];

  breadcrumbLinks.innerHTML = items.map((crumb, idx) => {
    const isLast = idx === items.length - 1;
    if (isLast || !crumb.href) {
      return `<span class="font-semibold text-slate-800 dark:text-slate-200" aria-current="page">${escapeHtml(crumb.label)}</span>`;
    }
    return `
      <a href="${crumb.href}" class="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded">${escapeHtml(crumb.label)}</a>
      <span class="text-slate-300 dark:text-slate-700" aria-hidden="true">/</span>
    `;
  }).join("");
}

/* ==========================================================================
   AUTH / SIGN-IN VIEW RENDERER (Google, Email, Guest)
   ========================================================================== */

function renderAuthView() {
  cleanupCurrentView();
  renderBreadcrumbs([{ label: "Sign In" }]);

  appRoot.innerHTML = `
    <section class="max-w-md mx-auto py-10 px-6 sm:px-8 bg-surface dark:bg-[#131B2E] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm" aria-labelledby="auth-heading">
      <div class="text-center mb-8">
        <div class="w-13 h-13 rounded-2xl bg-lavender-bg dark:bg-indigo-950/60 text-lavender-accent flex items-center justify-center mx-auto mb-3 shadow-sm">
          <span class="material-symbols-outlined text-3xl text-indigo-500 dark:text-indigo-400">task_alt</span>
        </div>
        <h1 id="auth-heading" class="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Welcome to Daylign</h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Calm, unified habit & activity alignment</p>
      </div>

      <!-- Google Sign In Button -->
      <button type="button" id="auth-google-btn" class="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-3 focus:ring-2 focus:ring-indigo-500">
        <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
        </svg>
        <span>Continue with Google</span>
      </button>

      <div class="relative my-6 text-center">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200 dark:border-slate-800"></div></div>
        <span class="relative bg-surface dark:bg-[#131B2E] px-3 text-[11px] text-slate-400 font-medium uppercase tracking-wider">Or continue with email</span>
      </div>

      <!-- Email Tabs -->
      <div class="flex border-b border-slate-200 dark:border-slate-800 mb-6">
        <button type="button" id="auth-tab-signin" class="flex-1 pb-3 text-xs font-semibold border-b-2 border-lavender-accent text-slate-800 dark:text-slate-100 transition-colors">Sign In</button>
        <button type="button" id="auth-tab-signup" class="flex-1 pb-3 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Create Account</button>
      </div>

      <form id="auth-form" class="space-y-4">
        <div>
          <label for="auth-email" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Email</label>
          <input type="email" id="auth-email" required placeholder="you@domain.com" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-lavender-accent focus:ring-1 focus:ring-lavender-accent" />
        </div>
        <div>
          <label for="auth-password" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Password</label>
          <div class="relative">
            <input type="password" id="auth-password" required minlength="6" placeholder="••••••••" class="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-lavender-accent focus:ring-1 focus:ring-lavender-accent" />
            <button type="button" id="auth-toggle-pwd-btn" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-lavender flex items-center justify-center" aria-label="Toggle password visibility">
              <span class="material-symbols-outlined text-lg" id="auth-pwd-icon">visibility</span>
            </button>
          </div>
        </div>
        <button type="submit" id="auth-submit-btn" class="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white shadow-sm transition-all mt-2 focus:ring-2 focus:ring-slate-800">Sign In</button>
      </form>

      <div class="relative my-6 text-center">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200 dark:border-slate-800"></div></div>
        <span class="relative bg-surface dark:bg-[#131B2E] px-3 text-[11px] text-slate-400 font-medium uppercase tracking-wider">Or explore as guest</span>
      </div>

      <button type="button" id="auth-anonymous-btn" class="w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-base text-slate-500 dark:text-slate-400">person</span>
        Continue as Guest (Anonymous)
      </button>
    </section>
  `;

  let isSignUpMode = false;
  const tabSignIn = document.getElementById("auth-tab-signin");
  const tabSignUp = document.getElementById("auth-tab-signup");
  const submitBtn = document.getElementById("auth-submit-btn");
  const authForm = document.getElementById("auth-form");
  const googleBtn = document.getElementById("auth-google-btn");
  const anonBtn = document.getElementById("auth-anonymous-btn");
  const togglePwdBtn = document.getElementById("auth-toggle-pwd-btn");
  const pwdInput = document.getElementById("auth-password");
  const pwdIcon = document.getElementById("auth-pwd-icon");

  // Password Visibility Toggle
  togglePwdBtn?.addEventListener("click", () => {
    if (!pwdInput) return;
    const isPassword = pwdInput.type === "password";
    pwdInput.type = isPassword ? "text" : "password";
    if (pwdIcon) {
      pwdIcon.textContent = isPassword ? "visibility_off" : "visibility";
    }
  });

  // Google Sign In
  googleBtn?.addEventListener("click", async () => {
    googleBtn.disabled = true;
    try {
      const userCredential = await signInWithGoogle();
      showToast("Signed in with Google", "success");
      
      // If user has a Google photoURL and hasn't set preference yet, prompt them
      const user = userCredential.user;
      if (user.photoURL) {
        promptGooglePhotoUsage(user);
      }
      window.location.hash = "#/";
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      googleBtn.disabled = false;
    }
  });

  tabSignIn?.addEventListener("click", () => {
    isSignUpMode = false;
    tabSignIn.className = "flex-1 pb-3 text-xs font-semibold border-b-2 border-lavender-accent text-slate-800 dark:text-slate-100 transition-colors";
    tabSignUp.className = "flex-1 pb-3 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors";
    submitBtn.textContent = "Sign In";
  });

  tabSignUp?.addEventListener("click", () => {
    isSignUpMode = true;
    tabSignUp.className = "flex-1 pb-3 text-xs font-semibold border-b-2 border-lavender-accent text-slate-800 dark:text-slate-100 transition-colors";
    tabSignIn.className = "flex-1 pb-3 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors";
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
    const originalText = anonBtn.innerHTML;
    anonBtn.innerHTML = `<span class="material-symbols-outlined text-base animate-spin">progress_activity</span> Connecting...`;
    
    try {
      await signInAnonymouslyUser();
      showToast("Signed in as Guest", "success");
      window.location.hash = "#/";
    } catch (err) {
      console.warn("[Auth] Guest sign-in note:", err.code, err.message);
      const isProviderDisabled = err.code === "auth/admin-restricted-operation" || 
                                 err.code === "auth/operation-not-allowed" || 
                                 (err.message && err.message.includes("not enabled"));
      if (isProviderDisabled) {
        const helpModal = document.getElementById("guest-help-modal");
        const closeBtn = document.getElementById("guest-help-close-btn");
        if (helpModal) {
          closeBtn.onclick = () => helpModal.close();
          helpModal.showModal();
        } else {
          showToast("Please enable 'Anonymous' in Firebase Console > Authentication > Sign-in method.", "error", 6000);
        }
      } else {
        showToast(err.message || "Failed to sign in as guest", "error");
      }
    } finally {
      anonBtn.disabled = false;
      anonBtn.innerHTML = originalText;
    }
  });
}

/* ==========================================================================
   GOOGLE PHOTO PROMPT DIALOG
   ========================================================================== */

function promptGooglePhotoUsage(user) {
  const modal = document.getElementById("google-photo-prompt-modal");
  if (!modal || !user?.photoURL) return;

  const alreadyAsked = localStorage.getItem(`daylign_photo_prompt_shown_${user.uid}`);
  if (alreadyAsked) return;

  const preview = document.getElementById("google-photo-prompt-preview");
  if (preview) {
    preview.innerHTML = `<img src="${user.photoURL}" alt="Google Profile" class="w-full h-full object-cover" referrerpolicy="no-referrer" />`;
  }

  const yesBtn = document.getElementById("google-photo-prompt-yes-btn");
  const noBtn = document.getElementById("google-photo-prompt-no-btn");

  const cleanup = () => {
    localStorage.setItem(`daylign_photo_prompt_shown_${user.uid}`, "true");
    modal.close();
  };

  yesBtn.onclick = () => {
    setUseGooglePhotoPreference(user.uid, true);
    cleanup();
    updateUserUI(user);
    showToast("Profile picture updated from Google", "success");
  };

  noBtn.onclick = () => {
    setUseGooglePhotoPreference(user.uid, false);
    cleanup();
    updateUserUI(user);
  };

  modal.showModal();
}

/* ==========================================================================
   USER PROFILE HEADER CONTROLLER (Circular Avatar & Dropdown)
   ========================================================================== */

function updateUserUI(user) {
  if (!userControls) return;

  if (!user) {
    userControls.innerHTML = `
      <a href="#/login" class="px-4 py-1.5 rounded-full text-xs font-semibold bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white transition-all shadow-sm focus:ring-2 focus:ring-indigo-500">
        Sign In
      </a>
    `;
    return;
  }

  const isGuest = user.isAnonymous;
  const isGoogle = user.providerData?.some((p) => p.providerId === "google.com") || Boolean(user.photoURL);
  const displayName = user.displayName || (isGuest ? "Guest" : (user.email ? user.email.split("@")[0] : "User"));
  const userInitial = displayName.charAt(0).toUpperCase();

  // Strict check: Only show photo if user has a photoURL AND preference is enabled (not toggled off)
  const useGooglePhoto = Boolean(user.photoURL) && getUseGooglePhotoPreference(user.uid);
  const isDark = getCurrentTheme() === "dark";

  userControls.innerHTML = `
    <!-- Circular Profile Button -->
    <button type="button" id="user-avatar-btn" class="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 p-0.5" aria-expanded="false" aria-haspopup="true" aria-label="Open user menu for ${escapeHtml(displayName)}">
      <div id="header-avatar-circle" class="w-9 h-9 rounded-full overflow-hidden border-2 border-slate-200 dark:border-slate-700 group-hover:border-indigo-400 dark:group-hover:border-indigo-400 transition-all flex items-center justify-center bg-lavender-bg dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-sm shadow-sm">
        ${
          useGooglePhoto
            ? `<img src="${user.photoURL}" alt="${escapeHtml(displayName)}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />`
            : `<span>${userInitial}</span>`
        }
      </div>
      <!-- Online Badge -->
      <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${isGuest ? "bg-amber-400" : "bg-emerald-500"} border-2 border-white dark:border-[#131B2E]" aria-hidden="true"></span>
    </button>

    <!-- Floating Dropdown Menu -->
    <div id="user-dropdown-menu" class="dropdown-menu hidden absolute right-0 top-12 z-50 w-64 rounded-2xl bg-surface dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-dropdown p-2" role="menu" aria-orientation="vertical">
      
      <!-- User Info Header -->
      <div class="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <div id="dropdown-avatar-circle" class="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center bg-lavender-bg dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-base flex-shrink-0">
          ${
            useGooglePhoto
              ? `<img src="${user.photoURL}" alt="${escapeHtml(displayName)}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />`
              : `<span>${userInitial}</span>`
          }
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(displayName)}</p>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(user.email || (isGuest ? "Guest Session" : ""))}</p>
          <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${
            isGoogle ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300" : isGuest ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          }">
            ${isGoogle ? "Google Account" : isGuest ? "Guest User" : "Email Account"}
          </span>
        </div>
      </div>

      <!-- Menu Items -->
      <div class="py-1 space-y-0.5">
        
        <!-- 1. Profile Option -->
        <button type="button" id="dropdown-profile-btn" class="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors" role="menuitem">
          <span class="material-symbols-outlined text-base text-slate-400 dark:text-slate-500">account_circle</span>
          <span>Profile & Account</span>
        </button>

        <!-- 2. Appearance Theme Toggle (Sun changing to Moon) -->
        <div class="px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" id="theme-toggle-row">
          <div class="flex items-center gap-2.5">
            <span id="theme-switch-icon" class="material-symbols-outlined text-lg ${isDark ? "text-indigo-400" : "text-amber-500"}">
              ${isDark ? "dark_mode" : "light_mode"}
            </span>
            <span id="theme-switch-label">${isDark ? "Dark Mode" : "Light Mode"}</span>
          </div>
          
          <label class="relative inline-flex items-center cursor-pointer pointer-events-none">
            <input type="checkbox" id="theme-toggle-checkbox" class="sr-only peer" ${isDark ? "checked" : ""} />
            <div class="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

      </div>

      <!-- Divider & Sign Out -->
      <div class="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800">
        <button type="button" id="dropdown-signout-btn" class="w-full px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2.5 transition-colors" role="menuitem">
          <span class="material-symbols-outlined text-base">logout</span>
          <span>Sign Out</span>
        </button>
      </div>

    </div>
  `;

  // Wire Dropdown Toggle
  const avatarBtn = document.getElementById("user-avatar-btn");
  const dropdownMenu = document.getElementById("user-dropdown-menu");

  const toggleDropdown = (show) => {
    const isHidden = dropdownMenu?.classList.contains("hidden");
    const shouldShow = show !== undefined ? show : isHidden;
    if (shouldShow) {
      dropdownMenu?.classList.remove("hidden");
      avatarBtn?.setAttribute("aria-expanded", "true");
    } else {
      dropdownMenu?.classList.add("hidden");
      avatarBtn?.setAttribute("aria-expanded", "false");
    }
  };

  avatarBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Click outside to close dropdown
  const handleOutsideClick = (e) => {
    if (!userControls.contains(e.target)) {
      toggleDropdown(false);
    }
  };
  document.addEventListener("click", handleOutsideClick);

  // Profile Modal Button
  document.getElementById("dropdown-profile-btn")?.addEventListener("click", () => {
    toggleDropdown(false);
    openProfileModal(user);
  });

  // Theme Switcher Click
  document.getElementById("theme-toggle-row")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTheme();
  });

  // Sign Out Button
  document.getElementById("dropdown-signout-btn")?.addEventListener("click", async () => {
    toggleDropdown(false);
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
   PROFILE MODAL COORDINATOR
   ========================================================================== */

function openProfileModal(user) {
  const modal = document.getElementById("profile-modal");
  if (!modal) return;

  const isGuest = user.isAnonymous;
  const isGoogle = user.providerData?.some((p) => p.providerId === "google.com") || Boolean(user.photoURL);
  const displayName = user.displayName || (isGuest ? "Guest User" : (user.email ? user.email.split("@")[0] : "User"));
  const useGooglePhoto = Boolean(user.photoURL) && getUseGooglePhotoPreference(user.uid);

  const avatarContainer = document.getElementById("profile-modal-avatar-container");
  const nameEl = document.getElementById("profile-modal-name");
  const emailEl = document.getElementById("profile-modal-email");
  const badgeEl = document.getElementById("profile-modal-provider-badge");
  const uidText = document.getElementById("profile-uid-text");
  const copyBtn = document.getElementById("profile-copy-uid-btn");
  const googlePhotoRow = document.getElementById("google-photo-preference-row");
  const googlePhotoToggle = document.getElementById("profile-google-photo-toggle");
  const doneBtn = document.getElementById("profile-modal-done-btn");
  const closeBtn = document.getElementById("profile-modal-close-btn");

  const renderModalAvatar = (showPhoto) => {
    if (!avatarContainer) return;
    avatarContainer.innerHTML = `
      <div class="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-200 dark:border-indigo-800 flex items-center justify-center bg-lavender-bg dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-xl shadow-sm">
        ${
          showPhoto && user.photoURL
            ? `<img src="${user.photoURL}" alt="${escapeHtml(displayName)}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />`
            : `<span>${displayName.charAt(0).toUpperCase()}</span>`
        }
      </div>
    `;
  };

  renderModalAvatar(useGooglePhoto);

  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email || (isGuest ? "Temporary Guest Session" : "No email linked");
  if (badgeEl) badgeEl.textContent = isGoogle ? "Google Account" : isGuest ? "Guest Account" : "Email & Password";
  if (uidText) uidText.value = user.uid;

  // Show Google Photo Toggle if user has a Google photo
  if (googlePhotoRow && user.photoURL) {
    googlePhotoRow.classList.remove("hidden");
    if (googlePhotoToggle) {
      googlePhotoToggle.checked = getUseGooglePhotoPreference(user.uid);
      googlePhotoToggle.onchange = () => {
        const isChecked = googlePhotoToggle.checked;
        setUseGooglePhotoPreference(user.uid, isChecked);
        renderModalAvatar(isChecked);
        updateUserUI(user);
        showToast(isChecked ? "Google profile photo enabled" : "Google profile photo hidden (using initials)", "info");
      };
    }
  } else if (googlePhotoRow) {
    googlePhotoRow.classList.add("hidden");
  }

  copyBtn.onclick = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(user.uid);
      } else {
        uidText?.select();
        document.execCommand("copy");
      }
      copyBtn.innerHTML = `
        <span class="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400">check</span>
        <span class="text-emerald-600 dark:text-emerald-400 font-semibold">Copied!</span>
      `;
      showToast("User ID copied to clipboard", "success");
      setTimeout(() => {
        copyBtn.innerHTML = `
          <span class="material-symbols-outlined text-sm">content_copy</span>
          Copy
        `;
      }, 2000);
    } catch (err) {
      console.error("[Profile] Copy failed:", err);
      showToast("Failed to copy ID automatically. Please select and copy manually.", "error");
    }
  };

  doneBtn.onclick = () => modal.close();
  closeBtn.onclick = () => modal.close();

  modal.showModal();
}

/* ==========================================================================
   HEADER NAVIGATION HIGHLIGHT
   ========================================================================== */

function updateNavHighlight(hash) {
  const homeLink = document.getElementById("nav-link-home");
  const activitiesLink = document.getElementById("nav-link-activities");
  const notesLink = document.getElementById("nav-link-notes");

  const activeClass = "nav-item px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm flex items-center gap-1.5 transition-all";
  const inactiveClass = "nav-item px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-all";

  const isHome = hash === "#/" || hash === "#/home" || hash === "" || hash === "#";
  const isActivities = hash.startsWith("#/activities") || hash.startsWith("#/hub") || hash.startsWith("#/category") || hash.startsWith("#/checklist");
  const isNotes = hash.startsWith("#/notes");

  if (homeLink) homeLink.className = isHome ? activeClass : inactiveClass;
  if (activitiesLink) activitiesLink.className = isActivities ? activeClass : inactiveClass;
  if (notesLink) notesLink.className = isNotes ? activeClass : inactiveClass;
}

/* ==========================================================================
   SPA HASH ROUTER
   ========================================================================== */

async function router() {
  const hash = window.location.hash || "#/";
  viewState.currentRoute = hash;

  const user = getCurrentUser();
  const headerNav = document.getElementById("header-nav");

  // Route Guard: Unauthenticated users redirected to #/login
  if (!user && hash !== "#/login") {
    if (headerNav) headerNav.classList.add("hidden");
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
    if (headerNav) headerNav.classList.add("hidden");
    renderAuthView();
    return;
  }

  if (headerNav) {
    headerNav.classList.remove("hidden");
  }
  updateNavHighlight(hash);

  // 2. Homescreen Dashboard View (#/ or #/home)
  if (hash === "#/" || hash === "#/home" || hash === "") {
    cleanupCurrentView();
    renderBreadcrumbs();
    viewState.activeCleanup = renderHome(appRoot, user.uid);
    return;
  }

  // 3. Activities / Category Hub View (#/activities or #/hub)
  if (hash === "#/activities" || hash === "#/hub") {
    cleanupCurrentView();
    renderBreadcrumbs();
    viewState.activeCleanup = renderHub(appRoot, user.uid);
    return;
  }

  // 4. Sticky Notes View (#/notes)
  if (hash === "#/notes") {
    cleanupCurrentView();
    renderBreadcrumbs();
    viewState.activeCleanup = renderNotes(appRoot, user.uid);
    return;
  }

  // 5. Category Detail View
  const categoryMatch = hash.match(/^#\/category\/([^/?]+)/);
  if (categoryMatch) {
    const categoryId = categoryMatch[1];
    cleanupCurrentView();
    viewState.activeCleanup = await renderCategoryDetail(appRoot, user.uid, categoryId, renderBreadcrumbs);
    return;
  }

  // 6. Checklist Detail View
  const checklistMatch = hash.match(/^#\/checklist\/([^/?]+)/);
  if (checklistMatch) {
    const checklistId = checklistMatch[1];
    cleanupCurrentView();
    viewState.activeCleanup = await renderChecklistDetail(appRoot, user.uid, checklistId, renderBreadcrumbs);
    return;
  }

  // 7. Fallback -> In-app 404 Not Found View
  cleanupCurrentView();
  renderBreadcrumbs([{ label: "404 Not Found" }]);
  renderNotFoundView(appRoot);
}

/* ==========================================================================
   APP BOOTSTRAP
   ========================================================================== */

function bootstrap() {
  // Initialize modal backdrops and dismissal handlers
  initModalBackdrops();

  if (currentDateText) {
    const today = new Date();
    currentDateText.textContent = today.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
  }

  // Network Connectivity Watcher
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
      // Execute Daily Reset Engine on boot post-auth
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

  // Trigger daily reset on visibility change
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

  // Mobile Navigation Drawer Coordinator
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileDrawer = document.getElementById("mobile-nav-drawer");
  const mobileCloseBtn = document.getElementById("mobile-nav-close-btn");

  if (mobileMenuBtn && mobileDrawer) {
    mobileMenuBtn.addEventListener("click", () => {
      mobileDrawer.showModal();
      mobileMenuBtn.setAttribute("aria-expanded", "true");
    });

    mobileCloseBtn?.addEventListener("click", () => {
      mobileDrawer.close();
      mobileMenuBtn.setAttribute("aria-expanded", "false");
    });

    // Close drawer when any mobile nav link is clicked
    mobileDrawer.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mobileDrawer.close();
        mobileMenuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Scroll Progress Indicator & Scroll-to-Top Button
  const progressBar = document.getElementById("scroll-progress-bar");
  const scrollToTopBtn = document.getElementById("scroll-to-top-btn");

  window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    
    // Update scroll progress bar
    if (progressBar && scrollHeight > 0) {
      const scrollPercent = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
      progressBar.style.width = `${scrollPercent}%`;
    }

    // Toggle scroll-to-top button visibility (show after 250px)
    if (scrollToTopBtn) {
      if (scrollTop > 250) {
        scrollToTopBtn.classList.remove("opacity-0", "pointer-events-none", "translate-y-3");
        scrollToTopBtn.classList.add("opacity-100", "translate-y-0");
      } else {
        scrollToTopBtn.classList.add("opacity-0", "pointer-events-none", "translate-y-3");
        scrollToTopBtn.classList.remove("opacity-100", "translate-y-0");
      }
    }
  }, { passive: true });

  if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Cookie Consent Banner Initialization
  const cookieBanner = document.getElementById("cookie-consent-banner");
  const cookieAcceptBtn = document.getElementById("cookie-accept-btn");
  const COOKIE_KEY = "daylign-cookie-consent";

  if (cookieBanner && cookieAcceptBtn) {
    if (!localStorage.getItem(COOKIE_KEY)) {
      cookieBanner.classList.remove("hidden");
    }

    cookieAcceptBtn.addEventListener("click", () => {
      localStorage.setItem(COOKIE_KEY, "accepted");
      cookieBanner.classList.add("hidden");
      showToast("Preferences saved", "info", 2000);
    });
  }
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
  showToast,
  setTheme,
  toggleTheme,
  getCurrentTheme
};
