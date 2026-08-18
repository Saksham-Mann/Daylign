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
  apiKey: envConfig.apiKey || window.__FIREBASE_API_KEY__ || "YOUR_FIREBASE_API_KEY",
  authDomain: envConfig.authDomain || window.__FIREBASE_AUTH_DOMAIN__ || "daylign-22030.firebaseapp.com",
  projectId: envConfig.projectId || window.__FIREBASE_PROJECT_ID__ || "daylign-22030",
  storageBucket: envConfig.storageBucket || window.__FIREBASE_STORAGE_BUCKET__ || "daylign-22030.firebasestorage.app",
  messagingSenderId: envConfig.messagingSenderId || window.__FIREBASE_MESSAGING_SENDER_ID__ || "1026732202958",
  appId: envConfig.appId || window.__FIREBASE_APP_ID__ || "1:1026732202958:web:504ca8ba6a15e7ce07a99f",
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
      message = "This sign-in method is not enabled in Firebase Console.";
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
  signInWithEmail,
  signUpWithEmail,
  signInAnonymouslyUser,
  signOutUser
};
