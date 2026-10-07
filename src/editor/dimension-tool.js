/*
 * The Dimension and Smart Dimension tools: choosing and committing a measurement.
 */

import enggMeasurement from "../core/geometry/measurement-core.js";
import enggDrawingState from "../core/model/drawing-state.js";
import enggDimensions from "../core/scale/dimensions.js";
import enggScaleCalibration from "../core/scale/scale-calibration.js";
import enggDimensionModel from "../features/dimensions/dimension-model.js";
import enggSmartDimension from "../features/dimensions/smart-dimension.js";
import enggVariableDimension from "../features/dimensions/variable-dimension.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { drawingState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { distanceToSegment, objectAtPoint } from "./hit-testing.js";
import { setToolMessage } from "./toolbar-render.js";

/*
 * Is this one of the dimension tools?
 *
 * THREE tools, one placement interaction: Dimension, Smart Dimension and
 * Variable Dimension all pick references and then a placement point. They differ
 * in what they CREATE - a chosen measurement, an inferred one, or a symbol - and
 * in nothing else, which is why they are routed together and the difference is
 * decided at the moment the feature is built.
 */
export function isDimensionTool(
    toolId
) {
    return (
        toolId === "dimension" ||
        toolId === "smart-dimension" ||
        toolId === "variable-dimension"
    );
}

/*
 * The measurements available for a selection.
 *
 * Delegates to the measurement model rather than inspecting types, so
 * this holds for every feature that has registered what it can be
 * measured as - and quietly returns nothing for one that has not,
 * rather than guessing.
 *
 * One object gives its own candidates. Two give the RELATIONSHIP
 * between them, which is the whole difference between measuring a
 * single circle and measuring the gap between two circles.
 */
/*
 * The measurements a selection supports, as complete DESCRIPTORS.
 *
 * Returns objects that already carry their own references, rather than
 * bare measurement types, because a single feature and a pair of
 * features refer to their geometry in different ways and asking this
 * file to assemble both would mean re-implementing what the Smart
 * Dimension tool already knows.
 *
 * `describe` is used for one feature and `describePair` for two. That
 * split is the model's, not this file's: deciding what a pair MEANS -
 * that two non-parallel spans should give their included angle rather
 * than two separate lengths - belongs with the measurements, and is
 * kept there rather than re-derived here.
 *
 * A selection of more than two is reduced to its first two, because a
 * measurement is a relationship between two things; anything else has
 * no single meaning, and guessing one would put a number on the drawing
 * that answers a question nobody asked.
 */
export function dimensionDescriptorsFor(
    objects
) {
    const parts =
        (objects || []).filter(
            Boolean
        );

    try {
      if (parts.length === 1) {
        return (
          enggSmartDimension.propose(
            [parts[0]],
            drawingState
          ) || []
        );
      }

      if (parts.length === 2) {
        return (
          enggSmartDimension.describePair(
            parts[0],
            parts[1],
            drawingState
          ) || []
        );
      }

      return [];
    } catch (error) {
      return [];
    }
}

/*
 * A readable description of what is about to be measured.
 *
 * The status line has to say what the tool RECOGNISED, not merely
 * that it found something. For a single feature the measurement's own
 * name is enough, because there is only one thing it could refer to.
 *
 * For a pair it is not: "Angular" on its own leaves a student unable
 * to tell whether it means the angle between the two lines they picked
 * or something the tool worked out on its own, so the pair is named.
 */
export function dimensionChoiceMessage(
    descriptor,
    objects
) {
    const label = dimensionChoiceLabel(
        descriptor?.dimensionType
    );

    if (
        !Array.isArray(objects) ||
        objects.length < 2
    ) {
        return label;
    }

    return (
        `${label} between ${featureNameOf(
            objects[0]
        )} and ${featureNameOf(
            objects[1]
        )}`
    );
}

/*
 * A feature's own name, for messages that have to say which feature is
 * being measured.
 *
 * Falls back to its type so a feature with no name is still identified
 * - "Beam and Beam" is poor wording, but it is better than a message
 * that names nothing at all.
 */
export function featureNameOf(
    object
) {
    return (
        object?.name ||
        object?.type ||
        "feature"
    );
}

/*
 * A short name for a measurement, for the message that tells the
 * student what the tool has recognised.
 */
export function dimensionChoiceLabel(
    dimensionType
) {
    return (
        enggMeasurement.DIMENSION_TYPES?.[
            dimensionType
        ]?.label ||
        dimensionType
    );
}

/*
 * Turn the armed measurement into a real dimension feature.
 *
 * Goes through the feature factory rather than being built here, so a
 * dimension is named, numbered, selected, undone and saved by exactly
 * the same code as every other feature. It is a feature on a drawing,
 * not a decoration painted over one.
 */
export function commitDimension(
    dimensionType,
    refs,
    placement
) {
    /*
     * THE FIRST DIMENSION ESTABLISHES THE SCALE.
     *
     * A drawing's coordinates are numbers until somebody says how big
     * one of them is, and a dimension has no honest number to print
     * until then. So rather than adding the dimension with a "~" in
     * front of its value and hoping the student notices, the first
     * dimension asks what the geometry they have just measured really
     * is.
     *
     * Nothing is created until that is answered. Cancelling leaves the
     * drawing exactly as it was - no dimension, no scale, no trace -
     * which is the whole reason the question is asked before the commit
     * rather than after it.
     *
     * It applies to Smart Dimension exactly as it does to Dimension:
     * the tool chooses the MEASUREMENT, not whether the drawing has a
     * scale, so both arrive here and both are gated identically.
     */
    if (
        !enggDimensions.isCalibrated(
            drawingState
        )
    ) {
        const measuredUnits =
            dimensionMeasurementInDrawingUnits(
                dimensionType,
                refs
            );

        const pending = {
            dimensionType,
            refs,
            placement
        };

        /*
         * The interaction is released BEFORE the dialog opens, so the
         * armed measurement does not sit behind a modal looking live.
         * It is restored on confirm, which is why the pending work is
         * captured here rather than read back out of the interaction.
         */
        enggDrawingState.clearInteraction(
            drawingState
        );

        enggScaleCalibration.open({
            measuredUnits,

            /*
             * A suggested starting value: the drawing length as if it
             * were millimetres. It saves typing, and it is a
             * suggestion only - confirming it unchanged simply
             * establishes a 1:1 scale, which is a real answer.
             */
            realValue:
                Number(measuredUnits?.toFixed?.(2) ?? measuredUnits),

            unit:
                enggDimensions.readScale(
                    drawingState
                )?.unit || "mm",

            onConfirm: (
                realValue,
                unit
            ) => {
                /*
                 * Recorded through the normal change path, so the
                 * calibration is undoable and survives save and load
                 * exactly as any other document change does.
                 */
                enggDrawingState.commitDrawingChange(
                    drawingState,
                    enggDrawingState.snapshotDrawing(
                        drawingState
                    )
                );

                enggDimensions.calibrate(
                    drawingState,
                    measuredUnits,
                    realValue,
                    unit
                );

                renderProperties();
                renderCurrentDrawing();

                /*
                 * The same commit as an ordinary one, now with a
                 * scale to state the measurement in. Every dimension
                 * on the sheet updates from here, because they all read
                 * the one document scale.
                 */
                commitDimensionNow(
                    pending
                );
            },

            onCancel: () => {
                setToolMessage(
                    "Dimension cancelled - the drawing scale was not set"
                );

                renderCurrentDrawing();
            }
        });

        renderCurrentDrawing();

        return null;
    }

    return commitDimensionNow({
        dimensionType,
        refs,
        placement
    });
}

/*
 * The measured length in DRAWING UNITS, for the calibration question.
 *
 * Deliberately the raw drawing measurement, not a formatted one: the
 * dialog states the drawing length and asks for the real length, and a
 * number dressed up in a unit the document does not yet have would make
 * that comparison meaningless.
 */
function dimensionMeasurementInDrawingUnits(
    dimensionType,
    refs
) {
    /*
     * A probe dimension, used only to measure. It is never added to the
     * drawing, so nothing is created and nothing is selected.
     */
    const probe =
        enggDrawingState.geometryFactories
            .dimension({
                dimensionType,
                refs,
                placement: { x: 0, y: 0 }
            });

    const measurement =
        enggDimensionModel.measurementFor(
            probe,
            drawingState
        );

    return measurement?.value;
}

/*
 * Commit a dimension whose scale question is already settled.
 *
 * Split out from the gate above so the actual creation has exactly one
 * implementation: the calibrated path and the just-calibrated path run
 * identical code, rather than one calling the other and leaving it
 * unclear which is the real one.
 */
function commitDimensionNow({
    dimensionType,
    refs,
    placement
}) {
    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * WHICH KIND OF FEATURE THE STUDENT IS PLACING.
     *
     * The two tools share this whole path - the reference picking, the
     * placement click, the commit, the selection - and differ only in what is
     * created at the end. That is deliberate: a Variable Dimension is placed
     * exactly like a dimension, because attaching it to the geometry is what
     * makes it a statement ABOUT the drawing rather than a note beside it.
     *
     * A variable is created with the DEFAULT SYMBOL and no measurement. It never
     * touches the calibration question either, because there is no measured
     * length to convert - an unknown has no units until the student gives it
     * one.
     */
    const variable =
        drawingState.activeTool === "variable-dimension";

    const object = variable
        ? enggDrawingState.geometryFactories["variable-dimension"]({
              refs,
              placement
          })
        : enggDrawingState.geometryFactories.dimension({
              dimensionType,
              refs,
              placement
          });

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    /*
     * Selected after creation so the student can move or delete it
     * straight away - which is the commonest thing anyone wants to do
     * with a dimension they have just placed.
     */
    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    if (variable) {
        setToolMessage(
            `Variable placed - ${enggVariableDimension.variableText(object)}`
        );

        renderProperties();
        renderCurrentDrawing();

        return object;
    }

    const measured =
        enggDimensionModel.formatMeasurement(
            object,
            drawingState
        );

    setToolMessage(
        measured
            ? `Dimension placed - ${measured}`
            : "Dimension placed"
    );

    renderProperties();
    renderCurrentDrawing();

    return object;
}

/*
 * WHICH FEATURE IS BEING DIMENSIONED
 *
 * A click does not always land ON a feature. objectAtPoint finds the
 * nearest EDGE, which is right for selecting a line but wrong for a
 * body: clicking in the middle of a Beam, a Rectangle or a Truss finds
 * nothing, so those features could only ever be dimensioned by hitting
 * their outline. For a tool whose whole job is to measure a feature,
 * that is not good enough.
 *
 * So when the edge test misses, the click is resolved against each
 * feature's own ANCHORS - the points the measurement system already
 * says this feature can be measured from - and the nearest one within
 * a screen-sized radius wins.
 *
 * Reusing the anchors rather than inventing a second set of hit
 * shapes means the thing the student clicks near is the same thing the
 * dimension will be measured from, which is why a Beam is picked by
 * its ends and a Circle by its own extent rather than by a bounding
 * box that may be far larger than either.
 */
export function findDimensionTarget(
    point
) {
    const direct =
        objectAtPoint(point);

    if (direct) {
        return direct;
    }

    /*
     * A radius of about twelve screen pixels, expressed in world
     * units so it stays the same physical size on screen at any zoom.
     *
     * That radius is right for a feature that IS its anchors - a line,
     * a beam, a shaft - because clicking anywhere along one is within
     * reach of an end.
     */
    const radius =
        12 /
        Math.max(
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
                drawingState.camera.zoom,
            0.0001
        );

    let best = null;
    let bestDistance = radius;

    for (const object of drawingState.objects) {
        /*
         * A dimension is not something to dimension. Skipping it
         * keeps a dimension from being measured by another dimension,
         * which would be a dimension describing a number rather than
         * the drawing.
         */
        if (
            object.type === "dimension" ||
            object.type === "annotation"
        ) {
            continue;
        }

        let anchors;

        try {
            /*
             * anchorOptions returns the NAMES a feature can be
             * measured from, not their positions - asking it for
             * points found nothing, which is why a click in the
             * middle of a rectangle never resolved to the rectangle.
             * anchorNames plus resolveAnchor is the same information
             * with the coordinates attached, and resolveAnchor is what
             * the measurement itself uses, so this stays on exactly
             * the geometry the dimension will be taken from.
             */
            anchors =
                (enggMeasurement.anchorOptions(object) || [])
                    .map(
                        name => ({
                            name: String(name),
                            at: enggMeasurement.resolveAnchor(
                                object,
                                name
                            )
                        })
                    );
        } catch (error) {
            anchors = null;
        }

        /*
         * Each anchor is kept with the NAME it was resolved from, because the
         * name is what says whether it is a corner or a midpoint - the array
         * INDEX says nothing. A midpoint lies on the outline and must not be
         * treated as a corner in the interior test below.
         */
        const points = (anchors || [])
            .map((entry) => ({
                name: entry.name,
                ...(entry.at || {})
            }))
            .filter(
                anchor =>
                    Number.isFinite(anchor.x) &&
                    Number.isFinite(anchor.y)
            );

        if (points.length === 0) {
            continue;
        }

        /*
         * INSIDE THE FEATURE
         *
         * The radius alone is not enough for a body. A rectangle's
         * anchors are its four CORNERS, so the middle of a wide
         * rectangle can be a hundred pixels from every one of them -
         * which is exactly where a student aims when they want to
         * dimension it.
         *
         * THE OUTLINE IS THE FEATURE'S UNIQUE CORNERS, IN ORDER.
         *
         * A triangle publishes nine anchors - start, midpoint and end for each
         * of its three sides - and a side's end is the next side's start. Fed
         * to a crossing test as-is, that list walks each edge twice and counts
         * crossings wrongly, so clicking inside a triangle could resolve to
         * nothing. Taking the corners and dropping repeats leaves the perimeter
         * exactly once, in order, which is what the test needs.
         */
        const cornersForOutline =
            uniqueCornerOutline(points);

        if (
            cornersForOutline.length >= 3 &&
            pointInsideOutline(
                point,
                cornersForOutline
            )
        ) {
            return object;
        }

        /*
         * NEAR THE FEATURE'S SPAN, not merely its endpoints.
         *
         * Anchors are endpoints and centres. A feature that is long
         * between them - a force's arrow, a beam, a cable - has most of
         * its own length far from any of them, so measuring to the
         * anchors alone meant the middle of a 40 mm beam was unclickable
         * while its ends were fine. Clicking a feature means clicking
         * ON it, which is most of it, not the few points it is measured
         * from.
         *
         * So the click is measured against the nearest segment joining
         * the anchors as well. Anchors come from the measurement layer
         * and are the feature's own points, so this is the real shape
         * and not a bounding box that would claim far more than belongs
         * to it.
         */
        for (let i = 1; i < points.length; i += 1) {
            const distance =
                distanceToSegment(
                    point,
                    points[i - 1],
                    points[i]
                );

            if (distance < bestDistance) {
                bestDistance = distance;
                best = object;
            }
        }
    }

    return best;
}

/*
 * The feature's perimeter: its corner anchors, with repeats removed, in the
 * order they were published.
 *
 * A composite feature publishes an anchor per side - a start and an end - and a
 * side's end is the next side's start. Kept as published, the list visits every
 * corner twice and cannot be used as a polygon. Keeping the first occurrence of
 * each corner leaves the outline exactly once, in order.
 *
 * Midpoint anchors are dropped: they lie ON an edge, and a crossing test given
 * a point on its own boundary is a coin toss.
 */
function uniqueCornerOutline(points) {
    const corners = [];

    const seen = (point) =>
        corners.some(
            (kept) =>
                Math.abs(kept.x - point.x) < 1e-9 &&
                Math.abs(kept.y - point.y) < 1e-9
        );

    points.forEach((point) => {
        if (/mid$/i.test(String(point?.name || ""))) {
            return;
        }

        /*
         * A coordinate already on the outline is the SAME corner, however many
         * anchors name it. A triangle publishes its three vertices directly as
         * `a`, `b`, `c`, and again as each side's start and end - keeping every
         * occurrence would visit each corner three times and give the crossing
         * test a shape that is not the triangle.
         */
        if (!seen(point)) {
            corners.push(point);
        }
    });

    return corners;
}

/*
 * Is a point inside the outline its anchors describe?
 *
 * Used only to decide what the student clicked, never to measure
 * anything, so a plain crossing count is enough and an exact answer
 * is not required.
 */
function pointInsideOutline(
    point,
    outline
) {
    let inside = false;

    for (
        let i = 0,
            j = outline.length - 1;
        i < outline.length;
        j = i++
    ) {
        const a = outline[i];
        const b = outline[j];

        const straddles =
            a.y > point.y !== b.y > point.y;

        if (
            straddles &&
            point.x <
                ((b.x - a.x) *
                    (point.y - a.y)) /
                    (b.y - a.y) +
                    a.x
        ) {
            inside = !inside;
        }
    }

    return inside;
}
