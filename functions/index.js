/**
 * @file functions/index.js
 * @description Serverless Express REST API for Daylign.
 * Manages all Cloud Firestore data operations, token verification,
 * cascading deletions, timer logging, analytics pre-aggregation, and the daily midnight reset engine.
 */

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin SDK singleton
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const app = express();

// Apply Global Middleware
app.use(cors({ origin: true }));
app.use(express.json());

/* ==========================================================================
   AUTHENTICATION MIDDLEWARE
   ========================================================================== */

/**
 * Validates the Firebase Auth ID Token passed via Authorization: Bearer <token>.
 * Rejects unauthenticated requests with 401 Unauthorized.
 */
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or malformed Authorization header. Expected: Bearer <idToken>"
    });
  }

  const idToken = authHeader.split("Bearer ")[1].trim();

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      isAnonymous: decodedToken.firebase?.sign_in_provider === "anonymous"
    };
    next();
  } catch (error) {
    console.warn("[AuthMiddleware] Token verification failed:", error.message);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired Firebase Auth ID Token."
    });
  }
}

// Protect all /api routes with the auth middleware
app.use(authenticateUser);

/* ==========================================================================
   DATE HELPERS (Local Calendar Alignment)
   ========================================================================== */

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalMidnightDate(date = new Date()) {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

/* ==========================================================================
   1. CATEGORY ENDPOINTS
   ========================================================================== */

/**
 * GET /api/categories
 * Returns all categories for the authenticated user ordered by `order ASC`.
 */
app.get("/api/categories", async (req, res) => {
  try {
    const categoriesCol = db.collection(`users/${req.user.uid}/categories`);
    const snapshot = await categoriesCol.orderBy("order", "asc").get();

    const categories = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.json({ categories });
  } catch (error) {
    console.error("[Categories:GET] Error fetching categories:", error);
    return res.status(500).json({ error: "Failed to fetch categories", message: error.message });
  }
});

/**
 * POST /api/categories
 * Creates a new category for the authenticated user.
 */
app.post("/api/categories", async (req, res) => {
  try {
    const { name, colorToken, icon, order } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Validation Error", message: "Category name is required." });
    }

    const categoriesCol = db.collection(`users/${req.user.uid}/categories`);
    let categoryOrder = order;

    if (categoryOrder === undefined || categoryOrder === null) {
      const snap = await categoriesCol.get();
      categoryOrder = snap.size;
    }

    const newCategoryData = {
      name: name.trim(),
      colorToken: ["lavender", "mint", "peach", "butter"].includes(colorToken) ? colorToken : "lavender",
      icon: icon || "folder",
      order: Number(categoryOrder),
      checklistCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await categoriesCol.add(newCategoryData);
    return res.status(201).json({
      id: docRef.id,
      ...newCategoryData
    });
  } catch (error) {
    console.error("[Categories:POST] Error creating category:", error);
    return res.status(500).json({ error: "Failed to create category", message: error.message });
  }
});

/**
 * PATCH /api/categories/:id
 * Updates an existing category's properties.
 */
app.patch("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, colorToken, icon, order } = req.body;
    const catRef = db.doc(`users/${req.user.uid}/categories/${id}`);

    const snap = await catRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Category not found." });
    }

    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (name !== undefined) updates.name = String(name).trim();
    if (colorToken !== undefined) updates.colorToken = colorToken;
    if (icon !== undefined) updates.icon = icon;
    if (order !== undefined) updates.order = Number(order);

    await catRef.update(updates);
    return res.json({ id, ...snap.data(), ...updates });
  } catch (error) {
    console.error("[Categories:PATCH] Error updating category:", error);
    return res.status(500).json({ error: "Failed to update category", message: error.message });
  }
});

/**
 * DELETE /api/categories/:id
 * Cascade-deletes a category, all checklists under it, and all task subcollections.
 */
app.delete("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const catRef = db.doc(`users/${uid}/categories/${id}`);

    const catSnap = await catRef.get();
    if (!catSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Category not found." });
    }

    // Query all checklists belonging to this category
    const checklistsSnap = await db
      .collection(`users/${uid}/checklists`)
      .where("categoryId", "==", id)
      .get();

    const batch = db.batch();

    // Cascade delete subcollection tasks and checklist docs
    for (const checkDoc of checklistsSnap.docs) {
      const tasksSnap = await checkDoc.ref.collection("tasks").get();
      tasksSnap.forEach((taskDoc) => {
        batch.delete(taskDoc.ref);
      });
      batch.delete(checkDoc.ref);
    }

    // Delete category doc
    batch.delete(catRef);
    await batch.commit();

    return res.json({ success: true, message: `Category ${id} and all child checklists deleted.` });
  } catch (error) {
    console.error("[Categories:DELETE] Error deleting category:", error);
    return res.status(500).json({ error: "Failed to delete category", message: error.message });
  }
});

/* ==========================================================================
   2. CHECKLIST ENDPOINTS
   ========================================================================== */

/**
 * GET /api/checklists
 * Query user checklists. Optionally filter with ?categoryId=<id>
 */
app.get("/api/checklists", async (req, res) => {
  try {
    const uid = req.user.uid;
    const { categoryId } = req.query;

    let q = db.collection(`users/${uid}/checklists`);
    if (categoryId) {
      q = q.where("categoryId", "==", categoryId);
    }

    const snapshot = await q.orderBy("order", "asc").get();
    const checklists = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.json({ checklists });
  } catch (error) {
    console.error("[Checklists:GET] Error fetching checklists:", error);
    return res.status(500).json({ error: "Failed to fetch checklists", message: error.message });
  }
});

/**
 * GET /api/checklists/:id
 * Fetches a single checklist along with parent category info.
 */
app.get("/api/checklists/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const checkRef = db.doc(`users/${uid}/checklists/${id}`);
    const checkSnap = await checkRef.get();

    if (!checkSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Checklist not found." });
    }

    const checklistData = { id: checkSnap.id, ...checkSnap.data() };
    let categoryData = null;

    if (checklistData.categoryId) {
      const catSnap = await db.doc(`users/${uid}/categories/${checklistData.categoryId}`).get();
      if (catSnap.exists) {
        categoryData = { id: catSnap.id, ...catSnap.data() };
      }
    }

    return res.json({ checklist: checklistData, category: categoryData });
  } catch (error) {
    console.error("[Checklists:GET/:id] Error fetching checklist:", error);
    return res.status(500).json({ error: "Failed to fetch checklist", message: error.message });
  }
});

/**
 * POST /api/checklists
 * Creates a new checklist and optional initial tasks.
 */
app.post("/api/checklists", async (req, res) => {
  try {
    const uid = req.user.uid;
    const { categoryId, name, settings, initialTasks, order } = req.body;

    if (!categoryId || !name) {
      return res.status(400).json({ error: "Validation Error", message: "categoryId and name are required." });
    }

    const categoryRef = db.doc(`users/${uid}/categories/${categoryId}`);
    const catSnap = await categoryRef.get();
    if (!catSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Parent category not found." });
    }

    const parsedTasks = Array.isArray(initialTasks)
      ? initialTasks.map((t) => (typeof t === "string" ? t.trim() : t.title?.trim())).filter(Boolean)
      : [];

    const checklistsCol = db.collection(`users/${uid}/checklists`);
    let checklistOrder = order;

    if (checklistOrder === undefined || checklistOrder === null) {
      const snap = await checklistsCol.where("categoryId", "==", categoryId).get();
      checklistOrder = snap.size;
    }

    const newChecklistRef = checklistsCol.doc();
    const batch = db.batch();

    const checklistData = {
      categoryId,
      name: name.trim(),
      settings: {
        resetMode: settings?.resetMode === "daily" ? "daily" : "permanent",
        timerEnabled: settings?.timerEnabled !== false,
        graphEnabled: settings?.graphEnabled !== false
      },
      lastResetAt: admin.firestore.FieldValue.serverTimestamp(),
      taskCount: parsedTasks.length,
      completedCount: 0,
      order: Number(checklistOrder),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    batch.set(newChecklistRef, checklistData);

    // Create initial task docs
    parsedTasks.forEach((taskTitle, idx) => {
      const taskRef = newChecklistRef.collection("tasks").doc();
      batch.set(taskRef, {
        title: taskTitle,
        isCompleted: false,
        startedAt: null,
        timeSpentSeconds: 0,
        completedAt: null,
        order: idx,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    // Increment category checklistCount
    batch.update(categoryRef, {
      checklistCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return res.status(201).json({
      id: newChecklistRef.id,
      ...checklistData
    });
  } catch (error) {
    console.error("[Checklists:POST] Error creating checklist:", error);
    return res.status(500).json({ error: "Failed to create checklist", message: error.message });
  }
});

/**
 * PATCH /api/checklists/:id
 * Updates checklist settings/name. Handles timer auto-stop edge case when timerEnabled -> false.
 */
app.patch("/api/checklists/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const { name, settings, order } = req.body;

    const checkRef = db.doc(`users/${uid}/checklists/${id}`);
    const checkSnap = await checkRef.get();

    if (!checkSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Checklist not found." });
    }

    const currentData = checkSnap.data();
    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (name !== undefined) updates.name = String(name).trim();
    if (order !== undefined) updates.order = Number(order);

    if (settings) {
      updates.settings = {
        ...currentData.settings,
        ...settings
      };

      // Edge case: if timerEnabled toggled from true to false, stop running tasks
      if (currentData.settings?.timerEnabled && settings.timerEnabled === false) {
        const tasksSnap = await checkRef.collection("tasks").where("startedAt", "!=", null).get();
        if (!tasksSnap.empty) {
          const batch = db.batch();
          const now = Date.now();

          tasksSnap.forEach((taskDoc) => {
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
      }
    }

    await checkRef.update(updates);
    return res.json({ id, ...currentData, ...updates });
  } catch (error) {
    console.error("[Checklists:PATCH] Error updating checklist:", error);
    return res.status(500).json({ error: "Failed to update checklist", message: error.message });
  }
});

/**
 * DELETE /api/checklists/:id
 * Cascade-deletes a checklist and its subcollection tasks. Decrements category count.
 */
app.delete("/api/checklists/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const checkRef = db.doc(`users/${uid}/checklists/${id}`);
    const checkSnap = await checkRef.get();

    if (!checkSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Checklist not found." });
    }

    const { categoryId } = checkSnap.data();
    const tasksSnap = await checkRef.collection("tasks").get();

    const batch = db.batch();
    tasksSnap.forEach((taskDoc) => {
      batch.delete(taskDoc.ref);
    });
    batch.delete(checkRef);

    if (categoryId) {
      const catRef = db.doc(`users/${uid}/categories/${categoryId}`);
      batch.update(catRef, {
        checklistCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    return res.json({ success: true, message: `Checklist ${id} and all tasks deleted.` });
  } catch (error) {
    console.error("[Checklists:DELETE] Error deleting checklist:", error);
    return res.status(500).json({ error: "Failed to delete checklist", message: error.message });
  }
});

/* ==========================================================================
   3. TASK ENDPOINTS
   ========================================================================== */

/**
 * GET /api/checklists/:id/tasks
 * Returns all tasks for a checklist ordered by order ASC.
 */
app.get("/api/checklists/:id/tasks", async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const tasksCol = db.collection(`users/${uid}/checklists/${id}/tasks`);
    const snapshot = await tasksCol.orderBy("order", "asc").get();

    const tasks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.json({ tasks });
  } catch (error) {
    console.error("[Tasks:GET] Error fetching tasks:", error);
    return res.status(500).json({ error: "Failed to fetch tasks", message: error.message });
  }
});

/**
 * POST /api/checklists/:id/tasks
 * Adds a new task to the checklist and atomically increments taskCount.
 */
app.post("/api/checklists/:id/tasks", async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const { title, order } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Validation Error", message: "Task title is required." });
    }

    const checkRef = db.doc(`users/${uid}/checklists/${id}`);
    const checkSnap = await checkRef.get();
    if (!checkSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Checklist not found." });
    }

    const tasksCol = checkRef.collection("tasks");
    let taskOrder = order;

    if (taskOrder === undefined || taskOrder === null) {
      const snap = await tasksCol.get();
      taskOrder = snap.size;
    }

    const taskData = {
      title: title.trim(),
      isCompleted: false,
      startedAt: null,
      timeSpentSeconds: 0,
      completedAt: null,
      order: Number(taskOrder),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const taskRef = await tasksCol.add(taskData);

    await checkRef.update({
      taskCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({ id: taskRef.id, ...taskData });
  } catch (error) {
    console.error("[Tasks:POST] Error creating task:", error);
    return res.status(500).json({ error: "Failed to create task", message: error.message });
  }
});

/**
 * PATCH /api/checklists/:id/tasks/:taskId
 * Updates task fields (rename, start stopwatch, pause stopwatch, uncomplete).
 */
app.patch("/api/checklists/:id/tasks/:taskId", async (req, res) => {
  try {
    const { id, taskId } = req.params;
    const uid = req.user.uid;
    const { title, isCompleted, startedAt, timeSpentSeconds, order } = req.body;

    const taskRef = db.doc(`users/${uid}/checklists/${id}/tasks/${taskId}`);
    const taskSnap = await taskRef.get();

    if (!taskSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Task not found." });
    }

    const currentTask = taskSnap.data();
    const updates = {};

    if (title !== undefined) updates.title = String(title).trim();
    if (order !== undefined) updates.order = Number(order);

    if (startedAt !== undefined) {
      updates.startedAt = startedAt === null ? null : admin.firestore.FieldValue.serverTimestamp();
    }
    if (timeSpentSeconds !== undefined) {
      updates.timeSpentSeconds = Number(timeSpentSeconds);
    }

    if (isCompleted !== undefined) {
      updates.isCompleted = Boolean(isCompleted);
      if (isCompleted) {
        updates.completedAt = admin.firestore.FieldValue.serverTimestamp();
      } else {
        updates.completedAt = null;
        // If uncompleting, decrement completedCount on parent checklist
        if (currentTask.isCompleted) {
          await db.doc(`users/${uid}/checklists/${id}`).update({
            completedCount: admin.firestore.FieldValue.increment(-1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }

    await taskRef.update(updates);
    return res.json({ id: taskId, ...currentTask, ...updates });
  } catch (error) {
    console.error("[Tasks:PATCH] Error updating task:", error);
    return res.status(500).json({ error: "Failed to update task", message: error.message });
  }
});

/**
 * DELETE /api/checklists/:id/tasks/:taskId
 * Deletes a single task and decrements checklist counters.
 */
app.delete("/api/checklists/:id/tasks/:taskId", async (req, res) => {
  try {
    const { id, taskId } = req.params;
    const uid = req.user.uid;

    const taskRef = db.doc(`users/${uid}/checklists/${id}/tasks/${taskId}`);
    const taskSnap = await taskRef.get();

    if (!taskSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Task not found." });
    }

    const taskData = taskSnap.data();
    const checkRef = db.doc(`users/${uid}/checklists/${id}`);

    const batch = db.batch();
    batch.delete(taskRef);

    const checkUpdates = {
      taskCount: admin.firestore.FieldValue.increment(-1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (taskData.isCompleted) {
      checkUpdates.completedCount = admin.firestore.FieldValue.increment(-1);
    }

    batch.update(checkRef, checkUpdates);
    await batch.commit();

    return res.json({ success: true, message: `Task ${taskId} deleted.` });
  } catch (error) {
    console.error("[Tasks:DELETE] Error deleting task:", error);
    return res.status(500).json({ error: "Failed to delete task", message: error.message });
  }
});

/**
 * POST /api/checklists/:id/tasks/reorder
 * Batch updates order fields for an array of tasks [{ id, order }].
 */
app.post("/api/checklists/:id/tasks/reorder", async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Validation Error", message: "items must be an array of { id, order }." });
    }

    const batch = db.batch();
    items.forEach((item) => {
      if (item.id && typeof item.order === "number") {
        const taskRef = db.doc(`users/${uid}/checklists/${id}/tasks/${item.id}`);
        batch.update(taskRef, { order: item.order });
      }
    });

    await batch.commit();
    return res.json({ success: true, updatedCount: items.length });
  } catch (error) {
    console.error("[Tasks:REORDER] Error reordering tasks:", error);
    return res.status(500).json({ error: "Failed to reorder tasks", message: error.message });
  }
});

/* ==========================================================================
   4. TIMER COMPLETION & TIMELOGS ENDPOINT
   ========================================================================== */

/**
 * POST /api/timer/complete
 * Completes a task:
 *   - Auto-stops running timer and calculates final duration
 *   - Sets isCompleted: true and stamps completedAt
 *   - Atomically increments checklist completedCount
 *   - Writes append-only record to users/{uid}/timeLogs
 */
app.post("/api/timer/complete", async (req, res) => {
  try {
    const uid = req.user.uid;
    const { checklistId, taskId, categoryId, timerEnabled } = req.body;

    if (!checklistId || !taskId) {
      return res.status(400).json({ error: "Validation Error", message: "checklistId and taskId are required." });
    }

    const taskRef = db.doc(`users/${uid}/checklists/${checklistId}/tasks/${taskId}`);
    const checkRef = db.doc(`users/${uid}/checklists/${checklistId}`);

    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      return res.status(404).json({ error: "Not Found", message: "Task not found." });
    }

    const taskData = taskSnap.data();
    let totalDurationSeconds = taskData.timeSpentSeconds || 0;

    // Calculate running timer delta if task was active
    if (taskData.startedAt) {
      const now = Date.now();
      const startMs = taskData.startedAt.toDate ? taskData.startedAt.toDate().getTime() : now;
      const liveDelta = Math.max(0, Math.floor((now - startMs) / 1000));
      totalDurationSeconds += liveDelta;
    }

    const todayDateStr = getLocalDateString(new Date());
    const batch = db.batch();

    // 1. Update task document
    batch.update(taskRef, {
      isCompleted: true,
      startedAt: null,
      timeSpentSeconds: totalDurationSeconds,
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Increment completedCount on checklist
    if (!taskData.isCompleted) {
      batch.update(checkRef, {
        completedCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 3. Write append-only immutable timeLog record
    const timeLogRef = db.collection(`users/${uid}/timeLogs`).doc();
    batch.set(timeLogRef, {
      checklistId,
      taskId,
      categoryId: categoryId || "",
      date: todayDateStr,
      durationSeconds: timerEnabled !== false ? totalDurationSeconds : null,
      completed: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return res.json({
      success: true,
      taskId,
      totalDurationSeconds,
      date: todayDateStr
    });
  } catch (error) {
    console.error("[Timer:COMPLETE] Error completing task with timer:", error);
    return res.status(500).json({ error: "Failed to complete task", message: error.message });
  }
});

/* ==========================================================================
   5. ANALYTICS PRE-AGGREGATION ENDPOINT
   ========================================================================== */

/**
 * GET /api/analytics
 * Queries users/{uid}/timeLogs and pre-aggregates daily metrics on the server for 7d or 30d.
 */
app.get("/api/analytics", async (req, res) => {
  try {
    const uid = req.user.uid;
    const { checklistId, days = 7 } = req.query;
    const rangeDays = Math.min(Math.max(Number(days) || 7, 1), 60);

    // Calculate date range window
    const targetDate = new Date();
    const dateList = [];
    const dateBucketMap = new Map();

    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const displayLabel = d.toLocaleDateString("en-US", {
        weekday: rangeDays <= 7 ? "short" : undefined,
        month: rangeDays > 7 ? "numeric" : undefined,
        day: "numeric"
      });

      dateList.push({ dateStr, displayLabel });
      dateBucketMap.set(dateStr, {
        completedCount: 0,
        durationSeconds: 0
      });
    }

    const startDateStr = dateList[0].dateStr;

    let q = db.collection(`users/${uid}/timeLogs`).where("date", ">=", startDateStr);
    if (checklistId) {
      q = q.where("checklistId", "==", checklistId);
    }

    const logsSnap = await q.get();

    logsSnap.forEach((doc) => {
      const log = doc.data();
      if (dateBucketMap.has(log.date)) {
        const bucket = dateBucketMap.get(log.date);
        if (log.completed) {
          bucket.completedCount += 1;
        }
        if (log.durationSeconds) {
          bucket.durationSeconds += log.durationSeconds;
        }
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

      if (bucket.completedCount > 0 || bucket.durationSeconds > 0) {
        totalActiveDays += 1;
      }
      totalCompletions += bucket.completedCount;
      totalSeconds += bucket.durationSeconds;
    });

    const avgRate = Math.round((totalActiveDays / rangeDays) * 100);
    const totalMinutes = Math.round(totalSeconds / 60);

    return res.json({
      rangeDays,
      labels,
      completedCounts,
      durationsMinutes,
      summary: {
        avgRate,
        activeDays: totalActiveDays,
        totalDays: rangeDays,
        totalCompletions,
        totalMinutes
      }
    });
  } catch (error) {
    console.error("[Analytics:GET] Error generating analytics:", error);
    return res.status(500).json({ error: "Failed to generate analytics", message: error.message });
  }
});

/* ==========================================================================
   6. RESET ENGINE ENDPOINT
   ========================================================================== */

/**
 * POST /api/engine/reset
 * Evaluates and executes the transactional midnight reset across all daily checklists for the user.
 */
app.post("/api/engine/reset", async (req, res) => {
  try {
    const uid = req.user.uid;
    const now = new Date();
    const midnightMs = getLocalMidnightDate(now).getTime();

    // Query daily checklists
    const snap = await db
      .collection(`users/${uid}/checklists`)
      .where("settings.resetMode", "==", "daily")
      .get();

    let resetCount = 0;
    const details = [];

    for (const checkDoc of snap.docs) {
      const checklistData = checkDoc.data();
      const lastResetAt = checklistData.lastResetAt;

      let resetMs = 0;
      if (lastResetAt?.toMillis) resetMs = lastResetAt.toMillis();
      else if (lastResetAt?.toDate) resetMs = lastResetAt.toDate().getTime();

      // Check if due for daily reset
      if (!lastResetAt || resetMs < midnightMs) {
        const checkRef = checkDoc.ref;
        const tasksSnap = await checkRef.collection("tasks").get();

        const batch = db.batch();
        let tasksReset = 0;

        tasksSnap.forEach((taskDoc) => {
          const taskData = taskDoc.data();

          // Snapshot active timer across midnight
          if (taskData.startedAt) {
            const startMs = taskData.startedAt.toDate ? taskData.startedAt.toDate().getTime() : Date.now();
            const elapsedDelta = Math.max(0, Math.floor((midnightMs - startMs) / 1000));
            const totalDuration = (taskData.timeSpentSeconds || 0) + elapsedDelta;

            if (totalDuration > 0) {
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);

              const timeLogRef = db.collection(`users/${uid}/timeLogs`).doc();
              batch.set(timeLogRef, {
                checklistId: checkDoc.id,
                taskId: taskDoc.id,
                categoryId: checklistData.categoryId || "",
                date: getLocalDateString(yesterday),
                durationSeconds: totalDuration,
                completed: Boolean(taskData.isCompleted),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          }

          batch.update(taskDoc.ref, {
            isCompleted: false,
            startedAt: null,
            timeSpentSeconds: 0,
            completedAt: null
          });
          tasksReset++;
        });

        batch.update(checkRef, {
          lastResetAt: admin.firestore.FieldValue.serverTimestamp(),
          completedCount: 0
        });

        await batch.commit();
        resetCount++;
        details.push({ id: checkDoc.id, name: checklistData.name, tasksReset });
      }
    }

    return res.json({
      success: true,
      checkedCount: snap.size,
      resetCount,
      details
    });
  } catch (error) {
    console.error("[ResetEngine:POST] Error running reset engine:", error);
    return res.status(500).json({ error: "Failed to run reset engine", message: error.message });
  }
});

// Export Cloud Function "api"
exports.api = onRequest({ cors: true, maxInstances: 10 }, app);
