/**
 * @file auth.js
 * @description Firebase Authentication wrapper module for Daylign.
 * Handles user sessions, email/password authentication, anonymous guest sign-in,
 * auth state observers, and permission guards.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  signOut,
  connectAuthEmulator
} from "firebase/auth";

/**
 * Dynamic Firebase Configuration.
 * Loads from window.__FIREBASE_CONFIG__ (injected via .env / env.js)
 * or falls back to standard environment parameters.
 */
const envConfig = window.__FIREBASE_CONFIG__ || {};

export const firebaseConfig = {
  apiKey: envConfig.apiKey || window.__FIREBASE_API_KEY__ || "",
  authDomain: envConfig.authDomain || window.__FIREBASE_AUTH_DOMAIN__ || "",
  projectId: envConfig.projectId || window.__FIREBASE_PROJECT_ID__ || "",
  storageBucket: envConfig.storageBucket || window.__FIREBASE_STORAGE_BUCKET__ || "",
  messagingSenderId: envConfig.messagingSenderId || window.__FIREBASE_MESSAGING_SENDER_ID__ || "",
  appId: envConfig.appId || window.__FIREBASE_APP_ID__ || "",
  measurementId: envConfig.measurementId || window.__FIREBASE_MEASUREMENT_ID__ || ""
};

/**
 * Initialize Firebase App singleton
 */
let appInstance;
try {
  appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.warn("[Auth] Firebase app initialization note:", error.message);
  appInstance = initializeApp(firebaseConfig);
}

/**
 * Firebase Auth Instance
 */
export const auth = getAuth(appInstance);

// Google Auth Provider instance
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Optional: Enable Auth Emulator if running on localhost with emulator flag
if (window.location.hostname === "localhost" && window.__USE_FIREBASE_EMULATOR__) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    console.info("[Auth] Connected to local Firebase Auth emulator (port 9099)");
  } catch (err) {
    console.warn("[Auth] Could not connect to Auth emulator:", err.message);
  }
}

/**
 * Cached current user reference
 * @type {import('firebase/auth').User | null}
 */
let currentUser = null;

/**
 * Listen to auth state changes and invoke subscriber callbacks.
 * 
 * @param {(user: import('firebase/auth').User | null) => void} callback - State change handler
 * @returns {() => void} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (typeof callback === "function") {
      callback(user);
    }
  });
}

/**
 * Get currently authenticated user
 * @returns {import('firebase/auth').User | null}
 */
export function getCurrentUser() {
  return currentUser || auth.currentUser;
}

/**
 * Retrieve the current user's Firebase Auth JWT ID Token for backend API calls.
 * 
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<string|null>}
 */
export async function getIdToken(forceRefresh = false) {
  const user = getCurrentUser();
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (error) {
    console.warn("[Auth] Error fetching ID token:", error.message);
    return null;
  }
}

/**
 * Get current user UID safely
 * @returns {string | null}
 */
export function getUserId() {
  const user = getCurrentUser();
  return user ? user.uid : null;
}

/**
 * Require an authenticated user session.
 * Throws an error if no user is currently authenticated.
 * 
 * @returns {import('firebase/auth').User}
 * @throws {Error} If user is not authenticated
 */
export function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    throw new Error("Authentication required. Please sign in to perform this action.");
  }
  return user;
}

/**
 * Sign in with Google Popup
 * 
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithGoogle() {
  try {
    const userCredential = await signInWithPopup(auth, googleProvider);
    currentUser = userCredential.user;
    return userCredential;
  } catch (error) {
    console.error("[Auth] Google sign in error:", error.code, error.message);
    throw normalizeAuthError(error);
  }
}

/**
 * Sign in with Email and Password
 * 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithEmail(email, password) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    currentUser = userCredential.user;
    return userCredential;
  } catch (error) {
    console.error("[Auth] Sign in error:", error.code, error.message);
    throw normalizeAuthError(error);
  }
}

/**
 * Register/Sign up with Email and Password
 * 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signUpWithEmail(email, password) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    currentUser = userCredential.user;
    return userCredential;
  } catch (error) {
    console.error("[Auth] Sign up error:", error.code, error.message);
    throw normalizeAuthError(error);
  }
}

/**
 * Sign in anonymously for frictionless guest onboarding
 * 
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInAnonymouslyUser() {
  try {
    const userCredential = await signInAnonymously(auth);
    currentUser = userCredential.user;
    return userCredential;
  } catch (error) {
    console.error("[Auth] Anonymous sign in error:", error.code, error.message);
    throw normalizeAuthError(error);
  }
}

/**
 * Update user's profile display name or photo
 * 
 * @param {{ displayName?: string, photoURL?: string }} profileData 
 */
export async function updateUserProfile(profileData) {
  const user = requireAuth();
  try {
    await updateProfile(user, profileData);
    currentUser = auth.currentUser;
    return currentUser;
  } catch (error) {
    console.error("[Auth] Error updating profile:", error);
    throw normalizeAuthError(error);
  }
}

/**
 * Check if the user has opted to use their Google photo.
 * Defaults to true if no explicit preference has been saved yet.
 * 
 * @param {string} uid 
 * @returns {boolean}
 */
export function getUseGooglePhotoPreference(uid) {
  if (!uid) return true;
  const val = localStorage.getItem(`daylign_use_google_photo_${uid}`);
  if (val === null) return true;
  return val === "true";
}

/**
 * Set user preference for using Google photo
 * 
 * @param {string} uid 
 * @param {boolean} useGooglePhoto 
 */
export function setUseGooglePhotoPreference(uid, useGooglePhoto) {
  if (!uid) return;
  localStorage.setItem(`daylign_use_google_photo_${uid}`, String(Boolean(useGooglePhoto)));
}

/**
 * Sign out the current user session
 * 
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  try {
    await signOut(auth);
    currentUser = null;
  } catch (error) {
    console.error("[Auth] Sign out error:", error.message);
    throw error;
  }
}

/**
 * Convert Firebase auth error codes into friendly human-readable strings
 * 
 * @param {Error & { code?: string }} error 
 * @returns {Error}
 */
function normalizeAuthError(error) {
  let message = error.message;
  switch (error.code) {
    case "auth/popup-closed-by-user":
      message = "Sign in popup was closed before completing.";
      break;
    case "auth/popup-blocked":
      message = "Popup was blocked by browser. Please allow popups for Daylign.";
      break;
    case "auth/invalid-email":
      message = "Please enter a valid email address.";
      break;
    case "auth/user-disabled":
      message = "This account has been disabled.";
      break;
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      message = "Invalid email or password combination.";
      break;
    case "auth/email-already-in-use":
      message = "An account with this email already exists.";
      break;
    case "auth/weak-password":
      message = "Password is too weak. Choose at least 6 characters.";
      break;
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      message = "This sign-in provider is not enabled in Firebase Console (Enable in Authentication > Sign-in method).";
      break;
    case "auth/network-request-failed":
      message = "Network error. Please check your internet connection.";
      break;
    default:
      break;
  }
  const customError = new Error(message);
  customError.code = error.code;
  return customError;
}

export default {
  auth,
  onAuthStateChange,
  getCurrentUser,
  getUserId,
  requireAuth,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signInAnonymouslyUser,
  updateUserProfile,
  getUseGooglePhotoPreference,
  setUseGooglePhotoPreference,
  signOutUser
};
