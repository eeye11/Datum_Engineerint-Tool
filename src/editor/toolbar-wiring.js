/*
 * Wiring the file, style and zoom controls.
 */

import { applyStyleControls, setupColourControl } from "./colour-picker.js";
import { FILE_ACTIONS, drawingFileNew, drawingFileOpen, drawingFileSave, newDrawing, openDrawing, saveDrawing } from "./document-commands.js";
import { drawingColor, drawingLineType, drawingThickness, drawingZoomOut } from "./dom.js";
import { editorState } from "./editor-state.js";
import { updateDrawingZoom } from "./viewport.js";

function setupLineTypeMenu() {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "drawing-line-type-trigger";
    trigger.setAttribute("aria-label", "Line type");
    trigger.title = "Line type";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    drawingLineType.hidden = true;
    drawingLineType.after(trigger);

    let menu = null;
    const close = () => {
        menu?.remove();
        menu = null;
        trigger.setAttribute("aria-expanded", "false");
    };
    const patterns = { solid: "", dashed: "5 3", center: "9 3 1 3", construction: "2 3" };
    trigger.addEventListener("click", () => {
        if (menu) { close(); return; }
        menu = document.createElement("div");
        menu.className = "drawing-line-type-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", "Line type");
        for (const option of drawingLineType.options) {
            const item = document.createElement("button");
            item.type = "button";
            item.setAttribute("role", "menuitemradio");
            item.setAttribute("aria-checked", String(option.selected));
            item.innerHTML = `<svg viewBox="0 0 30 12" aria-hidden="true"><path d="M2 6h26" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="${patterns[option.value]}"/></svg><span>${option.textContent}</span>`;
            item.addEventListener("click", () => {
                drawingLineType.value = option.value;
                drawingLineType.dispatchEvent(new Event("change", { bubbles: true }));
                close();
                trigger.focus();
            });
            menu.append(item);
        }
        document.body.append(menu);
        const bounds = trigger.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - menu.offsetWidth - 8))}px`;
        menu.style.top = `${bounds.bottom + 4}px`;
        trigger.setAttribute("aria-expanded", "true");
        menu.querySelector('[aria-checked="true"]')?.focus();
        menu.addEventListener("keydown", event => {
            if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const items = [...menu.children];
                const next = items.indexOf(document.activeElement) + (event.key === "ArrowDown" ? 1 : -1);
                items[(next + items.length) % items.length].focus();
            }
        });
    });
    document.addEventListener("pointerdown", event => {
        if (menu && !menu.contains(event.target) && !trigger.contains(event.target)) close();
    });
    window.addEventListener("resize", close);
}

/*
 * Wire this part of the editor to the page. Called once, at start-up,
 * by editor/index.js.
 */
export function installToolbarWiring() {
    document
      .querySelectorAll("[data-file-action]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const action =
            FILE_ACTIONS[button.dataset.fileAction];

          if (action) {
            action();
          }
        });
      });

    if (drawingFileNew) {
        drawingFileNew.addEventListener(
            "click",
            newDrawing
        );
    }

    if (drawingFileSave) {
        drawingFileSave.addEventListener(
            "click",
            saveDrawing
        );
    }

    if (drawingFileOpen) {
        drawingFileOpen.addEventListener(
            "click",
            openDrawing
        );
    }

    if (
        drawingThickness
    ) {
        drawingThickness.addEventListener(
            "change",
            applyStyleControls
        );
    }

    if (
        drawingColor
    ) {
        drawingColor.addEventListener(
            "change",
            applyStyleControls
        );

        /*
         * Build the CAD colour control around the existing
         * native colour input.
         */
        setupColourControl();
    }

    if (
        drawingLineType
    ) {
        drawingLineType.addEventListener(
            "change",
            applyStyleControls
        );
        setupLineTypeMenu();
    }

    if (
        drawingZoomOut
    ) {
        drawingZoomOut.addEventListener(
            "click",
            () =>
                updateDrawingZoom(
                    editorState.drawingZoom - 10
                )
        );
    }
}
