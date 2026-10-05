/*
 * The colour picker.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { drawingColor, drawingLineType, drawingThickness } from "./dom.js";
import { drawingState, editorState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { objectAtPoint } from "./hit-testing.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { setToolMessage } from "./toolbar-render.js";

/*
 * ========================================================
 * CAD COLOUR CONTROL
 * ========================================================
 *
 * A swatch button opens a popup with a hue-by-shade
 * grid, a custom colour picker, recent colours and an
 * eyedropper.
 *
 * The native colour input stays in the DOM as the single
 * value source, so the existing style pipeline that
 * reads drawingColor.value keeps working unchanged.
 */

const COLOUR_RECENT_LIMIT = 24;

const COLOUR_STORAGE_KEY =
    "enggDrawing.recentColours";

let recentColours = [];

let colourPopup = null;

function normalizeColour(
    value
) {
    const text =
        String(value || "")
            .trim()
            .toLowerCase();

    if (!/^#[0-9a-f]{6}$/.test(text)) {
        return null;
    }

    return text;
}

/*
 * Recent colours persist for the session, and in local
 * storage when the browser allows it.
 */
function loadRecentColours() {
    try {
        const stored =
            window.localStorage.getItem(
                COLOUR_STORAGE_KEY
            );

        if (stored) {
            const parsed =
                JSON.parse(stored);

            if (Array.isArray(parsed)) {
                recentColours =
                    parsed
                        .map(normalizeColour)
                        .filter(Boolean)
                        .slice(
                            0,
                            COLOUR_RECENT_LIMIT
                        );
            }
        }
    } catch (error) {
        recentColours = [];
    }
}

function saveRecentColours() {
    try {
        window.localStorage.setItem(
            COLOUR_STORAGE_KEY,
            JSON.stringify(
                recentColours
            )
        );
    } catch (error) {
        /*
         * Storage can be unavailable; the list still
         * works for the current session.
         */
    }
}

/*
 * Remember a colour, most recent first, without
 * duplicates, capped at the limit.
 */
function rememberColour(
    value
) {
    const colour =
        normalizeColour(value);

    if (!colour) {
        return;
    }

    recentColours = [
        colour,
        ...recentColours.filter(
            existing =>
                existing !== colour
        )
    ].slice(
        0,
        COLOUR_RECENT_LIMIT
    );

    saveRecentColours();
}

/*
 * Hue across the columns, lightness so
 * moving across changes colour family and moving down
 * changes the shade. The last two rows are neutrals.
 */
function buildColourGrid() {
    const cells = [];

    const hues = 12;
    const shadeRows = [
        92, 78, 64, 50, 38, 28
    ];

    shadeRows.forEach(
        (lightness, row) => {
            for (
                let column = 0;
                column < hues;
                column += 1
            ) {
                const hue =
                    (column * 360) / hues;

                cells.push(
                    hslToHex(
                        hue,
                        72,
                        lightness
                    )
                );
            }

            void row;
        }
    );

    /*
     * Neutrals: white through grey to black.
     */
    [
        100, 88, 76, 64, 52, 40, 28, 16, 0
    ].forEach(
        lightness =>
            cells.push(
                hslToHex(
                    0,
                    0,
                    lightness
                )
            )
    );

    return cells;
}

/*
 * HSL to hex, used only to generate the palette.
 */
function hslToHex(
    hue,
    saturation,
    lightness
) {
    const s =
        saturation / 100;

    const l =
        lightness / 100;

    const c =
        (1 - Math.abs(2 * l - 1)) * s;

    const x =
        c *
        (1 - Math.abs(((hue / 60) % 2) - 1));

    const m =
        l - c / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (hue < 60) {
        r = c; g = x; b = 0;
    } else if (hue < 120) {
        r = x; g = c; b = 0;
    } else if (hue < 180) {
        r = 0; g = c; b = x;
    } else if (hue < 240) {
        r = 0; g = x; b = c;
    } else if (hue < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }

    const toHex = value =>
        Math.round(
            (value + m) * 255
        )
            .toString(16)
            .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/*
 * Apply a colour through the existing style pipeline.
 */
function applyColour(
    value
) {
    const colour =
        normalizeColour(value);

    if (!colour) {
        return;
    }

    drawingColor.value =
        colour;

    rememberColour(
        colour
    );

    applyStyleControls();

    updateColourSwatch();
}

function updateColourSwatch() {
    const swatch =
        document.getElementById(
            "drawingColourSwatch"
        );

    if (swatch) {
        swatch.style.background =
            drawingColor.value;
    }
}

/*
 * Close the popup.
 *
 * The eyedropper stays armed when the popup closes,
 * because arming it is meant to be followed by a click
 * on the drawing. Cancelling the eyedropper is done
 * explicitly instead.
 */
function closeColourPopup(
    keepEyedropper = true
) {
    if (colourPopup) {
        colourPopup.remove();
        colourPopup = null;
    }

    if (!keepEyedropper) {
        editorState.eyedropperActive =
            false;
    }
}

/*
 * Read a feature's own stored colour, not a sampled
 * screen pixel.
 */
export function pickColourFromFeature(
    event
) {
    const point =
        canvasPointFromEvent(
            event,
            false
        );

    const object =
        objectAtPoint(
            point
        );

    if (
        !object ||
        !object.style ||
        !normalizeColour(
            object.style.stroke
        )
    ) {
        setToolMessage(
            "No feature colour there"
        );

        return;
    }

    applyColour(
        object.style.stroke
    );

    setToolMessage(
        `Picked ${object.style.stroke}`
    );

    editorState.eyedropperActive =
        false;

    closeColourPopup();
}

function openColourPopup(
    anchor
) {
    if (colourPopup) {
        closeColourPopup();
        return;
    }

    const popup =
        document.createElement("div");

    popup.className =
        "drawing-colour-popup";

    popup.setAttribute(
        "role",
        "dialog"
    );

    popup.innerHTML = `
        <div class="drawing-colour-section">COLOUR GRID</div>
        <div class="drawing-colour-grid" data-colour-grid></div>

        <div class="drawing-colour-section">CUSTOM COLOUR</div>
        <div class="drawing-colour-row">
            <input type="color" class="drawing-colour-custom"
                data-colour-custom aria-label="Custom colour">
            <button type="button" class="drawing-colour-action"
                data-colour-eyedropper>Pick from drawing</button>
        </div>

        <div class="drawing-colour-section">PREVIOUS COLOURS</div>
        <div class="drawing-colour-recent" data-colour-recent></div>
    `;

    document.body.appendChild(
        popup
    );

    const rect =
        anchor.getBoundingClientRect();

    const popupRect =
        popup.getBoundingClientRect();

    const gap = 6;
    const margin = 8;

    let left =
        rect.right - popupRect.width;

    let top =
        rect.bottom + gap;

    if (left < margin) {
        left = margin;
    }

    if (
        top + popupRect.height >
        window.innerHeight - margin
    ) {
        top = Math.max(
            margin,
            rect.top - popupRect.height - gap
        );
    }

    popup.style.left =
        `${left}px`;

    popup.style.top =
        `${top}px`;

    /*
     * Colour grid.
     */
    const grid =
        popup.querySelector(
            "[data-colour-grid]"
        );

    buildColourGrid().forEach(
        colour => {
            const cell =
                document.createElement("button");

            cell.type = "button";
            cell.className =
                "drawing-colour-cell";

            cell.style.background =
                colour;

            cell.title = colour;
            cell.setAttribute(
                "aria-label",
                colour
            );

            cell.addEventListener(
                "click",
                () => {
                    applyColour(
                        colour
                    );

                    closeColourPopup();
                }
            );

            grid.appendChild(
                cell
            );
        }
    );

    /*
     * Custom colour picker.
     */
    const custom =
        popup.querySelector(
            "[data-colour-custom]"
        );

    custom.value =
        drawingColor.value;

    custom.addEventListener(
        "input",
        () =>
            applyColour(
                custom.value
            )
    );

    /*
     * Eyedropper.
     */
    const eyedropper =
        popup.querySelector(
            "[data-colour-eyedropper]"
        );

    eyedropper.classList.toggle(
        "active",
        editorState.eyedropperActive
    );

    eyedropper.addEventListener(
        "click",
        () => {
            editorState.eyedropperActive =
                !editorState.eyedropperActive;

            eyedropper.classList.toggle(
                "active",
                editorState.eyedropperActive
            );

            setToolMessage(
                editorState.eyedropperActive
                    ? "Click a feature to pick its colour"
                    : "Select geometry"
            );
        }
    );

    renderRecentColours(
        popup
    );

    colourPopup =
        popup;
}

function renderRecentColours(
    popup
) {
    const host =
        popup.querySelector(
            "[data-colour-recent]"
        );

    if (!host) {
        return;
    }

    host.innerHTML = "";

    if (!recentColours.length) {
        const empty =
            document.createElement("div");

        empty.className =
            "drawing-colour-empty";

        empty.textContent =
            "No colours used yet";

        host.appendChild(
            empty
        );

        return;
    }

    recentColours.forEach(
        colour => {
            const cell =
                document.createElement("button");

            cell.type = "button";
            cell.className =
                "drawing-colour-cell";

            cell.style.background =
                colour;

            cell.title = colour;
            cell.setAttribute(
                "aria-label",
                colour
            );

            cell.addEventListener(
                "click",
                () => {
                    applyColour(
                        colour
                    );

                    closeColourPopup();
                }
            );

            host.appendChild(
                cell
            );
        }
    );
}

/*
 * Replace the plain native colour input with the swatch
 * button plus the popup, keeping the native input as the
 * value source.
 */
export function setupColourControl() {
    if (!drawingColor) {
        return;
    }

    loadRecentColours();

    drawingColor.classList.add(
        "drawing-colour-native"
    );

    const control =
        document.createElement("span");

    control.className =
        "drawing-colour-control";

    const swatch =
        document.createElement("button");

    swatch.type = "button";
    swatch.id =
        "drawingColourSwatch";

    swatch.className =
        "drawing-colour-swatch";

    swatch.title =
        "Choose colour";

    swatch.setAttribute(
        "aria-label",
        "Choose colour"
    );

    swatch.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            openColourPopup(
                swatch
            );
        }
    );

    /*
     * The swatch sits next to the existing colour label, so
     * the strip keeps its normal row layout and the native
     * input stays available as the value source.
     */
    const label =
        drawingColor.closest("label");

    control.appendChild(
        drawingColor
    );

    control.appendChild(
        swatch
    );

    if (label && label.parentNode) {
        label.parentNode.insertBefore(
            control,
            label.nextSibling
        );
    } else if (drawingColor.parentNode) {
        drawingColor.parentNode.insertBefore(
            control,
            drawingColor
        );
    }

    drawingColor.addEventListener(
        "input",
        () => {
            rememberColour(
                drawingColor.value
            );

            updateColourSwatch();
        }
    );

    updateColourSwatch();

    /*
     * Clicking away closes the popup.
     */
    document.addEventListener(
        "pointerdown",
        event => {
            if (
                !colourPopup ||
                colourPopup.contains(
                    event.target
                ) ||
                event.target.closest?.(
                    ".drawing-colour-control"
                )
            ) {
                return;
            }

            closeColourPopup();
        }
    );
}

export function applyStyleControls() {
    const nextStyle = {
        lineWidth:
            Number(
                drawingThickness.value
            ),

        stroke:
            drawingColor.value,

        lineType:
            drawingLineType.value
    };

    const selectedIds =
        drawingState.selection
            .selectedObjectIds;

    if (
        !selectedIds.length
    ) {
        drawingState.styleDefaults = {
            ...drawingState.styleDefaults,
            ...nextStyle
        };

        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    drawingState.objects
        .filter(
            object =>
                selectedIds.includes(
                    object.id
                )
        )
        .forEach(
            object => {
                object.style = {
                    ...object.style,
                    ...nextStyle
                };
            }
        );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    renderProperties();
    renderCurrentDrawing();
}
