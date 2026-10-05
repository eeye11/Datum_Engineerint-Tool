/*
 * The toolbar's thickness, colour and line-type controls.
 */

import { drawingColor, drawingLineType, drawingThickness } from "./dom.js";
import { drawingState } from "./editor-state.js";

export function syncStyleControls() {
    if (
        !drawingThickness ||
        !drawingColor ||
        !drawingLineType
    ) {
        return;
    }

    const object =
        drawingState.objects.find(
            candidate =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        candidate.id
                    )
        );

    const style =
        object?.style ||
        drawingState.styleDefaults;

    /*
     * The thickness control is a select with a fixed set
     * of options. A feature can hold any width (for
     * example 1.5 from the Line Width field), and
     * assigning a value that matches no option leaves the
     * control blank. Add the missing option so the
     * current value is always visible.
     */
    ensureThicknessOption(
        style.lineWidth
    );

    drawingThickness.value =
        String(
            style.lineWidth
        );

    drawingColor.value =
        style.stroke;

    drawingLineType.value =
        style.lineType;
}

/*
 * Make sure the thickness select can display a width,
 * adding an option for values outside the standard set.
 */
function ensureThicknessOption(
    width
) {
    if (!drawingThickness) {
        return;
    }

    const numeric =
        Number(width);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return;
    }

    const value =
        String(numeric);

    const exists =
        [...drawingThickness.options].some(
            option =>
                Number(option.value) ===
                numeric
        );

    if (exists) {
        return;
    }

    const option =
        document.createElement("option");

    option.value = value;
    option.textContent =
        `${numeric.toFixed(2)} mm`;

    drawingThickness.appendChild(
        option
    );
}
