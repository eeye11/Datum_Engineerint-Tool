/*
 * Rendering the Features panel for the current selection.
 */

import { drawingComponentsBack, drawingProperties } from "./dom.js";
import { drawingState, editorState } from "./editor-state.js";
import { featurePropertyMarkup } from "./feature-panel-markup.js";
import { renderComponentTree, renderLoadBuildPanel } from "./feature-tree.js";
import { LOAD_BUILD_PHASES, loadBuildInstruction } from "./load-tool.js";
import { bindFeaturePropertyControls } from "./property-binding.js";
import { enhanceNumericInputs } from "./property-inputs.js";
import { staticsDisplayMarkup } from "./statics-panel.js";
import { syncStyleControls } from "./style-controls.js";

export function renderProperties() {
    syncStyleControls();

    /*
     * ========================================================
     * A CONSTRUCTION IN PROGRESS OWNS THE PANEL
     * ========================================================
     *
     * While a tool is part-way through building something, there is no
     * FEATURE to edit - the load does not exist yet, so there is nothing for
     * the tree to select and nothing for the property page to show. The panel
     * falls back to the tree, which is a list of things that are not what
     * the student is currently making.
     *
     * So a build in progress is answered here, with the one input it is
     * waiting on and the region it has established so far. This is what makes
     * "Specify load magnitude" something the student can DO rather than
     * something they are told to do and left to work out.
     */
    const loadBuild =
        loadBuildInstruction(
            drawingState.interaction?.phase
        );

    if (
        LOAD_BUILD_PHASES.has(
            drawingState.interaction?.phase
        )
    ) {
        drawingComponentsBack.style.display =
            "block";

        renderLoadBuildPanel(
            drawingState.interaction
        );

        return;
    }

    const selectedIds =
        drawingState.selection
            .selectedObjectIds;

    const selectedId =
        selectedIds[0];

    const object =
        drawingState.objects.find(
            candidate =>
                candidate.id ===
                selectedId
        );

    /*
     * Which view the Features panel is showing: the tree of
     * components, or the editing page of the one selected.
     *
     * These are two different things a user can look at, and
     * selecting a feature is not the same as asking to edit it.
     * Selecting is how you find out what is there; editing is a
     * deliberate step afterwards. So selection alone never
     * switches the view, or the panel would snatch itself away
     * from the tree every time a feature was picked, and
     * pressing Features would not get the tree back.
     *
     * The view is therefore explicit state, changed only by the
     * user: Features returns to the tree, and clicking the
     * selected feature again opens its editing page.
     */
    if (
        selectedIds.length !== 1 ||
        !object
    ) {
        drawingComponentsBack.style.display =
            "none";

        /*
         * With nothing selected there is nothing to edit, so
         * the tree is the only thing that can be shown.
         */
        editorState.featurePanelView = "tree";

        renderComponentTree();

        return;
    }

    if (editorState.featurePanelView !== "edit") {
        /*
         * A single feature is selected but the user is looking
         * at the component list. The tree is kept, so the
         * selection is still visible there and pressing Features
         * changes nothing.
         */
        renderComponentTree();

        return;
    }

    drawingComponentsBack.style.display =
        "block";

    /*
     * THE STATICS DISPLAY SECTION, ABOVE THE FEATURE BEING EDITED.
     *
     * The Vector Scale belongs to the Statics environment rather than to
     * any one feature: it decides how large every force and load arrow on
     * the sheet is drawn, so putting it inside the Point Force's own
     * panel - or the load's - would be a lie about what it controls. It
     * is stated once, here, where it reads as a sheet-wide setting.
     *
     * It is rendered ABOVE the feature's properties and is present
     * whenever a Statics feature is being edited. A non-Statics feature
     * has no arrows to scale, so the section is simply not drawn.
     *
     * This markup is the display half only. The engineering half - the
     * magnitude, unit, direction and attachment of the feature below it -
     * is unchanged by anything chosen here.
     */
    drawingProperties.innerHTML =
        staticsDisplayMarkup(object) +
        featurePropertyMarkup(object);
    drawingProperties.dataset.selectedObjectId = object.id;
    drawingProperties.dataset.geometrySignature = JSON.stringify({
        geometry: object.geometry,
        constraints: object.constraints,
        style: object.style
    });
    enhanceNumericInputs(drawingProperties);
    bindFeaturePropertyControls(object);
}
