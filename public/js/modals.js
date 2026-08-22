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
  updateNote,
  deleteNote,
  toggleNoteImportant
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
        }
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
  const submitBtn = modal.querySelector('button[type="submit"]');
  const closeBtn = modal.querySelector("#checklist-settings-close-btn") || modal.querySelector("#checklist-modal-close-btn");
  const cancelBtn = modal.querySelector("#checklist-settings-cancel-btn") || modal.querySelector("#checklist-cancel-btn");

  if (titleEl) titleEl.textContent = "Checklist Settings";
  if (nameInput) nameInput.value = checklist.name || "";
  if (timerToggle) timerToggle.checked = checklist.settings?.timerEnabled !== false;
  if (graphToggle) graphToggle.checked = checklist.settings?.graphEnabled !== false;
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
   4. STICKY NOTE CREATION MODAL (<dialog id="note-modal">)
   ========================================================================== */

/**
 * Open Sticky Note Creation Modal (Title and Color only, no content input)
 * 
 * @param {string} uid - User ID
 * @param {Function} [onCreated] - Callback invoked on successful creation
 */
export function openNoteModal(uid, onCreated) {
  const modal = document.getElementById("note-modal");
  const form = document.getElementById("note-form");
  const titleInput = document.getElementById("note-title-input");
  const importantToggle = document.getElementById("note-important-toggle");
  const submitBtn = document.getElementById("note-submit-btn");
  const closeBtn = document.getElementById("note-modal-close-btn");
  const cancelBtn = document.getElementById("note-cancel-btn");

  if (!modal || !form) {
    console.error("[Modals] note-modal or form element not found in DOM");
    return;
  }

  form.reset();
  const defaultRadio = form.querySelector('input[name="noteColor"][value="butter"]');
  if (defaultRadio) defaultRadio.checked = true;
  if (importantToggle) importantToggle.checked = false;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Note";
  }

  const handleDismiss = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
    const title = (titleInput?.value || "").trim() || "Untitled Note";
    const colorToken = form.querySelector('input[name="noteColor"]:checked')?.value || "butter";
    const isImportant = Boolean(importantToggle?.checked);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";
    }

    try {
      const createdNote = await createNote(uid, {
        title,
        content: "",
        colorToken,
        isImportant
      });

      modal.close();
      notify(isImportant ? "Note created and pinned to Homescreen ⭐" : "Note created", "success");

      if (typeof onCreated === "function") {
        onCreated(createdNote);
      }

      // Automatically open the tactile sticky note pad so user can directly start typing!
      openStickyNotePad(uid, createdNote, onCreated);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Note";
      }
      cleanup();
    }
  };

  closeBtn?.addEventListener("click", handleDismiss);
  cancelBtn?.addEventListener("click", handleDismiss);
  form.addEventListener("submit", handleSubmit);
  modal.addEventListener("close", handleClose);

  modal.showModal();
  setTimeout(() => titleInput?.focus(), 50);
}

/* ==========================================================================
   4b. COLOR-SPECIFIC STICKY NOTE PAD (<dialog id="sticky-note-pad-modal">)
   ========================================================================== */

const NOTE_THEMES = {
  butter: {
    bg: "bg-amber-100 dark:bg-[#2A2312]",
    border: "border-amber-300 dark:border-amber-800",
    text: "text-amber-950 dark:text-amber-100",
    muted: "text-amber-800/70 dark:text-amber-300/70",
    accent: "bg-amber-400"
  },
  peach: {
    bg: "bg-rose-100 dark:bg-[#2D161D]",
    border: "border-rose-300 dark:border-rose-800",
    text: "text-rose-950 dark:text-rose-100",
    muted: "text-rose-800/70 dark:text-rose-300/70",
    accent: "bg-rose-400"
  },
  mint: {
    bg: "bg-emerald-100 dark:bg-[#122A20]",
    border: "border-emerald-300 dark:border-emerald-800",
    text: "text-emerald-950 dark:text-emerald-100",
    muted: "text-emerald-800/70 dark:text-emerald-300/70",
    accent: "bg-emerald-400"
  },
  sky: {
    bg: "bg-sky-100 dark:bg-[#102434]",
    border: "border-sky-300 dark:border-sky-800",
    text: "text-sky-950 dark:text-sky-100",
    muted: "text-sky-800/70 dark:text-sky-300/70",
    accent: "bg-sky-400"
  },
  lavender: {
    bg: "bg-indigo-100 dark:bg-[#1C1F38]",
    border: "border-indigo-300 dark:border-indigo-800",
    text: "text-indigo-950 dark:text-indigo-100",
    muted: "text-indigo-800/70 dark:text-indigo-300/70",
    accent: "bg-indigo-400"
  },
  coral: {
    bg: "bg-orange-100 dark:bg-[#301A0E]",
    border: "border-orange-300 dark:border-orange-800",
    text: "text-orange-950 dark:text-orange-100",
    muted: "text-orange-800/70 dark:text-orange-300/70",
    accent: "bg-orange-400"
  },
  violet: {
    bg: "bg-purple-100 dark:bg-[#281335]",
    border: "border-purple-300 dark:border-purple-800",
    text: "text-purple-950 dark:text-purple-100",
    muted: "text-purple-800/70 dark:text-purple-300/70",
    accent: "bg-purple-400"
  },
  teal: {
    bg: "bg-teal-100 dark:bg-[#0E2725]",
    border: "border-teal-300 dark:border-teal-800",
    text: "text-teal-950 dark:text-teal-100",
    muted: "text-teal-800/70 dark:text-teal-300/70",
    accent: "bg-teal-400"
  },
  sage: {
    bg: "bg-lime-100 dark:bg-[#1F2B0E]",
    border: "border-lime-300 dark:border-lime-800",
    text: "text-lime-950 dark:text-lime-100",
    muted: "text-lime-800/70 dark:text-lime-300/70",
    accent: "bg-lime-500"
  },
  slate: {
    bg: "bg-slate-100 dark:bg-[#1E293B]",
    border: "border-slate-300 dark:border-slate-700",
    text: "text-slate-900 dark:text-slate-100",
    muted: "text-slate-600 dark:text-slate-400",
    accent: "bg-slate-400"
  }
};

function formatNotePadDate(timestamp) {
  if (!timestamp) return "Recently";
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return `Today at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * Open Interactive Color-Specific Sticky Note Pad for direct typing and saving
 * 
 * @param {string} uid - User ID
 * @param {Object} note - Sticky Note Document
 * @param {Function} [onSaved] - Callback invoked on note update
 */
export function openStickyNotePad(uid, note, onSaved) {
  if (!uid || !note) return;

  const modal = document.getElementById("sticky-note-pad-modal");
  const wrapper = document.getElementById("sticky-note-pad-wrapper");
  const titleInput = document.getElementById("sticky-note-pad-title");
  const contentInput = document.getElementById("sticky-note-pad-content");
  const dateEl = document.getElementById("sticky-note-pad-date");
  const statusEl = document.getElementById("sticky-note-pad-status");
  const starBtn = document.getElementById("sticky-note-pad-star-btn");
  const starIcon = document.getElementById("sticky-note-pad-star-icon");
  const deleteBtn = document.getElementById("sticky-note-pad-delete-btn");
  const closeBtn = document.getElementById("sticky-note-pad-close-btn");
  const saveBtn = document.getElementById("sticky-note-pad-save-btn");
  const paletteMenu = document.getElementById("sticky-note-pad-palette-menu");

  if (!modal || !wrapper || !titleInput || !contentInput) {
    console.error("[Modals] sticky-note-pad-modal elements not found in DOM");
    return;
  }

  let currentColor = note.colorToken || "butter";
  let isImportant = Boolean(note.isImportant);
  let hasUnsavedChanges = false;
  let saveTimeout = null;

  // Build list of all theme classes to clear
  const allThemeClasses = [];
  Object.values(NOTE_THEMES).forEach((t) => {
    t.bg.split(" ").forEach((c) => c && allThemeClasses.push(c));
    t.border.split(" ").forEach((c) => c && allThemeClasses.push(c));
    t.text.split(" ").forEach((c) => c && allThemeClasses.push(c));
  });

  const applyTheme = (color) => {
    currentColor = color;
    const theme = NOTE_THEMES[color] || NOTE_THEMES.butter;
    allThemeClasses.forEach((cls) => {
      wrapper.classList.remove(cls);
      modal.classList.remove(cls);
    });
    theme.bg.split(" ").forEach((c) => c && wrapper.classList.add(c));
    theme.border.split(" ").forEach((c) => c && modal.classList.add(c));
    theme.text.split(" ").forEach((c) => c && wrapper.classList.add(c));
  };

  const updateStarUI = () => {
    if (starIcon) {
      starIcon.textContent = isImportant ? "star" : "star_outline";
      if (isImportant) {
        starIcon.className = "material-symbols-outlined material-symbols-filled text-lg text-amber-500";
        starIcon.style.fontVariationSettings = "'FILL' 1";
      } else {
        starIcon.className = "material-symbols-outlined text-lg opacity-60 hover:opacity-100";
        starIcon.style.fontVariationSettings = "'FILL' 0";
      }
    }
  };

  // Populate UI
  applyTheme(currentColor);
  titleInput.value = note.title || "";
  contentInput.value = note.content || "";
  if (dateEl) dateEl.textContent = formatNotePadDate(note.createdAt || note.updatedAt);
  if (statusEl) {
    statusEl.textContent = "Saved ✓";
    statusEl.className = "font-medium text-emerald-600 dark:text-emerald-400";
  }
  updateStarUI();

  // Save implementation
  const saveNote = async (silent = true) => {
    const title = titleInput.value.trim() || "Untitled Note";
    const content = contentInput.value;

    if (statusEl) {
      statusEl.textContent = "Saving...";
      statusEl.className = "font-medium text-amber-600 dark:text-amber-400";
    }

    try {
      await updateNote(uid, note.id, {
        title,
        content,
        colorToken: currentColor,
        isImportant
      });
      hasUnsavedChanges = false;
      if (statusEl) {
        statusEl.textContent = "Saved ✓";
        statusEl.className = "font-medium text-emerald-600 dark:text-emerald-400";
      }
      if (dateEl) dateEl.textContent = "Just now";
      if (!silent && typeof window.showToast === "function") {
        window.showToast("Note saved", "success");
      }
      if (typeof onSaved === "function") onSaved();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = "Error saving";
        statusEl.className = "font-medium text-rose-500";
      }
      notify(err.message, "error");
    }
  };

  const triggerDebouncedSave = () => {
    hasUnsavedChanges = true;
    if (statusEl) {
      statusEl.textContent = "Typing...";
      statusEl.className = "font-medium opacity-60";
    }
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveNote(true);
    }, 600);
  };

  const handleInput = () => triggerDebouncedSave();

  const handleStarClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    isImportant = !isImportant;
    updateStarUI();
    await saveNote(true);
    notify(isImportant ? "Note pinned to Homescreen ⭐" : "Note unpinned from Homescreen", "info");
  };

  const handleDeleteClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = await showConfirmModal({
      title: "Delete Sticky Note",
      message: `Are you sure you want to delete "${titleInput.value || "this note"}"? This cannot be undone.`,
      confirmText: "Delete Note"
    });
    if (confirmed) {
      try {
        await deleteNote(uid, note.id);
        modal.close();
        notify("Note deleted", "success");
      } catch (err) {
        notify(err.message, "error");
      }
    }
  };

  const handleSaveClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(saveTimeout);
    await saveNote(false);
    modal.close();
  };

  const handleClose = async () => {
    clearTimeout(saveTimeout);
    if (hasUnsavedChanges) {
      await saveNote(true);
    }
    cleanup();
  };

  const handleDismiss = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    modal.close();
  };

  const colorBtn = document.getElementById("sticky-note-pad-color-btn");

  const handleColorBtnClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (paletteMenu) {
      paletteMenu.classList.toggle("hidden");
      paletteMenu.classList.toggle("flex");
    }
  };

  const handlePaletteClick = async (e) => {
    const btn = e.target.closest("button[data-color]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const newColor = btn.getAttribute("data-color");
    if (newColor && newColor !== currentColor) {
      applyTheme(newColor);
      await saveNote(true);
    }
    if (paletteMenu) {
      paletteMenu.classList.add("hidden");
      paletteMenu.classList.remove("flex");
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      clearTimeout(saveTimeout);
      saveNote(false);
    }
  };

  const cleanup = () => {
    titleInput.removeEventListener("input", handleInput);
    contentInput.removeEventListener("input", handleInput);
    starBtn?.removeEventListener("click", handleStarClick);
    deleteBtn?.removeEventListener("click", handleDeleteClick);
    saveBtn?.removeEventListener("click", handleSaveClick);
    closeBtn?.removeEventListener("click", handleDismiss);
    colorBtn?.removeEventListener("click", handleColorBtnClick);
    paletteMenu?.removeEventListener("click", handlePaletteClick);
    window.removeEventListener("keydown", handleKeyDown);
    modal.removeEventListener("close", handleClose);
  };

  titleInput.addEventListener("input", handleInput);
  contentInput.addEventListener("input", handleInput);
  starBtn?.addEventListener("click", handleStarClick);
  deleteBtn?.addEventListener("click", handleDeleteClick);
  saveBtn?.addEventListener("click", handleSaveClick);
  closeBtn?.addEventListener("click", handleDismiss);
  colorBtn?.addEventListener("click", handleColorBtnClick);
  paletteMenu?.addEventListener("click", handlePaletteClick);
  window.addEventListener("keydown", handleKeyDown);
  modal.addEventListener("close", handleClose);

  modal.showModal();
  setTimeout(() => contentInput.focus(), 80);
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

  // Permanently wire all modal close and cancel buttons across the app
  const wireClose = (btnId, modalId) => {
    const btn = document.getElementById(btnId);
    const modal = document.getElementById(modalId);
    if (btn && modal) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.close();
      });
    }
  };

  wireClose("category-modal-close-btn", "category-modal");
  wireClose("category-cancel-btn", "category-modal");
  wireClose("checklist-modal-close-btn", "checklist-modal");
  wireClose("checklist-cancel-btn", "checklist-modal");
  wireClose("checklist-settings-close-btn", "checklist-settings-modal");
  wireClose("checklist-settings-cancel-btn", "checklist-settings-modal");
  wireClose("note-modal-close-btn", "note-modal");
  wireClose("note-cancel-btn", "note-modal");
  wireClose("sticky-note-pad-close-btn", "sticky-note-pad-modal");
  wireClose("profile-modal-close-btn", "profile-modal");
  wireClose("profile-modal-done-btn", "profile-modal");
  wireClose("guest-help-modal-close-btn", "guest-help-modal");
  wireClose("guest-help-close-btn", "guest-help-modal");
  wireClose("confirm-cancel-btn", "confirm-modal");
}

export default {
  openCategoryModal,
  openChecklistModal,
  openChecklistSettingsModal,
  openNoteModal,
  openStickyNotePad,
  showConfirmModal,
  initModalBackdrops
};
