/*
 * A feature's panel markup.
 */

import enggFeatureGeometry from "../core/geometry/feature-geometry.js";
import enggAnalysisDependencies from "../features/analysis/analysis-dependencies.js";
import enggLoadProfile from "../features/analysis/load-profile.js";
import enggPropertyPanel from "../ui/feature-panel/property-panel.js";
import { appearanceMarkup } from "./appearance-panel.js";
import { COORDINATE_SYSTEM_TYPE } from "./constants.js";
import { drawingState } from "./editor-state.js";
import { mmOf, staticsRoleLabel } from "./handles.js";
import { relativeCoordinateRows } from "./relative-coordinates.js";
import { MAGNITUDE_BEARING_TYPES, analysisPanelRows, annotationSectionMarkup, arcRadiusRow, distributedLoadPanelMarkup, momentDirectionOf, reverseDirectionMarkup, supportPanelRows } from "./statics-panel.js";
import { STATICS_FEATURE_LABELS, staticsConnectionSection } from "./statics-tools.js";
import { trianglePropertyMarkup } from "./triangle-panel.js";
import { trussOptimizeMarkup } from "./truss-optimizer.js";

/*
 * Shared header for every Features panel: the feature's own name as the
 * panel title, and an editable Feature Name beneath it.
 *
 * It used to render a read-only "Feature Type" field as well. That was an
 * inspector field, not an engineering one: it showed the student a value the
 * model had already told them - the name at the top of this very panel - in a
 * different vocabulary, and for a feature with no friendly label the fallback
 * was the internal type string itself. A student reading "analysis-diagram"
 * learns nothing about the analysis diagram they made, and it is precisely
 * the kind of internal term that has no business being displayed.
 *
 * So the type now appears once, as the title, in the words the student uses.
 * The editable name stays, because what a student calls a feature is theirs to
 * choose and is not the same question as what kind of thing it is.
 *
 * The raw-type fallback is kept, but only in the title - it is how a feature
 * with no registered label is still named at all, rather than being nameless.
 */
export function featureHeaderMarkup(
    object,
    typeLabel
) {
    const panels =
        enggPropertyPanel;

    const name =
        panels && panels.header
            ? panels.header(typeLabel)
            : `<div class="drawing-properties-title">${
                escapeHtmlText(typeLabel)
            }</div>`;

    const nameField =
        panels && panels.nameField
            ? panels.nameField({
                attribute: "feature-name",
                value: object.name,
            })
            : "";

    return name + nameField;
}

/*
 * Escaping for the rare fallback path above. The shared module owns this
 * normally; this exists only so the header still renders if that module is
 * absent, rather than emitting an unescaped name into the panel.
 */
function escapeHtmlText(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character],
    );
}

/*
 * A SECTION HEADING, WHICH STANDS OR FALLS WITH ITS FIELDS.
 *
 * The panel is assembled by pushing a heading and then its fields into one
 * list, so a heading cannot know at the moment it is written whether the
 * fields below it will turn out to exist. It is therefore emitted as a
 * MARKER, and `finaliseRows` removes any marker whose following rows are
 * all empty - which is how an APPEARANCE heading over nothing, and the gap
 * left where it was, both disappear.
 *
 * The marker is an HTML comment so a panel that somehow skipped
 * finalisation still renders correctly, with the heading text hidden.
 */
export const section = label =>
    `<!--section:${label}-->`;

/*
 * Drop every heading that is not followed by at least one real field, and
 * drop every empty fragment. This is the single pass that enforces "no
 * empty sections" and "no leftover whitespace from removed fields".
 *
 * A heading is kept only when a non-heading, non-empty row follows it
 * before the next heading. Trailing headings are removed too, because a
 * heading at the end of the panel has nothing under it by definition.
 */
export const finaliseRows = list => {
    const kept = [];

    /*
     * NESTED ROWS ARE FLATTENED FIRST.
     *
     * A helper that builds a whole group of fields - the support panel,
     * a relative-coordinate block - returns its rows as an ARRAY, and the
     * caller pushes that array into the panel's row list as one entry. A
     * pass that only understood strings skipped every such entry, so a
     * support rendered as its title and nothing else: every field it
     * carried was silently discarded here.
     *
     * Flattening means a helper may return one row or many without the
     * caller having to know which, which is the contract the builders
     * already assume.
     */
    const flat = list.flat(Infinity);

    for (let index = 0; index < flat.length; index += 1) {
        const entry = flat[index];

        if (typeof entry !== "string" || entry.trim() === "") {
            continue;
        }

        const marker = /^<!--section:(.*?)-->$/.exec(entry);

        if (!marker) {
            kept.push(entry);
            continue;
        }

        /*
         * Keep the heading only if a real field follows it before the next
         * heading.
         */
        let hasField = false;

        for (let ahead = index + 1; ahead < flat.length; ahead += 1) {
            const next = flat[ahead];

            if (typeof next !== "string" || next.trim() === "") {
                continue;
            }

            if (/^<!--section:(.*?)-->$/.test(next)) {
                break;
            }

            hasField = true;
            break;
        }

        if (hasField) {
            kept.push(
                `<div class="drawing-properties-section">${escapeHtmlText(marker[1])}</div>`,
            );
        }
    }

    return kept.join("");
};

/*
 * The Features panel for a Rigid Body, in whichever shape it
 * currently has.
 *
 * A body stores a centre, a size and an angle regardless of its
 * outline, so the size and rotation controls mean the same thing
 * for every shape. What changes is the shape selector and, for a
 * triangle, the three points that define it.
 */
function rigidBodyShapeMarkup(
    object,
    helpers
) {
    const {
        coordinate,
        scalar,
        section
    } = helpers;

    const geometry = object.geometry || {};

    const shape =
        enggFeatureGeometry.rigidBodyShape(
            geometry
        );

    const centre =
        enggFeatureGeometry.rigidBodyCenter(
            geometry
        ) || { x: 0, y: 0 };

    const rows = [];

    rows.push(section("SHAPE"));

    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Shape</span>
            <select data-rigid-shape aria-label="Shape">
                ${["rectangle", "circle", "triangle", "polygon"]
                    .map(
                        value => `
                            <option
                                value="${value}"
                                ${shape === value ? "selected" : ""}
                            >${value[0].toUpperCase() + value.slice(1)}</option>
                        `
                    )
                    .join("")}
            </select>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `);

    rows.push(section("POSITION"));
    rows.push(coordinate("Centre X", "rigidCentre.x", centre.x, "mm", true));
    rows.push(coordinate("Centre Y", "rigidCentre.y", centre.y, "mm", true));

    if (shape === "circle") {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Radius",
                "rigidRadius",
                mmOf(
                    Number(geometry.radius) ||
                        Math.max(
                            Number(geometry.width) || 0,
                            Number(geometry.height) || 0
                        ) / 2
                ).value,
                mmOf(
                    Number(geometry.radius) ||
                        Math.max(
                            Number(geometry.width) || 0,
                            Number(geometry.height) || 0
                        ) / 2
                ).unit,
                true,
                true
            )
        );
    } else if (shape === "triangle") {
        rows.push(section("VERTICES"));

        (geometry.points || [])
            .filter(Boolean)
            .forEach(
                (point, index) => {
                    rows.push(
                        coordinate(
                            `Point ${index + 1} X`,
                            `points.${index}.x`,
                            point.x,
                            "mm",
                            true
                        )
                    );
                    rows.push(
                        coordinate(
                            `Point ${index + 1} Y`,
                            `points.${index}.y`,
                            point.y,
                            "mm",
                            true
                        )
                    );
                }
            );
    } else if (shape === "polygon") {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Number of Sides",
                "rigidSides",
                Number(geometry.sides) || 4,
                ""
            )
        );
        rows.push(
            scalar(
                "Radius",
                "rigidRadius",
                mmOf(Number(geometry.radius) || 0).value,
                mmOf(Number(geometry.radius) || 0).unit,
                true,
                true
            )
        );
    } else {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Width",
                "rigidWidth",
                mmOf(Number(geometry.width) || 0).value,
                mmOf(Number(geometry.width) || 0).unit,
                true,
                true
            )
        );
        rows.push(
            scalar(
                "Height",
                "rigidHeight",
                mmOf(Number(geometry.height) || 0).value,
                mmOf(Number(geometry.height) || 0).unit,
                true,
                true
            )
        );
    }

    rows.push(section("ROTATION"));
    rows.push(
        scalar(
            "Rotation",
            "rigidRotation",
            Number(geometry.rotation) || 0,
            "°"
        )
    );

    return rows.join("");
}

export function featurePropertyMarkup(object) {
    const geometry = object.geometry;
    const constraints = object.constraints || {};
    const rows = [];

    /*
     * ========================================================
     * THE SHARED PANEL VOCABULARY
     * ========================================================
     *
     * Every field below is built through the one property-panel module rather
     * than by hand. That module is where the two rules this panel used to break
     * are enforced:
     *
     *   - NO PUNCTUATION WITHOUT A VALUE. A field with a missing value is not
     *     emitted at all, so a panel cannot show "Direction: ," or leave a
     *     dangling separator where an optional property was absent.
     *   - NO EMPTY SECTIONS. A heading is produced together with the fields
     *     that justify it, or not at all.
     *
     * It also joins a number and its unit in one place (so no field can read
     * "100 NN"), escapes every string that reaches the markup, and drops
     * trailing zeros consistently, so two panels never disagree about how a
     * value is written.
     *
     * `panels` may be absent in a bare test harness, in which case the helpers
     * below return nothing rather than throwing - an absent module leaves a
     * field out, which is the same as an absent value.
     */
    const panels =
        enggPropertyPanel;

    /*
     * A number as panel text. Delegated, because the shared formatter drops
     * trailing zeros and normalises negative zero - and because a missing
     * value must render as an absent field, not as the string "NaN".
     */
    const number = value =>
        panels && panels.number
            ? panels.number(value)
            : Number.isFinite(Number(value))
              ? String(Number(Number(value).toFixed(2)))
              : "";

    const fixed = key => Boolean(constraints[key]);

    /*
     * Shared constraint control. Every editable numeric
     * property gets one, placed after the unit so the
     * order is always Label -> Input -> Unit -> Fix.
     */
    const fixBox = (key, label) => `
        <label class="drawing-property-fix" title="Constrain ${label}">
            <input type="checkbox" data-fix="${key}"
                aria-label="Constrain ${label}"
                ${fixed(key) ? "checked" : ""}>
        </label>
    `;

    /*
     * Unknown control for statics values.
     *
     * A quantity marked Unknown is one the student has yet
     * to determine, so it is not the Fix control: Fix pins
     * a value against editing, while `?` says there is no
     * authoritative value at all. It is a property of the
     * value, not a separate tool, so any statics feature
     * can carry it through the same state as its Fix flag.
     */
    const known = key =>
        object.unknownValues?.[key] !== true;

    /*
     * A compact `?` toggle, placed after the unit. It reads
     * as a state rather than a word so the property row
     * stays compact and the whole feature is not disabled
     * when a single quantity is Unknown.
     */
    const knownBox = (key, label) => `
        <button type="button"
            class="drawing-property-known${known(key) ? "" : " unknown"}"
            data-known="${key}"
            aria-pressed="${!known(key)}"
            aria-label="Mark ${label} as unknown"
            title="Unknown: ${label} is not specified">
            ?
        </button>
    `;

    /*
     * Known / Unknown applies to a stated engineering quantity - the
     * magnitudes a student writes onto a force, a load or a moment.
     * Those are the values whose being-unknown is a real engineering
     * state rather than a missing number: a reaction the student has
     * still to solve for, a load not yet determined.
     *
     * IT IS TESTED BY WHAT THE QUANTITY IS, NOT BY ITS DISCIPLINE. The
     * old test was `discipline === "statics"`, which refused the `?` to
     * a force while offering it to a support - and a force's magnitude
     * is exactly the quantity a student marks unknown first, because it
     * is the one they are still working out.
     */
    const MAGNITUDE_BEARING = new Set([
        "force",
        "load",
        "varying-load",
        "moment",
        "resultant"
    ]);

    const showKnown =
        MAGNITUDE_BEARING.has(object.type) ||
        object.engineering?.discipline === "statics";

    /*
     * Compact horizontal row: label, one numeric
     * input, optional unit, optional constraint box.
     */
    /*
     * An Unknown quantity has no authoritative number, so
     * its field is emptied and disabled rather than left
     * showing a stale value the user could mistake for the
     * real one. Only that one field is affected.
     */
    const scalar = (
        label,
        key,
        value,
        unit = "",
        editable = true,
        isLength = false
    ) => {
        const isUnknown =
            showKnown &&
            !known(key);

        if (!panels || !panels.scalar) {
            return "";
        }

        /*
         * A LENGTH IS CONVERTED; A QUANTITY IS NOT.
         *
         * The geometry holds world units, which are meaningless until the
         * sheet's scale gives them a size, so a field captioned "mm" must
         * be given millimetres - not the raw number. `isLength` marks the
         * fields that are a physical length; the rest are quantities
         * exactly as they say they are.
         */
        const converts = isLength && unit === "mm";

        const shown = converts ? mmOf(value).value : value;

        /*
         * An unknown value has no number to state, so the value slot is left
         * empty deliberately - which is a real, meaningful state, not the
         * "absent value" the shared module refuses. It is passed through as
         * an empty string so the field still renders, disabled.
         */
        let field = panels.scalar({
            label,
            key,
            value: isUnknown ? "" : shown,
            unit: converts ? mmOf(value).unit : unit,
            disabled: !editable || isUnknown || fixed(key),
            /*
             * TWO CONTROLS, TWO SLOTS - AND NEITHER WITHOUT THE OTHER.
             *
             * The `?` Unknown toggle belongs to the VALUE: it says something
             * about the number itself, so it is handed to the unit cell and
             * renders immediately beside the value, on the same line -
             * `[ Value ] [ ? ]`. The constraint tick belongs to the ROW: it
             * says "do not let me edit this", so it stays in the trailing
             * state track - `[✓]`.
             *
             * The old code put both into the state track. Two controls in a
             * 14px column pushed each other sideways or wrapped the `?` onto
             * a second line, and the reading order could come out as
             * `[ Value ] [✓] [ ? ]` - the Unknown marker stranded at the far
             * end of the row, no longer attached to the value it describes.
             *
             * AN UNKNOWN VALUE SHOWS ONLY THE QUESTION MARK: the tick would
             * pin a number that deliberately does not exist.
             */
            unitExtra:
                showKnown
                    ? knownBox(key, label)
                    : "",
            state:
                !isUnknown && editable
                    ? fixBox(key, label)
                    : "",
            classes: isUnknown
                ? "drawing-property-unknown"
                : "",
        });

        return field;
    };

    /*
     * ONE COORDINATE FIELD.
     *
     * `label` is the whole label the student reads - "Start X", or "X" under a
     * "Start" heading - and `key` is the property it edits. One call, one field.
     *
     * It used to route through the shared pair-helper, which builds an X row and
     * a Y row from a single label - so `coordinate("Start X", ...)` came out as
     * "Start X X" and "Start X Y", the label doubled because a two-row builder
     * was handed a one-row label. That is where the four nested coordinate
     * combinations on a Beam came from, and none of them was ever a real
     * engineering concept.
     *
     * The pair form is still available where a pair is genuinely wanted: the
     * `coordinatePair` helper below, which names its two ordinates itself.
     */
    const coordinate = (
        label,
        key,
        value,
        unit = "mm",
        isLength = false
    ) => {
        if (!panels || !panels.scalar) {
            return "";
        }

        /*
         * A COORDINATE IS A PHYSICAL LENGTH TOO.
         *
         * A position is stored in WORLD units, so a field captioned "mm"
         * has to be given millimetres - exactly as a Length does. Without
         * this, every X and Y in the application printed the raw world
         * number under a "mm" tag, so on any calibrated sheet the value
         * was wrong by the scale factor while still looking plausible.
         *
         * `isLength` marks the fields that are a physical distance. It
         * defaults to false so an angular coordinate - an angle in degrees
         * - is never converted, because a degree is not a length and
         * passing it through the scale would be a different angle.
         */
        const converts = isLength && unit === "mm";

        const shown = converts ? mmOf(value).value : value;

        let field = panels.scalar({
            label,
            key,
            value: shown,
            unit: converts ? mmOf(value).unit : unit,
            disabled: fixed(key),
            state: fixed(key) ? "" : fixBox(key, label),
        });

        return field;
    };

    /*
     * A COORDINATE PAIR, UNDER ITS OWN HEADING.
     *
     * This is the form a position is actually shown in: a "Start" heading, then
     * X and Y beneath it. Two fields, each carrying its own unit, and the
     * heading is the conceptual reference rather than a prefix repeated on every
     * row.
     */
    const coordinatePair = (
        heading,
        xKey,
        x,
        yKey,
        y,
        unit = "mm"
    ) => [
        section(heading),
        coordinate("X", xKey, x, unit, true),
        coordinate("Y", yKey, y, unit, true),
    ];

    /*
     * A NUMBER THAT IS TRUE BUT NOT WRITTEN.
     *
     * Joint count, member count, how many supports a beam carries - these
     * are the numbers a student checks a structure against, but none of
     * them is something you type. They are also the numbers that go
     * STALE the moment the structure changes: a beam that gains a
     * support has a different count, and a truss rebuilt at a different
     * panel count has a different number of members.
     *
     * So they are read live off the current feature on every repaint,
     * rather than being stored, and they are shown in the same rows as
     * the fields you can edit - the reader is comparing numbers, and a
     * figure in a different style would read as a different kind of
     * thing. Nothing about them is editable because editing a count is
     * not a thing anyone can mean.
     *
     * A derived ANGLE or LENGTH still carries its unit, though - "0.00" with
     * nothing after it is ambiguous between degrees and millimetres on a
     * panel that also states a Length in mm. So the unit is a third
     * argument, and omitting it is the same mistake as omitting the unit
     * from an editable field.
     */
    const derived = (label, value, unit = "") => {
        if (!panels || !panels.readOnlyQuantity) {
            return "";
        }

        /*
         * A missing derived value is not a field. The shared helper refuses it,
         * so a derived quantity that cannot be computed yet disappears rather
         * than printing an empty row with a unit beside it.
         */
        return panels.readOnlyQuantity(label, value, unit);
    };

    /*
     * A COUNT, WHICH IS NOT A MEASUREMENT.
     *
     * Joint Count, Member Count, Segment Count, how many supports a beam
     * carries - these are integers. They went through `derived`, which
     * formats every number to two decimal places, so the panel said
     *
     *     Segment Count
     *     1.00
     *
     * Two decimal places on a count says the number is a measurement taken
     * from something continuous and might not be exact. It is exact: there
     * are four joints or there are not. The decimals also make the column of
     * counts ragged against the lengths above them, so a reader scanning the
     * panel is comparing 1.00 with 400.00 and being invited to.
     *
     * So counts get their own row rather than a format flag, because the
     * distinction is not "how many decimals" - it is that one of these is a
     * counted thing and the other is a measured one.
     */
    const derivedCount = (label, value) => {
        if (!panels || !panels.readOnly) {
            return "";
        }

        if (!Number.isFinite(Number(value))) {
            return "";
        }

        /*
         * A whole number, not a measurement to two decimals: a count is exact,
         * and a column of "4.00" beside lengths reads as though the count were
         * a measurement taken from something continuous.
         */
        return panels.readOnly(label, Math.round(Number(value)));
    };

    /*
     * The free-text name a student gives a feature.
     *
     * A feature's name is how it is referred to in a beam schedule, a
     * member list and a written solution, so it is editable here rather
     * than being fixed at creation. The row is deliberately last in the
     * hierarchy: it is naming, not engineering, and putting it at the
     * top would give it a prominence the other rows do not have.
     */
    const labelRow = object => {
        if (!panels || !panels.row) {
            return "";
        }

        const name = panels.text(object.name);

        return panels.section("ANNOTATION", [
            panels.row({
                label: "Label",
                control: `<input type="text"
                    data-object-label
                    class="drawing-property-input"
                    aria-label="Label"
                    value="${escapeHtmlText(name === null ? "" : name)}">`,
            }),
        ]);
    };

    /*
     * THE SYMBOL A MAGNITUDE IS WRITTEN UNDER.
     *
     * A force's magnitude reads "F = 100 N", a load's "w = 5 kN/m", a
     * moment's "M = 25 N·m" - and the letter in front is the student's to
     * choose, because on a real sheet a force is as often R_A or W as it
     * is F. This is the field that letter is typed into.
     *
     * IT IS NOT THE FEATURE'S NAME. The name is what the feature is called
     * in a schedule ("Point Force 3"); this is what is printed on the
     * drawing, and the two are genuinely different pieces of information.
     *
     * AN EMPTY FIELD IS A REAL CHOICE - "write the number with no symbol
     * in front of it" - and is kept distinct from "never touched", which
     * falls back to the conventional letter. That distinction is why the
     * input shows the raw stored value and the canvas applies the default
     * only when the field is absent.
     *
     * THE SYMBOL A MAGNITUDE IS WRITTEN UNDER.
     *
     * A force's magnitude reads "F = 100 N", a load's "w = 5 kN/m", a
     * moment's "M = 25 N·m" - and the letter in front is the student's to
     * choose, because on a real sheet a force is as often R_A or W as it
     * is F. This is the field that letter is typed into.
     */
    const magnitudeLabelRow = props => {
        if (!panels || !panels.row) {
            return "";
        }

        const object = props.object;

        const stored = object.magnitudeLabel;

        const value =
            typeof stored === "string"
                ? stored
                : props.defaultLabel || "";

        /*
         * STANDALONE MEANS NO HEADING. The label is a property of the
         * feature, so it is one row, emitted where the caller asks for it -
         * not a section of its own.
         */
        if (props.standalone) {
            return panels.row({
                label: "Label",
                control: `<input type="text"
                    data-magnitude-label
                    class="drawing-property-input"
                    aria-label="Label"
                    placeholder="${escapeHtmlText(props.defaultLabel || "")}"
                    value="${escapeHtmlText(value)}">`,
            });
        }

        return panels.section("ANNOTATION", [
            panels.row({
                label: "Label",
                control: `<input type="text"
                    data-magnitude-label
                    class="drawing-property-input"
                    aria-label="Label"
                    placeholder="${escapeHtmlText(props.defaultLabel || "")}"
                    value="${escapeHtmlText(value)}">`,
            }),
        ]);
    };

    /*
     * The children of a body, grouped by the role they play on it.
     *
     * Counts rather than lists, because a beam with nine supports has
     * nothing useful to say about each of them here: where each one
     * sits and what type it is are already answered by selecting that
     * support. What the beam itself needs to report is whether anything
     * is attached to it at all, and a count says that in one glance
     * without a list that would overflow the panel.
     */
    const attachedCount = (parentId, types) =>
        drawingState.objects.filter(
            object =>
                object.parentId === parentId &&
                (
                    !types ||
                    types.includes(object.type)
                )
        ).length;

     /*
     * Relative position fields, shown INSTEAD of the absolute
     * coordinates for a feature drawn under a parent.
     *
     * These are genuine local coordinates, not relabelled
     * absolute ones: the number stored is the offset from the
     * parent, and writing it moves the child by that offset from
     * where the parent currently is. A child therefore keeps the
     * same relationship to its parent when the parent is dragged,
     * which is what makes the number mean anything after the
     * fact.
     *
     * Defined at module scope as relativeCoordinateRows, because
     * the load panels are separate functions that need it too.
     *
     * The controls it needs are built here rather than passed in.
     * This function takes only the object, so `helpers` is not in
     * scope: referring to it threw a ReferenceError as soon as any
     * feature called this, which is why the Moments, supports,
     * forces, particles and loads never reached their
     * editing page while a Beam - which does not use them - worked
     * fine. The two controls the relative rows need are already
     * defined above, so they are handed over explicitly.
     */
    const relativeRows = (label) =>
        relativeCoordinateRows(
            object,
            label,
            { coordinate, section }
        );

    /*
     * THE STUDENT-FACING NAME, NEVER THE INTERNAL TYPE.
     *
     * Everything above maps a feature type to the words a student would use
     * for it. The final `|| object.type` is the one place an internal string
     * can still reach the panel, and it was how "analysis-diagram" and
     * "force-components" ended up displayed as panel titles.
     *
     * A feature with no registered label is better named for what it is than
     * not named at all, so the fallback stays - but it is a last resort that
     * should not be reached by any feature Datum ships.
     */
    const displayLabel =
        staticsRoleLabel(object) ||
        STATICS_FEATURE_LABELS[object.type] ||
        {
            line: "Line",
            point: "Point",
            polyline: "Polyline",
            triangle: "Triangle",
            polygon: "Polygon",
            circle: "Circle",
            arc: "Arc",
            rectangle: "Rectangle",
            "reference-axis-x-positive": "Reference Axis +X",
            "reference-axis-x-negative": "Reference Axis -X",
            "reference-axis-y-positive": "Reference Axis +Y",
            "reference-axis-y-negative": "Reference Axis -Y",
            [COORDINATE_SYSTEM_TYPE]: "2D Coordinate System",
            /*
             * THE ANALYSIS DIAGRAMS. These have no entry in
             * STATICS_FEATURE_LABELS, so they were falling through to the
             * raw type - which is how a student's SFD was titled
             * "shear-force-diagram" in a panel describing their beam.
             */
            "analysis-diagram": "Analysis Diagram",
            "force-components": "Force Components",
            resultant: "Resultant",
        }[object.type];

    const typeLabel = displayLabel || object.type;

    rows.push(featureHeaderMarkup(object, typeLabel));

    if (object.type === "line") {
        const dx = geometry.end.x - geometry.start.x;
        const dy = geometry.end.y - geometry.start.y;
        rows.push(section("START POINT"));
        rows.push(coordinate("X", "start.x", geometry.start.x, "mm", true));
        rows.push(coordinate("Y", "start.y", geometry.start.y, "mm", true));
        rows.push(section("END POINT"));
        rows.push(coordinate("X", "end.x", geometry.end.x, "mm", true));
        rows.push(coordinate("Y", "end.y", geometry.end.y, "mm", true));
        rows.push(section("MEASUREMENTS"));
        rows.push(
            scalar(
                "Length",
                "length",
                mmOf(Math.hypot(dx, dy)).value,
                mmOf(Math.hypot(dx, dy)).unit,
                true,
                true
            )
        );
        rows.push(scalar("Angle", "angle", Math.atan2(dy, dx) * 180 / Math.PI, "°"));
    } else if (object.type === "point") {
        const position =
            geometry.position || geometry.point || geometry;

        rows.push(section("POSITION"));
        rows.push(coordinate("X", "position.x", position.x, "mm", true));
        rows.push(coordinate("Y", "position.y", position.y, "mm", true));
        rows.push(section("APPEARANCE"));
        rows.push(pointSizeMarkup(object));

        return finaliseRows(rows);
    } else if (object.type === "circle") {
        rows.push(section("CENTER"));
        rows.push(coordinate("X", "center.x", geometry.center.x, "mm", true));
        rows.push(coordinate("Y", "center.y", geometry.center.y, "mm", true));
    } else if (object.type === "arc") {
        rows.push(section("CENTER"));
        rows.push(coordinate("X", "center.x", geometry.center.x, "mm", true));
        rows.push(coordinate("Y", "center.y", geometry.center.y, "mm", true));
        rows.push(section("GEOMETRY"));
        rows.push(scalar("Radius", "radius",
            mmOf(geometry.radius).value, mmOf(geometry.radius).unit));
        rows.push(scalar("Start Angle", "startAngle", geometry.startAngle * 180 / Math.PI, "°"));
        rows.push(scalar("End Angle", "endAngle", geometry.endAngle * 180 / Math.PI, "°"));
        rows.push(scalar("Included", "includedAngle",
            ((geometry.sweep ?? (geometry.endAngle - geometry.startAngle)) * 180 / Math.PI),
            "°", false));
    } else if (object.type === "particle") {
        /*
         * A Particle is defined by its position and its mass, and by
         * nothing else.
         *
         * It is the one body with NO LENGTH, so it must not be offered
         * the line controls: a line type and a line width describe a
         * stroke, and a particle is a filled marker - there is no stroke
         * to style. Those controls used to be suppressed for exactly
         * this reason, which left the particle with no appearance
         * control at all; it now gets the one that applies to it, the
         * size of the marker itself.
         */
        rows.push(section("POSITION"));
        rows.push(relativeRows("POSITION"));
        rows.push(coordinate("X", "position.x", geometry.position.x, "mm", true));
        rows.push(coordinate("Y", "position.y", geometry.position.y, "mm", true));

        rows.push(section("MASS"));
        rows.push(scalar("Mass", "mass",
            Number(geometry.mass) || 0, "kg"));

        rows.push(section("APPEARANCE"));
        rows.push(pointSizeMarkup(object));

        rows.push(labelRow(object));

        /*
         * APPEARANCE was added above for the marker size, so the
         * shared line controls must not be added again at the foot.
         */
        return `<div class="drawing-properties-block">
            ${finaliseRows(rows)}
        </div>`;
    } else if (object.type === "rigid-body") {
        /*
         * A rigid body is one body whose outline can be any of
         * the supported shapes. Only the properties that
         * actually control the current shape are shown, so the
         * panel always offers everything needed to manipulate
         * the body and nothing that does not apply to it.
         *
         * The Shape control rewrites this same body. It never
         * replaces the feature, so the name, the id and any
         * attached loads all survive the change.
         */
        rows.push(
            rigidBodyShapeMarkup(
                object,
                { coordinate, scalar, section }
            )
        );
    } else if (
        enggAnalysisDependencies.isAnalysisObject(
            object
        )
    ) {
        rows.push(
            ...analysisPanelRows(object)
        );
    } else if (
        object.type === "beam" ||
        object.type === "truss" ||
        object.type === "cable" ||
        object.type === "shaft"
    ) {
        /*
         * Slender members are defined by their two ends, and every
         * one of them is described in the same order: the GEOMETRY that
         * says how big it is, the POSITION that says where its ends
         * are, the ORIENTATION that follows from those ends, whatever
         * else is particular to its type, then the shared APPEARANCE
         * and ANNOTATION.
         *
         * That order is chosen so the fields a reader compares sit
         * next to each other. Length is computed from the two ends
         * below it, so putting it first would invite reading it as an
         * independent number; and Angle is the last of the three
         * because it is derived from the ends as well - it is there to
         * be READ as the member's attitude, and the ends are what you
         * change to alter it.
         */
        /*
         * A LENGTH IN THE PANEL IS AN ENGINEERING LENGTH.
         *
         * The geometry stores world units, which are not a physical
         * size - they only become one through the document scale. So
         * a panel that showed the raw number and captioned it "mm"
         * would print 100.42 mm for a beam the student had sized at
         * 500 mm, and the number would be both wrong and
         * authoritative-looking.
         *
         * `length` is therefore the measured distance in world units,
         * and `mmLength` is that distance in MILLIMETRES - which is
         * what the unit beside the field promises. Both are kept
         * because the geometry still works in world units while the
         * panel has to speak in millimetres.
         */
        const length = Math.hypot(
            geometry.end.x - geometry.start.x,
            geometry.end.y - geometry.start.y
        );

        const mmLength = mmOf(length);

        rows.push(section("GEOMETRY"));

        if (object.type === "truss") {
            /*
             * A truss is not one line but a structure, so its GEOMETRY
             * is the envelope the student asked for - the span it
             * covers, how tall it stands and how many panels it is
             * divided into - rather than a pair of ends. Span and
             * Height are read live off the drawn structure, because
             * the members are what define the extent and a truss whose
             * span disagreed with its own members would be lying.
             *
             * Span is editable and moves the structure's far end along
             * its existing direction, exactly as a beam's Length does.
             */
            /*
             * ONE WORD FOR THIS QUANTITY, EVERYWHERE.
             *
             * It was "Span" on a truss and a cable and "Length" on a
             * beam, a line and a shaft - all of them the same property,
             * `length`, so the same physical thing had two names
             * depending on which feature it was drawn with. A student
             * who learned that "Span" meant the distance end to end
             * then found a beam calling the identical number
             * "Length".
             *
             * "Length" is the word kept. It is the term the creation
             * popup already asks for, the term the Smart Dimension
             * reports, and the term the geometry property is called.
             * A span is still a legitimate word in engineering, but it
             * is a DIFFERENT quantity - the horizontal reach of a
             * cable, say, as against how much cable there is - and
             * using it here would mean the word stood for two things
             * across the application.
             */
            rows.push(
                scalar(
                    "Length",
                    "length",
                    mmOf(length).value,
                    mmOf(length).unit,
                    true,
                    true
                )
            );

            rows.push(
                scalar(
                    "Height",
                    "height",
                    mmOf(Number(geometry.height) || 0).value,
                    mmOf(Number(geometry.height) || 0).unit,
                    true,
                    true
                )
            );

            rows.push(section("JOINTS"));
            rows.push(derivedCount("Joint Count",
                (geometry.joints || []).length));

            rows.push(section("MEMBERS"));
            rows.push(derivedCount("Member Count",
                (geometry.members || []).length));

            rows.push(section("OPTIMIZATION"));
            rows.push(`
                <div class="drawing-property-grid drawing-property-grid-value">
                    <span class="drawing-property-grid-label">Panels</span>
                    <input type="number" step="1" min="2"
                        data-property="panels"
                        aria-label="Panels"
                        value="${Math.round(Number(geometry.panels) || 4)}"
                        ${fixed("panels") ? "disabled" : ""}>
                    <span class="drawing-property-unit"></span>
                    <span></span>
                </div>
            `);
            rows.push(trussOptimizeMarkup());
        } else if (object.type === "beam") {
            /*
             * EDITABLE, and applied to the geometry.
             *
             * This used to be a read-only measurement, because Length is
             * derived from the two ends. It is editable now, and typing a
             * new one moves the far end along the beam's existing
             * direction until it reaches that distance from the start -
             * the beam grows or shrinks about the end that was placed
             * first and keeps its attitude.
             */
            rows.push(scalar("Length", "length",
                mmLength.value, mmLength.unit, true, true));
            rows.push(scalar("Height", "depth",
                mmOf(Number(geometry.depth) || 0).value,
                mmOf(Number(geometry.depth) || 0).unit, true, true));
        } else if (object.type === "cable") {
            /*
             * Span and Length are both the spec's own fields, and for
             * a straight cable they are the same number - but they are
             * not the same MEANING: one is how far the cable reaches,
             * the other is how much cable there is, and the second
             * stops being the first the moment a cable is drawn with a
             * sag. They share one GEOMETRY section rather than being
             * split across two, because they are read as one pair.
             *
             * For a straight cable they are the same number, and both are
             * editable, both applied to the geometry the same way.
             */
            /*
             * The cable's cable-length - how much cable there is - is a
             * DIFFERENT quantity from how far it reaches, and the
             * original code said so twice: once in the block comment
             * above and again in a longer one here, explaining why two
             * fields were needed and why one of them was derived.
             *
             * Only one of them is stored. `length` is the reach, and it
             * is the one the creation popup and the Smart Dimension
             * both edit. For a straight cable the cable-length equals
             * the reach, so it can be derived from the same geometry
             * rather than stored a second time - which is what stops
             * the panel showing two numbers that quietly disagree the
             * moment the cable is given a sag.
             *
             * The reachable amount of cable is therefore a DERIVED
             * readout, and the field to type into is Length, named the
             * same as everywhere else in the application.
             */
            rows.push(
                scalar(
                    "Length",
                    "length",
                    mmOf(length).value,
                    mmOf(length).unit,
                    true,
                    true
                )
            );

            rows.push(
                derived(
                    "Length",
                    (geometry.segments || []).length
                        ? geometry.length ?? length
                        : length,
                    "mm"
                )
            );

            rows.push(section("SEGMENTS"));
            rows.push(derivedCount("Segment Count",
                (geometry.segments || []).length ||
                Math.max(1, Number(geometry.segmentCount) || 1)));
        } else {
            rows.push(scalar("Length", "length",
                mmOf(length).value, mmOf(length).unit));
            rows.push(scalar("Diameter", "diameter",
                mmOf(Number(geometry.diameter) || 0).value,
                mmOf(Number(geometry.diameter) || 0).unit));
            rows.push(scalar("Radius", "radius",
                mmOf(
                    Number(geometry.radius) ||
                        (Number(geometry.diameter) || 0) / 2
                ).value,
                mmOf(
                    Number(geometry.radius) ||
                        (Number(geometry.diameter) || 0) / 2
                ).unit));
        }

        /*
         * POSITION and ORIENTATION are in the same place for all four
         * types, because all four are straight members whose position
         * IS their two ends and whose orientation is what those ends
         * make.
         */
        rows.push(section("POSITION"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x, "mm", true));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y, "mm", true));
        rows.push(coordinate("End X", "end.x", geometry.end.x, "mm", true));
        rows.push(coordinate("End Y", "end.y", geometry.end.y, "mm", true));

        rows.push(section("ORIENTATION"));
        rows.push(derived("Angle",
            Math.atan2(
                geometry.end.y - geometry.start.y,
                geometry.end.x - geometry.start.x
            ) * 180 / Math.PI, "°"));

        /* Whatever is particular to this type, after the shared three. */
        if (object.type === "cable") {
            rows.push(section("CABLE"));
            rows.push(scalar("Tension", "tension",
                Number(geometry.tension) || 0, "N"));
        } else if (object.type === "shaft") {
            rows.push(section("SHAFT"));
            rows.push(scalar("Torque", "torque",
                Number(geometry.torque) || 0, "N·m"));
        } else if (object.type === "beam") {
            rows.push(section("RELATIONSHIPS"));
            rows.push(derivedCount("Supports",
                attachedCount(object.id)));
            rows.push(derivedCount("Connections",
                attachedCount(object.id, [
                    "pin-connection",
                    "fixed-connection",
                    "slider-connection"
                ])));
        }

        rows.push(labelRow(object));
    } else if (object.type === "force") {
        /*
         * A Point Force is one vector with two equally valid
         * descriptions of it, and the panel offers both through
         * the same segmented control the Triangle uses for its
         * two definitions.
         *
         * The endpoint is deliberately NOT editable. It is the
         * drawn arrow's tip, and it is fully determined by the
         * application point and the vector, so exposing it would
         * offer a third way of editing the same force that could
         * disagree with the other two. The position and
         * orientation of the force are expressed by its
         * application point and its magnitude and direction.
         */
        const mode =
            forcePanelMode(object);

        const vector =
            enggLoadProfile.forceVector(
                geometry
            );

        /*
         * THE LABEL IS A FEATURE PROPERTY, AND IT SITS WITH THE NAME.
         *
         * "Feature Name, then Label" is the order the student reasons in: first
         * what this thing is called in a schedule, then what its magnitude is
         * written under on the sheet. There is no ANNOTATION section holding
         * it - a separate heading would imply the label belongs to the
         * drawing's presentation rather than to the force itself.
         */
        rows.push(
            magnitudeLabelRow({
                object,
                defaultLabel: "F",
                standalone: true,
            })
        );

        rows.push(section("FORCE"));

        rows.push(`
            <div class="drawing-segmented" role="group" aria-label="Force definition">
                <button type="button"
                    class="drawing-segmented-option${mode === "polar" ? " active" : ""}"
                    data-force-mode="polar"
                    aria-pressed="${mode === "polar"}">
                    Magnitude &amp; Direction
                </button>
                <button type="button"
                    class="drawing-segmented-option${mode === "components" ? " active" : ""}"
                    data-force-mode="components"
                    aria-pressed="${mode === "components"}">
                    X / Y Components
                </button>
            </div>
        `);

        if (mode === "polar") {
            rows.push(
                scalar(
                    "Magnitude",
                    "magnitude",
                    vector.magnitude,
                    "N"
                )
            );

            rows.push(
                scalar(
                    "Direction",
                    "angle",
                    vector.angle,
                    "°"
                )
            );

            /*
             * The same Reverse Direction control the load tools use,
             * built by the same markup helper so a force and a load
             * cannot drift apart in appearance or in behaviour. Only the
             * data attribute differs, because only the handler differs.
             */
            rows.push(
                reverseDirectionMarkup(
                    "data-force-reverse-direction"
                )
            );
        } else {
            rows.push(
                scalar(
                    "X Component",
                    "forceX",
                    vector.fx,
                    "N"
                )
            );

            rows.push(
                scalar(
                    "Y Component",
                    "forceY",
                    vector.fy,
                    "N"
                )
            );
        }

        rows.push(section("APPLICATION POINT"));
        rows.push(relativeRows("APPLICATION POINT"));
        rows.push(
            coordinate(
                "X",
                "start.x",
                vector.x,
                "mm",
                true
            )
        );
        rows.push(
            coordinate(
                "Y",
                "start.y",
                vector.y,
                "mm",
                true
            )
        );
    } else if (object.type === "moment") {
        /*
         * A MOMENT, IN THE TERMS A MOMENT ACTUALLY HAS.
         *
         * No endpoint X and Y, no length, no components. Those belong
         * to a straight force, and offering them for a moment invites
         * the reader to treat a rotation as a vector - which is the
         * misunderstanding the symbol is supposed to prevent, and the
         * one that makes a moment look like a force with a kink in it.
         *
         * What a moment has instead is a magnitude with a UNIT, a
         * sense of rotation, one point it acts at, and a handful of
         * presentation choices. The magnitude and the direction are the
         * engineering; the radius, the line and the head are the
         * drawing; and the grouping keeps them apart, because
         * resizing the arc must never look like it changes the moment.
         */
        rows.push(section("VALUE"));
        rows.push(scalar("Magnitude", "magnitude",
            Number(geometry.magnitude) || 0, geometry.unit || "N·m"));

        rows.push(magnitudeLabelRow({
            object,
            defaultLabel: "M",
        }));

        rows.push(section("DIRECTION"));
        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Direction</span>
                <select data-property="direction" aria-label="Direction">
                    <option value="CCW"${
                        momentDirectionOf(geometry) === "CCW"
                            ? " selected"
                            : ""
                    }>Counterclockwise</option>
                    <option value="CW"${
                        momentDirectionOf(geometry) === "CW"
                            ? " selected"
                            : ""
                    }>Clockwise</option>
                </select>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `);

        /*
         * NO FLIP BUTTON HERE, DELIBERATELY.
         *
         * The Direction dropdown immediately above already offers both
         * senses, so a "Switch Direction" control on a Moment would be a
         * second way of doing what the dropdown does - and a second way
         * is a second place for the two to disagree about what the moment
         * currently is.
         *
         * The load and force tools keep their flip button because their
         * direction is an ANGLE they type, and flipping is a shortcut
         * across a continuous range. A moment has only two senses, CW and
         * CCW, both named in the list; there is nothing for a button to
         * shortcut.
         */

        /*
         * RELATIVE TO THE FEATURE THE MOMENT IS ON.
         *
         * A moment attached to a body reports its position the same
         * way a support does — the shared relative-coordinates rows,
         * which name the parent and give the position along it in the
         * sheet's units. When there is no parent the rows render
         * nothing and the absolute coordinates below are the only
         * placement the panel offers, which is the honest state for a
         * moment in free space.
         */
        rows.push(relativeRows("RELATIONSHIP"));

        rows.push(section("POSITION"));
        rows.push(coordinate("Application Point X", "position.x", geometry.position.x, "mm", true));
        rows.push(coordinate("Application Point Y", "position.y", geometry.position.y, "mm", true));

        rows.push(section("APPEARANCE"));
        rows.push(arcRadiusRow(geometry));
    } else if (
        object.type === "load" ||
        object.type === "varying-load"
    ) {
       /*
        * A Distributed Load and a Varying Distributed Load share ONE
        * panel.
        *
        * They are the same feature with a different distribution: both
        * act over a region of a body and both point the same way. The
        * load's panel itself states the ONE uniform magnitude of the
        * region - see `distributedLoadPanelMarkup`.
        *
        * Every control here writes straight to the model the renderer
        * reads, so a change is visible immediately and the load never has
        * to be deleted and rebuilt.
        */
       rows.push(
           distributedLoadPanelMarkup(
               object,
               { coordinate, scalar, section }
           )
       );
    } else if (
        object.type === "pin-support" ||
        object.type === "roller-support" ||
        object.type === "fixed-support" ||
        object.type === "smooth-support"
    ) {
        /*
         * Each support variant is its own feature with its own
         * position and orientation, so the panel names the
         * variant the student actually placed.
         */
        rows.push(
            supportPanelRows(object)
        );
    } else if (
        object.type === "pin-connection" ||
        object.type === "fixed-connection" ||
        object.type === "slider-connection"
    ) {
        /*
         * Each connection variant is a real feature, so it is
         * named for itself rather than as a generic connection.
         */
        rows.push(section(staticsConnectionSection(object.type)));
        rows.push(coordinate("Start X", "start.x", geometry.start.x, "mm", true));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y, "mm", true));
        rows.push(coordinate("End X", "end.x", geometry.end.x, "mm", true));
        rows.push(coordinate("End Y", "end.y", geometry.end.y, "mm", true));
    } else if (object.type === "connection") {
        rows.push(section("CONNECTION"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x, "mm", true));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y, "mm", true));
        rows.push(coordinate("End X", "end.x", geometry.end.x, "mm", true));
        rows.push(coordinate("End Y", "end.y", geometry.end.y, "mm", true));
        rows.push(scalar("Reaction", "reaction",
            Number(geometry.reaction) || 0, "N"));
    } else if (
        object.type === "support" ||
        object.type === "body"
    ) {
        rows.push(section(
            object.type === "support"
                ? "SUPPORT"
                : "BODY"
        ));
        rows.push(relativeRows("POSITION"));
        rows.push(coordinate("Position X", "position.x", geometry.position.x, "mm", true));
        rows.push(coordinate("Position Y", "position.y", geometry.position.y, "mm", true));
    } else if (object.type === "polygon") {
        /*
         * The definition is remembered from creation so
         * the panel can lead with the matching view,
         * but the underlying parameters are the same.
         */
        const definition =
            object.metadata?.definition ||
            "By Centre";

        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Definition</span>
                <span class="drawing-property-readonly">${definition}</span>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `);

        rows.push(section("GEOMETRY"));
        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Number of Sides</span>
                <input type="number" step="1" min="3"
                    data-property="sides"
                    aria-label="Number of Sides"
                    value="${Math.round(Number(geometry.sides) || 3)}"
                    ${fixed("sides") ? "disabled" : ""}>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `);
        rows.push(coordinate("Centre X", "center.x", geometry.center.x, "mm", true));
        rows.push(coordinate("Centre Y", "center.y", geometry.center.y, "mm", true));
        rows.push(scalar("Radius", "radius",
            mmOf(geometry.radius).value, mmOf(geometry.radius).unit));
        rows.push(scalar("Rotation", "rotation",
            (Number(geometry.rotation) || 0) * 180 / Math.PI, "°"));
    } else if (
        object.type ===
            "reference-axis-x-positive" ||
        object.type ===
            "reference-axis-x-negative" ||
        object.type ===
            "reference-axis-y-positive" ||
        object.type ===
            "reference-axis-y-negative"
    ) {
        /*
         * Legacy reference-axis features from older files
         * are still editable so saved drawings keep
         * working.
         */
        rows.push(section("ORIGIN"));
        rows.push(coordinate("X", "origin.x", geometry.origin.x, "mm", true));
        rows.push(coordinate("Y", "origin.y", geometry.origin.y, "mm", true));
        rows.push(section("GEOMETRY"));
        rows.push(scalar("Axis Length", "axisLength",
            mmOf(Number(geometry.axisLength) || 25).value,
            mmOf(Number(geometry.axisLength) || 25).unit));
    } else if (object.type === "rectangle") {
        const center = {
            x: geometry.position.x + geometry.width / 2,
            y: geometry.position.y - geometry.height / 2
        };
        rows.push(section("GEOMETRY"));
        rows.push(coordinate("Centre X", "centre.x", center.x, "mm", true));
        rows.push(coordinate("Centre Y", "centre.y", center.y, "mm", true));
        rows.push(scalar("Width", "width",
                mmOf(geometry.width).value, mmOf(geometry.width).unit));
        rows.push(scalar("Height", "height",
                mmOf(geometry.height).value, mmOf(geometry.height).unit));
        rows.push(scalar("Rotation", "rotation", geometry.rotation || 0, "°"));
    } else if (object.type === "polyline") {
        rows.push(section("GEOMETRY"));
        (geometry.points || []).forEach((p, index) => {
            rows.push(coordinate(`Point ${index + 1} X`, `points.${index}.x`, p.x, "mm", true));
            rows.push(coordinate(`Point ${index + 1} Y`, `points.${index}.y`, p.y, "mm", true));
        });
    } else if (object.type === "triangle") {
        /*
         * The triangle has its own editor so the
         * Points and Sides & Angles views can share
         * one set of stored points.
         */
        return trianglePropertyMarkup(object, trianglePanelMode(object));
    } else if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * One feature with four independent extensions.
         * Editing any one value changes only that side.
         */
        rows.push(section("ORIGIN"));
        rows.push(coordinate("Origin X", "origin.x", geometry.origin.x, "mm", true));
        rows.push(coordinate("Origin Y", "origin.y", geometry.origin.y, "mm", true));
        rows.push(section("AXIS EXTENSIONS"));

        /*
         * READ IN MILLIMETRES, LIKE EVERY OTHER LENGTH.
         *
         * These were the raw world values captioned "mm" - so an axis
         * 100 world units long reported itself as 100 mm on an
         * uncalibrated sheet, and as something else entirely once a
         * scale existed. `mmOf` is the one conversion, which is what
         * keeps the number here, the number the setter writes, and
         * the number a Smart Dimension reports as the same length.
         */
        const axisMm = value =>
            mmOf(Number(value) || 0);

        rows.push(scalar("X Positive Length", "xPositiveLength",
                axisMm(geometry.xPositiveLength ?? geometry.axisLength ?? 25).value,
                axisMm(geometry.xPositiveLength ?? geometry.axisLength ?? 25).unit));
        rows.push(scalar("X Negative Length", "xNegativeLength",
                axisMm(geometry.xNegativeLength ?? geometry.axisLength ?? 25).value,
                axisMm(geometry.xNegativeLength ?? geometry.axisLength ?? 25).unit));
        rows.push(scalar("Y Positive Length", "yPositiveLength",
                axisMm(geometry.yPositiveLength ?? geometry.axisLength ?? 25).value,
                axisMm(geometry.yPositiveLength ?? geometry.axisLength ?? 25).unit));
        rows.push(scalar("Y Negative Length", "yNegativeLength",
                axisMm(geometry.yNegativeLength ?? geometry.axisLength ?? 25).value,
                axisMm(geometry.yNegativeLength ?? geometry.axisLength ?? 25).unit));
    }

    rows.push(appearanceMarkup(object));

    /*
     * NO SECOND TITLE.
     *
     * The header at the top of this panel already states the feature's name -
     * `featureHeaderMarkup` emits it, and the editable name field beneath it.
     * Repeating `object.name` here printed the feature twice, one line under
     * the other, which read as two features rather than one.
     */
    return `<div class="drawing-properties-block">
        ${finaliseRows(rows)}
    </div>`;
}

/*
 * Point markers are drawn at a fixed screen size, so
 * the only meaningful appearance control is the
 * marker size itself.
 */
function pointSizeMarkup(
    object
) {
    /*
     * A marker size is a whole number of pixels. `|| 6` supplies the default
     * for an absent value, and the finiteness test keeps a corrupt stored value
     * from reaching the field as "NaN".
     */
    const stored = Number(object.style.pointSize);

    const size = Number.isFinite(stored) && stored > 0 ? Math.round(stored) : 6;

    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Point Size</span>
            <input type="number" step="1" min="1"
                data-style="pointSize"
                aria-label="Point Size"
                value="${size}">
            <span class="drawing-property-unit">px</span>
            <span></span>
        </div>
    `;
}

/*
 * The triangle panel has two views over the same
 * stored points. The chosen view is remembered per
 * object so switching back and forth preserves the
 * triangle instead of rebuilding it.
 */
export const trianglePanelModes =
    new Map();

function trianglePanelMode(
    object
) {
    return (
        trianglePanelModes.get(
            object.id
        ) || "points"
    );
}

/*
 * The Point Force panel has two views over the SAME force:
 * a magnitude and a direction, or the two components that force
 * is made of. The chosen view is remembered per object, and
 * because both views are read from and written to the one
 * underlying vector, switching between them never changes the
 * force, it only changes which numbers are on screen.
 */
export const forcePanelModes =
    new Map();

function forcePanelMode(
    object
) {
    return (
        forcePanelModes.get(
            object.id
        ) || "polar"
    );
}
