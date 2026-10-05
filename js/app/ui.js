/*
 * Shared UI primitives for the parts of EnggDraw that float.
 *
 * Three separate features - the sheet context menu, the sheet rename
 * dialog, and whatever opens next - all need the same two things:
 * put something on screen where the user can actually see it, and get
 * out of the way cleanly. Doing that once, here, is the difference
 * between a menu that opens inward near an edge and a menu that opens
 * off it.
 *
 * WHY POSITIONING IS SHARED AND NOT PATCHED
 * -----------------------------------------
 * A menu positioned with a hard-coded offset is right in exactly one
 * place. The sheet bar is at the bottom of the workspace and the tabs
 * scroll horizontally, so "below the tab" is off-screen near the
 * bottom and "left-aligned to the tab" is off-screen near the right.
 * Patching that with a special case means the next surface to open a
 * menu re-learns the same lesson.
 *
 * So the rule lives here instead, and it is stated in one piece:
 *
 *     A floating element goes in the direction that FITS.
 *
 * It measures the real space on each side of its anchor, picks the
 * side with room, and clamps what is left. Every caller supplies an
 * anchor and gets back a position that is inside the viewport by
 * construction.
 *
 * WHY SCREEN COORDINATES, AND WHY THAT MATTERS HERE
 * ------------------------------------------------
 * Everything in this module works in SCREEN coordinates - what the
 * user sees. The drawing itself works in WORLD coordinates, and the
 * canvas has a zoom and a pan that have nothing to do with where a
 * menu appears.
 *
 * Keeping the two apart is not tidiness, it is a correctness
 * requirement: a menu that computed its position in drawing units
 * would move when the student zoomed the canvas, and would land
 * somewhere else entirely when they panned. These are UI overlays and
 * they are never part of the drawing's transform. Nothing in this
 * file reads or writes a camera, a zoom or a pan, and that is
 * deliberate.
 */
(function (root) {
  "use strict";

  /*
   * The gap between an anchor and the panel that opens from it.
   *
   * Small enough to read as attached, large enough that the panel does
   * not appear to be touching the thing it belongs to.
   */
  const ANCHOR_GAP = 4;

  /*
   * The minimum gap left between a panel and the edge of the
   * viewport.
   *
   * A panel flush against the very edge of the window reads as cut off
   * even when it is not, so a little breathing room is kept on every
   * side regardless of how tight the space is.
   */
  const VIEWPORT_MARGIN = 6;

  function viewport() {
    return {
      width:
        root.innerWidth ||
        document.documentElement.clientWidth ||
        0,
      height:
        root.innerHeight ||
        document.documentElement.clientHeight ||
        0
    };
  }

  /*
   * Where a panel should sit, given where it is anchored.
   *
   *   anchor   a DOMRect, or any object shaped like one
   *   size     { width, height } of the panel being placed
   *   options  { gap, margin, preferred }
   *
   * `preferred` is "below", "above", "right" or "left" and says what
   * the panel wants; it does not say where it gets. A menu under a tab
   * wants to open below, and opens above whenever below would not fit.
   *
   * The returned point is guaranteed to keep the whole panel inside
   * the viewport. That guarantee is the point of the function: a
   * caller can place a panel with it without ever asking whether there
   * was room.
   */
  function placeFloating(anchor, size, options = {}) {
    const gap =
      Number.isFinite(options.gap)
        ? options.gap
        : ANCHOR_GAP;

    const margin = Number.isFinite(options.margin)
      ? options.margin
      : VIEWPORT_MARGIN;

    const screen = viewport();

    const panelWidth = Math.max(0, size.width || 0);
    const panelHeight = Math.max(0, size.height || 0);

    /*
     * The room on each side of the anchor. Measured from the anchor's
     * own edges rather than from its centre, because an anchor is
     * never centred on its own position: a tab is a tab, and the
     * panel should relate to the whole of it.
     */
    const room = {
      below: screen.height - anchor.bottom - gap - margin,
      above: anchor.top - gap - margin,
      right: screen.width - anchor.left - gap - margin,
      left: anchor.left - gap - margin
    };

    const preferred =
      options.preferred || "below";

    /*
     * The side to open on.
     *
     * The preferred side is used whenever it fits. Only when it does
     * not is the opposite side considered, and only when the opposite
     * fits too. When neither fits - a very short window - the
     * preferred side is still chosen and the panel is clamped below,
     * because a panel shifted inward with its top cut off is worse
     * than one shifted with its bottom cut off: the top is where a
     * menu's first item is, and that is the item people reach for.
     */
    const fits = {
      below: room.below >= panelHeight,
      above: room.above >= panelHeight,
      right: room.right >= panelWidth,
      left: room.left >= panelWidth
    };

    const opposite = {
      below: "above",
      above: "below",
      right: "left",
      left: "right"
    };

    const vertical =
      preferred === "above" || preferred === "below";

    const useOpposite =
      !fits[preferred] && fits[opposite[preferred]];

    const side = useOpposite ? opposite[preferred] : preferred;

    let top =
      side === "below"
        ? anchor.bottom + gap
        : anchor.top - panelHeight - gap;

    let left =
      side === "right"
        ? anchor.right + gap
        : anchor.left;

    /*
     * Kept on the horizontal axis.
     *
     * Only the axis the panel opened on is anchored; the other is
     * aligned and then clamped. Aligning is what keeps the panel
     * visibly attached to the tab it belongs to, and clamping is what
     * stops a tab at the right edge from taking its menu with it.
     */
    if (vertical) {
      left = clamp(
        anchor.left,
        margin,
        screen.width - panelWidth - margin
      );
    }

    top = clamp(top, margin, screen.height - panelHeight - margin);

    return {
      left: Math.round(left),
      top: Math.round(top),
      side,

      /*
       * Whether the panel had to be pushed to stay on screen. Useful
       * to a caller that wants to know its menu was repositioned -
       * the sheet menu uses it to keep the panel glued to its tab.
       */
      adjusted: useOpposite
    };
  }

  /*
   * Keep a value inside a range.
   *
   * When the range is negative - a panel wider than the viewport - the
   * range collapses and the lower bound is used, which pins the panel
   * to the left or top edge where its start is visible.
   */
  function clamp(value, low, high) {
    if (!Number.isFinite(value)) {
      return low;
    }

    if (high < low) {
      return low;
    }

    return Math.min(Math.max(value, low), high);
  }

  /*
   * Put a positioned element where placeFloating says.
   *
   * Measures first, then places. The two steps have to be in that
   * order: a panel's size is only known once it is in the document,
   * and measuring before placing would mean guessing.
   */
  function anchorElement(element, anchorRect, options = {}) {
    if (!element) {
      return null;
    }

    document.body.appendChild(element);

    const position = placeFloating(
      anchorRect,
      {
        width: element.offsetWidth,
        height: element.offsetHeight
      },
      options
    );

    element.style.position = "fixed";
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;

    return position;
  }

  /*
   * ========================================================
   * MODAL DIALOG
   * ========================================================
   */

  /*
   * One dialog at a time.
   *
   * A second dialog opening while one is up is a bug rather than a
   * feature - there is no case where the student means to rename two
   * sheets at once - so the previous one is closed first. Without
   * this, two dimmed backdrops stack and the Escape key stops
   * working, because each dialog only listens for its own keys.
   */
  let activeDialog = null;

  function isDialogOpen() {
    return activeDialog !== null;
  }

  /*
   * Open a dialog.
   *
   *   options.title       heading
   *   options.description line of explanation under the heading
   *   options.fields      [{ name, label, value, type }]
   *   options.confirm     label for the confirming action
   *   options.cancel      label for the dismissing action
   *   options.onConfirm   ({ name: value }) -> false to stay open
   *
   * The dialog is a real element in the page, not a browser dialog.
   * That is the whole point: it is styled from EnggDraw's own palette,
   * it is positioned by this module's viewport logic so it can never
   * open off-screen, and it does not suspend the page or interrupt
   * anything outside it.
   *
   * Escape cancels and Enter confirms, which are the two conventions a
   * text dialog is expected to have. They are handled here rather than
   * left to each dialog so that every one of them behaves the same.
   */
  function openDialog(options) {
    closeDialog();

    const backdrop =
      document.createElement("div");

    backdrop.className = "engg-dialog-backdrop";

    const dialog =
      document.createElement("div");

    dialog.className = "engg-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    if (options.title) {
      const heading =
        document.createElement("h2");

      heading.className =
        "engg-dialog-title";

      heading.textContent = options.title;

      dialog.appendChild(heading);
    }

    if (options.description) {
      const description =
        document.createElement("p");

      description.className =
        "engg-dialog-description";

      description.textContent =
        options.description;

      dialog.appendChild(description);
    }

    const fields = {};

    (options.fields || []).forEach((field) => {
      const row =
        document.createElement("label");

      row.className = "engg-dialog-field";

      const label =
        document.createElement("span");

      label.className =
        "engg-dialog-field-label";

      label.textContent = field.label || "";

      const input =
        document.createElement("input");

      input.type = field.type || "text";
      input.className =
        "engg-dialog-input";
      input.value =
        field.value === undefined
          ? ""
          : String(field.value);

      if (field.maxLength) {
        input.maxLength = field.maxLength;
      }

      if (field.placeholder) {
        input.placeholder =
          field.placeholder;
      }

      /*
       * The whole value is preselected rather than just the caret
       * being placed at the end. Someone renaming a tab is replacing
       * the name, not appending to it, and having to select the old
       * text first is a step they should not have to take.
       */
      input.select();

      fields[field.name] = input;

      row.appendChild(label);
      row.appendChild(input);

      dialog.appendChild(row);
    });

    const actions =
      document.createElement("div");

    actions.className =
      "engg-dialog-actions";

    const cancelButton =
      document.createElement("button");

    cancelButton.type = "button";
    cancelButton.className =
      "engg-dialog-button";
    cancelButton.textContent =
      options.cancel || "Cancel";

    const confirmButton =
      document.createElement("button");

    confirmButton.type = "button";
    confirmButton.className =
      "engg-dialog-button engg-dialog-button-primary";
    confirmButton.textContent =
      options.confirm || "OK";

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);

    dialog.appendChild(actions);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const values = () =>
      Object.keys(fields).reduce(
        (collected, name) => {
          collected[name] =
            fields[name].value;

          return collected;
        },
        {}
      );

    const confirm = () => {
      /*
       * A confirm handler may refuse - a rename with an empty name
       * has nothing sensible to do - by returning false, which keeps
       * the dialog open and the text where it was rather than
       * closing on a change that was not applied.
       */
      if (
        typeof options.onConfirm === "function" &&
        options.onConfirm(values()) === false
      ) {
        return;
      }

      closeDialog();
    };

    const cancel = () => {
      if (
        typeof options.onCancel === "function"
      ) {
        options.onCancel();
      }

      closeDialog();
    };

    cancelButton.addEventListener(
      "click",
      cancel
    );

    confirmButton.addEventListener(
      "click",
      confirm
    );

    /*
     * Clicking the dimmed area cancels. Clicking the dialog itself
     * must not, so the listener is on the backdrop and the dialog
     * stops it - otherwise every click inside the dialog would dismiss
     * it before the field could be used.
     */
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        cancel();
      }
    });

    dialog.addEventListener(
      "click",
      (event) => event.stopPropagation()
    );

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirm();
      }
    });

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();

        return;
      }

      /*
       * Tab is trapped inside the dialog. Without this, tabbing walks
       * out into the drawing behind it, which then receives the
       * keystroke - and a rename typed into the canvas does nothing
       * at all while appearing to have worked.
       */
      if (event.key === "Tab") {
        trapTab(event, dialog);
      }
    };

    backdrop.addEventListener(
      "keydown",
      onKeyDown
    );

    const onResize = () =>
      centreDialog(dialog);

    root.addEventListener(
      "resize",
      onResize
    );

    activeDialog = {
      backdrop,
      cleanup() {
        root.removeEventListener(
          "resize",
          onResize
        );
      }
    };

    centreDialog(dialog);

    const firstField =
      Object.values(fields)[0];

    if (firstField) {
      firstField.focus();
      firstField.select();
    } else {
      confirmButton.focus();
    }

    if (
      typeof options.onOpen === "function"
    ) {
      options.onOpen(dialog);
    }

    return {
      close: closeDialog
    };
  }

  /*
   * Keep a dialog in the middle of the window.
   *
   * Centred rather than anchored: a dialog is not a menu and has no
   * particular owner on screen, so the middle is where it belongs.
   *
   * It still goes through the same clamp the menus use, because a
   * window can be smaller than the dialog. Without that, opening a
   * dialog in a very short window would leave its buttons below the
   * bottom edge, with no way to reach them - and no way to cancel
   * either, since Escape is handled by the dialog itself.
   */
  function centreDialog(dialog) {
    if (!dialog || !dialog.parentNode) {
      return;
    }

    const screen = viewport();

    dialog.style.left = `${clamp(
      (screen.width - dialog.offsetWidth) / 2,
      VIEWPORT_MARGIN,
      screen.width - dialog.offsetWidth - VIEWPORT_MARGIN
    )}px`;

    dialog.style.top = `${clamp(
      (screen.height - dialog.offsetHeight) / 2,
      VIEWPORT_MARGIN,
      screen.height - dialog.offsetHeight - VIEWPORT_MARGIN
    )}px`;
  }

  function trapTab(event, dialog) {
    const focusable = Array.from(
      dialog.querySelectorAll(
        "button, input, select, textarea, [tabindex]"
      )
    ).filter(
      (node) =>
        !node.disabled &&
        node.offsetParent !== null
    );

    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last =
      focusable[focusable.length - 1];

    if (event.shiftKey &&
        document.activeElement === first) {
      event.preventDefault();
      last.focus();

      return;
    }

    if (
      !event.shiftKey &&
      document.activeElement === last
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeDialog() {
    if (!activeDialog) {
      return;
    }

    activeDialog.cleanup();

    if (activeDialog.backdrop.parentNode) {
      activeDialog.backdrop.parentNode.removeChild(
        activeDialog.backdrop
      );
    }

    activeDialog = null;
  }

  /*
   * Ask a question and get an answer.
   *
   *   confirm(message, { title, confirmLabel, cancelLabel })
   *
   * The same dialog, so a confirmation looks like the rest of the
   * application instead of arriving as a browser alert with its own
   * chrome. Resolves true when confirmed and false when dismissed, so
   * a caller reads it the way it reads the browser's own confirm.
   */
  function confirmDialog(
    message,
    options = {}
  ) {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(result);
      };

      openDialog({
        title: options.title || "Are you sure?",
        description: message,
        confirm:
          options.confirmLabel || "Delete",
        cancel: options.cancelLabel || "Cancel",
        onConfirm: () => finish(true),
        onCancel: () => finish(false)
      });
    });
  }

  /*
   * Ask for a value and get it back.
   *
   * The promise-based sibling of confirmDialog, for the one place a
   * browser cannot supply its own panel. Resolves with the values the
   * dialog collected, or null when the user cancels - so a caller can
   * tell "they said nothing" from "they said an empty thing", which
   * is the difference between cancelling a save and saving a file
   * with an empty name.
   */
  function promptDialog(
    message,
    options = {}
  ) {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(result);
      };

      openDialog({
        title: options.title,
        description: message,
        fields: options.fields || [],
        confirm: options.confirm || "OK",
        cancel: options.cancel || "Cancel",
        onConfirm: (values) =>
          finish(
            options.onConfirm
              ? options.onConfirm(values)
              : values
          ),
        onCancel: () => finish(null)
      });
    });
  }

  root.enggUi = {
    ANCHOR_GAP,
    VIEWPORT_MARGIN,
    anchorElement,
    closeDialog,
    confirmDialog,
    isDialogOpen,
    openDialog,
    placeFloating,
    promptDialog
  };
})(window);
