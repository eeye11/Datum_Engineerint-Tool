/*
 * The Note editor.
 *
 * A Note is the student's own words about the drawing, so it has to be
 * writable: double-clicking it opens this box, the student types, and the
 * text is handed back as ONE change the caller can commit as one undoable
 * action.
 *
 * It is deliberately a small dialog rather than inline editing on the
 * canvas: a note can be multi-line, and a multi-line field is a thing the
 * keyboard's own rules already govern - Enter inserts a newline, and only
 * an explicit confirm (the Apply button or Ctrl+Enter) hands the text back.
 *
 * A GENERATED annotation is refused one, because its text is a reading of
 * its feature and a next redraw would overwrite anything typed - the
 * caller guards for that before opening this.
 */

let openDialog = null;

let closeCurrent = null;

function close() {
  if (openDialog) {
    openDialog.remove();
    openDialog = null;
  }

  closeCurrent = null;
}

function isOpen() {
  return openDialog !== null;
}

/*
 * Escape reaches this dialog the same way it reaches the dimension
 * editor: the global handler asks every open dialog whether it wants the
 * key, and the first one that does swallows it.
 */
function handleEscape() {
  if (!openDialog) {
    return false;
  }

  closeCurrent?.();

  return true;
}

function open(options = {}) {
  close();

  const dialog = document.createElement("div");

  dialog.className = "drawing-dimension-dialog drawing-note-dialog";

  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Edit Note");

  dialog.innerHTML = `
        <div class="drawing-dimension-dialog-title">
            Edit Note
        </div>

        <label class="drawing-dimension-dialog-label" for="noteText">
            Note
        </label>
        <textarea id="noteText"
            class="drawing-property-input drawing-note-dialog-text"
            rows="4"
            aria-label="Note text">${escapeHtml(options.text ?? "")}</textarea>

        <div class="drawing-scale-dialog-actions">
            <button type="button"
                data-note-cancel>Cancel</button>
            <button type="button"
                class="primary"
                data-note-apply>Apply</button>
        </div>
    `;

  document.body.appendChild(dialog);

  openDialog = dialog;

  const closeIt = () => {
    close();
    options.onCancel?.();
  };

  const apply = () => {
    const text = dialog.querySelector("#noteText").value;

    close();

    options.onApply?.(text);
  };

  dialog.querySelector("[data-note-apply]").addEventListener("click", apply);

  dialog.querySelector("[data-note-cancel]").addEventListener("click", closeIt);

  /*
   * ENTER INSERTS A LINE BREAK; CTRL+ENTER CONFIRMS.
   *
   * A note is multi-line, so the plain Enter key has to keep meaning
   * "new line" - an editor that closes on the key a student presses
   * between sentences is an editor that cannot write sentences. The
   * confirm is the one key that cannot be confused with prose: the
   * combination, or the button.
   */
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      apply();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeIt();
    }
  });

  dialog.querySelector("#noteText")?.focus();

  return dialog;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

const enggNoteEditor = {
  close,
  handleEscape,
  isOpen,
  open,
};

export default enggNoteEditor;
