/*
 * The triangle's panel: sides and angles.
 */

import { appearanceMarkup } from "./appearance-panel.js";
import { distance } from "./construction-geometry.js";
import { featureHeaderMarkup, finaliseRows } from "./feature-panel-markup.js";

/*
 * Triangle measurements derived from the actual
 * geometry. The stored points are always the source
 * of truth; these are calculated from them.
 */
export function triangleMeasurements(
    points
) {
    if (
        !Array.isArray(points) ||
        points.length < 3 ||
        points.some(
            point =>
                !point ||
                !Number.isFinite(point.x) ||
                !Number.isFinite(point.y)
        )
    ) {
        return null;
    }

    const sides = [
        distance(points[0], points[1]),
        distance(points[1], points[2]),
        distance(points[2], points[0])
    ];

    /*
     * Each angle is taken at its own vertex, so
     * angle 1 sits between side 3 and side 1, and
     * so on around the triangle.
     */
    const angleAt = (
        vertex,
        first,
        second
    ) => {
        const a = {
            x: first.x - vertex.x,
            y: first.y - vertex.y
        };

        const b = {
            x: second.x - vertex.x,
            y: second.y - vertex.y
        };

        const denominator =
            Math.hypot(a.x, a.y) *
            Math.hypot(b.x, b.y);

        if (
            denominator <=
            1e-12
        ) {
            return 0;
        }

        const cosine =
            Math.max(
                -1,
                Math.min(
                    1,
                    (
                        a.x * b.x +
                        a.y * b.y
                    ) /
                    denominator
                )
            );

        return (
            Math.acos(cosine) *
            180 /
            Math.PI
        );
    };

    const angles = [
        angleAt(points[0], points[1], points[2]),
        angleAt(points[1], points[2], points[0]),
        angleAt(points[2], points[0], points[1])
    ];

    return {
        sides,
        angles
    };
}

export function trianglePropertyMarkup(
    object,
    mode
) {
    const geometry =
        object.geometry;

    const constraints =
        object.constraints || {};

    const points =
        (geometry.points || []).filter(
            Boolean
        );

    const measurements =
        triangleMeasurements(points);

    /*
     * A NUMBER THAT IS NEVER THE STRING "NaN".
     *
     * `Number(undefined).toFixed(2)` is "NaN", which is how a panel with a
     * missing value printed it. A value that is not a finite number produces
     * an empty string, so the field it belongs to can be omitted rather than
     * showing a word that is not a measurement.
     */
    const number = value =>
        Number.isFinite(Number(value))
            ? Number(value).toFixed(2)
            : "";

    const fixed = key =>
        Boolean(constraints[key]);

    const rows = [];

    /*
     * Standard header, then the existing segmented
     * control. The rest of the Triangle layout is
     * unchanged.
     */
    rows.push(
        featureHeaderMarkup(
            object,
            "Triangle"
        )
    );

    rows.push(`
        <div class="drawing-segmented" role="group" aria-label="Definition">
            <button type="button"
                class="drawing-segmented-option${mode === "points" ? " active" : ""}"
                data-triangle-mode="points"
                aria-pressed="${mode === "points"}">
                Points
            </button>
            <button type="button"
                class="drawing-segmented-option${mode === "sides" ? " active" : ""}"
                data-triangle-mode="sides"
                aria-pressed="${mode === "sides"}">
                Sides &amp; Angles
            </button>
        </div>
    `);

    const lockBox = (
        key,
        label
    ) => `
        <label class="drawing-property-fix" title="Constrain ${label}">
            <input type="checkbox" data-fix="${key}"
                aria-label="Constrain ${label}"
                ${fixed(key) ? "checked" : ""}>
        </label>
    `;

    if (mode === "points") {
        rows.push(
            `<div class="drawing-properties-section">GEOMETRY</div>`
        );

        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-head">
                <span></span><span>X</span><span>Y</span><span></span>
            </div>
        `);

        points.forEach(
            (
                point,
                index
            ) => {
                const locked =
                    fixed(`points.${index}`);

                rows.push(`
                    <div class="drawing-property-grid">
                        <span class="drawing-property-grid-label">Point ${index + 1}</span>
                        <input type="number" step="any"
                            data-property="points.${index}.x"
                            aria-label="Point ${index + 1} X"
                            value="${number(point.x)}"
                            ${locked ? "disabled" : ""}>
                        <input type="number" step="any"
                            data-property="points.${index}.y"
                            aria-label="Point ${index + 1} Y"
                            value="${number(point.y)}"
                            ${locked ? "disabled" : ""}>
                        ${lockBox(`points.${index}`, `Point ${index + 1}`)}
                    </div>
                `);
            }
        );
    }

    if (mode === "sides" && measurements) {
        rows.push(
            `<div class="drawing-properties-section">SIDES</div>`
        );

        measurements.sides.forEach(
            (side, index) => {
                const key =
                    `side${index + 1}`;

                rows.push(`
                    <div class="drawing-property-grid drawing-property-grid-value">
                        <span class="drawing-property-grid-label">Side ${index + 1}</span>
                        <input type="number" step="any"
                            data-property="${key}"
                            aria-label="Side ${index + 1}"
                            value="${number(side)}"
                            ${fixed(key) ? "disabled" : ""}>
                        <span class="drawing-property-unit">mm</span>
                        ${lockBox(key, `Side ${index + 1}`)}
                    </div>
                `);
            }
        );

        rows.push(
            `<div class="drawing-properties-section">ANGLES</div>`
        );

        measurements.angles.forEach(
            (angle, index) => {
                const key =
                    `angle${index + 1}`;

                rows.push(`
                    <div class="drawing-property-grid drawing-property-grid-value">
                        <span class="drawing-property-grid-label">Angle ${index + 1}</span>
                        <input type="number" step="5" min="0.01" max="179.98"
                            data-property="${key}"
                            aria-label="Angle ${index + 1}"
                            value="${number(angle)}"
                            ${fixed(key) ? "disabled" : ""}>
                        <span class="drawing-property-unit">°</span>
                        ${lockBox(key, `Angle ${index + 1}`)}
                    </div>
                `);
            }
        );
    }

    rows.push(appearanceMarkup(object));

    /*
     * NO SECOND TITLE: the header above already names the feature. Repeating
     * `object.name` printed it twice, one line under the other.
     */
    return `<div class="drawing-properties-block">
        ${finaliseRows(rows)}
    </div>`;
}
