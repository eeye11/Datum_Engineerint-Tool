/*
 * The viewport: fit, zoom, and workspace settings.
 */

import enggFeatureGeometry from "../core/geometry/feature-geometry.js";
import enggDrawingState from "../core/model/drawing-state.js";
import enggLoadProfile from "../features/analysis/load-profile.js";
import enggDrawingRotationalArrow from "../features/analysis/rotational-arrow.js";
import enggDrawingExport from "../file/document-export.js";
import { arcSelectionPoints, distributedLoadArrowScreenLength } from "./box-selection.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { COORDINATE_SYSTEM_LENGTH } from "./constants.js";
import { renderedPointsForObjects } from "./document-commands.js";
import { drawingCanvas, drawingGridToggle, drawingSnapToggle } from "./dom.js";
import { drawingState } from "./editor-state.js";
import { objectPoints } from "./hit-testing.js";
import { activeSheet, syncActiveSheet } from "./sheet-controller.js";
import { setToolMessage } from "./toolbar-render.js";

/*
 * ========================================================
 * FIT
 * ========================================================
 *
 * Two operations that are easy to confuse and worth keeping apart:
 *
 *   FIT WHOLE PAGE   "Show me the entire current drawing."
 *   FIT SELECTED     "Zoom in on exactly what I selected."
 *
 * They share one piece of mathematics. The bounds are gathered per
 * object, and the camera is then calculated by the shared engine in
 * the export module, so Fit and an exported drawing of the same
 * content are framed identically. What differs is only WHICH objects
 * contribute bounds - and that is the entire difference between the
 * two commands, which is why they are two thin functions over one
 * shared core rather than two implementations.
 */

/*
 * Whether a feature is something Fit should show.
 *
 * Fit is a VIEW operation, so it must only ever show what is
 * actually on the sheet. A hidden feature is not on the sheet, and a
 * temporary construction preview is not a document object at all.
 *
 * The grid is excluded for the same reason, and it is worth spelling
 * out because the grid is the one thing that genuinely has no
 * bounds: it is drawn across the whole viewport, so measuring it
 * would make Fit zoom out to infinity looking for the edge of
 * something that has no edge. Fit must answer "how big is the
 * DRAWING", and the grid is not the drawing - it is the paper it is
 * drawn on.
 */
function isFittableObject(object) {
    if (!object) {
        return false;
    }

    /*
     * An explicitly hidden feature is excluded. The check is
     * permissive - anything that has not been marked hidden counts,
     * so a feature type that predates this rule is not silently
     * dropped from a Fit.
     */
    if (object.hidden === true) {
        return false;
    }

    return true;
}

/*
 * The rendered bounds of a set of features, as one world rectangle.
 *
 * This is the "what is actually visible" half of the fit. It asks
 * each feature for the points it is DRAWN through rather than the
 * points it is defined by, which is what stops a fit from cropping
 * the parts a student can see: a Point Force's arrowhead, a load's
 * arrow field, a dimension's text and extension lines, a moment's
 * curve, a support's ground hatching, an analysis template's region.
 *
 * The grid is never consulted, and the selection is never consulted -
 * both are the caller's business.
 */
function renderableBoundsOf(objects) {
    const points = [];

    objects.forEach(object => {
        if (!isFittableObject(object)) {
            return;
        }

        renderedPointsForObjects([object]).forEach(
            point => points.push(point)
        );
    });

    return enggDrawingExport.unionBounds(points);
}

/*
 * The pixel viewport Fit is fitting into.
 *
 * Measured from the canvas ELEMENT, at the moment of the fit, rather
 * than from the window or from a remembered size. That is what makes
 * Fit correct after a browser resize, after a panel is collapsed, and
 * after the window is simply a different size than it was: the canvas
 * is the only thing that knows how much room the drawing actually
 * has, and it is asked directly every time.
 */
function currentDrawingViewport() {
    const rect = drawingCanvas.getBoundingClientRect();

    return {
        width: rect.width,
        height: rect.height
    };
}

/*
 * Apply a fitted camera, or report that there was nothing to fit.
 *
 * A null camera means the target had no usable extent - an empty
 * sheet, or content whose bounds could not be read. Both are answered
 * the same way: a plain default view, and a message saying so.
 *
 * The default is a RESET rather than simply returning. "Nothing to
 * fit" is a real answer, and the student deserves a normal view back
 * rather than being left wherever they happened to be zoomed into. The
 * redraw matters for the same reason - returning without one would
 * leave the canvas showing the old, wrong zoom until they happened to
 * move something.
 */
function applyFittedCamera(
    camera,
    emptyMessage
) {
    if (!camera) {
        enggDrawingState.setCameraZoom(
            drawingState,
            1
        );

        drawingState.camera.panX = 0;
        drawingState.camera.panY = 0;

        syncActiveSheetViewport();
        renderCurrentDrawing();

        setToolMessage(emptyMessage);
        return false;
    }

    /*
     * The shared sanitiser, not the raw number.
     *
     * It clamps the zoom to the application's valid range and snaps
     * it to a form the integer-safe zoom system can represent, so a
     * fit can never store 149.9999999% or 0.0000001 - both of which
     * would then be written into the document and read back as a
     * slightly different view.
     */
    enggDrawingState.setCameraZoom(
        drawingState,
        camera.zoom
    );

    drawingState.camera.panX = camera.panX;
    drawingState.camera.panY = camera.panY;

    /*
     * The fit becomes this sheet's viewport.
     *
     * Recorded here rather than only when the user next changes sheet:
     * a Fit is a deliberate act with a result - a particular zoom and
     * a particular centre - and it should be the view the student comes
     * back to on this sheet, whether they leave by switching tabs, by
     * reloading, or by closing the file.
     *
     * It touches nothing else. The document's geometry, its scale, its
     * units and its other sheets are all exactly as they were.
     */
    syncActiveSheetViewport();

    renderCurrentDrawing();

    return true;
}

/*
 * FIT WHOLE PAGE.
 *
 * Every visible feature on the ACTIVE SHEET, and nothing else. Not
 * the browser window, not the panels, not the grid, not other sheets -
 * all of those are surroundings, and the drawing is the thing being
 * shown.
 */
function fitWholePage() {
    const viewport = currentDrawingViewport();

    const objects = drawingState.objects.filter(
        isFittableObject
    );

    if (!objects.length) {
        applyFittedCamera(
            null,
            "This sheet is empty"
        );

        return;
    }

    const bounds = renderableBoundsOf(objects);

    const camera = enggDrawingExport.fitBoundsIntoViewport(
        bounds,
        viewport
    );

    if (!applyFittedCamera(
        camera,
        "Nothing to fit on this sheet"
    )) {
        return;
    }

    setToolMessage(
        `Fit whole page - ${objects.length} feature${
            objects.length === 1 ? "" : "s"
        }`
    );
}

/*
 * The features a Fit Selected should act on.
 *
 * The selection, resolved to real objects. Ids that no longer match
 * anything are dropped rather than trusted, so a Fit cannot be left
 * trying to fit something that has been deleted.
 *
 * The selection comes from wherever the student made it - the canvas,
 * the Features panel, a box selection - because they all write to the
 * same list. Fit Selected therefore behaves identically whichever way
 * the features were picked, which is the point of keeping selection
 * in one place.
 */
function fittableSelection() {
    const selectedIds =
        drawingState.selection
            ?.selectedObjectIds || [];

    return selectedIds
        .map(id =>
            drawingState.objects.find(
                object => object.id === id
            )
        )
        .filter(isFittableObject);
}

/*
 * FIT SELECTED.
 *
 * Only what is selected, treated as ONE group.
 *
 * A selection is fitted as the union of its parts, not as a series of
 * separate fits. Fitting each in turn would leave the viewport
 * showing whichever was fitted last, which is meaningless for a
 * selection the student made deliberately as a group.
 *
 * An ASSOCIATIVE relationship is deliberately not followed. A
 * Dimension knows the Beam it measures; an Annotation knows the Force
 * it labels. Neither link pulls the source in, because selection is
 * what the student said they wanted to look at, and quietly widening
 * it to include a whole beam is how Fit Selected ends up zooming out
 * to the entire drawing - which is the one behaviour that makes the
 * command useless.
 *
 * Compound features need no special handling: each is ONE object, so
 * a Truss contributes all of its members and a Varying Distributed
 * Load contributes its whole span, because that is what they are.
 */
function fitSelected() {
    const selection = fittableSelection();

    /*
     * Nothing selected is not an error, and it is not a state that
     * needs a message about being empty - the most useful thing Fit
     * can do is fit the drawing. Falling back to the whole page keeps
     * the command worth pressing after a selection has been cleared,
     * which is exactly when a student reaches for it.
     */
    if (!selection.length) {
        fitWholePage();
        return;
    }

    const viewport = currentDrawingViewport();

    const bounds = renderableBoundsOf(selection);

    const camera = enggDrawingExport.fitBoundsIntoViewport(
        bounds,
        viewport
    );

    if (!applyFittedCamera(
        camera,
        "Nothing to fit in the selection"
    )) {
        return;
    }

    setToolMessage(
        selection.length === 1
            ? `Fit ${selection[0].name || "selection"}`
            : `Fit ${selection.length} selected features`
    );
}

/*
 * THE FIT BUTTON.
 *
 * One button, two behaviours, decided by whether anything is
 * selected. That is the shortest thing that could be obvious, and the
 * alternative - two separate commands - would leave the less common
 * one undiscoverable.
 *
 * The two are still separate FUNCTIONS, so either can be called on
 * its own, and the choice is made in one place.
 */
export function fitDrawingToView() {
    /*
     * ONE COMMAND, TWO TARGETS.
     *
     * Fit works out for itself what it should show: the selection
     * when there is one, and the whole active sheet when there is not.
     *
     * The student is never asked to choose. There is only one thing
     * they mean by "fit" - show me what I am looking at - and
     * whether that is one feature or the whole drawing is already
     * answered by whether they selected something. Offering "Fit
     * Whole Page" and "Fit Selected" as two commands asked the
     * student to make a decision the application already has all the
     * information to make for them, and put a second, nearly
     * identical button in a toolbar that already has a lot in it.
     *
     * So the two behaviours are separate FUNCTIONS - whole page and
     * selection, each with its own bounds and its own message - and
     * the choice between them is made once, here.
     */
    if (fittableSelection().length) {
        fitSelected();
        return;
    }

    fitWholePage();
}

/*
 * The points a feature is actually DRAWN through, in world
 * coordinates.
 *
 * This is the bounds Fit measures and the geometry the selection
 * test works against, so what is fitted and what can be selected
 * are the same thing. It is deliberately generous: where a
 * feature renders something that is not one of its stored points
 * (a force's arrow, a load's field, a rigid body's rotated
 * outline), the drawn extent is returned rather than the
 * defining one.
 */
export function renderedBounds(
    object,
    measuredAtZoom
) {
    const geometry = object?.geometry;

    if (!geometry) {
        return [];
    }

    /*
     * The scale arrow lengths are drawn at, so a feature's
     * visual extent is measured at the zoom it is being viewed
     * at rather than at some fixed world size.
     *
     * The caller may say which zoom it is measuring for. An export
     * wants the current one, because that is what the student sees;
     * a reference asks for a zoom of 1, because a figure must be the
     * same however the sheet happens to be being looked at. Leaving
     * this to default to the camera would mean a figure drawn at 400%
     * silently gained room that a figure drawn at 100% did not, and
     * the two would not be the same figure of the same drawing.
     */
    const scale =
        enggDrawingState
            .BASE_PIXELS_PER_UNIT *
            (
                Number.isFinite(measuredAtZoom)
                    ? measuredAtZoom
                    : drawingState.camera?.zoom || 1
            );

    if (object.type === "force") {
        const start =
            geometry.start ||
            geometry.position;

        const end =
            geometry.end ||
            {
                x: start.x + (Number(geometry.magnitude) || 0),
                y: start.y
            };

        return [start, end];
    }

    if (object.type === "load") {
        return [
            ...distributedLoadRenderedPoints(
                geometry,
                scale
            )
        ];
    }

    if (object.type === "varying-load") {
        /*
         * THE DRAWN PROFILE, read from the load module.
         *
         * A varying load stores an intensity at each end, and everything
         * that needs to know how far its arrows reach - the fit bounds here,
         * the hit test, the renderer - has to turn that into a profile
         * first. That conversion was written out again at each of them, and
         * each copy could disagree with the others about how long a taper
         * is drawn. The load module owns it now.
         */
        return [
            ...distributedLoadRenderedPoints(
                enggLoadProfile.drawnProfile(
                    geometry
                ),
                scale
            )
        ];
    }

    if (object.type === "couple" || object.type === "moment") {
        /*
         * A rotational symbol is a circle about its application
         * point, so its extent is that circle - the whole swept arc
         * plus the arrowhead standing off its end.
         *
         * The couple used to be measured as a box around two straight
         * arrows spaced by its old `separation`, which described a
         * shape that is no longer drawn. The radius is read from the
         * same shared default the renderer falls back to, so an
         * unresized symbol and the rectangle that selects it cannot
         * disagree about how big it is.
         */
        const position = geometry.position;

        if (!position) {
            return [];
        }

        const rotational =
            enggDrawingRotationalArrow;

        const reach = (
            rotational
                ? rotational.clampArcRadius(
                    geometry.arcRadius ??
                        rotational.DEFAULT_ARC_RADIUS_PX
                )
                : 16
        ) / Math.max(scale, 1e-6);

        return [
            {
                x: position.x - reach,
                y: position.y - reach
            },
            {
                x: position.x + reach,
                y: position.y + reach
            }
        ];
    }

    if (
        object.type === "truss" &&
        Array.isArray(geometry.members) &&
        geometry.members.length
    ) {
        return geometry.members.flatMap(
            member => [
                member.start,
                member.end
            ]
        );
    }

    if (object.type === "rigid-body") {
        /*
         * A rigid body's outline is defined in its own local
         * frame and then rotated, so the corner points are used
         * rather than the position anchor, and the shared
         * geometry registry resolves the rotation for whichever
         * shape the body currently has.
         */
        return enggFeatureGeometry
            .definingPoints(
                geometry,
                enggFeatureGeometry
                    .rigidBodyShape(geometry)
            );
    }

    if (object.type === "beam") {
        /*
         * A Beam is drawn as a deep member, so its visual extent
         * is its span thickened by its depth on both sides.
         */
        const depth =
            (Number(geometry.depth) || 0) / 2;

        return [
            ...(geometry.start && geometry.end
                ? segmentBoundCorners(
                    geometry.start,
                    geometry.end,
                    depth
                )
                : [])
        ];
    }

    if (object.type === "arc") {
        /*
         * An arc's extent is the four cardinal points of its
         * circle, which is a bound rather than the arc itself and
         * so can never crop it.
         */
        return arcSelectionPoints(geometry);
    }

    if (object.type === "circle") {
        const radius =
            Math.abs(Number(geometry.radius) || 0);

        return [
            {
                x: geometry.center.x - radius,
                y: geometry.center.y - radius
            },
            {
                x: geometry.center.x + radius,
                y: geometry.center.y + radius
            }
        ];
    }

    if (object.type === "coordinate-system-2d") {
        const axisLength =
            geometry.axisLength ??
            geometry.xAxisLength ??
            COORDINATE_SYSTEM_LENGTH;

        return [
            {
                x: geometry.origin.x - axisLength,
                y: geometry.origin.y - axisLength
            },
            {
                x: geometry.origin.x + axisLength,
                y: geometry.origin.y + axisLength
            }
        ];
    }

    return objectPoints(object);
}

/*
 * The two corners of a span widened by a given amount on each
 * side, which is the box a drawn member of that width occupies.
 */
function segmentBoundCorners(
    start,
    end,
    width
) {
    if (!Number.isFinite(width) || width <= 0) {
        return [start, end];
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const length =
        Math.hypot(dx, dy);

    if (length < 1e-9) {
        return [start, end];
    }

    /*
     * A normal to the span, so the corners sit the member's
     * width away from its centreline rather than along it.
     */
    const nx = (-dy / length) * width;
    const ny = (dx / length) * width;

    return [
        {
            x: start.x - nx,
            y: start.y - ny
        },
        {
            x: start.x + nx,
            y: start.y + ny
        },
        {
            x: end.x - nx,
            y: end.y - ny
        },
        {
            x: end.x + nx,
            y: end.y + ny
        }
    ];
}

/*
 * Every point a distributed load is drawn through: the body it
 * loads, and the tip of every arrow in its field.
 *
 * The arrows are the part that extends past the body, so they are
 * what stops a Fit from cropping the load's own magnitude away.
 */
function distributedLoadRenderedPoints(
    geometry,
    scale
) {
    /*
     * THE PROFILE AS DRAWN, whatever kind of load this is.
     *
     * Read through the one function that builds it, so a uniform load and a
     * varying one are measured by the same rule and neither can drift from
     * what the renderer draws.
     */
    const profile =
        typeof enggLoadProfile === "undefined"
            ? geometry
            : enggLoadProfile.drawnProfile(
                geometry
            );

    if (
        !profile ||
        !profile.start ||
        !profile.end
    ) {
        return [];
    }

    const points = [
        profile.start,
        profile.end
    ];

    if (
        typeof enggLoadProfile ===
            "undefined"
    ) {
        return points;
    }

    const samples =
        enggLoadProfile.arrowSamples(
            profile
        );

    if (!samples.length) {
        return points;
    }

    const peak =
        enggLoadProfile.peakMagnitude(
            geometry
        );

    if (peak <= 0) {
        return points;
    }

    /*
     * The side the arrows are drawn on, from the body's outward
     * normal rather than the force direction, matching the
     * renderer. Fit then reserves the same space the arrows really
     * occupy, and a reversed load fits identically because it
     * occupies the same space.
     *
     * The force direction is the fallback for a load on a degenerate
     * body, where the span has no normal to offer.
     */
    const normal =
        enggLoadProfile.loadBodyNormal(
            geometry
        ) ||
        enggLoadProfile.unitVector(
            enggLoadProfile.loadDirection(
                geometry
            )
        );

    /*
     * The same screen length a drawn arrow reaches, converted
     * back to world units at the current zoom. Fitting therefore
     * reserves exactly the space the arrows actually occupy.
     */
    const reach =
        distributedLoadArrowScreenLength(
            peak,
            scale
        );

    samples.forEach(sample => {
        points.push({
            x:
                sample.base.x +
                normal.x * reach,
            y:
                sample.base.y +
                normal.y * reach
        });
    });

    return points;
}

export function zoomAtCanvasPoint(
    nextZoom,
    event
) {
    const bounds =
        drawingCanvas.getBoundingClientRect();

    const screenPoint = {
        x:
            event.clientX -
            bounds.left,

        y:
            event.clientY -
            bounds.top
    };

    const engineeringPoint =
        enggDrawingState.screenToEngineering(
            screenPoint,
            bounds,
            drawingState
        );

    enggDrawingState.setCameraZoom(
        drawingState,
        nextZoom
    );

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    drawingState.camera.panX =
        engineeringPoint.x -
        (
            screenPoint.x -
            bounds.width / 2
        ) /
        scale;

    drawingState.camera.panY =
        engineeringPoint.y -
        (
            bounds.height / 2 -
            screenPoint.y
        ) /
        scale;

    syncActiveSheetViewport();

    renderCurrentDrawing();
}

/*
 * Write just the VIEWPORT back onto the active sheet.
 *
 * Zoom and pan are a view, not a document change: they do not make the
 * drawing dirty and they are not undoable, which is right. But they do
 * belong to the sheet, because a sheet remembers how it was being
 * looked at - and without this they would only be recorded at the
 * moment the user happened to switch tabs. Zoom into a detail, reload,
 * and the detail view would be gone.
 *
 * Only the viewport is written, deliberately: this runs on every zoom
 * step, and copying the whole sheet each time would be a needless cost
 * for two numbers.
 */
function syncActiveSheetViewport() {
    const sheet = activeSheet();

    if (!sheet) {
        return;
    }

    sheet.viewport = {
        zoom: drawingState.camera.zoom,
        panX: drawingState.camera.panX,
        panY: drawingState.camera.panY
    };
}

/*
 * Set the zoom, from a PERCENTAGE.
 *
 * Everything that changes the zoom goes through here, so there is one
 * answer to "what does this become". The percentage is handed to the
 * state model's own sanitiser as a factor, which is where rounding and
 * clamping already live - the buttons, the typed value, Fit and a
 * sheet's restored viewport therefore cannot produce zooms the others
 * could not, and none of them can accumulate a floating point
 * artefact: 149.7% arrives as 150%, never as 149.999999%.
 *
 * The stored value is the camera's, not a copy of it, so there is no
 * second number that can drift out of step with the drawing.
 */
export function updateDrawingZoom(
    nextZoomPercent
) {
    const percent = Number(nextZoomPercent);

    if (!Number.isFinite(percent) || percent <= 0) {
        return;
    }

    enggDrawingState.setCameraZoom(
        drawingState,
        percent / 100
    );

    syncActiveSheetViewport();

    renderCurrentDrawing();
}

/*
 * Workspace setting toggle.
 *
 * Grid controls grid visibility.
 *
 * Snap controls BOTH:
 *   - grid snapping
 *   - object snapping
 *
 * This keeps the visible "Snap ON/OFF" state
 * consistent with the actual snapping system.
 */
export function toggleWorkspaceSetting(
    button,
    label
) {
    const enabled =
        button.getAttribute(
            "aria-pressed"
        ) === "true";

    const nextEnabled =
        !enabled;

    button.setAttribute(
        "aria-pressed",
        String(
            nextEnabled
        )
    );

    button.textContent =
        `${label} ${nextEnabled ? "ON" : "OFF"}`;

    button.classList.toggle(
        "active",
        nextEnabled
    );

    if (
        button ===
        drawingGridToggle
    ) {
        drawingState.grid.visible =
            nextEnabled;

        /*
         * The grid belongs to the SHEET, so it is written back
         * to the sheet that is on screen as well as to the live
         * state. Without this the toggle would last until the
         * user switched tabs and then quietly revert, and
         * whichever sheet happened to be written last would be
         * the one whose grid appeared in an export.
         */
        syncActiveSheet();

        drawingCanvas.classList.toggle(
            "grid-off",
            !nextEnabled
        );
    } else if (
        button ===
        drawingSnapToggle
    ) {
        /*
         * Snap OFF means no automatic grid
         * snapping AND no object snapping.
         */
        drawingState.snap.enabled =
            nextEnabled;

        drawingState.objectSnap.enabled =
            nextEnabled;

        /*
         * Remove stale visual/interaction
         * snap state immediately.
         */
        drawingState.interaction.snapCandidate =
            null;

        drawingState.interaction.snappedPoint =
            null;

        drawingState.interaction.inference =
            null;
    }

    /*
     * Both the grid and the snapping belong to the sheet, so whatever
     * was just toggled is written back to it. Doing it here rather
     * than waiting for the next edit is what stops the toggle
     * reverting when the user changes tabs.
     */
    syncActiveSheet();

    renderCurrentDrawing();
}
