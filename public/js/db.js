/**
 * @file db.js
 * @description Client-Side Cloud Firestore Data Access Layer for Daylign.
 * Operates on the 100% Free Firebase Spark Plan without requiring Cloud Functions billing.
 * Implements real-time subscriptions, cascading deletes, atomic counters,
 * immutable timeLogs, and the transaction-guarded daily reset engine.
 */

import { auth } from "./auth.js";
import { getApp } from "firebase/app";

import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  runTransaction,
  serverTimestamp,
  increment
} from "firebase/firestore";

/* ==========================================================================
   FIRESTORE SINGLETON INITIALIZATION WITH PERSISTENCE (TechSpec.md §5)
   ========================================================================== */

let dbInstance;

try {
  const app = getApp();
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (e) {
  // If already initialized, retrieve existing instance
  dbInstance = getFirestore();
}

export const db = dbInstance;

/* ==========================================================================
   COLLECTION PATH HELPERS (Schema.md §2)
   ========================================================================== */

export const getCategoriesCol = (uid) => collection(db, "users", uid, "categories");
export const getChecklistsCol = (uid) => collection(db, "users", uid, "checklists");
export const getTasksCol = (uid, checklistId) => collection(db, "users", uid, "checklists", checklistId, "tasks");
export const getTimeLogsCol = (uid) => collection(db, "users", uid, "timeLogs");
export const getNotesCol = (uid) => collection(db, "users", uid, "notes");

/* ==========================================================================
   LOCAL DATE & TIME HELPERS
   ========================================================================== */

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalMidnightDate(date = new Date()) {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

/* ==========================================================================
   1. CATEGORY CRUD OPERATIONS (Schema.md §3)
   ========================================================================== */

export async function createCategory(uid, data) {
  if (!uid) throw new Error("User ID is required.");
  if (!data.name || !data.name.trim()) throw new Error("Category name is required.");

  const categoriesCol = getCategoriesCol(uid);
  let order = data.order;
  if (order === undefined || order === null) {
    const snap = await getDocs(categoriesCol);
    order = snap.size;
  }

  const categoryDoc = {
    name: data.name.trim(),
    colorToken: data.colorToken || "lavender",
    icon: data.icon || "folder",
    order: Number(order),
    checklistCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(categoriesCol, categoryDoc);
  return { id: docRef.id, ...categoryDoc };
}

export async function getCategories(uid) {
  if (!uid) return [];
  const q = query(getCategoriesCol(uid), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCategory(uid, categoryId) {
  if (!uid || !categoryId) return null;
  const docRef = doc(db, "users", uid, "categories", categoryId);
  const snap = await getDoc(docRef);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function subscribeCategories(uid, callback, onError) {
  if (!uid) return () => {};
  const q = query(getCategoriesCol(uid), orderBy("order", "asc"));
  return onSnapshot(q, (snapshot) => {
    const categories = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (typeof callback === "function") callback(categories);
  }, (err) => {
    console.warn("[DB:subscribeCategories] Error:", err.message);
    if (typeof onError === "function") onError(err);
  });
}

export async function updateCategory(uid, categoryId, updates) {
  if (!uid || !categoryId) throw new Error("Missing parameters.");
  const docRef = doc(db, "users", uid, "categories", categoryId);
  const payload = {
    ...updates,
    updatedAt: serverTimestamp()
  };
  await updateDoc(docRef, payload);
  return { id: categoryId, ...payload };
}

export async function deleteCategory(uid, categoryId) {
  if (!uid || !categoryId) throw new Error("Missing parameters.");

  const checklistsQuery = query(getChecklistsCol(uid), where("categoryId", "==", categoryId));
  const checklistsSnap = await getDocs(checklistsQuery);

  // Collect all refs to delete for chunked batch processing (MEDIUM-01)
  const deleteRefs = [];

  for (const checkDoc of checklistsSnap.docs) {
    const tasksSnap = await getDocs(getTasksCol(uid, checkDoc.id));
    tasksSnap.forEach((taskDoc) => {
      deleteRefs.push(taskDoc.ref);
    });
    deleteRefs.push(checkDoc.ref);
  }

  const categoryRef = doc(db, "users", uid, "categories", categoryId);
  deleteRefs.push(categoryRef);

  // Commit in chunks of 499 to stay under Firestore's 500-operation batch limit
  const BATCH_LIMIT = 499;
  for (let i = 0; i < deleteRefs.length; i += BATCH_LIMIT) {
    const chunk = deleteRefs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/* ==========================================================================
   2. CHECKLIST CRUD OPERATIONS (Schema.md §4)
   ========================================================================== */

export async function createChecklist(uid, data) {
  if (!uid || !data.categoryId || !data.name) {
    throw new Error("Missing required checklist fields.");
  }

  const checklistsCol = getChecklistsCol(uid);
  let order = data.order;
  if (order === undefined || order === null) {
    const qOrder = query(checklistsCol, where("categoryId", "==", data.categoryId));
    const snap = await getDocs(qOrder);
    order = snap.size;
  }

  const initialTasks = Array.isArray(data.initialTasks)
    ? data.initialTasks.map((t) => (typeof t === "string" ? t.trim() : t.title?.trim())).filter(Boolean)
    : [];

  const newChecklistRef = doc(checklistsCol);
  const batch = writeBatch(db);

  const checklistData = {
    categoryId: data.categoryId,
    name: data.name.trim(),
    settings: {
      resetMode: data.settings?.resetMode === "daily" ? "daily" : "permanent",
      timerEnabled: data.settings?.timerEnabled !== false,
      graphEnabled: data.settings?.graphEnabled !== false
    },
    lastResetAt: serverTimestamp(),
    taskCount: initialTasks.length,
    completedCount: 0,
    order: Number(order),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  batch.set(newChecklistRef, checklistData);

  initialTasks.forEach((taskTitle, idx) => {
    const taskRef = doc(getTasksCol(uid, newChecklistRef.id));
    batch.set(taskRef, {
      title: taskTitle,
      isCompleted: false,
      startedAt: null,
      timeSpentSeconds: 0,
      completedAt: null,
      order: idx,
      createdAt: serverTimestamp()
    });
  });

  const categoryRef = doc(db, "users", uid, "categories", data.categoryId);
  batch.update(categoryRef, {
    checklistCount: increment(1),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
  return { id: newChecklistRef.id, ...checklistData };
}

export async function getChecklists(uid, categoryId = null) {
  if (!uid) return [];
  let q = getChecklistsCol(uid);
  if (categoryId) {
    q = query(q, where("categoryId", "==", categoryId), orderBy("order", "asc"));
  } else {
    q = query(q, orderBy("order", "asc"));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getChecklist(uid, checklistId) {
  if (!uid || !checklistId) return null;
  const snap = await getDoc(doc(db, "users", uid, "checklists", checklistId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function subscribeChecklists(uid, categoryId, callback, onError) {
  if (!uid) return () => {};
  let q = getChecklistsCol(uid);
  if (categoryId) {
    q = query(q, where("categoryId", "==", categoryId), orderBy("order", "asc"));
  } else {
    q = query(q, orderBy("order", "asc"));
  }
  return onSnapshot(q, (snapshot) => {
    const checklists = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (typeof callback === "function") callback(checklists);
  }, (err) => {
    console.warn("[DB:subscribeChecklists] Error:", err.message);
    if (typeof onError === "function") onError(err);
  });
}

/**
 * Subscribe to ALL checklists for a user (no category filter).
 * Used by the Hub view to compute aggregate progress across all categories.
 *
 * @param {string} uid - User ID
 * @param {(checklists: Array) => void} callback - Snapshot callback
 * @param {(err: Error) => void} onError - Optional error callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeAllChecklists(uid, callback, onError) {
  if (!uid) return () => {};
  const q = query(getChecklistsCol(uid), orderBy("order", "asc"));
  return onSnapshot(q, (snapshot) => {
    const checklists = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (typeof callback === "function") callback(checklists);
  }, (err) => {
    console.warn("[DB:subscribeAllChecklists] Error:", err.message);
    if (typeof onError === "function") onError(err);
  });
}

export async function updateChecklist(uid, checklistId, updates) {
  if (!uid || !checklistId) throw new Error("Missing parameters.");
  const docRef = doc(db, "users", uid, "checklists", checklistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Checklist not found.");

  const current = snap.data();

  // If timerEnabled toggled from true -> false, auto-stop active timers
  if (current.settings?.timerEnabled && updates.settings?.timerEnabled === false) {
    await stopAllRunningTimersInChecklist(uid, checklistId);
  }

  const payload = {
    ...updates,
    updatedAt: serverTimestamp()
  };
  await updateDoc(docRef, payload);
  return { id: checklistId, ...payload };
}

export async function deleteChecklist(uid, checklistId) {
  if (!uid || !checklistId) throw new Error("Missing parameters.");

  const checkRef = doc(db, "users", uid, "checklists", checklistId);
  const checkSnap = await getDoc(checkRef);
  if (!checkSnap.exists()) return;

  const { categoryId } = checkSnap.data();
  const tasksSnap = await getDocs(getTasksCol(uid, checklistId));

  const batch = writeBatch(db);
  tasksSnap.forEach((taskDoc) => {
    batch.delete(taskDoc.ref);
  });
  batch.delete(checkRef);

  if (categoryId) {
    const catRef = doc(db, "users", uid, "categories", categoryId);
    batch.update(catRef, {
      checklistCount: increment(-1),
      updatedAt: serverTimestamp()
    });
  }

  await batch.commit();
}

/* ==========================================================================
   3. TASK CRUD OPERATIONS (Schema.md §5)
   ========================================================================== */

export function subscribeTasks(uid, checklistId, callback, onError) {
  if (!uid || !checklistId) return () => {};
  const q = query(getTasksCol(uid, checklistId), orderBy("order", "asc"));
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (typeof callback === "function") callback(tasks);
  }, (err) => {
    console.warn("[DB:subscribeTasks] Error:", err.message);
    if (typeof onError === "function") onError(err);
  });
}

export async function getTasks(uid, checklistId) {
  if (!uid || !checklistId) return [];
  const q = query(getTasksCol(uid, checklistId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createTask(uid, checklistId, data) {
  if (!uid || !checklistId || !data.title?.trim()) {
    throw new Error("Task title is required.");
  }

  const tasksCol = getTasksCol(uid, checklistId);
  let order = data.order;
  if (order === undefined || order === null) {
    const snap = await getDocs(tasksCol);
    order = snap.size;
  }

  const taskData = {
    title: data.title.trim(),
    isCompleted: false,
    startedAt: null,
    timeSpentSeconds: 0,
    completedAt: null,
    order: Number(order),
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(tasksCol, taskData);

  const checkRef = doc(db, "users", uid, "checklists", checklistId);
  await updateDoc(checkRef, {
    taskCount: increment(1),
    updatedAt: serverTimestamp()
  });

  return { id: docRef.id, ...taskData };
}

export async function updateTask(uid, checklistId, taskId, updates) {
  if (!uid || !checklistId || !taskId) throw new Error("Missing parameters.");
  const taskRef = doc(db, "users", uid, "checklists", checklistId, "tasks", taskId);
  
  const payload = { ...updates };
  if (updates.startedAt === true) {
    payload.startedAt = serverTimestamp();
  }

  await updateDoc(taskRef, payload);
  return { id: taskId, ...payload };
}

export async function deleteTask(uid, checklistId, taskId) {
  if (!uid || !checklistId || !taskId) throw new Error("Missing parameters.");

  const taskRef = doc(db, "users", uid, "checklists", checklistId, "tasks", taskId);
  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) return;

  const isCompleted = taskSnap.data().isCompleted;
  const checkRef = doc(db, "users", uid, "checklists", checklistId);

  const batch = writeBatch(db);
  batch.delete(taskRef);

  const checkUpdates = {
    taskCount: increment(-1),
    updatedAt: serverTimestamp()
  };
  if (isCompleted) {
    checkUpdates.completedCount = increment(-1);
  }

  batch.update(checkRef, checkUpdates);
  await batch.commit();
}

export async function reorderTasks(uid, checklistId, items) {
  if (!uid || !checklistId || !Array.isArray(items)) return;

  const batch = writeBatch(db);
  items.forEach((item) => {
    if (item.id && typeof item.order === "number") {
      const ref = doc(db, "users", uid, "checklists", checklistId, "tasks", item.id);
      batch.update(ref, { order: item.order });
    }
  });
  await batch.commit();
}

export async function completeTask(uid, checklistId, taskId, options = {}) {
  if (!uid || !checklistId || !taskId) throw new Error("Missing parameters.");

  const taskRef = doc(db, "users", uid, "checklists", checklistId, "tasks", taskId);
  const checkRef = doc(db, "users", uid, "checklists", checklistId);

  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) return;

  const taskData = taskSnap.data();
  let totalDuration = taskData.timeSpentSeconds || 0;

  if (taskData.startedAt) {
    const startMs = taskData.startedAt.toDate ? taskData.startedAt.toDate().getTime() : Date.now();
    const liveDelta = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    totalDuration += liveDelta;
  }

  const batch = writeBatch(db);

  batch.update(taskRef, {
    isCompleted: true,
    startedAt: null,
    timeSpentSeconds: totalDuration,
    completedAt: serverTimestamp()
  });

  if (!taskData.isCompleted) {
    batch.update(checkRef, {
      completedCount: increment(1),
      updatedAt: serverTimestamp()
    });
  }

  // Append-only immutable timeLog record
  const timeLogRef = doc(getTimeLogsCol(uid));
  batch.set(timeLogRef, {
    checklistId,
    taskId,
    categoryId: options.categoryId || "",
    date: getLocalDateString(new Date()),
    durationSeconds: options.timerEnabled !== false ? totalDuration : null,
    completed: true,
    createdAt: serverTimestamp()
  });

  await batch.commit();
  return { taskId, totalDurationSeconds: totalDuration };
}

export async function uncompleteTask(uid, checklistId, taskId) {
  if (!uid || !checklistId || !taskId) throw new Error("Missing parameters.");

  const taskRef = doc(db, "users", uid, "checklists", checklistId, "tasks", taskId);
  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) return;

  const batch = writeBatch(db);
  batch.update(taskRef, {
    isCompleted: false,
    startedAt: null,
    completedAt: null
  });

  if (taskSnap.data().isCompleted) {
    const checkRef = doc(db, "users", uid, "checklists", checklistId);
    batch.update(checkRef, {
      completedCount: increment(-1),
      updatedAt: serverTimestamp()
    });
  }

  await batch.commit();
}

export async function stopAllRunningTimersInChecklist(uid, checklistId) {
  const q = query(getTasksCol(uid, checklistId), where("startedAt", "!=", null));
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  const now = Date.now();

  snap.forEach((taskDoc) => {
    const taskData = taskDoc.data();
    const startMs = taskData.startedAt?.toDate ? taskData.startedAt.toDate().getTime() : now;
    const delta = Math.max(0, Math.floor((now - startMs) / 1000));
    const accumulated = (taskData.timeSpentSeconds || 0) + delta;

    batch.update(taskDoc.ref, {
      startedAt: null,
      timeSpentSeconds: accumulated
    });
  });

  await batch.commit();
}

/* ==========================================================================
   4. ANALYTICS QUERIES (Schema.md §6)
   ========================================================================== */

export async function getTimeLogsForRange(uid, checklistId, days = 7) {
  if (!uid) return { labels: [], completedCounts: [], durationsMinutes: [], summary: {} };

  const safeDays = Math.max(1, Number(days) || 7);
  const targetDate = new Date();
  const dateList = [];
  const dateBucketMap = new Map();

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const displayLabel = d.toLocaleDateString("en-US", {
      weekday: safeDays <= 7 ? "short" : undefined,
      month: safeDays > 7 ? "numeric" : undefined,
      day: "numeric"
    });

    dateList.push({ dateStr, displayLabel });
    dateBucketMap.set(dateStr, { completedCount: 0, durationSeconds: 0 });
  }

  const startDateStr = dateList[0].dateStr;
  let q = query(getTimeLogsCol(uid), where("date", ">=", startDateStr));
  if (checklistId) {
    q = query(getTimeLogsCol(uid), where("checklistId", "==", checklistId), where("date", ">=", startDateStr));
  }

  const snap = await getDocs(q);

  snap.forEach((doc) => {
    const log = doc.data();
    if (dateBucketMap.has(log.date)) {
      const bucket = dateBucketMap.get(log.date);
      if (log.completed) bucket.completedCount += 1;
      if (log.durationSeconds) bucket.durationSeconds += log.durationSeconds;
    }
  });

  let totalActiveDays = 0;
  let totalCompletions = 0;
  let totalSeconds = 0;

  const labels = [];
  const completedCounts = [];
  const durationsMinutes = [];

  dateList.forEach(({ dateStr, displayLabel }) => {
    const bucket = dateBucketMap.get(dateStr);
    labels.push(displayLabel);
    completedCounts.push(bucket.completedCount);

    const mins = Math.round(bucket.durationSeconds / 60);
    durationsMinutes.push(mins);

    if (bucket.completedCount > 0 || bucket.durationSeconds > 0) totalActiveDays += 1;
    totalCompletions += bucket.completedCount;
    totalSeconds += bucket.durationSeconds;
  });

  const avgRate = Math.round((totalActiveDays / safeDays) * 100);
  const totalMinutes = Math.round(totalSeconds / 60);

  return {
    labels,
    completedCounts,
    durationsMinutes,
    summary: {
      avgRate,
      activeDays: totalActiveDays,
      totalDays: safeDays,
      totalCompletions,
      totalMinutes
    }
  };
}

/* ==========================================================================
   5. DAILY MIDNIGHT RESET ENGINE (AppFlow.md §5)
   ========================================================================== */

export async function runDailyResetCheck(uid) {
  if (!uid) return { checked: 0, resetCount: 0 };

  const today = new Date();
  const midnightMs = getLocalMidnightDate(today).getTime();

  try {
    const q = query(getChecklistsCol(uid), where("settings.resetMode", "==", "daily"));
    const snap = await getDocs(q);

    let resetCount = 0;

    for (const checkDoc of snap.docs) {
      const checkData = checkDoc.data();
      const lastReset = checkData.lastResetAt;

      let resetMs = 0;
      if (lastReset?.toMillis) resetMs = lastReset.toMillis();
      else if (lastReset?.toDate) resetMs = lastReset.toDate().getTime();

      if (!lastReset || resetMs < midnightMs) {
        await runTransaction(db, async (transaction) => {
          const freshSnap = await transaction.get(checkDoc.ref);
          const freshData = freshSnap.data();

          let freshResetMs = 0;
          if (freshData.lastResetAt?.toMillis) freshResetMs = freshData.lastResetAt.toMillis();
          else if (freshData.lastResetAt?.toDate) freshResetMs = freshData.lastResetAt.toDate().getTime();

          if (freshData.lastResetAt && freshResetMs >= midnightMs) {
            return; // Clean no-op (already reset by another tab)
          }

          const tasksSnap = await getDocs(getTasksCol(uid, checkDoc.id));

          tasksSnap.forEach((taskDoc) => {
            const taskData = taskDoc.data();
            if (taskData.startedAt) {
              const startMs = taskData.startedAt.toDate ? taskData.startedAt.toDate().getTime() : Date.now();
              const elapsedDelta = Math.max(0, Math.floor((midnightMs - startMs) / 1000));
              const totalDuration = (taskData.timeSpentSeconds || 0) + elapsedDelta;

              if (totalDuration > 0) {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const timeLogRef = doc(getTimeLogsCol(uid));
                transaction.set(timeLogRef, {
                  checklistId: checkDoc.id,
                  taskId: taskDoc.id,
                  categoryId: checkData.categoryId || "",
                  date: getLocalDateString(yesterday),
                  durationSeconds: totalDuration,
                  completed: Boolean(taskData.isCompleted),
                  createdAt: serverTimestamp()
                });
              }
            }

            transaction.update(taskDoc.ref, {
              isCompleted: false,
              startedAt: null,
              timeSpentSeconds: 0,
              completedAt: null
            });
          });

          transaction.update(checkDoc.ref, {
            lastResetAt: serverTimestamp(),
            completedCount: 0
          });
        });

        resetCount++;
      }
    }

    return { checked: snap.size, resetCount };
  } catch (err) {
    console.warn("[ResetEngine] Reset check error:", err.message);
    return { checked: 0, resetCount: 0, error: err.message };
  }
}

/* ==========================================================================
   6. STICKY NOTES CRUD OPERATIONS
   ========================================================================== */

/**
 * Subscribe to real-time updates of user sticky notes.
 * 
 * @param {string} uid - User ID
 * @param {(notes: Array) => void} callback - Snapshot callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeNotes(uid, callback, onError) {
  if (!uid) return () => {};
  const q = getNotesCol(uid);
  return onSnapshot(q, (snapshot) => {
    const notes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort in memory by createdAt descending (fallback to updatedAt or 0)
    notes.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : (a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0));
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : (b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0));
      return timeB - timeA;
    });
    if (typeof callback === "function") callback(notes);
  }, (err) => {
    console.warn("[DB:subscribeNotes] Error:", err.message);
    if (typeof onError === "function") onError(err);
  });
}

/**
 * Fetch all sticky notes for a user
 */
export async function getNotes(uid) {
  if (!uid) return [];
  const q = getNotesCol(uid);
  const snap = await getDocs(q);
  const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  notes.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return timeB - timeA;
  });
  return notes;
}

/**
 * Create a new sticky note
 */
export async function createNote(uid, data) {
  if (!uid) throw new Error("User ID is required.");
  const title = (data.title || "").trim();
  const content = (data.content || "").trim();
  if (!title && !content) {
    throw new Error("Please enter a note title or content.");
  }

  const noteData = {
    title,
    content,
    colorToken: data.colorToken || "butter",
    isImportant: Boolean(data.isImportant),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(getNotesCol(uid), noteData);
  return { id: docRef.id, ...noteData };
}

/**
 * Update an existing sticky note
 */
export async function updateNote(uid, noteId, updates) {
  if (!uid || !noteId) throw new Error("Missing parameters.");
  const noteRef = doc(db, "users", uid, "notes", noteId);
  const payload = {
    ...updates,
    updatedAt: serverTimestamp()
  };
  await updateDoc(noteRef, payload);
  return { id: noteId, ...payload };
}

/**
 * Delete a sticky note
 */
export async function deleteNote(uid, noteId) {
  if (!uid || !noteId) throw new Error("Missing parameters.");
  const noteRef = doc(db, "users", uid, "notes", noteId);
  await deleteDoc(noteRef);
  return { id: noteId, success: true };
}

/**
 * Toggle important / pinned status of a note
 */
export async function toggleNoteImportant(uid, noteId, isImportant) {
  return await updateNote(uid, noteId, { isImportant: Boolean(isImportant) });
}

/* ==========================================================================
   7. RUNNING TIMERS AGGREGATOR FOR HOMESCREEN
   ========================================================================== */

/**
 * Real-time subscription that monitors all active/running task timers across all user checklists.
 * Automatically handles dynamic additions/removals of checklists and tasks.
 * 
 * @param {string} uid - User ID
 * @param {(runningTasks: Array<{ task: Object, checklist: Object, category: Object|null }>) => void} callback
 * @returns {() => void} Cleanup function
 */
export function subscribeRunningTasks(uid, callback) {
  if (!uid) return () => {};

  let checklistUnsubs = new Map();
  let taskCache = new Map(); // checklistId -> tasks array
  let checklistCache = new Map(); // checklistId -> checklist doc
  let categoryCache = new Map(); // categoryId -> category doc

  // Fetch categories once for fast decoration
  getCategories(uid).then((cats) => {
    cats.forEach((c) => categoryCache.set(c.id, c));
  }).catch(() => {});

  const emitRunning = () => {
    const running = [];
    taskCache.forEach((tasks, checklistId) => {
      const checklist = checklistCache.get(checklistId);
      const category = checklist?.categoryId ? categoryCache.get(checklist.categoryId) : null;
      tasks.forEach((task) => {
        if (task.startedAt && !task.isCompleted) {
          running.push({
            task,
            checklist: checklist || { id: checklistId, name: "Checklist" },
            category: category || null
          });
        }
      });
    });
    if (typeof callback === "function") {
      callback(running);
    }
  };

  const unsubChecklists = subscribeAllChecklists(uid, (checklists) => {
    const activeIds = new Set(checklists.map((c) => c.id));
    checklists.forEach((c) => checklistCache.set(c.id, c));

    // Cleanup deleted checklists
    checklistUnsubs.forEach((unsub, chId) => {
      if (!activeIds.has(chId)) {
        unsub();
        checklistUnsubs.delete(chId);
        taskCache.delete(chId);
        checklistCache.delete(chId);
      }
    });

    // Subscribe to tasks for each checklist
    checklists.forEach((checklist) => {
      if (!checklistUnsubs.has(checklist.id)) {
        const unsubTask = subscribeTasks(uid, checklist.id, (tasks) => {
          taskCache.set(checklist.id, tasks);
          emitRunning();
        });
        checklistUnsubs.set(checklist.id, unsubTask);
      }
    });

    emitRunning();
  });

  return () => {
    unsubChecklists();
    checklistUnsubs.forEach((unsub) => unsub());
    checklistUnsubs.clear();
    taskCache.clear();
    checklistCache.clear();
  };
}

export default {
  db,
  getLocalDateString,
  getLocalMidnightDate,
  createCategory,
  getCategories,
  getCategory,
  subscribeCategories,
  updateCategory,
  deleteCategory,
  createChecklist,
  getChecklists,
  getChecklist,
  subscribeChecklists,
  subscribeAllChecklists,
  updateChecklist,
  deleteChecklist,
  subscribeTasks,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  completeTask,
  uncompleteTask,
  stopAllRunningTimersInChecklist,
  getTimeLogsForRange,
  runDailyResetCheck,
  getNotes,
  subscribeNotes,
  createNote,
  updateNote,
  deleteNote,
  toggleNoteImportant,
  subscribeRunningTasks
};
