/*
 * The right-click menu on a feature.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { clipboardHasContent, copySelectionToClipboard, cutSelectionToClipboard, duplicateSelection, pasteFromClipboard } from "./clipboard-commands.js";
import { deleteSelectedObjects } from "./delete-command.js";
import { drawingCanvas } from "./dom.js";
import { drawingState, editorState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { objectAtPoint } from "./hit-testing.js";
import { beginModifySession } from "./modify-tools.js";
import { modifyInstruction } from "./pointer.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { setToolMessage } from "./toolbar-render.js";

/*
 * Selected objects, resolved from the captured ids.
 */
/*
 * THE FEATURE CONTEXT MENU
 *
 * Right-clicking a feature offers the actions that make sense for
 * it, and right-clicking empty space offers only those that do
 * not need a selection.
 *
 * The menu is built from the same functions the toolbar and the
 * keyboard shortcuts use, so an action reached from here behaves
 * identically to the same action reached anywhere else. The
 * entries that act on a selection are simply not offered when
 * there is none, rather than being offered and quietly doing
 * nothing, and Paste appears only once something has been
 * copied.
 */
let featureContextMenu = null;

function closeFeatureContextMenu() {
    if (!featureContextMenu) {
        return;
    }

    featureContextMenu.remove();

    featureContextMenu = null;

    document.removeEventListener(
        "pointerdown",
        closeFeatureContextMenuOnOutside,
        true
    );
}

function closeFeatureContextMenuOnOutside(
    event
) {
    if (
        featureContextMenu &&
        featureContextMenu.contains(
            event.target
        )
    ) {
        return;
    }

    closeFeatureContextMenu();
}

/*
 * One entry, or a gap between groups of them.
 */
function contextMenuItem(
    label,
    action,
    options = {}
) {
    const {
        disabled = false,
        hint = null
    } = options;

    return `
        <button
            type="button"
            class="drawing-context-item"
            role="menuitem"
            ${disabled ? "disabled" : ""}
            data-context-action="${label.toLowerCase().replace(/[^a-z]+/g, "-")}"
        >
            <span>${label}</span>
            ${hint ? `<span class="drawing-context-hint">${hint}</span>` : ""}
        </button>
    `;
}

function openFeatureContextMenu(
    x,
    y,
    hasSelection
) {
    closeFeatureContextMenu();

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-context-menu";

    menu.setAttribute("role", "menu");

    /*
     * An action on a selection only appears when there IS one.
     * Offering "Delete" over empty space would be an invitation
     * to press a button that cannot do anything.
     */
    const onSelection = hasSelection
        ? `
            ${contextMenuItem("Open Features", () => {
                editorState.featurePanelView = "edit";
                renderProperties();
            })}
            ${contextMenuItem("Cut", () => {
                cutSelectionToClipboard();
            }, { hint: "Ctrl+X" })}
            ${contextMenuItem("Copy", () => {
                if (copySelectionToClipboard()) {
                    const count =
                        editorState.drawingClipboard
                            .features.length;

                    setToolMessage(
                        count === 1
                            ? "Copied 1 feature"
                            : `Copied ${count} features`
                    );
                }
            }, { hint: "Ctrl+C" })}
            ${contextMenuItem("Paste", () => {
                pasteFromClipboard();
            }, {
                disabled: !clipboardHasContent(),
                hint: "Ctrl+V"
            })}
            ${contextMenuItem("Duplicate", () => {
                duplicateSelection();
            })}
            ${contextMenuItem("Mirror", () => {
                beginModifySession("mirror");

                const selected = [
                    ...drawingState.selection
                        .selectedObjectIds
                ];

                if (selected.length) {
                    editorState.modifySession.ids =
                        selected;

                    editorState.modifySession.stage =
                        "axis";
                }

                setToolMessage(
                    modifyInstruction(
                        editorState.modifySession
                    )
                );

                renderProperties();
                renderCurrentDrawing();
            })}
            ${contextMenuItem("Delete", () => {
                deleteSelectedObjects();
            }, { hint: "Del" })}
        `
        : `
            ${contextMenuItem("Paste", () => {
                pasteFromClipboard();
            }, {
                disabled: !clipboardHasContent(),
                hint: "Ctrl+V"
            })}
        `;

    menu.innerHTML = onSelection;

    document.body.appendChild(menu);

    /*
     * Keep the menu on screen: it is placed at the pointer but
     * pulled back if it would run off the bottom or the right,
     * so a right-click near an edge still shows every entry.
     */
    const margin = 8;
    const rect = menu.getBoundingClientRect();

    menu.style.left =
        `${Math.min(
            x,
            window.innerWidth -
                rect.width -
                margin
        )}px`;

    menu.style.top =
        `${Math.min(
            y,
            window.innerHeight -
                rect.height -
                margin
        )}px`;

    menu.querySelectorAll(
        ".drawing-context-item"
    ).forEach(item => {
        item.addEventListener(
            "click",
            () => {
                const action = item.dataset.contextAction;

                closeFeatureContextMenu();

                if (action === "cut") {
                    cutSelectionToClipboard();
                } else if (action === "copy") {
                    if (copySelectionToClipboard()) {
                        setToolMessage("Copied");
                    }
                } else if (action === "paste") {
                    pasteFromClipboard();
                } else if (action === "duplicate") {
                    duplicateSelection();
                } else if (action === "delete") {
                    deleteSelectedObjects();
                } else if (action === "mirror") {
                    beginModifySession("mirror");
                    setToolMessage(
                        modifyInstruction(
                            editorState.modifySession
                        )
                    );
                } else if (action === "open-features") {
                    editorState.featurePanelView = "edit";
                    renderProperties();
                }
            }
        );
    });

    featureContextMenu = menu;

    document.addEventListener(
        "pointerdown",
        closeFeatureContextMenuOnOutside,
        true
    );
}

/*
 * Wire this part of the editor to the page. Called once, at start-up,
 * by editor/index.js.
 */
export function installContextMenu() {
    document.addEventListener(
        "contextmenu",
        event => {
            if (
                !drawingCanvas.contains(
                    event.target
                )
            ) {
                closeFeatureContextMenu();

                return;
            }

            /*
             * The browser's own menu is replaced only over the
             * drawing itself, so text in a panel can still be copied
             * the usual way.
             */
            event.preventDefault();

            closeFeatureContextMenu();

            const rawPoint =
                canvasPointFromEvent(
                    event,
                    false
                );

            const object =
                objectAtPoint(rawPoint);

            /*
             * Right-clicking an unselected feature selects it first,
             * so the actions in the menu apply to the thing that was
             * actually under the pointer rather than to whatever
             * happened to be selected before.
             */
            if (
                object &&
                !drawingState.selection
                    .selectedObjectIds.includes(
                        object.id
                    )
            ) {
                enggDrawingState.selectObject(
                    drawingState,
                    object.id
                );

                editorState.featureTreePickedId = object.id;

                renderProperties();
                renderCurrentDrawing();
            }

            const hasSelection =
                drawingState.selection
                    .selectedObjectIds.length > 0;

            openFeatureContextMenu(
                event.clientX,
                event.clientY,
                hasSelection
            );
        }
    );
}
