/*
 * Placing a dimension: reference selection and the placement click.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { dimensionReferenceAtClick, inferDimensionDescriptor } from "./dimension-inference.js";
import { commitDimension, dimensionChoiceLabel, dimensionChoiceMessage } from "./dimension-tool.js";
import { drawingState } from "./editor-state.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { setToolMessage } from "./toolbar-render.js";

/*
 * A click while the dimension tool is active.
 *
 * THE STATE MACHINE
 * -----------------
 * The tool moves through four stages, and a click means a different
 * thing in each:
 *
 *   idle / first   choose a reference. NEVER creates a dimension, even
 *                  when the reference is a whole line - a line is a
 *                  complete reference and moves straight to placement,
 *                  but a single POINT only waits for its partner.
 *   second         the second reference has arrived; infer the type and
 *                  enter placement.
 *   placement      the click places the annotation. It is not another
 *                  reference.
 *
 * The first click is never both a reference and a placement command,
 * which is the whole point of the separation.
 */
export function handleDimensionClick(
    resolution,
    event
) {
    /*
     * THE RESOLVED REFERENCE, NOT THE POINTER.
     *
     * A dimension's references are exact points on the model - an endpoint, a
     * midpoint, a centre - and the only thing that can name one is the shared
     * snap resolver. Reading the raw pointer instead measured whatever happened
     * to be under the cursor to within a pixel, which is why the tool could not
     * tell `endpoint to midpoint` from `endpoint to endpoint`: it never knew
     * which of the two the student had actually hit.
     *
     * Snapped first, then the construction point, then the bare pointer. The
     * last is only reached for a click on genuinely empty space, which has no
     * reference and is refused by the caller rather than measured from a stray
     * coordinate.
     */
    const point =
        resolution.snappedPoint ||
        resolution.effectiveConstructionPoint ||
        canvasPointFromEvent(
            event,
            false
        );

    if (!point) {
        return;
    }

    const interaction =
        drawingState.interaction;

    /*
     * PLACEMENT. The references are settled and this click says where the
     * annotation stands. The measurement is re-read at commit time from
     * the live geometry, so the value stored is always the value NOW.
     */
    if (
        interaction.dimensionStage === "placement" &&
        interaction.dimensionRefs?.length
    ) {
        commitDimension(
            interaction.dimensionChoice,
            interaction.dimensionRefs,
            {
                x: point.x,
                y: point.y
            }
        );

        return;
    }

    const reference = dimensionReferenceAtClick(
        resolution,
        point,
        Boolean(interaction.dimensionFirstRef)
    );

    /*
     * Nothing under the cursor, and no reference already chosen: the
     * click has no meaning. Refused rather than measuring from a stray
     * coordinate.
     */
    if (!reference) {
        if (!interaction.dimensionFirstRef) {
            setToolMessage(
                "Specify dimension reference"
            );

            renderCurrentDrawing();
        }

        return;
    }

    /*
     * EVERY CLICK ADDS A REFERENCE. There is no "first" or "second"
     * click any more - the set grows until the student presses Enter,
     * and the measurement is inferred from the whole set then.
     */
    if (!interaction.dimensionFirstRef) {
        acceptFirstDimensionReference(
            reference,
            point
        );

        return;
    }

    acceptSecondDimensionReference(
        interaction.dimensionFirstRef,
        reference,
        point
    );
}

/*
 * The first reference has been chosen.
 *
 * EVERY reference now behaves the same way: it is RECORDED and the
 * tool waits. Nothing is measured on a click any more, because the
 * student decides when they have finished choosing by pressing Enter.
 *
 * That is the whole point of the workflow. A single click on a Beam
 * used to measure it and move straight to placement, which meant the
 * student could not pick a Beam and then say "actually, angle it
 * against that Truss" - the tool had already committed. Recording
 * every reference and waiting for Enter means the SET is what the
 * student chose, and the measurement is derived from it afterwards.
 *
 * It also means a single point is no longer special: a point is a
 * valid reference that simply needs a partner, and the tool says so
 * by counting rather than by switching behaviour.
 */
function acceptFirstDimensionReference(
    reference,
    point
) {
    beginDimensionReferenceSelection(
        reference,
        point
    );
}

/*
 * Add a reference to the current selection and keep selecting.
 *
 * The reference is stored whole - its feature, its anchor, its kind -
 * rather than as a resolved coordinate, so the measurement can be
 * taken from LIVE geometry at the moment the student presses Enter,
 * and so the resulting dimension keeps referring to the geometry it
 * was measured from.
 */
function beginDimensionReferenceSelection(
    reference,
    point
) {
    const interaction = drawingState.interaction;

    const refs = [
        ...(interaction.dimensionPickedRefs || []),
        reference
    ];

    enggDrawingState.setInteraction(
        drawingState,
        {
            dimensionStage: "selecting",
            dimensionPickedRefs: refs,
            dimensionFirstRef: refs[0] ?? null,
            dimensionFirstPoint: {
                x: point.x,
                y: point.y
            },
            dimensionSecondRef: refs[1] ?? null,
            dimensionRefs: null,
            dimensionChoice: null,
            dimensionPlacement: null,
            dimensionTargets: refs
                .map(r => r.featureId)
                .filter(Boolean)
        }
    );

    setToolMessage(
        dimensionSelectionInstruction(refs)
    );

    renderCurrentDrawing();
}

/*
 * What the tool says while references are being chosen.
 *
 * THE WORDING MUST MATCH WHAT ENTER WILL ACTUALLY DO, which is the
 * whole reason it is worth being careful with.
 *
 * A complete, measurable object - a Line, Beam, Truss, Cable, Shaft,
 * Reference Line, Circle or Arc - IS a finished dimension reference the
 * moment it is clicked. Telling a student who has just clicked a Beam
 * to "keep picking" was a lie about a complete selection, and the old
 * pair-only inference then made it true by refusing the measurement.
 * So a single measurable object says its measurement is available and
 * names it, because the name is what tells the student which number
 * they are about to get.
 *
 * A single POINT is the one reference that is genuinely incomplete: it
 * has no length, an angle needs two directions, and a distance needs a
 * partner. It is worded as what it is - a point waiting for another
 * reference - rather than as a feature that failed.
 *
 * Two or more references describe the SET. Two lines name the angle
 * outright, because that is the one outcome that is not obvious from
 * the pair and is the one most often expected.
 */
export function dimensionSelectionInstruction(refs) {
    const count = refs.length;

    if (count < 1) {
        return "Specify dimension reference";
    }

    if (count === 1) {
        const only = refs[0];

        /*
         * A point is not a measurement yet. Everything else that can be
         * clicked and measured IS one, and its kind names the number:
         * a line and its length-forms give Length, a circle Diameter,
         * an arc Radius.
         */
        if (only?.kind === "point") {
            return "1 point selected - pick another reference, or press Enter";
        }

        const available =
            only?.kind === "circle"
                ? "Diameter"
                : only?.kind === "arc"
                  ? "Radius"
                  : "Length";

        return `1 selected - ${available} available - press Enter to dimension`;
    }

    const lines = refs.filter(r => r.kind === "line");

    if (lines.length === count) {
        return `${count} lines selected - press Enter to create angle`;
    }

    return `${count} references selected - press Enter to dimension`;
}

/*
 * The second reference has been chosen.
 */
function acceptSecondDimensionReference(
    first,
    second,
    point
) {
    /*
     * A click that resolved to no reference - empty canvas - is not a
     * failed pair, it is a click that chose nothing. The references
     * already picked are kept and the tool goes on asking, without
     * accusing the student of picking two things that do not measure.
     */
    if (!second) {
        setToolMessage(
            dimensionSelectionInstruction(
                drawingState.interaction.dimensionPickedRefs || []
            )
        );

        renderCurrentDrawing();

        return;
    }

    const descriptor = inferDimensionDescriptor(
        first,
        second
    );

    /*
     * THE STUDENT HASN'T SAID "NOW" YET.
     *
     * The second reference is RECORDED, exactly like the first, and
     * the tool keeps selecting. A dimension is inferred from the
     * references at the moment Enter is pressed, not on the click
     * that happened to complete the pair - so a student who has just
     * clicked two lines can still click a third, or change their
     * mind, without the tool having already measured something they
     * did not ask for.
     */
    if (!descriptor?.refs?.length) {
        /*
         * Nothing measurable between these two. The second is dropped
         * and the first kept, so the student is not left with a dead
         * selection and can simply click something else.
         */
        setToolMessage(
            "Those references have nothing to measure between them - specify another"
        );

        renderCurrentDrawing();

        return;
    }

    enggDrawingState.setInteraction(
        drawingState,
        {
            dimensionPickedRefs: [
                ...(drawingState.interaction.dimensionPickedRefs || []),
                second
            ]
        }
    );

    setToolMessage(
        dimensionSelectionInstruction(
            drawingState.interaction.dimensionPickedRefs
        )
    );

    renderCurrentDrawing();
}

/*
 * ENTER: use the references chosen and decide the measurement now.
 *
 * This is the commit point for reference selection. The references are
 * handed to the inference, which derives the dimension type from what
 * was actually selected - a single line measures its length, two lines
 * measure the angle between them, a circle its diameter - and the
 * tool then moves into the placement stage, where the annotation is
 * positioned by a further click.
 */
export function commitDimensionSelection() {
    const picked =
        drawingState.interaction.dimensionPickedRefs || [];

    if (!picked.length) {
        setToolMessage(
            "Select a reference first"
        );

        return false;
    }

    /*
     * THE MEASUREMENT IS INFERRED FROM THE WHOLE SELECTION.
     *
     * A SINGLE REFERENCE IS COMPLETE on its own whenever it is a
     * measurably-whole feature: a Line, Beam, Truss, Cable, Shaft or
     * Reference Line measures its own length, a Circle its diameter, an
     * Arc its radius. The selection prompt has always said so - "press
     * Enter to dimension" after one click - so Enter on one reference
     * must produce that measurement rather than refuse it.
     *
     * It used to be routed through `inferDimensionSelection`, which
     * required exactly two references and therefore returned null for a
     * lone line. The result was the worst kind of failure: the tool
     * accepted the click, told the student to press Enter, and then did
     * nothing at all - no measurement, no preview, no message that made
     * sense of it. A single point is the one reference that is genuinely
     * incomplete, and it says so by inferring nothing.
     *
     * Two references take the direct pairwise path, which is the
     * overwhelmingly common case. More than two are folded, and a set
     * that does not reduce to one measurement is refused with a message
     * rather than collapsed into a number nobody asked for.
     */
    const descriptor =
        picked.length === 1
            ? inferDimensionDescriptor(picked[0], null)
            : picked.length === 2
              ? inferDimensionDescriptor(picked[0], picked[1])
              : inferDimensionSelection(picked);

    if (!descriptor?.refs?.length) {
        /*
         * A set that measures nothing is refused outright rather than
         * turned into a malformed dimension. The selection is kept so
         * the student can adjust it - most often by picking a partner
         * for a lone point, or dropping a reference from an
         * over-long set - instead of losing everything they picked.
         *
         * The wording names what is missing, because "nothing to
         * measure" is false for a single point: there IS a measurement,
         * it just needs a second reference.
         */
        setToolMessage(
            picked.length === 1
                ? "A point needs a second reference - pick one, or press Esc"
                : picked.length > 2
                  ? "Those references do not make one measurement - pick fewer"
                  : "Those references have nothing to measure between them"
        );

        renderCurrentDrawing();

        return false;
    }

    beginDimensionPlacement(
        picked[picked.length - 1],
        descriptor,
        drawingState.interaction.dimensionFirstPoint,
        picked.map(r => r.featureId).filter(Boolean)
    );

    return true;
}

/*
 * Infer a measurement from more than two references.
 *
 * Folding is only defined where it means something: a set reduces to
 * whatever the LAST reference measures against the first. Three or
 * more points have no single meaningful measurement, and three lines
 * have no single meaningful angle, so those are refused rather than
 * quietly collapsed into one of them.
 */
function inferDimensionSelection(picked) {
    if (picked.length !== 2) {
        return null;
    }

    return inferDimensionDescriptor(picked[0], picked[1]);
}

/*
 * Move into the placement stage with a settled descriptor.
 */
function beginDimensionPlacement(
    reference,
    descriptor,
    point,
    targets
) {
    enggDrawingState.setInteraction(
        drawingState,
        {
            dimensionStage: "placement",
            dimensionFirstRef: null,
            dimensionFirstPoint: null,
            dimensionSecondRef: null,

            /*
             * The selection has been SPENT. Leaving the accumulated
             * references here would mean the placement stage still held
             * them, and Escape - which clears the stage - would be the
             * only thing that stopped the next Enter from measuring the
             * same pair again.
             */
            dimensionPickedRefs: null,
            dimensionChoice: descriptor.dimensionType,
            dimensionTarget:
                reference?.featureId || null,
            dimensionTargets: targets,
            dimensionCandidates: [descriptor],
            dimensionRefs: descriptor.refs,
            dimensionPlacement: {
                x: point.x,
                y: point.y
            }
        }
    );

    setToolMessage(
        dimensionChoiceLabel(
            descriptor.dimensionType
        ) +
            " - move to place, click to confirm, D to change, Esc to cancel"
    );

    renderCurrentDrawing();
}

/*
 * A feature by its id.
 *
 * Read straight off the drawing rather than through a state helper:
 * the model object IS the feature, and reaching for an accessor that
 * does not exist silently aborts whatever used it - which is how a
 * selection-based measurement quietly stopped working.
 */
export function objectWithId(
    id
) {
    if (!id) {
        return null;
    }

    return (
        drawingState.objects.find(
            (object) => object.id === id
        ) || null
    );
}

/*
 * Move to the next measurement the selection supports.
 *
 * Shared by both tools, so the student learns one key rather than two
 * and the cycle is always in the same order.
 *
 * The candidates are DESCRIPTORS - each already carrying its own
 * references - so cycling takes the next one whole. That matters for
 * a pair of features, where the references name BOTH features:
 * rebuilding them from a measurement type alone is not possible, and
 * attempting it would break every measurement taken between two
 * things.
 */
export function cycleDimensionChoice() {
    const interaction =
        drawingState.interaction;

    const candidates =
        interaction.dimensionCandidates;

    if (
        !Array.isArray(candidates) ||
        candidates.length === 0
    ) {
        return false;
    }

    const current =
        candidates.findIndex(
            (candidate) =>
                candidate.dimensionType ===
                interaction.dimensionChoice
        );

    const next =
        candidates[
            (current + 1) % candidates.length
        ];

    if (!next?.refs?.length) {
        return false;
    }

    enggDrawingState.setInteraction(
        drawingState,
        {
            dimensionChoice:
                next.dimensionType,
            dimensionRefs: next.refs
        }
    );

    setToolMessage(
        dimensionChoiceMessage(
            next,
            interaction.dimensionTargets
        ) +
            " - move to place, click to confirm, D to change, Esc to cancel"
    );

    renderCurrentDrawing();

    return true;
}
