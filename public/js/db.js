/**
 * @file db.js
 * @description Firestore typed database access layer for Daylign.
 * Implements the user-scoped schema:
 *   - users/{uid}/categories/{categoryId}
 *   - users/{uid}/checklists/{checklistId}
 *   - users/{uid}/checklists/{checklistId}/tasks/{taskId}
 *   - users/{uid}/timeLogs/{timeLogId} (append-only)
 * 
 * Supports both explicit (uid, ...) parameter signatures and ambient auth resolution.
 * Includes atomic count maintenance, cascading deletes, stopwatch/logging logic,
 * and the transaction-guarded Daily Reset Engine.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
  runTransaction,
  connectFirestoreEmulator
} from "firebase/firestore";
import { auth, getUserId, requireAuth, firebaseConfig } from "./auth.js";

// Ensure app instance is initialized
const appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Initialize Firestore with multi-tab offline persistence enabled
 */
let dbInstance;
try {
  dbInstance = initializeFirestore(appInstance, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (err) {
  console.info("[DB] Defaulting to getFirestore instance:", err.message);
  dbInstance = getFirestore(appInstance);
}

export const db = dbInstance;

// Optional: Connect to local Firestore emulator if flagged
if (window.location.hostname === "localhost" && window.__USE_FIREBASE_EMULATOR__) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    console.info("[DB] Connected to local Firestore emulator (port 8080)");
  } catch (err) {
    console.warn("[DB] Could not connect to Firestore emulator:", err.message);
  }
}

/* ==========================================================================
   PURE UTILITY HELPERS (Duration Formatting, Dates, Reset Calculations)
   ========================================================================== */

/**
 * Single source of truth for duration formatting (Rules.md §1).
 * Formats totalSeconds as mm:ss (under 1 hour) or h:mm:ss (1 hour and above).
 * 
 * @param {number} totalSeconds - Elapsed time in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Returns the local date string formatted as "YYYY-MM-DD".
 * 
 * @param {Date} [date=new Date()] 
 * @returns {string} "YYYY-MM-DD"
 */
export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns a Date object representing local midnight (00:00:00.000) for a given date.
 * 
 * @param {Date} [date=new Date()] 
 * @returns {Date}
 */
export function getLocalMidnightDate(date = new Date()) {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

/**
 * Resolves UID from an explicit argument or falls back to the current authenticated user.
 * 
 * @param {string|null|undefined} explicitUid 
 * @returns {string} User ID
 */
function resolveUid(explicitUid) {
  if (typeof explicitUid === "string" && explicitUid.trim()) {
    return explicitUid.trim();
  }
  const current = getUserId();
  if (current) return current;
  return requireAuth().uid;
}

/* ==========================================================================
   COLLECTION REFERENCES
   ========================================================================== */

/**
 * Get categories collection reference
 * @param {string} uid 
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function getCategoriesCol(uid) {
  const targetUid = resolveUid(uid);
  return collection(db, "users", targetUid, "categories");
}

/**
 * Get checklists collection reference
 * @param {string} uid 
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function getChecklistsCol(uid) {
  const targetUid = resolveUid(uid);
  return collection(db, "users", targetUid, "checklists");
}

/**
 * Get tasks subcollection reference
 * @param {string} uid 
 * @param {string} checklistId 
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function getTasksCol(uid, checklistId) {
  const targetUid = resolveUid(uid);
  if (!checklistId) throw new Error("checklistId is required to access tasks subcollection");
  return collection(db, "users", targetUid, "checklists", checklistId, "tasks");
}

/**
 * Get timeLogs collection reference (append-only)
 * @param {string} uid 
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function getTimeLogsCol(uid) {
  const targetUid = resolveUid(uid);
  return collection(db, "users", targetUid, "timeLogs");
}

/* ==========================================================================
   CATEGORIES CRUD (users/{uid}/categories/{categoryId})
   ========================================================================== */

/**
 * @typedef {Object} CategoryData
 * @property {string} name - e.g. "Study", "Groceries"
 * @property {"lavender"|"mint"|"peach"|"butter"} [colorToken="lavender"]
 * @property {string} [icon="book-open"]
 * @property {number} [order=0]
 */

/**
 * Create a new Category
 * 
 * @param {string|CategoryData} uidOrData - UID string or CategoryData object
 * @param {CategoryData} [maybeData] - CategoryData if first arg is UID
 * @returns {Promise<string>} Created Category ID
 */
export async function createCategory(uidOrData, maybeData) {
  const uid = typeof uidOrData === "string" ? uidOrData : resolveUid();
  const data = typeof uidOrData === "object" ? uidOrData : (maybeData || {});

  if (!data.name || !data.name.trim()) {
    throw new Error("Category name is required.");
  }

  const payload = {
    name: data.name.trim(),
    colorToken: data.colorToken || "lavender",
    icon: data.icon || "book-open",
    order: Number(data.order) || 0,
    createdAt: serverTimestamp()
  };

  const colRef = getCategoriesCol(uid);
  const docRef = await addDoc(colRef, payload);
  return docRef.id;
}

/**
 * Get a single Category by ID
 * 
 * @param {string} uidOrCatId 
 * @param {string} [maybeCatId] 
 * @returns {Promise<Object|null>}
 */
export async function getCategory(uidOrCatId, maybeCatId) {
  const uid = maybeCatId ? uidOrCatId : resolveUid();
  const categoryId = maybeCatId || uidOrCatId;

  const docRef = doc(db, "users", resolveUid(uid), "categories", categoryId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Subscribe to real-time Category updates ordered by order ASC
 * 
 * @param {string|Function} uidOrCallback 
 * @param {Function} [maybeCallback] 
 * @returns {() => void} Unsubscribe function
 */
export function subscribeCategories(uidOrCallback, maybeCallback) {
  const uid = typeof uidOrCallback === "string" ? uidOrCallback : resolveUid();
  const callback = typeof uidOrCallback === "function" ? uidOrCallback : maybeCallback;

  if (typeof callback !== "function") {
    throw new Error("A callback function is required for subscribeCategories");
  }

  const q = query(getCategoriesCol(uid), orderBy("order", "asc"));
  return onSnapshot(q, (snapshot) => {
    const categories = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(categories);
  }, (error) => {
    console.error("[DB] subscribeCategories error:", error);
  });
}

/**
 * Update an existing Category
 * 
 * @param {string} uidOrCatId 
 * @param {string|Object} catIdOrUpdates 
 * @param {Object} [maybeUpdates] 
 * @returns {Promise<void>}
 */
export async function updateCategory(uidOrCatId, catIdOrUpdates, maybeUpdates) {
  const uid = maybeUpdates ? uidOrCatId : resolveUid();
  const categoryId = maybeUpdates ? catIdOrUpdates : uidOrCatId;
  const updates = maybeUpdates || catIdOrUpdates;

  const cleanUpdates = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.colorToken !== undefined) cleanUpdates.colorToken = updates.colorToken;
  if (updates.icon !== undefined) cleanUpdates.icon = updates.icon;
  if (updates.order !== undefined) cleanUpdates.order = Number(updates.order);

  const docRef = doc(db, "users", resolveUid(uid), "categories", categoryId);
  await updateDoc(docRef, cleanUpdates);
}

/**
 * Delete a Category and cascade-delete all its associated checklists and tasks using batched writes
 * 
 * @param {string} uidOrCatId 
 * @param {string} [maybeCatId] 
 * @returns {Promise<void>}
 */
export async function deleteCategory(uidOrCatId, maybeCatId) {
  const uid = maybeCatId ? uidOrCatId : resolveUid();
  const categoryId = maybeCatId || uidOrCatId;
  const targetUid = resolveUid(uid);

  // 1. Find all checklists in this category
  const checklistsQ = query(getChecklistsCol(targetUid), where("categoryId", "==", categoryId));
  const checklistsSnap = await getDocs(checklistsQ);

  const batch = writeBatch(db);

  // 2. Cascade delete tasks for each checklist
  for (const checkDoc of checklistsSnap.docs) {
    const tasksSnap = await getDocs(getTasksCol(targetUid, checkDoc.id));
    tasksSnap.forEach((taskDoc) => {
      batch.delete(taskDoc.ref);
    });
    batch.delete(checkDoc.ref);
  }

  // 3. Delete category document
  const catDocRef = doc(db, "users", targetUid, "categories", categoryId);
  batch.delete(catDocRef);

  await batch.commit();
}

/* ==========================================================================
   CHECKLISTS CRUD (users/{uid}/checklists/{checklistId})
   ========================================================================== */

/**
 * @typedef {Object} ChecklistSettings
 * @property {"daily"|"permanent"} resetMode
 * @property {boolean} timerEnabled
 * @property {boolean} graphEnabled
 */

/**
 * @typedef {Object} ChecklistData
 * @property {string} categoryId
 * @property {string} name
 * @property {Partial<ChecklistSettings>} [settings]
 * @property {number} [order=0]
 * @property {string[]} [initialTaskTitles=[]]
 */

/**
 * Create a new Checklist (atomically creating initial tasks if provided)
 * 
 * @param {string|ChecklistData} uidOrData 
 * @param {ChecklistData} [maybeData] 
 * @returns {Promise<string>} Created Checklist ID
 */
export async function createChecklist(uidOrData, maybeData) {
  const uid = typeof uidOrData === "string" ? uidOrData : resolveUid();
  const data = typeof uidOrData === "object" ? uidOrData : (maybeData || {});

  if (!data.categoryId) throw new Error("categoryId is required for checklist.");
  if (!data.name || !data.name.trim()) throw new Error("Checklist name is required.");

  const targetUid = resolveUid(uid);
  const cleanSettings = {
    resetMode: data.settings?.resetMode === "permanent" ? "permanent" : "daily",
    timerEnabled: data.settings?.timerEnabled !== false,
    graphEnabled: data.settings?.graphEnabled !== false
  };

  const tasksArray = (Array.isArray(data.initialTaskTitles) ? data.initialTaskTitles : [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean);

  const checklistRef = doc(getChecklistsCol(targetUid));
  const batch = writeBatch(db);

  const checklistPayload = {
    categoryId: data.categoryId,
    name: data.name.trim(),
    settings: cleanSettings,
    order: Number(data.order) || 0,
    lastResetAt: serverTimestamp(),
    taskCount: tasksArray.length,
    completedCount: 0,
    createdAt: serverTimestamp()
  };

  batch.set(checklistRef, checklistPayload);

  // Write optional initial tasks
  tasksArray.forEach((title, index) => {
    const taskDocRef = doc(getTasksCol(targetUid, checklistRef.id));
    batch.set(taskDocRef, {
      title,
      order: index,
      isCompleted: false,
      startedAt: null,
      timeSpentSeconds: 0,
      completedAt: null,
      createdAt: serverTimestamp()
    });
  });

  await batch.commit();
  return checklistRef.id;
}

/**
 * Get a single Checklist by ID
 * 
 * @param {string} uidOrCheckId 
 * @param {string} [maybeCheckId] 
 * @returns {Promise<Object|null>}
 */
export async function getChecklist(uidOrCheckId, maybeCheckId) {
  const uid = maybeCheckId ? uidOrCheckId : resolveUid();
  const checklistId = maybeCheckId || uidOrCheckId;

  const docRef = doc(db, "users", resolveUid(uid), "checklists", checklistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Subscribe to checklists for a given category ordered by order ASC
 * 
 * @param {string} uidOrCatId 
 * @param {string|Function} catIdOrCallback 
 * @param {Function} [maybeCallback] 
 * @returns {() => void} Unsubscribe function
 */
export function subscribeChecklists(uidOrCatId, catIdOrCallback, maybeCallback) {
  const uid = maybeCallback ? uidOrCatId : resolveUid();
  const categoryId = maybeCallback ? catIdOrCallback : uidOrCatId;
  const callback = maybeCallback || catIdOrCallback;

  if (typeof callback !== "function") {
    throw new Error("A callback function is required for subscribeChecklists");
  }

  const q = query(
    getChecklistsCol(uid),
    where("categoryId", "==", categoryId),
    orderBy("order", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const checklists = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(checklists);
  }, (error) => {
    console.error("[DB] subscribeChecklists error:", error);
  });
}

/**
 * Subscribe to all checklists across all categories for the current user
 * 
 * @param {string|Function} uidOrCallback 
 * @param {Function} [maybeCallback] 
 * @returns {() => void} Unsubscribe function
 */
export function subscribeAllChecklists(uidOrCallback, maybeCallback) {
  const uid = typeof uidOrCallback === "string" ? uidOrCallback : resolveUid();
  const callback = typeof uidOrCallback === "function" ? uidOrCallback : maybeCallback;

  if (typeof callback !== "function") {
    throw new Error("A callback function is required for subscribeAllChecklists");
  }

  const q = query(getChecklistsCol(uid), orderBy("order", "asc"));
  return onSnapshot(q, (snapshot) => {
    const checklists = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(checklists);
  }, (error) => {
    console.error("[DB] subscribeAllChecklists error:", error);
  });
}

/**
 * Update Checklist fields / settings
 * 
 * @param {string} uidOrCheckId 
 * @param {string|Object} checkIdOrUpdates 
 * @param {Object} [maybeUpdates] 
 * @returns {Promise<void>}
 */
export async function updateChecklist(uidOrCheckId, checkIdOrUpdates, maybeUpdates) {
  const uid = maybeUpdates ? uidOrCheckId : resolveUid();
  const checklistId = maybeUpdates ? checkIdOrUpdates : uidOrCheckId;
  const updates = maybeUpdates || checkIdOrUpdates;

  const cleanUpdates = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.order !== undefined) cleanUpdates.order = Number(updates.order);
  if (updates.settings !== undefined) {
    cleanUpdates.settings = {
      resetMode: updates.settings.resetMode === "permanent" ? "permanent" : "daily",
      timerEnabled: Boolean(updates.settings.timerEnabled),
      graphEnabled: Boolean(updates.settings.graphEnabled)
    };
  }

  const docRef = doc(db, "users", resolveUid(uid), "checklists", checklistId);
  await updateDoc(docRef, cleanUpdates);
}

/**
 * Delete a Checklist and cascade-delete its nested tasks subcollection
 * 
 * @param {string} uidOrCheckId 
 * @param {string} [maybeCheckId] 
 * @returns {Promise<void>}
 */
export async function deleteChecklist(uidOrCheckId, maybeCheckId) {
  const uid = maybeCheckId ? uidOrCheckId : resolveUid();
  const checklistId = maybeCheckId || uidOrCheckId;
  const targetUid = resolveUid(uid);

  const tasksSnap = await getDocs(getTasksCol(targetUid, checklistId));
  const batch = writeBatch(db);

  tasksSnap.forEach((taskDoc) => {
    batch.delete(taskDoc.ref);
  });

  const checklistRef = doc(db, "users", targetUid, "checklists", checklistId);
  batch.delete(checklistRef);

  await batch.commit();
}

/* ==========================================================================
   TASKS CRUD (users/{uid}/checklists/{checklistId}/tasks/{taskId})
   ========================================================================== */

/**
 * @typedef {Object} TaskData
 * @property {string} title
 * @property {number} [order]
 */

/**
 * Create a new task within a checklist, atomically incrementing taskCount
 * 
 * @param {string} uidOrCheckId 
 * @param {string|TaskData} checkIdOrData 
 * @param {TaskData} [maybeData] 
 * @returns {Promise<string>} Created Task ID
 */
export async function createTask(uidOrCheckId, checkIdOrData, maybeData) {
  const uid = maybeData ? uidOrCheckId : resolveUid();
  const checklistId = maybeData ? checkIdOrData : uidOrCheckId;
  const data = maybeData || checkIdOrData;
  const targetUid = resolveUid(uid);

  if (!data.title || !data.title.trim()) {
    throw new Error("Task title is required.");
  }

  const tasksRef = getTasksCol(targetUid, checklistId);
  let taskOrder = data.order;

  if (taskOrder === undefined) {
    const existing = await getDocs(tasksRef);
    taskOrder = existing.size;
  }

  const batch = writeBatch(db);
  const newTaskRef = doc(tasksRef);

  batch.set(newTaskRef, {
    title: data.title.trim(),
    order: Number(taskOrder) || 0,
    isCompleted: false,
    startedAt: null,
    timeSpentSeconds: 0,
    completedAt: null,
    createdAt: serverTimestamp()
  });

  // Atomically increment parent checklist taskCount
  const checklistDocRef = doc(db, "users", targetUid, "checklists", checklistId);
  const checkSnap = await getDoc(checklistDocRef);
  if (checkSnap.exists()) {
    const currentCount = checkSnap.data().taskCount || 0;
    batch.update(checklistDocRef, { taskCount: currentCount + 1 });
  }

  await batch.commit();
  return newTaskRef.id;
}

/**
 * Get all tasks for a checklist
 * 
 * @param {string} uidOrCheckId 
 * @param {string} [maybeCheckId] 
 * @returns {Promise<Array<Object>>}
 */
export async function getTasks(uidOrCheckId, maybeCheckId) {
  const uid = maybeCheckId ? uidOrCheckId : resolveUid();
  const checklistId = maybeCheckId || uidOrCheckId;
  const q = query(getTasksCol(resolveUid(uid), checklistId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to tasks for a checklist ordered by order ASC
 * 
 * @param {string} uidOrCheckId 
 * @param {string|Function} checkIdOrCallback 
 * @param {Function} [maybeCallback] 
 * @returns {() => void} Unsubscribe function
 */
export function subscribeTasks(uidOrCheckId, checkIdOrCallback, maybeCallback) {
  const uid = maybeCallback ? uidOrCheckId : resolveUid();
  const checklistId = maybeCallback ? checkIdOrCallback : uidOrCheckId;
  const callback = maybeCallback || checkIdOrCallback;

  if (typeof callback !== "function") {
    throw new Error("A callback function is required for subscribeTasks");
  }

  const q = query(getTasksCol(resolveUid(uid), checklistId), orderBy("order", "asc"));
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(tasks);
  }, (error) => {
    console.error("[DB] subscribeTasks error:", error);
  });
}

/**
 * Update an existing task
 * 
 * @param {string} uidOrCheckId 
 * @param {string} checkIdOrTaskId 
 * @param {string|Object} taskIdOrUpdates 
 * @param {Object} [maybeUpdates] 
 * @returns {Promise<void>}
 */
export async function updateTask(uidOrCheckId, checkIdOrTaskId, taskIdOrUpdates, maybeUpdates) {
  const uid = maybeUpdates ? uidOrCheckId : resolveUid();
  const checklistId = maybeUpdates ? checkIdOrTaskId : uidOrCheckId;
  const taskId = maybeUpdates ? taskIdOrUpdates : checkIdOrTaskId;
  const updates = maybeUpdates || taskIdOrUpdates;

  const taskRef = doc(db, "users", resolveUid(uid), "checklists", checklistId, "tasks", taskId);
  await updateDoc(taskRef, updates);
}

/**
 * Delete a single task and atomically update checklist taskCount / completedCount
 * 
 * @param {string} uidOrCheckId 
 * @param {string} checkIdOrTaskId 
 * @param {string} [maybeTaskId] 
 * @returns {Promise<void>}
 */
export async function deleteTask(uidOrCheckId, checkIdOrTaskId, maybeTaskId) {
  const uid = maybeTaskId ? uidOrCheckId : resolveUid();
  const checklistId = maybeTaskId ? checkIdOrTaskId : uidOrCheckId;
  const taskId = maybeTaskId || checkIdOrTaskId;
  const targetUid = resolveUid(uid);

  const taskRef = doc(db, "users", targetUid, "checklists", checklistId, "tasks", taskId);
  const taskSnap = await getDoc(taskRef);
  const wasCompleted = taskSnap.exists() ? Boolean(taskSnap.data().isCompleted) : false;

  const batch = writeBatch(db);
  batch.delete(taskRef);

  // Update checklist denormalized counters atomically
  const checklistDocRef = doc(db, "users", targetUid, "checklists", checklistId);
  const checkSnap = await getDoc(checklistDocRef);
  if (checkSnap.exists()) {
    const data = checkSnap.data();
    const newTaskCount = Math.max(0, (data.taskCount || 1) - 1);
    const newCompletedCount = wasCompleted ? Math.max(0, (data.completedCount || 1) - 1) : (data.completedCount || 0);
    batch.update(checklistDocRef, {
      taskCount: newTaskCount,
      completedCount: newCompletedCount
    });
  }

  await batch.commit();
}

/**
 * Reorder tasks in batch (Rules.md §4)
 * 
 * @param {string} uidOrCheckId 
 * @param {string|Array<{id: string, order: number}>} checkIdOrList 
 * @param {Array<{id: string, order: number}>} [maybeList] 
 * @returns {Promise<void>}
 */
export async function reorderTasks(uidOrCheckId, checkIdOrList, maybeList) {
  const uid = maybeList ? uidOrCheckId : resolveUid();
  const checklistId = maybeList ? checkIdOrList : uidOrCheckId;
  const orderedList = maybeList || checkIdOrList;
  const targetUid = resolveUid(uid);

  const batch = writeBatch(db);
  orderedList.forEach(({ id, order }) => {
    const taskRef = doc(db, "users", targetUid, "checklists", checklistId, "tasks", id);
    batch.update(taskRef, { order });
  });

  await batch.commit();
}

/* ==========================================================================
   TIMER, COMPLETION & SETTINGS TOGGLE HELPERS (AppFlow.md §3, §4, §6)
   ========================================================================== */

/**
 * Start a task's stopwatch timer
 * 
 * @param {string} uidOrCheckId 
 * @param {string} checkIdOrTaskId 
 * @param {string} [maybeTaskId] 
 * @returns {Promise<void>}
 */
export async function startTaskTimer(uidOrCheckId, checkIdOrTaskId, maybeTaskId) {
  const uid = maybeTaskId ? uidOrCheckId : resolveUid();
  const checklistId = maybeTaskId ? checkIdOrTaskId : uidOrCheckId;
  const taskId = maybeTaskId || checkIdOrTaskId;

  const taskRef = doc(db, "users", resolveUid(uid), "checklists", checklistId, "tasks", taskId);
  await updateDoc(taskRef, {
    startedAt: serverTimestamp()
  });
}

/**
 * Stop/Pause a task's stopwatch timer, folding elapsed time into timeSpentSeconds
 * 
 * @param {string} uidOrCheckId 
 * @param {string} checkIdOrTaskId 
 * @param {string|number} taskIdOrDelta 
 * @param {number} [maybeDelta=0] 
 * @returns {Promise<number>} Updated total timeSpentSeconds
 */
export async function stopTaskTimer(uidOrCheckId, checkIdOrTaskId, taskIdOrDelta, maybeDelta = 0) {
  let uid, checklistId, taskId, delta;
  if (typeof maybeDelta === "number" && typeof taskIdOrDelta === "string") {
    uid = uidOrCheckId;
    checklistId = checkIdOrTaskId;
    taskId = taskIdOrDelta;
    delta = maybeDelta;
  } else {
    uid = resolveUid();
    checklistId = uidOrCheckId;
    taskId = checkIdOrTaskId;
    delta = Number(taskIdOrDelta) || 0;
  }

  const taskRef = doc(db, "users", resolveUid(uid), "checklists", checklistId, "tasks", taskId);
  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) return 0;

  const currentSeconds = taskSnap.data().timeSpentSeconds || 0;
  const newTotal = currentSeconds + Math.max(0, Math.floor(delta));

  await updateDoc(taskRef, {
    startedAt: null,
    timeSpentSeconds: newTotal
  });

  return newTotal;
}

/**
 * Auto-stop all running timers in a checklist (used when switching timerEnabled true -> false)
 * 
 * @param {string} uidOrCheckId 
 * @param {string} [maybeCheckId] 
 * @returns {Promise<void>}
 */
export async function stopAllRunningTimersInChecklist(uidOrCheckId, maybeCheckId) {
  const uid = maybeCheckId ? uidOrCheckId : resolveUid();
  const checklistId = maybeCheckId || uidOrCheckId;
  const targetUid = resolveUid(uid);

  const tasksSnap = await getDocs(getTasksCol(targetUid, checklistId));
  const batch = writeBatch(db);
  let hasUpdates = false;

  tasksSnap.forEach((taskDoc) => {
    const data = taskDoc.data();
    if (data.startedAt) {
      const startTime = data.startedAt.toDate ? data.startedAt.toDate().getTime() : Date.now();
      const elapsedDelta = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      const newTotal = (data.timeSpentSeconds || 0) + elapsedDelta;
      batch.update(taskDoc.ref, {
        startedAt: null,
        timeSpentSeconds: newTotal
      });
      hasUpdates = true;
    }
  });

  if (hasUpdates) {
    await batch.commit();
  }
}

/**
 * Complete a task (auto-stopping timer, updating completion count, logging append-only to timeLogs)
 * 
 * @param {string} uidOrCheckId 
 * @param {string} checkIdOrTaskId 
 * @param {string|Object} taskIdOrOpts 
 * @param {Object} [maybeOpts={}] 
 * @returns {Promise<void>}
 */
export async function completeTask(uidOrCheckId, checkIdOrTaskId, taskIdOrOpts, maybeOpts = {}) {
  let uid, checklistId, taskId, opts;
  if (typeof taskIdOrOpts === "string") {
    uid = uidOrCheckId;
    checklistId = checkIdOrTaskId;
    taskId = taskIdOrOpts;
    opts = maybeOpts;
  } else {
    uid = resolveUid();
    checklistId = uidOrCheckId;
    taskId = checkIdOrTaskId;
    opts = taskIdOrOpts || {};
  }
  const targetUid = resolveUid(uid);

  const taskRef = doc(db, "users", targetUid, "checklists", checklistId, "tasks", taskId);
  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) return;

  const taskData = taskSnap.data();
  let finalDuration = taskData.timeSpentSeconds || 0;

  if (taskData.startedAt || opts.activeElapsedSeconds) {
    finalDuration += Math.max(0, Math.floor(opts.activeElapsedSeconds || 0));
  }

  const batch = writeBatch(db);

  // 1. Update task document
  batch.update(taskRef, {
    isCompleted: true,
    startedAt: null,
    timeSpentSeconds: finalDuration,
    completedAt: serverTimestamp()
  });

  // 2. Increment checklist completedCount
  const checklistRef = doc(db, "users", targetUid, "checklists", checklistId);
  const checkSnap = await getDoc(checklistRef);
  if (checkSnap.exists()) {
    const currentCompleted = checkSnap.data().completedCount || 0;
    batch.update(checklistRef, { completedCount: currentCompleted + 1 });
  }

  // 3. Write append-only entry to timeLogs
  const timeLogsRef = getTimeLogsCol(targetUid);
  const newLogRef = doc(timeLogsRef);
  const todayStr = getLocalDateString(new Date());

  batch.set(newLogRef, {
    checklistId,
    taskId,
    categoryId: opts.categoryId || (checkSnap.exists() ? checkSnap.data().categoryId : ""),
    date: todayStr,
    durationSeconds: opts.timerEnabled ? finalDuration : null,
    completed: true,
    createdAt: serverTimestamp()
  });

  await batch.commit();
}

/**
 * Uncomplete a task (reverts checkbox, does not alter timeLogs)
 * 
 * @param {string} uidOrCheckId 
 * @param {string} checkIdOrTaskId 
 * @param {string} [maybeTaskId] 
 * @returns {Promise<void>}
 */
export async function uncompleteTask(uidOrCheckId, checkIdOrTaskId, maybeTaskId) {
  const uid = maybeTaskId ? uidOrCheckId : resolveUid();
  const checklistId = maybeTaskId ? checkIdOrTaskId : uidOrCheckId;
  const taskId = maybeTaskId || checkIdOrTaskId;
  const targetUid = resolveUid(uid);

  const taskRef = doc(db, "users", targetUid, "checklists", checklistId, "tasks", taskId);
  const batch = writeBatch(db);

  batch.update(taskRef, {
    isCompleted: false,
    completedAt: null
  });

  const checklistRef = doc(db, "users", targetUid, "checklists", checklistId);
  const checkSnap = await getDoc(checklistRef);
  if (checkSnap.exists()) {
    const currentCompleted = checkSnap.data().completedCount || 0;
    batch.update(checklistRef, { completedCount: Math.max(0, currentCompleted - 1) });
  }

  await batch.commit();
}

/* ==========================================================================
   TIMELOGS QUERIES (Analytics Source of Truth)
   ========================================================================== */

/**
 * Fetch historical timeLogs for a given checklist on or after a start date
 * 
 * @param {string} uidOrCheckId 
 * @param {string} checkIdOrDate 
 * @param {string} [maybeDate] 
 * @returns {Promise<Array<Object>>}
 */
export async function getTimeLogsForChecklist(uidOrCheckId, checkIdOrDate, maybeDate) {
  const uid = maybeDate ? uidOrCheckId : resolveUid();
  const checklistId = maybeDate ? checkIdOrDate : uidOrCheckId;
  const startDateString = maybeDate || checkIdOrDate;

  const q = query(
    getTimeLogsCol(resolveUid(uid)),
    where("checklistId", "==", checklistId),
    where("date", ">=", startDateString),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * Fetch historical timeLogs for a given category on or after a start date
 * 
 * @param {string} uidOrCatId 
 * @param {string} catIdOrDate 
 * @param {string} [maybeDate] 
 * @returns {Promise<Array<Object>>}
 */
export async function getTimeLogsForCategory(uidOrCatId, catIdOrDate, maybeDate) {
  const uid = maybeDate ? uidOrCatId : resolveUid();
  const categoryId = maybeDate ? catIdOrDate : uidOrCatId;
  const startDateString = maybeDate || catIdOrDate;

  const q = query(
    getTimeLogsCol(resolveUid(uid)),
    where("categoryId", "==", categoryId),
    where("date", ">=", startDateString),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/* ==========================================================================
   RESET ENGINE (AppFlow.md §5: Transaction-Guarded Daily Midnight Reset)
   ========================================================================== */

/**
 * Executes a transaction-guarded daily midnight reset for a specific checklist.
 * Safe against multi-tab concurrent execution.
 * 
 * @param {string} uidOrCheckId 
 * @param {string} [maybeCheckId] 
 * @returns {Promise<boolean>} True if reset was executed, false if already reset today
 */
export async function executeDailyReset(uidOrCheckId, maybeCheckId) {
  const uid = maybeCheckId ? uidOrCheckId : resolveUid();
  const checklistId = maybeCheckId || uidOrCheckId;
  const targetUid = resolveUid(uid);

  const checklistRef = doc(db, "users", targetUid, "checklists", checklistId);
  const todayMidnight = getLocalMidnightDate(new Date()).getTime();

  try {
    const wasReset = await runTransaction(db, async (transaction) => {
      const checkSnap = await transaction.get(checklistRef);
      if (!checkSnap.exists()) return false;

      const data = checkSnap.data();
      if (data.settings?.resetMode !== "daily") return false;

      const lastResetDate = data.lastResetAt ? data.lastResetAt.toDate() : new Date(0);
      if (lastResetDate.getTime() >= todayMidnight) {
        return false;
      }

      // Fetch all tasks for this checklist
      const tasksSnap = await getDocs(getTasksCol(targetUid, checklistId));

      // Reset tasks state
      tasksSnap.forEach((taskDoc) => {
        transaction.update(taskDoc.ref, {
          isCompleted: false,
          startedAt: null,
          timeSpentSeconds: 0,
          completedAt: null
        });
      });

      // Update checklist lastResetAt and completedCount
      transaction.update(checklistRef, {
        lastResetAt: serverTimestamp(),
        completedCount: 0
      });

      return true;
    });

    return wasReset;
  } catch (error) {
    console.warn(`[ResetEngine] Daily reset skipped/failed for ${checklistId}:`, error.message);
    return false;
  }
}

/**
 * Scans all checklists for the user and resets any eligible daily-reset checklists.
 * 
 * @param {string|Array<Object>} [uidOrChecklists] 
 * @param {Array<Object>} [maybeChecklists] 
 * @returns {Promise<number>} Number of checklists reset
 */
export async function runDailyResetCheck(uidOrChecklists, maybeChecklists) {
  const uid = Array.isArray(uidOrChecklists) ? resolveUid() : resolveUid(uidOrChecklists);
  let list = Array.isArray(uidOrChecklists) ? uidOrChecklists : maybeChecklists;

  if (!list) {
    const q = query(getChecklistsCol(uid), where("settings.resetMode", "==", "daily"));
    const snap = await getDocs(q);
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const todayMidnight = getLocalMidnightDate(new Date()).getTime();
  let resetCount = 0;

  for (const item of list) {
    if (item.settings?.resetMode === "daily") {
      const lastResetDate = item.lastResetAt ? (item.lastResetAt.toDate ? item.lastResetAt.toDate() : new Date(item.lastResetAt)) : new Date(0);
      if (lastResetDate.getTime() < todayMidnight) {
        const didReset = await executeDailyReset(uid, item.id);
        if (didReset) resetCount++;
      }
    }
  }

  if (resetCount > 0) {
    console.info(`[ResetEngine] Reset completed for ${resetCount} checklist(s).`);
  }
  return resetCount;
}

export default {
  db,
  formatDuration,
  getLocalDateString,
  getLocalMidnightDate,
  createCategory,
  getCategory,
  updateCategory,
  deleteCategory,
  subscribeCategories,
  createChecklist,
  getChecklist,
  updateChecklist,
  deleteChecklist,
  subscribeChecklists,
  subscribeAllChecklists,
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  reorderTasks,
  subscribeTasks,
  startTaskTimer,
  stopTaskTimer,
  stopAllRunningTimersInChecklist,
  completeTask,
  uncompleteTask,
  getTimeLogsForChecklist,
  getTimeLogsForCategory,
  executeDailyReset,
  runDailyResetCheck
};
