/**
 * @file modals.js
 * @description Modal coordinator for Daylign using native HTML5 <dialog> elements.
 * Manages Category Creation/Edit, Checklist Creation, Checklist Settings (with timer auto-stop edge case),
 * and confirmation dialogs.
 */

import {
  createCategory,
  updateCategory,
  createChecklist,
  updateChecklist,
  stopAllRunningTimersInChecklist,
  createNote,
  updateNote
} from "./db.js";

/**
 * Toast helper function reference (injected or window event fallback)
 * @param {string} msg 
 * @param {"info"|"success"|"error"} type 
 */
function notify(msg, type = "info") {
  if (typeof window.showToast === "function") {
    window.showToast(msg, type);
  } else {
    console.log(`[Toast] [${type}] ${msg}`);
  }
}

/* ==========================================================================
   1. CATEGORY MODAL (<dialog id="category-modal">)
   ========================================================================== */

/**
 * Open Category Modal for creation or editing
 * 
 * @param {string} uid - User ID
 * @param {Object} [editCategory=null] - Category document to edit, or null to create
 * @param {Function} [onSaved] - Callback invoked on successful save
 */
export function openCategoryModal(uid, editCategory = null, onSaved) {
  const modal = document.getElementById("category-modal");
  const form = document.getElementById("category-form");
  const titleEl = document.getElementById("category-modal-title");
  const idInput = document.getElementById("category-id-input");
  const nameInput = document.getElementById("category-name-input");
  const submitBtn = document.getElementById("category-submit-btn");
  const closeBtn = document.getElementById("category-modal-close-btn");
  const cancelBtn = document.getElementById("category-cancel-btn");

  if (!modal || !form) {
    console.error("[Modals] category-modal or form element not found in DOM");
    return;
  }

  if (editCategory) {
    titleEl.textContent = "Edit Category";
    idInput.value = editCategory.id;
    nameInput.value = editCategory.name || "";
    
    const radio = form.querySelector(`input[name="colorToken"][value="${editCategory.colorToken || "lavender"}"]`);
    if (radio) radio.checked = true;
    if (submitBtn) submitBtn.textContent = "Save Changes";
  } else {
    titleEl.textContent = "New Category";
    form.reset();
    idInput.value = "";
    const defaultRadio = form.querySelector('input[name="colorToken"][value="lavender"]');
    if (defaultRadio) defaultRadio.checked = true;
    if (submitBtn) submitBtn.textContent = "Create Category";
  }

  const handleDismiss = () => {
    modal.close();
  };

  const cleanup = () => {
    form.removeEventListener("submit", handleSubmit);
    modal.removeEventListener("close", handleClose);
    closeBtn?.removeEventListener("click", handleDismiss);
    cancelBtn?.removeEventListener("click", handleDismiss);
  };

  const handleClose = () => {
    cleanup();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      notify("Category name is required", "error");
      nameInput.focus();
      return;
    }

    const icon = editCategory?.icon || "category";
    const colorToken = form.querySelector('input[name="colorToken"]:checked')?.value || "lavender";
    const categoryId = idInput.value;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    try {
      if (categoryId) {
        await updateCategory(uid, categoryId, { name, icon, colorToken });
        notify(`Updated category "${name}"`, "success");
      } else {
        await createCategory(uid, { name, icon, colorToken });
        notify(`Created category "${name}"`, "success");
      }
      modal.close();
      if (typeof onSaved === "function") onSaved();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = categoryId ? "Save Changes" : "Create Category";
      }
      cleanup();
    }
  };

  closeBtn?.addEventListener("click", handleDismiss);
  cancelBtn?.addEventListener("click", handleDismiss);
  form.addEventListener("submit", handleSubmit);
  modal.addEventListener("close", handleClose);

  modal.showModal();
  nameInput.focus();
}

/* ==========================================================================
   2. CHECKLIST CREATION MODAL (<dialog id="checklist-modal">)
   ========================================================================== */

/**
 * Open Checklist Creation Modal (AppFlow.md §2)
 * 
 * @param {string} uid - User ID
 * @param {string} categoryId - Foreign key to category
 * @param {Function} [onCreated] - Callback invoked with created checklistId
 */
export function openChecklistModal(uid, categoryId, onCreated) {
  const modal = document.getElementById("checklist-modal");
  const form = document.getElementById("checklist-form");
  const nameInput = document.getElementById("checklist-name-input");
  const timerToggle = document.getElementById("checklist-timer-toggle");
  const graphToggle = document.getElementById("checklist-graph-toggle");
  const tasksInput = document.getElementById("initial-tasks-input");
  const submitBtn = document.getElementById("checklist-submit-btn");
  const closeBtn = document.getElementById("checklist-modal-close-btn");
  const cancelBtn = document.getElementById("checklist-cancel-btn");

  if (!modal || !form) {
    console.error("[Modals] checklist-modal or form element not found in DOM");
    return;
  }

  form.reset();
  if (timerToggle) timerToggle.checked = true;
  if (graphToggle) graphToggle.checked = true;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Checklist";
  }

  const handleDismiss = () => {
    modal.close();
  };

  const cleanup = () => {
    form.removeEventListener("submit", handleSubmit);
    modal.removeEventListener("close", handleClose);
    closeBtn?.removeEventListener("click", handleDismiss);
    cancelBtn?.removeEventListener("click", handleDismiss);
  };

  const handleClose = () => {
    cleanup();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      notify("Checklist title is required", "error");
      nameInput.focus();
      return;
    }

    const resetMode = form.querySelector('input[name="resetMode"]:checked')?.value || "daily";
    const isTimerEnabled = timerToggle ? timerToggle.checked : true;
    const isGraphEnabled = graphToggle ? graphToggle.checked : true;
    const rawTasks = tasksInput ? tasksInput.value : "";
    const initialTasks = rawTasks
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";
    }

    try {
      const result = await createChecklist(uid, {
        categoryId,
        name,
        settings: {
          resetMode,
          timerEnabled: isTimerEnabled,
          graphEnabled: isGraphEnabled
        },
        initialTasks: initialTasks
      });

      // Extract ID from result object (createChecklist returns { id, ...data })
      const newChecklistId = result?.id || result;

      notify(`Created checklist "${name}"`, "success");
      modal.close();

      if (typeof onCreated === "function") {
        onCreated(newChecklistId);
      }
    } catch (err) {
      notify(err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Checklist";
      }
      cleanup();
    }
  };

  closeBtn?.addEventListener("click", handleDismiss);
  cancelBtn?.addEventListener("click", handleDismiss);
  form.addEventListener("submit", handleSubmit);
  modal.addEventListener("close", handleClose);

  modal.showModal();
  nameInput.focus();
}

/* ==========================================================================
   3. CHECKLIST SETTINGS MODAL (<dialog id="checklist-settings-modal">)
   ========================================================================== */

/**
 * Open Checklist Settings Modal (AppFlow.md §6)
 * Handles edge case: switching timerEnabled true -> false auto-stops running timers
 * and logs accumulated time before persisting settings.
 * 
 * @param {string} uid - User ID
 * @param {Object} checklist - Existing checklist document
 * @param {Function} [onSaved] - Callback on save
 */
export function openChecklistSettingsModal(uid, checklist, onSaved) {
  let modal = document.getElementById("checklist-settings-modal");
  
  // If dedicated settings modal is not in DOM, fallback to checklist-modal configured for settings
  if (!modal) {
    modal = document.getElementById("checklist-modal");
  }
  if (!modal) return;

  const form = modal.querySelector("form");
  const titleEl = modal.querySelector("h2");
  const nameInput = modal.querySelector('input[type="text"]');
  const timerToggle = modal.querySelector("#checklist-settings-timer-toggle") || modal.querySelector("#checklist-timer-toggle");
  const graphToggle = modal.querySelector("#checklist-settings-graph-toggle") || modal.querySelector("#checklist-graph-toggle");
  const tasksSection = modal.querySelector("#initial-tasks-section");
  const submitBtn = modal.querySelector('button[type="submit"]');
  const closeBtn = modal.querySelector("#checklist-settings-close-btn") || modal.querySelector("#checklist-modal-close-btn");
  const cancelBtn = modal.querySelector("#checklist-settings-cancel-btn") || modal.querySelector("#checklist-cancel-btn");

  if (titleEl) titleEl.textContent = "Checklist Settings";
  if (nameInput) nameInput.value = checklist.name || "";
  if (timerToggle) timerToggle.checked = checklist.settings?.timerEnabled !== false;
  if (graphToggle) graphToggle.checked = checklist.settings?.graphEnabled !== false;
  if (tasksSection) tasksSection.classList.add("hidden");
  if (submitBtn) submitBtn.textContent = "Save Changes";

  const resetRadio = form.querySelector(`input[name="resetMode"][value="${checklist.settings?.resetMode || "daily"}"]`);
  if (resetRadio) resetRadio.checked = true;

  const handleDismiss = () => {
    modal.close();
  };

  const cleanup = () => {
    form.removeEventListener("submit", handleSubmit);
    modal.removeEventListener("close", handleClose);
    closeBtn?.removeEventListener("click", handleDismiss);
    cancelBtn?.removeEventListener("click", handleDismiss);
    if (tasksSection) tasksSection.classList.remove("hidden");
  };

  const handleClose = () => {
    cleanup();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newName = nameInput.value.trim();
    if (!newName) {
      notify("Checklist title is required", "error");
      nameInput.focus();
      return;
    }

    const newResetMode = form.querySelector('input[name="resetMode"]:checked')?.value || "daily";
    const newTimerEnabled = timerToggle ? timerToggle.checked : true;
    const newGraphEnabled = graphToggle ? graphToggle.checked : true;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    try {
      // EDGE CASE CHECK (AppFlow.md §6 & PRD.md §4 FR-3):
      // If timer was previously enabled and is now toggled OFF, auto-stop and log all running timers
      const wasTimerEnabled = checklist.settings?.timerEnabled !== false;
      if (wasTimerEnabled && !newTimerEnabled) {
        console.info(`[Modals] Auto-stopping active timers for checklist ${checklist.id} due to timer disabled.`);
        await stopAllRunningTimersInChecklist(uid, checklist.id);
      }

      await updateChecklist(uid, checklist.id, {
        name: newName,
        settings: {
          resetMode: newResetMode,
          timerEnabled: newTimerEnabled,
          graphEnabled: newGraphEnabled
        }
      });

      notify("Checklist settings saved", "success");
      modal.close();

      if (typeof onSaved === "function") {
        onSaved({
          ...checklist,
          name: newName,
          settings: {
            resetMode: newResetMode,
            timerEnabled: newTimerEnabled,
            graphEnabled: newGraphEnabled
          }
        });
      }
    } catch (err) {
      notify(err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
      }
      cleanup();
    }
  };

  closeBtn?.addEventListener("click", handleDismiss);
  cancelBtn?.addEventListener("click", handleDismiss);
  form.addEventListener("submit", handleSubmit);
  modal.addEventListener("close", handleClose);

  modal.showModal();
  if (nameInput) nameInput.focus();
}

/* ==========================================================================
   4. STICKY NOTE MODAL (<dialog id="note-modal">)
   ========================================================================== */

/**
 * Open Sticky Note Modal for creation or editing
 * 
 * @param {string} uid - User ID
 * @param {Object} [editNote=null] - Note document to edit
 * @param {Function} [onSaved] - Callback invoked on successful save
 */
export function openNoteModal(uid, editNote = null, onSaved) {
  const modal = document.getElementById("note-modal");
  const form = document.getElementById("note-form");
  const titleEl = document.getElementById("note-modal-title");
  const idInput = document.getElementById("note-id-input");
  const titleInput = document.getElementById("note-title-input");
  const contentInput = document.getElementById("note-content-input");
  const importantToggle = document.getElementById("note-important-toggle");
  const submitBtn = document.getElementById("note-submit-btn");
  const closeBtn = document.getElementById("note-modal-close-btn");
  const cancelBtn = document.getElementById("note-cancel-btn");

  if (!modal || !form) {
    console.error("[Modals] note-modal or form element not found in DOM");
    return;
  }

  if (editNote) {
    if (titleEl) titleEl.textContent = "Edit Sticky Note";
    if (idInput) idInput.value = editNote.id;
    if (titleInput) titleInput.value = editNote.title || "";
    if (contentInput) contentInput.value = editNote.content || "";
    if (importantToggle) importantToggle.checked = Boolean(editNote.isImportant);
    const radio = form.querySelector(`input[name="noteColor"][value="${editNote.colorToken || "butter"}"]`);
    if (radio) radio.checked = true;
    if (submitBtn) submitBtn.textContent = "Save Changes";
  } else {
    if (titleEl) titleEl.textContent = "New Sticky Note";
    form.reset();
    if (idInput) idInput.value = "";
    const defaultRadio = form.querySelector('input[name="noteColor"][value="butter"]');
    if (defaultRadio) defaultRadio.checked = true;
    if (importantToggle) importantToggle.checked = false;
    if (submitBtn) submitBtn.textContent = "Create Note";
  }

  const handleDismiss = () => {
    modal.close();
  };

  const cleanup = () => {
    form.removeEventListener("submit", handleSubmit);
    modal.removeEventListener("close", handleClose);
    closeBtn?.removeEventListener("click", handleDismiss);
    cancelBtn?.removeEventListener("click", handleDismiss);
  };

  const handleClose = () => {
    cleanup();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const content = contentInput?.value.trim();
    const title = titleInput?.value.trim();
    if (!content && !title) {
      notify("Note content or title is required", "error");
      contentInput?.focus();
      return;
    }

    const colorToken = form.querySelector('input[name="noteColor"]:checked')?.value || "butter";
    const isImportant = Boolean(importantToggle?.checked);
    const noteId = idInput?.value;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    try {
      if (noteId) {
        await updateNote(uid, noteId, { title, content, colorToken, isImportant });
        notify("Note updated", "success");
      } else {
        await createNote(uid, { title, content, colorToken, isImportant });
        notify(isImportant ? "Note created and pinned to Homescreen" : "Note created", "success");
      }
      modal.close();
      if (typeof onSaved === "function") onSaved();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = noteId ? "Save Changes" : "Create Note";
      }
      cleanup();
    }
  };

  closeBtn?.addEventListener("click", handleDismiss);
  cancelBtn?.addEventListener("click", handleDismiss);
  form.addEventListener("submit", handleSubmit);
  modal.addEventListener("close", handleClose);

  modal.showModal();
  if (contentInput) contentInput.focus();
}

/* ==========================================================================
   5. CONFIRMATION MODAL (<dialog id="confirm-modal">)
   ========================================================================== */

/**
 * Reusable Promise-based confirmation modal using native <dialog>
 * 
 * @param {Object} options
 * @param {string} options.title - Header text
 * @param {string} options.message - Explanation text
 * @param {string} [options.confirmText="Delete"] - Confirm button label
 * @param {string} [options.cancelText="Cancel"] - Cancel button label
 * @returns {Promise<boolean>} Resolves true on confirm, false on cancel/escape
 */
export function showConfirmModal({
  title = "Confirm Action",
  message = "Are you sure you want to proceed? This action cannot be undone.",
  confirmText = "Delete",
  cancelText = "Cancel"
}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const titleEl = document.getElementById("confirm-modal-title");
    const descEl = document.getElementById("confirm-modal-description");
    const actionBtn = document.getElementById("confirm-action-btn");
    const cancelBtn = document.getElementById("confirm-cancel-btn");

    if (!modal) {
      console.warn("[Modals] confirm-modal dialog not found in DOM");
      return resolve(window.confirm(`${title}\n\n${message}`));
    }

    // SECURITY: Always set via .textContent (auto-escapes). Never switch to innerHTML.
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;
    if (actionBtn) actionBtn.textContent = confirmText;
    if (cancelBtn) cancelBtn.textContent = cancelText;

    const cleanup = () => {
      actionBtn?.removeEventListener("click", onConfirm);
      cancelBtn?.removeEventListener("click", onCancel);
      modal.removeEventListener("close", onClose);
    };

    const onConfirm = () => {
      cleanup();
      modal.close();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      modal.close();
      resolve(false);
    };

    const onClose = () => {
      cleanup();
      resolve(false);
    };

    actionBtn?.addEventListener("click", onConfirm);
    cancelBtn?.addEventListener("click", onCancel);
    modal.addEventListener("close", onClose);

    modal.showModal();
  });
}

/**
 * Attach backdrop click handlers to all dialogs so clicking the background overlay closes them
 */
export function initModalBackdrops() {
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        dialog.close();
      }
    });
  });

  // Also wire profile-modal and guest-help-modal close buttons
  document.getElementById("profile-modal-close-btn")?.addEventListener("click", () => {
    document.getElementById("profile-modal")?.close();
  });
  document.getElementById("profile-modal-close-btn-bottom")?.addEventListener("click", () => {
    document.getElementById("profile-modal")?.close();
  });
  document.getElementById("guest-help-modal-close-btn")?.addEventListener("click", () => {
    document.getElementById("guest-help-modal")?.close();
  });
  document.getElementById("guest-help-close-btn")?.addEventListener("click", () => {
    document.getElementById("guest-help-modal")?.close();
  });
}

export default {
  openCategoryModal,
  openChecklistModal,
  openChecklistSettingsModal,
  openNoteModal,
  showConfirmModal,
  initModalBackdrops
};
