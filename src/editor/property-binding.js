/*
 * Wiring a feature panel's controls to the feature.
 */

import enggBodyFrames from "../core/geometry/body-frames.js";
import enggDrawingState from "../core/model/drawing-state.js";
import enggLoadProfile from "../features/analysis/load-profile.js";
import enggDrawingRotationalArrow from "../features/analysis/rotational-arrow.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { drawingProperties } from "./dom.js";
import { drawingState, editorState } from "./editor-state.js";
import { forcePanelModes, trianglePanelModes } from "./feature-panel-markup.js";
import { renderProperties } from "./feature-panel.js";
import { openAnalysisEditorFor } from "./feature-tree.js";
import { currentPropertyValue, setRigidBodyShape } from "./property-inputs.js";
import { updateFeatureProperty } from "./property-update.js";
import { setToolMessage } from "./toolbar-render.js";
import { optimizeTrussStructure } from "./truss-optimizer.js";

export function bindFeaturePropertyControls(object) {
    const geometry = object.geometry || {};

    drawingProperties.querySelectorAll('[data-triangle-mode]').forEach(input => {
        input.addEventListener('click', () => {
            trianglePanelModes.set(
                object.id,
                input.dataset.triangleMode
            );

            renderProperties();
        });
    });

    /*
     * The Point Force's two views are two readings of the same
     * vector, so switching between them only changes which
     * fields are shown. The force itself is untouched, which is
     * why no snapshot is taken here.
     */
    drawingProperties.querySelectorAll('[data-force-mode]').forEach(input => {
        input.addEventListener('click', () => {
            forcePanelModes.set(
                object.id,
                input.dataset.forceMode
            );

            renderProperties();
        });
    });

    /*
     * Feature Name writes to the object itself, so the
     * Feature Tree, the selection and this panel all
     * show the same name.
     */
    drawingProperties.querySelectorAll('[data-statics-vector-scale]').forEach(select => {
        select.addEventListener('change', () => {
            /*
             * The CUSTOM entry is not a scale - it is the request to type
             * one. It reveals the field and changes nothing else, so
             * picking it by mistake leaves the sheet exactly as it was
             * rather than snapping every arrow back to true length.
             */
            if (
                select.value ===
                    enggLoadProfile.CUSTOM_VECTOR_SCALE
            ) {
                editorState.staticsCustomScaleOpen = true;

                renderProperties();
                return;
            }

            editorState.staticsCustomScaleOpen = false;

            applyVectorScale(
                Number(select.value)
            );
        });
    });

    /*
     * THE CUSTOM SCALE, APPLIED.
     *
     * A typed value is stored in the same place as a listed one and read
     * back the same way, so nothing downstream needs to know it was typed.
     * The only thing that treats it differently is the range check: a
     * length multiplier has to be positive and has to be drawable, so a
     * zero, a negative number or a value too large to see is refused and
     * the field is redrawn rather than leaving a scale that cannot be
     * drawn.
     */
    const applyCustomVectorScale = () => {
        const field = drawingProperties.querySelector(
            '[data-statics-vector-custom]'
        );

        const requested = Number(field?.value);

        const usable =
            Number.isFinite(requested) &&
            requested >= enggLoadProfile.MIN_VECTOR_SCALE &&
            requested <= enggLoadProfile.MAX_VECTOR_SCALE;

        if (!usable) {
            renderProperties();
            return;
        }

        editorState.staticsCustomScaleOpen = false;

        applyVectorScale(requested);
    };

    drawingProperties
        .querySelectorAll('[data-statics-vector-custom]')
        .forEach(input => {
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    applyCustomVectorScale();
                }
            });
        });

    drawingProperties
        .querySelectorAll('[data-statics-vector-apply]')
        .forEach(button => {
            button.addEventListener('click', () => {
                applyCustomVectorScale();
            });
        });

    /*
     * One place that commits a scale, so the dropdown and the custom field
     * cannot disagree about what a change does.
     *
     * Only the two redraws happen. No feature is touched: the stored
     * magnitudes, units, directions and attachment points are left exactly
     * as they are, and changing this setting must not add an undo step,
     * because nothing about the drawing's engineering content has changed -
     * only how large its arrows are drawn.
     */
    function applyVectorScale(value) {
        drawingState.statics.vectorScale = value;

        setToolMessage(
            `Vector scale ${value}×`
        );

        renderProperties();
        renderCurrentDrawing();
    }

    /*
     * Reverse Direction turns a load's force vectors around.
     *
     * It is an undoable change like any other edit, so it takes
     * a snapshot first: one press is one step back, which is
     * what makes a reversal safe to try and see.
     *
     * The reversal itself is the model's, and touches the
     * DIRECTION alone. The span, the start point, the profile and
     * every position stay exactly where they were, so the load is
     * not moved, rebuilt or replaced - only its arrows are drawn
     * pointing the other way. Repainting both the canvas and the
     * panel is what makes the displayed direction the current
     * one, whether the load is selected, deselected or reopened.
     */
    /*
     * Reverse Direction turns a Point Force's vector around.
     *
     * The load control above this one is the pattern: snapshot first, so
     * one press is one step back and a reversal is safe to try and see.
     *
     * The reversal itself belongs to the model, and touches the
     * DIRECTION alone. The application point, the magnitude, the unit,
     * the feature's identity and its parent body all stay exactly where
     * they were - a force turned around is the same force acting at the
     * same place - so the arrow is redrawn pointing the other way and
     * nothing is moved, rebuilt or replaced.
     */
    drawingProperties.querySelectorAll('[data-force-reverse-direction]').forEach(button => {
        button.addEventListener('click', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            enggLoadProfile.reverseForceDirection(
                object.geometry
            );

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            setToolMessage(
                "Force direction reversed"
            );

            renderProperties();
            renderCurrentDrawing();
        });
    });

    drawingProperties.querySelectorAll('[data-load-reverse-direction]').forEach(button => {
        button.addEventListener('click', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            enggLoadProfile.reverseLoadDirection(
                object.geometry
            );

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            setToolMessage(
                "Load direction reversed"
            );

            renderProperties();
            renderCurrentDrawing();
        });
    });

    drawingProperties.querySelectorAll('[data-truss-optimize]').forEach(button => {
        button.addEventListener('click', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            if (!optimizeTrussStructure(object)) {
                setToolMessage(
                    "This truss has no members to optimize"
                );

                return;
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            setToolMessage(
                "Truss structure optimized"
            );

            renderProperties();
            renderCurrentDrawing();
        });
    });

    drawingProperties.querySelectorAll('[data-feature-name]').forEach(input => {
        input.addEventListener('change', () => {
            const name =
                input.value.trim();

            if (!name) {
                renderProperties();
                return;
            }

            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            object.name =
                name;

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderCurrentDrawing();
            renderProperties();
        });
    });

    /*
     * Appearance controls write straight to the
     * object's style and repaint immediately.
     */
    drawingProperties.querySelectorAll('[data-style]').forEach(input => {
        input.addEventListener('change', () => {
            const key =
                input.dataset.style;

            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            if (key === 'lineWidth') {
                const width =
                    Number(input.value);

                if (
                    !Number.isFinite(width) ||
                    width <= 0
                ) {
                    renderProperties();
                    return;
                }

                object.style.lineWidth =
                    width;
            } else if (key === 'pointSize') {
                const size =
                    Number(input.value);

                if (
                    !Number.isFinite(size) ||
                    size <= 0
                ) {
                    renderProperties();
                    return;
                }

                object.style.pointSize =
                    size;
            } else {
                object.style.lineType =
                    input.value;
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderCurrentDrawing();
            renderProperties();
        });
    });

    /*
     * A SUPPORT'S POSITION ALONG ITS BODY.
     *
     * The number is a DISTANCE along the body, not a coordinate, and
     * both the attachment and the drawn position are written from it -
     * the attachment first, and then the render position derived from
     * it - so the two can never disagree. Writing only the drawn
     * position is what allowed a support dragged along a beam to drift
     * off its centreline and end up stuck to a face.
     */
    drawingProperties
        .querySelectorAll('[data-support-distance]')
        .forEach(input => {
            input.addEventListener('change', () => {
                const parent = object.parentId
                    ? drawingState.objects.find(
                        candidate =>
                            candidate.id === object.parentId
                    )
                    : null;

                const frame =
                    parent
                        ? enggBodyFrames.frameOf(parent)
                        : null;

                const distance =
                    Number(input.value);

                if (
                    !frame ||
                    !Number.isFinite(distance)
                ) {
                    renderProperties();
                    return;
                }

                const previous =
                    enggDrawingState.snapshotDrawing(
                        drawingState
                    );

                const clamped =
                    Math.min(
                        frame.length,
                        Math.max(0, distance)
                    );

                /*
                 * Typed as a distance along the body, STORED as the
                 * fraction that distance represents.
                 *
                 * The panel speaks in millimetres because that is the
                 * number a student reasons about; the model stores the
                 * fraction because that is what survives the body being
                 * resized. Converting here is the last half of that
                 * translation, and it means the rest of the application
                 * never has to work out which of the two it is holding.
                 */
                const point =
                    enggBodyFrames.pointAt(
                        frame,
                        clamped
                    );

                const placement =
                    enggBodyFrames.supportPlacement(
                        parent,
                        point,
                        object.geometry.flipped === true
                    );

                object.geometry.attachment =
                    enggBodyFrames.attachmentFor(
                        frame,
                        point
                    );

                if (placement) {
                    object.geometry.position =
                        placement.render;
                }

                enggDrawingState.commitDrawingChange(
                    drawingState,
                    previous
                );

                renderProperties();
                renderCurrentDrawing();
            });
        });

    /*
     * FLIP: WHICH SIDE OF THE BODY THE SYMBOL IS DRAWN ON.
     *
     * The one thing it changes. Not the attachment, not the distance
     * along the body, and not the body itself - so flipping a support
     * moves the symbol from one side of its beam to the other and
     * leaves it under exactly the same load, which is the whole point
     * of a support that is on the far side of a member.
     */
    drawingProperties
        .querySelectorAll('[data-support-flip]')
        .forEach(input => {
            input.addEventListener('change', () => {
                const parent = object.parentId
                    ? drawingState.objects.find(
                        candidate =>
                            candidate.id === object.parentId
                    )
                    : null;

                const frame =
                    parent
                        ? enggBodyFrames.frameOf(parent)
                        : null;

                const previous =
                    enggDrawingState.snapshotDrawing(
                        drawingState
                    );

                object.geometry.flipped =
                    input.checked;

                /*
                 * The drawn position is updated as well, so anything
                 * that reads the stored point - the hit test, the
                 * move handles - agrees with what is on screen. The
                 * renderer would recompute it anyway; writing it here
                 * means the feature is never momentarily described by
                 * two different positions.
                 */
                if (frame) {
                    const placement =
                        enggBodyFrames.supportPlacement(
                            parent,
                            enggBodyFrames.pointAt(
                                frame,
                                Number(
                                    object.geometry
                                        .attachment
                                        ?.distance
                                ) || 0
                            ),
                            object.geometry.flipped
                        );

                    if (placement) {
                        object.geometry.position =
                            placement.render;
                    }
                }

                enggDrawingState.commitDrawingChange(
                    drawingState,
                    previous
                );

                renderProperties();
                renderCurrentDrawing();
            });
        });

    /*
     * The Analysis display switches.
     *
     * These change what is DRAWN, never what is derived, so they are
     * written straight onto the geometry and never touch a source. A
     * checkbox that quietly re-derived the values would be a control
     * that could change engineering data, which is not what a
     * "Show X Component" switch is for.
     */
    drawingProperties
        .querySelectorAll('[data-analysis-toggle]')
        .forEach(input => {
            input.addEventListener('change', () => {
                const previous =
                    enggDrawingState.snapshotDrawing(
                        drawingState
                    );

                object.geometry[
                    input.dataset.analysisToggle
                ] = input.checked;

                enggDrawingState.commitDrawingChange(
                    drawingState,
                    previous
                );

                renderCurrentDrawing();
                renderProperties();
            });
        });

    /*
         * ========================================================
         * OPENING THE PLOT EDITOR
         * ========================================================
         *
         * The panel does not edit expressions; it says there are some and this
         * is where they are edited. Apply commits the previewed state, which
         * is what the student has already seen drawn on the sheet while they
         * worked - so there is no separate "Plot" step and nothing to forget.
         *
         * THE PREVIEW IS NOT AN UNDO STEP. Editing inside the dialog changes
         * what the sheet shows but writes nothing to the document, so opening
         * the editor and cancelling is not something to undo. One snapshot
         * is taken when Apply is pressed, and that is the single step that
         * takes the whole edit.
         *
         * ONE IMPLEMENTATION, TWO ENTRY POINTS. `openAnalysisEditorFor` is the
         * whole of it; the panel button below calls it, and so does the
         * placement commit. When both had their own copy, the automatic open
         * drifted from the manual one - different titles, different ranges,
         * one of them clearing the legacy field and the other not - so the
         * editor the student gets on placement was not the editor they get
         * when they reopen the feature.
         */
        drawingProperties
            .querySelector('[data-plot-editor-open]')
            ?.addEventListener('click', () => {
                openAnalysisEditorFor(object);
            });

        /*
     * The arc radius of a Moment or a Couple Moment.
     *
     * This is a PRESENTATION control and is written as its own field
     * on the geometry rather than as a style, so that it can never be
     * confused with the magnitude: resizing the curve touches this
     * one number and nothing else. The position, the sense of
     * rotation, the magnitude and the parent are all left exactly as
     * they were, which is what makes a resized moment the same
     * moment that is merely easier to read.
     */
    drawingProperties.querySelectorAll('[data-arc-radius]').forEach(input => {
        input.addEventListener('change', () => {
            const rotational =
                enggDrawingRotationalArrow;

            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            object.geometry.arcRadius =
                rotational
                    ? rotational.clampArcRadius(
                        input.value
                    )
                    : Number(input.value);

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            setToolMessage(
                "Arc radius changed - magnitude, direction and position are unchanged"
            );

            renderCurrentDrawing();
            renderProperties();
        });
    });

    /*
     * Select-based statics properties, such as a moment's
     * direction. These are not style values, so they are
     * written straight onto the geometry.
     */
    drawingProperties.querySelectorAll('select[data-property]').forEach(select => {
        select.addEventListener('change', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            const key = select.dataset.property;

            /*
             * A DIRECTION IS A WORD, not a flag.
             *
             * Every other select here writes a boolean, because every
             * other one reads one. The rotational features do not: they
             * store "CCW" or "CW", so that the feature states its own
             * sense instead of leaving a reader to invert a boolean -
             * and a select that wrote `"true"` into that field would
             * leave the moment with a direction nothing can read.
             */
            object.geometry[key] =
                key === "direction"
                    ? select.value === "CW"
                        ? "CW"
                        : "CCW"
                    : select.value === "true";

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderCurrentDrawing();
            renderProperties();
        });
    });

    /*
     * Unknown toggles for statics values. Stored on the
     * feature alongside its other state, so it persists
     * through selection, undo/redo and save/load.
     *
     * Marking a quantity Unknown retires the number it had:
     * there is no longer an authoritative value, so the
     * field is cleared and the old one is not kept as a
     * hidden fallback. Only this one quantity is affected,
     * so the rest of the feature stays fully editable.
     */
    drawingProperties.querySelectorAll('[data-known]').forEach(button => {
        button.addEventListener('click', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            object.unknownValues ||= {};

            const key =
                button.dataset.known;

            const wasKnown =
                object.unknownValues[key] !== true;

            if (wasKnown) {
                object.unknownValues[key] = true;
            } else {
                delete object.unknownValues[key];
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderProperties();
            renderCurrentDrawing();
        });
    });

    /*
     * A rigid body's Shape control rewrites the same body rather
     * than replacing it, so the feature keeps its identity and
     * everything attached to it.
     */
    drawingProperties.querySelectorAll('[data-rigid-shape]').forEach(select => {
        select.addEventListener('change', () => {
            const previous = enggDrawingState.snapshotDrawing(drawingState);

            if (!setRigidBodyShape(object, select.value)) {
                return;
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderProperties();
            renderCurrentDrawing();
        });
    });

    drawingProperties.querySelectorAll('[data-fix]').forEach(input => {
        input.addEventListener('change', () => {
            const previous = enggDrawingState.snapshotDrawing(drawingState);

            object.constraints ||= {};

            const key =
                input.dataset.fix;

            object.constraints[key] =
                input.checked;

            /*
             * A fixed property records the value it is
             * pinned to, so later edits can restore it
             * exactly instead of recomputing it from
             * geometry that may have moved.
             */
            if (input.checked) {
                const measured =
                    currentPropertyValue(
                        object,
                        key
                    );

                if (Number.isFinite(measured)) {
                    object.constraints[
                        `${key}Value`
                    ] = measured;
                }
            } else {
                delete object.constraints[
                    `${key}Value`
                ];
            }

            enggDrawingState.commitDrawingChange(drawingState, previous);
            renderProperties();
            renderCurrentDrawing();
        });
    });

    /*
     * ========================================================
     * WHETHER THIS FEATURE'S MAGNITUDE BOX IS SHOWN
     * ========================================================
     *
     * One history entry per switch, and one logical change: the checkbox is
     * the whole action, not a drag across it.
     *
     * The preference is written onto the FEATURE rather than recomputed from
     * the sheet-wide switch. That is what lets a student who has turned off
     * the seventeen boxes that do not matter keep those choices when they
     * reach for the Magnitudes switch on the toolbar - see the note in
     * `magnitudeShownFor`, which reads this same field.
     *
     * It is stored as a real boolean, not as the checkbox's string value, so
     * that reading it back cannot turn the string "false" into a truthy
     * preference and leave the box permanently on.
     */
    drawingProperties
        .querySelectorAll(
            '[data-feature-show-magnitude]'
        )
        .forEach(input => {
            input.addEventListener(
                'change',
                () => {
                    const previous =
                        enggDrawingState
                            .snapshotDrawing(drawingState);

                    object.annotationDisplay = {
                        ...(object.annotationDisplay || {}),
                        showMagnitude: input.checked === true,
                    };

                    enggDrawingState
                        .commitDrawingChange(
                            drawingState,
                            previous
                        );

                    /*
                     * The panel is NOT re-rendered here.
                     *
                     * Re-rendering would rebuild the very control being
                     * used, and the checkbox would lose the pointer's
                     * focus mid-click - which on some platforms swallows the
                     * click entirely and makes the switch feel stuck. The
                     * sheet is redrawn, because that is what actually has to
                     * change; the checkbox already shows the state the
                     * student just chose.
                     */
                    renderCurrentDrawing();
                }
            );
        });

    /*
     * THE PER-FEATURE UNIT SWITCH IS GONE, ALONG WITH ITS HANDLER.
     *
     * The switch is removed from the annotation section, and this
     * listener goes with it. Leaving the handler behind would mean a
     * dead listener on a selector that now matches nothing - code
     * that reads as though units can still be turned off, for an
     * option that no longer exists.
     *
     * Units are still printed. They are part of the quantity, not a
     * display preference: "100" and "100 N" are not the same
     * statement, and the annotation model formats the unit into every
     * magnitude whether or not anything asked it to.
     */

    drawingProperties.querySelectorAll('[data-property]').forEach(input => {
        /*
         * Numeric fields update on both `input` (which
         * fires for typing and for the spinner arrows)
         * and `change` (which fires on blur/commit), so
         * either method moves the real geometry.
         */
        /*
         * The pre-edit snapshot is taken when the field is
         * first focused, before any mutation happens. The
         * `input` event fires while typing, so snapshotting
         * inside `apply()` would record the already-changed
         * geometry and make Undo a no-op.
         */
        let previous = null;

        /*
         * The value most recently written by this field, so the
         * pair of events a single edit produces can be recognised
         * as one edit.
         *
         * A field fires `input` while the value is being typed and
         * `change` when it is committed, so one edit arrives as
         * two calls. Applying both is harmless for a field that
         * writes a fixed slot, but the load's point rows are
         * rendered from a list sorted along the body: applying the
         * first call re-sorts it, and applying the second would
         * then land on whatever point moved into that row, quietly
         * overwriting it. Skipping the repeat is what makes a row
         * keep meaning the point the user is looking at.
         */
        let applied = null;

        const capture = () => {
            if (!previous) {
                previous =
                    enggDrawingState.snapshotDrawing(
                        drawingState
                    );
            }
        };

        const apply = () => {
            const raw =
                input.value.trim();

            const value =
                Number(raw);

            if (
                raw === "" ||
                !Number.isFinite(value)
            ) {
                return false;
            }

            if (applied === raw) {
                return true;
            }

            applied = raw;

            return updateFeatureProperty(
                object,
                input.dataset.property,
                value
            );
        };

        input.addEventListener('focus', () => {
            capture();

            /*
             * A field that is focused for a fresh edit starts from
             * whatever the model now holds, not from the previous
             * value of the same field.
             */
            applied = null;
        });

        input.addEventListener('pointerdown', capture);

        input.addEventListener('keydown', capture);

        input.addEventListener('input', () => {
            capture();

            /*
             * The edit is applied here but committed on blur, so the arrow
             * and the feature's dependants refresh as the student types
             * rather than when they click away. That comes from the refresh
             * inside `renderCurrentDrawing`, not from a call here - a
             * property field is only one of the paths that can move a force,
             * and this was the path that happened to be remembered.
             */
            if (apply()) {
                renderCurrentDrawing();
            }
        });

        input.addEventListener('change', () => {
            apply();

            if (previous) {
                enggDrawingState.commitDrawingChange(
                    drawingState,
                    previous
                );
            }

            previous = null;

            renderProperties();
            renderCurrentDrawing();
        });
    });
}
