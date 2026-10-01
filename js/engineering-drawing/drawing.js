/* Engineering drawing workspace controller. */

const toolHeading = document.getElementById("drawingToolHeading");
const toolList = document.getElementById("drawingToolList");
const drawingCanvas = document.querySelector(".drawing-canvas");
const drawingCoordinates = document.getElementById("drawingCoordinates");
const drawingZoomValue = document.getElementById("drawingZoomValue");
const drawingZoomOut = document.getElementById("drawingZoomOut");
const drawingZoomIn = document.getElementById("drawingZoomIn");
const drawingGridToggle = document.getElementById("drawingGridToggle");
const drawingSnapToggle = document.getElementById("drawingSnapToggle");
const drawingProperties = document.getElementById("drawingProperties");
const drawingToolMessage = document.getElementById("drawingToolMessage");
const drawingComponentsBack = document.getElementById("drawingFeaturesBack");
const drawingUndo = document.getElementById("drawingUndo");
const drawingRedo = document.getElementById("drawingRedo");
const drawingThickness = document.getElementById("drawingThickness");
const drawingColor = document.getElementById("drawingColor");
const drawingLineType = document.getElementById("drawingLineType");
const drawingToolPanelToggle = document.getElementById("drawingToolPanelToggle");
const drawingFeaturesPanelToggle = document.getElementById("drawingFeaturesPanelToggle");

const drawingState = enggDrawingState.createDrawingState();
const drawingSnap = enggDrawingSnap;

/*
 * ========================================================
 * SHEETS
 * ========================================================
 */

/*
 * The document's sheets.
 *
 * The editor has exactly ONE live drawing state, and it is always the
 * ACTIVE sheet. Switching sheets does not move geometry about and does
 * not ask the renderer to filter: it puts whatever is in the editor
 * back onto the sheet it came from, and loads the next sheet into the
 * editor.
 *
 * That is a deliberate choice over the alternative - making every
 * feature, every snap candidate and every hit-test aware of sheets. The
 * alternative would mean threading a sheet filter through thousands of
 * lines that have no business knowing, and the filter would have to be
 * remembered correctly in each one. Loading one sheet at a time means
 * the guarantee is structural instead of remembered: an inactive sheet
 * has no features in the editor at all, so it cannot be selected,
 * snapped to, dragged, or moved by a tool that was still armed. It
 * also means the Features panel, box selection and object snapping
 * need no sheet awareness whatsoever.
 */
let sheetCollection = enggSheets.createCollection();

const drawingSheetBar =
    document.getElementById("drawingSheetTabs");

function sheetById(sheetId) {
    return enggSheets.sheetById(
        sheetCollection,
        sheetId
    );
}

function activeSheet() {
    return enggSheets.activeSheet(
        sheetCollection
    );
}

/*
 * Write the editor's current drawing back onto the active sheet.
 *
 * Called before anything that leaves the sheet - switching, saving,
 * recovering - so that what the student sees is always what the sheet
 * holds. It is the only place the two are kept in step, which is what
 * makes it safe for the editor to be the live copy.
 */
function syncActiveSheet() {
    const sheet = activeSheet();

    if (!sheet) {
        return;
    }

    enggSheets.applySheetContent(
        sheet,
        enggSheets.captureSheetContent(
            drawingState
        )
    );

    sheet.units = drawingState.units;
}

/*
 * Write the editor's current drawing back onto the active sheet.
 *
 * Called before anything that leaves the sheet - switching, saving,
 * recovering - and after every committed edit, so that what the
 * student sees is always what the sheet holds. It is the only place
 * the two are kept in step, which is what makes it safe for the
 * editor to be the live copy.
 */
/*
 * Make a sheet the one being edited.
 *
 * The outgoing sheet is saved first, so a switch always leaves the
 * sheet it came from exactly as the student left it - including its
 * own zoom and its own pan. Then the incoming sheet is loaded, which
 * also brings its grid, its snapping and its style defaults with it.
 *
 * The active tool is NOT carried over conceptually: it is simply left
 * as it is, because a tool is a property of the session rather than of
 * a sheet, and a student moving from their beam to their free body
 * diagram almost always wants the same tool ready. What IS discarded
 * is any interaction in progress - a half-drawn line, a running drag -
 * because it belongs to geometry that is no longer on screen.
 */
function activateSheet(sheetId) {
    const target = sheetById(sheetId);

    if (!target) {
        return false;
    }

    if (target.id === sheetCollection.activeSheetId) {
        return true;
    }

    syncActiveSheet();

    sheetCollection.activeSheetId = target.id;

    enggSheets.loadSheet(drawingState, target);

    /*
     * The zoom readout belongs to the viewport, and the viewport is
     * now the new sheet's. Leaving it at the previous sheet's value
     * would report a zoom the user is not looking at.
     */
    drawingZoom =
        drawingState.camera.zoom * 100;

    if (drawingZoomValue) {
        drawingZoomValue.value =
            `${Math.round(drawingZoom)}%`;
    }

    enggDrawingState.clearInteraction(
        drawingState
    );

    syncWorkspaceSettingToggles();

    markDocumentDirty();

    refreshSheetTabs();

    renderProperties();
    renderCurrentDrawing();

    notifyReferences();

    setToolMessage(
        target.name
    );

    return true;
}

function createSheet(options = {}) {
    syncActiveSheet();

    const sheet = enggSheets.addSheet(
        sheetCollection,
        options
    );

    loadSheetIntoEditor(sheet);

    markDocumentDirty();

    refreshSheetTabs();

    renderProperties();
    renderCurrentDrawing();

    notifyReferences();

    setToolMessage(
        `Created ${sheet.name}`
    );

    return sheet;
}

/*
 * Put a sheet into the editor and make it active.
 *
 * Separate from activateSheet because the new sheet is not in the
 * editor yet, so there is nothing to save back out of it - and saving
 * would be wrong, not merely redundant: it would write the PREVIOUS
 * sheet's content over the new one.
 */
function loadSheetIntoEditor(sheet) {
    enggSheets.loadSheet(drawingState, sheet);

    /*
     * The zoom comes back through the shared sanitiser.
     *
     * A sheet stores the zoom it was left at, and that value was
     * sanitised when it was set - but it was also read from a file, and
     * a file is editable. Re-applying it through the one function the
     * application already uses means a restored viewport is clamped
     * and rounded exactly as a zoomed one is, so no sheet can come
     * back at 100.0000001% or 4000% because a hand-edited file said so.
     *
     * The sheet's own stored value is left alone: it is the
     * application that decides what a zoom means, not the file.
     */
    enggDrawingState.setCameraZoom(
        drawingState,
        drawingState.camera.zoom
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    syncWorkspaceSettingToggles();

    drawingZoom =
        drawingState.camera.zoom * 100;

    if (drawingZoomValue) {
        drawingZoomValue.value =
            `${Math.round(drawingZoom)}%`;
    }
}

/*
 * The Grid and Snap buttons state themselves from the editor rather
 * than from a variable of their own, so that a sheet arriving with
 * its grid off or its snapping off shows that immediately.
 */
function syncWorkspaceSettingToggles() {
    if (drawingGridToggle) {
        const on = Boolean(
            drawingState.grid.visible
        );

        drawingGridToggle.textContent =
            on ? "Grid ON" : "Grid OFF";

        drawingGridToggle.classList.toggle(
            "active",
            on
        );

        drawingGridToggle.setAttribute(
            "aria-pressed",
            String(on)
        );
    }

    if (drawingCanvas) {
        drawingCanvas.classList.toggle(
            "grid-off",
            !drawingState.grid.visible
        );
    }

    if (drawingSnapToggle) {
        const on = Boolean(
            drawingState.snap.enabled
        );

        drawingSnapToggle.textContent =
            on ? "Snap ON" : "Snap OFF";

        drawingSnapToggle.classList.toggle(
            "active",
            on
        );

        drawingSnapToggle.setAttribute(
            "aria-pressed",
            String(on)
        );
    }
}

/*
 * ============================
 * SHEET COMMANDS
 * ============================
 */

/*
 * Rename, in the application's own dialog.
 *
 * NOT window.prompt, and this is a deliberate difference from how the
 * file panel is done. The save panel is the OPERATING SYSTEM's, and
 * reusing it would be right because a file's location is the system's
 * business. A sheet name is the application's business: it belongs to
 * EnggDraw's document model, it is edited constantly, and a system
 * text box in the middle of a canvas is both foreign-looking and
 * impossible to style. So the two deliberately use different mechanisms,
 * each the one that fits.
 *
 * The sheet stays active while the dialog is open, and the id is not
 * touched. Any reference to this sheet - in the written solution, in a
 * caption - keeps working, because it never knew the name.
 */
function renameSheet(sheetId) {
    const sheet = sheetById(sheetId);

    if (!sheet) {
        return;
    }

    enggUi
        .promptDialog(
            "Give this sheet a name. " +
            "References to it are unaffected.",
            {
                title: "Rename sheet",
                fields: [
                    {
                        name: "name",
                        label: "Sheet name",
                        value: sheet.name,
                        placeholder: "Free Body Diagram",
                        maxLength: 80
                    }
                ],
                confirm: "Rename",
                cancel: "Cancel",

                /*
                 * An empty name would leave a tab with nothing on it,
                 * which is not a name and is impossible to tell apart
                 * from a broken tab. Returning false keeps the dialog
                 * open with the text still there, so the student can
                 * fix it rather than having lost their typing.
                 */
                onConfirm: (entered) =>
                    (entered.name || "").trim()
                        ? entered
                        : false
            }
        )
        .then((entered) => {
            if (!entered) {
                return;
            }

            const renamed = enggSheets.renameSheet(
                sheetCollection,
                sheetId,
                entered.name
            );

            if (!renamed) {
                return;
            }

            markDocumentDirty();

            refreshSheetTabs();

            /*
             * The name is shown in figure captions, so a rename is a
             * change the written side can see.
             */
            notifyReferences();

            setToolMessage(
                `Renamed to ${renamed.name}`
            );
        });
}

function duplicateSheet(sheetId) {
    syncActiveSheet();

    const copy = enggSheets.duplicateSheet(
        sheetCollection,
        sheetId
    );

    if (!copy) {
        return;
    }

    loadSheetIntoEditor(copy);

    markDocumentDirty();

    refreshSheetTabs();

    renderProperties();
    renderCurrentDrawing();

    notifyReferences();

    setToolMessage(
        `Duplicated as ${copy.name}`
    );
}

/*
 * Delete a sheet, after checking the user means it.
 *
 * A sheet is a whole drawing. Deleting one is not a misclick away from
 * a mistake of the same size as pressing Delete with a feature
 * selected - it can be the whole of a student's shear force diagram -
 * so an empty sheet is removed immediately and a sheet WITH something
 * on it always asks first.
 *
 * The last sheet is never removed. There would be nothing left to
 * draw on, and a document with no sheets cannot be saved, recovered
 * or referenced.
 */
async function deleteSheet(sheetId) {
    const sheet = sheetById(sheetId);

    if (!sheet) {
        return;
    }

    if (sheetCollection.sheets.length <= 1) {
        setToolMessage(
            "The last sheet cannot be deleted"
        );

        return;
    }

    if (
        sheet.objects.length &&
        !(await enggUi.confirmDialog(
            "This sheet contains drawing content.\n\n" +
            `Delete "${sheet.name}"?\n\n` +
            "The drawing on it cannot be recovered.",
            {
                title: "Delete sheet",
                confirm: "Delete",
                cancel: "Cancel"
            }
        ))
    ) {
        return;
    }

    const wasActive =
        sheetCollection.activeSheetId === sheetId;

    if (!enggSheets.deleteSheet(
        sheetCollection,
        sheetId
    )) {
        return;
    }

    if (wasActive) {
        const next = activeSheet();

        loadSheetIntoEditor(next);
    }

    markDocumentDirty();

    refreshSheetTabs();

    renderProperties();
    renderCurrentDrawing();

    notifyReferences();

    setToolMessage(
        `Deleted ${sheet.name}`
    );
}

function moveSheet(sheetId, delta) {
    if (
        !enggSheets.moveSheet(
            sheetCollection,
            sheetId,
            delta
        )
    ) {
        return;
    }

    markDocumentDirty();

    refreshSheetTabs();

    notifyReferences();
}

function reorderSheet(sheetId, targetIndex) {
    if (
        !enggSheets.reorderSheet(
            sheetCollection,
            sheetId,
            targetIndex
        )
    ) {
        return;
    }

    markDocumentDirty();

    refreshSheetTabs();

    notifyReferences();
}

/*
 * The tab bar.
 *
 * Attached once and re-rendered from the collection, so the tabs and
 * the document cannot disagree: there is one source of truth and the
 * bar is a view of it.
 */
function refreshSheetTabs() {
    if (!drawingSheetBar || !window.enggSheetTabs) {
        return;
    }

    enggSheetTabs.render();
}

enggSheetTabs.attach(drawingSheetBar, {
    getSheets: () => sheetCollection.sheets,
    getActiveSheetId: () =>
        sheetCollection.activeSheetId,
    onActivate: activateSheet,
    onCreate: () => createSheet(),
    onRename: renameSheet,
    onDuplicate: duplicateSheet,
    onDelete: deleteSheet,
    onMove: moveSheet,
    onReorder: reorderSheet
});

/*
 * ============================
 * REFERENCES
 * ============================
 */

/*
 * Told whenever the drawing changes in a way a figure would show.
 *
 * A reference is live: it renders from the sheet's current contents
 * every time it is looked at. The written side keeps a canvas to draw
 * into, so it has to be told when that drawing is now out of date -
 * and it must be told from the ONE place that knows, rather than from
 * each of the many code paths that can change a drawing.
 */
let onReferencesChanged = null;

function notifyReferences() {
    if (
        typeof onReferencesChanged === "function"
    ) {
        onReferencesChanged();
    }
}

/*
 * The document as the rest of the application sees it.
 *
 * Published so that the written solution - or anything else that needs
 * to point at a sheet - can ask for a figure without reaching into the
 * editor's internals. It exposes sheets by ID and nothing that could
 * be mistaken for authority over them.
 */
window.enggDrawingSheets = {
    get collection() {
        return sheetCollection;
    },
    activeSheet,
    activeSheetId: () => sheetCollection.activeSheetId,
    activateSheet,
    all: () => sheetCollection.sheets,
    createSheet,
    deleteSheet,
    duplicateSheet,
    moveSheet,
    renameSheet,
    reorderSheet,
    renderReference(sheetId, options) {
        return enggDrawingReference.renderDrawingReference(
            sheetId,
            options
        );
    },
    setReferenceChangeHandler(handler) {
        onReferencesChanged =
            typeof handler === "function"
                ? handler
                : null;
    },
    sheetById,

    /*
     * The document as it would be written to a file.
     *
     * Exposed so that anything which needs to persist or inspect the
     * whole document - the file itself, the recovery copy, a check
     * that a document really does contain what it should - reads it
     * from the one place that builds it, rather than assembling its
     * own version and risking a second, subtly different shape.
     */
    serializeDocumentBody
};

window.enggDrawing = {
    state: drawingState,
    model: enggDrawingState,
    renderer: enggDrawingRenderer
};

const COORDINATE_SYSTEM_TYPE = "coordinate-system-2d";
const COORDINATE_SYSTEM_LENGTH = 25;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/*
 * Smallest interior angle a triangle may take. Keeps
 * angle edits from collapsing a triangle into a
 * degenerate sliver.
 */
const MIN_TRIANGLE_ANGLE = 0.01;

/*
 * The default line weight for a Statics tool's features.
 *
 * A Point Force gets its own heavier weight; every other Statics
 * feature uses the drawing's general default. Naming the choice
 * here keeps the creation path from having to know which tools
 * are drawn heavier.
 */
function staticsForceLineWidth(
        toolId
    ) {
        /*
         * A FORCE IS DRAWN AT THE SAME WEIGHT AS ANY OTHER FEATURE.
         *
         * This used to return a special weight for a Point Force,
         * chosen on the grounds that a force is a symbol and a symbol
         * needs more presence than an outline. It was a mistake twice
         * over.
         *
         * Once, because the number it returned was not the sheet's
         * default: a force drew at 0.5 while a Line drew at 1.2, so
         * the same configured thickness produced two different-looking
         * strokes and "the default thickness" meant different numbers
         * for different features. A student setting a line to 0.5 and
         * drawing a force next to a line would see them at visibly
         * different weights with identical settings.
         *
         * Twice, because the special weight was a floor as well as a
         * default: it was returned regardless of the width already
         * chosen, so a force drawn at the sheet's own 1.2 came out at
         * 0.5 - the opposite of the intention. A force looked
         * THINNER than ordinary geometry, which is the one thing this
         * was supposed to prevent.
         *
         * So a force is given no special treatment at all. It is drawn
         * at the sheet's current line weight, exactly as a Line is, and
         * a force that wants more presence gets a Features-panel line
         * width like every other feature.
         */
        return drawingState.styleDefaults?.lineWidth ?? 1.2;
    }

/*
 * Default size of a newly created rigid body, in mm. The
 * student resizes it afterwards from the Features panel
 * or by dragging its corner handles.
 */
/*
 * The starting size of a new Rigid Body.
 *
 * Deliberately small: a body is a starting outline to be sized
 * and shaped, so a large default would fill the canvas and need
 * shrinking before it could be used.
 */
const RIGID_BODY_WIDTH = 50;
const RIGID_BODY_HEIGHT = 30;

let coordinateSystemMenu = null;
let coordinateSystemMenuAnchor = null;
let polygonSidesPrompt = null;
let selectionClickSuppressed = false;
let selectionDrag = null;
let panSession = null;

/*
 * The pending expiry of a held snap guideline.
 *
 * A guideline is kept up briefly after the cursor leaves its
 * region so it does not flicker off with every small movement.
 * The pointer moving again would eventually clear it on its
 * own, but a cursor that stops moving just outside a region
 * would leave the guide up forever, so the hold is given a
 * deadline of its own.
 *
 * Only ever one timer: a new one replaces the old rather than
 * accumulating, so holding a guide steady does not queue up
 * dozens of redraws.
 */
let guidelineHoldTimer = null;
let drawingZoom = drawingState.camera.zoom * 100;

function activeCategory() {
    return (
        document.querySelector(
            ".drawing-category.active"
        )?.dataset.category ||
        "GEOMETRY"
    );
}

function toolDefinitionForLabel(label) {
    const toolIdByLabel =
        Object.fromEntries(
            Object.entries(
                drawToolLabelById
            ).map(
                ([id, toolLabel]) =>
                    [toolLabel, id]
            )
        );

    return {
        id:
            toolIdByLabel[label] ||
            label
                .toLowerCase()
                .replace(
                    /[^a-z]+/g,
                    "-"
                ),
        label
    };
}

function renderToolButton(tool) {
    /*
     * A submenu parent highlights when one of its own
     * children is the active tool, so the highlight always
     * shows which category the running tool belongs to.
     */
    const childActive =
        STATICS_TOOL_MENUS[tool.id]?.some(
            item =>
                item.id ===
                drawingState.activeTool
        ) ||
        false;

    const active =
        drawingState.activeTool ===
            tool.id ||
        childActive ||
        (
            tool.id ===
                "coordinate-system" &&
            drawingState.activeTool ===
                "coordinate-system-2d"
        );

    const shortcut =
        tool.shortcut
            ? ` (${tool.shortcut})`
            : "";

    /*
     * Tools that open a submenu advertise it, so the
     * affordance matches the existing coordinate-system
     * and polygon buttons.
     */
    const coordinateAttributes =
        tool.id ===
            "coordinate-system" ||
        tool.submenu
            ? ' aria-haspopup="menu" aria-expanded="false"'
            : "";

    const submenuCaret =
        tool.submenu
            ? ' <span class="drawing-tool-caret" aria-hidden="true">▾</span>'
            : "";

    return `
        <button
            class="drawing-tool${active ? " active" : ""}"
            type="button"
            data-tool-id="${tool.id}"
            title="${tool.label}${shortcut}"
            aria-label="${tool.label}${shortcut}"
            aria-pressed="${active}"
            ${coordinateAttributes}
        >
            <span class="drawing-tool-icon" aria-hidden="true">
                ${toolIcons[tool.label] || ""}
            </span>

            <!--
                The label is its own element rather than a bare
                text node so that a name too long for the panel can
                WRAP instead of widening it.

                A panel wide enough to hold every name on one line
                would take a large share of a laptop screen away
                from the drawing, so the panels stay compact and
                the names give way instead - which costs a second
                line of text rather than a third of the canvas.

                The wrap is a hanging indent (see
                .drawing-tool-label), so a name's second line stays
                under its own first character instead of sliding
                back under the icon, where it would read as
                belonging to the row above.
            -->
            <span class="drawing-tool-label">${tool.label}${submenuCaret}</span>
        </button>
    `;
}

function closeCoordinateSystemMenu() {
    if (coordinateSystemMenu) {
        coordinateSystemMenu.remove();
        coordinateSystemMenu = null;
    }

    if (coordinateSystemMenuAnchor) {
        coordinateSystemMenuAnchor.setAttribute(
            "aria-expanded",
            "false"
        );

        coordinateSystemMenuAnchor = null;
    }
}

/*
 * Small prompt for the polygon's side count.
 *
 * This belongs to the creation workflow, so it is a
 * transient popup rather than part of the Features
 * panel. Confirming it commits the polygon.
 */
function openPolygonSidesPrompt(
    interaction
) {
    closePolygonSidesPrompt();

    const prompt =
        document.createElement("div");

    prompt.className =
        "drawing-polygon-prompt";

    prompt.setAttribute(
        "role",
        "dialog"
    );

    prompt.innerHTML = `
        <label class="drawing-polygon-prompt-label" for="polygonSidesInput">
            Number of Sides
        </label>
        <div class="drawing-polygon-prompt-row">
            <input id="polygonSidesInput" type="number"
                min="3" step="1" value="${polygonSideCount(interaction)}">
            <button type="button" data-polygon-confirm>OK</button>
        </div>
    `;

    document.body.appendChild(
        prompt
    );

    const input =
        prompt.querySelector(
            "#polygonSidesInput"
        );

    const confirm = () => {
        const sides =
            Math.round(
                Number(input.value)
            );

        /*
         * Reject anything that cannot form a polygon.
         */
        if (
            !Number.isFinite(sides) ||
            sides < 3
        ) {
            input.value =
                String(
                    polygonSideCount(
                        interaction
                    )
                );

            setToolMessage(
                "Number of sides must be 3 or more"
            );

            return;
        }

        interaction.polygonSides =
            sides;

        closePolygonSidesPrompt();

        commitPolygon(interaction);
    };

    prompt.querySelector(
        "[data-polygon-confirm]"
    ).addEventListener(
        "click",
        confirm
    );

    input.addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();
                confirm();
            }
        }
    );

    /*
     * Live preview while the count changes.
     */
    input.addEventListener("input", () => {
        const sides =
            Math.round(
                Number(input.value)
            );

        if (
            Number.isFinite(sides) &&
            sides >= 3
        ) {
            interaction.polygonSides =
                sides;

            const geometry =
                polygonFromCursor(
                    interaction,
                    interaction.currentPoint
                );

            interaction.preview =
                geometry
                    ? createPreview(
                        "polygon",
                        geometry
                    )
                    : null;

            renderCurrentDrawing();
        }
    });

    setToolMessage(
        "Specify number of sides"
    );

    input.focus();
    input.select();

    polygonSidesPrompt =
        prompt;
}

function closePolygonSidesPrompt() {
    if (polygonSidesPrompt) {
        polygonSidesPrompt.remove();
        polygonSidesPrompt = null;
    }
}

/*
 * Create the polygon from the confirmed definition and
 * select it, so its Features panel opens immediately.
 */
function commitPolygon(
    interaction
) {
    const geometry =
        polygonFromCursor(
            interaction,
            interaction.currentPoint
        );

    if (!geometry) {
        setToolMessage(
            "Specify polygon radius"
        );

        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        enggDrawingState.geometryFactories.polygon(
            geometry.center,

            geometry.radius,

            geometry.sides,

            geometry.rotation,

            {
                style: {
                    ...drawingState.styleDefaults
                },

                /*
                 * Remember how the polygon was defined so
                 * the Features panel can show the matching
                 * parameters. The feature type stays
                 * "polygon" either way.
                 */
                metadata: {
                    definition:
                        interaction.polygonMode ===
                        "sides"
                            ? "By Sides"
                            : "By Centre"
                },

                engineering:
                    currentEngineeringMetadata()
            }
        );

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

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Specify polygon centre"
    );

    renderProperties();
    renderCurrentDrawing();
}

function openPolygonMenu(button) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const currentMode =
        drawingState.interaction.polygonMode ||
        "sides";

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML = `
        <button
            type="button"
            class="drawing-coordinate-submenu-item${currentMode === "sides" ? " active" : ""}"
            role="menuitem"
            data-polygon-mode="sides"
        >
            By Sides
        </button>

        <button
            type="button"
            class="drawing-coordinate-submenu-item${currentMode === "centre" ? " active" : ""}"
            role="menuitem"
            data-polygon-mode="centre"
        >
            By Centre
        </button>
    `;

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    if (
        left +
            menuRect.width >
        window.innerWidth -
            margin
    ) {
        left =
            buttonRect.left -
            menuRect.width -
            gap;
    }

    let top =
        buttonRect.top;

    if (
        top +
            menuRect.height >
        window.innerHeight -
            margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.left =
        `${Math.max(margin, left)}px`;

    menu.style.top =
        `${top}px`;

    button.setAttribute(
        "aria-expanded",
        "true"
    );

    menu.querySelectorAll(
        "[data-polygon-mode]"
    ).forEach(
        item => {
            item.addEventListener(
                "click",
                () => {
                    closeCoordinateSystemMenu();

                    enggDrawingState.setActiveTool(
                        drawingState,
                        "polygon"
                    );

                    drawingState.interaction.polygonMode =
                        item.dataset
                            .polygonMode;

                    /*
                     * The first instruction depends on the
                     * chosen creation method.
                     */
                    setToolMessage(
                        drawingState.interaction
                            .polygonMode ===
                            "sides"
                            ? "Specify first point"
                            : "Specify polygon centre"
                    );

                    renderEngineeringTools(
                        activeCategory()
                    );

                    renderCurrentDrawing();
                }
            );
        }
    );

    coordinateSystemMenu =
        menu;

    coordinateSystemMenuAnchor =
        button;
}

function openArcMenu(button) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML = `
        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-arc-mode="centrepoint"
        >
            Centrepoint Arc
        </button>

        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-arc-mode="three-point"
        >
            3-Point Arc
        </button>
    `;

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    if (
        left +
            menuRect.width >
        window.innerWidth -
            margin
    ) {
        left =
            buttonRect.left -
            menuRect.width -
            gap;
    }

    let top =
        buttonRect.top;

    if (
        top +
            menuRect.height >
        window.innerHeight -
            margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.left =
        `${Math.max(margin, left)}px`;

    menu.style.top =
        `${top}px`;

    button.setAttribute(
        "aria-expanded",
        "true"
    );

    menu.querySelectorAll(
        "[data-arc-mode]"
    ).forEach(
        item => {
            item.addEventListener(
                "click",
                () => {
                    const mode =
                        item.dataset
                            .arcMode;

                    closeCoordinateSystemMenu();

                    enggDrawingState.setActiveTool(
                        drawingState,
                        "arc"
                    );

                    drawingState.interaction.arcMode =
                        mode;

                    setToolMessage(
                        mode ===
                            "three-point"
                            ? "Specify first point"
                            : "Specify arc centre"
                    );

                    renderEngineeringTools(
                        activeCategory()
                    );

                    renderCurrentDrawing();
                }
            );
        }
    );

    coordinateSystemMenu =
        menu;

    coordinateSystemMenuAnchor =
        button;
}

/*
 * Shared submenu component.
 *
 * Every tool that has options opens the same popup: the
 * same element, classes, positioning, keyboard and
 * click-outside behaviour. Callers only supply the items.
 *
 * Each item is { id, label }, and the chosen id is passed
 * to the onSelect callback.
 */
function openToolSubmenu(
    button,
    items,
    onSelect
) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML =
        items
            .map(
                item => `
                    <button
                        type="button"
                        class="drawing-coordinate-submenu-item"
                        role="menuitem"
                        data-submenu-id="${item.id}"
                    >
                        ${item.label}
                    </button>
                `
            )
            .join("");

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    let top =
        buttonRect.top;

    if (
        left + menuRect.width >
        window.innerWidth - margin
    ) {
        left =
            Math.max(
                margin,
                buttonRect.left -
                    menuRect.width -
                    gap
            );
    }

    if (
        top + menuRect.height >
        window.innerHeight - margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.position =
        "fixed";

    menu.style.left =
        `${left}px`;

    menu.style.top =
        `${top}px`;

    menu.style.zIndex =
        "9999";

    menu.querySelectorAll(
        ".drawing-coordinate-submenu-item"
    ).forEach(
        option => {
            option.addEventListener(
                "click",
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const id =
                        option.dataset
                            .submenuId;

                    closeCoordinateSystemMenu();

                    onSelect(id);
                }
            );
        }
    );

    coordinateSystemMenu =
        menu;

    coordinateSystemMenuAnchor =
        button;
}

/*
 * The six Statics creation categories and their tools.
 * Each parent opens a submenu; the child is the tool that
 * actually starts a drawing operation.
 */
/*
 * ========================================================
 * THE ARC TOOLS
 * ========================================================
 *
 * Geometry → Arc and Statics → Reference Arc are ONE arc
 * implementation. Every place the code asked "is the active tool
 * 'arc'?" now asks this instead, so the two cannot drift apart:
 * the construction modes, the snapping, the preview, the commit,
 * editing, movement, the Features panel, the renderer and undo all
 * come from the same code for both.
 *
 * What differs is only what the finished feature IS. A Reference Arc
 * is construction geometry - drawn in the construction line type and
 * named for its statics role - where a Geometry Arc is final
 * geometry. That is decided once, at commit, by
 * isReferenceArcTool().
 */

/*
 * The tools whose construction is the arc's.
 *
 * The Reference Arc is registered as an ARC child, exactly as the
 * Reference Line is registered as a LINE child, so it arrives here
 * with the whole arc interaction already attached to it. Its own id
 * is never tested directly - asking "is this one of the arc tools?"
 * means a future arc variant would work without being listed.
 */
const ARC_TOOLS = new Set([
    "arc",
    "reference-arc"
]);

/*
 * THE OPTIONS FOR A COMMITTED ARC.
 *
 * Both arc modes - centre/start/end and three-point - commit through
 * here, so a Reference Arc is made the same way whichever way it was
 * drawn. A tool that honoured the reference state in one mode and not
 * the other would be a trap: the same tool producing a construction
 * arc one way and a final arc the other.
 *
 * For an ordinary Arc this is just the sheet's current style, which is
 * what it always was. For a Reference Arc it adds two things:
 *
 *   - the CONSTRUCTION line type, so it is drawn as reference
 *     geometry and reads as belonging to the construction rather than
 *     to the final drawing. It is a default, not a rule: the Features
 *     panel can change any line type afterwards, exactly as it can for
 *     a Reference Line.
 *   - a NAME that says what it is, so the Feature Tree shows
 *     "Reference Arc" rather than a row of anonymous arcs.
 *
 * The underlying geometry is untouched. It is a real arc, drawn by
 * the ordinary arc renderer, snapping and contributing snap targets
 * like any other - it simply says what it is for.
 */
function referenceArcOptions() {
    const isReference =
        isReferenceArcTool();

    return {
        style: {
            ...drawingState.styleDefaults,

            lineType: isReference
                ? "construction"
                : drawingState.styleDefaults.lineType
        },

        engineering: {
            ...currentEngineeringMetadata(),

            /*
             * The statics role, so the feature stays identifiable as
             * a reference after it has been edited, moved and saved.
             */
            staticsType: isReference
                ? "reference-arc"
                : undefined
        },

        name: isReference
            ? "Reference Arc"
            : undefined
    };
}

function isArcTool(toolId) {
    return ARC_TOOLS.has(
        toolId ?? drawingState.activeTool
    );
}

/*
 * Whether the active tool builds a REFERENCE arc rather than a
 * final one.
 *
 * Read at commit and at edit, because a feature's nature is fixed
 * when it is made and must survive being moved and changed
 * afterwards.
 */
function isReferenceArcTool(toolId) {
    return (
        toolId ?? drawingState.activeTool
    ) === "reference-arc";
}

const STATICS_TOOL_MENUS = {
    body: [
        { id: "particle", label: "Particle" },
        { id: "rigid-body", label: "Rigid Body" },
        { id: "beam", label: "Beam" },
        { id: "truss", label: "Truss" },
        { id: "cable", label: "Cable" },
        { id: "shaft", label: "Shaft" }
    ],

    moment: [
        { id: "applied-moment", label: "Applied Moment" },
        { id: "couple", label: "Couple" }
    ],

    load: [
        { id: "distributed-load", label: "Distributed Load" },
        {
            id: "varying-distributed-load",
            label: "Varying Distributed Load"
        }
    ],

    support: [
        { id: "pin-support", label: "Pin Support" },
        { id: "roller-support", label: "Roller Support" },
        { id: "fixed-support", label: "Fixed Support" },
        { id: "smooth-support", label: "Smooth Support" }
    ],

    connection: [
        { id: "pin-connection", label: "Pin Connection" },
        { id: "fixed-connection", label: "Fixed Connection" },
        { id: "slider-connection", label: "Slider Connection" }
    ]
};

/*
 * Every Statics feature tool, with the label shown in the
 * status line and the authoritative feature type it creates.
 *
 * A Point Force is listed here as a direct tool rather than
 * behind a submenu, and the type it records is `force`, which
 * is the Point Force feature. Force Pair, Point Load and the
 * old generic Force/Moment/Support entries are gone: there is
 * exactly one tool and one feature type per real feature.
 */
const STATICS_CHILD_TOOLS = {
    particle: { label: "Particle", type: "particle" },
    "rigid-body": { label: "Rigid Body", type: "rigid-body" },
    beam: { label: "Beam", type: "beam" },
    truss: { label: "Truss", type: "truss" },
    cable: { label: "Cable", type: "cable" },
    shaft: { label: "Shaft", type: "shaft" },

    "point-force": { label: "Point Force", type: "force" },

    /*
     * The three analysis templates.
     *
     * Each names its own feature type, so the tool the student
     * chose and the thing that appears are the same thing. The
     * type is also what the shared span commit dispatches on,
     * so without an entry here the template would be placed as
     * a span and then have nothing to build.
     */
    "shear-force-diagram": {
        label: "Shear Force (SFD)",
        type: "shear-force-diagram"
    },
    "bending-moment-diagram": {
        label: "Bending Moment (BMD)",
        type: "bending-moment-diagram"
    },
    "axial-force-diagram": {
        label: "Axial Force (AFD)",
        type: "axial-force-diagram"
    },

    "applied-moment": { label: "Applied Moment", type: "moment" },
    couple: { label: "Couple", type: "couple" },

    "distributed-load": { label: "Distributed Load", type: "load" },
    "varying-distributed-load": {
        label: "Varying Distributed Load",
        type: "varying-load"
    },

    "pin-support": { label: "Pin Support", type: "pin-support" },
    "roller-support": {
        label: "Roller Support",
        type: "roller-support"
    },
    "fixed-support": { label: "Fixed Support", type: "fixed-support" },
    "smooth-support": {
        label: "Smooth Support",
        type: "smooth-support"
    },

    "pin-connection": {
        label: "Pin Connection",
        type: "pin-connection"
    },
    "fixed-connection": {
        label: "Fixed Connection",
        type: "fixed-connection"
    },
    "slider-connection": {
        label: "Slider Connection",
        type: "slider-connection"
    },

    "reference-point": {
        label: "Reference Point",
        type: "point"
    },

    /*
     * A Reference Line is a LINE, not a statics primitive of
     * its own. It is a reference line rather than a drawn
     * object, so it is created as ordinary line geometry that
     * starts out in the construction style and is named for
     * its statics role.
     *
     * Registering it here is what routes it through the normal
     * line factory, so it behaves exactly like a Line while it
     * is being built and while it is being edited, and it gets
     * the Line Features panel for free rather than needing a
     * second implementation of the same fields.
     */
    "reference-line": {
        label: "Reference Line",
        type: "line"
    },

    /*
     * A Reference Arc is an ARC child for the same reason a
     * Reference Line is a LINE child.
     *
     * Registering it here is what routes it through the ordinary arc
     * factory, so it behaves exactly like an Arc while it is being
     * built and while it is being edited, and it gets the Arc
     * Features panel for free rather than needing a second
     * implementation of the same fields. The arc construction modes,
     * the snapping, the live preview and undo are all the shared
     * ones.
     *
     * What makes it a REFERENCE arc is applied at commit, from
     * isReferenceArcTool: construction line type, and a name that
     * says so.
     */
    "reference-arc": {
        label: "Reference Arc",
        type: "arc"
    }
};

/*
 * Open a Statics category submenu. Choosing an item records
 * the support/connection variant on the interaction so the
 * created feature keeps its specific type, then starts the
 * tool through the normal activation path.
 */
function openStaticsMenu(
    button,
    categoryId
) {
    const items =
        STATICS_TOOL_MENUS[categoryId];

    if (!items) {
        return;
    }

    openToolSubmenu(
        button,
        items,
        childId => {
            activateTool(
                childId
            );

            /*
             * activateTool already sets the opening
             * instruction for the tool, which is "Select
             * body" for the tools that need a body. Setting a
             * second message here would overwrite it with the
             * old free-space wording.
             */
            setToolMessage(
                initialToolMessage(
                    childId
                )
            );
        }
    );
}

/*
 * The canonical name of every Statics feature, keyed by its
 * authoritative feature type.
 *
 * This is the one place a Statics feature is named, so the
 * toolbar, the Feature Tree and the Features panel all call
 * it the same thing: a `load` is a Distributed Load
 * everywhere, never "load" and never a Distributed Force.
 */
/*
 * Statics features that reuse an existing geometry type.
 *
 * Their canonical name is that of the geometry itself, so a
 * Reference Point is not allowed to rename a plain Point.
 */
const SHARED_STATICS_GEOMETRY = [
    "point",
    "line"
];

const STATICS_FEATURE_LABELS = Object.fromEntries(
    Object.entries(
        STATICS_CHILD_TOOLS
    )
        /*
         * A Reference Point reuses the ordinary point
         * geometry, so its `point` type is shared with plain
         * Points. Only types unique to a Statics feature are
         * renamed here; shared geometry keeps its own name.
         */
        .filter(
            ([, definition]) =>
                !SHARED_STATICS_GEOMETRY.includes(
                    definition.type
                )
        )
        .map(([toolId, definition]) => [
            definition.type,
            definition.label
        ])
);

/*
 * Statics features that can be attached to a body.
 *
 * A force, a load or a support reads as acting on whatever
 * it was snapped onto, so it may become that body's child.
 * A body or a member cannot be a child of another body, and
 * a reference feature belongs to no one.
 */
function attachableStaticsType(
    type
) {
    return [
        "force",
        "load",
        "varying-load",
        "moment",
        "couple",
        "pin-support",
        "roller-support",
        "fixed-support",
        "smooth-support"
    ].includes(type);
}

/*
 * The bodies a Statics feature may attach to.
 *
 * Only real bodies are eligible, so a force snapped onto a
 * Beam becomes part of that Beam, while one snapped onto a
 * stray Line stays unattached rather than adopting geometry
 * that has no engineering meaning.
 */
const STATICS_ATTACHABLE_FEATURES = [
    "particle",
    "rigid-body",
    "beam",
    "truss",
    "cable",
    "shaft"
];

/*
 * The Statics tools that act on a body, so they begin by
 * asking for one rather than placing themselves in free
 * space.
 *
 * A tool is body-attached when the feature only has meaning
 * relative to something it acts on. A Reference Line or a
 * free Point Force is not, and those keep placing directly.
 */
const STATICS_BODY_ATTACHED_TOOLS = [
    /*
     * Both distributed loads begin by choosing the body they
     * load, then build the distribution on it in their own
     * staged interaction, so neither is a plain two-point
     * span tool any more. They share the body selection and the
     * span fallback, and diverge afterwards: the plain load is a
     * single constant magnitude, the varying one is a profile.
     */
    "distributed-load",
    "varying-distributed-load",
    "applied-moment",
    "couple",
    "pin-support",
    "roller-support",
    "fixed-support",
    "smooth-support",
    "pin-connection",
    "fixed-connection",
    "slider-connection"
];

/*
 * How many points a body-attached tool needs before it can be
 * confirmed.
 *
 * A support or a moment is defined by a single point on its
 * body. A load needs the two ends of the region it loads. A
 * connection needs an attachment on each of the two bodies it
 * joins.
 */
const STATICS_TOOL_POINT_COUNT = {
    "distributed-load": 2,
    "varying-distributed-load": 2,
    "applied-moment": 1,
    "couple": 1,
    "pin-support": 1,
    "roller-support": 1,
    "fixed-support": 1,
    "smooth-support": 1,
    "pin-connection": 2,
    "fixed-connection": 2,
    "slider-connection": 2
};

/*
 * Whether a Statics tool must be given a body before it can
 * place anything.
 */
function isBodyAttachedTool(
    toolId
) {
    return STATICS_BODY_ATTACHED_TOOLS.includes(
        toolId
    );
}

/*
 * How many points a body-attached tool still needs.
 */
function staticsToolPointCount(
    toolId
) {
    return (
        STATICS_TOOL_POINT_COUNT[toolId] ?? 1
    );
}

/*
 * The status a body-attached tool shows at each step.
 *
 * The wording is written for the person using it, and each
 * step says what the next action is rather than describing
 * internal state.
 */
function staticsBodyMessage(
    toolId,
    step
) {
    const count =
        staticsToolPointCount(toolId);

    if (step === 0) {
        return toolId === "applied-moment"
            ? "Click a body to apply to, or empty space for a free moment"
            : "Select body";
    }

    if (isConnectionType(
        STATICS_CHILD_TOOLS[toolId]?.type
    )) {
        if (step === 1) {
            return "Select second body";
        }

        return "Pick connection location";
    }

    if (
        toolId === "distributed-load" ||
        toolId === "varying-distributed-load"
    ) {
        if (step === 1) {
            return "Pick magnitude of end load";
        }

        return "Pick magnitude and location of second end load";
    }

    if (isSupportType(
        STATICS_CHILD_TOOLS[toolId]?.type
    )) {
        return step === 1
            ? "Pick attachment location"
            : "Specify support orientation";
    }

    if (count > 1) {
        return "Pick first location";
    }

    return "Pick application point";
}

/*
 * The id of the body a snapped point belongs to, or null
 * when the snap did not land on an eligible engineering
 * body. This reads the existing snap candidate; it never
 * searches for one of its own.
 */
function staticsAttachmentId(
    snapCandidate
) {
    const objectId =
        snapCandidate?.objectId;

    if (!objectId) {
        return null;
    }

    const target =
        drawingState.objects.find(
            object =>
                object.id ===
                    objectId
        );

    if (
        !target ||
        !STATICS_ATTACHABLE_FEATURES.includes(
            target.type
        )
    ) {
        return null;
    }

    return target.id;
}

/*
 * The valid placement locations along a body.
 *
 * These are the points a load can start or end at, a moment
 * can be applied, or a support can attach. They are derived
 * from the body's own geometry, so they always sit on the
 * body as it is drawn right now.
 *
 * They are preview-only. They are never added to the feature
 * collection, so they cannot appear in the Feature Tree or be
 * selected on their own.
 */
function bodyPlacementLocations(
    body,
    count
) {
    const g = body.geometry || {};

    const total =
        count || 6;

    if (total < 1) {
        return [];
    }

    /*
     * A span body is divided along its own axis, which is what
     * makes a loaded region read as part of the member.
     */
    if (g.start && g.end) {
        return Array.from(
            { length: total },
            (_, index) => ({
                x:
                    g.start.x +
                    ((g.end.x - g.start.x) *
                        index) /
                        (total - 1 || 1),

                y:
                    g.start.y +
                    ((g.end.y - g.start.y) *
                        index) /
                        (total - 1 || 1)
            })
        );
    }

    /*
     * A located body offers a ring of points around its
     * centre, so a load or a support can be placed on it
     * rather than only at one spot.
     */
    const centre =
        enggFeatureGeometry.centerOf(
            g,
            body.type
        );

    if (!centre) {
        return [];
    }

    const radius =
        body.type === "rigid-body"
            ? Math.max(
                  (g.width || 0) / 2,
                  (g.height || 0) / 2
              )
            : 10;

    return Array.from(
        { length: total },
        (_, index) => {
            const angle =
                (Math.PI * 2 * index) /
                total;

            return {
                x: centre.x + radius * Math.cos(angle),
                y: centre.y + radius * Math.sin(angle)
            };
        }
    );
}

/*
 * The opening instruction for each Statics child tool, so
 * the status line always says what to do next.
 */
function staticsInstruction(
    toolId
) {
    return (
        {
            particle: "Specify particle location",
            "rigid-body": "Specify body location",
            beam: "Specify beam start point",
            truss: "Specify truss start point",
            cable: "Specify cable start point",
            shaft: "Specify shaft start point",

            "point-force": "Specify force start point",

            "distributed-load": "Specify loading start point",
            "varying-distributed-load": "Specify loading start point",

            "applied-moment": "Specify moment location",
            couple: "Specify couple location",

            "pin-support": "Specify support location",
            "roller-support": "Specify support location",
            "fixed-support": "Specify support location",
            "smooth-support": "Specify support location",

            "pin-connection": "Specify connection start point",
            "fixed-connection": "Specify connection start point",
            "slider-connection": "Specify connection start point",

            "reference-point": "Specify reference point location",
            "reference-line": "Specify first point"
        }[toolId] || "Specify location"
    );
}

/*
 * The second-click instruction for the span tools, so a
 * Point Force asks for its endpoint the same way a Line
 * does, rather than borrowing the load wording.
 */
function staticsSpanInstruction(
    toolId
) {
    return (
        {
            "point-force": "Specify force endpoint",
            beam: "Specify beam endpoint",
            truss: "Specify truss endpoint",
            cable: "Specify cable endpoint",
            shaft: "Specify shaft endpoint",

            "distributed-load": "Specify loading end point",
            "varying-distributed-load": "Specify loading end point",

            "pin-connection": "Specify connection end point",
            "fixed-connection": "Specify connection end point",
            "slider-connection": "Specify connection end point",

            "reference-line": "Specify second point"
        }[toolId] || "Specify second point"
    );
}

/*
 * Section headings for the support and connection variants.
 *
 * Every variant is a real feature in its own right, so the
 * Features panel names the one the student placed instead of
 * collapsing them into a single generic Support or Connection
 * heading.
 */
function staticsSupportSection(
    type
) {
    return {
        "pin-support": "PIN SUPPORT",
        "roller-support": "ROLLER SUPPORT",
        "fixed-support": "FIXED SUPPORT",
        "smooth-support": "SMOOTH SUPPORT"
    }[type] || "SUPPORT";
}

function staticsConnectionSection(
    type
) {
    return {
        "pin-connection": "PIN CONNECTION",
        "fixed-connection": "FIXED CONNECTION",
        "slider-connection": "SLIDER CONNECTION"
    }[type] || "CONNECTION";
}

function openCoordinateSystemMenu(button) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML = `
        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-coordinate-mode="2d"
        >
            2D Coordinate System
        </button>

        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-coordinate-mode="3d"
        >
            3D Coordinate System
        </button>
    `;

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    let top =
        buttonRect.top;

    if (
        left + menuRect.width >
        window.innerWidth - margin
    ) {
        left =
            Math.max(
                margin,
                buttonRect.left -
                    menuRect.width -
                    gap
            );
    }

    if (
        top + menuRect.height >
        window.innerHeight - margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.position =
        "fixed";

    menu.style.left =
        `${left}px`;

    menu.style.top =
        `${top}px`;

    menu.style.zIndex =
        "9999";

    menu.querySelectorAll(
        ".drawing-coordinate-submenu-item"
    ).forEach(
        option => {
            option.addEventListener(
                "click",
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const mode =
                        option.dataset
                            .coordinateMode;

                    closeCoordinateSystemMenu();

                    if (mode === "2d") {
                        activate2DCoordinateSystemTool();
                    } else {
                        setToolMessage(
                            "3D Coordinate System is not available on the 2D drawing canvas"
                        );
                    }
                }
            );
        }
    );

    coordinateSystemMenu = menu;
    coordinateSystemMenuAnchor = button;

    button.setAttribute(
        "aria-expanded",
        "true"
    );
}

/*
 * Statics analysis tools.
 *
 * These assist a student's own reasoning rather than
 * solving the problem for them: they report the sums and
 * resolved components of whatever is currently selected,
 * and leave the interpretation to the user. Nothing here
 * invents unknowns or picks a solution.
 */
const STATICS_ANALYSIS_TOOLS = [
    "resultant",
    "force-components",
    "shear-force-diagram",
    "bending-moment-diagram",
    "axial-force-diagram"
];

/*
 * The three diagram tools, named.
 *
 * The key is the diagram's identity, which is what the factory,
 * the renderer, the icon and the Features entry all read. Naming
 * it here rather than deriving it from the tool id keeps the tool
 * a way of asking for a diagram and the diagram itself a thing
 * with an identity of its own.
 *
 * Equilibrium and Moment Analysis are deliberately absent. They
 * read the student's forces and print a verdict, which is a
 * first step into doing the exercise for them.
 */
const ANALYSIS_DIAGRAM_TOOLS = {
    "shear-force-diagram": "shear-force-diagram",
    "bending-moment-diagram": "bending-moment-diagram",
    "axial-force-diagram": "axial-force-diagram"
};

/*
 * The abbreviation each diagram is named and recognised by.
 *
 * "SFD", "BMD" and "AFD" are what a student calls these and what
 * they will search for in the Features panel, so the abbreviation
 * IS the name here - the long form lives in the tool's label and on
 * the template's own heading, where there is room for it.
 */
const ANALYSIS_DIAGRAM_NAMES = {
    "shear-force-diagram": "SFD",
    "bending-moment-diagram": "BMD",
    "axial-force-diagram": "AFD"
};

/*
 * The long heading drawn on the diagram itself.
 *
 * The abbreviation is the feature's NAME - what the Features list and
 * the Feature Tree call it - and the full name is the heading on the
 * drawing, where there is room for it. Two vocabularies, deliberately:
 * a student looking for "SFD" in a list wants the abbreviation, and a
 * reader looking at a sheet wants to know what the diagram is.
 */
const ANALYSIS_DIAGRAM_HEADINGS = {
    "shear-force-diagram": "Shear Force Diagram",
    "bending-moment-diagram": "Bending Moment Diagram",
    "axial-force-diagram": "Axial Force Diagram"
};

/*
 * Selected statics features, or every statics feature when
 * nothing is selected, so a tool still does something
 * useful on a bare diagram.
 */
function selectedStaticsFeatures() {
    const selected =
        drawingState.selection
            .selectedObjectIds;

    return drawingState.objects.filter(
        object =>
            object.engineering?.discipline ===
                "statics" &&
            (selected.length
                ? selected.includes(
                    object.id
                )
                : true)
    );
}

function forcesOf(
    features
) {
    return features.filter(
        object =>
            object.type === "force"
    );
}

/*
 * The BODY an analysis diagram should be read against.
 *
 * A diagram measures a member, so it needs one: a Beam, a Truss, a
 * shaft, a cable, a rigid body - anything that has a span. If a
 * support or a force is selected instead, the body they are attached
 * to is the thing being measured, so their parent is followed; that
 * is what makes "select a support, then SFD" work, which is how a
 * student thinks about a beam they have propped up rather than about
 * the beam as a separate object.
 *
 * Returns null when nothing suitable is selected, which is not an
 * error: a diagram with no source is a valid blank axis to draw a
 * solution against.
 */
function analysisSourceBody(
    features
) {
    const member =
        features.find(
            object =>
                object.type === "beam" ||
                object.type === "truss" ||
                object.type === "shaft" ||
                object.type === "cable" ||
                object.type === "rigid-body"
        );

    if (member) {
        return member;
    }

    /*
     * Nothing that is itself a member, so follow the parent of
     * whatever was selected. Taken from the whole sheet rather than
     * from the selection, because a support the student selected may
     * not be a statics feature in the list the caller was given.
     */
    const child = features[0];

    if (child && child.parentId) {
        return drawingState.objects.find(
            object =>
                object.id === child.parentId
        ) || null;
    }

    return null;
}

function componentOf(
    force
) {
    const radians =
        (Number(force.geometry.angle) || 0) *
        Math.PI /
        180;

    const magnitude =
        Number(force.geometry.magnitude) || 0;

    return {
        x: magnitude * Math.cos(radians),
        y: magnitude * Math.sin(radians)
    };
}

/*
 * Format a number for the status line, trimming pointless
 * decimals while keeping the sign readable.
 */
function formatAmount(
    value
) {
    return Number(value).toFixed(2);
}

/*
 * The name for the next diagram of a given kind.
 *
 * Counted among features of the SAME kind only, so an SFD is "SFD 2"
 * on a sheet that already carries a Beam, a truss and an SFD, rather
 * than picking up a number from features that have nothing to do
 * with it.
 *
 * Both the shared feature type and the name are checked, because a
 * diagram created before the name existed is still a diagram and
 * still occupies a number. Counting only by name would let it
 * reappear as "SFD 1" alongside a diagram that was already SFD 1.
 */
function nextAnalysisDiagramName(
    type
) {
    const prefix =
        ANALYSIS_DIAGRAM_NAMES[type] ||
        type;

    /*
     * Counted by the diagram's OWN kind.
     *
     * Counting the shared feature type instead would number all
     * three diagrams from one running total, so the first BMD on
     * a sheet would arrive as "BMD 2" simply because an SFD
     * existed - which reads as though a diagram had been lost.
     * Each kind counts itself.
     *
     * Both the stored diagramType and the stored name are checked,
     * because a diagram created before the name existed is still a
     * diagram and still occupies a number. Counting only by name
     * would let it reappear as "SFD 1" alongside a diagram that
     * was already SFD 1.
     */
    const used = drawingState.objects.filter(
        object => {
            if (
                object.type !==
                "analysis-diagram"
            ) {
                return false;
            }

            return (
                object.geometry
                    ?.diagramType === prefix ||
                (
                    typeof object.name ===
                        "string" &&
                    object.name.startsWith(
                        `${prefix} `
                    )
                )
            );
        }
    ).length;

    return `${prefix} ${used + 1}`;
}

function beginAnalysisDiagram(
    diagramType
) {
    /*
     * THE SOURCE, AND THE AXIS IT IMPLIES.
     *
     * The diagram is a view of a body, so the body decides what
     * the axis is: its length, its direction, and where it starts.
     * The student is asked for one thing only - how far above or
     * below their drawing the diagram should sit - because that is
     * the one thing the source cannot know and the one thing that
     * is purely presentational.
     *
     * It used to be placed by click-drag across a span, which meant
     * the student was asked to REDEFINE the span the diagram
     * measures. Doing so by hand let the two disagree - drag a
     * diagram narrower than its beam and the stations on it no
     * longer line up with the loads, with nothing to say so. The
     * span is now read from the body and never re-entered.
     *
     * With no body selected there is no span to read, so the tool
     * says what it needs rather than placing an axis that would
     * be a guess. A free-standing axis is still possible - by
     * drawing a Line - but it will not pretend to belong to a
     * member it was never given.
     */
    const source =
        analysisSourceBody(
            selectedStaticsFeatures()
        );

    if (!source) {
        setToolMessage(
            "Select a Beam, Truss or member first - the diagram is measured against it"
        );

        return;
    }

    const span =
        enggAnalysisDependencies.spanOf(
            source
        );

    if (!span) {
        setToolMessage(
            "The selected feature has no span to measure against"
        );

        return;
    }

    /*
     * The interaction, armed but not yet placed.
     *
     * `sourceId` is what the axis is derived from on every frame
     * of the preview and again when it is committed, so the axis
     * is never held as a fixed pair of points that could go stale
     * between now and the click. `placementY` is the one number
     * the cursor owns, and it is the student's answer to "how far
     * below your drawing?".
     */
    enggDrawingState.setInteraction(
        drawingState,
        {
            phase: "analysis-axis",

            analysisKind: diagramType,
            sourceId: source.id,

            /*
             * The starting height is the suggested offset below
             * the source, so the first frame appears somewhere
             * readable rather than on top of the beam.
             */
            placementY:
                span.start.y +
                enggAnalysisDependencies
                    .DEFAULT_ANALYSIS_OFFSET,

            startPoint: null,
            currentPoint: null
        }
    );

    setToolMessage(
        "Move the pointer up or down to position the diagram, then click to place it"
    );

    renderCurrentDrawing();
}

/*
 * THE AXIS THE CURRENT PLACEMENT WOULD PRODUCE.
 *
 * Asked for on every frame, by the preview and again on the click.
 * Deriving it in one place is what guarantees the committed axis
 * is EXACTLY where the preview showed it - there is no second,
 * slightly different calculation for the click to use.
 */
function analysisAxisForPlacement() {
    const interaction =
        drawingState.interaction;

    const source =
        drawingState.objects.find(
            object =>
                object.id ===
                interaction.sourceId
        );

    if (!source) {
        return null;
    }

    return enggAnalysisDependencies
        .axisFromSource(
            source,
            interaction.placementY
        );
}

/*
 * COMMIT THE PLACED AXIS.
 *
 * Creates the real feature from the axis the student was just
 * looking at. The source relationship is recorded here rather than
 * in a general refresh, because this is the one moment the
 * relationship is established - from then on the dependency
 * registry keeps it true by itself.
 */
function commitAnalysisAxis() {
    const interaction =
        drawingState.interaction;

    const axis =
        analysisAxisForPlacement();

    if (!axis) {
        return false;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        enggDrawingState.geometryFactories[
            interaction.analysisKind
        ](
            axis.start,
            axis.end,
            {
                style:
                    drawingState
                        .styleDefaults,

                        name:
                            nextAnalysisDiagramName(
                                interaction.analysisKind
                            )
                    }
                );

    /*
     * The student's chosen height, stored as an offset along the
     * span's normal rather than as a world coordinate.
     *
     * A world y would move the diagram whenever the beam's own
     * height changed - resizing a beam would silently drag a
     * diagram the student had deliberately parked well clear up
     * against it. Measured from the source, the diagram keeps its
     * DISTANCE from the member and its length still follows the
     * span.
     */
    object.geometry.sourceOffset = {
        distance:
            enggAnalysisDependencies
                .verticalOffsetOf(
                    axis,
                    drawingState.objects.find(
                        object =>
                            object.id ===
                            interaction.sourceId
                    )
                )
    };

    /*
     * The confirmed axis is the base a free diagram would be
     * measured from, recorded so a later refresh is idempotent.
     */
    object.geometry.baseAxis = {
        start: { ...axis.start },
        end: { ...axis.end }
    };

    enggAnalysisDependencies
        .registerDependency(
            object,
            [interaction.sourceId]
        );

    enggDrawingState.addObject(
        drawingState,
        object
    );

    /*
     * The stations are mapped now, on commit, rather than when the
     * tool was chosen: the axis has to exist before there is
     * anything to map them onto. The refresh below does it from
     * the source, so the two can never disagree.
     */
    enggDrawingState.refreshAnalysisObjects(
        drawingState
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    renderProperties();
    renderCurrentDrawing();

    setToolMessage(
        "Reference axis placed - draw your diagram against it with the Line and Arc tools"
    );

    return true;
}

/*
 * The metadata every ANALYSIS object is stamped with.
 *
 * Analysis objects are statics features, not geometry, and the
 * Features panel groups by discipline - so without this they
 * were filed under GEOMETRY, next to the lines and rectangles
 * they were derived from. A student looking for their Resultant
 * would have found it in the wrong list entirely, and the panel
 * could not show the Analysis group the specification asks for.
 *
 * `sourceFeatureId` is the important part. A resultant and a
 * force-components pair are READINGS OF a force, not independent
 * marks on the sheet: they depend on the force they came from,
 * they should sit under it in the Feature Tree, and deleting the
 * force should not leave an orphan claiming to describe it. So
 * the relationship is recorded on the object rather than
 * inferred from proximity.
 */
function analysisObjectOptions(
    sources,
    extra
) {
    return {
        ...(extra || {}),
        style: {
            ...drawingState.styleDefaults,
            ...(extra?.style || {})
        },
        engineering: {
            plane: "XY",
            discipline: "statics",
            analysisKind:
                extra?.analysisKind,
            sourceFeatureIds: sources
        }
    };
}

function runStaticsAnalysis(
    toolId
) {
    const features =
        selectedStaticsFeatures();

    const forces =
        forcesOf(features);

    /*
     * A DIAGRAM TEMPLATE NEEDS NO SELECTION.
     *
     * The tools below resolve or combine something the student has
     * already drawn, so they need a selection and must say so. A
     * template is a frame, not a reading of the selection: it is
     * placed by click-drag across whichever span the student
     * chooses, and the reference stations are a convenience
     * carried over IF something is selected.
     *
     * So the requirement is judged per tool rather than as a
     * blanket refusal. An empty diagram with no stations on it is
     * a perfectly good thing to want - it is a blank axis to draw
     * a solution against - and demanding a selection first would
     * forbid it.
     */
    const diagramType =
        ANALYSIS_DIAGRAM_TOOLS[toolId];

    if (diagramType) {
        beginAnalysisDiagram(
            diagramType
        );

        return;
    }

    if (
        !features.length
    ) {
        setToolMessage(
            "Add or select statics features first"
        );

        return;
    }

    if (
        toolId === "resultant"
    ) {
        if (!forces.length) {
            setToolMessage(
                "Resultant needs at least one force"
            );

            return;
        }

        const sum =
            forces.reduce(
                (
                    total,
                    force
                ) => {
                    const part =
                        componentOf(force);

                    return {
                        x: total.x + part.x,
                        y: total.y + part.y
                    };
                },
                { x: 0, y: 0 }
            );

        const magnitude =
            Math.hypot(sum.x, sum.y);

        const angle =
            Math.atan2(sum.y, sum.x) *
            180 /
            Math.PI;

        /*
         * The resultant is PLACED, not just reported.

         * It was previously only written to the status line, which meant the

         * numbers describing it vanished the moment the student moved on.

         * Since these are a real feature, they can be labelled with the

         * existing resultant-value annotation, selected, dimensioned, undone

         * and saved like anything else on the sheet.

         * The arrow is drawn from the common point of the forces it sums, in

         * the summed direction, at a readable length. The VALUE is the sum

         * of the forces the student placed - this does not compute reactions

         * or equilibrium, which is the student's own work (spec 59).
         */
        const anchor = forces[0].geometry.start || forces[0].geometry.position || { x: 0, y: 0 };

        const previousObjects =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        const resultant =
            enggDrawingState.geometryFactories.resultant(
                { x: anchor.x, y: anchor.y },
                {
                    x: anchor.x + sum.x,
                    y: anchor.y + sum.y
                },
                analysisObjectOptions(
                    forces.map(
                        (force) => force.id
                    ),
                    {
                        analysisKind: "resultant",
                        name: "Resultant"
                    }
                )
            );

        enggDrawingState.addObject(
            drawingState,
            resultant
        );

        /*
         * The relationship to the forces it sums, recorded through the
         * registry rather than by hand.
         *
         * Storing the ids is what makes the resultant a READING of
         * those forces rather than a copy of what they were: the
         * registry re-derives the sum from their current values, so
         * moving, retuning or re-aiming any of them updates the
         * resultant with no further code. A resultant that stored only
         * the arrow it drew would keep pointing the way it did when
         * the forces were first placed.
         */
        enggAnalysisDependencies.registerDependency(
            resultant,
            forces.map(
                force => force.id
            )
        );

        enggDrawingState.commitDrawingChange(
            drawingState,
            previousObjects
        );

        renderCurrentDrawing();

        setToolMessage(
            `Resultant of ${forces.length} force${forces.length === 1 ? "" : "s"} placed - add an annotation to label it`


        );
    }

    if (
        toolId === "force-components"
    ) {
        if (!forces.length) {
            setToolMessage(
                "Select a force to resolve"
            );

            return;
        }

        const force =
            forces[0];

        const part =
            componentOf(force);

        /*
         * The resolved components are PLACED, not just reported.

         * As with the resultant, printing Fx and Fy into the status line

         * meant the analysis existed only while the student was looking at

         * it. As a feature it can carry the force-components annotation, be

         * selected, dimensioned and saved.

         * The arrow runs from the force's own point in the direction of the

         * force, so it sits on the thing it describes.

         */
        const origin =
            force.geometry.start ||
            force.geometry.position || {
                x: 0,
                y: 0
            };

        const previousObjects =
            enggDrawingState.snapshotDrawing(
                drawingState
            );



        const resolved =
            enggDrawingState.geometryFactories[
                "force-components"
            ](
                { x: origin.x, y: origin.y },
                {
                    x: origin.x + part.x,
                    y: origin.y + part.y
                },
                analysisObjectOptions(
                    [force.id],
                    {
                        analysisKind: "force-components",
                        name: "Force Components"
                    }
                )
            );

        enggDrawingState.addObject(
            drawingState,
            resolved
        );

        /*
         * The ONE force this is the decomposition OF.
         *
         * Recorded through the registry so the object follows that
         * force for the rest of its life: moving the force carries the
         * components with it, and changing its magnitude or direction
         * re-resolves them. The values drawn at creation are only the
         * first reading.
         */
        enggAnalysisDependencies.registerDependency(
            resolved,
            [force.id]
        );

        enggDrawingState.commitDrawingChange(
            drawingState,
            previousObjects
        );

        renderCurrentDrawing();

        setToolMessage(
            `${force.name} resolved into X and Y - add an annotation to label it`
        );
    }

    if (
        toolId === "moment-analysis"
    ) {
        /*
         * Moments are summed about the first support the
         * student has placed, which is the usual reference
         * point for the calculation, falling back to the
         * origin when there is none.
         */
        const pivotFeature =
            features.find(
                object =>
                    object.type ===
                        "pin-support" ||
                    object.type ===
                        "roller-support" ||
                    object.type ===
                        "fixed-support" ||
                    object.type ===
                        "smooth-support"
            );

        const pivot =
            pivotFeature?.geometry.position || {
                x: 0,
                y: 0
            };

        const total =
            features.reduce(
                (
                    sum,
                    object
                ) => {
                    if (
                        object.type === "moment"
                    ) {
                        const magnitude =
                            Number(
                                object.geometry
                                    .magnitude
                            ) || 0;

                        /*
                         * A clockwise moment counts NEGATIVE here,
                         * because the two senses oppose each other
                         * about the pivot and the whole point of the
                         * sum is to find where they cancel.
                         *
                         * The sense is read through the one shared
                         * reader rather than from the raw field, so
                         * this cannot disagree with the direction the
                         * drawing shows or with what the Features
                         * panel calls it.
                         */
                        return (
                            sum +
                            (momentDirectionOf(
                                object.geometry
                            ) === "CW"
                                ? -magnitude
                                : magnitude)
                        );
                    }

                    if (
                        object.type === "force"
                    ) {
                        const part =
                            componentOf(
                                object
                            );

                        const dx =
                            object.geometry
                                .position.x -
                            pivot.x;

                        const dy =
                            object.geometry
                                .position.y -
                            pivot.y;

                        return (
                            sum +
                            dx * part.y -
                            dy * part.x
                        );
                    }

                    return sum;
                },
                0
            );

        setToolMessage(
            `Sum of moments about ${pivotFeature?.name || "origin"}: ${formatAmount(total)} N·m`
        );

        return;
    }

    if (
        toolId === "equilibrium"
    ) {
        /*
         * Reports how far the current system is from
         * balance. It deliberately does not adjust anything
         * to achieve balance.
         */
        const sum =
            forces.reduce(
                (
                    total,
                    force
                ) => {
                    const part =
                        componentOf(force);

                    return {
                        x: total.x + part.x,
                        y: total.y + part.y
                    };
                },
                { x: 0, y: 0 }
            );

        const balanced =
            Math.abs(sum.x) < 1e-6 &&
            Math.abs(sum.y) < 1e-6;

        setToolMessage(
            balanced
                ? "Selected forces are in equilibrium"
                : `Not balanced: ΣFx ${formatAmount(sum.x)} N, ΣFy ${formatAmount(sum.y)} N`
        );

        return;
    }

    if (
        toolId === "free-body-diagram"
    ) {
        /*
         * Outlines what would appear on a free-body
         * diagram and flags anything still marked Unknown,
         * which is what the student has to resolve.
         */
        const unknowns = [];

        features.forEach(
            object => {
                Object.keys(
                    object.unknownValues || {}
                ).forEach(
                    key => {
                        if (
                            object.unknownValues[
                                key
                            ] === true
                        ) {
                            unknowns.push(
                                `${object.name} ${key}`
                            );
                        }
                    }
                );
            }
        );

        setToolMessage(
            unknowns.length
                ? `${features.length} features · unknown: ${unknowns.join(", ")}`
                : `${features.length} features · no unknowns marked`
        );
    }
}

function renderEngineeringTools(
    category
) {
    const safeCategory =
        engineeringTools[category]
            ? category
            : "GEOMETRY";

    toolHeading.textContent =
        `${safeCategory} TOOLS`;

    if (
        safeCategory ===
            "GEOMETRY" ||
        disciplineToolGroups[safeCategory]
    ) {
        /*
         * GEOMETRY and STATICS are organised into labelled
         * sections; every other discipline stays a flat
         * list of tools.
         */
        const groups =
            safeCategory === "GEOMETRY"
                ? drawingToolGroups
                : disciplineToolGroups[safeCategory];

        toolList.innerHTML =
            groups
                .map(
                    group => `
                        <section
                            class="drawing-tool-group"
                            aria-labelledby="drawing-group-${group.id}"
                        >
                            <h3
                                class="drawing-tool-group-label"
                                id="drawing-group-${group.id}"
                            >
                                ${group.label}
                            </h3>

                            ${group.tools
                                .map(
                                    renderToolButton
                                )
                                .join("")}
                        </section>
                    `
                )
                .join("");
    } else {
        /*
         * Every discipline section leads with Select, so
         * each one can be left cleanly from the same
         * place. The remaining tools are unchanged.
         */
        const disciplineTools = [
            {
                id: "select",
                label: "Select",
                shortcut: "Esc"
            },

            ...engineeringTools[
                safeCategory
            ].map(
                label =>
                    toolDefinitionForLabel(
                        label
                    )
            )
        ];

        toolList.innerHTML =
            disciplineTools
                .map(
                    renderToolButton
                )
                .join("");
    }

    toolList
        .querySelectorAll(
            ".drawing-tool"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    event => {
                        const toolId =
                            button.dataset
                                .toolId;

                        if (
                            toolId ===
                            "coordinate-system"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openCoordinateSystemMenu(
                                button
                            );

                            return;
                        }

                        if (
                            toolId ===
                            "polygon"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openPolygonMenu(
                                button
                            );

                            return;
                        }

                        /*
                         * A Statics category opens its submenu
                         * and does not itself start a drawing
                         * operation; the child item does that.
                         */
                        if (
                            STATICS_TOOL_MENUS[
                                toolId
                            ]
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openStaticsMenu(
                                button,
                                toolId
                            );

                            return;
                        }

                        if (
                            STATICS_ANALYSIS_TOOLS.includes(
                                toolId
                            )
                        ) {
                            event.preventDefault();

                            /*
                             * MOST analysis tools read the current
                             * selection and report, so they never
                             * become the active tool.
                             *
                             * A DIAGRAM TEMPLATE is the exception.
                             * It is not a reading of the selection
                             * but a thing to be placed: a frame the
                             * student draws a solution inside, and
                             * that takes a click-drag exactly like a
                             * Beam. Forcing it back to the Select
                             * tool would leave nothing able to
                             * receive the span, so it is allowed to
                             * become the active tool and go through
                             * the ordinary span construction -
                             * same snapping, same preview, same
                             * Escape and Enter.
                             */
                            const isTemplate =
                                Boolean(
                                    ANALYSIS_DIAGRAM_TOOLS[
                                        toolId
                                    ]
                                );

                            if (isTemplate) {
                                enggDrawingState.setActiveTool(
                                    drawingState,
                                    toolId
                                );

                                beginAnalysisDiagram(
                                    ANALYSIS_DIAGRAM_TOOLS[
                                        toolId
                                    ]
                                );
                            } else {
                                enggDrawingState.setActiveTool(
                                    drawingState,
                                    "select"
                                );

                                runStaticsAnalysis(
                                    toolId
                                );
                            }

                            renderEngineeringTools(
                                activeCategory()
                            );

                            renderCurrentDrawing();
                            return;
                        }

                        if (
                            toolId ===
                            "arc"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openArcMenu(
                                button
                            );

                            return;
                        }

                        activateTool(
                            toolId
                        );
                    }
                );
            }
        );
}

function setToolMessage(
    message
) {
    drawingToolMessage.textContent =
        message;
}

function activate2DCoordinateSystemTool() {
    enggDrawingState.setActiveTool(
        drawingState,
        "coordinate-system-2d"
    );

    drawingState.interaction.phase =
        "idle";

    setToolMessage(
        "Specify origin"
    );

    renderEngineeringTools(
        activeCategory()
    );

    renderCurrentDrawing();
}

function activateTool(
    toolId
) {
    if (
        toolId ===
        "coordinate-system"
    ) {
        openCoordinateSystemMenu(
            toolList.querySelector(
                '[data-tool-id="coordinate-system"]'
            )
        );

        return;
    }

    /*
     * Choosing Select always abandons whatever the
     * previous tool was doing, so a half-finished
     * operation can never be left running underneath.
     */
    if (
        toolId === "select"
    ) {
        closePolygonSidesPrompt();

        clearGlobalToolHighlight();

        enggDrawingState.clearInteraction(
            drawingState
        );

        drawingState.selection
            .boxSelectionIds = [];

        enggDrawingState.setActiveTool(
            drawingState,
            "select"
        );

        setToolMessage(
            "Select geometry"
        );

        renderEngineeringTools(
            activeCategory()
        );

        renderCurrentDrawing();
        return;
    }

    /*
     * Re-clicking the active tool cancels it, so the user is
     * never stuck inside it. Tools that place a feature are
     * the exception: once one has been committed the
     * operation is finished, so re-clicking simply keeps them
     * armed for placing another one.
     *
     * A body-attached tool counts as a placement tool, because
     * it too ends by creating a feature rather than by
     * finishing a drawing. Without this, picking a second
     * attached tool while the first is still active would
     * toggle it off instead of switching to it.
     */
    const isPlacementTool =
        Boolean(
            STATICS_PLACEMENT_TOOLS[
                toolId
            ]
        ) ||
        isBodyAttachedTool(toolId) ||
        toolId === "truss" ||
        toolId === "point";

    const nextTool =
        drawingState.activeTool ===
                toolId &&
            !isPlacementTool
            ? "select"
            : toolId;

    /*
     * Picking any tool from the geometry list ends any
     * running Modify or View tool.
     */
    cancelModifySession();
    clearGlobalToolHighlight();

    closePolygonSidesPrompt();

    enggDrawingState.setActiveTool(
        drawingState,
        nextTool
    );

    /*
     * A freshly activated tool gets its own opening
     * instruction; otherwise the previous tool's
     * instruction would linger.
     */
    setToolMessage(
        initialToolMessage(
            nextTool
        )
    );

    renderEngineeringTools(
        activeCategory()
    );

    renderCurrentDrawing();
}

/*
 * The instruction a tool should show the moment it is
 * activated, so stale messages never carry over.
 */
function initialToolMessage(
    toolId
) {
    /*
     * The two dimension tools open by asking for the thing to be
     * measured, and differ only in what they do once it is chosen.
     * Saying so up front is what stops a student pressing D and
     * waiting for a number that was never going to appear.
     */
    /*
     * The annotation tool says BOTH of its uses up front, because the
     * student has to know that clicking a feature and clicking empty
     * space are different actions before they try one of them.
     */
    if (
        isAnnotationTool(toolId)
    ) {
        return "Click a feature to label it, or empty space for a note";
    }

    if (
        isDimensionTool(toolId)
    ) {
        return toolId === "smart-dimension"
            ? "Select a feature - the measurement is chosen for you"
            : "Select a feature - then D to change what is measured";
    }

    /*
     * A Statics tool carries its own opening instruction, so
     * a direct tool like Point Force tells the student what to
     * click next without opening a popup first.
     */
    if (
        isBodyAttachedTool(toolId)
    ) {
        /*
         * A body-attached feature begins by asking for the body
         * it acts on, rather than letting the student place it
         * in free space and attach it afterwards.
         */
        return staticsBodyMessage(toolId, 0);
    }

    if (
        STATICS_CHILD_TOOLS[toolId]
    ) {
        return staticsInstruction(
            toolId
        );
    }

    return (
        {
            select: "Select geometry",
            point: "Specify point",
            line: "Specify line start point",
            polyline: "Specify first point",
            triangle: "Specify first point",
            circle: "Specify centre point",
            rectangle: "Specify first corner",
            pan: "Drag to pan the view"
        }[toolId] || "Ready"
    );
}

function updateHistoryControls() {
    drawingUndo.disabled =
        !enggDrawingState.canUndo(
            drawingState
        );

    drawingRedo.disabled =
        !enggDrawingState.canRedo(
            drawingState
        );
}

function performUndo() {
    if (
        enggDrawingState.undo(
            drawingState
        )
    ) {
        renderProperties();
        renderCurrentDrawing();
        setToolMessage(
            "Ready"
        );
    }
}

function performRedo() {
    if (
        enggDrawingState.redo(
            drawingState
        )
    ) {
        renderProperties();
        renderCurrentDrawing();
        setToolMessage(
            "Ready"
        );
    }
}

function canvasPointFromEvent(
    event,
    shouldSnap = false
) {
    const bounds =
        drawingCanvas.getBoundingClientRect();

    const width =
        drawingCanvas.clientWidth;

    const height =
        drawingCanvas.clientHeight;

    return enggDrawingState.screenToEngineering(
        {
            x:
                event.clientX -
                bounds.left,

            y:
                event.clientY -
                bounds.top
        },
        {
            width,
            height
        },
        drawingState,
        shouldSnap
    );
}

/*
 * THE DIMENSION TOOLS
 *
 * Dimension and Smart Dimension are ONE tool with two different
 * answers to a single question: what is being measured?
 *
 * Smart Dimension reads the selection and decides - a circle becomes a
 * diameter because that is what a circle's size is normally quoted as.
 * Dimension asks instead, cycling through the measurements the selected
 * geometry actually supports, so a student who wants a beam quoted
 * vertically rather than horizontally gets that without the program
 * having to guess what they meant.
 *
 * Neither tool decides the MEASUREMENT TYPE in a way that bypasses the
 * feature's own registration. Both ask measurement-core what the
 * selection can be measured as, which is why a Beam offers a span and
 * a Circle offers a diameter, and why adding a new feature type later
 * needs no change here at all.
 *
 * The lifecycle is deliberately short, and every part of it is
 * temporary:
 *
 *   1. click a feature     -> armed, with the measurements it supports
 *   2. press D / Tab       -> move to the next measurement
 *   3. move the cursor     -> live preview at the cursor
 *   4. click               -> the dimension is committed
 *   Escape                 -> all of it discarded, nothing saved
 *
 * Nothing is written to the drawing until step 4, which is what makes
 * Escape safe: there is no partial dimension to clean up.
 */

/*
 * THE ANNOTATION TOOL
 *
 * Creates the annotation the student actually wants, which depends on
 * what they click:
 *
 *   - a FEATURE gives an ASSOCIATIVE label that reads its own values and
 *     goes on reading them, so a force labelled once keeps up with the
 *     force however it is later edited (spec 32);
 *   - EMPTY SPACE gives a FREE-TEXT note, which belongs to nothing and
 *     is the student's own writing (spec 34).
 *
 * The kinds offered for a feature are asked of the annotation model,
 * which answers by what that feature can actually be labelled as -
 * never from a list written here - so a new feature type is labelled
 * correctly without this file knowing it exists.
 *
 * The lifecycle matches the Dimension tool's exactly: click to arm, move
 * to position with a live preview, click to commit, Escape to abandon.
 * Nothing is written to the drawing until that last click, which is what
 * makes Escape safe - there is no partial annotation to clean up.
 */

/*
 * Is this the annotation tool?
 */
function isAnnotationTool(
    toolId
) {
    return toolId === "annotation";
}

/*
 * A short description of what the tool has recognised, for the message
 * that tells the student before they commit.
 */
function annotationKindLabel(
    kind
) {
    return (
        window.enggAnnotationModel.KINDS?.[
            kind
        ]?.label ||
        kind
    );
}

/*
 * Arm a note: the student's own text, belonging to nothing.
 *
 * Armed rather than committed because the text is not written yet - it
 * is asked for once the note is placed, and Escape before that leaves no
 * note at all.
 */
function armFreeTextAnnotation(
    point
) {
    enggDrawingState.setInteraction(
        drawingState,
        {
            annotationKind: "free-text",
            annotationKinds: ["free-text"],
            annotationTarget: null,
            annotationPlacement: {
                x: point.x,
                y: point.y
            }
        }
    );

    setToolMessage(
        "Note - move to place, click to confirm, Esc to cancel"
    );

    renderCurrentDrawing();
}

/*
 * Commit the armed annotation as a real feature.
 *
 * Goes through the feature factory like every other creation, so the
 * note or label is named, numbered, selected, undone and saved by the
 * same code as everything else. It is a feature on the drawing, not
 * text painted over one.
 *
 * A generated label is placed WITHOUT a leader and left selected, so
 * the student can drag it somewhere useful straight away. The leader is
 * not imposed: a label beside its feature needs none, and one that
 * reaches across the drawing would be the tool's opinion rather than
 * theirs. It can be turned on afterwards.
 */
function commitAnnotation(
    point
) {
    const interaction =
        drawingState.interaction;

    const kind = interaction.annotationKind;

    const sourceFeatureId =
        interaction.annotationTarget || null;

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        window.enggDrawingState.geometryFactories
            .annotation({
                kind,
                sourceFeatureId,
                position: {
                    x: point.x,
                    y: point.y
                },
                leader: {
                    enabled: false
                }
            });

    /*
     * A note is written by the student, so it starts empty and waits
     * for them. A generated label already knows its text and is never
     * asked for one - editing a derived value would let the drawing
     * claim something its feature does not say.
     */
    if (kind === "free-text") {
        object.text = "";
    }

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

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        sourceFeatureId
            ? "Label placed - it will follow its feature"
            : "Note placed - double-click to write it"
    );

    renderProperties();
    renderCurrentDrawing();

    return object;
}

/*
 * A click while the annotation tool is active.
 *
 * Two clicks, exactly like the Dimension tool: the first chooses WHAT is
 * being labelled, the second says WHERE the label goes.
 */
function handleAnnotationClick(
    resolution,
    event
) {
    const point =
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
     * ARMED: this click says where the label goes.
     */
    if (interaction.annotationKind) {
        commitAnnotation(point);

        return;
    }

    /*
     * NOT ARMED: what is being labelled?
     *
     * A feature under the cursor becomes an associative label. Clicking
     * empty space becomes a note, which is the common case for prose and
     * so must not be hidden behind a requirement to select something
     * first.
     */
    const feature =
        findDimensionTarget(point);

    if (!feature) {
        armFreeTextAnnotation(point);

        return;
    }

    const kinds =
        window.enggAnnotationModel.kindsFor(
            feature,
            drawingState
        ) || [];

    if (kinds.length === 0) {
        setToolMessage(
            "Nothing about that feature can be labelled - click empty space for a note"
        );

        renderCurrentDrawing();

        return;
    }

    enggDrawingState.setInteraction(
        drawingState,
        {
            annotationKind: kinds[0],
            annotationKinds: kinds,
            annotationTarget: feature.id,
            annotationTargetName:
                featureNameOf(feature),
            annotationPlacement: {
                x: point.x,
                y: point.y
            }
        }
    );

    setToolMessage(
        `${annotationKindLabel(kinds[0])} for ${featureNameOf(feature)} - move to place, click to confirm, D to change, Esc to cancel`
    );

    renderCurrentDrawing();
}

/*
 * Move to the next label the feature can carry.
 *
 * The same key as the Dimension tool's, for the same reason: one key
 * learned once, and the cycle in the same place.
 */
function cycleAnnotationKind() {
    const interaction =
        drawingState.interaction;

    const kinds =
        interaction.annotationKinds;

    if (
        !Array.isArray(kinds) ||
        kinds.length === 0
    ) {
        return false;
    }

    const current = kinds.indexOf(
        interaction.annotationKind
    );

    const next =
        kinds[(current + 1) % kinds.length];

    enggDrawingState.setInteraction(
        drawingState,
        {
            annotationKind: next
        }
    );

    setToolMessage(
        `${annotationKindLabel(next)} for ${interaction.annotationTargetName} - move to place, click to confirm, D to change, Esc to cancel`
    );

    renderCurrentDrawing();

    return true;
}

/*
 * Is nothing in mid-construction?
 *
 * A double-click means "open this" only when there is no construction
 * to finish. While a line, a truss or a load is being built, the
 * double-click belongs to that construction and must not be stolen by
 * an editing gesture.
 *
 * Named for what it is FOR - deciding whether an edit gesture is
 * allowed - rather than as a general "is busy" test, because the
 * conditions that matter here are specifically the ones that make a
 * double-click ambiguous.
 */
function isIdleForEditing() {
    /*
     * A phase other than idle means something is being constructed.
     * The one exception is a phase that is set but has no work in it -
     * the distributed-load and statics-span phases are only entered
     * once a first point exists, so their emptiness is itself the
     * signal that nothing is pending.
     */
    return (
        drawingState.interaction
                .phase === "idle" ||
        isLoadBuildPhase(drawingState.interaction) ||
        isLoadSpanPhase(drawingState.interaction)
    );
}

/*
 * Is this one of the two dimension tools?
 */
function isDimensionTool(
    toolId
) {
    return (
        toolId === "dimension" ||
        toolId === "smart-dimension"
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
function dimensionDescriptorsFor(
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
 * A short name for a measurement, for the message that tells the
 * student what the tool has recognised.
 */
function dimensionChoiceLabel(
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
function dimensionChoiceMessage(
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
function featureNameOf(
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
function dimensionChoiceLabel(
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
function commitDimension(
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
        !window.enggDimensions.isCalibrated(
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

        window.enggScaleCalibration.open({
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
                window.enggDimensions.readScale(
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

                window.enggDimensions.calibrate(
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

    const object =
        enggDrawingState.geometryFactories
            .dimension({
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
function findDimensionTarget(
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

        let anchors = null;

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
                        name =>
                            enggMeasurement.resolveAnchor(
                                object,
                                name
                            )
                    );
        } catch (error) {
            anchors = null;
        }

        const points = Object.values(
            anchors || {}
        ).filter(
            anchor =>
                anchor &&
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
         * So a click that falls within the outline the feature's own
         * anchors describe counts as a hit on it. Anchors are used
         * rather than a bounding box because they are the shape the
         * feature actually has: a rotated rectangle's anchors bound the
         * tilted body, while its bounding box would claim a much
         * larger area that belongs to nothing.
         */
        if (
            points.length >= 3 &&
            pointInsideOutline(
                point,
                points
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
 * Is a point inside the outline its anchors describe?
 *
 * Used only to decide what the student clicked, never to measure
 * anything, so a plain crossing count is enough and an exact answer
 * is not required.
 */
/*
 * How far a point is from a LINE SEGMENT.
 *
 * Distance to an infinite line would be wrong near the ends: a click

 * just past the tip of a force arrow would measure zero to a line that

 * runs on past it, and would pick a feature the pointer is nowhere near.

 * Clamping the projection to the segment avoids that, which is the same

 * reason a hit test uses the segment rather than the line.

 */
function distanceToSegment(
    point,
    from,
    to
) {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;

    const lengthSquared =
        deltaX * deltaX + deltaY * deltaY;

    /*
     * A segment of no length - two coincident anchors - is a point, and

     * is measured as one.

     */
    if (lengthSquared < 1e-12) {
        return Math.hypot(
            point.x - from.x,
            point.y - from.y
        );
    }

    const t = Math.max(
        0,
        Math.min(
            1,
            ((point.x - from.x) * deltaX +
                (point.y - from.y) * deltaY) /
                lengthSquared
        )
    );

    return Math.hypot(
        point.x - (from.x + t * deltaX),
        point.y - (from.y + t * deltaY)
    );
}

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

/*
 * A click while the dimension tool is active.
 *
 * First click arms the measurement, second click places it. Both clicks
 * go through the pointer's resolved point, so the placement snaps to
 * the same targets as every other tool rather than to a private set.
 */
function handleDimensionClick(
    resolution,
    event
) {
    /*
     * The point is taken from the SNAPSHOT when there is one and from
     * the pointer directly when there is not.
     *
     * A dimension is not a construction tool, so the shared pointer
     * resolver never builds a construction point for it and
     * `effectiveConstructionPoint` is undefined. Reading only that
     * meant every click returned early and silently: the tool looked
     * armed, the status line never changed, and nothing was ever
     * dimensioned. The same click coordinates every other tool uses,
     * converted here, fix it without special-casing the resolver.
     */
    const point =
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
     * ARMED: the student is choosing where the dimension sits, and
     * this click commits it.
     *
     * The measurement is re-read at this moment rather than reused
     * from when it was armed, so the value stored is always the value
     * of the geometry as it is NOW.
     */
    if (
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

    /*
     * NOT ARMED: this click chooses WHAT to measure.
     *
     * Two things are resolved, in order:
     *
     *   1. whatever is already selected, when two things are selected
     *      - the selection IS the pair, and re-deriving it from the
     *      cursor would throw away the deliberate act of selecting
     *      two features to compare;
     *   2. otherwise, the feature under the cursor.
     *
     * The cursor answer is checked FIRST for a single selection, so
     * clicking a second feature while one is already selected measures
     * the two together rather than jumping to whatever happens to be
     * nearby. A second click on empty canvas is how the student
     * commits to that pair.
     */
    const selected =
        (drawingState.selection
            ?.selectedObjectIds || [])
            .map((id) =>
                objectWithId(id)
            )
            .filter(Boolean);

    const underCursor =
        findDimensionTarget(point);

    const chosen =
        selected.length === 2
            ? selected
            : underCursor
                ? [underCursor]
                : selected;

    const descriptors =
        dimensionDescriptorsFor(chosen);

    if (descriptors.length === 0) {
        setToolMessage(
            chosen.length === 2
                ? "Nothing to measure between those two features"
                : chosen.length === 1
                  ? "That feature has nothing to dimension - try selecting two features"
                  : "Select a feature to dimension"
        );

        renderCurrentDrawing();

        return;
    }

    /*
     * Both tools start on the first candidate. Smart Dimension stops
     * there, because choosing for the student is its whole purpose;
     * Dimension also starts there but lets the student cycle away
     * with D when that is not the measurement they meant.
     */
    const choice = descriptors[0];

    if (!choice?.refs?.length) {
        setToolMessage(
            "That measurement cannot be built from this selection"
        );

        return;
    }

    enggDrawingState.setInteraction(
        drawingState,
        {
            dimensionChoice:
                choice.dimensionType,
            dimensionTarget:
                chosen[0]?.id || null,
            dimensionTargets:
                chosen.map(
                    (object) => object.id
                ),
            dimensionCandidates:
                descriptors,
            dimensionRefs: choice.refs,
            dimensionPlacement: {
                x: point.x,
                y: point.y
            }
        }
    );

    setToolMessage(
        dimensionChoiceMessage(
            choice,
            chosen
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
function objectWithId(
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
function cycleDimensionChoice() {
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

function isConstructionTool(
    toolId
) {
    /*
     * Statics placement and span tools are listed here too,
     * so they run through the same construction pipeline
     * as geometry and pick up snapping and inference.
     */
    return (
        [
            "point",
            "line",
            "polyline",
            "triangle",
            "polygon",
            "circle",
            "arc",
            "rectangle"
        ].includes(toolId) ||
        Boolean(STATICS_PLACEMENT_TOOLS[toolId]) ||
        Boolean(STATICS_BODY_ATTACHED_TOOLS[toolId]) ||
        toolId === "truss" ||
        toolId === "distributed-load" ||
        isVaryingLoadTool(toolId) ||
        Boolean(STATICS_SPAN_TOOLS[toolId])
    );
}

/*
 * Is this click a selection of something that already exists?
 *
 * The decision is made from the INTERACTION STATE and a hit test, not
 * from the active tool. That is the important structural point: there
 * is no list of tools that are allowed to select, so a tool added
 * later is universally selectable the day it is written rather than
 * the day someone remembers to add it to a list.
 *
 *   - A construction is RUNNING      -> no. The click is one of its
 *     own points and belongs to it.
 *   - Nothing under the pointer       -> no. The tool's own handling
 *     deals with empty space.
 *   - Otherwise, something is there   -> yes, and it is selected.
 *
 * WHY A RUNNING CONSTRUCTION ALWAYS WINS
 * -------------------------------------
 * A half-built Beam is waiting for its second point. A click anywhere
 * - including on a feature - is that second point, and taking it for a
 * selection would leave the construction stranded and start an
 * unrelated operation in the middle of it.
 *
 * This is the case that makes universal selection safe rather than
 * reckless, and it is decided by asking the interaction what state it
 * is in. Every multi-click construction in the application - a truss, a
 * distributed load, a statics attachment, a line, a rectangle, an arc
 * - is mid-flight exactly when `phase` is something other than "idle",
 * so one question covers all of them and none can be missed by being
 * absent from a list.
 *
 * The corollary is deliberate: once the construction is committed and
 * the tool is still active, a click on an existing feature selects it.
 * That is what stops a student who has just finished a Moment from
 * starting a second one when they meant to grab the first.
 */
function shouldClickSelectExistingObject(
    event
) {
    const toolId =
        drawingState.activeTool;

    if (!toolId) {
        return false;
    }

    /*
     * No construction running.
     *
     * Note this is the ONLY exemption. It is deliberately not
     * "exempt the tools that take several clicks", because that list
     * would have to be maintained by hand and would inevitably fall
     * behind - and a tool wrongly exempted is a tool the student
     * cannot select anything with.
     */
    if (
        drawingState.interaction.phase !==
        "idle"
    ) {
        return false;
    }

    /*
     * The point the student actually clicked, not the snapped one.
     *
     * A snap may legitimately pull the cursor to a nearby feature the
     * student did not mean - that is what snapping is for - and
     * acting on the snapped point here would select a force when the
     * student clicked through it. The construction tools still receive
     * the snapped point, unchanged; this question is only about what
     * lies under the pointer.
     */
    const point =
        canvasPointFromEvent(
            event,
            false
        );

    if (!point) {
        return false;
    }

    /*
     * Is there an existing feature here at all?
     *
     * If there is not, the click belongs to the tool: it continues a
     * construction, places a dimension, arms an annotation. Returning
     * false hands it straight over.
     */
    return Boolean(
        objectAtPoint(point)
    );
}
/*
 * Statics tools that are placed with a single click.
 *
 * Derived from STATICS_CHILD_TOOLS so a tool listed in a
 * submenu always has a creation path and can never be
 * silently unhandled.
 */
const STATICS_SINGLE_CLICK_TOOLS = [
    "particle",
    "rigid-body",
    "couple",
    "pin-support",
    "roller-support",
    "fixed-support",
    "smooth-support",
    "reference-point"
];

const STATICS_PLACEMENT_TOOLS = Object.fromEntries(
    STATICS_SINGLE_CLICK_TOOLS.map(id => [
        id,
        STATICS_CHILD_TOOLS[id] || {
            label: id,
            type: id
        }
    ])
);

/*
 * Tools that span two points, so they need a second click.
 */
const STATICS_SPAN_TOOLS = {
    "point-force": "Point Force",
    beam: "Beam",
    cable: "Cable",
    shaft: "Shaft",

    "pin-connection": "Pin Connection",
    "fixed-connection": "Fixed Connection",
    "slider-connection": "Slider Connection",

    /*
     * The three analysis diagrams are DELIBERATELY NOT HERE.
     *
     * They used to be placed between two clicks like a Beam, which
     * asked the student to re-enter the span their diagram measures.
     * A diagram is a view of a body that is already drawn: its axis
     * length and direction come from that body, and asking for them
     * again meant the two could be made to disagree - drag an axis
     * narrower than its beam and every station on it silently stops
     * lining up with the load it came from.
     *
     * They are now placed by moving the pointer up and down and
     * clicking, which is one decision instead of four coordinates, and
     * the only decision that is actually the student's to make.
     */
    "reference-line": "Reference Line"
};

/*
 * The Statics spans whose SECOND point snaps to their first.
 *
 * Every span tool is placed between two clicks, so in principle all of
 * them could align to their first point. Beam, Cable and Shaft are
 * listed because they are the ones whose second point positions a body
 * whose alignment the student is really asking about, and they are the
 * tools this behaviour was added for.
 *
 * The connections and Reference Line are deliberately NOT here. They
 * place a symbol at a point rather than a body between two, and their
 * alignment is not something the student has been shown to expect.
 * They keep exactly the snapping they had. Adding them is a one-line
 * change here if that is ever wanted, and nothing else would move.
 */
const STATICS_SPAN_SNAP_TOOLS = [
    "beam",
    "cable",
    "shaft"
];

/*
 * The stages a Truss is built in.
 *
 * A truss is a structure, not a span, so it is constructed the
 * way a structure is: a base line, then the outer shape that
 * encloses it, then the members inside. Each stage reuses the
 * ordinary Line interaction, so the snapping and the inference
 * are the same ones every other line uses.
 */
const TRUSS_STAGES = [
    {
        id: "base",
        prompt: "Specify base start point",
        followUp: "Specify base endpoint"
    },
    {
        id: "outer",
        prompt: "Construct outer shape"
    },
    {
        id: "internal",
        prompt: "Construct internal connectors"
    }
];

/*
 * The hint shown while a truss is being built.
 *
 * A truss is finished by double-clicking, so the prompt says
 * so on every member rather than only on the last one: the
 * student can keep adding members for as long as they want
 * and nothing is committed until they say so.
 */
const TRUSS_CONSTRUCT_HINT =
    "Click to add a member, double-click to finish the truss";

/*
 * A member of a truss that is being built.
 *
 * Construction members are temporary: they exist only while the
 * truss is being drawn and become the one Truss feature on
 * completion.
 */
function trussMember(
    start,
    end
) {
    return {
        start: { ...start },
        end: { ...end }
    };
}

/*
 * Every point in a truss construction, in order.
 *
 * These are the joints. A member endpoint that lands on one of
 * them is connected, and a floating endpoint that lands on none
 * is what makes the structure invalid.
 */
function trussJoints(
    members
) {
    return members.flatMap(member => [
        member.start,
        member.end
    ]);
}

/*
 * Whether a point matches a joint closely enough to be one.
 *
 * The tolerance is in world units and scales with the zoom, so
 * a snap reads the same however far the drawing is zoomed in or
 * out.
 */
function trussJointMatches(
    a,
    b
) {
    if (
        !a ||
        !b ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(b.x)
    ) {
        return false;
    }

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
            drawingState.camera.zoom ||
        1;

    return (
        Math.hypot(a.x - b.x, a.y - b.y) *
            scale <=
        8
    );
}

/*
 * Whether every member belongs to one connected structure.
 *
 * Connectivity is checked by flood fill from the first member:
 * a member is part of the truss when it shares a joint with a
 * member already reached. Anything the fill never reaches is
 * floating, which is what a member drawn away from the rest of
 * the structure is.
 *
 * This is a real topological test rather than a count, so a
 * member that merely overlaps another one is still caught.
 */
function trussIsConnected(
    members
) {
    if (!members.length) {
        return false;
    }

    const reached = [members[0]];

    let grew = true;

    while (grew) {
        grew = false;

        members.forEach(member => {
            if (reached.includes(member)) {
                return;
            }

            const joins =
                reached.some(other =>
                    trussMembersTouch(other, member)
                );

            if (joins) {
                reached.push(member);
                grew = true;
            }
        });
    }

    return reached.length === members.length;
}

/*
 * Whether two members share a joint.
 *
 * A member connects to another when one member's end meets the
 * other's end. Overlapping middles are not a connection, because
 * a structural joint is at a joint.
 */
function trussMembersTouch(
    a,
    b
) {
    return [a.start, a.end].some(point =>
        [b.start, b.end].some(other =>
            trussJointMatches(point, other)
        )
    );
}

/*
 * Whether a point lies inside the closed outline the student drew.
 *
 * A crossing ray test: a point is inside a closed outline when a
 * ray cast from it crosses the outline an odd number of times.
 * It is what keeps an internal member from leaving the boundary
 * the student established.
 */
function trussPointInsideOutline(
    point,
    outline
) {
    if (
        !point ||
        !outline ||
        outline.length < 3
    ) {
        return false;
    }

    let inside = false;

    for (
        let i = 0, j = outline.length - 1;
        i < outline.length;
        j = i, i += 1
    ) {
        const a = outline[i];
        const b = outline[j];

        if (
            (a.y > point.y) !== (b.y > point.y) &&
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

/*
 * Snap a point that is being placed onto the truss's own joints.
 *
 * The ordinary Snap already finds the endpoints of a Line, so
 * this only has to recognise that an endpoint landing on an
 * existing truss joint is a connection rather than a new loose
 * point. It never searches for a snap of its own.
 */
function trussSnapToJoint(
    point,
    members
) {
    const joints = trussJoints(members);

    const match = joints.find(joint =>
        trussJointMatches(point, joint)
    );

    return match
        ? { x: match.x, y: match.y }
        : point;
}

/*
 * The instruction the Truss shows at each construction stage.
 */
function trussStageMessage(
    interaction
) {
    const stage =
        interaction.trussStage;

    const stageInfo =
        TRUSS_STAGES[stage];

    /*
     * The base needs two points before it is a member, so it
     * says which end it is waiting for.
     *
     * A member already in progress counts as a point placed, so
     * the prompt asks for the END of that member rather than
     * its start. Without this the instruction contradicted the
     * drawing: a member was visibly being drawn from its start,
     * yet the status line still asked for the start.
     */
    if (
        stage === 0 &&
        !interaction.trussInProgress &&
        !(
            interaction.trussMembers || []
        ).length
    ) {
        return TRUSS_STAGES[0].prompt;
    }

    if (
        stage === 0 &&
        (
            interaction.trussMembers || []
        ).length < 1
    ) {
        return TRUSS_STAGES[0].followUp;
    }

    if (stage === 1) {
        return (
            "Construct outer shape — " +
            TRUSS_CONSTRUCT_HINT
        );
    }

    if (stage === 2) {
        return (
            "Construct internal connectors — " +
            TRUSS_CONSTRUCT_HINT
        );
    }

    return stageInfo?.prompt ||
        "Construct outer shape";
}

/*
 * The live geometry of an unfinished truss, for the snap
 * system.
 *
 * The members placed so far are published as real segments, so
 * a new member snaps to a joint, an endpoint or an intersection
 * of the structure already built. The member in progress is
 * published too, so a click can land back on the segment being
 * drawn and close a loop without hunting for it.
 *
 * This is not a second snapping implementation: it hands the
 * ordinary snap system the construction's own geometry and lets
 * it do exactly what it does for the rest of the drawing.
 */
function trussSnapGeometry(
    interaction
) {
    const geometry = [
        ...(interaction?.trussMembers || [])
            .map(member => ({
                start: member.start,
                end: member.end
            }))
    ];

    const inProgress =
        interaction?.trussInProgress;

    if (inProgress) {
        geometry.push({
            start: inProgress,
            end:
                interaction?.currentPoint ||
                inProgress
        });
    }

    return geometry;
}

/*
 * Advance a truss construction by one placed point.
 *
 * The base is the first member. After it, each click either
 * continues the member in progress or starts the next one, so
 * the whole outline and then all the internal members are drawn
 * with the same click-drag-click rhythm as a line.
 *
 * An internal member may not leave the outline the student drew,
 * so a point outside it is rejected and the previous point is
 * kept instead.
 */
function continueTrussConstruction(
    resolution
) {
    const interaction =
        drawingState.interaction;

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const stage = interaction.trussStage ?? 0;

    const members =
        interaction.trussMembers || [];

    const outline =
        interaction.trussOutline || [];

    const inProgress = point
        ? interaction.trussInProgress
        : null;

    /*
     * A snap that lands on an existing truss joint is treated as
     * a connection, so the member meets the structure exactly
     * rather than ending a hair away from it.
     */
    const resolved = trussSnapToJoint(
        point,
        members
    );

    if (!inProgress) {
        /*
         * The next member starts where the previous one ended,
         * unless the student clicks a joint that already exists.
         *
         * A truss is a chain of members meeting at joints, so
         * continuing from the free end is what makes the
         * structure build itself as the student traces it. A
         * click on an existing joint instead starts a member
         * from that joint, which is how a diagonal or a closing
         * member is added to a structure already partly built.
         */
        const freeEnd =
            members.length
                ? members[
                    members.length - 1
                ].end
                : null;

        const connectsToJoint =
            freeEnd &&
            !trussJointMatches(
                resolved,
                freeEnd
            ) &&
            trussJoints(members).some(
                joint =>
                    trussJointMatches(
                        resolved,
                        joint
                    )
            );

        const anchor =
            !freeEnd ||
            trussJointMatches(resolved, freeEnd) ||
            connectsToJoint
                ? resolved
                : freeEnd;

        if (
            freeEnd &&
            trussJointMatches(resolved, freeEnd)
        ) {
            /*
             * The click landed back on the free end, so the
             * anchor is that joint and the student carries on
             * from where the structure currently ends.
             */
        }

        enggDrawingState.setInteraction(
            drawingState,
            {
                ...resolution,
                phase: "truss-construct",
                startPoint: anchor,
                currentPoint: anchor,
                trussStage: stage,
                trussMembers: members,
                trussOutline: outline,
                trussInProgress: anchor,

                snapGeometry:
                    trussSnapGeometry({
                        trussMembers: members,
                        trussInProgress: resolved,
                        currentPoint: resolved
                    }),

                /*
                 * Quarter regions belong to the Truss alone, so
                 * a Truss under construction declares that its
                 * own live geometry offers them. A panel drawn
                 * now can therefore snap to a quarter of a panel
                 * drawn a moment ago, rather than only to the
                 * finished drawing around it.
                 */
                snapQuarterSnap: true,
                snapToolId: "truss"
            }
        );

        setToolMessage(
            trussStageMessage(
                drawingState.interaction
            )
        );

        renderCurrentDrawing();
        return;
    }

    const nextMembers = [
        ...members,

        /*
         * A member of zero length is not a member. It is what a
         * double-click produces, because the second click lands
         * on the point the first one already set. Dropping it
         * here keeps the structure the student actually drew,
         * and stops a stray click from leaving a floating point
         * that would make the truss impossible to finish.
         */
        ...(trussJointMatches(inProgress, resolved)
            ? []
            : [trussMember(inProgress, resolved)])
    ];
    /*
     * The outline is the chain of points the student traced
     * around the base, kept so an internal member can be checked
     * against it later.
     */
    const nextOutline =
        stage === 0
            ? [inProgress, resolved]
            : [...outline, resolved];

    /*
     * The base is finished as soon as it is one member long, so
     * the student moves straight on to the outer shape.
     */
    const nextStage =
        stage === 0 ? 1 : stage;

    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,
            phase: "truss-construct",
            startPoint: null,
            currentPoint: resolved,
            trussStage: nextStage,
            trussMembers: nextMembers,
            trussOutline: nextOutline,
            trussInProgress: null,

            /*
             * The members placed so far are republished to the
             * snap system, so the next member snaps to this
             * structure as readily as to the drawing around it.
             */
            snapGeometry:
                trussSnapGeometry({
                    trussMembers: nextMembers,
                    trussInProgress: null
                }),

            snapQuarterSnap: true,
            snapToolId: "truss"
        }
    );

    setToolMessage(
        trussStageMessage(
            drawingState.interaction
        )
    );

    renderCurrentDrawing();
}

/*
 * Finish a truss construction and create the one feature.
 *
 * The structure is checked first: a member left floating means
 * the truss is incomplete, and an incomplete truss is not
 * created. Only a valid structure is regularized and committed.
 */
function finishTrussConstruction() {
    const interaction =
        drawingState.interaction;

    const members =
        interaction.trussMembers || [];

    if (!members.length) {
        setToolMessage(
            "Draw at least the base line first"
        );

        return;
    }

    if (!trussIsConnected(members)) {
        setToolMessage(
            "Connect all member endpoints before finishing"
        );

        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * The construction members become the truss's own topology.
     * A light cleanup even out the joints, but it never removes
     * a member or invents one, so what the student drew is what
     * they get.
     */
    const regularized =
        regularizeTruss(members);

    const first = regularized[0];

    const last =
        regularized[
            regularized.length - 1
        ];

    const object =
        enggDrawingState.geometryFactories
            .truss(
                first.start,
                last.end,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering: {
                        plane: "XY",
                        discipline: "statics",
                        staticsType: "truss"
                    }
                }
            );

    /*
     * The student's members are kept on the feature as its
     * topology, so a joint can be moved and the members that
     * meet it follow.
     */
    object.geometry.members =
        regularized;

    object.geometry.panels =
        Math.max(
            2,
            regularized.length
        );

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Truss created"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * A light cleanup of the joints a student drew.
 *
 * The intent is to make a hand-drawn structure read evenly: a
 * point that is very nearly the same as another is brought onto
 * it, so members that were meant to meet do meet. Nothing is
 * moved far, no member is removed and none is added, so the
 * topology and the proportions the student chose survive.
 */
function regularizeTruss(
    members
) {
    const joints = trussJoints(members);

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
            drawingState.camera.zoom ||
        1;

    /*
     * Points closer together than this on screen are treated as
     * the same joint, so a small drawing error closes.
     */
    const tolerance = 1.5 / scale;

    const merged = [];

    joints.forEach(point => {
        const existing = merged.find(
            candidate =>
                Math.hypot(
                    candidate.x - point.x,
                    candidate.y - point.y
                ) <= tolerance
        );

        if (existing) {
            /*
             * Average the two points rather than snapping to
             * whichever came first, so neither end of the
             * structure is favoured.
             */
            existing.x =
                (existing.x + point.x) / 2;
            existing.y =
                (existing.y + point.y) / 2;

            return;
        }

        merged.push({
            x: point.x,
            y: point.y
        });
    });

    return members.map(member => ({
        start:
            merged.find(
                point =>
                    Math.hypot(
                        point.x - member.start.x,
                        point.y - member.start.y
                    ) <= tolerance
            ) || { ...member.start },

        end:
            merged.find(
                point =>
                    Math.hypot(
                        point.x - member.end.x,
                        point.y - member.end.y
                    ) <= tolerance
            ) || { ...member.end }
    }));
}

/*
 * Start a truss construction.
 *
 * The construction is temporary state held on the interaction:
 * the members drawn so far, the outline they sit in, and the
 * stage. It becomes one feature only when it is finished, so
 * cancelling leaves nothing behind.
 */
/*
 * Throw away a truss that is being built.
 *
 * The construction is temporary state, so cancelling simply
 * drops it: no feature is created and nothing the student drew
 * is kept. That is what makes both Esc and Undo recover the
 * original drawing rather than a cleaned-up version of it.
 */
function cancelTrussConstruction() {
    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.setActiveTool(
        drawingState,
        "select"
    );

    setToolMessage(
        "Select geometry"
    );

    renderEngineeringTools(activeCategory());
    renderProperties();
    renderCurrentDrawing();
}

function beginTrussConstruction() {
    enggDrawingState.setInteraction(
        drawingState,
        {
            phase: "truss-construct",
            trussStage: 0,
            trussMembers: [],
            trussOutline: [],
            trussInProgress: null
        }
    );

    setToolMessage(
        TRUSS_STAGES[0].prompt
    );

    renderCurrentDrawing();
}

/*
 * THE DISTRIBUTED LOAD, AS ONE CONTINUOUS FEATURE
 *
 * A distributed load is not a row of Point Forces. It is one
 * object with a body, a single direction for the whole of it,
 * and a handful of magnitude-defining points. Everything the
 * student does during construction feeds those three things,
 * and the row of arrows is the renderer sampling the result.
 *
 * The workflow is therefore:
 *
 *   1. Click a body. If the click lands on nothing, the tool
 *      falls back to the Line-style two-click span, so a load
 *      can be drawn across empty space exactly as a line can.
 *   2. Move to set the first force: its position along the body
 *      comes from where the cursor is over the body, and its
 *      magnitude and direction come from the offset of the
 *      cursor from that position. This is the ordinary Point
 *      Force interaction, so there is no dialog to open.
 *   3. Click to commit that first force. From here on the
 *      direction is fixed: moving the cursor only changes the
 *      magnitude, and the cursor's position along the body says
 *      where that magnitude applies.
 *   4. Click to add further defining points, then press Enter.
 *
 * Every one of those steps is graphical, in the same rhythm as
 * drawing a polyline.
 */

/*
 * How far a click must be from a body to count as "not on the
 * body" and so begin a span selection instead.
 */
const DISTRIBUTED_LOAD_BODY_PICK_TOLERANCE_PX = 8;

/*
 * The ends of a body, in the order a load runs along them.
 *
 * Anything the drawing supports as a body is accepted: a Line, a
 * Truss member set, a Beam, a Cable, a Shaft, a rigid body, or
 * any other geometry with a span. Nothing here restricts the
 * load to lines, because a load acts on whatever is loaded.
 */
function distributedLoadBodySpan(
    body
) {
    if (!body) {
        return null;
    }

    const geometry = body.geometry;

    if (!geometry) {
        return null;
    }

    /*
     * A Truss the student built is a set of members. Loading a
     * truss means loading one of its members, so the member the
     * cursor is on is the body.
     */
    if (
        Array.isArray(geometry.members) &&
        geometry.members.length
    ) {
        return {
            start: geometry.members[0].start,
            end: geometry.members[0].end,
            body: null
        };
    }

    if (
        geometry.start &&
        geometry.end &&
        Number.isFinite(geometry.start.x) &&
        Number.isFinite(geometry.end.x)
    ) {
        return {
            start: geometry.start,
            end: geometry.end,
            body: null
        };
    }

    /*
     * A rigid body has no span, so the chord across it is used:
     * a load laid across the diagonal of a body is the one
     * region a point on the body always identifies.
     */
    if (isRectangleLike(body)) {
        const corners =
            objectPoints(body);

        if (corners.length >= 2) {
            return {
                start: corners[0],
                end: corners[corners.length - 1],
                body: null
            };
        }
    }

    if (geometry.position) {
        return {
            start: geometry.position,
            end: geometry.position,
            body: null
        };
    }

    return null;
}

/*
 * The member of a Truss that a point lies on, so a load placed
 * on a truss follows the member it was drawn on rather than an
 * arbitrary one.
 */
function distributedLoadTrussMemberAt(
    point
) {
    const tolerance =
        DISTRIBUTED_LOAD_BODY_PICK_TOLERANCE_PX /
        Math.max(
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
                (drawingState.camera.zoom || 1),
            1e-6
        );

    for (const object of drawingState.objects) {
        if (
            object.type !== "truss" ||
            !Array.isArray(object.geometry?.members)
        ) {
            continue;
        }

        const member =
            object.geometry.members.find(
                candidate =>
                    distanceToSegment(
                        point,
                        candidate.start,
                        candidate.end
                    ) <= tolerance
            );

        if (member) {
            return { object, member };
        }
    }

    return null;
}

/*
 * The geometry a distributed load can be applied to.
 *
 * A load acts on whatever is loaded, so the eligible bodies are
 * not only the dedicated Statics ones. Anything the drawing
 * supports as a body is accepted: a Line, a Truss member, a
 * Beam, a Cable, a Shaft, a rigid body, or any other geometry
 * with a span. Restricting a load to lines would rule out most
 * of the structures a load is actually drawn on.
 */
function distributedLoadSpanBodyAt(
    point
) {
    const tolerance =
        DISTRIBUTED_LOAD_BODY_PICK_TOLERANCE_PX /
        Math.max(
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
                (drawingState.camera.zoom || 1),
            1e-6
        );

    /*
     * The bodies are searched newest first, so a load attaches to
     * the most recently drawn one when two overlap, which is what
     * a click on the topmost feature would do.
     */
    for (
        let index = drawingState.objects.length - 1;
        index >= 0;
        index -= 1
    ) {
        const object =
            drawingState.objects[index];

        const span =
            distributedLoadBodySpan(object);

        if (!span) {
            continue;
        }

        if (
            distanceToSegment(
                point,
                span.start,
                span.end
            ) <= tolerance
        ) {
            return object;
        }
    }

    return null;
}

/*
 * Whether the active tool is the VARYING distributed load, which
 * is the one built from a profile of magnitude points. The plain
 * Distributed Load is the constant one.
 *
 * The two are told apart by the active tool rather than by two
 * separate copies of the construction, so the body selection,
 * the span fallback and the snapping they share stay genuinely
 * shared.
 *
 * A tool id may be passed to ask about that tool specifically.
 * The click router needs to recognise the varying load by id,
 * because a tool that is not a construction tool must still be
 * admitted through this one check; leaving it to read the active
 * tool there would make the answer depend on what happened to be
 * selected rather than on the tool being tested.
 */
function isVaryingLoadTool(toolId) {
    const id =
        toolId === undefined
            ? drawingState.activeTool
            : toolId;

    return id === "varying-distributed-load";
}

/*
 * The interaction phases in which a load is being defined, split
 * into the two stages the tools share.
 *
 * Both stages need to know what "square" means for the tool, so
 * the recognition is named once here rather than spelled out at
 * each call site: the span stage traces the loaded region, and
 * the build stage draws the forces that act on it.
 */
function isLoadSpanPhase(interaction) {
    return (
        interaction?.phase ===
            "distributed-load-span"
    );
}

function isLoadBuildPhase(interaction) {
    return (
        interaction?.phase ===
            "distributed-load-build" ||
        interaction?.phase ===
            "constant-load-build"
    );
}

/*
 * Begin a distributed load.
 *
 * Both load tools start the same way, because both load a BODY
 * first:
 *
 *   - a click on an existing body loads that body;
 *   - a click in empty space has no body to act on, so the tool
 *     falls back to the Line-style two-click span, using exactly
 *     the snapping and inference a Line uses.
 *
 * They diverge from there. A Varying Distributed Load is built up
 * from a sequence of magnitude points; a Distributed Load is a
 * single magnitude across the whole span, so it finishes as soon
 * as that magnitude is given.
 */
function beginDistributedLoadConstruction(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const trussHit =
        distributedLoadTrussMemberAt(
            point
        );

    if (trussHit) {
        startDistributedLoadBuild({
            start: trussHit.member.start,
            end: trussHit.member.end,
            parentId: trussHit.object.id
        });

        return;
    }

    const body =
        staticsBodyAtPoint(point) ||
        distributedLoadSpanBodyAt(point);

    const span =
        distributedLoadBodySpan(body);

    if (span) {
        /*
         * The two load tools share the body and the span, then
         * diverge: the constant one finishes from a single force,
         * the varying one builds a profile from several.
         */
        if (isVaryingLoadTool()) {
            startDistributedLoadBuild(
                span,
                body?.id
            );
        } else {
            startConstantLoadBuild(
                span,
                body?.id
            );
        }

        return;
    }

    /*
     * Nothing under the cursor, so there is no body to load. The
     * two-click span takes over, anchored here, and the load's
     * body is the region the student traces.
     */
    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,

            phase:
                "distributed-load-span",

            startPoint: point,

            currentPoint: point,

            points: [point],

            parentId: undefined
        }
    );

    setToolMessage(
        "Specify the end of the loaded span"
    );

    renderCurrentDrawing();
}

/*
 * Move from choosing the body into drawing the load on it.
 */
function startDistributedLoadBuild(
    span,
    parentId
) {
    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.setInteraction(
        drawingState,
        {
            phase:
                "distributed-load-build",

            distributedLoadStart: {
                ...span.start
            },

            distributedLoadEnd: {
                ...span.end
            },

            distributedLoadDirection: null,

            distributedLoadPoints: [],

            distributedLoadHasProfile: false,

            parentId
        }
    );

    setToolMessage(
        "Move to set the first force direction and magnitude, then click"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The distributed load the interaction currently describes.
 *
 * It is built fresh from the interaction on every preview and
 * every commit, so the construction state and the stored
 * feature can never describe different loads.
 */
function distributedLoadDraft(
    interaction,
    cursor
) {
    const start =
        interaction?.distributedLoadStart;

    const end =
        interaction?.distributedLoadEnd;

    if (!start || !end) {
        return null;
    }

    const points = [
        ...(interaction
            .distributedLoadPoints ||
            [])
    ];

    let direction =
        interaction
            .distributedLoadDirection;

    /*
     * The first force is read straight off the cursor: the
     * projection of the cursor onto the body is where the load
     * acts, and the offset from there to the cursor is the force
     * vector itself. That is the same click-move-click
     * construction a Point Force uses, so the student is
     * already used to it.
     */
    if (direction === null && cursor) {
        const t =
            enggLoadProfile.fractionAlong(
                { start, end },
                cursor
            );

        const base =
            enggLoadProfile.pointAlong(
                { start, end },
                t
            );

        const dx = cursor.x - base.x;
        const dy = cursor.y - base.y;

        if (Math.hypot(dx, dy) > 1e-9) {
            direction =
                Math.atan2(dy, dx) *
                180 /
                Math.PI;
        }
    }

    const resolved =
        direction === null
            ? enggLoadProfile
                .DEFAULT_LOAD_DIRECTION
            : direction;

    const vector =
        enggLoadProfile.unitVector(
            resolved
        );

    /*
     * Once the direction is established, the magnitude at a
     * point is the cursor's offset MEASURED ALONG that
     * direction. Measuring along the force rather than radially
     * is what makes the arrows grow as the cursor is pulled
     * further out along the load, and it keeps the student
     * working in the one direction they chose at the start.
     */
    const magnitudeAt = point => {
        if (!cursor) {
            return 0;
        }

        const base =
            enggLoadProfile.pointAlong(
                { start, end },
                point
            );

        const dx = cursor.x - base.x;
        const dy = cursor.y - base.y;

        return Math.max(
            0,
            dx * vector.x + dy * vector.y
        );
    };

    /*
     * The live point follows the cursor along the body, so the
     * student sees the shape of the load growing as they move
     * before committing to it.
     */
    if (cursor) {
        const t =
            enggLoadProfile.fractionAlong(
                { start, end },
                cursor
            );

        const magnitude =
            magnitudeAt(t);

        const existing =
            points.findIndex(
                point =>
                    Math.abs(point.t - t) < 1e-6
            );

        if (existing >= 0) {
            points[existing] = {
                t,
                magnitude
            };
        } else {
            points.push({
                t,
                magnitude
            });
        }
    }

    const draft = {
        start,
        end,
        direction: resolved,
        points
    };

    return draft;
}

/*
 * The world positions of a load's distribution points, for the
 * shared snap system.
 *
 * A VARYING DISTRIBUTED LOAD is defined by placing forces one at
 * a time, and each one is a real, visible arrow at a real place
 * on the body. So the point the student has already placed is
 * something they will naturally want to line the NEXT one up
 * against - two forces at the same height read as "the same
 * magnitude", and getting there by eye is what the cursor is for.
 *
 * The profile stores each point as a FRACTION along the body
 * plus a magnitude, because that is what makes the profile
 * independent of the body's own geometry. Turning those back
 * into world positions is what the snap system needs, and doing
 * it here rather than storing world coordinates keeps the two
 * from ever disagreeing: a body that moved carries its profile
 * with it, and the published points move with it.
 *
 * Each is published as a zero-length segment, so the existing
 * system treats them as the points they are - endpoints to snap
 * to, and alignment references - with no new snap type and no
 * special case for loads.
 */
function distributedLoadSnapGeometry(
    interaction
) {
    const start =
        interaction
            ?.distributedLoadStart;
    const end =
        interaction
            ?.distributedLoadEnd;

    if (!start || !end) {
        return [];
    }

    return (
        interaction
            .distributedLoadPoints ||
        []
    ).map(point => {
        const along =
            enggLoadProfile.pointAlong(
                { start, end },
                point.t
            );

        if (!along) {
            return null;
        }

        /*
         * The force's own TAIL, not its tip: that is the point
         * on the body where the load acts, and it is the point
         * that stays meaningful as the magnitude changes.
         */
        return {
            start: along,
            end: along
        };
    }).filter(Boolean);
}

/*
 * Commit one point of the load's magnitude profile.
 */
function continueDistributedLoadBuild(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const interaction =
        drawingState.interaction;

    const draft =
        distributedLoadDraft(
            interaction,
            point
        );

    if (!draft) {
        return;
    }

    const hasProfile =
        Boolean(
            interaction
                .distributedLoadHasProfile
        ) ||
        draft.points.length > 0;

    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,

            phase:
                "distributed-load-build",

            distributedLoadStart: {
                ...draft.start
            },

            distributedLoadEnd: {
                ...draft.end
            },

            distributedLoadDirection:
                draft.direction,

            distributedLoadPoints:
                draft.points,

            distributedLoadHasProfile:
                hasProfile,

            /*
             * Every point placed so far is published to the
             * snap system at the moment it is placed, not when
             * the load is finished.
             *
             * This is what makes a Varying Distributed Load
             * snap to itself. The student defines Force 1, then
             * moves to place Force 2, and the natural thing is
             * to put Force 2 at the same height as Force 1 -
             * that is how "the same magnitude again" is actually
             * drawn. Without the point being a snap target the
             * only way to express that is by eye, and a force
             * placed a few pixels off reads as a different
             * magnitude rather than an equal one.
             *
             * Registering here rather than at the end is the
             * whole point: a load is an open sequence, and its
             * earlier points are real for as long as the tool
             * is running.
             */
            snapGeometry:
                distributedLoadSnapGeometry(
                    {
                        distributedLoadStart:
                            draft.start,

                        distributedLoadEnd:
                            draft.end,

                        distributedLoadPoints:
                            draft.points
                    }
                ),

            parentId:
                interaction.parentId
        }
    );

    setToolMessage(
        interaction
            .distributedLoadHasProfile
            ? "Click to add another point, Enter to finish"
            : "Click to add another point, Enter to finish"
    );

    renderCurrentDrawing();
}

/*
 * A DISTRIBUTED LOAD WITH A CONSTANT MAGNITUDE
 *
 * A Distributed Load is the simple one: one body, one
 * magnitude, one direction, spread evenly across the whole
 * selected span. There is no profile to trace and no sequence of
 * points to place. It is defined by a single force drawn off the
 * body, and everything else follows from that.
 *
 * The magnitude and the direction both come from where the
 * cursor is. The point on the body under the cursor is where the
 * magnitude is read from, and the offset from that point to the
 * cursor is the force vector itself, so it is exactly the
 * click-move-click construction a Point Force already uses and
 * there is no dialog anywhere in it.
 *
 * The offset is measured along the load's own direction and is
 * never clamped, so pulling the cursor further out genuinely
 * makes the load heavier and the drawn arrows longer.
 */
function startConstantLoadBuild(
    span,
    parentId
) {
    enggDrawingState.setInteraction(
        drawingState,
        {
            phase:
                "constant-load-build",

            loadStart: {
                ...span.start
            },

            loadEnd: {
                ...span.end
            },

            loadDirection: null,

            loadMagnitude: 0,

            parentId
        }
    );

    setToolMessage(
        "Move to set the load magnitude and direction, then click"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The constant load the interaction currently describes.
 */
function constantLoadDraft(
    interaction,
    cursor
) {
    const start = interaction?.loadStart;
    const end = interaction?.loadEnd;

    if (!start || !end) {
        return null;
    }

    let direction =
        interaction.loadDirection;

    /*
     * The first, and only, force: its direction is the offset
     * from the body to the cursor, and its magnitude is the
     * length of that offset. One vector, so one click ends the
     * construction.
     */
    if (!cursor) {
        direction =
            direction ??
            enggLoadProfile
                .DEFAULT_LOAD_DIRECTION;

        return {
            start,
            end,
            direction,
            magnitude: Math.max(
                0,
                Number(
                    interaction.loadMagnitude
                ) || 0
            )
        };
    }

    const body = { start, end };

    const t =
        enggLoadProfile.fractionAlong(
            body,
            cursor
        );

    const base =
        enggLoadProfile.pointAlong(
            body,
            t
        );

    const dx = cursor.x - base.x;
    const dy = cursor.y - base.y;

    const magnitude = Math.hypot(dx, dy);

    if (magnitude > 1e-9) {
        direction =
            Math.atan2(dy, dx) * 180 / Math.PI;
    }

    return {
        start,
        end,
        direction:
            direction ??
            enggLoadProfile
                .DEFAULT_LOAD_DIRECTION,
        magnitude
    };
}

/*
 * Commit the constant load and create the feature.
 *
 * The result is one Distributed Load: a body, a single
 * magnitude and a single direction shared by every arrow drawn
 * across it. The even field of arrows is what the renderer
 * samples from those three values.
 */
function finishConstantLoadConstruction() {
    const interaction =
        drawingState.interaction;

    const draft =
        constantLoadDraft(
            interaction,
            null
        );

    if (!draft) {
        return;
    }

    if (draft.magnitude <= 0) {
        setToolMessage(
            "Move away from the body to give the load a magnitude"
        );

        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        enggDrawingState.geometryFactories.load(
            draft.start,
            draft.end,
            draft.magnitude,
            staticsAttachedStyle(
                drawingState.activeTool,
                interaction.staticsTarget
            )
        );

    object.geometry.direction =
        draft.direction;

    if (interaction.parentId) {
        object.parentId =
            interaction.parentId;
    }

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Distributed load created"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Create the one Varying Distributed Load feature.
 *
 * The whole construction becomes a single object: the body it
 * acts on, the direction every one of its arrows shares, and the
 * defining points of its profile. The arrows are derived from
 * those, so the load can be edited afterwards as one thing
 * rather than as a crowd of separate forces.
 */
function finishDistributedLoadConstruction() {
    const interaction =
        drawingState.interaction;

    const draft =
        distributedLoadDraft(
            interaction,
            null
        );

    if (!draft) {
        return;
    }

    if (
        !draft.points.length
    ) {
        setToolMessage(
            "Set at least one magnitude point before finishing"
        );

        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const toolId =
        drawingState.activeTool;

    const peak =
        draft.points.reduce(
            (max, point) =>
                Math.max(
                    max,
                    point.magnitude
                ),
            0
        );

    const object =
        enggDrawingState.geometryFactories.load(
            draft.start,
            draft.end,
            peak,
            staticsAttachedStyle(
                toolId,
                drawingState.interaction
                    .staticsTarget
            )
        );

    object.geometry.direction =
        draft.direction;

    object.geometry.points =
        draft.points;

    object.geometry.intensity =
        draft.points.reduce(
            (sum, point) =>
                sum + point.magnitude,
            0
        ) / draft.points.length;

    if (
        interaction.parentId
    ) {
        object.parentId =
            interaction.parentId;
    }

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Distributed load created"
    );

    renderProperties();
    renderCurrentDrawing();
}

function createStaticsFeature(
    toolId,
    point,
    parentId
) {
    const definition =
        STATICS_PLACEMENT_TOOLS[toolId];

    if (!definition) {
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const style = {
        style: {
            ...drawingState.styleDefaults,

            /*
             * A Point Force is a symbol rather than an outline,
             * so it starts heavier than the general line weight.
             * The choice is made in staticsForceLineWidth so the
             * single-click and the attached creation paths cannot
             * disagree about it.
             */
            lineWidth:
                staticsForceLineWidth(toolId)
        },

        engineering: {
            plane: "XY",
            discipline: "statics",

            /*
             * Records which statics tool created this
             * feature, so the panel can name it correctly
             * even when it reuses ordinary point or line
             * geometry.
             */
            staticsType: toolId
        },

        /*
         * Reference features are named for their statics
         * role rather than their underlying geometry, so a
         * Reference Point reads as such in the tree.
         */
        name:
            toolId === "reference-point" ||
            toolId === "reference-line"
                ? definition.label
                : undefined,

        /*
         * A single-click support or moment snapped onto a
         * body becomes that body's child, exactly as a
         * snapped Point Force does.
         */
        parentId:
            attachableStaticsType(
                definition.type
            )
                ? parentId
                : undefined
    };

    const position = {
        x: point.x,
        y: point.y
    };

    let object;

    /*
     * THE SUPPORTS: ATTACHED TO THE CENTRELINE, DRAWN OUTSIDE.
     *
     * A support is one of the four features whose position is a
     * RELATIONSHIP rather than a coordinate. It is attached at a point
     * on its body's centreline - the point the student clicked, and the
     * point the snap indicator sat on - and it is DRAWN on the outside
     * of the body, offset clear of the member's face.
     *
     * Those are two different numbers and they are stored separately.
     * `attachment` is the semantic position, in the body's own frame,
     * and it is what makes the support follow the beam when the beam
     * moves. `position` is where the symbol is drawn, and it is
     * derived from the attachment every time the drawing is rendered.
     *
     * Storing only the drawn position is what made a support have to
     * be dropped on the bottom edge of a beam to come out underneath
     * it: with one number for both roles, the drawn position WAS the
     * attachment, so the only way to be outside the member was to be
     * outside it already.
     */
    if (isSupportType(type)) {
        const parent =
            drawingState.objects.find(
                candidate =>
                    candidate.id === parentId
            );

        const placement =
            parent
                ? enggBodyFrames.supportPlacement(
                    parent,
                    point,
                    false
                )
                : null;

        if (placement) {
            object =
                enggDrawingState.geometryFactories[type](
                    placement.render,
                    {
                        ...style,

                        parentId: parent.id,

                        engineering: {
                            ...style.engineering,

                            /*
                             * WHICH GEOMETRY IT IS ATTACHED TO.
                             *
                             * Recorded so a file says what the support
                             * is on the strength of - a centreline, not
                             * a face and not a screen position - and so
                             * a later change to how supports attach can
                             * tell an old attachment from a new one.
                             */
                            attachmentType: "centreline",

                            supportType: type
                        }
                    }
                );

            /*
             * The attachment, in the body's frame.
             *
             * A DISTANCE ALONG the member rather than a world point,
             * which is what makes the support stay where the student
             * put it when the beam is resized. A stored world x would
             * drift to a different place on a longer beam, and the
             * support would quietly stop being under the load it was
             * put under.
             */
            object.geometry.attachment = {
                distance: placement.distance
            };

            /*
             * Which side. TRUE is the opposite of the body's default
             * outside face, and it is the only thing Flip changes: not
             * the attachment, not the beam, not a distance from
             * anything.
             */
            object.geometry.flipped = false;
        }
    }

    /*
     * Dispatch on the feature type the child tool creates,
     * not on the old parent ids, so every submenu item
     * builds the right shape with the right arguments.
     */
    const type =
        definition.type;

    if (type === "force") {
        /*
         * The heavier default weight comes from
         * staticsAttachedStyle, which is the one place that
         * decides it, so the creation path does not have to
         * repeat the choice and the two cannot disagree.
         */
        object =
            enggDrawingState.geometryFactories.force(
                position,
                100,
                0,
                style
            );
    } else if (type === "rigid-body") {
        /*
         * A rigid body starts as a rectangle of a defined
         * default size, centred on the clicked point. The
         * student then resizes and rotates it from the
         * Features panel or by dragging its handles.
         */
        object =
            enggDrawingState.geometryFactories[
                "rigid-body"
            ](
                {
                    x:
                        position.x -
                        RIGID_BODY_WIDTH / 2,

                    y:
                        position.y +
                        RIGID_BODY_HEIGHT / 2
                },

                RIGID_BODY_WIDTH,

                RIGID_BODY_HEIGHT,

                style
            );
    } else if (type === "moment") {
        /*
         * A moment starts at 50 N-m, turning ANTICLOCKWISE.
         *
         * Anticlockwise is the default direction a moment is created
         * with, and it is written as the word rather than as a flag so
         * that the feature states its own sense instead of leaving a
         * reader to invert a boolean.
         */
        object =
            enggDrawingState.geometryFactories.moment(
                position,
                50,
                "CCW",
                style
            );
    } else if (type === "couple") {
        /*
         * A couple moment starts at 50 N-m, turning ANTICLOCKWISE.
         *
         * The third argument is the old `separation` and is passed on
         * only so a value already on the sheet is not lost; nothing
         * reads it now that a couple is drawn as a curved arrow rather
         * than as a pair of forces.
         */
        object =
            enggDrawingState.geometryFactories.couple(
                position,
                50,
                20,
                "CCW",
                style
            );
    } else if (type === "connection") {
        /*
         * A connection is drawn as a short link so it is
         * visible before its second end is chosen.
         */
        object =
            enggDrawingState.geometryFactories.connection(
                position,
                {
                    x: point.x + 20,
                    y: point.y
                },
                style
            );
    } else if (
        typeof enggDrawingState.geometryFactories[
            type
        ] === "function"
    ) {
        object =
            enggDrawingState.geometryFactories[
                type
            ](
                position,
                style
            );
    } else {
        return;
    }

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        `Specify ${definition.label.toLowerCase()} position`
    );

    renderProperties();
    renderCurrentDrawing();
}

function resolvePointerPoint(
    rawPoint
) {
    /*
     * THE ANALYSIS AXIS PLACEMENT IS NOT A CONSTRUCTION TOOL, BUT IT
     * STILL NEEDS THE POINTER.
     *
     * The diagram tools no longer place a span, so they are not
     * construction tools and would return the bare pointer below -
     * which would leave the preview unsnapped and the student aiming
     * by eye at a reference line the whole sheet is built to help them
     * hit.
     *
     * So the placement phase resolves the pointer through the ordinary
     * snapping pipeline, and this is the ONLY reason it is mentioned
     * here. There is no Analysis-specific snapping: the same shared
     * candidates, the same tolerance, the same indicators and the
     * same bottom-of-screen wording as every other tool. The axis the
     * student lands on can be a Reference Point or a horizontal guide
     * because those are things the sheet already offers to snap to.
     */
    if (
        drawingState.interaction.phase ===
            "analysis-axis"
    ) {
        return resolveAnalysisAxisPointer(
            rawPoint
        );
    }

    if (
        !isConstructionTool(
            drawingState.activeTool
        )
    ) {
        return {
            rawPointerPoint: {
                ...rawPoint
            },

            effectiveConstructionPoint: {
                ...rawPoint
            },

            snappedPoint: null,
            inferredPoint: null,
            snapCandidate: null,
            hoveredEntity: null,
            inference: null
        };
    }

    const bounds =
        drawingCanvas.getBoundingClientRect();

    const interaction =
        drawingState.interaction;

    /*
     * While the arc centre is being placed, the first arc
     * point is the inference anchor, so the centre can
     * align with it horizontally and vertically.
     */
    const arcCentrePhase =
        isArcTool() &&
        interaction.phase ===
            "arc-centre";

    /*
     * During the arc sweep phase, use the centre as
     * the inference anchor so horizontal and vertical
     * inference work while placing the endpoint.
     */
    const arcEndpointPhase =
        isArcTool() &&
        (
            interaction.phase ===
                "arc-sweep" ||
            interaction.phase ===
                "arc-second"
        );

    const isPolyline =
        drawingState.activeTool ===
            "polyline";

    /*
     * The line tool needs its first point as the inference
     * anchor so horizontal and vertical inference works
     * while placing the second point.
     */
    const isLine =
        drawingState.activeTool ===
            "line" ||
        drawingState.activeTool ===
            "point-force" ||
        (
            drawingState.activeTool ===
                "truss" &&
            drawingState.interaction
                .phase ===
                "truss-construct"
        ) ||

        /*
         * The two-click Statics spans join the same shared inference.
         *
         * A Beam, a Cable and a Shaft are placed between two points
         * exactly as a Line is, and their previews already draw from
         * `interaction.points[0]` - the first click - to the resolved
         * point. What they were missing was only the ANCHOR: with no
         * `lineStart`, the shared resolver had nothing to align
         * against, so horizontal and vertical inference never ran and
         * the bottom of the canvas could not say what the snap was.
         *
         * Naming them here is the whole change. Every tolerance, every
         * snap target, the priority order, the indicator and the
         * instruction all come from the same `resolveConstructionPoint`
         * call the Line tool has always used - nothing is reimplemented,
         * and each tool keeps its own semantic feature and its own
         * construction behaviour.
         *
         * The snapshot the resolver takes of the snap geometry is
         * unchanged, so an in-progress member still appears as a snap
         * target for itself, as it did before.
         */
        STATICS_SPAN_SNAP_TOOLS.includes(
            drawingState.activeTool
        );

    let lineStart = null;

    if (isLine) {
        /*
         * A truss anchors inference on the point its next member
         * starts from, exactly as a Line does on its own start
         * point, so horizontal and vertical alignment work while
         * a member is being drawn. A Point Force is a Line in
         * every respect that matters here, so it is treated as
         * one.
         */
        lineStart =
            drawingState.activeTool ===
                "truss"
                ? trussInferenceAnchor(
                    drawingState.interaction
                )
                : interaction.startPoint;
    } else if (isPolyline) {
        lineStart =
            interaction.points.length
                ? interaction.points[
                    interaction.points.length - 1
                ]
                : null;
    } else if (
        isLoadSpanPhase(interaction)
    ) {
        /*
         * A loaded span drawn by hand is a Line, so it anchors on
         * its own start point exactly as a Line does. Without this
         * the span could not be pulled square, which is the first
         * thing a student does when they trace a loaded region.
         */
        lineStart =
            (interaction.points &&
                interaction.points[0]) ||
            interaction.startPoint;
    } else if (
        isLoadBuildPhase(interaction)
    ) {
        /*
         * While a load is being defined, the ends of the span it
         * acts on are the meaningful references for alignment: a
         * force drawn square to the body, or to a joint at either
         * end of it, is what the student is aiming at. Both ends
         * are published so the cursor can align with either, and
         * the check happens on the live cursor, so the preview is
         * already square before the click.
         *
         * The distribution points already placed on this load are
         * published too. Defining a second point square to the
         * first is the same act as drawing a member square to a
         * truss joint, and it goes through the same global
         * inference rather than a rule of the load's own.
         */
        lineStart =
            interaction.distributedLoadStart ||
            interaction.loadStart ||
            null;
    } else if (
        drawingState.activeTool ===
            "triangle"
    ) {
        /*
         * While placing the second and third
         * corners, the previously placed corner is
         * the inference anchor, so the new point can
         * align with it horizontally and vertically.
         */
        lineStart =
            interaction.points.length
                ? interaction.points[
                    interaction.points.length - 1
                ]
                : null;
    } else if (
        arcCentrePhase
    ) {
        /*
         * The already placed first arc point anchors the
         * centre point, using the same inference pipeline
         * as every other tool.
         */
        lineStart =
            interaction.points.length
                ? interaction.points[0]
                : interaction.startPoint;
    } else if (
        arcEndpointPhase
    ) {
        lineStart =
            interaction.points.length
                ? interaction.points[0]
                : interaction.startPoint;
    }

    /*
     * The 3-point arc anchors on the second point,
     * because the third point is what closes the arc.
     */
    if (
        isArcTool() &&
        interaction.phase ===
            "arc-second" &&
        interaction.points.length > 1
    ) {
        lineStart =
            interaction.points[1];
    }

    /*
     * While placing the triangle's third corner, or the
     * 3-point arc's third point, both earlier points act
     * as H/V inference references, so the new point can
     * align with either of them.
     */
    const multiPointAnchor =
        (drawingState.activeTool === "triangle" ||
            (isArcTool() &&
                interaction.phase === "arc-second")) &&
        interaction.points.length >= 2;

    /*
     * The far end of a loaded span is a second alignment
     * reference while the load is being defined, so a force can
     * be pulled square to either end of the body it acts on
     * rather than only to the one it was anchored from.
     */
    const loadSpanEndAnchor =
        isLoadBuildPhase(interaction)
            ? interaction.distributedLoadEnd ||
              interaction.loadEnd ||
              null
            : null;

    /*
     * The distribution points already placed on the load being
     * built, as world positions along its span.
     *
     * Defining a second point square to the first is the same act
     * as drawing a truss member square to a joint it meets, and it
     * is answered by the same global inference rather than by a
     * rule of the load's own: a point of a load is a place in the
     * drawing, so the next point can align with it exactly as it
     * aligns with a joint.
     */
    const loadPointAnchors =
        isLoadBuildPhase(interaction)
            ? (interaction.distributedLoadPoints || [])
                  .map((point) =>
                      enggLoadProfile.pointAlong(
                          {
                              start:
                                  interaction.distributedLoadStart ||
                                  interaction.loadStart,
                              end:
                                  interaction.distributedLoadEnd ||
                                  interaction.loadEnd
                          },
                          point.t
                      )
                  )
                  .filter(Boolean)
            : [];

    const inferenceReferences = [
        ...(multiPointAnchor
            ? [interaction.points[0], interaction.points[1]]
            : []),
        ...(loadSpanEndAnchor ? [loadSpanEndAnchor] : []),
        ...loadPointAnchors
    ];

    return drawingSnap.resolveConstructionPoint(
        {
            ...rawPoint
        },
        drawingState,
        bounds,
        {
            lineStart,

            inferenceReferences,

            /*
             * Treat arc endpoint placement
             * like a line so horizontal and
             * vertical inference works.
             */
            tool:
                arcEndpointPhase
                    ? "line"
                    : drawingState.activeTool
        }
    );
}

/*
 * Resolve directly from the current pointer event.
 *
 * This is deliberately used for actual clicks as
 * well as mouse movement so the click can never
 * accidentally use a stale snap position from
 * a previous mousemove event.
 */
function resolvePointerEvent(
    event
) {
    return resolvePointerPoint(
        canvasPointFromEvent(
            event,
            false
        )
    );
}

/*
 * THE POINTER, RESOLVED FOR THE ANALYSIS AXIS PLACEMENT.
 *
 * Returns the same shape the construction pipeline returns, so
 * everything downstream - the snap marker, the inference line, the
 * status message - behaves exactly as it does for every other tool
 * without knowing anything about analysis.
 *
 * WHAT IT DOES WITH THE POINTER, AND WHY ONLY THAT
 * ----------------------------------------------
 * The student's cursor answers ONE question: how far above or below
 * their drawing should the diagram sit. So only the vertical
 * component of the resolved point is taken.
 *
 * The horizontal component is deliberately discarded. A student
 * sweeping the pointer across the sheet to find a height would
 * otherwise slide the axis sideways as they went, and a diagram that
 * drifts out from under its own beam is worse than one placed
 * slightly low - it breaks the alignment that makes A' sit under A
 * and the stations line up with the loads, which is the entire reason
 * the axis is derived from the source rather than drawn.
 */
function resolveAnalysisAxisPointer(
    rawPoint
) {
    const interaction =
        drawingState.interaction;

    /*
     * The shared snapping, asked exactly as any construction asks it.
     */
    const resolution =
        enggDrawingSnap.resolveConstructionPoint(
            rawPoint,
            drawingState,
            drawingCanvas.getBoundingClientRect()
        );

    const effective =
        resolution.effectiveConstructionPoint ||
        resolution.snappedPoint ||
        resolution.rawPointerPoint ||
        rawPoint;

    /*
     * The height the student has chosen.
     *
     * The SNAP point's y is used when there is one, so the axis can
     * be nudged exactly onto a horizontal guide or a Reference Point
     * - and only the height is taken, so a snap to something off to
     * one side cannot drag the axis with it.
     */
    if (Number.isFinite(effective.y)) {
        interaction.placementY = effective.y;
    }

    return {
        ...resolution,

        /*
         * The axis is derived from the source, not from the pointer,
         * so the construction point is the axis itself. That is what
         * the preview draws and what a snap against it would measure
         * against - and it is why snapping to the preview's own ends
         * works even though those ends are not the pointer.
         */
        effectiveConstructionPoint:
            analysisAxisForPlacement()
                ? {
                    start:
                        analysisAxisForPlacement()
                            .start,
                    end:
                        analysisAxisForPlacement()
                            .end
                }
                : effective
    };
}

/*
 * Short names for the snap and inference types.
 *
 * Deliberately terse. The snap STATE - the marker on the drawing, and the
 * geometry visibly snapping - already says what has happened; the status line
 * names it and stops. "Horizontal" reads as a report. "Horizontal snap"
 * repeats what the eye has established and crowds out the instruction that
 * follows it.
 *
 * One table, read by every tool through `inferenceLabel`, so no two tools
 * can describe the same snap in different words.
 */
const SNAP_TYPE_LABELS = {
    endpoint: "Endpoint",
    midpoint: "Midpoint",
    quarter: "Quarter point",
    center: "Center",
    intersection: "Intersection",
    quadrant: "Quadrant",
    pointOnEntity: "Point on object",
    horizontal: "Horizontal",
    vertical: "Vertical",
    "horizontal-vertical": "Horizontal + Vertical",

    /*
     * A member's CENTRELINE, which is what a support attaches to.
     *
     * Named so the student can tell the two apart on screen. Without
     * it this would read "Point on object", which is true of every
     * surface on the drawing and says nothing about the fact that
     * this particular line is the one a support is placed against.
     */
    centreline: "Centreline",

    /*
     * A diagram's source station.
     *
     * Says what the snap CAUGHT, not merely that it caught something:
     * the whole value of snapping to a diagram marker is knowing that
     * it is the station a load or a support sits on rather than a
     * point that happened to be nearby.
     */
    "analysis-reference": "Source reference"
};

function snapTypeLabel(
    type,
    candidate
) {
    if (!type) {
        return null;
    }

    const base =
        SNAP_TYPE_LABELS[type] ||
        (
            String(type)[0].toUpperCase() +
            String(type).slice(1)
        );

    /*
     * A NAMED SNAP SAYS WHICH ONE.
     *
     * A diagram publishes a station for every load and every support
     * on its source, and they are a few units apart on a dense beam.
     * "Source reference" tells the student they have caught one; "the
     * load" tells them which. The label is only ever what the
     * candidate already carries, so no message can name something the
     * snap did not actually reach.
     */
    if (
        type === "analysis-reference" &&
        candidate?.label
    ) {
        return base + " (" + candidate.label + ")";
    }

    return base;
}

function inferenceLabel(
    inference
) {
    return snapTypeLabel(
        inference?.type || inference
    );
}

/*
 * The status text for a live construction, naming whichever snap
 * is currently holding the point, and otherwise passing through the
 * tool's own instruction.
 *
 * A snap that is working but not announced reads as a snap that is
 * not working: the geometry jumps into line and nothing says why.
 * So every construction that can be pulled square reports the
 * alignment it has taken, from the same resolution the preview was
 * drawn from, and the guide line the renderer shows and this
 * message are describing the same condition.
 */
function constructionFeedbackMessage(
    resolution,
    fallback
) {
    const feedback =
        [
            inferenceLabel(
                resolution.inference
            ),

            snapTypeLabel(
                resolution.snapCandidate?.type
            )
        ].filter(Boolean);

    return feedback.length
        ? feedback.join(" · ")
        : fallback;
}

function updateInteractionFeedback(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    if (point) {
        drawingCoordinates.textContent =
            `X: ${Number(point.x).toFixed(1)} Y: ${Number(point.y).toFixed(1)} mm`;
    }

    /*
     * Arc placement phases each have their own
     * instruction, with snap and inference taking
     * priority when they are active.
     */
    if (
        isArcTool()
    ) {
        const instruction = {
            "arc-centre":
                "Specify arc start point",

            "arc-sweep":
                "Specify arc endpoint",

            "arc-first":
                "Specify point on arc",

            "arc-second":
                "Specify third point"
        }[
            drawingState.interaction.phase
        ];

        if (instruction) {
            const feedback =
                [
                    inferenceLabel(
                        resolution.inference
                    ),

                    snapTypeLabel(
                        resolution
                            .snapCandidate
                            ?.type
                    )
                ].filter(Boolean);

            setToolMessage(
                feedback.length
                    ? feedback.join(
                        " · "
                    )
                    : instruction
            );

            return;
        }
    }

    const feedback = [
        inferenceLabel(
            resolution.inference
        ),

        snapTypeLabel(
            resolution.snapCandidate?.type,
            resolution.snapCandidate
        )
    ].filter(Boolean);

    if (
        feedback.length
    ) {
        setToolMessage(
            feedback.join(
                " · "
            )
        );

        return;
    }

    if (
        drawingState.interaction.phase !==
        "idle"
    ) {
        return;
    }

    if (
        drawingState.activeTool ===
        "coordinate-system-2d"
    ) {
        setToolMessage(
            "Specify origin"
        );

        return;
    }

    if (
        drawingState.activeTool ===
        "line"
    ) {
        setToolMessage(
            "Specify line start point"
        );

        return;
    }

    if (
        drawingState.activeTool ===
        "triangle"
    ) {
        setToolMessage(
            "Specify first point"
        );
    }
}

/*
 * Give a held guideline a deadline, and redraw when it lapses.
 *
 * The pointer staying still is the case the pointer-driven
 * clear cannot handle: leave a snap region without moving and
 * the last frame's guide would remain on the drawing
 * indefinitely. So the hold is given a timer that clears it and
 * redraws once, whether or not the pointer ever moves again.
 *
 * The timer is only armed when a guide is actually being held,
 * and is replaced rather than stacked on every pointer event,
 * so an idle cursor costs one pending timeout and nothing else.
 */
function scheduleGuidelineExpiry(
    guideline
) {
    if (guidelineHoldTimer) {
        clearTimeout(guidelineHoldTimer);
        guidelineHoldTimer = null;
    }

    if (!guideline) {
        return;
    }

    const holdMs =
        window.enggDrawingSnap
            ?.GUIDELINE_HOLD_MS ??
        260;

    guidelineHoldTimer =
        setTimeout(
            () => {
                guidelineHoldTimer = null;

                /*
                 * Only clear if the guide on screen is still
                 * the one that was held. If the pointer moved
                 * and established a different snap in the
                 * meantime, that guide is current and must not
                 * be taken down by this timer.
                 */
                if (
                    !drawingState.interaction
                        ?.guideline
                ) {
                    return;
                }

                drawingState.interaction
                    .guideline = null;

                renderCurrentDrawing();
            },
            holdMs + 40
        );
}

function updateDrawingCoordinates(
    event
) {
    /*
     * Always calculate from the current
     * pointer event.
     */
    const resolution =
        resolvePointerEvent(
            event
        );

    enggDrawingState.setInteraction(
        drawingState,
        resolution
    );

    scheduleGuidelineExpiry(
        resolution.guideline
    );

    syncSelectionInteraction();

    updateInteractionFeedback(
        resolution
    );

    /*
     * A running Modify session shows its own ghost
     * preview; otherwise the tool's construction preview
     * is used.
     */
    if (modifySession) {
        updateModifyPreview(
            resolution
        );

        setToolMessage(
            modifyInstruction(
                modifySession
            )
        );
    } else {
        updatePreview(
            resolution
        );
    }

    renderCurrentDrawing();
}

/*
 * Instruction text for the current Modify stage.
 */
function modifyInstruction(
    session
) {
    if (
        session.kind === "mirror" &&
        session.stage === "base"
    ) {
        return "Select the features to mirror first";
    }

    return {
        move:
            session.stage === "base"
                ? "Specify base point"
                : "Specify destination",

        rotate:
            session.stage === "base"
                ? "Specify rotation pivot"
                : "Specify rotation angle",

        mirror:
            session.stage === "axis-end"
                ? "Specify second point"
                : "Select mirror line or point",

        trim:
            session.stage === "base"
                ? "Select the boundary to trim against"
                : "Select the segment to trim",

        extend:
            session.stage === "base"
                ? "Select the boundary to extend to"
                : "Select the geometry to extend"
    }[session.kind] || "Ready";
}

function distance(
    first,
    second
) {
    return Math.hypot(
        second.x - first.x,
        second.y - first.y
    );
}

function rectangleGeometry(
    first,
    second
) {
    const left =
        Math.min(
            first.x,
            second.x
        );

    const top =
        Math.max(
            first.y,
            second.y
        );

    return {
        position: {
            x: left,
            y: top
        },

        width:
            Math.abs(
                second.x -
                first.x
            ),

        height:
            Math.abs(
                second.y -
                first.y
            ),

        rotation: 0
    };
}

function circumcenter(
    first,
    second,
    third
) {
    const denominator =
        2 *
        (
            first.x *
                (
                    second.y -
                    third.y
                ) +

            second.x *
                (
                    third.y -
                    first.y
                ) +

            third.x *
                (
                    first.y -
                    second.y
                )
        );

    if (
        Math.abs(
            denominator
        ) < 1e-9
    ) {
        return null;
    }

    const firstSquare =
        first.x * first.x +
        first.y * first.y;

    const secondSquare =
        second.x * second.x +
        second.y * second.y;

    const thirdSquare =
        third.x * third.x +
        third.y * third.y;

    return {
        x:
            (
                firstSquare *
                    (
                        second.y -
                        third.y
                    ) +

                secondSquare *
                    (
                        third.y -
                        first.y
                    ) +

                thirdSquare *
                    (
                        first.y -
                        second.y
                    )
            ) /
            denominator,

        y:
            (
                firstSquare *
                    (
                        third.x -
                        second.x
                    ) +

                secondSquare *
                    (
                        first.x -
                        third.x
                    ) +

                thirdSquare *
                    (
                        second.x -
                        first.x
                    )
            ) /
            denominator
    };
}

/*
 * Normalise an angle into (-PI, PI].
 *
 * Every angle in the centrepoint arc goes through
 * this one function, so the whole calculation stays
 * in a single system and never mixes 0..2PI values
 * with -PI..PI values.
 */
function normalizeAngle(
    angle
) {
    if (!Number.isFinite(angle)) {
        return 0;
    }

    const twoPi =
        2 * Math.PI;

    let result =
        (
            angle +
            Math.PI
        ) %
        twoPi;

    if (result < 0) {
        result +=
            twoPi;
    }

    return (
        result -
        Math.PI
    );
}

/*
 * Signed sweep from one angle to another, taking
 * the short way round. The result is always in
 * (-PI, PI], so crossing the 0/360 boundary is a
 * small step instead of a full turn.
 */
function angleDifference(
    from,
    to
) {
    return normalizeAngle(
        to -
        from
    );
}

/*
 * Unwrap a cursor angle so it stays continuous as
 * the user moves around the centre.
 *
 * atan2 jumps from +PI to -PI when the cursor
 * crosses the 180 degree line. Comparing the new
 * sample with the previous one and adding the
 * smallest signed step keeps the running angle
 * increasing (or decreasing) smoothly:
 *
 *   179 -> 180 -> 181
 *
 * instead of folding 181 back to -179. The
 * returned angle is intentionally outside
 * (-PI, PI] once the user has travelled past a
 * half turn, which is exactly what preserves the
 * direction of travel.
 */
function unwrapAngle(
    angle,
    previousAngle
) {
    if (!Number.isFinite(previousAngle)) {
        return angle;
    }

    return (
        previousAngle +
        angleDifference(
            previousAngle,
            angle
        )
    );
}

/*
 * Build an arc from a centre, a radius start point
 * and an endpoint.
 *
 * The sweep is derived from the unwrapped cursor
 * angle, so it grows continuously through 180
 * degrees and never reverses. Small arcs stay
 * small, and large arcs are produced naturally
 * once the cursor has travelled more than half a
 * turn.
 */
function arcFromCentrePoints(
    center,
    start,
    end,
    cursorAngle
) {
    const radius =
        distance(
            center,
            start
        );

    if (
        radius <=
        1e-9
    ) {
        return null;
    }

    const startAngle =
        Math.atan2(
            start.y - center.y,
            start.x - center.x
        );

    /*
     * The caller supplies a continuous cursor angle.
     * When it is not available, fall back to the
     * endpoint so the arc is still well defined.
     */
    const continuousAngle =
        Number.isFinite(
            cursorAngle
        )
            ? cursorAngle
            : Math.atan2(
                end.y - center.y,
                end.x - center.x
            );

    /*
     * Sweep is the raw difference, so it is allowed
     * to exceed PI and keep its sign. That is what
     * makes the arc continue in one direction past
     * the half-way point instead of flipping.
     */
    const sweep =
        continuousAngle -
        startAngle;

    if (
        Math.abs(
            sweep
        ) <=
        1e-9
    ) {
        return null;
    }

    return {
        center: {
            ...center
        },

        radius,

        startAngle,

        endAngle:
            startAngle + sweep,

        sweep
    };
}

/*
 * Build the circumcircle arc through three points.
 * This is the geometry the 3-point arc mode uses,
 * so the arc passes through the clicked points
 * instead of creating unrelated geometry.
 */
function arcThroughThreePoints(
    first,
    second,
    third
) {
    const center =
        circumcenter(
            first,
            second,
            third
        );

    if (!center) {
        return null;
    }

    const radius =
        distance(
            center,
            first
        );

    if (
        radius <=
        1e-9
    ) {
        return null;
    }

    const firstAngle =
        Math.atan2(
            first.y - center.y,
            first.x - center.x
        );

    const secondDelta =
        normalizeAngle(
            Math.atan2(
                second.y - center.y,
                second.x - center.x
            ) -
            firstAngle
        );

    const thirdDelta =
        normalizeAngle(
            Math.atan2(
                third.y - center.y,
                third.x - center.x
            ) -
            firstAngle
        );

    /*
     * The arc must pass through the middle point, so
     * the sweep runs in the direction that reaches it.
     */
    const clockwise =
        secondDelta <
        0;

    const endDelta =
        clockwise
            ? (
                thirdDelta >
                0
                    ? thirdDelta - 2 * Math.PI
                    : thirdDelta
            )
            : (
                thirdDelta <
                0
                    ? thirdDelta + 2 * Math.PI
                    : thirdDelta
            );

    if (
        Math.abs(
            endDelta
        ) <=
        1e-9
    ) {
        return null;
    }

    return {
        center: {
            ...center
        },

        radius,

        startAngle:
            firstAngle,

        endAngle:
            firstAngle +
            endDelta,

        sweep:
            endDelta
    };
}

/*
 * Single source of truth for the centrepoint arc.
 *
 * Both the live preview and the final creation call
 * this function with the same point, so the stored
 * geometry is always identical to what was on
 * screen at the moment of the click.
 *
 * The cursor angle is unwrapped against the last
 * sample so it keeps increasing past 180 degrees
 * instead of folding back and reversing the arc.
 * The unwrapped value is written back to the
 * interaction so the next sample continues from it.
 */
function resolveCentrepointArc(
    interaction,
    point
) {
    if (
        !point ||
        interaction.points.length < 2
    ) {
        return null;
    }

    const center =
        interaction.points[0];

    const start =
        interaction.points[1];

    const cursorAngle =
        unwrapAngle(
            Math.atan2(
                point.y -
                    center.y,
                point.x -
                    center.x
            ),
            interaction.arcCursorAngle
        );

    interaction.arcCursorAngle =
        cursorAngle;

    return arcFromCentrePoints(
        center,
        start,
        point,
        cursorAngle
    );
}

function createPreview(
    type,
    geometry
) {
    return {
        id:
            `preview-${type}`,

        type,

        geometry,

        style: {
            stroke: "#1f5c38",
            fill: "none",
            lineWidth: 0.5,
            lineType: "dashed",
            opacity: 1
        }
    };
}

function updatePreview(
    resolution
) {
    const interaction =
        drawingState.interaction;

    /*
     * THE ANALYSIS AXIS PREVIEW FOLLOWS THE CURSOR.
     *
     * Handled before the phase test below, for the same reason the
     * dimension preview is: this placement is not drawing a span. The
     * axis is already determined by the source - its length, its
     * direction, where it starts - and the only thing still undecided
     * is how far above or below the drawing it sits. So there is no
     * first point and no second point; there is a height, and this is
     * where it follows the pointer.
     *
     * The preview geometry is DERIVED on every frame from the source
     * rather than nudged, which is what keeps the axis the same length
     * and the same direction as the source no matter where the cursor
     * goes. A preview that was dragged freely would let the student
     * place a diagram no longer the size of its beam, and find that
     * out only after the click.
     *
     * Written straight onto the interaction for the same reason the
     * dimension preview is: this is a per-frame pointer position and
     * not a change of state, so it must not become a history entry.
     */
    if (
        interaction.phase ===
            "analysis-axis"
    ) {
        const axis =
            analysisAxisForPlacement();

        if (axis) {
            interaction.analysisPlacement = {
                start: axis.start,
                end: axis.end,
                diagramType:
                    interaction.analysisKind,
                heading:
                    ANALYSIS_DIAGRAM_HEADINGS[
                        interaction.analysisKind
                    ] || ""
            };
        }

        return;
    }

    if (
        interaction.phase ===
            "moment-radius"
    ) {
        const centre =
            interaction.startPoint;

        if (centre) {
            /*
             * THE RADIUS FOLLOWS THE CURSOR AS A DISTANCE.
             *
             * Measured in SCREEN pixels from the fixed application
             * point, so the arc the student is sizing is the size it
             * will actually appear at on the sheet. A world distance
             * would make the drawn size depend on the zoom, and the
             * radius chosen at one zoom would produce a different
             * looking symbol at the next.
             *
             * The centre is never touched: the application point is
             * fixed by the first click, and only the size of the
             * symbol around it is being chosen here.
             */
            const scale =
                enggDrawingState
                    .basePixelsPerUnit
                    ? enggDrawingState
                        .basePixelsPerUnit(drawingState) *
                        (Number(
                            drawingState.camera.zoom
                        ) || 1)
                    : 1;

            const reach =
                distance(
                    centre,
                    resolution.effectiveConstructionPoint
                ) * (scale || 1);

            /*
             * A floor, so a click that did not move the pointer still
             * leaves a visible symbol rather than a dot too small to
             * aim at.
             */
            interaction.radiusPx =
                window.enggDrawingRotationalArrow
                    .clampArcRadius(
                        Number.isFinite(reach) && reach > 0
                            ? reach
                            : window.enggDrawingRotationalArrow
                                .DEFAULT_ARC_RADIUS_PX
                    );
        }

        return;
    }

    /*
     * THE DIMENSION PREVIEW FOLLOWS THE CURSOR
     *
     * Handled before the phase test below, because an armed dimension
     * has no construction phase - it is not drawing anything, it is
     * measuring something that already exists and only deciding where
     * to stand while it says so.
     *
     * Written directly to the interaction rather than through
     * setInteraction, because this is a per-frame pointer position
     * and not a change of state: it must not become a history entry,
     * and the renderer already redraws on every move.
     */
    if (
        isAnnotationTool(
            drawingState.activeTool
        ) &&
        interaction.annotationKind
    ) {
        const point =
            resolution.effectiveConstructionPoint;

        if (point) {
            interaction.annotationPlacement =
                {
                    x: point.x,
                    y: point.y
                };
        }

        return;
    }

    if (
        isDimensionTool(
            drawingState.activeTool
        ) &&
        interaction.dimensionRefs?.length
    ) {
        const point =
            resolution.effectiveConstructionPoint;

        if (point) {
            interaction.dimensionPlacement =
                {
                    x: point.x,
                    y: point.y
                };
        }

        return;
    }

    if (
        interaction.phase ===
            "idle"
    ) {
        return;
    }

    /*
     * Most two-click tools need a start point before they have
     * anything to preview. A progressive construction is
     * different: a truss clears its start point between members
     * and still has a live preview, because what it previews is
     * the whole structure so far rather than one span. So the
     * requirement is a start point OR a construction of its own.
     */
    const progressive =
        interaction.phase ===
            "truss-construct" ||
        isLoadBuildPhase(interaction) ||
        isLoadSpanPhase(interaction);

    if (
        !progressive &&
        !interaction.startPoint
    ) {
        return;
    }

    const point =
        resolution.effectiveConstructionPoint;

    interaction.currentPoint =
        point;

    if (
        drawingState.activeTool ===
            "line"
    ) {
        interaction.preview =
            createPreview(
                "line",
                {
                    start:
                        interaction.startPoint,

                    end:
                        point
                }
            );

        if (
            !resolution.inference &&
            !resolution.snapCandidate
        ) {
            setToolMessage(
                "Specify line endpoint"
            );
        } else {
            /*
             * An active inference or snap owns the
             * status line, so show its name instead of
             * letting a stale message linger.
             */
            const feedback =
                [
                    inferenceLabel(
                        resolution.inference
                    ),

                    snapTypeLabel(
                        resolution
                            .snapCandidate
                            ?.type
                    )
                ].filter(Boolean);

            if (feedback.length) {
                setToolMessage(
                    feedback.join(
                        " · "
                    )
                );
            }
        }
    } else if (
        drawingState.activeTool ===
        "circle"
    ) {
        interaction.preview =
            createPreview(
                "circle",
                {
                    center:
                        interaction.startPoint,

                    radius:
                        distance(
                            interaction.startPoint,
                            point
                        )
                }
            );

        setToolMessage(
            "Specify radius"
        );
    } else if (
        drawingState.activeTool ===
        "rectangle"
    ) {
        interaction.preview =
            createPreview(
                "rectangle",
                rectangleGeometry(
                    interaction.startPoint,
                    point
                )
            );

        setToolMessage(
            "Specify opposite corner"
        );
    } else if (
        drawingState.activeTool ===
        "polyline"
    ) {
        interaction.preview =
            createPreview(
                "polyline",
                {
                    points: [
                        ...interaction.points,
                        point
                    ]
                }
            );

        setToolMessage(
            "Click next point or double-click to finish"
        );
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-centre"
    ) {
        /*
         * Radius phase: show the circle the cursor
         * is describing around the fixed centre.
         */
        const radius =
            distance(
                interaction.points[0],
                point
            );

        if (
            radius >
            1e-9
        ) {
            interaction.preview =
                createPreview(
                    "circle",
                    {
                        center: {
                            ...interaction.points[0]
                        },

                        radius
                    }
                );
        } else {
            interaction.preview =
                null;
        }

        setToolMessage(
            "Specify arc start point"
        );
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-sweep"
    ) {
        /*
         * Sweep phase: live arc from the start point
         * through the cursor.
         */
        const geometry =
            resolveCentrepointArc(
                interaction,
                point
            );

        interaction.preview =
            geometry
                ? createPreview(
                    "arc",
                    geometry
                )
                : null;

        setToolMessage(
            "Specify arc endpoint"
        );
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-first"
    ) {
        interaction.preview =
            createPreview(
                "line",
                {
                    start:
                        interaction.points[0],

                    end:
                        point
                }
            );

        setToolMessage(
            "Specify point on arc"
        );
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-second"
    ) {
        /*
         * Third point preview: the circumcircle arc
         * through the two placed points and the cursor.
         */
        const geometry =
            arcThroughThreePoints(
                interaction.points[0],
                interaction.points[1],
                point
            );

        interaction.preview =
            geometry
                ? createPreview(
                    "arc",
                    geometry
                )
                : null;

        /*
         * An active inference or snap owns the status line,
         * otherwise show the next instruction. Without this
         * the plain instruction would overwrite the
         * Horizontal / Vertical / snap label set by the
         * feedback pass, because the preview runs after it.
         */
        const feedback =
            [
                inferenceLabel(
                    resolution.inference
                ),

                snapTypeLabel(
                    resolution.snapCandidate?.type
                )
            ].filter(Boolean);

        setToolMessage(
            feedback.length
                ? feedback.join(" · ")
                : "Specify third point"
        );
    } else if (
        drawingState.activeTool ===
        "triangle"
    ) {
        /*
         * Live preview of all three sides, closed
         * back to the first point.
         */
        interaction.preview =
            createPreview(
                "triangle",
                {
                    points: [
                        ...interaction.points,
                        point
                    ],

                    closed: true
                }
            );

        /*
         * An active inference or snap owns the status
         * line, otherwise show the next instruction.
         */
        const feedback =
            [
                inferenceLabel(
                    resolution.inference
                ),

                snapTypeLabel(
                    resolution.snapCandidate?.type
                )
            ].filter(Boolean);

        setToolMessage(
            feedback.length
                ? feedback.join(" · ")
                : interaction.points.length < 2
                    ? "Specify second point"
                    : "Specify third point"
        );
    } else if (
        drawingState.activeTool ===
            "polygon" &&
        (
            interaction.phase ===
                "polygon-centre" ||
            interaction.phase ===
                "polygon-first"
        )
    ) {
        /*
         * Live polygon. By Centre sizes it from the
         * centre, By Sides builds it from the first
         * edge, but both feed the same preview.
         */
        const geometry =
            polygonFromCursor(
                interaction,
                point
            );

        interaction.preview =
            geometry
                ? createPreview(
                    "polygon",
                    geometry
                )
                : null;

        const feedback =
            [
                inferenceLabel(
                    resolution.inference
                ),

                snapTypeLabel(
                    resolution.snapCandidate?.type
                )
            ].filter(Boolean);

                const instruction =
                    interaction.phase ===
                    "polygon-first"
                    ? "Specify second point"
                    : "Specify polygon radius";

                setToolMessage(
                    feedback.length
                        ? feedback.join(" · ")
                        : instruction
                );
            } else if (
                drawingState.interaction.phase ===
                    "truss-construct"
            ) {
                /*
                 * Live preview of the member in progress. It is drawn
                 * from the same start point the committed member will
                 * use, so the preview and the result agree.
                 */
                interaction.preview =
                    createPreview(
                        "line",
                        {
                            start:
                                interaction.trussInProgress,
                            end: point
                        }
                    );

                /*
                 * The whole construction is handed to the snap
                 * system, so a member snaps to a joint or an
                 * intersection of the members already placed as
                 * readily as it snaps to the finished drawing.
                 */
                interaction.snapGeometry =
                    trussSnapGeometry(
                        {
                            ...interaction,
                            currentPoint: point
                        }
                    );

                interaction.snapQuarterSnap = true;
                interaction.snapToolId = "truss";

                setToolMessage(
                    trussStageMessage(
                        interaction
                    )
                );
            } else if (
                isLoadSpanPhase(
                    drawingState.interaction
                )
            ) {
                /*
                 * While the loaded span is being chosen by hand
                 * the load is previewed as the plain span it will
                 * become, using the same Line preview every other
                 * two-click tool uses.
                 */
                interaction.preview =
                    createPreview(
                        "line",
                        {
                            start:
                                interaction
                                    .points[0],
                            end: point
                        }
                    );

                setToolMessage(
                    constructionFeedbackMessage(
                        resolution,
                        "Specify the end of the loaded span"
                    )
                );
            } else if (
                drawingState.interaction
                    .phase ===
                    "constant-load-build"
            ) {
                /*
                 * A constant load previews as the very field of
                 * parallel arrows it will become, built from the
                 * cursor's own offset from the body. The length
                 * and direction of the preview field therefore
                 * follow the cursor exactly, with no ceiling on
                 * how far the user may pull it.
                 */
                const constant =
                    constantLoadDraft(
                        drawingState.interaction,
                        point
                    );

                interaction.preview =
                    constant
                        ? {
                            id: "preview-constant-load",
                            type: "load",

                            geometry: {
                                start: constant.start,
                                end: constant.end,
                                direction:
                                    constant.direction,

                                /*
                                 * A constant load is the
                                 * degenerate profile: the same
                                 * magnitude at both ends of the
                                 * body. It is stored that way
                                 * rather than as a special
                                 * case, so the renderer, the
                                 * panel and Fit all read one
                                 * model.
                                 */
                                points: [
                                    {
                                        t: 0,
                                        magnitude:
                                            constant.magnitude
                                    },
                                    {
                                        t: 1,
                                        magnitude:
                                            constant.magnitude
                                    }
                                ]
                            },

                            style: {
                                stroke:
                                    drawingState
                                        .styleDefaults
                                        ?.stroke ||
                                    "#1f5c38",
                                fill: "none",
                                lineWidth: 0.5,
                                lineType:
                                    "dashed",
                                opacity: 1
                            }
                        }
                        : null;

                setToolMessage(
                    constructionFeedbackMessage(
                        resolution,
                        "Move to set the load magnitude and direction, then click"
                    )
                );
            } else if (
                drawingState.interaction
                    .phase ===
                    "distributed-load-build"
            ) {
                /*
                 * The load previews as the very feature it is
                 * about to become: a continuous field of parallel
                 * arrows whose lengths follow the cursor. The
                 * preview is rebuilt from the interaction on
                 * every move, so it always shows the load as it
                 * would be committed, including the point the
                 * cursor is currently proposing.
                 */
                const draft =
                    distributedLoadDraft(
                        interaction,
                        point
                    );

                interaction.preview =
                    draft
                        ? {
                            id: "preview-distributed-load",
                            type: "load",

                            geometry: draft,

                            style: {
                                stroke:
                                    drawingState
                                        .styleDefaults
                                        ?.stroke ||
                                    "#1f5c38",
                                fill: "none",
                                lineWidth: 0.5,
                                lineType:
                                    "dashed",
                                opacity: 1
                            }
                        }
                        : null;

                setToolMessage(
                    constructionFeedbackMessage(
                        resolution,
                        interaction
                            .distributedLoadHasProfile
                            ? "Click to add another point, Enter to finish"
                            : "Move to set the first force direction and magnitude, then click"
                    )
                );            } else if (
                    isBodyAttachedTool(
                        drawingState.activeTool
                    ) &&
                    interaction.phase ===
                        "moment-radius"
                ) {
                    /*
                     * THE MOMENT'S SECOND CLICK.
                     *
                     * The application point is already fixed; the cursor
                     * has been sizing the arc. So this click only commits,
                     * and the moment is created at the point the FIRST
                     * click chose rather than at the pointer - which is
                     * what keeps the symbol centred on the load it acts
                     * at rather than wherever the student happened to size
                     * it.
                     */
                    commitMomentPlacement();

                    return;
                }

                if (
                    isBodyAttachedTool(
                        drawingState.activeTool
                    ) &&
                    interaction.phase ===
                        "statics-attach"
                ) {
                /*
                 * Live preview for a body-attached feature.
                 *
                 * The valid locations along the target body are shown
                 * as markers and the body is outlined, so it is clear
                 * what the feature is being attached to and where it
                 * may go. Nothing here enters the feature collection.
                 */
                interaction.preview =
                    bodyAttachedPreview(
                        interaction,
                        resolution,
                        point
                    );

                const attachFeedback =
                    [
                        inferenceLabel(
                            resolution.inference
                        ),

                        snapTypeLabel(
                            resolution.snapCandidate?.type
                        )
                    ].filter(Boolean);

                setToolMessage(
                    attachFeedback.length
                        ? attachFeedback.join(" · ")
                        : staticsBodyMessage(
                              drawingState.activeTool,
                              (interaction.attachmentPoints
                                  ?.length ??
                                  0) + 1
                          )
                );
            } else if (
                STATICS_SPAN_TOOLS[
                    drawingState.activeTool
                ] &&
                interaction.phase ===
                    "statics-span"
            ) {
                /*
                 * Live span preview for the two-click Statics
                 * tools, drawn from the same defining parameters
                 * the committed feature will store, so a Point
                 * Force previews as an arrow and a load as its
                 * span rather than as a plain line.
                 */
                const start = {
                    ...interaction.points[0]
                };

                const end = {
                    x: point.x,
                    y: point.y
                };

                const type =
                    STATICS_CHILD_TOOLS[
                        drawingState.activeTool
                    ]?.type;

                interaction.preview =
                    staticsSpanPreview(
                        type,
                        start,
                        end
                    );

                /*
                 * An active inference or snap owns the status
                 * line, otherwise show the next instruction.
                 */
                const feedback =
                    [
                        inferenceLabel(
                            resolution.inference
                        ),

                        snapTypeLabel(
                            resolution.snapCandidate?.type
                        )
                    ].filter(Boolean);

                                setToolMessage(
                                    feedback.length
                                        ? feedback.join(" · ")
                                        : staticsSpanInstruction(
                                            drawingState.activeTool
                                        )
                                );
                    }
                }

                /*
                 * The preview object for a two-click Statics tool.
         *
         * It reuses the ordinary preview shape for the spans that
         * draw as a line, and a preview type of the feature's own
         * for those that draw as a symbol, so the preview and the
         * committed feature always look the same.
         */
        function staticsSpanPreview(
            type,
            start,
            end
        ) {
            const span = {
                start,
                end
            };

            if (type === "load") {
                return createPreview("load", {
                    ...span,
                    intensity: 10
                });
            }

            if (type === "varying-load") {
                return createPreview("varying-load", {
                    ...span,
                    startIntensity: 0,
                    endIntensity: 10
                });
            }

            if (
                type === "force" ||
                type === "pin-connection" ||
                type === "fixed-connection" ||
                type === "slider-connection"
            ) {
                return createPreview(type, span);
            }

                return createPreview(
                    "line",
                    span
                );
            }

            /*
             * Live preview for a body-attached feature.
             *
             * The valid locations along the target body are shown as small
             * markers, the body is outlined, and the feature to be is drawn
             * from the points placed so far plus the cursor. Nothing here
             * enters the feature collection: the preview is rebuilt on
             * every move and discarded on commit or on Esc.
             */
            function bodyAttachedPreview(
                interaction,
                resolution,
                point
            ) {
                /*
                 * THE MOMENT PREVIEW, DRAWN ABOUT ITS APPLICATION POINT.
                 *
                 * The first click fixed where the moment acts, and the
                 * cursor has been choosing how large the arc is drawn.
                 * So the arc goes round the FIXED point, never round
                 * the pointer - a moment is drawn around the place it
                 * is applied at, and a preview drawn around the cursor
                 * would show a symbol somewhere the moment will not
                 * be.
                 *
                 * Returned as a real Moment, so the preview and the
                 * committed feature are the same curve, the same
                 * tangent arrowhead and the same line weight. There is
                 * no second version of this symbol to keep in step.
                 */
                if (
                    interaction.phase ===
                        "moment-radius"
                ) {
                    const centre =
                        interaction.startPoint;

                    if (!centre) {
                        return null;
                    }

                    return {
                        id: "preview-moment",
                        type: "moment",
                        geometry: {
                            position: { ...centre },
                            magnitude:
                                interaction
                                    .magnitude ?? 50,
                            direction:
                                interaction
                                    .direction || "CCW",
                            arcRadius:
                                interaction.radiusPx
                        },
                        style: {
                            stroke: "#1f5c38",
                            fill: "none",
                            lineWidth: 0.5,
                            lineType: "dashed",
                            opacity: 1
                        }
                    };
                }

                const body =
                    interaction.staticsTarget;

                const placed =
                    interaction.attachmentPoints || [];

                const type =
                    STATICS_CHILD_TOOLS[
                        drawingState.activeTool
                    ]?.type;

                /*
                 * A SUPPORT PREVIEWS WHERE IT WILL ACTUALLY BE.
                 *
                 * Every other body-attached feature previews at the
                 * point it is placed at, because that is where it goes.
                 * A support is the exception: it is ATTACHED to the
                 * centreline and DRAWN outside the body, so a preview
                 * drawn at the snapped point would sit in the middle of
                 * the beam and then jump clear of it on the click.
                 *
                 * That is not a cosmetic difference. The specification
                 * is explicit that the preview must show the placement
                 * the user is about to get, and a symbol that moves when
                 * it is committed is a preview of a DIFFERENT thing -
                 * so the student is placing something other than what
                 * they were shown, which is the whole fault a preview
                 * exists to prevent.
                 *
                 * So the preview carries the PARENT and the attachment
                 * distance, and the renderer derives the exterior
                 * position from them by exactly the same code that
                 * draws the committed feature. There is no second
                 * placement calculation to disagree, and the preview and
                 * the result are the same symbol at the same place.
                 */
                if (
                    body &&
                    isSupportType(type)
                ) {
                    const frame =
                        enggBodyFrames.frameOf(
                            body
                        );

                    if (frame) {
                        const distanceAlong =
                            enggBodyFrames.positionOn(
                                frame,
                                placed[0] ?? point
                            );

                        return {
                            id: "preview-statics-attach",
                            type,

                            /*
                             * The PARENT, so the renderer resolves the
                             * real exterior position rather than drawing
                             * the symbol on the centreline.
                             */
                            parentId: body.id,

                            geometry: {
                                /*
                                 * Where it will be drawn - a starting
                                 * value, recomputed by the renderer from
                                 * the attachment on the same frame it
                                 * would use for the real feature.
                                 */
                                position:
                                    enggBodyFrames
                                        .supportPlacement(
                                            body,
                                            placed[0] ?? point,
                                            false
                                        )?.render ||
                                    { ...(placed[0] ?? point) },

                                attachment: {
                                    distance: distanceAlong
                                },

                                flipped: false
                            },

                            targetBody: body,

                            style: {
                                stroke: "#1f5c38",
                                fill: "none",
                                lineWidth: 0.5,
                                lineType: "dashed",
                                opacity: 1
                            }
                        };
                    }
                }

                const required =
                    staticsToolPointCount(
                        drawingState.activeTool
                    );

                /*
                 * Once the first end is placed the preview spans from it to
                 * the cursor, which is what makes the whole loaded region
                 * visible while the second end is chosen.
                 */
                const spanPoints =
                    required > 1
                        ? [
                              placed[0] ?? point,
                              placed[1] ?? point
                          ]
                        : [placed[0] ?? point];

                return {
                    id: "preview-statics-attach",
                    type: staticsPreviewType(type),

                    geometry: staticsAttachmentGeometry(
                        type,
                        spanPoints
                    ),

                    /*
                     * The target body and the valid locations ride with the
                     * preview rather than being features of their own, so
                     * they can never be selected or listed.
                     */
                    targetBody: body,
                    locations: placed.length
                        ? []
                        : bodyPlacementLocations(
                              body,
                              6
                          ),

                    style: {
                        stroke: "#1f5c38",
                        fill: "none",
                        lineWidth: 0.5,
                        lineType: "dashed",
                        opacity: 1
                    }
                };
            }

/*
 * The preview type for a Statics feature, so a load previews as
 * a load and a support previews as a support rather than as a
 * plain line.
 */
function staticsPreviewType(
    type
) {
    return (
        [
            "load",
            "varying-load",
            "moment",
            "couple",
            "pin-support",
            "roller-support",
            "fixed-support",
            "smooth-support",
            "pin-connection",
            "fixed-connection",
            "slider-connection"
        ].includes(type)
            ? type
            : "point"
    );
}

    /*
     * THE MOMENT, IN TWO CLICKS.
     *
     * The first click is the APPLICATION POINT and it is the whole of
     * what that click decides. The cursor then sets how big the curved
     * arrow is DRAWN while it is still a preview, and a second click
     * commits it.
     *
     * Why two clicks rather than one: the moment is a rotation, and
     * the only thing about it that is genuinely the student's to
     * choose is where it sits and how legible it is. A single click
     * commits both at a default size, and a moment on a small member
     * is then unreadable with no way to have chosen otherwise.
     *
     * Why the application point is FIXED once chosen: it is the point
     * the force acts, and it is the thing the whole symbol is
     * describing. Letting the cursor drag it would mean a moment
     * applied at a load quietly slid somewhere else while the radius
     * was being adjusted, which is precisely the "tidier looking"
     * relocation the specification forbids.
     *
     * The radius follows the cursor as a DISTANCE from that fixed
     * point, so moving the pointer out grows the arc and moving it
     * back in shrinks it - and the arc is drawn through the shared
     * rotational renderer, so the preview is the same curve the
     * committed moment will be.
     */
    function beginMomentPlacement(
        point,
        parentId
    ) {
        enggDrawingState.setInteraction(
            drawingState,
            {
                phase: "moment-radius",

                /*
                 * The clicked point, and it never changes again for the
                 * rest of this construction.
                 */
                startPoint: { ...point },
                currentPoint: { ...point },

                parentId,

                /*
                 * The radius starts at the shared default so the first
                 * frame is a sensible size, and the cursor adjusts it
                 * from there.
                 */
                radiusPx:
                    window.enggDrawingRotationalArrow
                        .DEFAULT_ARC_RADIUS_PX,

                magnitude: 50,
                direction: "CCW"
            }
        );

        setToolMessage(
            "Move the pointer to size the arrow, then click to place the moment"
        );

        renderCurrentDrawing();
    }

    /*
     * COMMIT THE PLACED MOMENT.
     */
    function commitMomentPlacement() {
        const interaction =
            drawingState.interaction;

        const position =
            interaction.startPoint;

        if (!position) {
            return false;
        }

        const previousObjects =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        const object =
            enggDrawingState.geometryFactories.moment(
                { x: position.x, y: position.y },
                interaction.magnitude ?? 50,
                interaction.direction || "CCW",
                {
                    style:
                        drawingState
                            .styleDefaults,

                    parentId:
                        interaction.parentId,

                    name: "Applied Moment"
                }
            );

        /*
         * The radius the student chose, stored as a presentation
         * property. It is written from the interaction rather than
         * recomputed, so the committed moment is the size the preview
         * was showing at the moment of the click.
         */
        object.geometry.arcRadius =
            interaction.radiusPx;

        enggDrawingState.addObject(
            drawingState,
            object
        );

        enggDrawingState.clearInteraction(
            drawingState
        );

        enggDrawingState.commitDrawingChange(
            drawingState,
            previousObjects
        );

        renderProperties();
        renderCurrentDrawing();

        setToolMessage(
            "Moment placed - drag it to move, or use the Features panel to change its direction or magnitude"
        );

        return true;
    }

    /*
     * The preview geometry for a body-attached feature.
 *
 * A span-shaped feature is previewed between its two ends. A
 * point-shaped feature previews at its application point.
 */
function staticsAttachmentGeometry(
    type,
    spanPoints
) {
    if (spanPoints.length > 1) {
        return {
            start: spanPoints[0],
            end: spanPoints[1],
            intensity: 10,
            startIntensity: 0,
            endIntensity: 10
        };
    }

    return {
        position: spanPoints[0]
    };
}

/*
 * Build the polygon definition for the active
 * creation mode.
 *
 * Both modes resolve to the same stored model:
 * centre, radius, sides and rotation. Only the way
 * those are derived from the interaction differs,
 * so there is a single authoritative geometry.
 */
function polygonFromCursor(
    interaction,
    point
) {
    if (
        interaction.polygonMode ===
        "sides"
    ) {
        return polygonFromTwoPoints(
            interaction,
            point
        );
    }

    return polygonFromCentre(
        interaction,
        point
    );
}

/*
 * By Centre: the first click is the centre, and the
 * cursor sets both the radius and the rotation.
 */
function polygonFromCentre(
    interaction,
    point
) {
    const center =
        interaction.points[0];

    if (!center) {
        return null;
    }

    const radius =
        distance(
            center,
            point
        );

    if (
        radius <=
        1e-9
    ) {
        return null;
    }

    return {
        center: {
            ...center
        },

        radius,

        sides:
            polygonSideCount(
                interaction
            ),

        rotation:
            Math.atan2(
                point.y - center.y,
                point.x - center.x
            )
    };
}

/*
 * By Sides: the two clicked points define the first
 * side of the polygon. The centre is the circumcentre
 * of the regular polygon whose first edge runs from
 * the first point to the second, and the rotation is
 * taken from that edge.
 */
function polygonFromTwoPoints(
    interaction,
    point
) {
    const first =
        interaction.points[0];

    if (!first) {
        return null;
    }

    const sideLength =
        distance(
            first,
            point
        );

    if (
        sideLength <=
        1e-9
    ) {
        return null;
    }

    const sides =
        polygonSideCount(
            interaction
        );

    const rotation =
        Math.atan2(
            point.y - first.y,
            point.x - first.x
        );

    /*
     * Circumradius of a regular polygon for a given
     * edge length: R = s / (2 sin(pi / n)).
     *
     * The centre sits at the apothem from the midpoint
     * of the edge, on the inward side.
     */
    const apothem =
        sideLength /
        (
            2 *
            Math.tan(
                Math.PI /
                    sides
            )
        );

    const radius =
        sideLength /
        (
            2 *
            Math.sin(
                Math.PI /
                    sides
            )
        );

    const midpoint = {
        x: (first.x + point.x) / 2,
        y: (first.y + point.y) / 2
    };

    const inward =
        rotation +
        Math.PI / 2;

    return {
        center: {
            x:
                midpoint.x +
                Math.cos(inward) *
                    apothem,

            y:
                midpoint.y +
                Math.sin(inward) *
                    apothem
        },

        radius,

        sides,

        /*
         * The stored rotation places vertex 0 at the
         * first clicked point, so the committed shape
         * starts exactly where the user clicked.
         */
        rotation:
            rotation -
            Math.PI / 2 -
            Math.PI /
                sides
    };
}

/*
 * The side count belongs to the tool, not to the
 * geometry, so the creation modes share one value.
 */
function polygonSideCount(
    interaction
) {
    const sides =
        Math.round(
            Number(
                interaction.polygonSides
            )
        );

    return (
        Number.isFinite(sides) &&
        sides >= 3
            ? sides
            : 6
    );
}

function currentEngineeringMetadata() {
    return {
        plane: "XY"
    };
}

/*
 * The point a truss's next point aligns against.
 *
 * While a member is being drawn that is the member's own start.
 * Between members there is no member in progress, and the point
 * that matters is the structure itself: a new member is almost
 * always dropped from a joint of the truss that is already there,
 * and it is that joint the next point should be compared
 * against.
 *
 * The NEAREST joint is used rather than the last one placed. A
 * student tracing round a panel ends each member at a different
 * corner, so the most recently placed joint is often on the
 * opposite side, and aligning to it would put horizontal and
 * vertical inference in the wrong place exactly when it is
 * wanted.
 */
function trussInferenceAnchor(
    interaction
) {
    if (
        interaction.trussInProgress
    ) {
        return interaction.trussInProgress;
    }

    const members =
        interaction.trussMembers || [];

    if (!members.length) {
        return interaction.startPoint || null;
    }

    const joints = trussJoints(members);

    /*
     * The joint nearest the cursor, so the alignment reference
     * is whichever one the student is actually working from.
     * The point is the last thing written by the move handler,
     * so it is current.
     */
    const cursor =
        interaction.currentPoint ||
        interaction.rawPointerPoint;

    if (!cursor) {
        return members[
            members.length - 1
        ].end;
    }

    let nearest = null;
    let nearestDistance = Infinity;

    joints.forEach(joint => {
        const distance = Math.hypot(
            joint.x - cursor.x,
            joint.y - cursor.y
        );

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = joint;
        }
    });

    return nearest ||
        members[members.length - 1].end;
}

function beginOrCompleteGeometry(
    resolution
) {
    const interaction =
        drawingState.interaction;

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    if (
        interaction.phase ===
        "idle"
    ) {
        /*
         * A Point is defined by a single click, so it is
         * created and committed immediately.
         */
        if (
            drawingState.activeTool ===
            "point"
        ) {
            createPointFeature(
                point
            );

            return;
        }

        /*
         * A Truss is built progressively rather than in two
         * clicks. The first click both starts the construction
         * and anchors the base, so the student does not lose a
         * click to a step that places nothing.
         */
        if (
            drawingState.activeTool ===
                "truss"
        ) {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    phase: "truss-construct",
                    startPoint: point,
                    currentPoint: point,
                    trussStage: 0,
                    trussMembers: [],
                    trussOutline: [],
                    trussInProgress: point,

                    /*
                     * Published from the first click, so the very
                     * first member already snaps to the drawing
                     * it is being added to.
                     */
                    snapGeometry: [
                        {
                            start: point,
                            end: point
                        }
                    ],

                    snapQuarterSnap: true,
                    snapToolId: "truss"
                }
            );

            setToolMessage(
                TRUSS_STAGES[0].followUp
            );

            renderCurrentDrawing();
            return;
        }

        /*
         * A body-attached Statics tool works on a body, not
         * on free space. It first takes its target body, then
         * places itself along that body, so the feature it
         * creates always belongs to something.
         *
         * This runs before the single-click placement path,
         * because a support or a moment placed this way must
         * not be committed before its body is known.
         */
        if (
            isBodyAttachedTool(
                drawingState.activeTool
            ) &&
            !drawingState.interaction
                .staticsTarget
        ) {
            /*
             * Both distributed loads are body-attached, but they
             * bring their own construction with them: they have
             * to be told which body they load, then walk the
             * student through their own definition. So they are
             * routed to that rather than to the generic
             * attachment path.
             */
            if (
                drawingState.activeTool ===
                    "distributed-load" ||
                isVaryingLoadTool()
            ) {
                beginDistributedLoadConstruction(
                    resolution
                );

                return;
            }

            /*
             * A Moment is a free-standing action on a point, not
             * something that only means anything against a body:
             * an applied couple can be drawn anywhere, and in
             * statics that is the common case - moments are applied
             * at joints and at points in free space as often as
             * anywhere else.
             *
             * So a click in empty space places one there, rather
             * than refusing and asking for a body that may not
             * exist. A click ON a body still goes through the
             * attachment path, so the moment is parented to the
             * body it was drawn on and the Features panel can show
             * it relative to that body.
             */
            if (
                drawingState.activeTool ===
                    "applied-moment" &&
                !staticsBodyAtPoint(point)
            ) {
                createStaticsFeature(
                    drawingState.activeTool,
                    point
                );

                return;
            }

            beginStaticsAttachment(
                resolution
            );

            return;
        }

        /*
         * Statics features are also placed with a single
         * click, so they commit immediately and open their
         * Features panel.
         */
        if (
            STATICS_PLACEMENT_TOOLS[
                drawingState.activeTool
            ]
        ) {
            createStaticsFeature(
                drawingState.activeTool,
                point,
                staticsAttachmentId(
                    resolution.snapCandidate
                )
            );

            return;
        }

        /*
         * A span tool anchors on the first click and sets
         * its extent on the second, so each one names its own
         * endpoint instead of borrowing the load wording.
         *
         * The anchor's snap decides the eventual parent, so
         * it is captured here while the snap candidate is
         * still in hand.
         */
        if (
            STATICS_SPAN_TOOLS[
                drawingState.activeTool
            ]
        ) {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        "statics-span",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    parentId:
                        staticsAttachmentId(
                            resolution.snapCandidate
                        ),

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                staticsSpanInstruction(
                    drawingState.activeTool
                )
            );

            renderCurrentDrawing();
            return;
        }

        if (
            drawingState.activeTool ===
            "polygon"
        ) {
            /*
             * By Centre starts with the centre; By Sides
             * starts with the first end of the first
             * edge. Both then take one more canvas point
             * before the side count is chosen.
             */
            const bySides =
                interaction.polygonMode ===
                "sides";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        bySides
                            ? "polygon-first"
                            : "polygon-centre",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                bySides
                    ? "Specify second point"
                    : "Specify polygon radius"
            );

            renderCurrentDrawing();
            return;
        }

        if (
            isArcTool()
        ) {
            const threePoint =
                interaction.arcMode ===
                "three-point";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        threePoint
                            ? "arc-first"
                            : "arc-centre",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                threePoint
                    ? "Specify point on arc"
                    : "Specify arc start point"
            );
        } else {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        "first-point",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                drawingState.activeTool ===
                    "polyline"
                    ? "Specify next point"

                    : drawingState.activeTool ===
                        "circle"
                        ? "Specify radius"

                    : drawingState.activeTool ===
                        "rectangle"
                        ? "Specify opposite corner"

                    : drawingState.activeTool ===
                        "line"
                        ? "Specify line endpoint"

                    : drawingState.activeTool ===
                        "triangle"
                        ? "Specify second point"

                    : "Specify second point"
            );
        }

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
        "polyline"
    ) {
        interaction.points.push(
            point
        );

        interaction.startPoint =
            point;

        interaction.currentPoint =
            point;

        setToolMessage(
            "Click next point or double-click to finish"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
            "triangle" &&
        interaction.points.length < 2
    ) {
        /*
         * Triangle collects its three corner points
         * before creating a single feature. Once the
         * second point is down, the third click falls
         * through to the creation code below so the
         * whole triangle is built in one step.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.startPoint =
            interaction.points[0];

        setToolMessage(
            interaction.points.length < 2
                ? "Specify second point"
                : "Specify third point"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
        "triangle"
    ) {
        /*
         * Third point: complete the triangle from the
         * two stored points plus this one.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;
    }

    if (
        drawingState.activeTool ===
            "polygon" &&
        (
            interaction.phase ===
                "polygon-centre" ||
            interaction.phase ===
                "polygon-first"
        )
    ) {
        /*
         * Second canvas point is placed, then the side
         * count is chosen before anything is created.
         * The polygon stays in preview until the count
         * is confirmed.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "polygon-sides";

        openPolygonSidesPrompt(
            interaction
        );

        renderCurrentDrawing();
        return;
    }

    /*
     * A body-attached feature takes one or more points on
     * its body and is created only once it has all of them,
     * so nothing is committed on this click.
     *
     * Guarded by the tool as well as the phase: a truss under
     * construction is a different operation that lives in the
     * same interaction and must not be swallowed here.
     */
    if (
        isBodyAttachedTool(
            drawingState.activeTool
        ) &&
        drawingState.interaction.phase ===
            "statics-attach"
    ) {
        continueStaticsAttachment(
            resolution
        );

        return;
    } else if (
        drawingState.interaction.phase ===
            "truss-construct"
    ) {
        /*
         * A truss is built one member at a time using the
         * ordinary line interaction, so a click places the next
         * point of a member rather than creating a feature.
         */
        continueTrussConstruction(
            resolution
        );

        return;
    } else if (
        drawingState.interaction.phase ===
            "constant-load-build"
    ) {
        /*
         * A constant load is defined by ONE force, so a single
         * click both reads the cursor and finishes the load.
         * There is nothing to add afterwards and no sequence to
         * walk through, which is what makes it the simpler of
         * the two tools.
         */
        const constant =
            constantLoadDraft(
                drawingState.interaction,
                point
            );

        if (!constant) {
            return;
        }

        enggDrawingState.setInteraction(
            drawingState,
            {
                ...resolution,

                phase:
                    "constant-load-build",

                loadStart: {
                    ...constant.start
                },

                loadEnd: {
                    ...constant.end
                },

                loadDirection:
                    constant.direction,

                loadMagnitude:
                    constant.magnitude,

                parentId:
                    drawingState.interaction
                        .parentId
            }
        );

        finishConstantLoadConstruction();

        return;
    } else if (
        drawingState.interaction.phase ===
            "distributed-load-build"
    ) {
        /*
         * A distributed load takes one magnitude-defining point
         * per click and is finished with Enter, so the click
         * never commits anything on its own.
         */
        continueDistributedLoadBuild(
            resolution
        );

        return;
    } else if (
        drawingState.interaction.phase ===
            "distributed-load-span"
    ) {
        /*
         * The load was started in empty space, so the two-click
         * Line-style span is completed first. The load's
         * construction proper only starts once the region it
         * loads is known.
         */
        const spanEnd = {
            x: point.x,
            y: point.y
        };

        const span = {
            start: interaction.points[0],
            end: spanEnd
        };

        if (isVaryingLoadTool()) {
            startDistributedLoadBuild(span);
        } else {
            startConstantLoadBuild(span);
        }

        return;
    } else if (
        STATICS_SPAN_TOOLS[
            drawingState.activeTool
        ] &&
        interaction.phase ===
            "statics-span"
    ) {
        const previous =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        /*
         * A Reference Line reuses the ordinary line
         * geometry, distinguished only by its statics
         * metadata, so it never becomes a second line
         * primitive.
         */
        const isReferenceLine =
            drawingState.activeTool ===
            "reference-line";

        /*
         * The feature type the active tool creates. It is
         * resolved before it is used, because the attachment
         * below depends on it.
         */
        const type =
            STATICS_CHILD_TOOLS[
                drawingState.activeTool
            ]?.type;

        const style = {
            style: {
                ...drawingState.styleDefaults,

                /*
                 * A Point Force is a symbol rather than an
                 * outline, so it starts heavier than the general
                 * line weight. The same choice is made in
                 * staticsAttachedStyle for the attached path, so
                 * a force dropped on a body and one drawn in free
                 * space are equally heavy.
                 */
                lineWidth:
                    staticsForceLineWidth(
                        drawingState.activeTool
                    ),

                /*
                 * A reference line is construction geometry, so
                 * it starts in the construction line type. It is
                 * a style the student can change afterwards like
                 * any other, and the geometry underneath is a
                 * plain line, so it keeps every Line control.
                 */
                lineType:
                    isReferenceLine
                        ? "construction"
                        : drawingState.styleDefaults.lineType
            },

            engineering: {
                plane: "XY",
                discipline: "statics",

                staticsType:
                    drawingState.activeTool
            },

            /*
             * A Reference Line is named for its statics role
             * rather than its underlying geometry, so it
             * reads as such in the Feature Tree.
             */
            name:
                isReferenceLine
                    ? "Reference Line"
                    : undefined,

            /*
             * The first click's snap is what establishes
             * attachment. If the application point snapped
             * onto an existing engineering body, the new
             * feature is recorded as that body's child, so
             * the Feature Tree shows Beam 1 > Point Force 1
             * instead of two unrelated rows. It reuses the
             * existing snap result; no separate attachment
             * system is involved.
             */
            parentId:
                attachableStaticsType(type) &&
                interaction.parentId
                    ? interaction.parentId
                    : undefined
        };

        const start = {
            ...interaction.points[0]
        };

        const end = {
            x: point.x,
            y: point.y
        };

        /*
         * Dispatch on the feature type, so each span tool
         * builds its own coherent feature with the right
         * arguments. Most take two points, but a distributed
         * load takes an intensity between them and a varying
         * load takes an intensity at each end.
         */
        let object = null;

        if (type === "load") {
            object =
                enggDrawingState.geometryFactories.load(
                    start,
                    end,
                    10,
                    style
                );
        } else if (type === "varying-load") {
            object =
                enggDrawingState.geometryFactories[
                    "varying-load"
                ](
                    start,
                    end,
                    0,
                    10,
                    style
                );
        } else if (
            typeof enggDrawingState.geometryFactories[
                type
            ] === "function"
        ) {
            object =
                enggDrawingState.geometryFactories[
                    type
                ](
                    start,
                    end,
                    style
                );
        }

        if (!object) {
            setToolMessage(
                "That tool could not be created"
            );

            return;
        }

        enggDrawingState.addObject(
            drawingState,
            object
        );

        enggDrawingState.commitDrawingChange(
            drawingState,
            previous
        );

        enggDrawingState.clearInteraction(
            drawingState
        );

        enggDrawingState.selectObject(
            drawingState,
            object.id
        );

        setToolMessage(
            staticsInstruction(
                drawingState.activeTool
            )
        );

        renderProperties();
        renderCurrentDrawing();
        return;
    }

    if (
        isArcTool() &&
        interaction.phase ===
            "arc-centre"
    ) {
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "arc-sweep";

        interaction.preview =
            null;

        setToolMessage(
            "Specify arc endpoint"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        isArcTool() &&
        interaction.phase ===
            "arc-first"
    ) {
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "arc-second";

        interaction.preview =
            null;

        setToolMessage(
            "Specify third point"
        );

        renderCurrentDrawing();
        return;
    }

    const first =
        interaction.startPoint;

    let object = null;

    if (
        drawingState.activeTool ===
        "line"
    ) {
        object =
            enggDrawingState.geometryFactories.line(
                first,
                point,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "circle"
    ) {
        object =
            enggDrawingState.geometryFactories.circle(
                first,

                distance(
                    first,
                    point
                ),

                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "rectangle"
    ) {
        const rectangle =
            rectangleGeometry(
                first,
                point
            );

        object =
            enggDrawingState.geometryFactories.rectangle(
                rectangle.position,
                rectangle.width,
                rectangle.height,
                rectangle.rotation,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "polyline"
    ) {
        object =
            enggDrawingState.geometryFactories.polyline(
                [
                    ...interaction.points
                ],

                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
            "triangle" &&
        interaction.points.length >= 3
    ) {
        /*
         * One Triangle feature built from the three
         * placed points, closed back to the first.
         */
        object =
            enggDrawingState.geometryFactories.triangle(
                [
                    ...interaction.points
                ],

                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-sweep" &&
        interaction.points.length >= 2
    ) {
        /*
         * Centrepoint arc: centre, start point and
         * endpoint are all placed, so the arc is
         * fully determined.
         *
         * This uses the same calculation as the
         * preview, with the same unwrapped cursor
         * angle, so the stored geometry matches what
         * the user just saw.
         */
        const arcGeometry =
            resolveCentrepointArc(
                interaction,
                point
            );

        if (arcGeometry) {
            object =
                enggDrawingState.geometryFactories.arc(
                    arcGeometry.center,

                    arcGeometry.radius,

                    arcGeometry.startAngle,

                    arcGeometry.endAngle,

                    referenceArcOptions()
                );

            if (
                object &&
                object.geometry
            ) {
                object.geometry.sweep =
                    arcGeometry.sweep;
            }
        } else {
            setToolMessage(
                "Start and endpoint must differ from the centre"
            );

            return;
        }
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-second" &&
        interaction.points.length >= 2
    ) {
        /*
         * 3-point arc: the arc is the circumcircle
         * through the three placed points.
         */
        const arcGeometry =
            arcThroughThreePoints(
                interaction.points[0],
                interaction.points[1],
                point
            );

        if (arcGeometry) {
            object =
                enggDrawingState.geometryFactories.arc(
                    arcGeometry.center,

                    arcGeometry.radius,

                    arcGeometry.startAngle,

                    arcGeometry.endAngle,

                    referenceArcOptions()
                );

            if (
                object &&
                object.geometry
            ) {
                object.geometry.sweep =
                    arcGeometry.sweep;
            }
        } else {
            setToolMessage(
                "Points are collinear"
            );

            return;
        }
    }

    if (object) {
        const previousObjects =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        enggDrawingState.addObject(
            drawingState,
            object
        );

        enggDrawingState.commitDrawingChange(
            drawingState,
            previousObjects
        );

        /*
         * Select the new feature so its Features panel
         * opens immediately, matching the Point and
         * Polygon tools.
         */
        enggDrawingState.selectObject(
            drawingState,
            object.id
        );
    }

    enggDrawingState.clearInteraction(
        drawingState
    );

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Create a Point feature and select it, so its
 * Features panel opens straight away.
 */
function createPointFeature(
    point
) {
    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        enggDrawingState.geometryFactories.point(
            {
                x: point.x,
                y: point.y
            },
            {
                style: {
                    ...drawingState.styleDefaults
                },

                engineering:
                    currentEngineeringMetadata()
            }
        );

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

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Specify point"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The coordinate system is ONE feature.
 *
 * It has a single shared origin and four independently
 * adjustable axis extensions: +X, -X, +Y and -Y. All
 * four lengths live on this one object, so it stays a
 * single entry in the Feature Tree while each side can
 * still be extended on its own.
 */
function add2DCoordinateSystem(
    origin
) {
    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const coordinateSystem =
        enggDrawingState.createGeometryObject(
            COORDINATE_SYSTEM_TYPE,
            {
                origin: {
                    x: origin.x,
                    y: origin.y
                },

                xPositiveLength:
                    COORDINATE_SYSTEM_LENGTH,

                xNegativeLength:
                    COORDINATE_SYSTEM_LENGTH,

                yPositiveLength:
                    COORDINATE_SYSTEM_LENGTH,

                yNegativeLength:
                    COORDINATE_SYSTEM_LENGTH
            },
            {
                name:
                    "Coordinate System",

                style: {
                    stroke: "#000000",
                    fill: "none",
                    lineWidth: 0.75,
                    lineType: "solid",
                    opacity: 1
                },

                metadata: {
                    reference: true,
                    coordinateSystem: "2d"
                },

                engineering: {
                    plane: "XY"
                }
            }
        );

    enggDrawingState.addObject(
        drawingState,
        coordinateSystem
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearSelection(
        drawingState
    );

    setToolMessage(
        "Specify origin"
    );

    renderProperties();
    renderCurrentDrawing();
}

function createSvgElement(
    name,
    attributes = {}
) {
    const element =
        document.createElementNS(
            SVG_NAMESPACE,
            name
        );

    Object.entries(
        attributes
    ).forEach(
        ([key, value]) => {
            element.setAttribute(
                key,
                String(value)
            );
        }
    );

    return element;
}

function appendArrowhead(
    group,
    x,
    y,
    direction
) {
    let points;

    if (
        direction ===
        "x"
    ) {
        points =
            `${x},${y} ${x - 7},${y - 4} ${x - 7},${y + 4}`;
    } else if (
        direction ===
        "x-negative"
    ) {
        points =
            `${x},${y} ${x + 7},${y - 4} ${x + 7},${y + 4}`;
    } else if (
        direction ===
        "y"
    ) {
        points =
            `${x},${y} ${x - 4},${y + 7} ${x + 4},${y + 7}`;
    } else {
        points =
            `${x},${y} ${x - 4},${y - 7} ${x + 4},${y - 7}`;
    }

    group.appendChild(
        createSvgElement(
            "polygon",
            {
                points,

                fill:
                    "#000000",

                stroke:
                    "none"
            }
        )
    );
}

function appendCoordinateSystemVisual(
    svg,
    object,
    isSelected = false
) {
    const bounds = {
        width:
            drawingCanvas.clientWidth,

        height:
            drawingCanvas.clientHeight
    };

    const origin =
        enggDrawingState.engineeringToScreen(
            object.geometry.origin,
            bounds,
            drawingState
        );

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const length =
        Math.max(
            15,
            object.geometry.axisLength *
                scale
        );

    const stroke =
        isSelected
            ? "#17643b"
            : (
                object.style?.stroke ||
                "#000000"
            );

    const strokeWidth =
        isSelected
            ? 2
            : Math.max(
                1,
                Number(
                    object.style?.lineWidth
                ) || 1.25
            );

    const group =
        createSvgElement(
            "g",
            {
                class:
                    "drawing-coordinate-system"
            }
        );

    group.appendChild(
        createSvgElement(
            "line",
            {
                x1:
                    origin.x -
                    length,

                y1:
                    origin.y,

                x2:
                    origin.x +
                    length,

                y2:
                    origin.y,

                stroke,

                "stroke-width":
                    strokeWidth
            }
        )
    );

    group.appendChild(
        createSvgElement(
            "line",
            {
                x1:
                    origin.x,

                y1:
                    origin.y +
                    length,

                x2:
                    origin.x,

                y2:
                    origin.y -
                    length,

                stroke,

                "stroke-width":
                    strokeWidth
            }
        )
    );

    appendArrowhead(
        group,
        origin.x + length,
        origin.y,
        "x"
    );

    appendArrowhead(
        group,
        origin.x - length,
        origin.y,
        "x-negative"
    );

    appendArrowhead(
        group,
        origin.x,
        origin.y - length,
        "y"
    );

    appendArrowhead(
        group,
        origin.x,
        origin.y + length,
        "y-negative"
    );

    group.appendChild(
        createSvgElement(
            "circle",
            {
                cx:
                    origin.x,

                cy:
                    origin.y,

                r:
                    isSelected
                        ? 4
                        : 3,

                fill:
                    "#ffffff",

                stroke,

                "stroke-width":
                    strokeWidth
            }
        )
    );

    const xPositiveLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    length +
                    5,

                y:
                    origin.y -
                    6,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    xPositiveLabel.textContent =
        "+X";

    group.appendChild(
        xPositiveLabel
    );

    const xNegativeLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x -
                    length -
                    20,

                y:
                    origin.y -
                    6,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    xNegativeLabel.textContent =
        "-X";

    group.appendChild(
        xNegativeLabel
    );

    const yPositiveLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    6,

                y:
                    origin.y -
                    length -
                    5,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    yPositiveLabel.textContent =
        "+Y";

    group.appendChild(
        yPositiveLabel
    );

    const yNegativeLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    6,

                y:
                    origin.y +
                    length +
                    17,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    yNegativeLabel.textContent =
        "-Y";

    group.appendChild(
        yNegativeLabel
    );

    const originLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    7,

                y:
                    origin.y +
                    16,

                fill:
                    stroke,

                "font-size":
                    10,

                "font-family":
                    "Arial, sans-serif"
            }
        );

    originLabel.textContent =
        "0";

    group.appendChild(
        originLabel
    );

    svg.appendChild(
        group
    );
}

function renderCoordinateSystems() {
    const svg =
        drawingCanvas.querySelector(
            ".drawing-renderer"
        );

    if (!svg) {
        return;
    }

    drawingState.objects
        .filter(
            object =>
                object.type ===
                COORDINATE_SYSTEM_TYPE
        )
        .forEach(
            object => {
                appendCoordinateSystemVisual(
                    svg,
                    object,
                    drawingState.selection
                        .selectedObjectIds
                        .includes(
                            object.id
                        )
                );
            }
        );
}

function renderCurrentDrawing() {
    drawingCanvas.classList.toggle(
        "drawing-tool-active",
        Boolean(
            drawingState.activeTool
        )
    );

    enggDrawingRenderer.renderDrawing(
        drawingState,
        drawingCanvas
    );

    // Keep the inspector in sync with geometry changed by any drawing path.
    // Do not replace a field while the user is editing it.
    if (!drawingProperties.contains(document.activeElement)) {
        const selectedId = drawingState.selection.selectedObjectIds[0];
        const displayedId = drawingProperties.dataset.selectedObjectId || null;
        const current = selectedId && drawingState.objects.find(item => item.id === selectedId);
        const signature = current ? JSON.stringify({
            geometry: current.geometry,
            constraints: current.constraints,
            style: current.style
        }) : '';

        if (displayedId !== (current?.id || null) ||
            drawingProperties.dataset.geometrySignature !== signature) {
            renderProperties();
        }
    }

    updateHistoryControls();

    /*
     * The zoom readout is derived from the camera, not maintained
     * alongside it.
     *
     * There are several places that change the zoom - the buttons, the
     * wheel, the typed value, the sheet that was just loaded - and a
     * mirrored variable set at each of them is a number that can
     * disagree with the thing it mirrors. Reading it back here, in the
     * one function every draw already goes through, means the readout
     * cannot be stale however the zoom was changed, and the buttons
     * that step from it cannot step from a wrong number.
     */
    drawingZoom =
        drawingState.camera.zoom * 100;

    if (drawingZoomValue) {
        drawingZoomValue.value =
            `${Math.round(drawingZoom)}%`;
    }
}

/*
 * The distance from a point to a closed outline.
 *
 * A body made of corners is picked as one shape, so the
 * test is against its whole outline rather than against a
 * single stored anchor point.
 */
function distanceToPolygon(
    point,
    corners
) {
    if (
        !Array.isArray(corners) ||
        corners.length < 2
    ) {
        return Infinity;
    }

    return corners.reduce(
        (nearest, corner, index) => {
            const next =
                corners[
                    (index + 1) %
                        corners.length
                ];

            return Math.min(
                nearest,
                distanceToSegment(
                    point,
                    corner,
                    next
                )
            );
        },
        Infinity
    );
}

function distanceToSegment(
    point,
    start,
    end
) {
    const dx =
        end.x -
        start.x;

    const dy =
        end.y -
        start.y;

    const lengthSquared =
        dx * dx +
        dy * dy;

    const ratio =
        lengthSquared
            ? Math.max(
                0,
                Math.min(
                    1,
                    (
                        (
                            point.x -
                            start.x
                        ) * dx +

                        (
                            point.y -
                            start.y
                        ) * dy
                    ) /
                    lengthSquared
                )
            )
            : 0;

    return distance(
        point,
        {
            x:
                start.x +
                ratio * dx,

            y:
                start.y +
                ratio * dy
        }
    );
}

/*
 * Ray-casting point-in-polygon test, used so clicking
 * inside a closed feature selects it.
 */
function pointInsidePolygon(
    point,
    corners
) {
    if (
        !Array.isArray(corners) ||
        corners.length < 3
    ) {
        return false;
    }

    let inside =
        false;

    for (
        let index = 0, previous = corners.length - 1;
        index < corners.length;
        previous = index, index += 1
    ) {
        const a =
            corners[index];

        const b =
            corners[previous];

        if (!a || !b) {
            continue;
        }

        const straddles =
            a.y > point.y !== b.y > point.y;

        if (!straddles) {
            continue;
        }

        const intersectX =
            ((b.x - a.x) * (point.y - a.y)) /
                (b.y - a.y) +
            a.x;

        if (point.x < intersectX) {
            inside = !inside;
        }
    }

    return inside;
}

/*
 * The four arms of the coordinate system as segments.
 *
 * Shared by hit-testing, handles and snapping so they
 * all agree on the same geometry, and so the four
 * extensions stay independent in one feature.
 */
function coordinateSystemArms(
    geometry
) {
    const origin =
        geometry?.origin;

    if (!origin) {
        return [];
    }

    const fallback =
        Number.isFinite(Number(geometry.axisLength)) &&
        Number(geometry.axisLength) > 0
            ? Number(geometry.axisLength)
            : 25;

    const read = value =>
        Number.isFinite(Number(value)) && Number(value) > 0
            ? Number(value)
            : fallback;

    return [
        {
            kind: "xPositive",
            start: origin,
            end: {
                x: origin.x + read(geometry.xPositiveLength),
                y: origin.y
            }
        },
        {
            kind: "xNegative",
            start: origin,
            end: {
                x: origin.x - read(geometry.xNegativeLength),
                y: origin.y
            }
        },
        {
            kind: "yPositive",
            start: origin,
            end: {
                x: origin.x,
                y: origin.y + read(geometry.yPositiveLength)
            }
        },
        {
            kind: "yNegative",
            start: origin,
            end: {
                x: origin.x,
                y: origin.y - read(geometry.yNegativeLength)
            }
        }
    ];
}

/*
 * A rigid body stores the same shape as a rectangle, so
 * every shared rectangle path can treat the two alike.
 * This keeps one geometry implementation rather than a
 * parallel set of rigid-body branches.
 */
function isRectangleLike(
    object
) {
    return Boolean(
        object &&
        (object.type === "rectangle" ||
            object.type === "rigid-body")
    );
}

/*
 * Is a point on an annotation's words?
 *
 * An annotation has no geometry, so it cannot be picked by proximity to
 * a shape. It is picked the way a reader picks text: by whether the
 * pointer is on the words themselves.
 *
 * The box is worked out from the text the annotation actually shows -
 * asked of the annotation model, so it matches what is drawn, and works
 * before the first render as well as after - and from the font size and
 * line height the renderer uses. A generous margin is added because
 * text is hard to hit with a pointer and a label that cannot be grabbed
 * is a label that cannot be moved, which is the one thing the student
 * most needs to do with it.
 */
function annotationContainsPoint(
    object,
    point
) {
    const placement =
        object.placement;

    if (
        !placement ||
        !Number.isFinite(placement.x) ||
        !Number.isFinite(placement.y)
    ) {
        return false;
    }

    if (object.visible === false) {
        return false;
    }

    const text =
        annotationTextOf(object) || "";

    const fontSize =
        Number(object.style?.fontSize) || 12;

    const lines = String(text)
        .split("\n")
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return false;
    }

    const lineHeight = fontSize * 1.2;

    const widest = Math.max(
        ...lines.map((line) => line.length)
    );

    const halfWidth =
        (widest * fontSize * 0.58) / 2 +
        fontSize * 0.5;

    const halfHeight =
        (lines.length * lineHeight) / 2 +
        fontSize * 0.35;

    return (
        Math.abs(point.x - placement.x) <= halfWidth &&
        Math.abs(point.y - placement.y) <= halfHeight
    );
}

/*
 * The text an annotation currently shows.
 *
 * Delegated to the annotation model, which resolves a generated label
 * from its feature and returns a note's own wording. Read here rather
 * than from `object.text`, because for a generated label that field is
 * deliberately empty - the text is derived, and using the stored field
 * would hit-test against nothing at all.
 */
function annotationTextOf(
    object
) {
    try {
        return (
            window.enggAnnotationModel.textFor(
                object,
                drawingState
            ) || object.text || ""
        );
    } catch (error) {
        return object.text || "";
    }
}

/*
 * Is a point on a dimension's drawn graphics?
 *
 * The same reasoning as an annotation, for the same reason: a dimension
 * is a measurement plus a presentation, and the presentation - its
 * dimension line, its text, its witness lines - is what the student
 * aims at when they want to move it.
 *
 * The extent is taken from the dimension's own graphics, so the hit area
 * is exactly the marks on the drawing rather than a box guessed at here.
 */
function dimensionContainsPoint(
    object,
    point,
    tolerancePixels = DIMENSION_PICK_TOLERANCE_PIXELS
) {
    const graphics =
        safeDimensionGraphics(object);

    if (!graphics) {
        return false;
    }

    /*
     * A GENEROUS, INVISIBLE TARGET.
     *
     * Every mark a dimension draws is reachable: the dimension line,
     * the arrowheads at its ends, the witness lines running back to the
     * geometry, the arc of an angular dimension, and the text itself.
     * A student aims at whichever of those they can see, so whichever
     * they aim at has to be pickable.
     *
     * The tolerance is in SCREEN pixels divided by zoom, so it stays
     * the same physical size on the glass at any magnification - and
     * it affects only this test. Nothing is drawn any thicker.
     */
    const tolerance =
        tolerancePixels /
        Math.max(
            drawingState.camera.zoom,
            0.25
        );

    /*
     * The dimension LINE: the main thing a student aims at, and the
     * one that reads as "the dimension" rather than as its number.
     */
    if (
        graphics.line &&
        distanceToSegment(
            point,
            graphics.line[0],
            graphics.line[1]
        ) <= tolerance
    ) {
        return true;
    }

    /*
     * The TEXT, so the number can be grabbed as well as the line.
     */
    if (
        graphics.textFrame &&
        distanceToSegment(
            point,
            graphics.textFrame,
            graphics.textFrame
        ) <= tolerance
    ) {
        return true;
    }

    /*
     * The ARC, for an angular dimension, which has no straight line.
     */
    if (
        Array.isArray(graphics.arc) &&
        graphics.arc.length > 1
    ) {
        for (
            let i = 1;
            i < graphics.arc.length;
            i += 1
        ) {
            if (
                distanceToSegment(
                    point,
                    graphics.arc[i - 1],
                    graphics.arc[i]
                ) <= tolerance
            ) {
                return true;
            }
        }
    }

    /*
     * WITNESS LINES last: they are thin and dashed, so claiming them
     * before the line and the text would make the label's edges steal
     * clicks meant for the feature it describes.
     */
    return (graphics.extensions || []).some(
        ([from, to]) =>
            from &&
            to &&
            distanceToSegment(point, from, to) <= tolerance
    );
}

/*
 * A dimension's graphics, or null if it cannot be drawn.
 *
 * A dimension whose source has been deleted, or whose measurement
 * cannot be resolved, has no graphics. It must be unpickable rather
 * than throwing during a hit test.
 */
function safeDimensionGraphics(
    object
) {
    try {
        return (
            window.enggDimensionModel.graphicsFor(
                object,
                drawingState
            ) || null
        );
    } catch (error) {
        return null;
    }
}

function objectAtPoint(
    point
) {
    const tolerance =
        4 /
        Math.max(
            drawingState.camera.zoom,
            0.25
        );

    /*
     * DIMENSIONS AND ANNOTATIONS ARE PICKED FIRST.
     *
     * A dimension and an annotation are drawn ON TOP of the geometry
     * they describe - a dimension line runs above a beam, its witness
     * lines touch it, its text sits across the middle of it. Deciding
     * the pick by draw order alone means clicking "125 mm" can select
     * the beam underneath, which is never what the student meant: they
     * aimed at the number.
     *
     * So they are tested first, as a class. If one is under the
     * pointer it wins outright, and only if none is does the ordinary
     * geometry scan run.
     *
     * A deliberate departure from z-order, and confined to this pair of
     * types: among dimensions and annotations themselves normal draw
     * order still decides, so overlapping labels behave as they look.
     */
    const overlay =
        pickDimensionOrAnnotation(point);

    if (overlay) {
        return overlay;
    }

    return [
        ...drawingState.objects
    ]
        .reverse()
        .find(
            object => {
                const geometry =
                    object.geometry;

                /*
                 * AN ANNOTATION IS HIT BY ITS TEXT, not by geometry.
                 *
                 * Every other feature is found by how close the pointer
                 * is to its shape, which is right for a shape and wrong
                 * for a piece of writing: an annotation has no geometry
                 * at all, so the proximity tests below never match it
                 * and a label the student has just placed cannot be
                 * clicked to select, dragged, or edited.
                 *
                 * So the test is the question a reader asks - is the
                 * pointer on the words? - measured against the box the
                 * annotation's own text occupies, at the position it
                 * actually sits.
                 *
                 * Measured from the annotation model rather than from
                 * the DOM so the hit area cannot drift from what is
                 * drawn, and so it works the same before and after the
                 * first render.
                 */
                if (
                    object.type === "annotation"
                ) {
                    return (
                        annotationContainsPoint(
                            object,
                            point
                        )
                    );
                }

                if (
                    object.type === "dimension"
                ) {
                    return (
                        dimensionContainsPoint(
                            object,
                            point
                        )
                    );
                }

                if (
                    object.type ===
                    "coordinate-system-2d"
                ) {
                    /*
                     * The coordinate system is one feature, so
                     * clicking any of its four arms or its
                     * origin selects that single feature.
                     */
                    if (!geometry.origin) {
                        return false;
                    }

                    return (
                        distance(
                            point,
                            geometry.origin
                        ) <=
                            tolerance * 2 ||
                        coordinateSystemArms(
                            geometry
                        ).some(
                            arm =>
                                distanceToSegment(
                                    point,
                                    arm.start,
                                    arm.end
                                ) <= tolerance
                        )
                    );
                }

                /*
                 * A Point Force is a vector, so it is picked
                 * along the arrow rather than only at its
                 * application point. Clicking anywhere on
                 * the arrow selects the one force, never a
                 * piece of it.
                 */
                if (object.type === "force") {
                    return (
                        (geometry.start &&
                            geometry.end &&
                            distanceToSegment(
                                point,
                                geometry.start,
                                geometry.end
                            ) <= tolerance) ||
                        (geometry.start &&
                            distance(
                                point,
                                geometry.start
                            ) <=
                                tolerance * 2)
                    );
                }

                /*
                 * A rigid body is a shape, so it is picked
                 * anywhere inside or on its outline rather
                 * than only at its position anchor. The test
                 * follows whichever shape the body currently
                 * has, so a circular or triangular body is as
                 * easy to click as a rectangular one.
                 */
                if (isRectangleLike(object)) {
                    return (
                        distanceToPolygon(
                            point,
                            enggFeatureGeometry.definingPoints(
                                geometry,
                                object.type ===
                                    "rigid-body"
                                    ? enggFeatureGeometry
                                          .rigidBodyShape(geometry)
                                    : "rectangle"
                            )
                        ) <= tolerance
                    );
                }

                /*
                 * A Couple is drawn as two opposing arrows.
                 * Clicking either one selects the couple,
                 * because the two arrows are renderer
                 * output of that one feature.
                 */
                if (object.type === "couple") {
                    /*
                     * A Couple Moment is a curved arrow, so it is
                     * picked along its curve - and this branch runs
                     * BEFORE the moment branch below, so the two
                     * rotational features are answered by one piece
                     * of code rather than by two that could drift.
                     */
                    return rotationalArrowHit(
                        object,
                        point,
                        tolerance
                    );
                }

                if (object.type === "moment") {
                    return rotationalArrowHit(
                        object,
                        point,
                        tolerance
                    );
                }

                if (
                    object.type ===
                        "support" ||
                    object.type ===
                        "body" ||
                    object.type ===
                        "particle" ||
                    isSupportType(object.type)
                ) {
                    /*
                     * These act at a point, so they are
                     * picked at their position with the same
                     * generous radius as a point.
                     */
                    return (
                        geometry.position &&
                        distance(
                            point,
                            geometry.position
                        ) <=
                            tolerance * 2
                    );
                }

                if (isConnectionType(object.type)) {
                    return (
                        geometry.start &&
                        geometry.end &&
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <= tolerance
                    );
                }

                if (
                    object.type === "load" ||
                    object.type === "varying-load" ||
                    object.type === "beam" ||
                    object.type === "cable" ||
                    object.type === "shaft"
                ) {
                    /*
                     * Spans are picked along their length,
                     * like a line. For a load this means any
                     * of its rendered arrows selects the one
                     * distributed load.
                     */
                    return (
                        geometry.start &&
                        geometry.end &&
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <= tolerance
                    );
                }

                /*
                 * A truss the student built is picked on any of
                 * its own members, so clicking a joint or a web
                 * member selects the one Truss. Its members are
                 * rendering of that feature and are never
                 * selectable on their own.
                 */
                if (
                    object.type === "truss" &&
                    Array.isArray(geometry.members) &&
                    geometry.members.length
                ) {
                    return geometry.members.some(
                        member =>
                            distanceToSegment(
                                point,
                                member.start,
                                member.end
                            ) <= tolerance
                    );
                }

                if (object.type === "truss") {
                    return (
                        geometry.start &&
                        geometry.end &&
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <= tolerance
                    );
                }

                if (
                    object.type ===
                    "point"
                ) {
                    /*
                     * A point has no extent, so allow a
                     * slightly wider pick radius than a
                     * line so it stays easy to click.
                     */
                    return (
                        distance(
                            point,
                            geometry.position ||
                                geometry.point ||
                                geometry
                        ) <=
                        tolerance * 2
                    );
                }

                if (
                    object.type ===
                    "line"
                ) {
                    return (
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <=
                        tolerance
                    );
                }

                if (
                    object.type ===
                    "circle"
                ) {
                    return (
                        Math.abs(
                            distance(
                                point,
                                geometry.center
                            ) -
                            geometry.radius
                        ) <=
                        tolerance
                    );
                }

                if (
                    isRectangleLike(
                        object
                    )
                ) {
                    const left =
                        geometry.position.x;

                    const right =
                        left +
                        geometry.width;

                    const top =
                        geometry.position.y;

                    const bottom =
                        geometry.position.y -
                        geometry.height;

                    const nearHorizontal =
                        point.x >=
                            left -
                            tolerance &&

                        point.x <=
                            right +
                            tolerance &&

                        (
                            Math.abs(
                                point.y -
                                top
                            ) <=
                            tolerance ||

                            Math.abs(
                                point.y -
                                bottom
                            ) <=
                            tolerance
                        );

                    const nearVertical =
                        point.y >=
                            bottom -
                            tolerance &&

                        point.y <=
                            top +
                            tolerance &&

                        (
                            Math.abs(
                                point.x -
                                left
                            ) <=
                            tolerance ||

                            Math.abs(
                                point.x -
                                right
                            ) <=
                            tolerance
                        );

                    return (
                        nearHorizontal ||
                        nearVertical ||
                        /*
                         * Clicking inside a closed shape
                         * selects it, which is what a CAD
                         * user expects, not only clicking
                         * its outline.
                         */
                        pointInsidePolygon(
                            point,
                            rectangleCorners(
                                geometry
                            )
                        )
                    );
                }

                if (
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
                     * Each axis is hit-tested on its own line
                     * segment, so clicking one axis selects
                     * only that axis.
                     */
                    const origin =
                        geometry.origin;

                    if (!origin) {
                        return false;
                    }

                    const length =
                        Number(geometry.axisLength) || 25;

                    const direction =
                        geometry.direction || {
                            x: 1,
                            y: 0
                        };

                    return (
                        distanceToSegment(
                            point,
                            origin,
                            {
                                x:
                                    origin.x +
                                    direction.x * length,

                                y:
                                    origin.y +
                                    direction.y * length
                            }
                        ) <= tolerance
                    );
                }

                if (
                    object.type ===
                    "polygon"
                ) {
                    /*
                     * Hit-test the real edges derived from
                     * the polygon definition, so clicking
                     * any side selects the whole feature.
                     */
                    const vertices =
                        enggDrawingState.polygonVertices(
                            geometry
                        );

                    if (vertices.length < 3) {
                        return false;
                    }

                    return vertices.some(
                        (
                            vertex,
                            index
                        ) =>
                            distanceToSegment(
                                point,
                                vertex,
                                vertices[
                                    (
                                        index + 1
                                    ) %
                                    vertices.length
                                ]
                            ) <=
                            tolerance
                    );
                }

                if (
                    object.type ===
                    "triangle"
                ) {
                    /*
                     * Hit-test the three real sides, so
                     * clicking any visible edge selects
                     * the whole triangle as one feature.
                     */
                    const corners =
                        (geometry.points || []).filter(
                            Boolean
                        );

                    if (corners.length < 3) {
                        return false;
                    }

                    return (
                        corners.some(
                            (
                                corner,
                                index
                            ) => {
                                const next =
                                    corners[
                                        (
                                            index + 1
                                        ) %
                                        corners.length
                                    ];

                                return (
                                    distanceToSegment(
                                        point,
                                        corner,
                                        next
                                    ) <=
                                    tolerance
                                );
                            }
                        ) ||
                        pointInsidePolygon(
                            point,
                            corners
                        )
                    );
                }

                if (
                    object.type ===
                    "polyline"
                ) {
                    return geometry.points.some(
                        (
                            current,
                            index
                        ) =>
                            index > 0 &&
                            distanceToSegment(
                                point,
                                geometry.points[
                                    index - 1
                                ],
                                current
                            ) <=
                            tolerance
                    );
                }

                if (
                    object.type ===
                    "arc"
                ) {
                    const angle =
                        Math.atan2(
                            point.y -
                                geometry.center.y,
                            point.x -
                                geometry.center.x
                        );

                    const radiusDistance =
                        Math.abs(
                            distance(
                                point,
                                geometry.center
                            ) -
                            geometry.radius
                        );

                    if (
                        radiusDistance >
                        tolerance
                    ) {
                        return false;
                    }

                    return angleOnArc(
                        angle,
                        geometry.startAngle,
                        geometry.endAngle,
                        geometry.sweep
                    );
                }

                /*
                 * AN ANALYSIS OBJECT IS ONE THING, PICKED AS ONE
                 * THING.
                 *
                 * A Force Components draws a force, two components and
                 * often labels; a diagram draws an axis, a background
                 * and a row of source markers. Every one of those is
                 * output of a single feature and none of them is a
                 * separate document object, so a click on any of them
                 * must select the WHOLE analysis object. Exposing the
                 * internals would put a dozen unclickable-looking
                 * fragments in the Features list and let a student
                 * drag a reference marker out of its own diagram.
                 *
                 * The pick is generous - a diagram's axis is a hair
                 * line, and its markers are dots - so the test is on
                 * the axis, the markers, the background region and the
                 * vectors together, and the whole thing is one hit.
                 */
                if (
                    enggAnalysisDependencies
                        .isAnalysisObject(object)
                ) {
                    return analysisObjectHit(
                        object,
                        point,
                        tolerance
                    );
                }

                return false;
            }
        );
}

/*
 * Is a point on an Analysis object?
 *
 * A DIAGRAM is picked on its own axis, on any of its source markers,
 * or anywhere inside the region it reserves for the solution. The
 * region is the point of it being forgiving: a student's SFD is
 * mostly whitespace, and a diagram that could only be picked on a
 * one-pixel line would be unusable.
 *
 * A FORCE COMPONENTS or a RESULTANT is picked along any of the
 * vectors it draws, because the vectors are all the student can
 * actually see and aim at.
 *
 * The vectors are given a WIDER pick radius than ordinary geometry.
 * They are thin lines and small arrowheads, and a result the student
 * has to hit to the pixel is a result they cannot select. Only the
 * PICK is widened - nothing is drawn any thicker for it.
 */
function analysisObjectHit(
    object,
    point,
    tolerance
) {
    const geometry = object.geometry || {};

    if (object.type === "analysis-diagram") {
        const axis =
            geometry.zeroAxis ||
            (geometry.start && geometry.end
                ? { from: geometry.start, to: geometry.end }
                : null);

        if (axis) {
            if (
                distanceToSegment(
                    point,
                    axis.from,
                    axis.to
                ) <= tolerance
            ) {
                return true;
            }
        }

        if (
            Array.isArray(geometry.referencePositions) &&
            geometry.referencePositions.some(
                marker =>
                    marker.position &&
                    distance(
                        point,
                        marker.position
                    ) <= tolerance * 2
            )
        ) {
            return true;
        }

        /*
         * The reserved region. Checked as a box rather than as a
         * drawn rectangle because nothing is drawn there - it is
         * space the student is meant to draw in, and an invisible
         * target is the only way it can be both empty and clickable.
         */
        if (axis) {
            const height =
                Number(geometry.drawingHeight) || 90;

            const left =
                Math.min(axis.from.x, axis.to.x);
            const right =
                Math.max(axis.from.x, axis.to.x);
            const top =
                Math.max(
                    axis.from.y,
                    axis.to.y
                ) + height;
            const bottom =
                Math.min(
                    axis.from.y,
                    axis.to.y
                ) - height;

            if (
                point.x >= left - tolerance &&
                point.x <= right + tolerance &&
                point.y >= bottom - tolerance &&
                point.y <= top + tolerance
            ) {
                return true;
            }
        }

        return false;
    }

    const pick = tolerance * 2;

    const segments = [
        geometry.start && geometry.end
            ? [geometry.start, geometry.end]
            : null,

        geometry.horizontal
            ? [geometry.horizontal.start, geometry.horizontal.end]
            : null,

        geometry.vertical
            ? [geometry.vertical.start, geometry.vertical.end]
            : null,

        geometry.original
            ? [geometry.original.start, geometry.original.end]
            : null
    ].filter(Boolean);

    if (
        segments.some(
            ([from, to]) =>
                distanceToSegment(
                    point,
                    from,
                    to
                ) <= pick
        )
    ) {
        return true;
    }

    /*
     * The shared origin. Every vector of a decomposition starts there,
     * so it is the one part a student is certain to aim at - and it is
     * also where the source force's own application point is, so
     * clicking the two in turn is a natural way to work.
     */
    return Boolean(
        geometry.position &&
        distance(
            point,
            geometry.position
        ) <= pick
    );
}

/*
 * Is a point on a Moment's or a Couple Moment's curved arrow?
 *
 * THE SAME ARC THAT IS DRAWN.
 *
 * The test asks enggDrawingRotationalArrow for the arc and then asks
 * that arc whether the point is on it, rather than re-deriving a
 * circle here. That is the whole point of keeping the geometry in one
 * place: a hit test that measured a slightly different arc from the
 * one on screen would make the symbol selectable in places it is not
 * drawn and unselectable where it is, and the gap between those two
 * is exactly the kind of fault a student reports as "it only
 * sometimes works".
 *
 * The pick radius is wider than the drawn line for the same reason a
 * dimension's is: the curve is a thin path and demanding a pixel of
 * accuracy on it is a test of the pointer's steadiness. Only the PICK
 * is widened - the symbol is still drawn as thin as its line weight
 * says, because making it thicker to make it clickable would be
 * changing the drawing to suit the mouse.
 *
 * The position is used for the centre, so a moment moves and its hit
 * area moves with it, and a moment on a beam is picked at the beam,
 * not at the origin of the sheet.
 */
function rotationalArrowHit(
    object,
    point,
    tolerance
) {
    const rotational =
        window.enggDrawingRotationalArrow;

    if (!rotational) {
        return false;
    }

    const geometry = object.geometry;

    if (
        !geometry.position ||
        !Number.isFinite(geometry.position.x) ||
        !Number.isFinite(geometry.position.y)
    ) {
        return false;
    }

    /*
     * The stored radius is in screen pixels, because that is the
     * space the arc is drawn in. The pointer is still in world units,
     * so the comparison is done in screen space too - converting the
     * point through the same mapping the renderer used - and the
     * tolerance is a screen radius for the same reason.
     */
    const arc =
        rotational.arcFor(
            enggDrawingState.engineeringToScreen(
                geometry.position,
                drawingCanvas.getBoundingClientRect(),
                drawingState
            ),
            momentDirectionOf(geometry) === "CW",
            geometry.arcRadius
        );

    return rotational.arcContainsPoint(
        arc,
        enggDrawingState.engineeringToScreen(
            point,
            drawingCanvas.getBoundingClientRect(),
            drawingState
        ),
        Math.max(
            4,
            tolerance *
                drawingState.camera.zoom
        )
    );
}

/*
 * The dimension or annotation under a point, if any.
 *
 * Tested before ordinary geometry so that clicking what a student can
 * SEE - a number, a dimension line, a label - selects that thing
 * rather than the beam lying underneath it.
 *
 * Reverse order among the two, matching how the rest of the drawing is
 * picked: where two labels overlap, the one drawn last is on top and
 * is what was aimed at.
 */
function pickDimensionOrAnnotation(
    point
) {
    return (
        [
            ...drawingState.objects
        ]
            .reverse()
            .find(
                (object) =>
                    (object.type ===
                        "dimension" ||
                        object.type ===
                            "annotation") &&
                    objectAtPointContains(
                        object,
                        point
                    )
            ) || null
    );
}

/*
 * The wider, invisible target a dimension and an annotation are picked
 * by.
 *
 * A dimension is drawn as a thin line a fraction of a pixel wide with
 * small arrowheads. Demanding a pixel-accurate hit on that is a test of
 * the pointer's steadiness, not of the student's aim, and a dimension
 * that cannot be clicked reliably cannot be moved, edited or deleted.
 *
 * So they are picked within about nine screen pixels of their own
 * geometry, which is the size of a comfortable click target.
 *
 * ONLY the pick is widened. Nothing is drawn any thicker: the rendered
 * dimension is exactly as it was, and the tolerance exists purely so
 * that what is visible is also what is reachable.
 */
const DIMENSION_PICK_TOLERANCE_PIXELS = 9;

/*
 * Is a dimension or annotation within reach of this point?
 */
function objectAtPointContains(
    object,
    point
) {
    return (
        object.type === "annotation"
            ? annotationContainsPoint(
                object,
                point
            )
            : dimensionContainsPoint(
                object,
                point,
                DIMENSION_PICK_TOLERANCE_PIXELS
            )
    );
}

function angleOnArc(
    angle,
    startAngle,
    endAngle,
    sweepDirection = null
) {
    const twoPi =
        Math.PI * 2;

    const normalize =
        value =>
            (
                (
                    value %
                    twoPi
                ) +
                twoPi
            ) %
            twoPi;

    const start =
        normalize(
            startAngle
        );

    const end =
        normalize(
            endAngle
        );

    const current =
        normalize(
            angle
        );

    const direction =
        sweepDirection === -1
            ? -1
            : sweepDirection === 1
                ? 1
                : (
                    endAngle >=
                        startAngle
                        ? 1
                        : -1
                );

    const travelled =
        direction > 0
            ? normalize(
                current -
                start
            )
            : normalize(
                start -
                current
            );

    const arcLength =
        direction > 0
            ? normalize(
                end -
                start
            )
            : normalize(
                start -
                end
            );

    if (
        arcLength <
        1e-9
    ) {
        return true;
    }

    return (
        travelled <=
        arcLength +
        1e-9
    );
}

function objectPoints(
    object
) {
    const geometry =
        object.geometry;

    if (
        object.type ===
        "coordinate-system-2d"
    ) {
        return [
            geometry.origin
        ];
    }

    if (
        object.type ===
        "line"
    ) {
        return [
            geometry.start,
            geometry.end
        ];
    }

    if (
        object.type ===
        "polyline"
    ) {
        return geometry.points;
    }

    if (
        object.type ===
        "circle"
    ) {
        return [
            geometry.center
        ];
    }

    if (
        object.type ===
        "rectangle"
    ) {
        return [
            geometry.position,

            {
                x:
                    geometry.position.x +
                    geometry.width,

                y:
                    geometry.position.y
            },

            {
                x:
                    geometry.position.x +
                    geometry.width,

                y:
                    geometry.position.y -
                    geometry.height
            },

            {
                x:
                    geometry.position.x,

                y:
                    geometry.position.y -
                    geometry.height
            }
        ];
    }

    if (
        object.type ===
        "arc"
    ) {
        return [
            {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.startAngle
                    ) *
                    geometry.radius,

                y:
                    geometry.center.y +
                    Math.sin(
                        geometry.startAngle
                    ) *
                    geometry.radius
            },

            {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.endAngle
                    ) *
                    geometry.radius,

                                y:
                                    geometry.center.y +
                                    Math.sin(
                                        geometry.endAngle
                                    ) *
                                    geometry.radius
                            }
                        ];
                    }

                    /*
                     * DIMENSIONS AND ANNOTATIONS.
                     *
                     * These have no geometry of their own in the way a shape
                     * does, so they used to fall through to the empty list and
                     * contribute NOTHING to the drawing's extent. That made Fit
                     * quietly wrong: a dimension is placed deliberately OUTSIDE
                     * the geometry it measures, and an annotation is placed
                     * wherever the student put it, so both are often the
                     * outermost things on the sheet.
                     *
                     * The result was a Fit that framed the geometry and left the
                     * dimension hanging off the edge of the canvas - clipped,
                     * and invisible, which is the one thing a Fit must never do
                     * to content that is really there.
                     *
                     * So both are placed. A dimension contributes its own
                     * presentation position - the offset it was dragged to, NOT
                     * the geometry it measures, because dragging a dimension
                     * must not move the source feature and the extent must
                     * follow the presentation, not the measurement. An
                     * annotation contributes its placement point, together with
                     * the height of its text, because text sits ABOVE the point
                     * it is anchored to and a tall label would otherwise be
                     * half off the top of a fitted view.
                     *
                     * This is the same shared extent function the Fit and the
                     * Drawing References use, so the two cannot disagree about
                     * how big the drawing is.
                     */
                    if (
                        object.type ===
                            "dimension"
                    ) {
                        const offset =
                            geometry.offset ||
                            geometry.placement ||
                            {};

                        return [{
                            x: Number.isFinite(offset.x)
                                ? offset.x
                                : 0,
                            y: Number.isFinite(offset.y)
                                ? offset.y
                                : 0
                        }];
                    }

                    if (
                        object.type ===
                            "annotation"
                    ) {
                        const placement =
                            geometry.placement ||
                            geometry.position ||
                            {};

                        /*
                         * The text's own height, so a tall label is counted
                         * from its anchor rather than hanging out of frame.
                         */
                        const textHeight =
                            Number(
                                geometry.fontSize
                            ) || 12;

                        return [{
                            x: Number.isFinite(placement.x)
                                ? placement.x
                                : 0,
                            y:
                                (Number.isFinite(
                                    placement.y
                                )
                                    ? placement.y
                                    : 0) - textHeight
                        }];
                    }

                    return [];
                }

function pointInsideSelection(
    point,
    selectionBox
) {
    return (
        point.x >=
            selectionBox.minX &&

        point.x <=
            selectionBox.maxX &&

        point.y >=
            selectionBox.minY &&

        point.y <=
            selectionBox.maxY
    );
}

function segmentsIntersect(
    firstStart,
    firstEnd,
    secondStart,
    secondEnd
) {
    const cross = (
        a,
        b,
        c
    ) =>
        (
            b.x -
            a.x
        ) *
        (
            c.y -
            a.y
        ) -
        (
            b.y -
            a.y
        ) *
        (
            c.x -
            a.x
        );

    const onSegment = (
        a,
        point,
        b
    ) =>
        point.x >=
            Math.min(
                a.x,
                b.x
            ) -
            1e-9 &&

        point.x <=
            Math.max(
                a.x,
                b.x
            ) +
            1e-9 &&

        point.y >=
            Math.min(
                a.y,
                b.y
            ) -
            1e-9 &&

        point.y <=
            Math.max(
                a.y,
                b.y
            ) +
            1e-9;

    const c1 =
        cross(
            firstStart,
            firstEnd,
            secondStart
        );

    const c2 =
        cross(
            firstStart,
            firstEnd,
            secondEnd
        );

    const c3 =
        cross(
            secondStart,
            secondEnd,
            firstStart
        );

    const c4 =
        cross(
            secondStart,
            secondEnd,
            firstEnd
        );

    const s1 =
        Math.abs(c1) < 1e-9
            ? 0
            : c1 > 0
                ? 1
                : -1;

    const s2 =
        Math.abs(c2) < 1e-9
            ? 0
            : c2 > 0
                ? 1
                : -1;

    const s3 =
        Math.abs(c3) < 1e-9
            ? 0
            : c3 > 0
                ? 1
                : -1;

    const s4 =
        Math.abs(c4) < 1e-9
            ? 0
            : c4 > 0
                ? 1
                : -1;

    if (
        s1 !== 0 &&
        s2 !== 0 &&
        s1 !== s2 &&
        s3 !== 0 &&
        s4 !== 0 &&
        s3 !== s4
    ) {
        return true;
    }

    if (
        s1 === 0 &&
        onSegment(
            firstStart,
            secondStart,
            firstEnd
        )
    ) {
        return true;
    }

    if (
        s2 === 0 &&
        onSegment(
            firstStart,
            secondEnd,
            firstEnd
        )
    ) {
        return true;
    }

    if (
        s3 === 0 &&
        onSegment(
            secondStart,
            firstStart,
            secondEnd
        )
    ) {
        return true;
    }

    if (
        s4 === 0 &&
        onSegment(
            secondStart,
            firstEnd,
            secondEnd
        )
    ) {
        return true;
    }

    return false;
}

function selectionRectangleEdges(
    selectionBox
) {
    const topLeft = {
        x:
            selectionBox.minX,

        y:
            selectionBox.maxY
    };

    const topRight = {
        x:
            selectionBox.maxX,

        y:
            selectionBox.maxY
    };

    const bottomRight = {
        x:
            selectionBox.maxX,

        y:
            selectionBox.minY
    };

    const bottomLeft = {
        x:
            selectionBox.minX,

        y:
            selectionBox.minY
    };

    return [
        [
            topLeft,
            topRight
        ],

        [
            topRight,
            bottomRight
        ],

        [
            bottomRight,
            bottomLeft
        ],

        [
            bottomLeft,
            topLeft
        ]
    ];
}

function segmentIntersectsSelection(
    start,
    end,
    selectionBox
) {
    if (
        pointInsideSelection(
            start,
            selectionBox
        ) ||
        pointInsideSelection(
            end,
            selectionBox
        )
    ) {
        return true;
    }

    return selectionRectangleEdges(
        selectionBox
    ).some(
        ([edgeStart, edgeEnd]) =>
            segmentsIntersect(
                start,
                end,
                edgeStart,
                edgeEnd
            )
    );
}

function polylineIntersectsSelection(
    points,
    selectionBox
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return false;
    }

    if (
        points.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        )
    ) {
        return true;
    }

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        if (
            segmentIntersectsSelection(
                points[index - 1],
                points[index],
                selectionBox
            )
        ) {
            return true;
        }
    }

    return false;
}

function distanceToSelectionRectangle(
    point,
    selectionBox
) {
    const dx =
        Math.max(
            selectionBox.minX -
                point.x,

            0,

            point.x -
                selectionBox.maxX
        );

    const dy =
        Math.max(
            selectionBox.minY -
                point.y,

            0,

            point.y -
                selectionBox.maxY
        );

    return Math.hypot(
        dx,
        dy
    );
}

function circleIntersectsSelection(
    circle,
    selectionBox
) {
    const center =
        circle.center;

    const radius =
        Math.abs(
            circle.radius
        );

    if (
        pointInsideSelection(
            center,
            selectionBox
        )
    ) {
        return true;
    }

    return (
        distanceToSelectionRectangle(
            center,
            selectionBox
        ) <=
        radius
    );
}

/*
 * Whether a closed outline crosses the rectangle.
 *
 * The same test as for an open polyline, with the first point
 * repeated at the end so the closing side is included.
 */
function polygonIntersectsSelection(
    points,
    selectionBox
) {
    if (
        !points ||
        points.length < 3
    ) {
        return false;
    }

    return polylineIntersectsSelection(
        [
            ...points,
            points[0]
        ],
        selectionBox
    );
}

/*
 * Whether the whole selection rectangle lies inside a circle.
 *
 * This is the other direction of a circle intersection, and it
 * matters because a circle that swallows the rectangle has no
 * part of its own outline inside it. Without it, a circle
 * bigger than the whole drawing area could never be selected.
 */
function rectangleInsideCircle(
    circle,
    selectionBox
) {
    const corners = [
        {
            x: selectionBox.minX,
            y: selectionBox.minY
        },
        {
            x: selectionBox.maxX,
            y: selectionBox.minY
        },
        {
            x: selectionBox.maxX,
            y: selectionBox.maxY
        },
        {
            x: selectionBox.minX,
            y: selectionBox.maxY
        }
    ];

    return corners.every(
        corner =>
            distance(
                corner,
                circle.center
            ) <=
            Math.abs(circle.radius)
    );
}

/*
 * The feature types drawn as a single straight span between
 * two points.
 *
 * They share one selection test and one way of reporting their
 * ends, so they are identified by one predicate rather than by
 * repeating the same list at every call site.
 */
const SPAN_SHAPED_TYPES = [
    "line",
    "beam",
    "cable",
    "shaft",
    "pin-connection",
    "fixed-connection",
    "slider-connection",
    "connection",
    "truss"
];

function isSpanShapedType(
    type
) {
    return SPAN_SHAPED_TYPES.includes(
        type
    );
}

function arcSelectionPoints(
    geometry
) {
    const twoPi =
        Math.PI * 2;

    const normalize =
        value =>
            (
                (
                    value %
                    twoPi
                ) +
                twoPi
            ) %
            twoPi;

    const start =
        geometry.startAngle;

    const end =
        geometry.endAngle;

    const direction =
        geometry.sweep === -1
            ? -1
            : geometry.sweep === 1
                ? 1
                : (
                    end >= start
                        ? 1
                        : -1
                );

    let sweep =
        direction > 0
            ? normalize(
                end -
                start
            )
            : -normalize(
                end -
                start
            );

    if (
        Math.abs(sweep) <
        1e-9
    ) {
        sweep =
            twoPi;
    }

    const segmentCount =
        Math.max(
            32,
            Math.ceil(
                Math.abs(sweep) /
                (
                    Math.PI /
                    72
                )
            )
        );

    const points = [];

    for (
        let index = 0;
        index <=
            segmentCount;
        index += 1
    ) {
        const angle =
            start +
            sweep *
                (
                    index /
                    segmentCount
                );

        points.push({
            x:
                geometry.center.x +
                Math.cos(angle) *
                    geometry.radius,

            y:
                geometry.center.y +
                Math.sin(angle) *
                    geometry.radius
        });
    }

    return points;
}

function arcIntersectsSelection(
    geometry,
    selectionBox
) {
    return polylineIntersectsSelection(
        arcSelectionPoints(
            geometry
        ),
        selectionBox
    );
}

function coordinateSystemIntersectsSelection(
    geometry,
    selectionBox
) {
    const origin =
        geometry.origin;

    const axisLength =
        geometry.axisLength ??
        geometry.xAxisLength ??
        COORDINATE_SYSTEM_LENGTH;

    const xPositiveEnd = {
        x:
            origin.x +
            axisLength,

        y:
            origin.y
    };

    const xNegativeEnd = {
        x:
            origin.x -
            axisLength,

        y:
            origin.y
    };

    const yPositiveEnd = {
        x:
            origin.x,

        y:
            origin.y +
            axisLength
    };

    const yNegativeEnd = {
        x:
            origin.x,

        y:
            origin.y -
            axisLength
    };

    return (
        pointInsideSelection(
            origin,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            xPositiveEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            xNegativeEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            yPositiveEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            yNegativeEnd,
            selectionBox
        )
    );
}

function objectIntersectsSelection(
    object,
    selectionBox
) {
    if (
        !object ||
        !object.geometry ||
        !selectionBox
    ) {
        return false;
    }

    const geometry = object.geometry;

    /*
     * A rigid body, and a rectangle, are areas rather than
     * outlines: a rectangle drawn wholly inside a large rigid
     * body is a meaningful selection, so the closed outline is
     * tested as an area first and its edges are the fallback.
     */
    if (isRectangleLike(object)) {
        const corners =
            objectPoints(object);

        if (
            corners.some(
                corner =>
                    pointInsideSelection(
                        corner,
                        selectionBox
                    )
            )
        ) {
            return true;
        }
    }

    /*
     * A Point Force is a vector, so it is intersected along its
     * whole drawn length. The arrow head sits inside the span
     * of that vector, so the shaft is enough to catch a click
     * anywhere on the arrow.
     */
    if (object.type === "force") {
        return (
            (geometry.start &&
                geometry.end &&
                segmentIntersectsSelection(
                    geometry.start,
                    geometry.end,
                    selectionBox
                )) ||

            (geometry.start &&
                pointInsideSelection(
                    geometry.start,
                    selectionBox
                ))
        );
    }

    /*
     * A distributed load is one feature whatever the number of
     * arrows it draws, so the body it loads is what is tested:
     * selecting part of a load's field selects the whole load.
     */
    if (
        object.type === "load" ||
        object.type === "varying-load"
    ) {
        return (
            (geometry.start &&
                geometry.end &&
                segmentIntersectsSelection(
                    geometry.start,
                    geometry.end,
                    selectionBox
                )) ||
            distributedLoadArrowsIntersect(
                geometry,
                selectionBox
            )
        );
    }

    /*
     * A Truss the student built is drawn as its own members, so
     * any member meeting the rectangle selects the one Truss.
     * That is the point of keeping it as one object rather than
     * as a set of lines.
     */
    if (
        object.type === "truss" &&
        Array.isArray(geometry.members) &&
        geometry.members.length
    ) {
        return geometry.members.some(
            member =>
                segmentIntersectsSelection(
                    member.start,
                    member.end,
                    selectionBox
                )
        );
    }

    /*
     * A span-shaped Statics body: a Beam, Cable or Shaft, a
     * Connection, and a Varying Distributed Load. Each is a real
     * line to the selection test.
     */
    if (
        geometry.start &&
        geometry.end &&
        isSpanShapedType(object.type)
    ) {
        return segmentIntersectsSelection(
            geometry.start,
            geometry.end,
            selectionBox
        );
    }

    /*
     * A Point has no extent, so it is selected when it is in
     * the rectangle.
     */
    if (object.type === "point") {
        return pointInsideSelection(
            geometry.position ||
                geometry.point ||
                geometry,
            selectionBox
        );
    }

    /*
     * The shapes whose drawn outline is what is tested. The
     * closed loops are built with the first point repeated so
     * the closing side is included, exactly as they are drawn.
     */
    if (object.type === "rectangle") {
        const corners =
            objectPoints(object);

        if (
            polygonIntersectsSelection(
                corners,
                selectionBox
            )
        ) {
            return true;
        }

        return corners.some(
            corner =>
                pointInsideSelection(
                    corner,
                    selectionBox
                )
        );
    }

    if (object.type === "polygon") {
        const points =
            enggDrawingState.polygonVertices(
                geometry
            );

        if (points.length < 3) {
            return false;
        }

        if (
            polygonIntersectsSelection(
                points,
                selectionBox
            )
        ) {
            return true;
        }

        return points.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        );
    }

    if (object.type === "triangle") {
        const points =
            (geometry.points || []).filter(
                Boolean
            );

        if (points.length < 3) {
            return false;
        }

        if (
            polygonIntersectsSelection(
                points,
                selectionBox
            )
        ) {
            return true;
        }

        return points.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        );
    }

    if (object.type === "circle") {
        if (
            circleIntersectsSelection(
                geometry,
                selectionBox
            )
        ) {
            return true;
        }

        /*
         * A circle that swallows the whole rectangle counts
         * too: the rectangle is inside the circle, which is a
         * real intersection even though no part of the circle
         * itself is inside it.
         */
        return (
            pointInsideSelection(
                geometry.center,
                selectionBox
            ) ||
            rectangleInsideCircle(
                geometry,
                selectionBox
            )
        );
    }

    if (object.type === "arc") {
        return arcIntersectsSelection(
            geometry,
            selectionBox
        );
    }

    /*
     * A rigid body of any other shape: a circle or a polygon.
     * The outline is tested, and so is containment the other
     * way round, so a small selection inside a big body
     * still finds it.
     */
    if (object.type === "rigid-body") {
        const shape =
            enggFeatureGeometry.rigidBodyShape(
                geometry
            );

        const outline =
            enggFeatureGeometry.definingPoints(
                geometry,
                shape
            );

        if (
            polylineIntersectsSelection(
                [
                    ...outline,
                    outline[0]
                ],
                selectionBox
            )
        ) {
            return true;
        }

        return outline.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        );
    }

    /*
     * Anything else: it is selected if any of the points the
     * object is drawn through is in the rectangle. That is the
     * same generous test the Feature Tree relies on, and it is
     * what keeps a feature with no special case from becoming
     * unselectable.
     */
    return objectPoints(
        object
    ).some(
        point =>
            pointInsideSelection(
                point,
                selectionBox
            )
    );
}

/*
 * Whether any part of a distributed load's arrow field meets
 * the rectangle.
 *
 * The arrows stand off the body in the load's own direction, so
 * a rectangle can catch an arrow while missing the body line
 * entirely. The arrows are rendering, not features, so what is
 * tested here is the same field the renderer draws.
 */
function distributedLoadArrowsIntersect(
    geometry,
    selectionBox
) {
    if (
        !geometry ||
        typeof enggLoadProfile ===
            "undefined"
    ) {
        return false;
    }

    const samples =
        enggLoadProfile.arrowSamples(
            geometry
        );

    if (!samples.length) {
        return false;
    }

    const peak =
        enggLoadProfile.peakMagnitude(
            geometry
        );

    if (peak <= 0) {
        return false;
    }

    const direction =
        enggLoadProfile.unitVector(
            enggLoadProfile.loadDirection(
                geometry
            )
        );

    /*
     * The same screen length a drawn arrow reaches, so the
     * test region matches the ink on the canvas at any zoom.
     */
    const reach =
        distributedLoadArrowScreenLength(
            peak,
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
                (drawingState?.camera?.zoom || 1)
        );

    return samples.some(sample => {
        const tip = {
            x:
                sample.base.x +
                direction.x * reach,
            y:
                sample.base.y +
                direction.y * reach
        };

        return segmentIntersectsSelection(
            sample.base,
            tip,
            selectionBox
        );
    });
}

/*
 * The screen length a distributed load's longest arrow is
 * drawn at.
 *
 * The renderer and the selection test both read it, which is
 * what keeps "what you can select" and "what you can see" the
 * same set of pixels.
 *
 * It follows the arrow's own rule: the magnitude in world units
 * converted at the current zoom. It used to be a fixed ceiling,
 * which meant that once a load was large enough to hit that
 * ceiling the selection test and the fit bounds both stopped
 * growing with the drawing, and a heavier load became impossible
 * to select in the part of its field that had grown past it.
 */
function distributedLoadArrowScreenLength(
    magnitude,
    scale
) {
    const world = Math.max(
        Math.abs(Number(magnitude) || 0),
        0
    );

    if (world <= 0) {
        return 0;
    }

    return world * Math.max(scale, 1e-6);
}

function objectIcon(
    object
) {
    /*
     * featureIcons is the authoritative map from feature type
     * to icon, so the Feature Tree and the Features panel show
     * exactly the same artwork the toolbar uses for the tool
     * that created the feature.
     */
    const featureIcon =
        featureIcons[object.type];

    if (featureIcon) {
        return featureIcon;
    }

    return (
        toolIcons[
            object.type[0].toUpperCase() +
            object.type.slice(1)
        ] ||
        toolIcons.Line ||
        ""
    );
}

function componentGroups() {
    const groups =
        new Map();

    drawingState.objects.forEach(
        object => {
            /*
             * A child is drawn under its parent, so it must
             * not also be listed as a root row. A parent that
             * no longer exists leaves the feature as a root,
             * which is what keeps an old saved file readable.
             */
            const parent =
                drawingState.objects.find(
                    candidate =>
                        candidate.id ===
                            object.parentId
                );

            if (parent) {
                return;
            }

            /*
             * Features are grouped by the discipline that
             * created them. A statics feature keeps its
             * STATICS identity even when it reuses shared
             * geometry, so a Force never appears as a Line.
             */
            let group =
                object.engineering?.discipline ===
                    "statics"
                    ? "Statics"
                    : "Geometry";

            if (
                group === "Geometry" &&
                object.type ===
                    "construction"
            ) {
                group =
                    "Construction";
            } else if (
                group === "Geometry" &&
                object.type ===
                    COORDINATE_SYSTEM_TYPE
            ) {
                group =
                    "Reference";
            }

            if (
                !groups.has(
                    group
                )
            ) {
                groups.set(
                    group,
                    []
                );
            }

            groups
                .get(group)
                .push(object);
        }
    );

    return groups;
}

/*
 * The features that belong to some other feature.
 *
 * A child is drawn beneath its parent rather than as a row
 * of its own, so a Point Force snapped onto a Beam reads as
 * Beam 1 > Point Force 1 and never appears twice.
 */
/*
 * Which Feature Tree branches the student has folded away.
 *
 * This is presentation only. It records nothing about the
 * features themselves, so a collapsed body still carries its
 * children and they still move and rotate with it.
 */
const collapsedComponents = new Set();

function componentChildren(
    parent
) {
    return drawingState.objects.filter(
        object =>
            object.parentId ===
                parent.id
    );
}

/*
 * One Feature Tree row, with its children indented
 * beneath it.
 *
 * The icon is resolved from the feature's own type, so the
 * tree always shows the real engineering identity of the
 * feature rather than whichever tool happens to be active.
 */
function componentRowMarkup(
    object,
    depth
) {
    const selected =
        drawingState.selection
            .selectedObjectIds
            .includes(
                object.id
            ) ||

        drawingState.selection
            .boxSelectionIds
            ?.includes(
                object.id
            );

    const children =
        componentChildren(object);

    /*
     * A feature that has children can be folded away. The
     * disclosure is a separate control from the row so
     * clicking the name still selects the feature rather than
     * toggling it.
     *
     * Collapsing is presentation only: the children stay
     * attached to this body whatever the row is showing, so a
     * folded Beam still carries its loads and its rotation
     * still transforms them.
     */
    const expanded =
        !collapsedComponents.has(object.id);

    const hasChildren =
        children.length > 0;

    return `
        <div
            class="drawing-component-branch"
            data-branch-id="${object.id}"
        >
            <div class="drawing-component-node">
                ${hasChildren
                    ? `<button
                        class="drawing-component-twisty${expanded ? " expanded" : ""}"
                        type="button"
                        data-twisty="${object.id}"
                        aria-expanded="${expanded}"
                        aria-label="${expanded ? "Collapse" : "Expand"} ${object.name}"
                    >${expanded ? "▾" : "▸"}</button>`
                    : '<span class="drawing-component-twisty-spacer" aria-hidden="true"></span>'}

                <button
                    class="drawing-component-row${selected ? " selected" : ""}${depth > 0 ? " drawing-component-row-child" : ""}"
                    type="button"
                    data-object-id="${object.id}"
                    aria-pressed="${selected}"
                    aria-expanded="${hasChildren ? expanded : undefined}"
                >
                    ${objectIcon(object)}
                    <span>${object.name}</span>
                </button>
            </div>

            ${hasChildren && expanded
                ? children
                      .map(
                          child =>
                              componentRowMarkup(
                                  child,
                                  depth + 1
                              )
                      )
                      .join("")
                : ""}
        </div>
    `;
}

function renderComponentTree() {
    const groups =
        componentGroups();

    drawingProperties.dataset.selectedObjectId = '';
    drawingProperties.dataset.geometrySignature = '';

    if (
        !drawingState.objects.length
    ) {
        drawingProperties.innerHTML =
            '<div class="drawing-inspector-message">No components</div>';

        return;
    }

    const selectedCount =
        drawingState.selection
            .selectedObjectIds.length;

    const summary =
        selectedCount > 1
            ? `<div class="drawing-selection-summary">${selectedCount} components selected</div>`
            : "";

    const tree =
        [...groups.entries()]
            .map(
                ([groupName, objects]) => `
                    <div class="drawing-component-group">
                        ${groupName}
                    </div>

                    ${objects
                        .map(
                            object =>
                                componentRowMarkup(
                                    object,
                                    0
                                )
                        )
                        .join("")}
                `
            )
            .join("");

    drawingProperties.innerHTML =
        `${summary}<div class="drawing-component-tree">${tree}</div>`;

    drawingProperties
        .querySelectorAll(
            ".drawing-component-row"
        )
        .forEach(
            row => {
                row.addEventListener(
                    "click",
                    () => {
                        const id =
                            row.dataset
                                .objectId;

                        /*
                         * Clicking the selected row a SECOND
                         * time opens its editing page.
                         *
                         * The first click on a row records the
                         * pick and leaves the list on screen;
                         * the next click on that same row is the
                         * deliberate step into editing. A feature
                         * is selected automatically when it is
                         * created, so the test cannot simply be
                         * "is this row selected" - that is true
                         * from the start - and this is the flag
                         * that distinguishes the first click from
                         * the repeat.
                         */
                        const pickedAlready =
                            featurePanelView === 'tree' &&
                            featureTreePickedId === id;

                        if (pickedAlready) {
                            featurePanelView = 'edit';
                            featureTreePickedId = null;
                        } else {
                            featureTreePickedId = id;
                        }

                        enggDrawingState.selectObject(
                            drawingState,
                            id
                        );

                        renderProperties();
                        renderCurrentDrawing();
                    }
                );
            }
        );

    /*
     * CLICKING THE PANEL ITSELF DESELECTS.
     *
     * The rows above bind individually, so a click that lands on the
     * blank space below them - on a group heading, on the gap between
     * two groups, or on empty panel - reaches no row and does nothing
     * at all. The panel and the canvas then disagree: a feature is
     * still highlighted here and still selected there, with no way to
     * clear it short of hunting for its row.
     *
     * So a click anywhere on the panel that did NOT land on a row, a
     * twisty, or another control clears the selection - the same thing
     * clicking empty canvas does, which is what "the panel and the
     * canvas are two views of one selection" has to mean.
     *
     * Bound on the CONTAINER so it covers the whole panel including the
     * space after the last row, and it checks what was hit before
     * acting, so a click a row handled is left alone rather than being
     * immediately undone by this.
     */
    drawingProperties.addEventListener(
        "click",
        (event) => {
            /*
             * A row, a twisty, or a control has its own handling.
             */
            if (
                event.target.closest(
                    ".drawing-component-row," +
                    ".drawing-component-twisty," +
                    "button," +
                    "input," +
                    "select," +
                    "a," +
                    "label"
                )
            ) {
                return;
            }

            /*
             * The inspector may be showing an editing page rather than
             * the tree. Deselecting there would throw away the page the
             * student is on, which is not what clicking a gap in it
             * means. Only the list itself clears.
             */
            if (featurePanelView !== "tree") {
                return;
            }

            if (
                (drawingState.selection
                    .selectedObjectIds.length === 0 &&
                    featureTreePickedId === null)
            ) {
                return;
            }

            enggDrawingState.clearSelection(
                drawingState
            );

            featureTreePickedId = null;

            renderProperties();
            renderCurrentDrawing();
        }
    );

    /*
     * The disclosure control folds a branch's children away.
     *
     * Selecting a parent does not collapse it, so a click
     * that means "select this body" is never mistaken for a
     * click that means "hide what is attached to it".
     */
    drawingProperties
        .querySelectorAll(
            ".drawing-component-twisty"
        )
        .forEach(
            control => {
                control.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();

                        const id =
                            control.dataset
                                .twisty;

                        if (
                            collapsedComponents.has(id)
                        ) {
                            collapsedComponents.delete(id);
                        } else {
                            collapsedComponents.add(id);
                        }

                        renderProperties();
                    }
                );
            }
        );
}

function renderProperties() {
    syncStyleControls();

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
        featurePanelView = "tree";

        renderComponentTree();

        return;
    }

    if (featurePanelView !== "edit") {
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

    drawingProperties.innerHTML = featurePropertyMarkup(object);
    drawingProperties.dataset.selectedObjectId = object.id;
    drawingProperties.dataset.geometrySignature = JSON.stringify({
        geometry: object.geometry,
        constraints: object.constraints,
        style: object.style
    });
    enhanceNumericInputs(drawingProperties);
    bindFeaturePropertyControls(object);
}

/*
 * Triangle measurements derived from the actual
 * geometry. The stored points are always the source
 * of truth; these are calculated from them.
 */
function triangleMeasurements(
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

function trianglePropertyMarkup(
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

    const number = value =>
        Number(value).toFixed(2);

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

    return `<div class="drawing-properties-block">
        <div class="drawing-properties-title">${object.name}</div>
        ${rows.join("")}
    </div>`;
}

/*
 * Appearance controls shared by the property editors.
 * Real <select> and numeric inputs, so both keyboard
 * entry and the spinner arrows work.
 */
function appearanceMarkup(
    object
) {
    /*
     * A Particle is a point body: it is drawn as a filled
     * marker, so a line type or a line width would describe
     * something that does not exist for it. It is therefore
     * the one feature that carries no APPEARANCE section,
     * rather than showing controls that cannot do anything.
     */
    if (object.type === "particle") {
        return "";
    }

    const style =
        object.style || {};

    const option = (
        value,
        label
    ) =>
        `<option value="${value}"${style.lineType === value ? " selected" : ""}>${label}</option>`;

    /*
     * Every line type the renderer knows how to draw is offered
     * here, so the panel always reflects the feature's actual
     * style.
     *
     * "Construction" was missing, which had a real consequence:
     * a feature stored as construction geometry had no matching
     * option, so no option could be marked selected and the
     * control silently displayed the first entry instead. The
     * panel then disagreed with the drawing, and changing the
     * type would have quietly replaced a real value. The list
     * is read from the same vocabulary applyStyle renders, so
     * the two stay in step.
     */

    return `
        <div class="drawing-properties-section">APPEARANCE</div>
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Line Type</span>
            <select data-style="lineType" aria-label="Line Type">
                ${option("solid", "Solid")}
                ${option("dashed", "Dashed")}
                ${option("center", "Centre")}
                ${option("construction", "Construction")}
            </select>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Line Width</span>
            <input type="number" step="0.05" min="0.05"
                data-style="lineWidth"
                aria-label="Line Width"
                value="${Number(style.lineWidth).toFixed(2)}">
            <span class="drawing-property-unit">mm</span>
            <span></span>
        </div>
    `;
}


/*
 * The Optimize control on a Truss's Features panel.
 *
 * Optimize tidies the structure the student drew: it squares up
 * the members and closes up the joints, so a hand-built truss
 * reads evenly. It is a button rather than a field because it is
 * an action on the geometry, not a number that can be typed, and
 * it is offered on the truss because evenness is a property of a
 * real structure rather than a drawing style.
 */
function trussOptimizeMarkup() {
    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Structure</span>
            <button type="button" class="drawing-property-action"
                data-truss-optimize aria-label="Optimize truss">
                Optimize
            </button>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;
}

/*
 * Even out the geometry a truss is actually made of.
 *
 * The intent is to make a hand-drawn structure read evenly. The
 * members and joints the student placed are the truss; this acts
 * on those and on nothing else. It is emphatically NOT a matter
 * of fitting the truss to a regular outer shape: the shape is
 * whatever the members describe, and no member is removed, added
 * or moved far. What it corrects is the small inconsistencies
 * that stop a structural drawing looking right, and which are
 * invisible as a picture but obvious as numbers:
 *
 *   - a member drawn a hair too long, or a fraction of a degree
 *     off horizontal or vertical, is squared up;
 *   - a joint placed a fraction of a millimetre from where the
 *     members meeting it actually cross is moved onto the
 *     crossing;
 *   - a member whose two ends coincide, or whose length has
 *     collapsed to nothing, is dropped, because it contributes
 *     no structure and would otherwise count as a member.
 *
 * The topology and the proportions the student chose therefore
 * survive; only the drawing inaccuracies are removed.
 */
function optimizeTrussStructure(
    object
) {
    const geometry = object.geometry;

    if (
        !geometry ||
        !Array.isArray(geometry.members) ||
        !geometry.members.length
    ) {
        return false;
    }

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
            drawingState.camera.zoom ||
        1;

    /*
     * Everything below this distance on screen is a drawing
     * inaccuracy rather than a real dimension, so it is the
     * threshold the cleanup works to. It is deliberately small:
     * a truss is only improved if a change is a rounding error.
     */
    const tolerance =
        2.5 / scale;

    const members =
        geometry.members.map(member => ({
            start: { ...member.start },
            end: { ...member.end }
        }));

    /*
     * STEP 1: MERGE THE JOINTS.
     *
     * Two points that are the same joint drawn twice are brought
     * onto one point, and that point is placed at the average of
     * the two so neither end of the structure is favoured. This
     * is what makes members that were MEANT to meet actually meet.
     */
    const joints = [];

    members.forEach(member => {
        [member.start, member.end].forEach(point => {
            const existing = joints.find(
                candidate =>
                    Math.hypot(
                        candidate.x - point.x,
                        candidate.y - point.y
                    ) <= tolerance
            );

            if (existing) {
                existing.x =
                    (existing.x + point.x) / 2;

                existing.y =
                    (existing.y + point.y) / 2;

                return;
            }

            joints.push({
                x: point.x,
                y: point.y
            });
        });
    });

    members.forEach(member => {
        member.start =
            joints.find(
                point =>
                    Math.hypot(
                        point.x - member.start.x,
                        point.y - member.start.y
                    ) <= tolerance
            ) || member.start;

        member.end =
            joints.find(
                point =>
                    Math.hypot(
                        point.x - member.end.x,
                        point.y - member.end.y
                    ) <= tolerance
            ) || member.end;
    });

    /*
     * STEP 2: SQUARE UP THE MEMBERS.
     *
     * A member that was meant to be horizontal, vertical or at
     * a right angle to another is one click from being any of
     * those, and the error is a rounding error. Rounding each
     * member's direction to the nearest of the angles the
     * drawing actually uses, and its ends to the nearest joint,
     * is what makes a hand-built structure read as a structure
     * rather than as a sketch of one.
     *
     * The length is preserved: only the DIRECTION is squared up,
     * so the proportions the student chose are not changed.
     */
    const angles = [
        0,                    /* horizontal */
        Math.PI / 4,
        Math.PI / 2,          /* vertical */
        (3 * Math.PI) / 4,
        -Math.PI / 4,
        -Math.PI / 2,
        (-3 * Math.PI) / 4,
        Math.PI
    ];

    members.forEach(member => {
        const dx = member.end.x - member.start.x;
        const dy = member.end.y - member.start.y;

        const length = Math.hypot(dx, dy);

        /*
         * A member that has collapsed to nothing carries no
         * structure, and rounding its direction would be
         * meaningless, so it is left for the next step to drop.
         */
        if (length <= tolerance) {
            return;
        }

        const angle = Math.atan2(dy, dx);

        const squared =
            angles.reduce(
                (best, candidate) =>
                    Math.abs(normalizeAngle(candidate - angle)) <
                    Math.abs(normalizeAngle(best - angle))
                        ? candidate
                        : best,
                angle
            );

        /*
         * The error is only corrected when it really is a
         * rounding error. A member deliberately drawn at, say,
         * 30 degrees is left at 30 degrees: it is already
         * aligned with nothing else, so squaring it would change
         * the design rather than tidy it.
         */
        if (
            Math.abs(normalizeAngle(squared - angle)) * length >
            tolerance
        ) {
            return;
        }

        const cos = Math.cos(squared);
        const sin = Math.sin(squared);

        member.start = {
            x: member.end.x - cos * length,
            y: member.end.y - sin * length
        };

        member.end = {
            x: member.start.x + cos * length,
            y: member.start.y + sin * length
        };
    });

    /*
     * STEP 3: DROP WHAT IS NOT A MEMBER.
     *
     * A member of zero length, or one duplicated back onto itself,
     * is not part of the structure: it is an artifact of a click
     * that landed on the point the student was already at. It is
     * removed so the member count the student sees is the number
     * of members they actually drew.
     */
    const cleaned = members.filter(member => {
        const length =
            Math.hypot(
                member.end.x - member.start.x,
                member.end.y - member.start.y
            );

        if (length <= tolerance) {
            return false;
        }

        return !members.some(other =>
            other !== member &&
            trussMembersMatch(member, other) &&
            members.indexOf(other) < members.indexOf(member)
        );
    });

    if (!cleaned.length) {
        return false;
    }

    /*
     * STEP 4: RE-MERGE AFTER SQUARING.
     *
     * Squaring a member can bring its end onto a joint it was a
     * rounding error away from, so the joints are merged once
     * more. The merge is what makes the finished structure
     * genuinely connected rather than merely close.
     */
    const finalJoints = [];

    cleaned.forEach(member => {
        [member.start, member.end].forEach(point => {
            const existing = finalJoints.find(
                candidate =>
                    Math.hypot(
                        candidate.x - point.x,
                        candidate.y - point.y
                    ) <= tolerance
            );

            if (existing) {
                existing.x =
                    (existing.x + point.x) / 2;

                existing.y =
                    (existing.y + point.y) / 2;

                return;
            }

            finalJoints.push({
                x: point.x,
                y: point.y
            });
        });
    });

    cleaned.forEach(member => {
        member.start =
            finalJoints.find(
                point =>
                    Math.hypot(
                        point.x - member.start.x,
                        point.y - member.start.y
                    ) <= tolerance
            ) || member.start;

        member.end =
            finalJoints.find(
                point =>
                    Math.hypot(
                        point.x - member.end.x,
                        point.y - member.end.y
                    ) <= tolerance
            ) || member.end;
    });

    /*
     * STEP 4: EVEN OUT THE TRIANGLES.
     *
     * Merging the joints and squaring the members make the
     * structure tidy. They do not make it EVEN, and evenness is
     * what a truss is judged on: a truss of wildly different
     * triangles is a weak truss however neatly it is drawn.
     *
     * The triangles are found from the members themselves, by
     * taking every triple of members that meets three shared
     * joints. That is the real triangulation of the structure
     * the student built, not a pattern imposed on it, which is
     * what makes the improvement act on the truss that is there
     * rather than on an idealised one.
     *
     * Only SIZE is evened out, never the layout: a joint moves
     * only towards the average of the joints it connects to,
     * only if that reduces the spread of triangle areas, and
     * only within the angular band its own members were drawn
     * in. So a horizontal member stays horizontal, a vertical
     * one stays vertical, and the structure is never rotated
     * into a regular polygon.
     */
    evenTrussTriangleSizes(
        cleaned,
        tolerance
    );

    /*
     * The optimized members become the truss's topology, exactly
     * as the students' own members did. This is still one Truss
     * with its own members and joints, not a set of Lines, and
     * the feature keeps its id, its name and anything attached
     * to it.
     */
    geometry.members = cleaned;

    geometry.start = {
        ...cleaned[0].start
    };

    geometry.end = {
        ...cleaned[cleaned.length - 1].end
    };

    geometry.panels =
        Math.max(2, cleaned.length);

    return true;
}

/*
 * The triangles a set of truss members actually forms.
 *
 * Three members give a triangle when each pair of them shares a
 * joint. Those are exactly the closed three-sided cells of the
 * structure, and their areas are what "triangle size" means when
 * a truss is judged on how even its members are.
 *
 * This reads the members, so the triangles follow the truss that
 * was drawn rather than any assumed pattern of them.
 */
function trussTriangles(
    members
) {
    const triangles = [];

    for (let a = 0; a < members.length; a += 1) {
        for (let b = a + 1; b < members.length; b += 1) {
            for (
                let c = b + 1;
                c < members.length;
                c += 1
            ) {
                const corners =
                    sharedJointsOfThree([
                        members[a],
                        members[b],
                        members[c]
                    ]);

                if (corners.length !== 3) {
                    continue;
                }

                triangles.push({
                    corners,
                    area: triangleArea(corners)
                });
            }
        }
    }

    return triangles;
}

/*
 * The three distinct points where a trio of members meet
 * pairwise, or an empty list when they do not close a triangle.
 *
 * Two members meet when an end of one coincides with an end of
 * the other, which is the joint test the rest of the truss uses.
 */
function sharedJointsOfThree(
    trio
) {
    const meet = (first, second) => {
        for (
            const point of [
                first.start,
                first.end
            ]
        ) {
            for (
                const other of [
                    second.start,
                    second.end
                ]
            ) {
                if (trussJointMatches(point, other)) {
                    return { ...point };
                }
            }
        }

        return null;
    };

    const corners = [
        meet(trio[0], trio[1]),
        meet(trio[1], trio[2]),
        meet(trio[0], trio[2])
    ];

    if (corners.some((corner) => !corner)) {
        return [];
    }

    /*
     * All three corners must be genuinely different points. A
     * trio that meets twice at the same joint closes no
     * triangle, and counting it would make a degenerate shape
     * look like a real cell of the truss.
     */
    const distinct = corners.every(
        (corner, index) =>
            corners.every(
                (other, otherIndex) =>
                    index === otherIndex ||
                    !trussJointMatches(corner, other)
            )
    );

    return distinct ? corners : [];
}

function triangleArea(
    corners
) {
    const [a, b, c] = corners;

    return (
        Math.abs(
            (b.x - a.x) * (c.y - a.y) -
                (c.x - a.x) * (b.y - a.y)
        ) / 2
    );
}

/*
 * How far the triangle areas differ from one another.
 *
 * The gap between the largest and the smallest is the measure,
 * because reducing it evens the structure: it falls when the
 * outliers come in, which is precisely what a uniform truss
 * needs and what a tidied but lopsided one still lacks.
 */
function trussTriangleSpread(
    triangles
) {
    const areas = triangles
        .map(triangle => triangle.area)
        .filter(area => area > 0);

    if (areas.length < 2) {
        return 0;
    }

    return (
        Math.max(...areas) -
        Math.min(...areas)
    );
}

/*
 * Nudge joints only where doing so evens the triangles out.
 *
 * Each joint is offered ONE move: to the average of the joints
 * it connects to, which is where it would sit if the triangles
 * around it were all the same size. The move is taken only when
 * it genuinely reduces the spread of triangle areas, and only
 * when every member keeps the direction it was drawn in. So the
 * structure is evened, never rearranged: nothing is rotated, no
 * outer boundary is regularised, and a joint the student placed
 * deliberately is left alone.
 *
 * Joints are handled largest correction first, so the most wrong
 * joint settles first and each later move is judged against an
 * already better structure.
 */
function evenTrussTriangleSizes(
    members,
    tolerance
) {
    let triangles = trussTriangles(members);

    if (triangles.length < 2) {
        return;
    }

    const initial = trussTriangleSpread(triangles);

    if (initial <= 0) {
        return;
    }

    /* The joints each joint is connected to, for its average. */
    const neighbours = new Map();

    const register = point => {
        if (!neighbours.has(point)) {
            neighbours.set(point, []);
        }

        return neighbours.get(point);
    };

    members.forEach(member => {
        const from = register(member.start);
        const to = register(member.end);

        if (from && to && from !== to) {
            from.push(member.end);
            to.push(member.start);
        }
    });

    const limit =
        trussJointMoveLimit(tolerance, members);

    const candidates = [];

    neighbours.forEach((connected, joint) => {
        if (connected.length < 2) {
            return;
        }

        const target = {
            x:
                connected.reduce(
                    (sum, point) => sum + point.x,
                    0
                ) / connected.length,

            y:
                connected.reduce(
                    (sum, point) => sum + point.y,
                    0
                ) / connected.length
        };

        const offset = Math.hypot(
            target.x - joint.x,
            target.y - joint.y
        );

        /*
         * A joint a long way from where it should be is not a
         * rounding error, it is a design decision. Moving it
         * would be redrawing the student's truss rather than
         * tidying it.
         */
        if (offset <= 0 || offset > limit) {
            return;
        }

        candidates.push({ joint, target, offset });
    });

    candidates.sort(
        (first, second) =>
            second.offset - first.offset
    );

    let spread = initial;

    candidates.forEach(({ joint, target }) => {
        const trial = members.map(member => ({
            start: { ...member.start },
            end: { ...member.end }
        }));

        let moved = false;

        trial.forEach(member => {
            if (trussJointMatches(member.start, joint)) {
                member.start = { ...target };
                moved = true;
            }

            if (trussJointMatches(member.end, joint)) {
                member.end = { ...target };
                moved = true;
            }
        });

        if (!moved) {
            return;
        }

        const next = trussTriangles(trial);

        /*
         * The triangulation must survive the move. A move that
         * closes or opens a cell has changed the structure rather
         * than evened it, so it is refused.
         */
        if (next.length !== triangles.length) {
            return;
        }

        const after = trussTriangleSpread(next);

        /*
         * The move must help, and must not disturb the horizontal
         * and vertical structure.
         */
        if (
            after < spread &&
            trussAnglesPreserved(
                members,
                trial,
                tolerance
            )
        ) {
            members.forEach((member, index) => {
                member.start =
                    trial[index].start;

                member.end =
                    trial[index].end;
            });

            Object.assign(joint, target);

            triangles = next;
            spread = after;
        }
    });
}

/*
 * How far a joint may be from where it ought to be before the
 * correction stops being a tidy-up.
 *
 * It scales with the size of the structure, so a small truss is
 * not held to a millimetre and a large one is not allowed to
 * drift.
 */
function trussJointMoveLimit(
    tolerance,
    members
) {
    const lengths = members.map(
        member =>
            Math.hypot(
                member.end.x - member.start.x,
                member.end.y - member.start.y
            )
    );

    const mean = lengths.length
        ? lengths.reduce(
            (sum, length) => sum + length,
            0
        ) / lengths.length
        : 0;

    return Math.max(
        tolerance * 4,
        mean * 0.08
    );
}

/*
 * Whether a proposed move keeps every member in the direction
 * it was drawn.
 *
 * This is what protects the horizontal and vertical structure. A
 * member that was horizontal stays horizontal and one that was
 * vertical stays vertical, so evening the triangles out can never
 * quietly tip a chord into a shallow slope or turn a vertical
 * post into a leaning one.
 *
 * An axis-aligned member is judged by whether it is STILL
 * axis-aligned, because a joint may shift a little along a
 * horizontal member without that member ceasing to be
 * horizontal. A diagonal member is held to a narrow angular band
 * instead, so a deliberate brace keeps its angle.
 */
function trussAnglesPreserved(
    before,
    after,
    tolerance
) {
    for (
        let index = 0;
        index < before.length;
        index += 1
    ) {
        const original = before[index];
        const moved = after[index];

        const wasAxisAligned =
            trussIsAxisAligned(original, tolerance);

        const isAxisAligned =
            trussIsAxisAligned(moved, tolerance);

        /*
         * A member that was square to the axes must remain so.
         * Anything that changes that has re-aimed the member
         * rather than tidied it.
         */
        if (wasAxisAligned !== isAxisAligned) {
            return false;
        }

        if (wasAxisAligned) {
            continue;
        }

        const originalAngle = Math.atan2(
            original.end.y - original.start.y,
            original.end.x - original.start.x
        );

        const movedAngle = Math.atan2(
            moved.end.y - moved.start.y,
            moved.end.x - moved.start.x
        );

        const length = Math.hypot(
            original.end.x - original.start.x,
            original.end.y - original.start.y
        );

        /*
         * The narrowest band the drawing tolerance allows at
         * this member's length, floored so a very long member is
         * not held to an impossibly strict angle.
         */
        const allowed = Math.max(
            0.02,
            tolerance / Math.max(length, 1e-6)
        );

        if (
            Math.abs(
                normalizeAngle(
                    movedAngle - originalAngle
                )
            ) > allowed
        ) {
            return false;
        }
    }

    return true;
}

/*
 * Whether a member is drawn horizontally or vertically, within
 * the drawing tolerance.
 */
function trussIsAxisAligned(
    member,
    tolerance
) {
    void tolerance;

    const dx = member.end.x - member.start.x;
    const dy = member.end.y - member.start.y;

    if (Math.hypot(dx, dy) < 1e-9) {
        return false;
    }

    /*
     * How far the member is from being perfectly square to the
     * axes. A member is axis-aligned when one of its components
     * dominates, so the check is on the component ratio rather
     * than on an absolute angle, which keeps it correct at any
     * zoom and any scale.
     */
    const length = Math.hypot(dx, dy);
    const axisRatio = Math.max(
        Math.abs(dx),
        Math.abs(dy)
    ) / length;

    return axisRatio > 0.999;
}

/*
 * An angle wrapped to (-PI, PI], so a comparison of two
 * directions is never confused by the difference being a full
 * turn.
 */
function normalizeAngle(
    angle
) {
    let value = angle;

    while (value > Math.PI) {
        value -= Math.PI * 2;
    }

    while (value < -Math.PI) {
        value += Math.PI * 2;
    }

    return value;
}

/*
 * Whether two members are the same segment, compared end for
 * end in either order.
 */
function trussMembersMatch(
    a,
    b
) {
    return (
        (trussJointMatches(a.start, b.start) &&
            trussJointMatches(a.end, b.end)) ||
        (trussJointMatches(a.start, b.end) &&
            trussJointMatches(a.end, b.start))
    );
}

/*
 * The parent a feature is drawn under, or null.
 *
 * A feature that hangs off a body is positioned BY that body, so
 * the numbers that describe it are best read relative to it. This
 * is the one place that answers "is this a child, and of what", so
 * the panel and the property writer can never disagree about which
 * parent a relative number is measured from.
 */
function relativeParentOf(object) {
    if (!object?.parentId) {
        return null;
    }

    return (
        drawingState.objects.find(
            (candidate) =>
                candidate.id === object.parentId
        ) || null
    );
}

/*
 * The point on the parent that relative coordinates are measured
 * from.
 *
 * The parent's own START is used where it has one, because a
 * body's ends are what it is identified by in the tree and in any
 * schedule: "25 from the left end of Beam 1" is a real engineering
 * statement, whereas an offset from a body's centre is not
 * something anyone would ask for. A parent with no span uses its
 * position.
 */
function relativeParentOrigin(parent) {
    return (
        parent?.geometry?.start ||
        parent?.geometry?.position ||
        parent?.geometry?.origin ||
        null
    );
}

/*
 * A child feature's own anchor: the point its position refers to.
 *
 * Every feature type stores the same places under different names,
 * and both the panel and the property writer have to agree on which
 * of them a given type is positioned by, so it is named once here.
 */
function relativeChildAnchor(geometry) {
    return (
        geometry?.position ||
        geometry?.start ||
        null
    );
}

/*
 * The relative-position rows for a child feature, or nothing when
 * the feature stands on its own.
 *
 * Shown INSTEAD of the absolute coordinates for a feature drawn
 * under a parent. These are genuine local coordinates, not
 * relabelled absolute ones: the number is an offset from the
 * parent, and writing it moves the child by that offset from where
 * the parent is now. A child therefore keeps its relationship to
 * its parent when the parent is dragged, which is what makes the
 * number mean anything after the fact.
 */
function relativeCoordinateRows(
    object,
    label,
    helpers
) {
    const parent = relativeParentOf(object);

    const origin = relativeParentOrigin(parent);

    const anchor = relativeChildAnchor(
        object?.geometry
    );

    if (!parent || !origin || !anchor) {
        return "";
    }

    const { coordinate, section } = helpers;

    /*
     * THE PARENT, AS A LABELLED ROW RATHER THAN A SENTENCE.
     *
     * This was a single line of prose - "Relative to: Beam 3" - which
     * is two pieces of information in one unbreakable string. A feature
     * named after a student typed something like "Simply supported beam
     * 3m" then produced a line the panel was too narrow to show, and the
     * relation - the one thing this row exists to say - was the part
     * that disappeared.
     *
     * As a row, the name gets its own wrapping column and can break
     * across lines instead of across the edge of the panel.
     */
    const parentName =
        parent.name ||
        parent.type ||
        "another feature";

    return [
        section(label),

        `
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Relative to</span>
                <span class="drawing-property-readonly">${parentName}</span>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `,

        coordinate(
            "Offset X",
            "relative.x",
            anchor.x - origin.x
        ),
        coordinate(
            "Offset Y",
            "relative.y",
            anchor.y - origin.y
        )
    ].join("");
}

/*
 * The Reverse Direction control for a load.
 *
 * Turning a load around is a single, frequent adjustment - a
 * sign the user got the way round on the first attempt, or a
 * direction to be swapped while testing - so it is a button
 * rather than something to be typed as a number. Typing
 * direction - 180 by hand is easy to get wrong for an angle
 * like 135, and impossible to get right for a value the user
 * has not read precisely.
 *
 * The control sits directly under the Direction field it
 * changes, so the value it edits and the control that edits it
 * are read together and the displayed direction is always the
 * one currently in force.
 */
function reverseDirectionMarkup(
    control = "data-load-reverse-direction"
) {
    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label"></span>
            <button type="button"
                class="drawing-property-action drawing-property-action-icon-only"
                ${control}
                aria-label="Reverse Direction"
                title="Reverse Direction">
                <span class="drawing-property-action-icon"
                    aria-hidden="true">&#8593;&#8595;</span>
            </button>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;
}

/*
 * The Arc Radius row for a rotational feature.
 *
 * PRESENTATION, and labelled as such.
 *
 * The field is deliberately kept out of the DIRECTION and MAGNITUDE
 * groups and given a unit of pixels rather than N·m, because it is the
 * one number on this feature that is not engineering. It says how big
 * the curved arrow is drawn; it does not say how hard the moment
 * turns. Showing it next to a magnitude with the same styling is what
 * invites a student to read "radius 25, so 500 N·m" as one statement,
 * and widening the arc to make a moment legible would then appear to
 * change its value.
 */
function arcRadiusRow(
    geometry
) {
    const rotational =
        window.enggDrawingRotationalArrow;

    const current =
        rotational
            ? rotational.clampArcRadius(
                geometry.arcRadius ??
                    rotational.DEFAULT_ARC_RADIUS_PX
            )
            : Number(geometry.arcRadius) || 16;

    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Arc Radius</span>
            <input type="number"
                step="1"
                min="${rotational ? rotational.MIN_ARC_RADIUS_PX : 8}"
                max="${rotational ? rotational.MAX_ARC_RADIUS_PX : 80}"
                data-arc-radius
                aria-label="Arc Radius"
                title="How large the curved arrow is drawn. This is presentation only and does not change the magnitude."
                value="${current}">
            <span class="drawing-property-unit">px</span>
            <span></span>
        </div>
    `;
}

/*
 * The Features panel for an ANALYSIS object.
 *
 * ONE panel for all five kinds, because they have the same shape: a
 * source relationship, some display switches, and a set of values
 * that are either derived or editable. Only the labels and which
 * values exist differ, and branching per type would have meant five
 * near-identical panels that drift apart.
 *
 * DERIVED VALUES ARE SHOWN, NOT EDITED
 * ------------------------------------
 * A resultant's magnitude and a components object's Fx and Fy are
 * CALCULATED from forces the student typed. Putting them in editable
 * boxes would invite the one thing that must not happen: typing a
 * magnitude that disagrees with the sources, leaving an arrow whose
 * label contradicts its own geometry. So they are rendered as read-only
 * text, and the control for changing them is the force itself - which
 * is where the number actually comes from.
 *
 * A broken source is stated plainly rather than shown as zero. Zero is
 * a claim, and an unresolved object has no claim to make.
 */
function analysisPanelRows(
    object
) {
    const geometry = object.geometry || {};

    const engineering = object.engineering || {};

    const sources = enggAnalysisDependencies
        .sourceIdsOf(object)
        .map(
            id =>
                drawingState.objects.find(
                    candidate =>
                        candidate.id === id
                ) || null
        );

    const rows = [];

    const section = label =>
        `<div class="drawing-properties-section">${label}</div>`;

    const readOnly = (label, value, unit) => `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">${label}</span>
            <span class="drawing-property-derived">${value}${
                unit ? " " + unit : ""
            }</span>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;

    const toggle = (label, key, on) => `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">${label}</span>
            <input type="checkbox"
                data-analysis-toggle="${key}"
                aria-label="${label}"
                ${on ? "checked" : ""}>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;

    const number = value => {
        const rounded =
            Math.round(Number(value) * 100) /
            100;

        return Object.is(rounded, -0) ? "0" : String(rounded);
    };

    const heading = {
        "force-components": "FORCE COMPONENTS",
        resultant: "RESULTANT",
        "shear-force-diagram": "SHEAR FORCE DIAGRAM",
        "bending-moment-diagram": "BENDING MOMENT DIAGRAM",
        "axial-force-diagram": "AXIAL FORCE DIAGRAM"
    }[object.type] ||
        "ANALYSIS";

    rows.push(section(heading));

    /*
     * THE SOURCE, WHICH THE STUDENT MUST BE ABLE TO SEE.
     *
     * Not decoration: an analysis object that silently follows
     * something the student cannot name is impossible to reason about
     * when it updates, because there is nothing to look at and work out
     * why. The names are listed, and a source that has been deleted is
     * named as missing rather than dropped from the list.
     */
    rows.push(section("SOURCE"));

    if (!sources.length) {
        rows.push(
            readOnly(
                "Relative to",
                "Nothing selected"
            )
        );
    } else {
        sources.forEach((source, index) => {
            rows.push(
                readOnly(
                    sources.length > 1
                        ? "Source " + (index + 1)
                        : "Relative to",
                    source
                        ? source.name || source.type
                        : "deleted"
                )
            );
        });
    }

    if (engineering.unresolved) {
        rows.push(
            readOnly(
                "Status",
                "Source deleted - showing no values"
            )
        );
    }

    if (object.type === "force-components") {
        rows.push(section("COMPONENTS"));
        rows.push(
            readOnly(
                "Horizontal",
                number(geometry.forceX),
                "N"
            )
        );
        rows.push(
            readOnly(
                "Vertical",
                number(geometry.forceY),
                "N"
            )
        );

        rows.push(section("DISPLAY"));
        rows.push(
            toggle(
                "Show Original Force",
                "showOriginal",
                geometry.showOriginal !== false
            )
        );
        rows.push(
            toggle(
                "Show X Component",
                "showX",
                geometry.showX !== false
            )
        );
        rows.push(
            toggle(
                "Show Y Component",
                "showY",
                geometry.showY !== false
            )
        );

        rows.push(section("VALUE LABELS"));
        rows.push(
            toggle(
                "Show Magnitudes",
                "showValues",
                geometry.showValues !== false
            )
        );
    }

    if (object.type === "resultant") {
        rows.push(section("RESULTANT"));
        rows.push(
            readOnly(
                "Magnitude",
                number(geometry.magnitude),
                "N"
            )
        );
        rows.push(
            readOnly(
                "Direction",
                number(geometry.angle),
                "°"
            )
        );

        rows.push(section("DISPLAY"));
        rows.push(
            toggle(
                "Show Resultant",
                "showResultant",
                geometry.showResultant !== false
            )
        );
        rows.push(
            toggle(
                "Show Construction",
                "showConstruction",
                geometry.showConstruction === true
            )
        );
    }

    if (object.type === "analysis-diagram") {
        const span = geometry.sourceSpan;

        rows.push(section("REFERENCE"));

        rows.push(
            readOnly(
                "Source Span",
                span
                    ? number(span.length)
                    : "No source",
                span ? "mm" : ""
            )
        );

        rows.push(
            readOnly(
                "Source Positions",
                String(
                    (
                        geometry.referencePositions ||
                        []
                    ).length
                )
            )
        );

        rows.push(section("DISPLAY"));
        rows.push(
            toggle(
                "Zero Axis",
                "showZeroAxis",
                geometry.showZeroAxis !== false
            )
        );
        rows.push(
            toggle(
                "Source Positions",
                "showReferencePositions",
                geometry.showReferencePositions !== false
            )
        );
        rows.push(
            toggle(
                "Background",
                "backgroundVisible",
                geometry.backgroundVisible !== false
            )
        );
    }

    rows.push(section("POSITION"));
    rows.push(
        readOnly(
            "X",
            number(geometry.position?.x ?? geometry.start?.x),
            "mm"
        )
    );
    rows.push(
        readOnly(
            "Y",
            number(geometry.position?.y ?? geometry.start?.y),
            "mm"
        )
    );

    return rows;
}

/*
 * THE FEATURES PANEL FOR A SUPPORT.
 *
 * A support has a RELATIONSHIP to a body and a SIDE, and those are the
 * only two things about its position a student edits. Everything else
 * about where it appears is derived, and putting a derived value in an
 * editable box is how a drawing ends up self-contradictory: a support
 * whose Y had been typed to move it clear of the beam would sit
 * somewhere the attachment said it could not.
 *
 * SO THERE IS NO Y FIELD HERE, AND NO ORIENTATION ANGLE.
 *
 * The distance clear of the body is the support renderer's business,
 * worked out from the body's own depth, and the angle it points is
 * worked out from the body's own normal. Neither is a number the
 * student can get wrong, so neither is offered. `Position X` below is
 * the one position that IS theirs: how far along the body they put it.
 *
 * Real X/Y are shown read-only, because a student checking a support
 * against a dimension needs to see where it actually is - but the
 * values are consequences, not settings.
 */
/*
 * THE SENSE A ROTATIONAL FEATURE TURNS, AS A WORD.
 *
 * One reader for the direction, used by the Features panel, the
 * annotation model and the Reverse control, so a moment cannot be
 * described one way and reversed as though it were another.
 *
 * A feature states its direction as "CCW" or "CW". Older files stored
 * a `clockwise` flag and it is still read - without that, every moment
 * in an existing drawing would have silently become anticlockwise the
 * moment it was opened, which is a change nobody asked for and nobody
 * can see.
 */
function momentDirectionOf(
    geometry
) {
    if (geometry?.direction != null) {
        return String(geometry.direction) === "CW"
            ? "CW"
            : "CCW";
    }

    return geometry?.clockwise === true
        ? "CW"
        : "CCW";
}

function supportPanelRows(
    object
) {
    const geometry = object.geometry || {};

    const rows = [];

    const section = label =>
        `<div class="drawing-properties-section">${label}</div>`;

    const number = value => {
        const rounded =
            Math.round(Number(value) * 100) /
            100;

        return Object.is(rounded, -0) ? "0" : String(rounded);
    };

    const parent = object.parentId
        ? drawingState.objects.find(
            candidate =>
                candidate.id === object.parentId
        ) || null
        : null;

    rows.push(
        section(
            staticsSupportSection(
                object.type
            )
        )
    );

    rows.push(section("POSITION"));

    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Relative to</span>
            <span class="drawing-property-readonly">${
                parent
                    ? parent.name || parent.type
                    : "Nothing"
            }</span>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `);

    /*
     * Position X IS HOW FAR ALONG THE BODY, and the label says so.
     *
     * Calling it simply "Position X" invited the reading that it is an
     * x coordinate in its own right, and the value a student would then
     * expect to type to move the support to a particular x on the
     * sheet. It is not: it is a distance along the body, which is why
     * the support stays put when the body is resized.
     */
    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Position Along Body</span>
            <input type="number" step="1"
                data-support-distance
                aria-label="Position Along Body"
                value="${number(geometry.attachment?.distance || 0)}">
            <span class="drawing-property-unit">mm</span>
            <span></span>
        </div>
    `);

    /*
     * WHICH SIDE, and nothing else.
     *
     * A checkbox rather than a direction control or a negative
     * distance, because it is genuinely a two-way choice and because
     * the alternative - letting a student type a negative offset - is
     * how a support ends up on the wrong side of a beam with no way to
     * describe what it should have been.
     */
    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Flip</span>
            <input type="checkbox"
                data-support-flip
                aria-label="Flip to the other side of the body"
                ${geometry.flipped ? "checked" : ""}>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `);

    /*
     * WHERE IT ACTUALLY IS, derived.
     *
     * Read-only on purpose. The two numbers are recomputed from the
     * attachment and the body every frame, so a box the student could
     * type into would be writing to a value that the next redraw
     * overwrites - and they would see their entry spring back.
     */
    const placement = parent
        ? enggBodyFrames.supportPlacement(
            parent,
            enggBodyFrames.pointAt(
                enggBodyFrames.frameOf(parent),
                Number(geometry.attachment?.distance) || 0
            ),
            geometry.flipped === true
        )
        : null;

    rows.push(section("REAL POSITION"));

    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">X</span>
            <span class="drawing-property-derived">${
                number(placement?.render?.x ?? geometry.position?.x)
            }</span>
            <span class="drawing-property-unit">mm</span>
            <span></span>
        </div>
    `);

    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Y</span>
            <span class="drawing-property-derived">${
                number(placement?.render?.y ?? geometry.position?.y)
            }</span>
            <span class="drawing-property-unit">mm</span>
            <span></span>
        </div>
    `);

    return rows;
}

/*
 * The Features panel for a Distributed Load.
 *
 * A distributed load is one continuous load, so this panel shows
 * the things that define it rather than the arrows it draws:
 * the body it acts on, the one direction all of its arrows share,
 * the magnitude and position of each point that shapes the
 * profile, and the interval those arrows are sampled at.
 *
 * Editing any of them writes to the same model the renderer
 * reads, so the change is visible at once and the load keeps its
 * identity throughout.
 */
function distributedLoadPanelMarkup(
    object,
    helpers
) {
    const {
        coordinate,
        scalar,
        section
    } = helpers;

    const geometry = object.geometry || {};

    const number =
        value =>
            Number(value).toFixed(2);

    const rows = [];

    rows.push(section("LOADED BODY"));
    rows.push(
        relativeCoordinateRows(
            object,
            "LOADED BODY",
            helpers
        )
    );
    rows.push(
        coordinate(
            "Start X",
            "start.x",
            geometry.start?.x ?? 0
        )
    );
    rows.push(
        coordinate(
            "Start Y",
            "start.y",
            geometry.start?.y ?? 0
        )
    );
    rows.push(
        coordinate(
            "End X",
            "end.x",
            geometry.end?.x ?? 0
        )
    );
    rows.push(
        coordinate(
            "End Y",
            "end.y",
            geometry.end?.y ?? 0
        )
    );

    rows.push(section("FORCE"));
    rows.push(
        scalar(
            "Direction",
            "direction",
            enggLoadProfile.loadDirection(geometry),
            "°"
        )
    );
    rows.push(reverseDirectionMarkup());
    rows.push(
        scalar(
            "Interval",
            "interval",
            enggLoadProfile.loadInterval(geometry),
            "mm"
        )
    );

    const points =
        enggLoadProfile
            .profilePointPositions(geometry);

    rows.push(section("DISTRIBUTION"));

    if (!points.length) {
        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Magnitude</span>
                <span class="drawing-property-readonly">${number(0)}</span>
                <span class="drawing-property-unit">N/mm</span>
                <span></span>
            </div>
        `);

        return rows.join("");
    }

    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-head">
            <span></span><span>Magnitude</span><span>Position</span><span></span>
        </div>
    `);

    points.forEach((point, index) => {
        rows.push(`
            <div class="drawing-property-grid">
                <span class="drawing-property-grid-label">Point ${index + 1}</span>
                <input type="number" step="any"
                    data-property="loadPoint.${index}.magnitude"
                    aria-label="Point ${index + 1} Magnitude"
                    value="${number(point.magnitude)}">
                <input type="number" step="any"
                    data-property="loadPoint.${index}.t"
                    aria-label="Point ${index + 1} Position"
                    value="${number(point.t * 100)}">
                <span class="drawing-property-unit">N/mm</span>
            </div>
        `);
    });

    return rows.join("");
}

/*
 * Shared header for every Features panel: an
 * editable Feature Name bound to the object, and a
 * read-only Feature Type.
 */
function featureHeaderMarkup(
    object,
    typeLabel
) {
    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Feature Name</span>
            <input type="text" data-feature-name
                aria-label="Feature Name"
                value="${object.name}">
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Feature Type</span>
            <span class="drawing-property-readonly">${typeLabel}</span>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;
}

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
    rows.push(coordinate("Centre X", "rigidCentre.x", centre.x));
    rows.push(coordinate("Centre Y", "rigidCentre.y", centre.y));

    if (shape === "circle") {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Radius",
                "rigidRadius",
                Number(geometry.radius) ||
                    Math.max(
                        Number(geometry.width) || 0,
                        Number(geometry.height) || 0
                    ) / 2,
                "mm"
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
                            point.x
                        )
                    );
                    rows.push(
                        coordinate(
                            `Point ${index + 1} Y`,
                            `points.${index}.y`,
                            point.y
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
                Number(geometry.radius) || 0,
                "mm"
            )
        );
    } else {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Width",
                "rigidWidth",
                Number(geometry.width) || 0,
                "mm"
            )
        );
        rows.push(
            scalar(
                "Height",
                "rigidHeight",
                Number(geometry.height) || 0,
                "mm"
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

function featurePropertyMarkup(object) {
    const geometry = object.geometry;
    const constraints = object.constraints || {};
    const rows = [];
    const number = value => Number(value).toFixed(2);
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
     * Known / Unknown applies to statics quantities, which
     * are the values a student may still have to solve
     * for. Geometry dimensions stay plain numbers.
     */
    const showKnown =
        object.engineering?.discipline ===
        "statics";

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
        editable = true
    ) => {
        const isUnknown =
            showKnown &&
            !known(key);

        return `
        <div class="drawing-property-grid drawing-property-grid-value${isUnknown ? " drawing-property-unknown" : ""}">
            <span class="drawing-property-grid-label">${label}</span>
            ${editable
                ? `<input type="number" step="any"
                        data-property="${key}"
                        class="${isUnknown ? "drawing-property-input-unknown" : ""}"
                        aria-label="${label}"
                        ${isUnknown ? 'value=""' : `value="${number(value)}"`}
                        ${isUnknown || fixed(key) ? "disabled" : ""}>`
                : `<span class="drawing-property-readonly">${number(value)}</span>`}
            <span class="drawing-property-unit">
                ${unit}
                ${editable && showKnown ? knownBox(key, label) : ""}
            </span>
            ${editable ? fixBox(key, label) : "<span></span>"}
        </div>
    `;
    };

    const coordinate = (
        label,
        key,
        value,
        unit = "mm"
    ) => `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">${label}</span>
            <input type="number" step="any"
                data-property="${key}"
                aria-label="${label}"
                value="${number(value)}"
                ${fixed(key) ? "disabled" : ""}>
            <span class="drawing-property-unit">${unit}</span>
            ${fixBox(key, label)}
        </div>
    `;

    const section = label =>
        `<div class="drawing-properties-section">${label}</div>`;

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
     */
    const derived = (label, value) => `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">${label}</span>
            <span class="drawing-property-readonly">${number(value)}</span>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;

    /*
     * The free-text name a student gives a feature.
     *
     * A feature's name is how it is referred to in a beam schedule, a
     * member list and a written solution, so it is editable here rather
     * than being fixed at creation. The row is deliberately last in the
     * hierarchy: it is naming, not engineering, and putting it at the
     * top would give it a prominence the other rows do not have.
     */
    const labelRow = object => `
        <div class="drawing-properties-section">ANNOTATION</div>
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Label</span>
            <input type="text"
                data-object-label
                aria-label="Label"
                value="${object.name || ""}">
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;

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
     * forces, particles, couples and loads never reached their
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
     * The Features panel names the feature from its own
     * authoritative type, using the same label the toolbar
     * and the Feature Tree use, so a Distributed Load never
     * shows its raw internal type here.
     */
    const typeLabel =
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
            [COORDINATE_SYSTEM_TYPE]: "2D Coordinate System"
        }[object.type] || object.type;

    rows.push(featureHeaderMarkup(object, typeLabel));

    if (object.type === "line") {
        const dx = geometry.end.x - geometry.start.x;
        const dy = geometry.end.y - geometry.start.y;
        rows.push(section("START POINT"));
        rows.push(coordinate("X", "start.x", geometry.start.x));
        rows.push(coordinate("Y", "start.y", geometry.start.y));
        rows.push(section("END POINT"));
        rows.push(coordinate("X", "end.x", geometry.end.x));
        rows.push(coordinate("Y", "end.y", geometry.end.y));
        rows.push(section("MEASUREMENTS"));
        rows.push(scalar("Length", "length", Math.hypot(dx, dy), "mm"));
        rows.push(scalar("Angle", "angle", Math.atan2(dy, dx) * 180 / Math.PI, " · "));
    } else if (object.type === "point") {
        const position =
            geometry.position || geometry.point || geometry;

        rows.push(section("POSITION"));
        rows.push(coordinate("X", "position.x", position.x));
        rows.push(coordinate("Y", "position.y", position.y));
        rows.push(section("APPEARANCE"));
        rows.push(pointSizeMarkup(object));

        return `<div class="drawing-properties-block">
            <div class="drawing-properties-title">${object.name}</div>
            ${rows.join("")}
        </div>`;
    } else if (object.type === "circle") {
        rows.push(section("CENTER"));
        rows.push(coordinate("X", "center.x", geometry.center.x));
        rows.push(coordinate("Y", "center.y", geometry.center.y));
    } else if (object.type === "arc") {
        rows.push(section("CENTER"));
        rows.push(coordinate("X", "center.x", geometry.center.x));
        rows.push(coordinate("Y", "center.y", geometry.center.y));
        rows.push(section("GEOMETRY"));
        rows.push(scalar("Radius", "radius", geometry.radius, "mm"));
        rows.push(scalar("Start Angle", "startAngle", geometry.startAngle * 180 / Math.PI, " · "));
        rows.push(scalar("End Angle", "endAngle", geometry.endAngle * 180 / Math.PI, " · "));
        rows.push(scalar("Included", "includedAngle",
            ((geometry.sweep ?? (geometry.endAngle - geometry.startAngle)) * 180 / Math.PI),
            " · ", false));
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
        rows.push(coordinate("X", "position.x", geometry.position.x));
        rows.push(coordinate("Y", "position.y", geometry.position.y));

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
            <div class="drawing-properties-title">${object.name}</div>
            ${rows.join("")}
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
        const length = Math.hypot(
            geometry.end.x - geometry.start.x,
            geometry.end.y - geometry.start.y
        );

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
             */
            rows.push(derived("Span", length));
            rows.push(scalar("Height", "height",
                Number(geometry.height) || 0, "mm"));

            rows.push(section("JOINTS"));
            rows.push(derived("Joint Count",
                (geometry.joints || []).length));

            rows.push(section("MEMBERS"));
            rows.push(derived("Member Count",
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
            rows.push(derived("Length", length));
            rows.push(scalar("Height", "depth",
                Number(geometry.depth) || 0, "mm"));
        } else if (object.type === "cable") {
            /*
             * Span and Length are both the spec's own fields, and for
             * a straight cable they are the same number - but they are
             * not the same MEANING: one is how far the cable reaches,
             * the other is how much cable there is, and the second
             * stops being the first the moment a cable is drawn with a
             * sag. They share one GEOMETRY section rather than being
             * split across two, because they are read as one pair.
             */
            rows.push(derived("Span", length));
            rows.push(derived("Length", length));

            rows.push(section("SEGMENTS"));
            rows.push(derived("Segment Count",
                (geometry.segments || []).length ||
                Math.max(1, Number(geometry.segmentCount) || 1)));
        } else {
            rows.push(scalar("Length", "length", length, "mm"));
            rows.push(scalar("Diameter", "diameter",
                Number(geometry.diameter) || 0, "mm"));
            rows.push(scalar("Radius", "radius",
                Number(geometry.radius) ||
                    (Number(geometry.diameter) || 0) / 2,
                "mm"));
        }

        /*
         * POSITION and ORIENTATION are in the same place for all four
         * types, because all four are straight members whose position
         * IS their two ends and whose orientation is what those ends
         * make.
         */
        rows.push(section("POSITION"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));

        rows.push(section("ORIENTATION"));
        rows.push(derived("Angle",
            Math.atan2(
                geometry.end.y - geometry.start.y,
                geometry.end.x - geometry.start.x
            ) * 180 / Math.PI));

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
            rows.push(derived("Supports",
                attachedCount(object.id)));
            rows.push(derived("Connections",
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

        const number =
            value =>
                Number(value).toFixed(2);

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
                vector.x
            )
        );
        rows.push(
            coordinate(
                "Y",
                "start.y",
                vector.y
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
        rows.push(reverseDirectionMarkup("data-moment-reverse-direction"));

        rows.push(section("POSITION"));
        rows.push(coordinate("Application Point X", "position.x", geometry.position.x));
        rows.push(coordinate("Application Point Y", "position.y", geometry.position.y));

        rows.push(section("APPEARANCE"));
        rows.push(arcRadiusRow(geometry));
    } else if (object.type === "varying-load") {
        /*
         * A varying distributed load carries an intensity at
         * each end, so one feature describes a triangular or
         * trapezoidal distribution.
         */
        rows.push(section("VARYING LOAD"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));
        rows.push(scalar("Start Magnitude", "startIntensity",
            Number(geometry.startIntensity) || 0, "N/mm"));
        rows.push(scalar("End Magnitude", "endIntensity",
            Number(geometry.endIntensity) || 0, "N/mm"));
    } else if (object.type === "couple") {
        /*
         * A Couple Moment is a FREE moment, so this panel has no
         * "Relative to" row at all. It used to show one, and it also
         * showed a "Separation" - the distance between the two lines
         * of action it used to be drawn as. Both implied a parent and
         * a pair of forces, neither of which is part of a free
         * moment, and neither of which is drawn any more.
         *
         * What is here instead is the position it was placed at, the
         * sense it turns, its magnitude, and the presentation
         * controls the shared curved arrow reads.
         */
        rows.push(section("COUPLE MOMENT"));
        rows.push(section("VALUE"));
        rows.push(scalar("Magnitude", "magnitude",
            Number(geometry.magnitude) || 0, geometry.unit || "N·m"));

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
        rows.push(reverseDirectionMarkup("data-moment-reverse-direction"));

        rows.push(section("POSITION"));
        rows.push(coordinate("Position X", "position.x", geometry.position.x));
        rows.push(coordinate("Position Y", "position.y", geometry.position.y));

        rows.push(section("APPEARANCE"));
        rows.push(arcRadiusRow(geometry));
    } else if (object.type === "load") {
        /*
         * A Distributed Load is one continuous load, so the panel
         * edits the things that define it: the direction every one
         * of its arrows shares, the magnitude at each of its
         * defining points, where along the body those points sit,
         * and the interval its arrows are sampled at.
         *
         * Every one of these writes straight to the model the
         * renderer reads, so a change is visible immediately and
         * the load never has to be deleted and rebuilt.
         */
        rows.push(
            distributedLoadPanelMarkup(
                object,
                { coordinate, scalar, section }
            )
        );
    } else if (object.type === "varying-load") {
        /*
         * A varying distributed load carries an intensity at
         * each end, so one feature describes a triangular or
         * trapezoidal distribution.
         */
        rows.push(section("VARYING LOAD"));
        rows.push(
            scalar(
                "Direction",
                "direction",
                enggLoadProfile.loadDirection(geometry),
                "°"
            )
        );
        rows.push(reverseDirectionMarkup());
        rows.push(
            scalar(
                "Start Magnitude",
                "startIntensity",
                Number(geometry.startIntensity) || 0,
                "N/mm"
            )
        );
        rows.push(
            scalar(
                "End Magnitude",
                "endIntensity",
                Number(geometry.endIntensity) || 0,
                "N/mm"
            )
        );
        rows.push(
            scalar(
                "Interval",
                "interval",
                enggLoadProfile.loadInterval(geometry),
                "mm"
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
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));
    } else if (object.type === "connection") {
        rows.push(section("CONNECTION"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));
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
        rows.push(coordinate("Position X", "position.x", geometry.position.x));
        rows.push(coordinate("Position Y", "position.y", geometry.position.y));
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
        rows.push(coordinate("Centre X", "center.x", geometry.center.x));
        rows.push(coordinate("Centre Y", "center.y", geometry.center.y));
        rows.push(scalar("Radius", "radius", geometry.radius, "mm"));
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
        rows.push(coordinate("X", "origin.x", geometry.origin.x));
        rows.push(coordinate("Y", "origin.y", geometry.origin.y));
        rows.push(section("GEOMETRY"));
        rows.push(scalar("Axis Length", "axisLength",
            Number(geometry.axisLength) || 25, "mm"));
    } else if (object.type === "rectangle") {
        const center = {
            x: geometry.position.x + geometry.width / 2,
            y: geometry.position.y - geometry.height / 2
        };
        rows.push(section("GEOMETRY"));
        rows.push(coordinate("Centre X", "centre.x", center.x));
        rows.push(coordinate("Centre Y", "centre.y", center.y));
        rows.push(scalar("Width", "width", geometry.width, "mm"));
        rows.push(scalar("Height", "height", geometry.height, "mm"));
        rows.push(scalar("Rotation", "rotation", geometry.rotation || 0, "°"));
    } else if (object.type === "polyline") {
        rows.push(section("GEOMETRY"));
        (geometry.points || []).forEach((p, index) => {
            rows.push(coordinate(`Point ${index + 1} X`, `points.${index}.x`, p.x));
            rows.push(coordinate(`Point ${index + 1} Y`, `points.${index}.y`, p.y));
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
        rows.push(coordinate("Origin X", "origin.x", geometry.origin.x));
        rows.push(coordinate("Origin Y", "origin.y", geometry.origin.y));
        rows.push(section("AXIS EXTENSIONS"));
        rows.push(scalar("X Positive Length", "xPositiveLength",
            geometry.xPositiveLength ?? geometry.axisLength ?? 25, "mm"));
        rows.push(scalar("X Negative Length", "xNegativeLength",
            geometry.xNegativeLength ?? geometry.axisLength ?? 25, "mm"));
        rows.push(scalar("Y Positive Length", "yPositiveLength",
            geometry.yPositiveLength ?? geometry.axisLength ?? 25, "mm"));
        rows.push(scalar("Y Negative Length", "yNegativeLength",
            geometry.yNegativeLength ?? geometry.axisLength ?? 25, "mm"));
    }

    rows.push(appearanceMarkup(object));

    return `<div class="drawing-properties-block">
        <div class="drawing-properties-title">${object.name}</div>
        ${rows.join("")}
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
    const size =
        Number(
            object.style.pointSize
        ) || 6;

    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Point Size</span>
            <input type="number" step="1" min="1"
                data-style="pointSize"
                aria-label="Point Size"
                value="${Number(size).toFixed(2)}">
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
const trianglePanelModes =
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
const forcePanelModes =
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

/*
 * Wrap every numeric input in the panel with the
 * shared stepper.
 *
 * Doing this in one place means each Features panel
 * gets identical arrows pinned to the far right,
 * without every feature having to build its own
 * control.
 */
function enhanceNumericInputs(
    root
) {
    root.querySelectorAll('input[type="number"]').forEach(input => {
        if (
            input.parentElement &&
            input.parentElement.classList.contains(
                "drawing-number-field"
            )
        ) {
            return;
        }

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "drawing-number-field";

        input.parentNode.insertBefore(
            wrapper,
            input
        );

        wrapper.appendChild(
            input
        );

        const stepper =
            document.createElement("div");

        stepper.className =
            "drawing-number-stepper";

        stepper.innerHTML = `
            <button type="button" tabindex="-1"
                aria-label="Increase" data-step="1"></button>
            <button type="button" tabindex="-1"
                aria-label="Decrease" data-step="-1"></button>
        `;

        wrapper.appendChild(
            stepper
        );

        stepper.querySelectorAll("[data-step]").forEach(button => {
            button.addEventListener("click", () => {
                if (input.disabled) {
                    return;
                }

                /*
                 * The spinner moves in whole units of the
                 * property's own unit, so one press is
                 * always exactly +1 or -1. The input's own
                 * step attribute is deliberately not used
                 * here, because values like "any" and "5"
                 * would otherwise produce unpredictable
                 * jumps between unrelated magnitudes.
                 */
                const amount = 1;

                const current =
                    Number(input.value);

                const base =
                    Number.isFinite(current)
                        ? current
                        : 0;

                const next =
                    base +
                    amount *
                        Number(button.dataset.step);

                const min =
                    input.getAttribute("min");

                input.value =
                    min !== null &&
                    Number.isFinite(Number(min)) &&
                    next < Number(min)
                        ? String(Number(min))
                        : String(
                            Number(
                                next.toFixed(6)
                            )
                        );

                /*
                 * Dispatch only `change`. The numeric handler
                 * runs `apply()` on both `input` and
                 * `change`, so firing both would apply the
                 * step twice and the geometry would jump far
                 * more than one increment.
                 */
                input.dispatchEvent(
                    new Event(
                        "change",
                        {
                            bubbles: true
                        }
                    )
                );
            });
        });
    });
}

/*
 * The current measured value of a constrained property,
 * used to pin a Fix control to the value it locks in.
 */
function currentPropertyValue(
    object,
    key
) {
    const g =
        object.geometry || {};

    const measurements =
        object.type === "triangle"
            ? triangleMeasurements(
                (g.points || []).filter(
                    Boolean
                )
            )
            : null;

    const sideMatch =
        /^side(\d)$/.exec(key);

    if (sideMatch && measurements) {
        return measurements.sides[
            Number(sideMatch[1]) - 1
        ];
    }

    const angleMatch =
        /^angle(\d)$/.exec(key);

    if (angleMatch && measurements) {
        return measurements.angles[
            Number(angleMatch[1]) - 1
        ];
    }

    if (key === "length") {
        return Math.hypot(
            g.end.x - g.start.x,
            g.end.y - g.start.y
        );
    }

    if (key === "angle") {
        return (
            Math.atan2(
                g.end.y - g.start.y,
                g.end.x - g.start.x
            ) *
            180 /
            Math.PI
        );
    }

    if (key === "radius") {
        return Number(g.radius);
    }

    /*
     * Coordinate keys resolve through the geometry path.
     */
    const parts =
        String(key).split(".");

    let cursor =
        g;

    for (const part of parts) {
        if (
            cursor ===
            null ||
            typeof cursor !== "object"
        ) {
            return NaN;
        }

        cursor = cursor[part];
    }

    return Number(cursor);
}

/*
 * Change the outline of a rigid body in place.
 *
 * The body keeps its identity, its name and its attachments:
 * only the geometry that describes its outline is rewritten, so
 * a body that changes from a rectangle to a circle is still the
 * same Rigid Body rather than a newly created feature.
 */
function setRigidBodyShape(
    object,
    shape
) {
    if (
        !enggFeatureGeometry
            .RIGID_BODY_SHAPES
            .includes(shape)
    ) {
        return false;
    }

    const g = object.geometry;

    if (
        enggFeatureGeometry
            .rigidBodyShape(g) === shape
    ) {
        return false;
    }

    /*
     * The size the body already has is what the new shape is
     * built from, so changing the outline does not also resize
     * the body out from under the student.
     */
    const centre =
        enggFeatureGeometry.rigidBodyCenter(
            g
        ) || { x: 0, y: 0 };

    const width =
        Number(g.width) || 60;

    const height =
        Number(g.height) || 40;

    const rotation =
        Number(g.rotation) || 0;

    if (shape === "circle") {
        delete g.position;
        delete g.width;
        delete g.height;
        delete g.points;

        g.center = {
            x: centre.x,
            y: centre.y
        };
        g.radius =
            Math.max(width, height) / 2;
    } else if (shape === "triangle") {
        delete g.position;
        delete g.width;
        delete g.height;
        delete g.center;
        delete g.radius;

        g.points =
            enggFeatureGeometry
                .trianglePointsFor(
                    centre,
                    width,
                    height
                );
    } else if (shape === "polygon") {
        delete g.position;
        delete g.width;
        delete g.height;
        delete g.points;

        g.center = {
            x: centre.x,
            y: centre.y
        };
        g.sides = 5;
        g.radius = Math.max(width, height) / 2;
    } else {
        delete g.center;
        delete g.radius;
        delete g.points;
        delete g.sides;

        g.position = {
            x: centre.x - width / 2,
            y: centre.y + height / 2
        };
        g.width = width;
        g.height = height;
    }

    g.shape = shape;
    g.rotation = rotation;

    return true;
}

/*
 * Move a rigid body so its centre lands on a given axis value.
 *
 * The body is moved as one piece through the shared transform, so
 * a circle or a triangle translates the same way a rectangle does
 * and no part of it is left behind.
 */
function moveRigidBodyTo(
    object,
    axis,
    value
) {
    const g = object.geometry;

    const current =
        enggFeatureGeometry.rigidBodyCenter(
            g
        );

    if (!current) {
        return;
    }

    enggFeatureGeometry.translateObject(
        object,
        axis === "x"
            ? value - current.x
            : 0,
        axis === "y"
            ? value - current.y
            : 0
    );
}

/*
 * Resize a rigid body along one axis.
 *
 * A rectangle and a polygon resize through their own defining
 * size. A circle has only one dimension, so changing its width
 * sets its radius, which is the closest honest equivalent.
 */
function resizeRigidBody(
    object,
    axis,
    value
) {
    const g = object.geometry;

    const shape =
        enggFeatureGeometry.rigidBodyShape(g);

    if (shape === "circle") {
        setRigidBodyRadius(object, value / 2);
        return;
    }

    if (shape === "polygon") {
        setRigidBodyRadius(object, value / 2);
        return;
    }

    if (shape === "triangle") {
        /*
         * A triangle has no width or height of its own, so a
         * size change scales its vertices about the body's
         * centre. Scaling rather than translating keeps the
         * triangle centred where it was.
         */
        const centre =
            enggFeatureGeometry
                .rigidBodyCenter(g);

        const current = triangleExtent(g, centre, axis);

        if (!centre || !current) {
            return;
        }

        const factor = value / current;

        const component = axis === "width" ? "x" : "y";

        (g.points || [])
            .filter(Boolean)
            .forEach(point => {
                point[component] =
                    centre[component] +
                    (point[component] - centre[component]) *
                        factor;
            });

        return;
    }

    g[axis] = value;
}

/*
 * The current extent of a triangle along one axis.
 *
 * Measured across the three vertices rather than taken from any
 * stored value, because a triangle has no width or height field
 * to read it from.
 */
function triangleExtent(
    g,
    centre,
    axis
) {
    const points = (g.points || []).filter(Boolean);

    if (!points.length) {
        return 0;
    }

    const values = points.map(point => point[axis]);

    return Math.max(...values) - Math.min(...values);
}

/*
 * Set the size of a rigid body that is defined by a single radius.
 *
 * A circle and a polygon both measure from their centre outwards,
 * so one radius covers both.
 */
function setRigidBodyRadius(
    object,
    radius
) {
    const g = object.geometry;

    g.radius = radius;
}

function bindFeaturePropertyControls(object) {
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

    /*
     * A Moment reverses the way round it acts, which is one flag
     * on the geometry and nothing else.
     *
     * The application point is NOT touched: a moment applied at a
     * point stays applied at that point, and only the direction
     * its curved arrow sweeps changes. That is what makes the
     * control a reversal rather than a move, and it is why the
     * magnitude, the position and the parent are all untouched.
     */
    drawingProperties.querySelectorAll('[data-moment-reverse-direction]').forEach(button => {
        button.addEventListener('click', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            /*
             * CCW <-> CW.
             *
             * One field is written, and it is the feature's own
             * `direction`. The arrowhead moves to the other end of the
             * opening and the curve sweeps the other way, both of which
             * the shared rotational renderer works out from this one
             * value - so there is no second place that has to be
             * updated and no way for the head to end up on the wrong
             * end of an unchanged curve.
             *
             * And NOTHING ELSE IS TOUCHED. Not the position, not the
             * radius, not the magnitude, not the parent. A reversal is
             * a change of sense and nothing more, which is why this
             * writes a single field rather than recomputing a
             * geometry.
             */
            object.geometry.direction =
                momentDirectionOf(object.geometry) === "CW"
                    ? "CCW"
                    : "CW";

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            setToolMessage(
                object.geometry.direction === "CW"
                    ? "Moment direction reversed to clockwise"
                    : "Moment direction reversed to anticlockwise"
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

                const attachment =
                    enggBodyFrames.pointAt(
                        frame,
                        clamped
                    );

                const placement =
                    enggBodyFrames.supportPlacement(
                        parent,
                        attachment,
                        object.geometry.flipped === true
                    );

                object.geometry.attachment = {
                    distance: clamped
                };

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
                window.enggDrawingRotationalArrow;

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


/*
 * Rebuild a triangle's points from sides and
 * angles.
 *
 * Sides are the primary constraint because a side
 * triple determines the triangle shape uniquely
 * (SSS). Angles only act as a fallback for the
 * cases sides cannot cover, and are never applied
 * all at once, because three angles that do not sum
 * to 180 degrees are contradictory and would
 * produce invalid geometry.
 */
function applyTriangleSidesAndAngles(
    object,
    key,
    value
) {
    const g =
        object.geometry;

    const points =
        (g.points || []).filter(
            Boolean
        );

    if (points.length < 3) {
        return false;
    }

    const measurements =
        triangleMeasurements(points);

    if (!measurements) {
        return false;
    }

    const fixed = name =>
        Boolean(object.constraints?.[name]);

    const positive = value > 0;

    const sideIndex =
        /^side(\d)$/.exec(key);

    const angleIndex =
        /^angle(\d)$/.exec(key);

    if (sideIndex) {
        if (!positive || fixed(key)) {
            return false;
        }

        const index =
            Number(sideIndex[1]) - 1;

        /*
         * Other sides that the user has fixed must keep
         * their exact values, so they are restored from the
         * constraint rather than recomputed from geometry.
         */
        const sideKeys = [
            "side1",
            "side2",
            "side3"
        ];

        /*
         * A new side length must still close the
         * triangle: the two remaining sides have to
         * be able to span it.
         */
        const others =
            measurements.sides.filter(
                (_, position) =>
                    position !== index
            );

        if (
            value >=
                others[0] +
                others[1] - 1e-9 ||
            value <=
                Math.abs(
                    others[0] -
                    others[1]
                ) + 1e-9
        ) {
            return false;
        }

        /*
         * Rebuild from point 1 and point 2 using the
         * new side 1 length, then place point 3 from
         * the two fixed remaining sides.
         */
        const sides =
            measurements.sides.slice();

        sides[index] = value;

        /*
         * Re-assert every fixed side, so a change to one
         * side can never silently move a constrained one.
         */
        sideKeys.forEach(
            (
                sideKey,
                position
            ) => {
                if (
                    position !== index &&
                    fixed(sideKey)
                ) {
                    sides[position] =
                        Number(
                            object.constraints[
                                `${sideKey}Value`
                            ]
                        );

                    if (
                        !Number.isFinite(
                            sides[position]
                        ) ||
                        sides[position] <= 0
                    ) {
                        sides[position] =
                            measurements.sides[
                                position
                            ];
                    }
                }
            }
        );

        const [sideA, sideB, sideC] =
            sides;

        /*
         * The fixed sides must still be able to form a
         * triangle with the new value.
         */
        if (
            sideA + sideB <= sideC + 1e-9 ||
            sideA + sideC <= sideB + 1e-9 ||
            sideB + sideC <= sideA + 1e-9
        ) {
            return false;
        }

        /*
         * A fixed angle constrains the shape, so the side
         * lengths must still produce it. The angle opposite
         * a side follows from the cosine rule, so each fixed
         * angle is checked against the candidate sides and
         * the edit is refused if it would break one.
         */
        const angleFromSides = (
            opposite,
            first,
            second
        ) => {
            const cosine =
                (
                    first * first +
                    second * second -
                    opposite * opposite
                ) /
                (2 * first * second);

            return (
                Math.acos(
                    Math.max(
                        -1,
                        Math.min(1, cosine)
                    )
                ) *
                180 /
                Math.PI
            );
        };

        /*
         * Angle 1 is opposite side 2, angle 2 opposite side 3
         * and angle 3 opposite side 1, matching the labelling
         * used by triangleMeasurements.
         */
        const candidateAngles = [
            angleFromSides(sideB, sideC, sideA),
            angleFromSides(sideC, sideA, sideB),
            angleFromSides(sideA, sideB, sideC)
        ];

        const brokenAngle =
            [0, 1, 2].some(
                position => {
                    const angleKey =
                        `angle${position + 1}`;

                    if (!fixed(angleKey)) {
                        return false;
                    }

                    const pinned =
                        Number(
                            object.constraints[
                                `${angleKey}Value`
                            ]
                        );

                    if (!Number.isFinite(pinned)) {
                        return false;
                    }

                    return (
                        Math.abs(
                            candidateAngles[position] -
                            pinned
                        ) > 0.5
                    );
                }
            );

        if (brokenAngle) {
            return false;
        }

        /*
         * Keep side 1 between point 1 and point 2,
         * so a change there moves point 2 along the
         * existing direction and then re-solves
         * point 3.
         */
        const first = {
            ...points[0]
        };

        const direction =
            Math.atan2(
                points[1].y -
                    points[0].y,
                points[1].x -
                    points[0].x
            );

        const second = {
            x:
                first.x +
                sideA *
                    Math.cos(direction),

            y:
                first.y +
                sideA *
                    Math.sin(direction)
        };

        const third =
            triangleThirdPoint(
                first,
                second,
                sideB,
                sideC,
                points[2]
            );

        if (!third) {
            return false;
        }

        g.points = [
            first,
            second,
            third
        ];

        return true;
    }

    if (angleIndex) {
        if (!positive || fixed(key)) {
            return false;
        }

        const index =
            Number(angleIndex[1]) - 1;

        const angles =
            measurements.angles.slice();

        /*
         * Do not apply a third angle when the other
         * two already fix the remaining angle, and
         * reject any set that cannot sum to 180
         * degrees.
         */
        const otherAngles =
            angles.filter(
                (_, position) =>
                    position !== index
            );

        if (
            value >= 180 ||
            value +
                otherAngles[0] +
                otherAngles[1] <=
                1e-9
        ) {
            return false;
        }

        angles[index] = value;

        /*
         * Changing one angle breaks the 180 degree rule on
         * its own, so the difference is absorbed by a
         * single other angle wherever that is possible.
         * Only when one angle cannot take the whole change
         * is the remainder shared with the third, so as few
         * values as possible are disturbed.
         */
        const remainder =
            180 - value;

        const otherTotal =
            otherAngles[0] +
            otherAngles[1];

        if (
            remainder <= 0 ||
            otherTotal <= 0
        ) {
            return false;
        }

        const otherIndices =
            [0, 1, 2].filter(
                position =>
                    position !== index
            );

        /*
         * A fixed angle must never be changed indirectly,
         * so the whole remainder has to be absorbed by the
         * angles that are still free.
         */
        const freeIndices =
            otherIndices.filter(
                position =>
                    !fixed(
                        `angle${position + 1}`
                    )
            );

        if (!freeIndices.length) {
            return false;
        }

        /*
         * Restore any fixed angles to the value they were
         * pinned to, then give the remainder to the free
         * angles.
         */
        otherIndices.forEach(
            position => {
                const angleKey =
                    `angle${position + 1}`;

                if (!fixed(angleKey)) {
                    return;
                }

                const pinned =
                    Number(
                        object.constraints[
                            `${angleKey}Value`
                        ]
                    );

                angles[position] =
                    Number.isFinite(pinned) &&
                    pinned > 0
                        ? pinned
                        : otherAngles[
                            otherIndices.indexOf(
                                position
                            )
                        ];
            }
        );

        const freeRemainder =
            remainder -
            otherIndices.reduce(
                (
                    total,
                    position
                ) =>
                    freeIndices.includes(
                        position
                    )
                        ? total
                        : total +
                            angles[position],
                0
            );

        if (freeRemainder <= 0) {
            return false;
        }

        const freeTotal =
            freeIndices.reduce(
                (
                    total,
                    position
                ) =>
                    total +
                    otherAngles[
                        otherIndices.indexOf(
                            position
                        )
                    ],
                0
            );

        if (freeIndices.length === 1) {
            angles[freeIndices[0]] =
                freeRemainder;
        } else if (freeTotal > 0) {
            /*
             * Spread across the free angles in proportion
             * to their current sizes, disturbing as little
             * as possible.
             */
            freeIndices.forEach(
                position => {
                    angles[position] =
                        otherAngles[
                            otherIndices.indexOf(
                                position
                            )
                        ] *
                        (freeRemainder / freeTotal);
                }
            );
        } else {
            return false;
        }

        const total =
            angles[0] +
            angles[1] +
            angles[2];

        /*
         * Guard against any non-finite value reaching the
         * geometry.
         */
        if (
            !Number.isFinite(total) ||
            angles.some(
                angle =>
                    !Number.isFinite(angle) ||
                    angle <= 0
            )
        ) {
            return false;
        }

        if (
            Math.abs(total - 180) > 1e-6
        ) {
            /*
             * The angles no longer form a triangle, so
             * keep the geometry unchanged rather than
             * writing an invalid shape.
             */
            return false;
        }

            /*
             * Choose the base side.
             *
             * When a side is fixed, that side becomes the base
             * and is rebuilt to its pinned length, so an angle
             * change can never disturb a constrained side.
             * Otherwise side 1 stays the base as before.
             */
            const fixedSideIndex =
                [0, 1, 2].find(
                    position => {
                        const pinned =
                            Number(
                                object.constraints[
                                    `side${position + 1}Value`
                                ]
                            );

                        return (
                            fixed(
                                `side${position + 1}`
                            ) &&
                            Number.isFinite(pinned) &&
                            pinned > 0
                        );
                    }
                );

            const baseIndex =
                fixedSideIndex === undefined
                    ? 0
                    : fixedSideIndex;

            const base =
                fixedSideIndex === undefined
                    ? measurements.sides[0]
                    : Number(
                        object.constraints[
                            `side${baseIndex + 1}Value`
                        ]
                    );

            if (
                !Number.isFinite(base) ||
                base <= 0
            ) {
                return false;
            }

            const radians =
                angles.map(
                    angle =>
                        angle *
                        Math.PI /
                        180
                );

            /*
             * Rebuild from side 1 as the base, matching how
             * triangleMeasurements labels the angles:
             *
             *   angle 1 at vertex 0, angle 2 at vertex 1,
             *   angle 3 at vertex 2, so angle 3 is opposite
             *   the base and side 1 = base.
             *
             * The sine rule then gives the other two sides,
             * and the vertices keep their existing order so
             * each angle stays attached to its own vertex.
             */
            const baseAngle =
                Math.sin(radians[2]);

            if (baseAngle <= 1e-9) {
                return false;
            }

            const first = {
                ...points[0]
            };

            const direction =
                Math.atan2(
                    points[1].y - points[0].y,
                    points[1].x - points[0].x
                );

            const second = {
                x:
                    first.x +
                    base *
                        Math.cos(direction),

                y:
                    first.y +
                    base *
                        Math.sin(direction)
            };

            const solved =
                triangleThirdPoint(
                    first,
                    second,
                    base *
                        Math.sin(radians[1]) /
                        baseAngle,
                    base *
                        Math.sin(radians[0]) /
                        baseAngle,
                    points[2]
                );

            if (!solved) {
                return false;
            }

            /*
             * Any other fixed side is honoured by scaling the
             * solved triangle about vertex 0 until that side
             * reaches its pinned length. Scaling keeps every
             * angle intact, so the fixed side and the edited
             * angle are both satisfied.
             */
            const candidate = [
                first,
                second,
                solved
            ];

            const otherFixed =
                [0, 1, 2].find(
                    position =>
                        position !== 0 &&
                        fixed(
                            `side${position + 1}`
                        ) &&
                        Number.isFinite(
                            Number(
                                object.constraints[
                                    `side${position + 1}Value`
                                ]
                            )
                        )
                );

            if (otherFixed !== undefined) {
                const pinned =
                    Number(
                        object.constraints[
                            `side${otherFixed + 1}Value`
                        ]
                    );

                const a =
                    candidate[
                        otherFixed
                    ];

                const b =
                    candidate[
                        (otherFixed + 1) % 3
                    ];

                const current =
                    Math.hypot(
                        b.x - a.x,
                        b.y - a.y
                    );

                if (current > 1e-9 && pinned > 0) {
                    const factor =
                        pinned / current;

                    for (
                        let i = 0;
                        i < candidate.length;
                        i += 1
                    ) {
                        candidate[i] = {
                            x:
                                first.x +
                                (candidate[i].x - first.x) *
                                    factor,

                            y:
                                first.y +
                                (candidate[i].y - first.y) *
                                    factor
                        };
                    }
                }
            }

            g.points = [
                candidate[0],
                candidate[1],
                candidate[2]
            ];

            return true;
        }

    return false;
}

/*
 * Place the third vertex from two known vertices
 * and the two side lengths that reach it, keeping
 * the same side of the base as the current point so
 * the triangle does not flip while being edited.
 */
function triangleThirdPoint(
    first,
    second,
    firstSide,
    secondSide,
    current
) {
    const base =
        distance(first, second);

    if (
        base <= 1e-9 ||
        firstSide <= 1e-9 ||
        secondSide <= 1e-9
    ) {
        return null;
    }

    if (
        firstSide + secondSide <=
            base + 1e-9 ||
        Math.abs(firstSide - secondSide) >=
            base - 1e-9
    ) {
        return null;
    }

    const along =
        (
            base * base +
            firstSide * firstSide -
            secondSide * secondSide
        ) /
        (2 * base);

    const height =
        Math.sqrt(
            Math.max(
                0,
                firstSide * firstSide -
                    along * along
            )
        );

    const direction = {
        x: (second.x - first.x) / base,
        y: (second.y - first.y) / base
    };

    const basePoint = {
        x: first.x + direction.x * along,
        y: first.y + direction.y * along
    };

    /*
     * Two solutions exist; keep the one on the same
     * side of the base as the current vertex.
     */
    const cross =
        direction.x *
            (current.y - first.y) -
        direction.y *
            (current.x - first.x);

    const sign =
        cross >= 0
            ? 1
            : -1;

    return {
        x:
            basePoint.x -
            direction.y *
                height *
                sign,

        y:
            basePoint.y +
            direction.x *
                height *
                sign
    };
}

function updateFeatureProperty(object, key, value) {
    const g = object.geometry;
    const fixed = name => Boolean(object.constraints?.[name]);
    const positive = value > 0;

    /*
     * A RELATIVE coordinate is an offset from the parent the
     * feature is drawn under, and is answered here for every type
     * at once rather than inside each type's own block.
     *
     * Writing it moves the CHILD by the given offset from where
     * the parent is now, and touches nothing about the parent. The
     * stored geometry is still absolute - the parent may be
     * dragged, loaded, or re-parented later, and the absolute
     * position has to survive all of that - so the local value is
     * translated through the parent's live origin rather than
     * stored. That is what makes the relationship hold: drag the
     * parent and the child follows it, and the offset shown in the
     * panel is still the same offset.
     */
    const relative = /^relative\.([xy])$/.exec(key);

    if (relative) {
        if (fixed(key)) return false;

        const parent = object.parentId
            ? drawingState.objects.find(
                  (candidate) =>
                      candidate.id === object.parentId
              )
            : null;

        if (!parent) {
            return false;
        }

        const origin =
            parent.geometry?.start ||
            parent.geometry?.position ||
            parent.geometry?.origin;

        if (!origin) {
            return false;
        }

        const axis = relative[1];

        /*
         * The same places the panel reads as this feature's
         * anchor, written together: a force is positioned by its
         * application point, a support by its position, a load by
         * the start of the span it acts on. Moving only the start
         * of a load would leave its far end behind and shorten the
         * loaded region, so all of a feature's span is carried
         * across by the same amount.
         */
        if (g.start && g.end) {
            const shiftX =
                axis === "x"
                    ? value - (g.start.x - origin.x)
                    : 0;

            const shiftY =
                axis === "y"
                    ? value - (g.start.y - origin.y)
                    : 0;

            [g.start, g.end].forEach((point) => {
                point.x += shiftX;
                point.y += shiftY;
            });

            if (g.position) {
                g.position = { ...g.start };
            }

            return true;
        }

        if (g.position) {
            if (axis === "x") {
                g.position.x = origin.x + value;
            } else {
                g.position.y = origin.y + value;
            }

            if (g.start) {
                g.start = { ...g.position };
            }

            return true;
        }

        return false;
    }

    if (object.type === 'triangle') {
        /*
         * Point coordinates are the source of truth in
         * Points mode; sides and angles rebuild the
         * points in Sides & Angles mode.
         */
        const pointMatch =
            /^points\.(\d)\.([xy])$/.exec(key);

        if (pointMatch) {
            const index =
                Number(pointMatch[1]);

            const axis =
                pointMatch[2];

            if (
                fixed(`points.${index}`) ||
                !g.points?.[index]
            ) {
                return false;
            }

            g.points[index][axis] =
                value;

            return true;
        }

        if (
            key.startsWith('side') ||
            key.startsWith('angle')
        ) {
            return applyTriangleSidesAndAngles(
                object,
                key,
                value
            );
        }

        return false;
    }

    if (key.startsWith('points.')) {
        const [, index, axis] = key.split('.');
        if (fixed(`points.${index}`) || !g.points?.[index]) return false;
        g.points[index][axis] = value;
        return true;
    }

    if (object.type === 'line') {
        const start = g.start;
        const end = g.end;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        if (key.startsWith('start.') || key.startsWith('end.')) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey) || (fixed('start') && fixed('end'))) return false;
            const point = g[pointKey];
            const otherKey = pointKey === 'start' ? 'end' : 'start';
            const other = g[otherKey];
            const next = { ...point, [axis]: value };
            if (fixed('length') || fixed('angle')) {
                if (fixed(otherKey)) {
                    // A single coordinate cannot be changed independently when
                    // the opposite endpoint and a dimension are both fixed.
                    return false;
                }
                const sign = pointKey === 'start' ? 1 : -1;
                const proposedAngle = Math.atan2(
                    (next.y - other.y) * -sign,
                    (next.x - other.x) * -sign
                );
                const direction = fixed('angle') ? angle : proposedAngle;
                const extent = fixed('length') ? length :
                    Math.hypot(next.x - other.x, next.y - other.y);
                point[axis] = value;
                other.x = next.x + sign * extent * Math.cos(direction);
                other.y = next.y + sign * extent * Math.sin(direction);
            } else {
                point[axis] = value;
            }
            return true;
        }
        if (key === 'length' && positive && !fixed('length')) {
            if (fixed('end') && fixed('start')) return false;
            const target = fixed('end') ? start : end;
            const anchor = fixed('end') ? end : start;
            const direction = fixed('end') ? angle + Math.PI : angle;
            target.x = anchor.x + value * Math.cos(direction);
            target.y = anchor.y + value * Math.sin(direction);
            return true;
        }
        if (key === 'angle' && !fixed('angle')) {
            if (fixed('start') && fixed('end')) return false;
            const radians = value * Math.PI / 180;
            if (fixed('end')) {
                start.x = end.x - length * Math.cos(radians);
                start.y = end.y - length * Math.sin(radians);
            } else {
                end.x = start.x + length * Math.cos(radians);
                end.y = start.y + length * Math.sin(radians);
            }
            return true;
        }
        return false;
    }

    if (object.type === "force") {
        /*
         * A Point Force is one vector, and the panel offers it two
         * ways: as a magnitude and a direction, or as the two
         * components it is made of. Each edit is therefore
         * applied to the CURRENT vector and then written back
         * through the one function that updates every
         * representation of it at once.
         *
         * Doing it this way is what makes the two views
         * interchangeable: typing a magnitude and switching to
         * components shows the components that magnitude implies,
         * and typing a component and switching back shows the
         * magnitude and angle those components imply.
         */
        if (
            key === 'start.x' ||
            key === 'start.y'
        ) {
            if (fixed('start') || !g.start) return false;

            const axis = key.split('.')[1];

            g.start[axis] = value;
            g.position = {
                x: g.start.x,
                y: g.start.y
            };

            return true;
        }

        const vector =
            enggLoadProfile.forceVector(g);

        if (key === 'magnitude') {
            if (fixed('magnitude')) return false;
            enggLoadProfile.setForceVector(
                g,
                value,
                vector.angle
            );
            return true;
        }

        if (key === 'angle') {
            if (fixed('angle')) return false;
            enggLoadProfile.setForceVector(
                g,
                vector.magnitude,
                value
            );
            return true;
        }

        if (key === 'forceX' || key === 'forceY') {
            if (fixed(key)) return false;

            enggLoadProfile.setForceVector(
                g,
                Math.hypot(
                    key === 'forceX' ? value : vector.fx,
                    key === 'forceY' ? value : vector.fy
                ),
                Math.atan2(
                    key === 'forceY' ? value : vector.fy,
                    key === 'forceX' ? value : vector.fx
                ) * 180 / Math.PI
            );

            return true;
        }

        return false;
    }

    if (object.type === "load") {
        /*
         * A Distributed Load is one continuous load, and each of
         * its properties is a parameter of that load rather than
         * a separate thing to be edited.
         *
         * The direction is one value shared by every arrow, which
         * is what keeps the field parallel. The interval is a
         * sampling parameter, not a list of forces: changing it
         * changes how finely the same continuous load is drawn.
         * The defining points are the shape of the profile, and a
         * position is stored as a fraction along the body so
         * moving or resizing the body carries the profile with it.
         */
        if (
            key === 'start.x' ||
            key === 'start.y' ||
            key === 'end.x' ||
            key === 'end.y'
        ) {
            if (fixed(key)) return false;

            const [pointKey, axis] = key.split('.');

            g[pointKey][axis] = value;

            return true;
        }

        if (key === 'direction') {
            if (fixed('direction')) return false;
            enggLoadProfile.setLoadDirection(g, value);
            return true;
        }

        if (key === 'interval') {
            if (fixed('interval')) return false;
            enggLoadProfile.setLoadInterval(g, value);
            return true;
        }

        if (key === 'intensity') {
            if (fixed('intensity')) return false;

            /*
             * Intensity is the mean of the profile, so writing it
             * scales the whole load uniformly rather than
             * overwriting a single arrow's length.
             */
            const points =
                enggLoadProfile.profilePoints(g);

            const peak =
                enggLoadProfile.peakMagnitude(g);

            if (peak <= 0) {
                return false;
            }

            enggLoadProfile.setProfilePoints(
                g,
                points.map(point => ({
                    t: point.t,
                    magnitude: point.magnitude * value / peak
                }))
            );

            return true;
        }

        const loadPoint =
            /^loadPoint\.(\d+)\.(magnitude|t)$/.exec(key);

        if (loadPoint) {
            const index =
                Number(loadPoint[1]);

            const field =
                loadPoint[2];

            if (fixed(key)) return false;

            const points =
                enggLoadProfile.profilePoints(g);

            if (!points[index]) {
                return false;
            }

            if (field === 'magnitude') {
                points[index].magnitude =
                    Math.max(0, value);
            } else {
                /*
                 * A position of 100 is the far end of the body,
                 * so a value typed as a percentage is divided
                 * back down to the fraction the model stores. It is
                 * clamped rather than rejected, because a point
                 * dragged just past the end belongs at the end.
                 */
                const moved = Math.max(
                    0,
                    Math.min(1, value / 100)
                );

                points[index].t = moved;
            }

            /*
             * A point dragged onto its neighbour describes two
             * magnitudes at one location, which the profile
             * supports and the renderer draws. Nothing is merged
             * away here, because a magnitude the user can still
             * see listed must not vanish from the drawing.
             */
            enggLoadProfile.setProfilePoints(
                g,
                points
            );

            return true;
        }

        return false;
    }

    if (
        object.type === "varying-load"
    ) {
        if (
            key === 'direction'
        ) {
            if (fixed('direction')) return false;
            enggLoadProfile.setLoadDirection(g, value);
            return true;
        }

        if (key === 'interval') {
            if (fixed('interval')) return false;
            enggLoadProfile.setLoadInterval(g, value);
            return true;
        }

        if (key === 'startIntensity' || key === 'endIntensity') {
            if (fixed(key)) return false;
            g[key] = Math.max(0, value);
            return true;
        }
    }

    if (
        object.type === "support" ||
        object.type === "body" ||
        object.type === "particle" ||
        object.type === "moment" ||
        object.type === "couple" ||
        object.type === "load" ||
        object.type === "varying-load" ||
        object.type === "pin-support" ||
        object.type === "roller-support" ||
        object.type === "fixed-support" ||
        object.type === "smooth-support" ||
        object.type === "pin-connection" ||
        object.type === "fixed-connection" ||
        object.type === "slider-connection" ||
        object.type === "connection"
    ) {
        /*
         * Statics features edit through the same property
         * pipeline as geometry, so snapping, constraints
         * and undo all behave identically.
         */
        if (key.startsWith('position.')) {
            if (fixed('position')) return false;
            g.position[key.split('.')[1]] = value;
            return true;
        }

        if (
            key === 'start.x' || key === 'start.y' ||
            key === 'end.x' || key === 'end.y'
        ) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey)) return false;
            g[pointKey][axis] = value;
            return true;
        }

        if (
            key === 'magnitude' ||
            key === 'angle' ||
            key === 'separation' ||
            key === 'intensity' ||
            key === 'orientation' ||
            key === 'reaction'
        ) {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g[key] = value;
            return true;
        }

        return false;
    }

    if (object.type === 'rigid-body') {
        /*
         * A rigid body is one body whose outline can change, so
         * its properties are written through the shape-aware
         * keys the panel shows. Writing a centre moves the body
         * whole, and writing a size changes the current shape
         * rather than replacing the body.
         */
        if (key.startsWith('rigidCentre.')) {
            if (fixed('rigidCentre')) return false;
            moveRigidBodyTo(object, key.split('.')[1], value);
            return true;
        }

        if (key === 'rigidWidth' || key === 'rigidHeight') {
            if (fixed(key) || !positive) return false;
            resizeRigidBody(object, key === 'rigidWidth' ? 'width' : 'height', value);
            return true;
        }

        if (key === 'rigidRadius') {
            if (fixed(key) || !positive) return false;
            setRigidBodyRadius(object, value);
            return true;
        }

        if (key === 'rigidSides') {
            if (fixed(key)) return false;
            const sides = Math.round(value);
            if (!Number.isFinite(sides) || sides < 3) return false;
            g.sides = sides;
            return true;
        }

        if (key === 'rigidRotation') {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g.rotation = value;
            return true;
        }

        if (key.startsWith('points.')) {
            const [, index, axis] = key.split('.');
            if (fixed(`points.${index}`) || !g.points?.[index]) return false;
            g.points[index][axis] = value;
            return true;
        }

        return false;
    }

    if (
        object.type === 'beam' ||
        object.type === 'truss' ||
        object.type === 'cable' ||
        object.type === 'shaft'
    ) {
        /*
         * Slender members edit through their endpoints, plus
         * whichever property belongs to their own role.
         */
        if (
            key === 'start.x' || key === 'start.y' ||
            key === 'end.x' || key === 'end.y'
        ) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey)) return false;
            g[pointKey][axis] = value;
            return true;
        }

        if (
            key === 'depth' ||
            key === 'panels' ||
            key === 'tension' ||
            key === 'diameter' ||
            key === 'torque' ||
            key === 'startIntensity' ||
            key === 'endIntensity'
        ) {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g[key] = value;
            return true;
        }

        return false;
    }

    if (object.type === 'point') {
        if (fixed('position')) return false;
        const target = g.position || g.point || g;
        const [part, axis] = key.split('.');
        if (part !== 'position') return false;
        target[axis] = value;
        return true;
    }

    if (object.type === 'circle' || object.type === 'arc') {
        if (key.startsWith('center.')) {
            if (fixed('center')) return false;
            g.center[key.split('.')[1]] = value;
            return true;
        }
        if ((key === 'radius' || key === 'diameter') && positive && !fixed(key) && !fixed(key === 'radius' ? 'diameter' : 'radius')) {
            g.radius = key === 'radius' ? value : value / 2;
            return true;
        }
        if (object.type === 'arc') {
            if (fixed(key)) return false;
            if (key === 'startAngle' || key === 'endAngle') {
                if (fixed('includedAngle')) return false;
                g[key] = value * Math.PI / 180;
                g.sweep = g.endAngle - g.startAngle;
                return true;
            }
            if (key === 'includedAngle') {
                if (fixed('endAngle')) return false;
                g.sweep = value * Math.PI / 180;
                g.endAngle = g.startAngle + g.sweep;
                return true;
            }
        }
        return false;
    }

    if (object.type === 'rectangle') {
        if (key.startsWith('centre.')) {
            if (fixed('centre')) return false;
            const axis = key.split('.')[1];
            g.position[axis] = axis === 'x' ? value - g.width / 2 : value + g.height / 2;
            return true;
        }
        if ((key === 'width' || key === 'height') && positive && !fixed(key)) {
            g[key] = value;
            return true;
        }
        if (key === 'rotation' && !fixed(key)) {
            g.rotation = value;
            return true;
        }
        return false;
    }

    if (object.type === 'polygon') {
        /*
         * Every edit writes to the polygon's defining
         * parameters. The vertices are derived from
         * these, so there is no second copy to keep in
         * sync.
         */
        if (key.startsWith('center.')) {
            if (fixed('center')) return false;
            g.center[key.split('.')[1]] = value;
            return true;
        }
        if (key === 'sides') {
            if (fixed('sides')) return false;
            const sides = Math.round(value);
            if (!Number.isFinite(sides) || sides < 3) return false;
            g.sides = sides;
            return true;
        }
        if (key === 'radius') {
            if (fixed('radius') || !positive) return false;
            g.radius = value;
            return true;
        }
        if (key === 'rotation') {
            if (fixed('rotation')) return false;
            g.rotation = value * Math.PI / 180;
            return true;
        }
        return false;
    }

    if (
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
         * Each axis edits only its own geometry, so a
         * change to one never moves the other three.
         */
        if (key.startsWith('origin.')) {
            if (fixed('origin')) return false;
            g.origin[key.split('.')[1]] = value;
            return true;
        }
        if (key === 'axisLength') {
            if (fixed('axisLength') || !positive) return false;
            g.axisLength = value;
            return true;
        }
        return false;
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * One feature, four independent extensions.
         * Writing one length never touches the others.
         */
        if (key.startsWith('origin.')) {
            if (fixed('origin')) return false;
            g.origin[key.split('.')[1]] = value;
            return true;
        }

        if (
            [
                'xPositiveLength',
                'xNegativeLength',
                'yPositiveLength',
                'yNegativeLength',
                'xAxisLength',
                'yAxisLength',
                'axisLength'
            ].includes(key)
        ) {
            if (fixed(key) || !positive) return false;
            g[key] = value;
            return true;
        }
    }
    return false;
}


function syncStyleControls() {
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

function handleCanvasClick(
    event
) {
    /*
     * The colour eyedropper is a one-shot mode: the next
     * click reads a feature's stored colour instead of
     * doing anything else with the click.
     */
    if (eyedropperActive) {
        event.preventDefault();

        pickColourFromFeature(
            event
        );

        return;
    }

    /*
     * A running Modify session owns the click. It is
     * checked before the selection-suppression flag so a
     * staged workflow is never swallowed by a leftover
     * selection drag.
     */
    if (
        modifySession &&
        handleModifyClick(
            resolvePointerEvent(
                event
            ),
            canvasPointFromEvent(
                event,
                false
            ),
            event.shiftKey
        )
    ) {
        selectionClickSuppressed =
            false;

        return;
    }

    if (
        selectionClickSuppressed
    ) {
        selectionClickSuppressed =
            false;

        return;
    }

    /*
     * Resolve the exact click position again.
     *
     * This is important because relying on the
     * previous mousemove resolution can cause a
     * click to use a stale unsnapped point.
     */
    const resolution =
        resolvePointerEvent(
            event
        );

    if (
        drawingState.activeTool ===
        "coordinate-system-2d"
    ) {
        add2DCoordinateSystem(
            resolution.effectiveConstructionPoint
        );

        return;
    }

    if (
        !drawingState.activeTool
    ) {
        return;
    }

    /*
     * A running Modify session owns the click, so its
     * staged workflow is not interrupted by ordinary
     * tool handling.
     */
    if (
        modifySession &&
        handleModifyClick(
            resolution,
            canvasPointFromEvent(
                event,
                false
            )
        )
    ) {
        return;
    }

    if (
        isConstructionTool(
            drawingState.activeTool
        )
    ) {
        beginOrCompleteGeometry(
            resolution
        );

        return;
    }

    /*
     * The dimension tools. Checked before Select because they are
     * creation tools: they are told about a click on empty canvas to
     * place a dimension there, not treated as a click that selects
     * nothing.
     */
    if (
        isDimensionTool(
            drawingState.activeTool
        )
    ) {
        handleDimensionClick(
            resolution,
            event
        );

        return;
    }

    /*
     * The annotation tool. Checked after the dimension tools because it
     * behaves the same way - arm, then place - and differs only in what it is
     * labelling.

     */
    if (
        isAnnotationTool(
            drawingState.activeTool
        )
    ) {
        handleAnnotationClick(
            resolution,
            event
        );

        return;
    }

    /*
     * UNIVERSAL SELECTION.
     *
     * This is the one rule that makes Select mean the same thing
     * everywhere: clicking a feature that ALREADY EXISTS selects it,
     * whichever tool is currently active.
     *
     * Before this, selecting an existing object was only possible
     * with the Select tool active. A student with Beam selected who
     * clicked an existing Point Force did not select the force - the
     * Beam tool consumed the click and started a new beam through
     * it. Selecting therefore became a mode the student had to be
     * IN, and switching to it and back for every edit was pure
     * friction.
     *
     * WHERE IT SITS IN THE ORDER, AND WHY
     * -----------------------------------
     * Placement is the design; it is a priority order and not a set
     * of tool exceptions:
     *
     *   1. an active editing interaction  - Modify, handled above
     *   2. the tool's own meaning for a click on existing geometry -
     *      construction, dimensions, annotations
     *   3. a CONSTRUCTION that is mid-flight and needs this click as
     *      one of ITS points
     *   4. an existing object under the pointer
     *   5. the tool's own handling of empty space
     *
     * Step 2 is why this block sits BELOW the dimension and annotation
     * tools rather than above them, and getting that wrong is the
     * mistake this ordering exists to prevent.
     *
     * A dimension and an annotation are not placed on empty canvas.
     * They are MEASURED and LABELLED, and the whole point of them is
     * that they attach to something already on the sheet: clicking a
     * beam with the Dimension tool means "measure that beam", and
     * clicking a force with the Annotation tool means "write on that
     * force". Intercepting those clicks to select the beam instead
     * would quietly remove the tools' entire reason for being - the
     * student could not dimension anything without switching to Select
     * first, which is the very problem this change removes,
     * reintroduced one level down.
     *
     * Steps 3 and 4 are the universal part. A running construction is
     * exempt - a half-built Beam is waiting for its second point, and
     * taking the click for a selection would strand it - and the
     * exemption is asked of the interaction state rather than of a
     * list of tools, so no tool can be forgotten.
     *
     * Step 4 uses the same hit test Select uses, which already knows
     * about dimensions, annotations, analysis objects and every
     * statics symbol. So no tool needs to know how to be selectable
     * and no category needs its own rule: a tool that was never
     * thought about when this was written still gets it.
     */
    if (
        shouldClickSelectExistingObject(
            event
        )
    ) {
        selectFromCanvasClick(
            event
        );

        return;
    }

    /*
     * THE ANALYSIS AXIS PLACEMENT.
     *
     * Checked before the construction tools, because the diagram tools
     * are no longer construction tools - choosing one of them puts the
     * sheet into this placement rather than arming a span - and a click
     * here is the COMMITMENT of a preview the student has already
     * been looking at, not the selection of something on the sheet.
     *
     * A click on an existing feature during placement is a placement
     * click, not a selection: the student is being asked where the
     * diagram goes, and the only thing that answers that is where the
     * pointer is. Selecting instead would let a click on the beam
     * leave the diagram unplaced and the tool still armed, which is
     * the one outcome that leaves the sheet in a half-finished state.
     */
    if (
        drawingState.interaction.phase ===
            "analysis-axis"
    ) {
        commitAnalysisAxis();

        return;
    }

    if (
        drawingState.activeTool ===
        "select"
    ) {
        selectFromCanvasClick(
            event
        );
    }
}

/*
 * APPLY A SELECTION CLICK.
 *
 * Extracted from the Select tool's branch of handleCanvasClick so
 * that the same selection rules - Shift to extend, a second click to
 * open a dimension's editor, a click on nothing to clear - are
 * applied whether the click arrived with Select active or with
 * another tool active and the click being read as a selection.
 *
 * It is deliberately ONE function rather than two similar ones. The
 * behaviour that matters here is not subtle: Shift adds and removes,
 * clicking empty space deselects, clicking a selected dimension twice
 * opens its editor. Duplicating that list for a second entry point
 * would guarantee the two drifted, and a student who learned that
 * Shift works with Select would find it did nothing with Beam.
 *
 * Returns true when the click was consumed as a selection, so the
 * caller knows whether the tool that was active also got a turn.
 */
function selectFromCanvasClick(
    event
) {
    /*
     * Selection uses the actual pointer position, never a snapped
     * construction point. A student clicking the thing they can see
     * means that pixel, not the nearest vertex to it.
     */
    const rawPoint =
        canvasPointFromEvent(
            event,
            false
        );

    const object =
        objectAtPoint(
            rawPoint
        );

    const selectedIds =
        drawingState.selection
            .selectedObjectIds;

    /*
     * Shift extends the selection: clicking an
     * unselected feature adds it, clicking an already
     * selected feature removes it. Without Shift the
     * click replaces the selection as before.
     */
    if (event.shiftKey) {
        if (object) {
            const selected =
                drawingState.selection
                    .selectedObjectIds;

            enggDrawingState.selectObjects(
                drawingState,
                selected.includes(
                    object.id
                )
                    ? selected.filter(
                        id =>
                            id !==
                            object.id
                    )
                    : [
                        ...selected,
                        object.id
                    ]
            );
        }
    } else if (object) {
        /*
         * Clicking a feature that is already the one the
         * list has picked opens its editing page. It is the
         * same deliberate second step as clicking a tree row
         * twice, and it uses the same flag so the two cannot
         * disagree about what counts as a repeat.
         */
        const pickedAlready =
            featurePanelView === "tree" &&
            featureTreePickedId === object.id;

        enggDrawingState.selectObject(
            drawingState,
            object.id
        );

        if (pickedAlready) {
            featurePanelView = "edit";
            featureTreePickedId = null;
        } else {
            featureTreePickedId = object.id;
        }

        /*
         * CLICKING A SELECTED DIMENSION AGAIN OPENS ITS EDITOR.
         *
         * A second click on the object already picked is the
         * application's existing "open this thing" gesture -
         * clicking a tree row twice does the same - so a dimension
         * uses it too. That puts the editor one click from the
         * dimension itself rather than in a panel the student has
         * to go and find, which is the point: the thing being
         * edited and the thing being clicked are the same thing.
         *
         * Only for a dimension, and only once it is already the
         * selection: the first click still selects, so a dimension
         * can still be picked among several overlapping features.
         */
        if (
            !pickedAlready &&
            object.type === "dimension" &&
            featureTreePickedId === object.id
        ) {
            featureTreePickedId = null;

            openDimensionEditorFor(object);

            return true;
        }
    } else {
        enggDrawingState.clearSelection(
            drawingState
        );
    }

    renderProperties();
    renderCurrentDrawing();

    return true;
}

/*
 * OPEN THE DIMENSION EDITOR FOR A DIMENSION.
 *
 * Reads everything the dialog shows FROM THE DIMENSION, so the editor
 * is never a second source of truth about what a dimension says - it
 * is a view of the model, plus the two kinds of change the model
 * permits.
 *
 * THE TWO KINDS OF CHANGE
 *
 *   DISPLAY   precision and whether units are shown. Belongs to this
 *             one dimension and touches nothing else. Recorded on the
 *             dimension's own style, so it travels with the dimension
 *             when the file is saved.
 *
 *   CALIBRATION
 *             a real-world length, which means the DRAWING is a
 *             different size than assumed. That is a change to the
 *             document, not to the dimension, and it is applied through
 *             the one scale every dimension reads. So it updates all
 *             of them, which is correct: they all measure the same
 *             drawing.
 *
 * Neither path can invent a number. There is no code path from this
 * dialog to "set this dimension's value", because the model has no
 * such field to set and there must never be one.
 *
 * ASSOCIATION IS NEVER TOUCHED
 * ----------------------------
 * Neither path writes `sourceRefs`, `dimensionType` or the geometry
 * they point at. A dimension that was measuring Line 004 before the
 * edit is measuring Line 004 after it, and will go on following it
 * when the line moves.
 */
function openDimensionEditorFor(object) {
    const measurement =
        enggDimensionModel.measurementFor(
            object,
            drawingState
        );

    const measuredText =
        enggDimensionModel.formatMeasurement(
            object,
            drawingState
        );

    const sourceId = dimensionSourceFeatureId(
        object
    );

    const source =
        sourceId
            ? drawingState.objects.find(
                (candidate) =>
                    candidate.id === sourceId
            )
            : null;

    /*
     * The drawing length, for the calibration field.
     *
     * Stated in DRAWING UNITS, because that is what the student is
     * being asked to confirm. "this line is 41 units long and the real
     * length is 125 mm" is a true sentence; "this line is 41 mm" is
     * not, and would invite the student to edit the wrong number.
     */
    const drawingLength =
        measurement
            ? `${Number(measurement.value).toFixed(2)} drawing units`
            : "";

    window.enggDimensionEditor.open({
        dimension: object,
        dimensionType: object.dimensionType,
        measuredText,
        drawingLength,
        unit:
            window.enggDimensions.readScale(
                drawingState
            )?.unit || "mm",
        precision: object.style?.precision ?? 2,
        showUnits: object.style?.showUnits !== false,
        sourceName: source
            ? source.name || source.type
            : "unknown source",

        onApply: (changes) => {
            const previousObjects =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            if (changes.precision !== undefined) {
                object.style = {
                    ...(object.style || {}),
                    precision: changes.precision
                };
            }

            if (changes.showUnits !== undefined) {
                object.style = {
                    ...(object.style || {}),
                    showUnits: changes.showUnits
                };
            }

            /*
             * A CALIBRATION, not an edit to this dimension.
             *
             * Applied to the document, so every dimension on the sheet
             * is restated against the new scale - which is the point of
             * a calibration. The geometry is not touched: a student who
             * discovers the drawing was the wrong size wants the
             * NUMBERS right, not the shape changed under them.
             */
            if (changes.calibration && measurement) {
                window.enggDimensions.calibrate(
                    drawingState,
                    measurement.value,
                    changes.calibration.realValue,
                    changes.calibration.unit
                );
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previousObjects
            );

            /*
             * Left SELECTED.
             *
             * The dimension did not move and its source did not move,
             * so after an edit it is still the thing the student was
             * working on, and they may well want to nudge it along.
             */
            enggDrawingState.selectObject(
                drawingState,
                object.id
            );

            setToolMessage(
                changes.calibration
                    ? "Scale updated - every dimension on this sheet now uses it"
                    : "Dimension display updated"
            );

            renderProperties();
            renderCurrentDrawing();
        },

        onCancel: () => {
            setToolMessage(
                "Dimension edit cancelled"
            );

            renderCurrentDrawing();
        }
    });
}

/*
 * The feature a dimension measures, whichever of its references names
 * one.
 *
 * A dimension's references may name two features (a pair measurement)
 * or one (a single feature, referenced twice). Both are resolved the
 * same way: the first reference that names a feature on this drawing.
 */
function dimensionSourceFeatureId(object) {
    const refs =
        object.sourceRefs || [];

    for (const ref of refs) {
        if (
            ref?.featureId &&
            drawingState.objects.some(
                (candidate) =>
                    candidate.id === ref.featureId
            )
        ) {
            return ref.featureId;
        }
    }

    return null;
}

function syncSelectionInteraction() {
    if (
        !drawingState.interaction
    ) {
        return;
    }

    if (selectionDrag) {
        drawingState.interaction.selectionStart =
            selectionDrag.start;

        drawingState.interaction.selectionCurrent =
            selectionDrag.current;

        drawingState.interaction.selectionBox =
            selectionDrag.box;

        drawingState.interaction.selectionDragging =
            selectionDrag.moved;
    } else {
        drawingState.interaction.selectionStart =
            null;

        drawingState.interaction.selectionCurrent =
            null;

        drawingState.interaction.selectionBox =
            null;

        drawingState.interaction.selectionDragging =
            false;
    }
}

/*
 * Active direct-manipulation drag.
 *
 * Holds which handle (or body) of which object is being
 * dragged, plus the original geometry so the edit can be
 * applied as a delta from a stable starting point.
 */
let manipulationDrag = null;

/*
 * Which view the Features panel is showing.
 *
 * "tree" is the list of components, and is where the panel
 * normally lives. "edit" is the editing page of the single
 * selected feature.
 *
 * This is explicit state rather than something derived from the
 * selection, because selecting a feature and choosing to edit it
 * are separate decisions. Deriving the view from the selection
 * is what made the panel jump to the editing page every time a
 * feature was picked, and what made pressing Features fail to
 * return to the list: with a feature still selected, the list
 * looked the same as a request to edit it.
 */
let featurePanelView = "tree";

/*
 * Whether the feature currently shown by the tree has already
 * been picked in this same view.
 *
 * A feature is selected the moment it is created, so "is it
 * selected?" is true from the start and cannot by itself mean the
 * user has picked it on purpose. This flag records that a click
 * actually landed on the selected row, so the NEXT one is the
 * deliberate repeat that opens the editor.
 *
 * It is cleared whenever the selection changes to something
 * different, or when the view leaves the tree, so it can never
 * carry over into an unrelated feature.
 */
let featureTreePickedId = null;

/*
 * Abandon an in-flight direct-manipulation drag.
 *
 * The geometry mutates live while dragging, so
 * cancelling has to put the captured originals back,
 * otherwise Esc would leave the shape half-rotated.
 */
function cancelManipulationDrag() {
    if (!manipulationDrag) {
        return;
    }

    const drag =
        manipulationDrag;

    manipulationDrag =
        null;

    if (
        drawingCanvas.hasPointerCapture(
            drag.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            drag.pointerId
        );
    }

    if (!drag.moved) {
        return;
    }

    /*
     * Restore every object the drag touched from the
     * snapshot taken when the drag began.
     */
    drawingState.objects =
        drawingState.objects.map(
            object =>
                drag.originals[object.id]
                    ? {
                        ...JSON.parse(
                            JSON.stringify(
                                drag.originals[
                                    object.id
                                ]
                            )
                        ),

                        /*
                         * Identity and style are the LIVE ones, not the
                         * snapshot's.
                         *
                         * A drag does not re-style or re-identify a
                         * feature, but the snapshot is taken before any
                         * other edit could have happened, and restoring
                         * a stale id would detach the object from
                         * everything that points at it.
                         */
                        id: object.id,
                        style: object.style
                    }
                    : object
        );
}

const MANIPULATION_PICK_PX = 9;

/*
 * The features attached to a given body.
 *
 * Attachment is recorded as an authoritative parent id, so
 * the relationship is read from the feature collection and
 * never inferred from where a feature happens to sit.
 */
function attachedChildren(
    parentId
) {
    if (!parentId) {
        return [];
    }

    return drawingState.objects.filter(
        object =>
            object.parentId ===
                parentId
    );
}

/*
 * Move a body and everything attached to it by the same
 * delta.
 *
 * The children are restored to their pre-drag geometry first
 * so the drag applies exactly one translation rather than
 * accumulating, exactly as the rotation path does.
 */
function moveObjectAndChildren(
    object,
    deltaX,
    deltaY,
    originals
) {
    translateObject(
        object,
        deltaX,
        deltaY
    );

    attachedChildren(
        object.id
    ).forEach(child => {
        const original =
            originals?.[child.id];

        if (original) {
            child.geometry =
                JSON.parse(
                    JSON.stringify(
                        original
                    )
                );
        }

        translateObject(
            child,
            deltaX,
            deltaY
        );
    });
}

/*
 * The Statics support variants. They differ in the symbol
 * they draw, not in how they are selected or edited, so
 * they are identified by one shared predicate.
 */
function isSupportType(
    type
) {
    return [
        "pin-support",
        "roller-support",
        "fixed-support",
        "smooth-support"
    ].includes(type);
}

/*
 * The Statics connection variants. Like the supports, they
 * share one behaviour and differ only in symbol.
 */
function isConnectionType(
    type
) {
    return [
        "pin-connection",
        "fixed-connection",
        "slider-connection"
    ].includes(type);
}

/*
 * The bodies a Statics feature may attach to.
 *
 * Only real bodies are eligible, so a force snapped onto a
 * Beam becomes part of that Beam, while one snapped onto a
 * stray Line stays unattached rather than adopting geometry
 * that has no engineering meaning.
 */
function isStaticsBody(
    object
) {
    return Boolean(
        object &&
            STATICS_ATTACHABLE_FEATURES.includes(
                object.type
            )
    );
}

/*
 * Handles for a distributed or varying distributed load.
 *
 * The two ends move the loaded region and the magnitude
 * handle changes the load itself. The arrows are drawn from
 * these values, so dragging a handle is the same action as
 * typing a new intensity in the panel.
 */
function loadHandles(
    object
) {
    const g = object.geometry;

    const handles = [
        { kind: "start", point: g.start },
        { kind: "end", point: g.end }
    ];

    if (object.type === "load") {
        /*
         * A distributed load's magnitude points are dragged the
         * same way they are typed: each handle writes one point's
         * magnitude, and the profile between them follows. The
         * two ends of the body move the loaded region itself.
         */
        enggLoadProfile
            .profilePoints(g)
            .forEach((point, index) => {
                const along =
                    enggLoadProfile.pointAlong(
                        g,
                        point.t
                    );

                const direction =
                    enggLoadProfile.unitVector(
                        enggLoadProfile.loadDirection(
                            g
                        )
                    );

                handles.push({
                    kind: `load-point${index}`,
                    point: {
                        x:
                            along.x +
                            direction.x *
                                point.magnitude,
                        y:
                            along.y +
                            direction.y *
                                point.magnitude
                    }
                });
            });

        return handles;
    }

    handles.push(
        loadMagnitudeHandle(
            object,
            g.start,
            g.end,
            "startIntensity"
        ),

        loadMagnitudeHandle(
            object,
            g.end,
            g.start,
            "startIntensity"
        )
    );

    return handles;
}

/*
 * A point off the loaded region whose distance from one end
 * is proportional to that end's intensity.
 *
 * Placing it this way means the handle is always somewhere
 * useful to grab, and it is derived from the real geometry
 * rather than from a fixed offset.
 */
function loadMagnitudeHandle(
    object,
    from,
    to,
    key
) {
    const g = object.geometry;

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const length =
        Math.hypot(dx, dy) || 1;

    /*
     * The world length of one unit of intensity, so the
     * handle follows the zoom the way every other handle
     * does.
     */
    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const pixels =
        Math.abs(
            Number(g[key]) || 0
        ) * 6;

    const world =
        pixels / Math.max(scale, 1e-6);

    return {
        kind: `load-${key}`,
        point: {
            x: from.x - (dx / length) * world,
            y: from.y - (dy / length) * world
        }
    };
}

/*
 * Handles for a support: the point where it attaches to its
 * body, and a point one step away that sets which way it
 * faces.
 */
function supportHandles(
    object
) {
    const g = object.geometry;

    const position = g.position;

    if (!position) {
        return [];
    }

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const reach =
        14 / Math.max(scale, 1e-6);

    const angle =
        (Number(g.orientation) || 0) *
        Math.PI /
        180;

    return [
        {
            kind: "position",
            point: position
        },
        {
            kind: "orientation",
            point: {
                x: position.x - Math.sin(angle) * reach,
                y: position.y + Math.cos(angle) * reach
            }
        }
    ];
}

/*
 * The manipulation handles for a rigid body, in its current shape.
 *
 * Each shape is dragged through the handle that means something
 * for it, and every case writes the same defining values the
 * Features panel writes, so the two can never disagree.
 */
function rigidBodyHandles(
    object
) {
    const g = object.geometry;

    const shape =
        enggFeatureGeometry.rigidBodyShape(g);

    if (shape === "circle") {
        const center = g.center || { x: 0, y: 0 };

        return [
            { kind: "rigid-centre", point: center },
            {
                kind: "rigid-radius",
                point: {
                    x: center.x + (Number(g.radius) || 0),
                    y: center.y
                }
            }
        ];
    }

    if (
        shape === "triangle" ||
        shape === "polygon"
    ) {
        return enggFeatureGeometry
            .definingPoints(g, shape)
            .map((point, index) => ({
                kind: `rigid-vertex${index}`,
                point
            }));
    }

    return enggFeatureGeometry
        .rectangleCorners(g)
        .map((point, index) => ({
            kind: `rigid-corner${index}`,
            point
        }));
}

/*
 * One handle per truss joint.
 *
 * A joint is the distinct set of points the members share, so
 * moving a handle moves a single joint and the members meeting
 * it, rather than one arbitrary end of one member.
 */
function trussJointHandles(
    members
) {
    const joints = [];

    members.forEach(member => {
        [member.start, member.end].forEach(point => {
            const known = joints.find(
                existing =>
                    Math.hypot(
                        existing.x - point.x,
                        existing.y - point.y
                    ) < 1e-6
            );

            if (!known) {
                joints.push({
                    x: point.x,
                    y: point.y
                });
            }
        });
    });

    return joints.map((point, index) => ({
        kind: `truss-joint${index}`,
        point
    }));
}

function manipulationHandles(
    object
) {
    const g =
        object.geometry || {};

    /*
     * AN ANNOTATION IS MOVED FROM ITS OWN POSITION.
     *
     * It has no geometry - its whole state is a placement - so the
     * shape handles below never produce anything for it and the one
     * thing a student most needs to do with a label, put it somewhere
     * legible, would be impossible.
     *
     * A single handle at the text is what the existing drag machinery
     * already knows how to carry, so this needs no new drag behaviour:
     * only the handle and a branch in applyManipulation.
     */
    if (
        object.type === "annotation" &&
        object.placement
    ) {
        return [
            {
                kind: "position",
                point: object.placement
            }
        ];
    }

    /*
     * A DIMENSION likewise, but it moves by the offset the student
     * dragged, not by jumping to the pointer - the offset between the
     * measured geometry and the dimension line is what they chose, and
     * losing it would put the dimension back on top of the thing it
     * measures.
     */
    if (
        object.type === "dimension"
    ) {
        const graphics =
            safeDimensionGraphics(object);

        const anchor =
            graphics?.line?.[0] ||
            graphics?.arc?.[0];

        if (!anchor) {
            return [];
        }

        return [
            {
                kind: "annotation-offset",
                point: anchor
            }
        ];
    }

    if (object.type === "point") {
        return [
                {
                    kind: "position",
                    point: g.position || g.point || g
                }
            ];
    }

    if (object.type === "line") {
        return [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ];
    }

    /*
     * Slender members and spans share the same two-end
     * handle layout as a line, so they reuse the start and
     * end drag kinds rather than a parallel set.
     *
     * A Truss is one feature with two real joints, so the
     * handles move those joints; the members its renderer
     * draws follow from them and the topology is preserved.
     */
    if (
        object.type === "beam" ||
        object.type === "truss" ||
        object.type === "cable" ||
        object.type === "shaft" ||
        object.type === "connection"
    ) {
        return [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ];
    }

    /*
     * A Point Force is a vector, so its two handles are the
     * application point and the end of the arrow. Dragging
     * the start moves where the force acts; dragging the end
     * changes its direction and magnitude. The feature stays
     * one coherent force either way.
     */
    if (object.type === "force") {
        return [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ];
    }

    /*
     * A Truss the student built is dragged by its joints.
     *
     * The members are rebuilt from the joint list when a joint
     * moves, so every member that met it follows and the
     * topology survives. A truss that has no stored joints
     * falls back to the two ends of its span.
     */
    if (
        object.type === "truss" &&
        Array.isArray(g.members) &&
        g.members.length
    ) {
        return trussJointHandles(g.members);
    }

    /*
     * A rigid body is one body whose outline can be any of the
     * supported shapes, so its handles follow whichever shape it
     * currently has: corners for a rectangle, a centre and a
     * radius for a circle, and vertices for a triangle or a
     * polygon. The points come from the shared geometry module,
     * which is the same source the renderer and the transforms
     * use, so a handle can never be left on the old shape.
     */
    if (object.type === "rigid-body") {
        return rigidBodyHandles(object);
    }

    if (object.type === "particle") {
        return [
            {
                kind: "position",
                point: g.position
            }
        ];
    }

    /*
     * A distributed load is defined by the span it acts on
     * and the intensity of that load, so it is manipulated
     * through its two ends plus a magnitude handle. The
     * rendered arrows are derived from these and are never
     * edited directly.
     */
    if (
        object.type === "load" ||
        object.type === "varying-load"
    ) {
        return loadHandles(object);
    }

    /*
     * A support acts at one point on a body and faces a
     * direction, so it has an attachment handle and an
     * orientation handle. Dragging the attachment moves the
     * support along its body while it stays attached.
     */
    if (isSupportType(object.type)) {
        return supportHandles(object);
    }

    /*
     * A connection is a joint between two bodies, so it is
     * manipulated through its two actual attachment points.
     */
    if (isConnectionType(object.type)) {
        return [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ];
    }

    /*
     * An applied moment turns about its application point, so
     * that point is its handle. A Couple Moment turns about its
     * position in exactly the same way, so it has the SAME single
     * handle.
     *
     * The couple used to carry a second handle that dragged its two
     * lines of action apart. It is gone with the shape: the curved
     * arrow has no spacing to adjust, and a handle that edited a
     * presentation distance would have let a student change the
     * drawing without changing the moment. Both are now dragged by
     * click-and-drag or by their position handle, which moves the
     * moment and changes nothing else about it.
     */
    if (
        object.type === "moment" ||
        object.type === "couple"
    ) {
        return [
                {
                    kind: "position",
                    point: g.position
                }
            ];
    }

    if (object.type === "circle") {
        return [
                { kind: "center", point: g.center },
                {
                    kind: "radius",
                    point: {
                        x: g.center.x + g.radius,
                        y: g.center.y
                    }
                }
            ];
    }

    if (object.type === "arc") {
        return [
                { kind: "center", point: g.center },
                {
                    kind: "startAngle",
                    point: {
                        x: g.center.x + g.radius * Math.cos(g.startAngle),
                        y: g.center.y + g.radius * Math.sin(g.startAngle)
                    }
                },
                {
                    kind: "endAngle",
                    point: {
                        x: g.center.x + g.radius * Math.cos(g.endAngle),
                        y: g.center.y + g.radius * Math.sin(g.endAngle)
                    }
                }
            ];
    }

    if (isRectangleLike(object)) {
        return rectangleCorners(g).map(
            (point, index) => ({
                kind: `corner${index}`,
                point
            })
        );
    }

    if (object.type === "triangle") {
        return (g.points || []).filter(Boolean).map(
            (point, index) => ({
                kind: `vertex${index}`,
                point
            })
        );
    }

    if (object.type === "polygon") {
        return enggDrawingState.polygonVertices(g).map(
            (point, index) => ({
                kind: `vertex${index}`,
                point
            })
        );
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * One handle per axis end plus the origin, so each
         * of the four extensions can be dragged on its own
         * while the feature stays a single object.
         */
        const arms =
            coordinateSystemArms(g).map(
                arm => ({
                    kind: arm.kind,
                    point: arm.end
                })
            );

        arms.push({
            kind: "origin",
            point: g.origin
        });

        return arms;
    }

    if (Array.isArray(g.points)) {
        return g.points.map(
            (point, index) => ({
                kind: `vertex${index}`,
                point
            })
        );
    }

    return [];
}

/*
 * The panel's Feature Type for a feature that reuses another
 * feature's geometry for a different engineering role.
 *
 * A Reference Line IS a line, so it gets the Line's fields and
 * the Line's endpoint behaviour. Only the NAME it reports is
 * different, so that a reference line is not mistaken for a
 * drawn one in the panel. The geometry is still a line and
 * nothing about the editing model changes.
 */
function staticsRoleLabel(
    object
) {
    const role =
        object?.engineering
            ?.staticsType;

    if (
        role === "reference-line" &&
        object.type === "line"
    ) {
        return "Reference Line";
    }

    return null;
}


/*
 * The four corners of a rectangle, honouring rotation.
 * position is the top-left corner and height extends
 * downward in world space.
 *
 * Shared with the feature-geometry registry so the handles,
 * the hit test and the transform all see the same corners.
 */
function rectangleCorners(
    g
) {
    return enggFeatureGeometry.rectangleCorners(
        g
    );
}

/*
 * Find a handle of a selected object near the cursor.
 * Handles take priority over object bodies.
 */
function handleAtPoint(
    point
) {
    const bounds =
        drawingCanvas.getBoundingClientRect();

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const tolerance =
        MANIPULATION_PICK_PX /
        Math.max(scale, 1e-6);

    let best = null;

    drawingState.objects.forEach(
        object => {
            if (
                !drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
            ) {
                return;
            }

            manipulationHandles(
                object
            ).forEach(
                handle => {
                    const distance =
                        Math.hypot(
                            handle.point.x - point.x,
                            handle.point.y - point.y
                        );

                    if (
                        distance <=
                        tolerance &&
                        (!best ||
                            distance <
                                best.distance)
                    ) {
                        best = {
                            object,
                            handle,
                            distance
                        };
                    }
                }
            );
        }
    );

    return best;
}

/*
 * Begin dragging a handle or an object body. Runs before
 * box-selection so a drag on a handle or a selected
 * object moves geometry instead of starting a box.
 *
 * Handles are draggable whenever they are visible, not
 * only while Select is active, so a shape can be nudged
 * straight after it is created.
 */
/*
 * Whether a construction is genuinely under way, as opposed to
 * a tool merely being armed and waiting for its first click.
 *
 * The phases that wait for MORE input are constructions in
 * progress: they already hold a point, a span or a partial
 * result, and the next click completes them. The phases that
 * wait for a FIRST click are not, because until that click
 * arrives nothing has been created and there is nothing for the
 * click to continue.
 *
 * A Modify session and an armed statics attachment both already
 * capture the pointer, and are checked before this, so they are
 * left out of the list deliberately.
 */
const CONSTRUCTION_ACTIVE_PHASES = [
    "first-point",
    "statics-span",
    "statics-attach",
    "constant-load-build",
    "distributed-load-build",
    "distributed-load-span",
    "truss-construct",
    "polygon-centre",
    "polygon-first",
    "polygon-sides",
    "arc-centre",
    "arc-sweep",
    "arc-first",
    "arc-second",

    /*
     * The analysis axis placement.
     *
     * Listed here because it IS a running construction, and every
     * behaviour that keys off this set is then correct for it without
     * being told about it separately: the pointer belongs to the
     * placement rather than to a direct drag, Enter commits it, Escape
     * cancels it, and a click on an existing feature commits rather
     * than selects.
     */
    "analysis-axis",

    /*
     * A Moment being sized.
     *
     * A running construction like any other: the first click has
     * fixed the application point and the cursor is choosing how large
     * the arrow is drawn, so the pointer belongs to the placement and
     * not to a direct drag on whatever happens to be under it.
     */
    "moment-radius"
];

function isConstructionInProgress() {
    const phase =
        drawingState.interaction?.phase;

    if (
        !phase ||
        phase === "idle"
    ) {
        return false;
    }

    if (phase === "coordinate-system-2d") {
        return false;
    }

    return CONSTRUCTION_ACTIVE_PHASES.includes(
        phase
    );
}

function beginManipulationDrag(
    event
) {
    if (
        event.button !== 0 ||
        event.shiftKey
    ) {
        return false;
    }

    /*
     * A running Modify session owns the pointer, so
     * direct manipulation stays out of its way.
     */
    if (modifySession) {
        return false;
    }

    /*
     * A construction already UNDER WAY owns the pointer: its
     * first point is down and its second is expected, so the
     * click belongs to it.
     *
     * A tool that is merely ARMED is different. Choosing the
     * Circle tool does not begin a circle; the circle begins on
     * the first click. Until then there is nothing in progress,
     * and a press on a selected feature is a request to move
     * that feature, not to start drawing.
     *
     * Direct manipulation therefore has to win here, or picking
     * a creation tool silently breaks every handle the drawing
     * already has: the press is taken as the tool's first point
     * and the feature is never moved.
     */
    if (isConstructionInProgress()) {
        return false;
    }

    const point =
        canvasPointFromEvent(
            event,
            false
        );

    const hit =
        handleAtPoint(
            point
        );

    if (hit) {
        /*
         * originals is keyed by object id so the commit
         * path can restore any drag shape uniformly.
         */
        manipulationDrag = {
            pointerId: event.pointerId,
            object: hit.object,
            kind: hit.handle.kind,

            moved: false,
            start: { ...point },

            /*
             * The WHOLE object is snapshotted, not just its geometry.
             *
             * A drag can move more than a shape: an annotation moves by
             * its placement, a dimension by its offset, and neither of
             * those lives in `geometry`. Snapshotting geometry alone
             * left those changes outside the undo entry, so moving an
             * annotation could not be undone - the one action the
             * student performs most on a label, and the one the
             * specification singles out.
             *
             * Cloning the whole object is the same cost as cloning its
             * geometry and is correct for every feature type, present
             * and future, whatever part of them the drag happens to
             * touch.
             */
            originals: {
                [hit.object.id]:
                    JSON.parse(
                        JSON.stringify(
                            hit.object
                        )
                    )
            }
        };

        drawingCanvas.setPointerCapture(
            event.pointerId
        );

        return true;
    }

    /*
     * Dragging the body of a selected object translates the
     * whole selection.
     *
     * This only claims the press when the object is ALREADY
     * selected. A press on a selected feature is ambiguous: it
     * is equally a click that a drawing tool may want, since the
     * feature the user has just drawn stays selected and its
     * next click is very often at or near it.
     *
     * Claiming it unconditionally meant that choosing a tool
     * and clicking to use it did nothing whenever the thing
     * under the cursor happened to be selected, and a Statics
     * tool asking for a body could never receive its own click.
     *
     * A drag is distinguished from a click by MOVEMENT, and
     * movement is judged once the pointer has actually travelled
     * in updateManipulationDrag. So the drag is armed here, and
     * only becomes a manipulation if the pointer moves; a press
     * that stays put is left for the tool.
     */
    const object =
        objectAtPoint(
            point
        );

    if (
        object &&
        drawingState.selection
            .selectedObjectIds
            .includes(
                object.id
            )
    ) {
        manipulationDrag = {
            pointerId: event.pointerId,
            object,
            kind: "body",
            moved: false,
            start: { ...point },
            originals: Object.fromEntries(
                objectsByIds(
                    drawingState.selection
                        .selectedObjectIds
                ).map(
                    item => [
                        item.id,
                        JSON.parse(
                            JSON.stringify(
                                item.geometry
                            )
                        )
                    ]
                )
            )
        };

        drawingCanvas.setPointerCapture(
            event.pointerId
        );

        return true;
    }

    return false;
}

/*
 * Live-update geometry while a manipulation drag is in
 * progress, resolving the cursor through the existing
 * snap/inference pipeline.
 */
function updateManipulationDrag(
    event
) {
    if (
        !manipulationDrag ||
        manipulationDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const resolution =
        resolvePointerEvent(
            event
        );

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    manipulationDrag.moved =
        true;

    applyManipulation(
        manipulationDrag,
        point
    );

    updateInteractionFeedback(
        resolution
    );

    renderCurrentDrawing();
}

function finishManipulationDrag(
    event
) {
    if (
        !manipulationDrag ||
        manipulationDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const drag =
        manipulationDrag;

    manipulationDrag =
        null;

    if (
        drawingCanvas.hasPointerCapture(
            event.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            event.pointerId
        );
    }

    if (!drag.moved) {
        /*
         * The pointer never travelled, so this was a CLICK on a
         * feature rather than a drag of it.
         *
         * The press was armed as a possible drag, but a drag is
         * defined by movement and there was none. The click is
         * therefore handed back to the tool that was waiting for
         * it, which is what lets a Statics tool ask for the body
         * it loads and receive a click on the very feature the
         * student has just drawn.
         *
         * The suppression flag is what stops a real drag from
         * also placing a point, so it is cleared for a press that
         * turned out not to be a drag.
         */
        selectionClickSuppressed =
            false;

        return;
    }

    /*
     * The geometry changed live during the drag, so the
     * history entry has to record the geometry as it was
     * BEFORE the drag. drag.originals holds exactly that,
     * so the current objects are restored to their
     * originals, that pre-drag state is pushed onto the
     * undo stack, and the dragged result is then put back.
     */
    const dragged =
        JSON.parse(
            JSON.stringify(
                drawingState.objects
            )
        );

    const originalObjects =
        drawingState.objects.map(
            object =>
                drag.originals[object.id]
                    ? {
                        /*
                         * The pre-drag OBJECT, not just its geometry -
                         * an annotation's move lives in its placement,
                         * and an undo entry holding only geometry would
                         * leave the moved label where it was.
                         *
                         * id and style stay live, as when cancelling.
                         */
                        ...JSON.parse(
                            JSON.stringify(
                                drag.originals[
                                    object.id
                                ]
                            )
                        ),
                        id: object.id,
                        style: object.style
                    }
                    : object
        );

    enggDrawingState.commitDrawingChange(
        drawingState,
        originalObjects
    );

    drawingState.objects =
        dragged;

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Apply the drag to the real feature data.
 */
function applyManipulation(
    drag,
    point
) {
    const object =
        drag.object;

    const g =
        object.geometry;

    /*
     * AN ANNOTATION MOVES BY ITS PLACEMENT, and nothing else.
     *
     * The whole point of an annotation is that it can be put anywhere
     * while staying attached to its feature: moving it changes where the
     * words sit and must not touch the feature, the link, or the text.
     * So only `placement` is written.
     *
     * `placementMode` becomes "manual" because the student has now
     * chosen this position themselves, and from here on it is theirs to
     * keep - the annotation will not snap back when the feature is
     * edited later, which is what stops a moved label being dragged
     * somewhere useless every time a value changes.
     *
     * The leader is not touched. It belongs to the annotation and
     * redraws itself from the new position, so moving the box moves the
     * leader with it rather than leaving it pointing at nothing.
     */
    if (object.type === "annotation") {
        if (
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y)
        ) {
            return false;
        }

        object.placement = {
            x: point.x,
            y: point.y
        };

        object.placementMode = "manual";

        return true;
    }

    /*
     * A DIMENSION MOVES BY ITS OFFSET.
     *
     * A dimension states a measurement of something else, and its
     * placement is the offset between the two. Dragging moves that
     * offset; it does not re-measure, and it does not take the offset
     * from the pointer, because the distance between the geometry and
     * the dimension line is the whole of what the student chose when
     * they placed it.
     */
    if (object.type === "dimension") {
        const start =
            drag.start;

        const placement =
            object.placement;

        if (
            !start ||
            !placement ||
            !Number.isFinite(placement.x) ||
            !Number.isFinite(placement.y)
        ) {
            return false;
        }

        object.placement = {
            x: placement.x + (point.x - start.x),
            y: placement.y + (point.y - start.y)
        };

        return true;
    }

    if (drag.kind === "body") {
        const deltaX =
            point.x -
            drag.start.x;

        const deltaY =
            point.y -
            drag.start.y;

        /*
         * A body carries its attached Statics features with
         * it. They are restored to their pre-drag geometry
         * and then translated by the same delta as the body,
         * so a load or a support cannot be left behind at
         * stale world coordinates while the body it acts on
         * moves away.
         */
        const originals =
            drag.originals;

        moveObjectAndChildren(
            object,
            deltaX,
            deltaY,
            originals
        );

        return;
    }

    const original =
        drag.originals;

    if (object.type === "point") {
        const target =
            g.position || g.point || g;

        target.x = point.x;
        target.y = point.y;
        return;
    }

    if (object.type === "line") {
        if (drag.kind === "start") {
            g.start = { x: point.x, y: point.y };
        } else {
            g.end = { x: point.x, y: point.y };
        }

        return;
    }

    if (object.type === "circle") {
        if (drag.kind === "center") {
            g.center = { x: point.x, y: point.y };
        } else {
            g.radius = Math.max(
                Math.hypot(
                    point.x - g.center.x,
                    point.y - g.center.y
                ),
                1e-6
            );
        }

        return;
    }

    if (object.type === "arc") {
        if (drag.kind === "center") {
            g.center = { x: point.x, y: point.y };
            return;
        }

        /*
         * Dragging an endpoint keeps the centre and the
         * other endpoint, and re-derives radius and the
         * swept angle so the arc stays coherent.
         */
        const fixedAngle =
            drag.kind === "startAngle"
                ? g.endAngle
                : g.startAngle;

        const angle =
            Math.atan2(
                point.y - g.center.y,
                point.x - g.center.x
            );

        g.radius = Math.max(
            Math.hypot(
                point.x - g.center.x,
                point.y - g.center.y
            ),
            1e-6
        );

        if (drag.kind === "startAngle") {
            g.startAngle = angle;
        } else {
            g.endAngle = angle;
        }

        const sweep =
            g.endAngle -
            g.startAngle;

        if (g.sweep !== undefined) {
            g.sweep =
                sweep === 0
                    ? g.sweep
                    : Math.sign(sweep) *
                        Math.abs(g.sweep);
        }

        void fixedAngle;
        return;
    }

    /*
     * A truss joint.
     *
     * Moving a joint moves every member that meets it, so the
     * structure stays connected instead of one member pulling
     * away from the rest.
     */
    const jointMatch =
        /^truss-joint(\d)$/.exec(drag.kind);

    if (jointMatch) {
        moveTrussJoint(
            object,
            Number(jointMatch[1]),
            point
        );

        return;
    }

    /*
     * RIGID BODY HANDLES
     *
     * Each handle writes the same defining value the Features
     * panel writes for the body's current shape, so dragging
     * and typing are the same action and cannot disagree.
     */
    if (drag.kind.startsWith("rigid-")) {
        applyRigidBodyHandle(
            object,
            drag,
            point
        );

        return;
    }

    if (isRectangleLike(object)) {
        /*
         * Resize by moving one corner while the opposite
         * corner stays put. A fixed width or height is
         * respected by keeping that dimension unchanged.
         */
        const index =
            Number(
                drag.kind.replace("corner", "")
            );

        const corners =
            rectangleCorners(
                original
            );

        const opposite =
            corners[(index + 2) % 4];

        const minX =
            Math.min(opposite.x, point.x);

        const maxX =
            Math.max(opposite.x, point.x);

        const minY =
            Math.min(opposite.y, point.y);

        const maxY =
            Math.max(opposite.y, point.y);

        g.width = maxX - minX;
        g.height = maxY - minY;
        g.position = {
            x: minX,
            y: maxY
        };
        g.rotation = 0;
        return;
    }

    /*
     * Statics features are edited through their own
     * engineering data, so a handle moves the quantity the
     * handle stands for rather than a generic vertex. Each
     * case writes to the authoritative field, which is the
     * same value the Features panel edits, so the two can
     * never disagree.
     */
    if (isStaticsFeature(object)) {
        applyStaticsManipulation(
            object,
            drag,
            point
        );

        return;
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * Dragging an arm end changes only that side's
         * length. The origin and the other three arms are
         * left exactly as they were.
         */
        if (drag.kind === "origin") {
            g.origin = { x: point.x, y: point.y };
            return;
        }

        const lengths = {
            xPositive: "xPositiveLength",
            xNegative: "xNegativeLength",
            yPositive: "yPositiveLength",
            yNegative: "yNegativeLength"
        };

        const key =
            lengths[drag.kind];

        if (!key) {
            return;
        }

        const measured =
            drag.kind.startsWith("x")
                ? Math.abs(point.x - g.origin.x)
                : Math.abs(point.y - g.origin.y);

        g[key] = Math.max(measured, 1e-6);

        return;
    }

    if (
        object.type === "triangle" ||
        object.type === "polygon" ||
        Array.isArray(g.points)
    ) {
        const index =
            Number(
                drag.kind.replace("vertex", "")
            );

        if (object.type === "polygon") {
            /*
             * A polygon is defined by centre, radius and
             * rotation, so dragging a vertex re-derives
             * those rather than storing loose points.
             */
            g.radius = Math.max(
                Math.hypot(
                    point.x - g.center.x,
                    point.y - g.center.y
                ),
                1e-6
            );

            const sides =
                Math.max(
                    3,
                    Math.round(
                        Number(g.sides) || 3
                    )
                );

            g.rotation =
                Math.atan2(
                    point.y - g.center.y,
                    point.x - g.center.x
                ) -
                (index * 2 * Math.PI) / sides;

            return;
        }

        if (Array.isArray(g.points) && g.points[index]) {
            g.points[index].x = point.x;
            g.points[index].y = point.y;
        }
    }
}

/*
 * Whether a feature is one of the Statics engineering
 * features, as opposed to shared or construction geometry.
 *
 * The Statics features are edited through their own
 * engineering data, so this one predicate routes all of them
 * through the same handling instead of each one growing a
 * special case.
 */
function isStaticsFeature(
    object
) {
    return Boolean(
        object &&
            object.engineering
                ?.discipline ===
                "statics" &&
                STATICS_FEATURE_LABELS[
                    object.type
                ]
    );
}

/*
 * Apply one direct-manipulation step to a Statics feature.
 *
 * Each branch writes the real engineering field: a force's
 * application point, a load's intensity, a support's facing
 * direction. The rendered arrows and symbols are derived
 * from these, so dragging a handle updates the drawing
 * exactly as typing in the panel would.
 */
function applyStaticsManipulation(
    object,
    drag,
    point
) {
    const g = object.geometry;

    const kind = drag.kind;

    /*
     * The two ends of a span-shaped feature: a member, a
     * load's loaded region, a connection, or a force's
     * application point and vector end.
     */
    if (
        kind === "start" ||
        kind === "end"
    ) {
        g[kind] = {
            x: point.x,
            y: point.y
        };

        /*
         * Moving an attachment is how a feature is aimed at
         * a different body. The existing snap already knows
         * what is under the cursor, so the parent is
         * re-read and the feature is reparented rather than
         * duplicated.
         */
        if (kind === "start") {
            updateAttachment(
                object,
                point
            );
        }

        return;
    }

    /*
     * A load's magnitude handle. Its distance from the span
     * is the intensity, so dragging it out makes the load
     * heavier and dragging it in makes it lighter.
     */
    if (kind.startsWith("load-")) {
        const key =
            kind.replace("load-", "");

        if (!g.start || !g.end) {
            return;
        }

        /*
         * A Distributed Load's magnitude point. Its distance from
         * the body is measured ALONG the load's own direction,
         * exactly as it is during construction, so dragging a
         * point out along the load makes that part of the profile
         * heavier and the rest of the field follows the shape.
         *
         * The other load handles are the varying load's end
         * intensities, which are still plain fields.
         */
        if (key.startsWith("point")) {
            const index =
                Number(
                    key.replace("point", "")
                );

            const points =
                enggLoadProfile.profilePoints(g);

            if (!points[index]) {
                return;
            }

            const along =
                enggLoadProfile.pointAlong(
                    g,
                    points[index].t
                );

            const direction =
                enggLoadProfile.unitVector(
                    enggLoadProfile.loadDirection(g)
                );

            const dx =
                point.x - along.x;

            const dy =
                point.y - along.y;

            points[index].magnitude =
                Math.max(
                    0,
                    dx * direction.x + dy * direction.y
                );

            enggLoadProfile.setProfilePoints(
                g,
                points
            );

            return;
        }

        const from =
            key === "startIntensity"
                ? g.start
                : g.end;

        const scale =
            enggDrawingState.BASE_PIXELS_PER_UNIT *
            drawingState.camera.zoom;

        const world =
            Math.hypot(
                point.x - from.x,
                point.y - from.y
            );

        g[key] = Math.max(
            (world * Math.max(scale, 1e-6)) / 6,
            0
        );

        return;
    }

    /*
     * A support's orientation handle. The support turns to
     * face the direction the handle is dragged in while its
     * attachment point stays put.
     */
    if (kind === "orientation") {
        if (!g.position) {
            return;
        }

        g.orientation =
            (Math.atan2(
                point.x - g.position.x,
                point.y - g.position.y
            ) * 180) /
            Math.PI;

        return;
    }

    /*
     * A couple's separation handle sets how far its two
     * arrows sit from its centre.
     */
    if (kind === "separation") {
        if (!g.position) {
            return;
        }

        g.separation = Math.max(
            Math.abs(point.y - g.position.y) * 2,
            1e-6
        );

        return;
    }

    if (kind === "position" && g.position) {
        g.position = {
            x: point.x,
            y: point.y
        };

        updateAttachment(
            object,
            point
        );
    }
}

/*
 * Re-read the parent of an attached feature from a point.
 *
 * The relationship is stored as the actual feature id of the
 * body the point resolved onto, so dropping a force onto a
 * different Beam moves that one feature under the new parent.
 * It is never re-created, and it is never inferred later from
 * proximity.
 */
function updateAttachment(
    object,
    point
) {
    const target =
        staticsBodyAtPoint(point);

    const parentId =
        target ? target.id : null;

    if (object.parentId === parentId) {
        return;
    }

    object.parentId =
        parentId ??
        undefined;
}

/*
 * The body under a point, or null.
 *
 * Used when dragging an attachment so the feature follows the
 * body the cursor is actually over.
 */
function staticsBodyAtPoint(
    point
) {
    const hit = objectAtPoint(point);

    return isStaticsBody(hit) ? hit : null;
}

/*
 * Take the body a Statics feature will act on.
 *
 * A feature like a load or a support only means something
 * relative to a body, so the first click names that body and
 * nothing is created yet. The valid placement locations then
 * appear along it, and the feature is built on a later click.
 */
function beginStaticsAttachment(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    /*
     * A MOMENT IS NOT ATTACHED TO A BODY FIRST.
     *
     * A support must be propped under something, so it needs a body
     * before it can go anywhere. A moment does not: a couple is a free
     * moment, and an applied moment is a moment at a point, and both
     * are perfectly meaningful on blank sheet. Requiring a body would
     * mean a student could not put a moment anywhere until they had
     * drawn something to put it on, which is the opposite of how
     * moments are used.
     *
     * So the click goes straight to the application point, and a body
     * is picked up as the parent if there happens to be one under it -
     * which gives the association for free without making it a
     * precondition.
     */
    if (
        drawingState.activeTool ===
            "applied-moment"
    ) {
        beginMomentPlacement(
            point,
            staticsBodyAtPoint(point)?.id
        );

        return;
    }

    const body =
        staticsAttachmentId(
            resolution.snapCandidate
        )
            ? drawingState.objects.find(
                  object =>
                      object.id ===
                      staticsAttachmentId(
                          resolution.snapCandidate
                      )
              )
            : staticsBodyAtPoint(point);

    if (!body) {
        setToolMessage(
            "Select a body to attach to"
        );

        return;
    }

    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,

            phase:
                "statics-attach",

            staticsTarget: body,

            attachmentPoints: [],

            points: []
        }
    );

    setToolMessage(
        staticsBodyMessage(
            drawingState.activeTool,
            1
        )
    );

    renderCurrentDrawing();
}

/*
 * Advance a body-attached feature by one placed point.
 *
 * The points are collected rather than committed, so the
 * whole feature is created once its data is complete. The
 * body is resolved from the snap, so the relationship is
 * stored as the body's actual feature id.
 */
function continueStaticsAttachment(
    resolution
) {
    const interaction =
        drawingState.interaction;

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const placed = [
        ...(interaction.attachmentPoints ||
            []),
        { ...point }
    ];

    const required =
        staticsToolPointCount(
            drawingState.activeTool
        );

    if (placed.length < required) {
        /*
         * The first end is in. The preview now shows the
         * whole region being loaded, so the second end can
         * be judged against it.
         */
        enggDrawingState.setInteraction(
            drawingState,
            {
                ...resolution,

                phase:
                    "statics-attach",

                staticsTarget:
                    interaction.staticsTarget,

                attachmentPoints:
                    placed,

                points: placed
            }
        );

        setToolMessage(
            staticsBodyMessage(
                drawingState.activeTool,
                2
            )
        );

        renderCurrentDrawing();
        return;
    }

    commitStaticsAttachment(
        placed,
        resolution
    );
}

/*
 * Create the feature once every required point is placed.
 *
 * One feature is created, holding the loaded region, its
 * intensities and the body's id. The repeated arrows are
 * drawn from that data by the renderer and are never separate
 * features.
 */
function commitStaticsAttachment(
    points,
    resolution
) {
    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const toolId =
        drawingState.activeTool;

    const type =
        STATICS_CHILD_TOOLS[toolId]?.type;

    const interaction =
        drawingState.interaction;

    const body =
        interaction.staticsTarget;

    const start = points[0];
    const end =
        points[1] ?? points[0];

    let object = null;

    if (type === "load") {
        /*
         * A uniform load carries one intensity across the whole
         * region it acts on.
         */
        object =
            enggDrawingState.geometryFactories.load(
                start,
                end,
                10,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (type === "varying-load") {
        /*
         * A varying load carries an intensity at each end, so
         * it is built through its own factory rather than by
         * reusing the uniform one.
         */
        object =
            enggDrawingState.geometryFactories[
                "varying-load"
            ](
                start,
                end,
                0,
                10,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (type === "moment") {
        object =
            enggDrawingState.geometryFactories.moment(
                start,
                50,
                false,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (
        type === "pin-support" ||
        type === "roller-support" ||
        type === "fixed-support" ||
        type === "smooth-support"
    ) {
        object =
            enggDrawingState.geometryFactories[type](
                start,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (isConnectionType(type)) {
        object =
            enggDrawingState.geometryFactories[type](
                start,
                end,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (type === "couple") {
        object =
            enggDrawingState.geometryFactories.couple(
                start,
                50,
                40,
                false,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    }

    if (!object) {
        setToolMessage(
            "That tool could not be created"
        );

        return;
    }

    /*
     * The relationship is the body's real feature id, so the
     * Feature Tree nests the result under the body it acts on
     * and a later move of that body carries it along.
     */
    object.parentId =
        body?.id ??
        undefined;

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    /*
     * The feature is finished, so the operation is dropped
     * and the tool asks for its body again. Staying armed
     * makes placing a second load on the same or another
     * body one click shorter, without the next one silently
     * attaching to the body that was just used.
     */
    setToolMessage(
        isBodyAttachedTool(toolId)
            ? staticsBodyMessage(
                  toolId,
                  0
              )
            : staticsInstruction(toolId)
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The style and engineering record for an attached feature.
 *
 * It is the same record every other Statics feature gets, so
 * an attached feature is identified exactly like a free one.
 */
function staticsAttachedStyle(
    toolId,
    body
) {
        /*
         * A Point Force starts heavier than the general line weight.
         * The choice is made in one place so the creation path, the
         * factory default and every later read of the style all
         * agree, and so the value can be changed in one place.
         */
        const lineWidth =
            staticsForceLineWidth(toolId);

        return {
            style: {
                ...drawingState.styleDefaults,
                lineWidth
            },

            engineering: {
                plane: "XY",
                discipline: "statics",
                staticsType: toolId
            },

            parentId: body?.id ?? undefined
        };
    }

/*
 * Abandon an unfinished Statics operation.
 *
 * The preview and the temporary target are dropped and no
 * feature is created, so a cancelled load or support leaves the
 * body exactly as it was. This is what Esc and choosing
 * another tool both go through.
 */
function cancelStaticsInteraction() {
    const interaction =
        drawingState.interaction;

    const wasAttaching =
        interaction.phase ===
            "statics-attach" ||
        Boolean(interaction.staticsTarget);

    enggDrawingState.clearInteraction(
        drawingState
    );

    if (wasAttaching) {
        enggDrawingState.setActiveTool(
            drawingState,
            "select"
        );

        setToolMessage(
            "Select geometry"
        );

        renderEngineeringTools(
            activeCategory()
        );
    }

    return wasAttaching;
}

/*
 * Move one truss joint and every member that meets it.
 *
 * The members are stored as endpoints, so a joint is found by
 * the coordinates that members share. Every occurrence moves
 * together, which is what keeps the structure connected.
 */
function moveTrussJoint(
    object,
    index,
    point
) {
    const g = object.geometry;

    if (!Array.isArray(g.members)) {
        return;
    }

    const joints = trussJointHandles(
        g.members
    );

    const joint = joints[index];

    if (!joint) {
        return;
    }

    const dx = point.x - joint.point.x;
    const dy = point.y - joint.point.y;

    g.members.forEach(member => {
        [
            member.start,
            member.end
        ].forEach(endpoint => {
            if (
                Math.hypot(
                    endpoint.x - joint.point.x,
                    endpoint.y - joint.point.y
                ) < 1e-6
            ) {
                endpoint.x += dx;
                endpoint.y += dy;
            }
        });
    });

    /*
     * The span end points track the outer joints, so a
     * selection box still covers the whole structure.
     */
    const first = g.members[0]?.start;
    const last =
        g.members[g.members.length - 1]
            ?.end;

    if (first && last) {
        g.start = { ...first };
        g.end = { ...last };
    }
}

/*
 * Apply one drag to a rigid body handle.
 *
 * The handle stands for a value in the body's current shape,
 * so it writes that value directly. A corner resizes against
 * the opposite corner, a vertex moves that vertex, and a radius
 * handle measures from the centre, which is how each of those
 * shapes is actually defined.
 */
function applyRigidBodyHandle(
    object,
    drag,
    point
) {
    const g = object.geometry;

    const kind = drag.kind;

    if (kind === "rigid-centre") {
        moveRigidBodyTo(object, "x", point.x);
        moveRigidBodyTo(object, "y", point.y);
        return;
    }

    if (kind === "rigid-radius") {
        const center =
            g.center || { x: 0, y: 0 };

        setRigidBodyRadius(
            object,
            Math.hypot(
                point.x - center.x,
                point.y - center.y
            )
        );

        return;
    }

    const vertexMatch =
        /^rigid-vertex(\d)$/.exec(kind);

    if (vertexMatch) {
        const index = Number(vertexMatch[1]);

        if (!g.points?.[index]) {
            return;
        }

        g.points[index].x = point.x;
        g.points[index].y = point.y;
        return;
    }

    const cornerMatch =
        /^rigid-corner(\d)$/.exec(kind);

    if (cornerMatch) {
        const index = Number(cornerMatch[1]);

        const corners = enggFeatureGeometry
            .rectangleCorners(g);

        const opposite =
            corners[(index + 2) % 4];

        if (!opposite) {
            return;
        }

        /*
         * The corner follows the cursor while the opposite
         * corner stays put, so a rectangle is resized rather
         * than moved.
         */
        const minX = Math.min(opposite.x, point.x);
        const maxX = Math.max(opposite.x, point.x);
        const minY = Math.min(opposite.y, point.y);
        const maxY = Math.max(opposite.y, point.y);

        g.width = Math.max(maxX - minX, 1e-6);
        g.height = Math.max(maxY - minY, 1e-6);
        g.position = { x: minX, y: maxY };
    }
}

function beginSelectionDrag(
    event
) {
    if (
        drawingState.activeTool !==
            "select" ||
        event.button !== 0
    ) {
        return;
    }

    const point =
        canvasPointFromEvent(
            event
        );

    if (
        objectAtPoint(
            point
        )
    ) {
        return;
    }

    selectionClickSuppressed =
        false;

    selectionDrag = {
        pointerId:
            event.pointerId,

        start:
            point,

        current:
            point,

        moved:
            false,

        box: {
            start:
                point,

            end:
                point,

            minX:
                point.x,

            maxX:
                point.x,

            minY:
                point.y,

            maxY:
                point.y
        }
    };

    drawingCanvas.setPointerCapture(
        event.pointerId
    );

    syncSelectionInteraction();
}

function updateSelectionDrag(
    event
) {
    if (
        !selectionDrag ||
        selectionDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const point =
        canvasPointFromEvent(
            event
        );

    const start =
        selectionDrag.start;

    const moved =
        distance(
            start,
            point
        ) > 1;

    selectionDrag.current =
        point;

    selectionDrag.moved =
        moved;

    selectionDrag.box = {
        start,

        end:
            point,

        minX:
            Math.min(
                start.x,
                point.x
            ),

        maxX:
            Math.max(
                start.x,
                point.x
            ),

        minY:
            Math.min(
                start.y,
                point.y
            ),

        maxY:
            Math.max(
                start.y,
                point.y
            )
    };

    selectionClickSuppressed =
        selectionClickSuppressed ||
        moved;

    syncSelectionInteraction();

    if (moved) {
        setToolMessage(
            "Select components"
        );

        drawingState.selection
            .boxSelectionIds =
            drawingState.objects
                .filter(
                    object =>
                        objectIntersectsSelection(
                            object,
                            selectionDrag.box
                        )
                )
                .map(
                    object =>
                        object.id
                );

        renderProperties();
        renderCurrentDrawing();
    }
}

function finishSelectionDrag(
    event
) {
    if (
        !selectionDrag ||
        selectionDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const currentSelection =
        selectionDrag;

    if (
        currentSelection.moved
    ) {
        const ids =
            drawingState.objects
                .filter(
                    object =>
                        objectIntersectsSelection(
                            object,
                            currentSelection.box
                        )
                )
                .map(
                    object =>
                        object.id
                );

        enggDrawingState.selectObjects(
            drawingState,
            ids
        );
    }

    drawingState.selection
        .boxSelectionIds = [];

    if (
        drawingCanvas.hasPointerCapture(
            event.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            event.pointerId
        );
    }

    selectionDrag =
        null;

    syncSelectionInteraction();

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

function cancelInteraction() {
    if (
        selectionDrag
    ) {
        if (
            drawingCanvas.hasPointerCapture(
                selectionDrag.pointerId
            )
        ) {
            drawingCanvas.releasePointerCapture(
                selectionDrag.pointerId
            );
        }

        selectionDrag =
            null;
    }

    /*
     * Any transient creation popup goes with the
     * cancelled operation.
     */
    closePolygonSidesPrompt();
    closeCoordinateSystemMenu();

    /*
     * So does a held guideline. It belongs to the construction
     * that raised it, and its timer must not outlive it - a
     * pending redraw would otherwise fire over whatever the
     * student has started next.
     */
    if (guidelineHoldTimer) {
        clearTimeout(guidelineHoldTimer);
        guidelineHoldTimer = null;
    }

    drawingState.interaction.guideline = null;

    /*
     * So does the scale calibration dialog.
     *
     * Closing it here rather than only from its own fields means it
     * cannot be stranded: a modal that survived a tool switch or an
     * Escape aimed at the canvas would look like the application had
     * stopped responding. Nothing is created and no scale is set,
     * which is exactly what abandoning the question should mean.
     */
    window.enggScaleCalibration?.close();
    window.enggDimensionEditor?.close();

    /*
     * A running Modify session is part of the
     * unfinished operation, so it is abandoned too.
     */
    cancelModifySession();

    /*
     * An in-flight manipulation drag has already moved
     * real geometry, so it must be rolled back rather
     * than merely abandoned.
     */
    cancelManipulationDrag();

    /*
     * The active tool highlight always goes with the
     * cancelled operation.
     */
    clearGlobalToolHighlight();

    enggDrawingState.clearInteraction(
        drawingState
    );

    drawingState.selection
        .boxSelectionIds = [];

    drawingState.selection
        .hoveredObjectId = null;

    drawingState.selection
        .selectedObjectIds = [];

    /*
     * Cancelling always returns to Select, so the user
     * is never left inside a half-finished tool.
     */
    enggDrawingState.setActiveTool(
        drawingState,
        "select"
    );

    setToolMessage(
        "Select geometry"
    );

    renderEngineeringTools(
        activeCategory()
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Complete whatever construction is running, if it can be
 * completed.
 *
 * Returns true when something was actually finished, so the
 * caller knows whether Enter did anything.
 *
 * The question each construction has to answer is "is this
 * complete enough to commit?", not "do I exist?". A truss with
 * a single member is not a truss, a polyline with one point is
 * not a polyline, and a load with no distribution point on it
 * measures nothing. Committing any of those would put something
 * on the drawing that the student did not draw, so those are
 * left running and Enter is a no-op for them.
 */
function finishActiveConstruction() {
    const interaction =
        drawingState.interaction;

    if (
        !interaction ||
        !isConstructionInProgress()
    ) {
        return false;
    }

    const phase = interaction.phase;

    /*
     * THE ANALYSIS AXIS, PLACED.
     *
     * Enter means "done" for anything being built, and an axis waiting
     * to be placed is a thing being built. So it is finished here, by
     * the same rule that finishes a truss or a polyline, rather than
     * by a special case at the keyboard handler - which is what makes
     * Escape, the status line and the preview agree that the axis is
     * a live construction.
     *
     * It commits at the height the student chose, which is the same
     * position the preview was showing, because both are read from
     * `placementY`.
     */
    if (phase === "analysis-axis") {
        return commitAnalysisAxis();
    }

    /*
     * A MOMENT BEING SIZED: Enter commits it.
     *
     * The same rule as everything else being built - Enter means
     * "this is finished" - so a student who has the radius they want
     * does not have to find somewhere to click.
     */
    if (phase === "moment-radius") {
        return commitMomentPlacement();
    }

    if (phase === "truss-construct") {
        const members =
            interaction.trussMembers || [];

        /*
         * One member is a line, not a truss. Requiring two
         * matches what a click would do, so Enter and a
         * finishing click agree about when the structure is
         * real.
         */
        if (members.length < 2) {
            setToolMessage(
                "A truss needs at least two members"
            );

            return false;
        }

        finishTrussConstruction();
        return true;
    }

    if (isLoadBuildPhase(interaction)) {
        const points =
            interaction
                .distributedLoadPoints ||
            [];

        if (!points.length) {
            return false;
        }

        if (
            phase ===
            "constant-load-build"
        ) {
            finishConstantLoadConstruction();
        } else {
            finishDistributedLoadConstruction();
        }

        return true;
    }

    /*
     * A polyline is identified by its TOOL rather than by a
     * phase of its own: it has no stage after the first point,
     * it simply accumulates points until the student says
     * they have had enough. finishPolyline makes that same
     * judgement, so this only decides whether to ask.
     */
    if (
        drawingState.activeTool ===
            "polyline"
    ) {
        const points =
            interaction.points || [];

        if (points.length < 2) {
            return false;
        }

        finishPolyline();
        return true;
    }

    return false;
}

/*
 * Clear the selection when something is selected and nothing
 * is being built.
 *
 * This is the second half of "Enter means done". A feature
 * stays selected after it is created, so the drawing very often
 * opens a moment with something highlighted that the student
 * has already finished with. Enter then says so.
 *
 * It deliberately does NOT check whether the feature was
 * "just" created. Anything selected counts, because the
 * gesture is the same either way and the outcome is the same:
 * the feature is left exactly as it is and the selection goes
 * away. Restricting it to a short window would make the key
 * work once and then do nothing, which reads as a broken
 * shortcut rather than a deliberate one.
 */
function deselectIfJustCreated() {
    if (
        isConstructionInProgress()
    ) {
        return false;
    }

    /*
     * A dialog owns the keyboard while it is open. Enter
     * belongs to the dialog's own confirm and cancel.
     */
    if (
        window.enggScaleCalibration?.isOpen?.() ||
        window.enggDimensionEditor?.isOpen?.()
    ) {
        return false;
    }

    if (
        !drawingState.selection
            .selectedObjectIds.length
    ) {
        return false;
    }

    enggDrawingState.clearSelection(
        drawingState
    );

    featureTreePickedId = null;

    renderProperties();
    renderCurrentDrawing();

    return true;
}

function finishPolyline() {
    const points =
        drawingState.interaction.points;

    if (
        drawingState.activeTool !==
            "polyline" ||
        points.length < 2
    ) {
        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    enggDrawingState.addObject(
        drawingState,

        enggDrawingState.geometryFactories.polyline(
            [
                ...points
            ],

            {
                style: {
                    ...drawingState.styleDefaults
                },

                engineering:
                    currentEngineeringMetadata()
            }
        )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Global toolbar tools.
 *
 * Modify tools act on the selected geometry using the
 * existing selection and history systems. View tools
 * only move the camera, so they never touch geometry.
 */
/*
 * Active Modify session.
 *
 * A session holds the workflow the user is part way
 * through, so a Modify tool can span several clicks
 * (base point, pivot, mirror axis) and can be
 * cancelled cleanly at any stage.
 */
let modifySession = null;

function beginModifySession(
    kind
) {
    cancelModifySession();

    modifySession = {
        kind,

        /*
         * Selected ids are captured up front so the
         * geometry being changed cannot shift under the
         * operation if the selection changes.
         */
        ids: [
            ...drawingState.selection
                .selectedObjectIds
        ],

        /*
         * Mirror skips its object-selection stage when the
         * user already selected the features before
         * activating the tool, so it goes straight to
         * "Select mirror line or point" as specified.
         */
        stage:
            kind === "mirror" &&
            drawingState.selection
                .selectedObjectIds.length
                ? "axis"
                : "base",

        basePoint:
            null,

        pivot:
            null,

        axisStart:
            null,

        axisEnd:
            null,

        boundaryId:
            null,

        preview:
            null
    };
}

function cancelModifySession() {
    /*
     * The toolbar highlight is cleared even when no
     * session is running, so a cancelled tool never
     * looks active.
     */
    clearGlobalToolHighlight();

    if (!modifySession) {
        return;
    }

    modifySession =
        null;

    drawingState.interaction.preview =
        null;

    drawingState.interaction.previewObjects =
        [];

    renderCurrentDrawing();
}

/*
 * Modify tools start an interactive session rather than
 * applying a fixed offset. Geometry only changes when
 * the user commits.
 */
function activateGlobalTool(
    toolId,
    button
) {
    if (toolId === "pan") {
        activateTool("pan");
        setToolMessage(
            "Drag to pan the view"
        );
        return;
    }

    if (toolId === "zoom") {
        /*
         * Zoom in one step around the canvas centre,
         * matching the toolbar zoom buttons.
         */
        const bounds =
            drawingCanvas.getBoundingClientRect();

        zoomAtCanvasPoint(
            drawingState.camera.zoom * 1.2,
            {
                clientX:
                    bounds.left +
                    bounds.width / 2,

                clientY:
                    bounds.top +
                    bounds.height / 2
            }
        );

        setToolMessage(
            "Zoom"
        );
        return;
    }

    if (toolId === "fit") {
        fitDrawingToView();
        return;
    }

    /*
     * Mirror begins by taking what to mirror from the CURRENT
     * selection, so the button behaves like the other Modify
     * tools rather than being the one that has to make its own
     * selection first.
     *
     * If something is already selected, the session goes
     * straight to the axis stage. If nothing is, it waits with
     * an instruction that says what to do, and the first click
     * picks the feature. Either way the axis is never demanded
     * from a click on empty space.
     */
    if (toolId === "mirror") {
        beginModifySession("mirror");

        const selected =
            drawingState.selection
                .selectedObjectIds;

        if (selected.length) {
            modifySession.ids =
                [...selected];

            modifySession.stage =
                "axis";
        }

        setToolMessage(
            modifyInstruction(
                modifySession
            )
        );

        renderProperties();
        renderCurrentDrawing();
        return;
    }

    if (
        !drawingState.selection
            .selectedObjectIds.length
    ) {
        setToolMessage(
            "Select geometry first"
        );

        return;
    }

    if (toolId === "move") {
        beginModifySession("move");

        setToolMessage(
            "Specify base point"
        );

        return;
    }

    if (toolId === "rotate") {
        beginModifySession("rotate");

        setToolMessage(
            "Specify rotation pivot"
        );

        return;
    }

    if (toolId === "trim") {
        beginModifySession("trim");

        setToolMessage(
            "Select the boundary to trim against"
        );

        return;
    }

    if (toolId === "extend") {
        beginModifySession("extend");

        setToolMessage(
            "Select the boundary to extend to"
        );
    }
}

/*
 * Build ghost copies of the objects being modified, so
 * the user sees the result before committing. The
 * originals are left untouched; these are throwaway
 * previews rendered with preview styling.
 */
function buildModifyPreview(
    transform
) {
    if (!modifySession) {
        return;
    }

    const ghosts =
        objectsByIds(
            modifySession.ids
        ).map(
            object => {
                const ghost =
                    JSON.parse(
                        JSON.stringify(
                            object
                        )
                    );

                ghost.id =
                    `preview-${object.id}`;

                transform(ghost);

                return ghost;
            }
        );

    drawingState.interaction.previewObjects =
        ghosts;
}

function clearModifyPreview() {
    drawingState.interaction.previewObjects =
        [];
}

/*
 * Live preview while a Modify session is in its final
 * stage, driven from the resolved cursor position.
 */
function updateModifyPreview(
    resolution
) {
    if (!modifySession) {
        return;
    }

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        clearModifyPreview();
        return;
    }

    if (
        modifySession.kind === "move" &&
        modifySession.stage === "target" &&
        modifySession.basePoint
    ) {
        const deltaX =
            point.x - modifySession.basePoint.x;

        const deltaY =
            point.y - modifySession.basePoint.y;

        buildModifyPreview(
            ghost =>
                translateObject(
                    ghost,
                    deltaX,
                    deltaY
                )
        );

        return;
    }

    if (
        modifySession.kind === "rotate" &&
        modifySession.stage === "target" &&
        modifySession.pivot
    ) {
        const radians =
            Math.atan2(
                point.y - modifySession.pivot.y,
                point.x - modifySession.pivot.x
            ) -
            (modifySession.rotateStart || 0);

        buildModifyPreview(
            ghost =>
                rotateObjectAbout(
                    ghost,
                    modifySession.pivot,
                    radians
                )
        );

        return;
    }

    if (
        modifySession.kind === "mirror" &&
        modifySession.stage === "axis-end" &&
        modifySession.axisStart
    ) {
        /*
         * Preview against the provisional axis while the
         * user is still choosing its second point.
         */
        buildModifyPreview(
            ghost =>
                mirrorObjectAcrossLine(
                    ghost,
                    modifySession.axisStart,
                    point
                )
        );
    }
}

/*
 * Handle a canvas click while a Modify session is
 * running. Each tool advances through its own stages
 * and commits only on the final click.
 */
function handleModifyClick(
    resolution,
    rawPoint,
    shiftHeld = false
) {
    if (!modifySession) {
        return false;
    }

    const point =
        resolution.effectiveConstructionPoint ||
        rawPoint;

    if (!point) {
        return true;
    }

    const session =
        modifySession;

    /*
     * Mirror is a selection operation first. The features to
     * mirror are the ones already selected, which is what the
     * Select tool has been maintaining all along, so the session
     * adopts that selection rather than asking the user to
     * re-pick them.
     *
     * The object-picking stage is gone: it existed only to
     * demand a click on empty space as a way of saying "I'm
     * done picking", which is a step with no meaning of its own.
     * If nothing is selected the session says so and waits,
     * which is the only question that actually has to be asked.
     */
    if (
        session.kind === "mirror" &&
        session.stage === "base"
    ) {
        const object =
            objectAtPoint(
                rawPoint
            );

        if (!object) {
            setToolMessage(
                "Select the features to mirror first"
            );

            return true;
        }

        /*
         * A click with nothing picked yet takes the single
         * feature under the cursor, so the common case is one
         * click rather than select-then-Mirror. Once something
         * is already held, Shift toggles, so several can be
         * gathered the way they are with the Select tool.
         */
        if (shiftHeld || !session.ids.length) {
            enggDrawingState.selectObjects(
                drawingState,
                [
                    object.id
                ]
            );
        }

        session.ids = [
            ...drawingState.selection
                .selectedObjectIds
        ];

        session.stage = "axis";

        setToolMessage(
            modifyInstruction(session)
        );

        renderProperties();
        renderCurrentDrawing();

        return true;
    }

    if (
        session.kind === "trim" ||
        session.kind === "extend"
    ) {
        return handleTrimExtendClick(
            session,
            rawPoint,
            point
        );
    }

    if (session.kind === "move") {
        if (session.stage === "base") {
            session.basePoint = { ...point };
            session.stage = "target";

            setToolMessage(
                "Specify destination"
            );

            return true;
        }

        if (session.basePoint) {
            commitMove(
                point.x - session.basePoint.x,
                point.y - session.basePoint.y
            );
        }

        return true;
    }

    if (session.kind === "rotate") {
        if (session.stage === "base") {
            session.pivot = { ...point };
            session.stage = "target";

            /*
             * The rotation angle is measured from the
             * pivot's own +X direction, so the second
             * click's bearing from the pivot is the
             * angle to rotate by.
             */
            session.rotateStart = 0;

            setToolMessage(
                "Specify rotation angle"
            );

            return true;
        }

        if (session.pivot) {
            commitRotate(
                session.pivot,
                point
            );
        }

        return true;
    }

    if (session.kind === "mirror") {
        return handleMirrorClick(
            session,
            rawPoint,
            point
        );
    }

    return true;
}

/*
 * Move: translate the captured selection by the world
 * delta between the base point and the commit point.
 */
function commitMove(
    deltaX,
    deltaY
) {
    if (
        !modifySession ||
        (!deltaX && !deltaY)
    ) {
        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    objectsByIds(
        modifySession.ids
    ).forEach(
        object =>
            translateObject(
                object,
                deltaX,
                deltaY
            )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Moved selection"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Rotate: rotate the captured selection about the chosen
 * pivot by the angle from the pivot to the commit
 * point, measured from the pivot to the base point.
 */
function commitRotate(
    pivot,
    target
) {
    const startAngle =
        modifySession &&
        modifySession.rotateStart !== undefined
            ? modifySession.rotateStart
            : Math.atan2(
                target.y - pivot.y,
                target.x - pivot.x
            );

    const endAngle =
        Math.atan2(
            target.y - pivot.y,
            target.x - pivot.x
        );

    const radians =
        endAngle -
        startAngle;

    if (
        !Number.isFinite(radians) ||
        Math.abs(radians) < 1e-9
    ) {
        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    objectsByIds(
        modifySession.ids
    ).forEach(
        object =>
            rotateObjectAbout(
                object,
                pivot,
                radians
            )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Rotated selection"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Mirror axis resolution: an existing line becomes the
 * axis directly; an existing point becomes the first of
 * a two-point axis.
 */
function handleMirrorClick(
    session,
    rawPoint,
    point
) {
    if (session.stage === "axis") {
        const object =
            objectAtPoint(
                rawPoint
            );

        /*
         * A line provides the axis outright. It does not
         * have to be outside the selection, so a line the
         * user happens to have picked is still usable as
         * the mirror axis.
         */
        if (
            object &&
            object.type === "line"
        ) {
            /*
             * The axis is a reference, so it is removed
             * from the set being mirrored.
             */
            session.ids =
                session.ids.filter(
                    id =>
                        id !==
                        object.id
                );

            if (!session.ids.length) {
                setToolMessage(
                    "Select objects to mirror"
                );

                return true;
            }

            session.axisStart = {
                ...object.geometry.start
            };

            session.axisEnd = {
                ...object.geometry.end
            };

            commitMirror();
            return true;
        }

        /*
         * Anything else acts as the first axis point,
         * so the axis is the infinite line through it
         * and the next click.
         */
        session.axisStart = { ...point };
        session.stage = "axis-end";

        setToolMessage(
            "Specify second point"
        );

        return true;
    }

    if (session.stage === "axis-end") {
        session.axisEnd = { ...point };
        commitMirror();
        return true;
    }

    return true;
}

/*
 * Reflect the captured selection across the resolved
 * world-space axis.
 */
function commitMirror() {
    if (
        !modifySession ||
        !modifySession.axisStart ||
        !modifySession.axisEnd
    ) {
        cancelModifySession();
        return;
    }

    const start =
        modifySession.axisStart;

    const end =
        modifySession.axisEnd;

    if (
        Math.hypot(
            end.x - start.x,
            end.y - start.y
        ) < 1e-9
    ) {
        setToolMessage(
            "Mirror axis needs two distinct points"
        );

        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * Mirror is a duplicate operation: the originals stay
     * exactly where they are and the reflected geometry is
     * created as new, independent features.
     */
    const originals =
        objectsByIds(
            modifySession.ids
        );

    const mirrored = [];

    originals.forEach(
        object => {
            /*
             * Work on a deep copy so the source feature is
             * never touched.
             */
            const copy =
                JSON.parse(
                    JSON.stringify(
                        object
                    )
                );

            copy.id =
                `${object.type}-mirror-${object.id}`;

            mirrorObjectAcrossLine(
                copy,
                start,
                end
            );

            mirrored.push(
                copy
            );
        }
    );

    mirrored.forEach(
        copy => {
            /*
             * addObject assigns the final unique id and a
             * sequential name, so the mirror gets its own
             * feature identity in the tree.
             */
            const newId =
                enggDrawingState.addObject(
                    drawingState,
                    copy
                );

            copy.id = newId;
        }
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    /*
     * The new mirrored features become the selection, so
     * the user can see what was just created.
     */
    enggDrawingState.selectObjects(
        drawingState,
        mirrored.map(
            copy =>
                copy.id
        )
    );

    cancelModifySession();

    setToolMessage(
        mirrored.length === 1
            ? "Mirrored: created 1 new feature"
            : `Mirrored: created ${mirrored.length} new features`
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Trim and Extend: the first click picks the boundary,
 * the second picks the target segment.
 */
function handleTrimExtendClick(
    session,
    rawPoint,
    point
) {
    if (session.stage === "base") {
        const boundary =
            objectAtPoint(
                rawPoint
            );

        if (!boundary) {
            return true;
        }

        session.boundaryId =
            boundary.id;

        session.stage =
            "target";

        setToolMessage(
            session.kind === "trim"
                ? "Select the segment to trim"
                : "Select the geometry to extend"
        );

        return true;
    }

    const target =
        objectAtPoint(
            rawPoint
        );

    if (!target) {
        return true;
    }

    const boundary =
        drawingState.objects.find(
            object =>
                object.id ===
                session.boundaryId
        );

    if (!boundary || boundary.id === target.id) {
        return true;
    }

    if (session.kind === "trim") {
        trimObjectToBoundary(
            target,
            boundary,
            point
        );
    } else {
        extendObjectToBoundary(
            target,
            boundary,
            point
        );
    }

    return true;
}

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
                featurePanelView = "edit";
                renderProperties();
            })}
            ${contextMenuItem("Cut", () => {
                cutSelectionToClipboard();
            }, { hint: "Ctrl+X" })}
            ${contextMenuItem("Copy", () => {
                if (copySelectionToClipboard()) {
                    const count =
                        drawingClipboard
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
                    modifySession.ids =
                        selected;

                    modifySession.stage =
                        "axis";
                }

                setToolMessage(
                    modifyInstruction(
                        modifySession
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
                            modifySession
                        )
                    );
                } else if (action === "open-features") {
                    featurePanelView = "edit";
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

            featureTreePickedId = object.id;

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

function objectsByIds(
    ids
) {
    return drawingState.objects.filter(
        object =>
            ids.includes(
                object.id
            )
    );
}

/*
 * THE CLIPBOARD
 *
 * Copy takes the current selection, paste creates it again as new
 * features, and cut does the two in order. They work through the
 * ordinary selection and the ordinary add path, so a pasted
 * feature is numbered, selectable and editable exactly as a
 * drawn one is, and every one of them is a single undoable
 * change.
 */
let drawingClipboard = null;

/*
 * The features the clipboard currently holds, or null when it is
 * empty. Read by the context menu to decide whether Paste is
 * available at all, because offering an action that does
 * nothing is worse than not offering it.
 */
function clipboardHasContent() {
    return Boolean(
        drawingClipboard &&
            drawingClipboard.features.length
    );
}

function copySelectionToClipboard() {
    const selectedIds = [
        ...drawingState.selection
            .selectedObjectIds
    ];

    if (!selectedIds.length) {
        return false;
    }

    drawingClipboard =
        enggDrawingClipboard.capture(
            objectsByIds(selectedIds)
        );

    return clipboardHasContent();
}

function pasteFromClipboard() {
    if (!clipboardHasContent()) {
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * Copies are offset so they are visibly copies. A paste that
     * landed exactly on its original would be impossible to tell
     * apart from it, let alone pick.
     */
    const offset =
        enggDrawingClipboard.PASTE_OFFSET;

    const created = [];

    enggDrawingClipboard
        .prepare(drawingClipboard)
        .forEach(feature => {
            enggDrawingClipboard.offsetFeature(
                feature,
                offset.x,
                offset.y
            );

            /*
             * addObject assigns the identity and the name, so
             * the copy becomes its own feature in the tree rather
             * than a second row carrying the original's name.
             */
            const id =
                enggDrawingState.addObject(
                    drawingState,
                    feature
                );

            feature.id = id;
            created.push(id);
        });

    if (!created.length) {
        return;
    }

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    /*
     * The copies become the selection, so what was just pasted
     * is selected and can be pasted again or edited straight
     * away, and the panel describes the new features.
     */
    enggDrawingState.selectObjects(
        drawingState,
        created
    );

    featurePanelView = "tree";
    featureTreePickedId = null;

    setToolMessage(
        created.length === 1
            ? "Pasted 1 feature"
            : `Pasted ${created.length} features`
    );

    renderProperties();
    renderCurrentDrawing();
}

function cutSelectionToClipboard() {
    if (!copySelectionToClipboard()) {
        return;
    }

    deleteSelectedObjects();
}

/*
 * Duplicate the selection in place.
 *
 * This is a copy followed by a paste, so a duplicate is exactly
 * a pasted copy: the same fresh identity, the same offset, the
 * same parent re-pointing. There is deliberately no second
 * implementation of it, because a Duplicate that behaved
 * slightly differently from Copy then Paste is exactly the kind
 * of drift that makes an editing tool feel unpredictable.
 */
function duplicateSelection() {
    if (!copySelectionToClipboard()) {
        return;
    }

    pasteFromClipboard();
}

/*
 * Reflect a point across the infinite line through two
 * points.
 */
function reflectPointAcrossLine(
    point,
    start,
    end
) {
    const dx =
        end.x - start.x;

    const dy =
        end.y - start.y;

    const lengthSquared =
        dx * dx + dy * dy;

    if (lengthSquared < 1e-18) {
        return { ...point };
    }

    const t =
        (
            (point.x - start.x) * dx +
            (point.y - start.y) * dy
        ) /
        lengthSquared;

    const foot = {
        x: start.x + t * dx,
        y: start.y + t * dy
    };

    return {
        x: 2 * foot.x - point.x,
        y: 2 * foot.y - point.y
    };
}

/*
 * World-space reflection of a whole feature, preserving
 * its coherent structure.
 */
function mirrorObjectAcrossLine(
    object,
    start,
    end
) {
    const g =
        object.geometry;

    const reflect =
        point => {
            const r =
                reflectPointAcrossLine(
                    point,
                    start,
                    end
                );

            point.x = r.x;
            point.y = r.y;
        };

    if (object.type === "line") {
        reflect(g.start);
        reflect(g.end);
        return;
    }

    if (object.type === "circle") {
        reflect(g.center);
        return;
    }

    if (object.type === "arc") {
        /*
         * Reflect the centre, then reflect both angle
         * directions. The mirror reverses orientation,
         * so the start/end angles swap their reflected
         * values and the sweep changes sign.
         */
        reflect(g.center);

        const axisAngle =
            Math.atan2(
                end.y - start.y,
                end.x - start.x
            );

        const startAngle = g.startAngle;
        const endAngle = g.endAngle;

        g.startAngle =
            2 * axisAngle - endAngle;

        g.endAngle =
            2 * axisAngle - startAngle;

        if (g.sweep !== undefined) {
            g.sweep = -g.sweep;
        }

        return;
    }

    if (object.type === "polygon") {
        reflect(g.center);

        const axisAngle =
            Math.atan2(
                end.y - start.y,
                end.x - start.x
            );

        g.rotation =
            2 * axisAngle -
            (Number(g.rotation) || 0);

        return;
    }

    if (object.type === "point") {
        reflect(g.position || g.point || g);
        return;
    }

    if (object.type === "rectangle") {
        /*
         * A rectangle is axis-aligned, so reflect the two
         * opposite corners and rebuild it from the new
         * bounds.
         */
        const a = {
            x: g.position.x,
            y: g.position.y
        };

        const b = {
            x: g.position.x + g.width,
            y: g.position.y - g.height
        };

        reflect(a);
        reflect(b);

        g.position = {
            x: Math.min(a.x, b.x),
            y: Math.max(a.y, b.y)
        };

        g.width = Math.abs(b.x - a.x);
        g.height = Math.abs(b.y - a.y);
        return;
    }

    if (object.type === "rigid-body") {
        /*
         * A rigid body is a shape, so it is reflected through
         * its OUTLINE rather than through its stored anchor.
         * Reflecting only the anchor and the rotation would
         * leave the body in the wrong place, because the anchor
         * is one corner and the rotation is measured from it.
         *
         * The reflected outline is then rebuilt from its new
         * bounds, so the body keeps the same size and occupies
         * the position it was actually mirrored to.
         */
        const shape =
            enggFeatureGeometry.rigidBodyShape(
                g
            );

        const outline =
            enggFeatureGeometry
                .definingPoints(g, shape)
                .map(point => ({ ...point }));

        outline.forEach(reflect);

        const xs = outline.map(p => p.x);
        const ys = outline.map(p => p.y);

        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.max(...ys);
        const bottom = Math.min(...ys);

        if (
            shape === "circle" ||
            shape === "rectangle"
        ) {
            /*
             * These two are defined by a centre and a size, so
             * the mirrored bounds become a centre of the same
             * size. The centre is what the shape's own geometry
             * is read from, so writing it back is enough.
             */
            g.position = {
                x: left,
                y: top
            };

            g.width = right - left;
            g.height = top - bottom;

            g.center = {
                x: (left + right) / 2,
                y: (top + bottom) / 2
            };

            g.rotation = 0;

            return;
        }

        /*
         * A triangle or a polygon is defined by its own
         * vertices, so the reflected outline replaces them and
         * the anchor is re-derived from the reflected points
         * rather than carried over from the source.
         */
        g.points = outline;

        const centre =
            enggFeatureGeometry.rigidBodyCenter(
                { ...g, points: outline }
            ) || { x: 0, y: 0 };

        g.position = {
            x: centre.x,
            y: centre.y
        };

        g.rotation = 0;

        return;
    }

    if (
        object.type === "force"
    ) {
        /*
         * A Point Force is a vector, not a point. Reflecting
         * both of its ends turns the whole vector, so the
         * direction is reflected as well as the position, and
         * the magnitude is left to be re-derived rather than
         * carried over as a number that no longer describes it.
         */
        reflect(g.start);

        if (g.position) {
            reflect(g.position);
        }

        if (g.end) {
            reflect(g.end);
        }

        const start = g.start;
        const end = g.end || start;

        /*
         * Magnitude and angle are re-read from the reflected
         * ends, so the panel and the renderer agree with the
         * geometry instead of showing the source's values.
         */
        g.magnitude = Math.hypot(
            end.x - start.x,
            end.y - start.y
        );

        g.angle =
            Math.atan2(
                end.y - start.y,
                end.x - start.x
            ) * 180 / Math.PI;

        return;
    }

    if (
        object.type === "load" ||
        object.type === "varying-load"
    ) {
        /*
         * A load is a body plus a direction. Both have to be
         * reflected, and the distribution points have to be left
         * ALONE: they are positions ALONG the body, not points
         * in the plane, so reflecting them as if they were
         * coordinates is what would put NaN into the profile.
         *
         * The reflected body re-projects the profile onto
         * itself, so the shape of the load travels with the
         * body it is drawn on.
         */
        reflect(g.start);
        reflect(g.end);

        const axisAngle =
            Math.atan2(
                end.y - start.y,
                end.x - start.x
            );

        if (
            Number.isFinite(
                Number(g.direction)
            )
        ) {
            g.direction =
                2 * axisAngle -
                (Number(g.direction) || 0);
        }

        return;
    }

    if (
        object.type === "beam" ||
        object.type === "cable" ||
        object.type === "shaft"
    ) {
        reflect(g.start);
        reflect(g.end);
        return;
    }

    if (object.type === "truss") {
        /*
         * A truss is its own members, so every joint of every
         * member is reflected. Reflecting only the two stored
         * ends would leave the web members behind, which is the
         * thing that makes a truss a truss.
         */
        if (Array.isArray(g.members)) {
            g.members.forEach(member => {
                reflect(member.start);
                reflect(member.end);
            });
        }

        if (g.start) {
            reflect(g.start);
        }

        if (g.end) {
            reflect(g.end);
        }

        return;
    }

    if (
        object.type === "moment" ||
        object.type === "couple" ||
        isSupportType(object.type) ||
        isConnectionType(object.type) ||
        object.type === "support" ||
        object.type === "body" ||
        object.type === "particle"
    ) {
        /*
         * These act at a single location, so reflecting the
         * position is the whole of it. A connection is a span
         * rather than a point, so both of its ends move.
         */
        if (
            object.type ===
                "pin-connection" ||
            object.type ===
                "fixed-connection" ||
            object.type ===
                "slider-connection" ||
            object.type === "connection"
        ) {
            reflect(g.start);
            reflect(g.end);
            return;
        }

        if (g.position) {
            reflect(g.position);
        }

        if (g.start) {
            reflect(g.start);
        }

        if (g.end) {
            reflect(g.end);
        }

        return;
    }

    if (Array.isArray(g.points)) {
        /*
         * The remaining multi-point shapes are triangle,
         * polyline and polygon-with-centre. Their points are
         * real coordinates in the plane, so reflecting them is
         * what moves the shape.
         */
        g.points.forEach(reflect);
    }
}

/*
 * Rotate a feature about a pivot in world space.
 *
 * The work is done by the shared feature-geometry registry
 * so that move, rotate and handle placement all agree on
 * which points a feature is made of.
 */
function rotateObjectAbout(
    object,
    pivot,
    radians
) {
    enggFeatureGeometry.rotateObjectAbout(
        object,
        pivot,
        radians
    );
}

/*
 * Trim a line back to its nearest intersection with the
 * boundary. Only line geometry is trimmed, because a
 * coherent curved feature cannot be shortened without
 * changing what it represents.
 */
function trimObjectToBoundary(
    target,
    boundary,
    clickPoint
) {
    if (target.type !== "line") {
        setToolMessage(
            "Only lines can be trimmed"
        );

        cancelModifySession();
        return;
    }

    const hit =
        nearestIntersectionOnLine(
            target,
            boundary
        );

    if (!hit) {
        setToolMessage(
            "No intersection with the boundary"
        );

        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * The clicked end is the part removed.
     */
    const g =
        target.geometry;

    const distanceToStart =
        Math.hypot(
            clickPoint.x - g.start.x,
            clickPoint.y - g.start.y
        );

    const distanceToEnd =
        Math.hypot(
            clickPoint.x - g.end.x,
            clickPoint.y - g.end.y
        );

    if (distanceToStart <= distanceToEnd) {
        g.start = { ...hit };
    } else {
        g.end = { ...hit };
    }

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Trimmed line"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Extend a line to its nearest intersection with the
 * boundary along the line's own direction.
 */
function extendObjectToBoundary(
    target,
    boundary,
    clickPoint
) {
    if (target.type !== "line") {
        setToolMessage(
            "Only lines can be extended"
        );

        cancelModifySession();
        return;
    }

    const g =
        target.geometry;

    const hit =
        nearestIntersectionOnLine(
            target,
            boundary,
            true
        );

    if (!hit) {
        setToolMessage(
            "No boundary intersection found"
        );

        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const distanceToStart =
        Math.hypot(
            clickPoint.x - g.start.x,
            clickPoint.y - g.start.y
        );

    const distanceToEnd =
        Math.hypot(
            clickPoint.x - g.end.x,
            clickPoint.y - g.end.y
        );

    if (distanceToStart <= distanceToEnd) {
        g.start = { ...hit };
    } else {
        g.end = { ...hit };
    }

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Extended line"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Intersection between a line and any other supported
 * boundary object, in world coordinates.
 */
function nearestIntersectionOnLine(
    lineObject,
    boundary,
    allowExtension = false
) {
    const segments =
        boundarySegments(
            boundary
        );

    const g =
        lineObject.geometry;

    let best = null;

    segments.forEach(
        ([a, b]) => {
            const hit =
                segmentIntersectionPoint(
                    g.start,
                    g.end,
                    a,
                    b
                );

            if (!hit) {
                return;
            }

            /*
             * When trimming, the hit has to lie on the
             * line already; when extending it may lie
             * beyond either end.
             */
            const t =
                segmentParameter(
                    g.start,
                    g.end,
                    hit
                );

            if (
                !allowExtension &&
                (t < -1e-9 || t > 1 + 1e-9)
            ) {
                return;
            }

            const distance =
                Math.hypot(
                    hit.x - g.start.x,
                    hit.y - g.start.y
                );

            if (
                !best ||
                distance < best.distance
            ) {
                best = {
                    point: hit,
                    distance
                };
            }
        }
    );

    return best ? best.point : null;
}

/*
 * Straight segments of any supported boundary object.
 */
function boundarySegments(
    object
) {
    const g =
        object.geometry || {};

    if (object.type === "line") {
        return [[g.start, g.end]];
    }

    if (object.type === "rectangle") {
        const a = { x: g.position.x, y: g.position.y };
        const b = { x: g.position.x + g.width, y: g.position.y };
        const c = { x: g.position.x + g.width, y: g.position.y - g.height };
        const d = { x: g.position.x, y: g.position.y - g.height };

        return [[a, b], [b, c], [c, d], [d, a]];
    }

    if (object.type === "triangle") {
        const points = (g.points || []).filter(Boolean);

        return points.map((p, i) => [p, points[(i + 1) % points.length]]);
    }

    if (object.type === "polygon") {
        const points = enggDrawingState.polygonVertices(g);

        return points.map((p, i) => [p, points[(i + 1) % points.length]]);
    }

    if (object.type === "polyline" && Array.isArray(g.points)) {
        const segments = [];

        for (let i = 1; i < g.points.length; i += 1) {
            segments.push([g.points[i - 1], g.points[i]]);
        }

        return segments;
    }

    return [];
}

/*
 * Parameter of a point along a segment, where 0 is the
 * start and 1 is the end.
 */
function segmentParameter(
    start,
    end,
    point
) {
    const dx =
        end.x - start.x;

    const dy =
        end.y - start.y;

    const lengthSquared =
        dx * dx + dy * dy;

    if (lengthSquared < 1e-18) {
        return 0;
    }

    return (
        (
            (point.x - start.x) * dx +
            (point.y - start.y) * dy
        ) /
        lengthSquared
    );
}

/*
 * Intersection of two straight segments, or null when
 * they are parallel or do not cross.
 */
function segmentIntersectionPoint(
    firstStart,
    firstEnd,
    secondStart,
    secondEnd
) {
    const denominator =
        (firstStart.x - firstEnd.x) *
            (secondStart.y - secondEnd.y) -
        (firstStart.y - firstEnd.y) *
            (secondStart.x - secondEnd.x);

    if (Math.abs(denominator) < 1e-12) {
        return null;
    }

    const a = firstStart.x * firstEnd.y - firstStart.y * firstEnd.x;
    const b = secondStart.x * secondEnd.y - secondStart.y * secondEnd.x;

    const x =
        (
            a * (secondStart.x - secondEnd.x) -
            (firstStart.x - firstEnd.x) * b
        ) / denominator;

    const y =
        (
            a * (secondStart.y - secondEnd.y) -
            (firstStart.y - firstEnd.y) * b
        ) / denominator;

    return { x, y };
}

/*
 * Translate every selected object by a delta.
 */
function moveSelectionBy(
    deltaX,
    deltaY
) {
    const selected =
        drawingState.objects.filter(
            object =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
        );

    if (!selected.length) {
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    selected.forEach(
        object =>
            translateObject(
                object,
                deltaX,
                deltaY
            )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Move an object's defining geometry. Each feature
 * type stores its position differently, so this maps
 * the translation onto the stored parameters rather
 * than duplicating the geometry.
 */
/*
 * Move every defining point of a feature by a delta.
 *
 * Delegated to the shared feature-geometry registry so a
 * feature never moves by one rule and rotates by another.
 */
function translateObject(
    object,
    deltaX,
    deltaY
) {
    enggFeatureGeometry.translateObject(
        object,
        deltaX,
        deltaY,

        /*
         * The LOOKUP the geometry module uses to find a feature's
         * parent, passed in rather than reached for.
         *
         * A support is moved along its parent body's centreline, so
         * the geometry needs the body to do it. This module is
         * deliberately free of any knowledge of the document - it
         * answers questions about shapes, not about what is on the
         * sheet - so the drawing, which does know, supplies the
         * lookup. That is the same arrangement used for the
         * dependency registry: the shared module is told about the
         * document rather than reaching into it.
         */
        id =>
            drawingState.objects.find(
                candidate =>
                    candidate.id === id
            ) || null
    );
}

/*
 * Rotate the selection about its own centre, so a
 * rotate never drifts the geometry away from where it
 * was.
 */
function rotateSelectionBy(
    degrees
) {
    const selected =
        drawingState.objects.filter(
            object =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
        );

    if (!selected.length) {
        return;
    }

    const pivot =
        selectionCenter(
            selected
        );

    const radians =
        degrees *
        Math.PI /
        180;

    const cos =
        Math.cos(radians);

    const sin =
        Math.sin(radians);

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const rotatePoint =
        point => {
            const dx =
                point.x - pivot.x;

            const dy =
                point.y - pivot.y;

            point.x =
                pivot.x +
                dx * cos -
                dy * sin;

            point.y =
                pivot.y +
                dx * sin +
                dy * cos;
        };

    selected.forEach(
        object => {
            const g =
                object.geometry;

            if (
                object.type === "line"
            ) {
                rotatePoint(g.start);
                rotatePoint(g.end);
                return;
            }

            if (
                object.type === "circle"
            ) {
                rotatePoint(g.center);
                return;
            }

            if (
                object.type === "arc"
            ) {
                rotatePoint(g.center);
                g.startAngle += radians;
                g.endAngle += radians;

                if (g.sweep !== undefined) {
                    /* sweep magnitude is unchanged */
                }

                return;
            }

            if (
                object.type === "polygon"
            ) {
                rotatePoint(g.center);
                g.rotation =
                    (Number(g.rotation) || 0) +
                    radians;
                return;
            }

            if (
                object.type === "point"
            ) {
                rotatePoint(
                    g.position || g.point || g
                );
                return;
            }

            if (
                object.type === "rectangle"
            ) {
                rotatePoint(g.position);
                g.rotation =
                    (Number(g.rotation) || 0) +
                    degrees;
                return;
            }

            if (
                Array.isArray(
                    g.points
                )
            ) {
                g.points.forEach(
                    rotatePoint
                );
            }
        }
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Mirror the selection across the vertical line through
 * its own centre.
 */
function mirrorSelectionVertically() {
    const selected =
        drawingState.objects.filter(
            object =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
        );

    if (!selected.length) {
        return;
    }

    const axis =
        selectionCenter(
            selected
        ).x;

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const flip =
        point => {
            point.x =
                2 * axis -
                point.x;
        };

    selected.forEach(
        object => {
            const g =
                object.geometry;

            if (
                object.type === "line"
            ) {
                flip(g.start);
                flip(g.end);
                return;
            }

            if (
                object.type === "circle"
            ) {
                flip(g.center);
                return;
            }

            if (
                object.type === "arc"
            ) {
                flip(g.center);

                /*
                 * Mirroring reverses the arc direction.
                 */
                g.startAngle =
                    Math.PI -
                    g.startAngle;

                g.endAngle =
                    Math.PI -
                    g.endAngle;

                return;
            }

            if (
                object.type === "polygon"
            ) {
                flip(g.center);
                g.rotation =
                    Math.PI -
                    (Number(g.rotation) || 0);
                return;
            }

            if (
                object.type === "point"
            ) {
                flip(
                    g.position || g.point || g
                );
                return;
            }

            if (
                object.type === "rectangle"
            ) {
                flip(g.position);
                return;
            }

            if (
                Array.isArray(
                    g.points
                )
            ) {
                g.points.forEach(
                    flip
                );
            }
        }
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Bounding centre of a set of objects, used as the
 * pivot for rotate and the axis for mirror.
 */
function selectionCenter(
    objects
) {
    const points = [];

    objects.forEach(
        object => {
            const g =
                object.geometry;

            if (!g) {
                return;
            }

            if (g.start) {
                points.push(g.start);
            }

            if (g.end) {
                points.push(g.end);
            }

            if (g.center) {
                points.push(g.center);
            }

            if (g.position) {
                points.push(g.position);
            }

            if (g.origin) {
                points.push(g.origin);
            }

            if (
                Array.isArray(
                    g.points
                )
            ) {
                g.points.forEach(
                    point =>
                        points.push(
                            point
                        )
                );
            }
        }
    );

    if (!points.length) {
        return {
            x: 0,
            y: 0
        };
    }

    const xs =
        points.map(
            point =>
                point.x
        );

    const ys =
        points.map(
            point =>
                point.y
        );

    return {
        x:
            (
                Math.min(...xs) +
                Math.max(...xs)
            ) / 2,

        y:
            (
                Math.min(...ys) +
                Math.max(...ys)
            ) / 2
    };
}

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
function fitDrawingToView() {
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
function renderedBounds(
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
        return [
            ...distributedLoadRenderedPoints(
                {
                    start: geometry.start,
                    end: geometry.end,
                    direction: geometry.direction,
                    interval: geometry.interval,

                    points: [
                        {
                            t: 0,
                            magnitude: Math.max(
                                0,
                                Math.abs(
                                    Number(geometry.startIntensity) || 0
                                )
                            )
                        },
                        {
                            t: 1,
                            magnitude: Math.max(
                                0,
                                Math.abs(
                                    Number(geometry.endIntensity) || 0
                                )
                            )
                        }
                    ]
                },
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
            window.enggDrawingRotationalArrow;

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
    if (
        !geometry ||
        !geometry.start ||
        !geometry.end
    ) {
        return [];
    }

    const points = [
        geometry.start,
        geometry.end
    ];

    if (
        typeof enggLoadProfile ===
            "undefined"
    ) {
        return points;
    }

    const samples =
        enggLoadProfile.arrowSamples(
            geometry
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

function zoomAtCanvasPoint(
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
function updateDrawingZoom(
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
function toggleWorkspaceSetting(
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

let eyedropperActive = false;

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
        eyedropperActive =
            false;
    }
}

/*
 * Read a feature's own stored colour, not a sampled
 * screen pixel.
 */
function pickColourFromFeature(
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

    eyedropperActive =
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
        eyedropperActive
    );

    eyedropper.addEventListener(
        "click",
        () => {
            eyedropperActive =
                !eyedropperActive;

            eyedropper.classList.toggle(
                "active",
                eyedropperActive
            );

            setToolMessage(
                eyedropperActive
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
function setupColourControl() {
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

function applyStyleControls() {
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

function deleteSelectedObjects() {
    const selectedIds = [
        ...drawingState.selection
            .selectedObjectIds
    ];

    if (
        !selectedIds.length ||
        drawingState.interaction.phase !==
            "idle"
    ) {
        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const selectedSet =
        new Set(
            selectedIds
        );

    drawingState.objects =
        drawingState.objects.filter(
            object =>
                !selectedSet.has(
                    object.id
                )
        );

    /*
     * Settle the analysis objects that were reading what has just gone.
     *
     * Called with the ids that were DELETED, not with every id on the
     * sheet, so it can tell a source that has been removed from one
     * that is merely there. A Force Components and a Resultant are
     * generated from their sources and mean nothing alone, so they go
     * with them; a diagram is a workspace the student has been drawing
     * in, so it stays and is marked.
     *
     * Without this, deleting a force left a live-looking components
     * object on the sheet describing a force that was not there any
     * more - which is worse than an error message, because it looks
     * like an answer.
     *
     * It runs BEFORE the commit, so the snapshot taken for Undo
     * already reflects the resolution and Undo restores the whole
     * coherent state rather than resurrecting the dangling reference.
     */
    enggDrawingState.resolveAnalysisAfterDeletion(
        drawingState,
        selectedIds
    );

    drawingState.selection
        .selectedObjectIds = [];

    drawingState.selection
        .boxSelectionIds = [];

    drawingState.selection
        .hoveredObjectId = null;

    drawingState.interaction
        .hoveredEntity = null;

    drawingState.interaction
        .snapCandidate = null;

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    renderProperties();
    renderCurrentDrawing();

    setToolMessage(
        `Deleted ${selectedIds.length} component${
            selectedIds.length === 1
                ? ""
                : "s"
        }`
    );
}

if (
    drawingComponentsBack
) {
    drawingComponentsBack.addEventListener(
        "click",
        () => {
            /*
             * Features always returns to the component list,
             * even when a feature is still selected.
             *
             * It is an explicit instruction to go back, so it
             * must not be overridden by the fact that something
             * happens to be selected: the selection stays, and
             * the list still shows it as selected. Clicking that
             * feature again is what reopens the editing page.
             */
            featurePanelView = "tree";
            featureTreePickedId = null;

            drawingComponentsBack.style.display =
                "none";

            renderComponentTree();
        }
    );
}

if (
    drawingGridToggle
) {
    drawingGridToggle.addEventListener(
        "click",
        () =>
            toggleWorkspaceSetting(
                drawingGridToggle,
                "Grid"
            )
    );
}

if (
    drawingSnapToggle
) {
    drawingSnapToggle.addEventListener(
        "click",
        () =>
            toggleWorkspaceSetting(
                drawingSnapToggle,
                "Snap"
            )
    );
}

if (
    drawingUndo
) {
    drawingUndo.addEventListener(
        "click",
        performUndo
    );
}

if (
    drawingRedo
) {
    drawingRedo.addEventListener(
        "click",
        performRedo
    );
}

/*
 * Global toolbar tools.
 *
 * Modify tools operate on the selected geometry;
 * View tools change only the camera. Both reuse the
 * existing selection, snapping and camera systems.
 */

/*
 * The id of the global toolbar tool currently running,
 * so its button can stay visibly highlighted and be
 * cleared the moment the tool ends.
 */
let activeGlobalTool = null;

/*
 * Paint the active highlight across the global toolbar.
 * Exactly one button can be active at a time.
 */
function refreshGlobalToolHighlight() {
    document
        .querySelectorAll("[data-global-tool]")
        .forEach(button => {
            const isActive =
                button.dataset.globalTool ===
                activeGlobalTool;

            button.classList.toggle(
                "active",
                isActive
            );

            button.setAttribute(
                "aria-pressed",
                isActive
                    ? "true"
                    : "false"
            );
        });
}

/*
 * Clear the highlight. Called whenever a tool is
 * cancelled, replaced, or completes.
 */
function clearGlobalToolHighlight() {
    activeGlobalTool =
        null;

    refreshGlobalToolHighlight();
}

document.querySelectorAll("[data-global-tool]").forEach(button => {
    button.addEventListener("click", () => {
        const toolId =
            button.dataset.globalTool;

        activateGlobalTool(
            toolId,
            button
        );

        /*
         * Pan and the Modify tools stay active until they
         * finish or are cancelled; Zoom and Fit act once
         * and release immediately.
         */
        activeGlobalTool =
            [
                "pan",
                "move",
                "rotate",
                "mirror",
                "trim",
                "extend"
            ].includes(
                toolId
            )
                ? toolId
                : null;

        refreshGlobalToolHighlight();
    });
});

/*
 * File commands operate on the whole drawing, reusing
 * the existing serialisation and history systems.
 */
const drawingFileNew =
    document.getElementById("drawingFileNew");

const drawingFileOpen =
    document.getElementById("drawingFileOpen");

const drawingFileSave =
    document.getElementById("drawingFileSave");

function newDrawing() {
    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    drawingState.objects = [];

    /*
     * New is a new DOCUMENT, not a new sheet. The old document's
     * sheets are gone with it - keeping them would mean pressing New
     * silently copied every drawing the student had made into a fresh
     * untitled file, which is not what New means anywhere else.
     *
     * One blank sheet, with its own id, and it is active.
     */
    sheetCollection =
        enggSheets.createCollection();

    loadSheetIntoEditor(
        activeSheet()
    );

    enggDrawingState.clearSelection(
        drawingState
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    refreshSheetTabs();

    notifyReferences();

    /*
     * A new drawing has never been saved, so it has no file yet. The
     * next Save therefore asks for a name rather than quietly
     * overwriting whatever the previous drawing was called.
     */
    documentFileName = null;

    /*
     * A new document belongs to no file. Forgetting the handle is
     * what guarantees the first Save asks where the file should go
     * rather than quietly overwriting whatever was open before.
     */
    enggFileSave.forgetFileHandle();

    markDocumentDirty();

    setToolMessage(
        "New drawing"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The name of the file this document was last saved to, or null if
 * it has never been.
 *
 * A browser cannot write to a path the user did not choose, so Save
 * always produces a download. Remembering the name is what lets a
 * second Save do the obvious thing - offer the same file again -
 * rather than silently inventing "drawing.enggdraw" again, and it is
 * also what the dirty indicator and the unsaved-changes prompt
 * compare against.
 */
let documentFileName = null;

/*
 * Whether the document has changed since it was last saved.
 *
 * Tracked as a flag rather than inferred, because the things that
 * count as "the user changed something" - a moved handle, an edited
 * magnitude, a reversed load - go through many code paths, and each
 * of them marking the flag is the only way to be sure none is
 * missed.
 */
let documentDirty = false;

/*
 * Mark the document as having unsaved changes.
 *
 * Called from the one place every committed edit passes through, so
 * adding a feature, dragging a handle, typing a value, reversing a
 * load or editing a distribution point all count without each of
 * them having to remember.
 *
 * A recovery copy is scheduled at the same time. It is written after
 * a short pause rather than immediately, so a drag that mutates
 * geometry on every pointermove costs one write at the end of it
 * rather than one per frame.
 */
function markDocumentDirty() {
    documentDirty = true;

    /*
     * The active sheet is written back here, not only when the user
     * switches away from it.
     *
     * Every committed edit in the application arrives at this one
     * function, so this is the only place that can be certain the
     * sheet holding the features is current. Doing it at the switch
     * instead would mean the sheet, the recovery copy and the dirty
     * flag were three views of the drawing that only agreed
     * sometimes - and a browser reload between an edit and a switch
     * would recover a drawing missing its most recent change.
     */
    syncActiveSheet();

    enggRecovery.schedule(
        serializeDocumentBody(),
        documentFileName
    );

    /*
     * A figure is rendered from the sheet, so an edit to the sheet is
     * a reason for any figure of it to be looked at again. Told from
     * here rather than from each edit path, for the same reason the
     * dirty flag is.
     */
    notifyReferences();
}

/*
 * Note that the document matches what is on disk.
 *
 * This also drops the recovery copy, because a saved document is
 * not lost work - leaving it behind would greet the user with a
 * "recovery" of something they already have.
 */
function markDocumentClean() {
    documentDirty = false;

    enggRecovery.discard();
}

function documentIsDirty() {
    return documentDirty;
}

/*
 * Tell the state model that the controller owns the document's file
 * and dirty state, so it can report every committed edit.
 */
enggDrawingState.setDocumentChangedHandler(
    markDocumentDirty
);

function documentFile() {
    return documentFileName;
}

/*
 * The serialised document body, exactly as the state model holds it.
 *
 * This is the whole document: units, calibration, camera, every
 * object's real type, geometry, style, parent and parameters. The
 * format module wraps it; nothing here decides what the file is
 * called or how it is versioned.
 */
function serializeDocumentBody() {
    /*
     * The editor holds the ACTIVE sheet, so it is written back before
     * the document is read. Saving is therefore exactly as accurate as
     * switching: whatever the user can see is what goes to the file,
     * and the sheet they were last looking at is the one that was
     * still being edited when they pressed Save.
     */
    syncActiveSheet();

    const body = JSON.parse(
        enggDrawingState.serializeDrawing(
            drawingState
        )
    );

    return {
        ...body,
        sheets: enggSheets.serializeCollection(
            sheetCollection
        ).sheets,
        activeSheetId: sheetCollection.activeSheetId
    };
}

/*
 * Hand the file to the browser as a download.
 *
 * The File System Access API is used when it is available, because
 * that is the only route that lets Save write back to the same file
 * the user already chose. Where it is not available the download
 * route is used, which always works and is what most browsers will
 * do.
 */
function downloadDocumentFile(name) {
    const fileName =
        enggDocumentFile.withExtension(
            name || documentFileName || "drawing"
        );

    const payload =
        enggDocumentFile.createDocument(
            serializeDocumentBody()
        );

    const blob =
        new Blob(
            [JSON.stringify(payload, null, 2)],
            { type: enggDocumentFile.MEDIA_TYPE }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    return fileName;
}

/*
 * Save the drawing to a .enggdraw file.
 *
 * With no file name yet, this asks for one. Once the document has
 * been saved, Save reuses that name, so the common case - open,
 * change, save - does the expected thing without a dialog.
 */
/*
 * Run an action, having first offered to save unsaved changes.
 *
 * Anything that replaces or abandons the current document - New,
 * Open, closing - has to ask before throwing work away. The three
 * answers are the conventional ones, and Cancel does nothing at
 * all, which is the only safe default: a user who is interrupted
 * must never find their drawing replaced because they pressed a key.
 *
 * The prompt is only shown when there is something to lose, so the
 * ordinary case of working in a new drawing is never interrupted.
 */
function confirmDiscardUnsavedChanges(action) {
    if (!documentIsDirty()) {
        action();

        return true;
    }

    const file =
        documentFile() || "this drawing";

    /*
     * Asked with the application's own dialog rather than the
     * browser's, for the same reason the save panel is native: this
     * is an interaction with the person using the application, and it
     * should look like the application. It also means the three
     * answers can be laid out properly rather than as a system
     * dialog's fixed buttons.
     */
    enggUi
        .confirmDialog(
            `${file} has unsaved changes.\n\n` +
            "Save before continuing?",
            {
                title: "Unsaved changes",
                confirm: "Save",
                cancel: "Don't Save"
            }
        )
        .then(async (saveFirst) => {
            if (!saveFirst) {
                return;
            }

            /*
             * Saved before leaving, and only then does the action run.
             * Cancelling the save panel therefore cancels the whole
             * operation rather than abandoning the drawing: nothing
             * is lost either way, and the student keeps what they
             * were working on.
             */
            const saved =
                await saveDrawing();

            if (saved) {
                action();
            }
        });

    /*
     * False because the action has NOT run yet - it runs when the
     * answer arrives. Open and New check this before doing anything
     * that would otherwise replace the drawing immediately.
     */
    return false;
}

/*
 * The export formats offered, in one place.
 *
 * PNG and JPG share the raster pipeline because they differ only in
 * how the finished image is encoded. SVG is listed with them but is
 * a genuinely different output - it keeps the drawing as vectors
 * rather than pixels - so it is marked rather than pretending to be
 * the same thing.
 */
const EXPORT_FORMATS = [
  { id: "png", label: "PNG", vector: false },
  { id: "jpg", label: "JPG", vector: false },
  { id: "svg", label: "SVG", vector: true }
];

function openExportMenu() {
  /*
   * Export is a choice, not a single action, so the shortcut opens
   * the same list the menu shows rather than silently picking a
   * format the user did not ask for.
   */
  const choice = window.prompt(
    "Export as:\n" +
    EXPORT_FORMATS.map(
      (format, index) => `${index + 1}. ${format.label}`
    ).join("\n") +
    "\n\nEnter 1, 2 or 3",
    "1"
  );

  if (choice === null) {
    return;
  }

  const index = Number(choice) - 1;

  const format = EXPORT_FORMATS[index];

  if (!format) {
    return;
  }

  exportDrawing(format);
}

/*
 * Every point the drawing is actually drawn through, across all of
 * its features.
 *
 * This is what an export is fitted to. It is the union of each
 * feature's RENDERED extent - force arrowheads, load arrows and
 * profiles, dimension text - rather than its stored geometry, so
 * nothing that is drawn can fall outside the image.
 */
function drawnBoundsPoints() {
    return renderedPointsForObjects(
        drawingState.objects
    );
}

/*
 * Every point a set of features is actually drawn through.
 *
 * The same measurement, for any set of features rather than only the
 * ones the editor has loaded. That is what lets a Drawing Reference
 * measure a sheet nobody is looking at: it asks for the rendered
 * extent of THAT sheet's features and gets the same answer an export
 * of it would give, because it is the same code doing the measuring.
 *
 * The zoom is the caller's to choose. The editor passes its own, so
 * the arrows of a load stand off its body by the size the user can
 * actually see. A reference passes nothing, because a reference
 * computes its own fit afterwards and wants the drawing's shape rather
 * than the size of whatever happens to be on screen.
 */
function renderedPointsForObjects(objects, measuredAtZoom) {
    const points = [];

    /*
     * No camera is touched. The measurement scale is now a parameter
     * of renderedBounds, so a figure can be measured at zoom 1 for a
     * sheet the student happens to be looking at at 400% - without
     * borrowing, and having to put back, the editor's camera. That is
     * what makes the measurement independent rather than merely
     * self-restoring.
     */
    (objects || []).forEach((object) => {
        renderedBounds(
            object,
            measuredAtZoom
        ).forEach((point) => points.push(point));
    });

    return points;
}

/*
 * Tell the export module what the editor draws.
 *
 * The editor is the only place that knows how far a force's
 * arrowhead reaches past its stored end, or how far a load's arrows
 * stand off its body, so it supplies that to the export. Registering
 * it once here means every export - PNG, JPG, SVG, Print - is fitted
 * to the same extent the editor draws, and none of them can crop a
 * feature the editor itself shows.
 */
enggDrawingExport.setBoundsProvider(
    drawnBoundsPoints
);

/*
 * Teach the reference system where sheets are and how a feature is
 * measured.
 *
 * Registered here, beside the bounds provider above, because this is
 * the only place that holds both. The reference module itself knows
 * nothing about the document model - it is handed a way to find a
 * sheet and a way to measure it - which is what keeps it reusable and
 * keeps the written solution from having to understand drawings.
 */
enggDrawingReference.configure({
    getSheet: sheetById,

    /*
     * Measured at zoom 1, explicitly.
     *
     * A figure is a statement about the DRAWING, not about the view,
     * so it must not change size when the student zooms in on a
     * detail in the editor. Saying so here rather than leaving it to
     * whatever the camera happens to be is what makes that true.
     */
    getRenderedPoints: (objects) =>
        renderedPointsForObjects(objects, 1)
});

/*
 * The document's name without its extension, which is what an
 * export is named after.
 *
 * An export of "Report.enggdraw" is "Report.png", not
 * "Report.enggdraw.png" - the export is a different kind of file of
 * the same drawing, not a second project file.
 */
function exportBaseName() {
    const current =
        documentFile() || "drawing";

    const suffix =
        `.${enggDocumentFile.EXTENSION}`;

    return current.toLowerCase().endsWith(
        suffix.toLowerCase()
    )
        ? current.slice(0, -suffix.length)
        : current;
}

/*
 * Export the drawing in a chosen format.
 *
 * Every format goes through the one clean render, so a PNG, a JPG
 * and a print of the same drawing differ only in how the finished
 * image is encoded - never in what they show. The bounds come from
 * what is DRAWN, so an arrowhead, a load profile or a dimension
 * that reaches past its stored geometry is still inside the image.
 */
function exportDrawing(format) {
    if (
        !drawingState.objects.length
    ) {
        setToolMessage(
            "There is nothing to export"
        );

        return;
    }

    const name = exportBaseName();

    if (format.id === "svg") {
        exportSvg(`${name}.svg`);

        return;
    }

    const image =
        enggDrawingExport.renderImage(
            drawingState,
            drawnBoundsPoints(),
            {
                width: enggDrawingExport.DEFAULT_OUTPUT_PX,

                /*
                 * JPG has no transparency, so it is laid down on
                 * white. PNG is left transparent outside the
                 * drawing, which is the more useful of the two for
                 * a line drawing.
                 */
                background:
                    format.id === "jpg"
                        ? "#ffffff"
                        : null
            }
        );

    if (!image) {
        setToolMessage(
            "Could not export that drawing"
        );

        return;
    }

    /*
     * The SVG the render produced is the source of the raster, so
     * the image is the same drawing rather than a second rendering
     * of it that might differ.
     */
    const dataUrl =
        new XMLSerializer()
            .serializeToString(image.svg);

    const encoded =
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dataUrl)}`;

    const raster =
        new Image();

    raster.onload = () => {
        image.context.drawImage(
            raster,
            0,
            0,
            image.canvas.width,
            image.canvas.height
        );

        image.canvas.toBlob(
            (blob) => {
                if (!blob) {
                    setToolMessage(
                        "Could not export that drawing"
                    );

                    return;
                }

                downloadBlob(
                    blob,
                    `${name}.${format.id}`
                );

                setToolMessage(
                    `Exported ${name}.${format.id}`
                );
            },
            format.id === "jpg"
                ? "image/jpeg"
                : "image/png",
            0.92
        );
    };

    raster.src = encoded;
}

/*
 * Print the drawing.
 *
 * Print uses the same clean render as the image exports, for the
 * same reasons: the printed page must contain the DRAWING, not a
 * photograph of the application. The browser's own print dialog is
 * then given an image that has already been fitted to the drawing's
 * bounds, so what comes out cannot be cropped by the current zoom
 * or by the size of the editor window.
 */
function printDrawing() {
    if (
        !drawingState.objects.length
    ) {
        setToolMessage(
            "There is nothing to print"
        );

        return;
    }

    const image =
        enggDrawingExport.renderImage(
            drawingState,
            drawnBoundsPoints(),
            {
                width: enggDrawingExport.DEFAULT_OUTPUT_PX,
                background: "#ffffff"
            }
        );

    if (!image) {
        return;
    }

    const dataUrl =
        image.canvas.toDataURL(
            "image/png"
        );

    /*
     * A window holding only the rendered drawing. It is opened with
     * no toolbars or chrome, and its document is the image, so the
     * system print dialog describes a page containing the drawing
     * alone. The editor is untouched behind it and the window
     * closes itself once printing is done.
     */
    const printWindow =
        window.open("", "_blank");

    if (!printWindow) {
        setToolMessage(
            "Allow pop-ups to print the drawing"
        );

        return;
    }

    printWindow.document.write(
        `<!DOCTYPE html><html><head><title>Print</title>` +
        `<style>` +
        `html,body{margin:0;padding:0;background:#fff;}` +
        `img{display:block;width:100%;height:auto;}` +
        `@page{margin:10mm;}` +
        `</style></head><body>` +
        `<img src="${dataUrl}" alt="Drawing">` +
        `</body></html>`
    );

    printWindow.document.close();

    /*
     * The image has to be laid out before print is called, or the
     * page is still empty when the dialog reads it.
     */
    printWindow.addEventListener("load", () => {
        printWindow.focus();
        printWindow.print();
    });

    setToolMessage(
        "Prepared the drawing for printing"
    );
}

function downloadBlob(
    blob,
    fileName
) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

/*
 * Export the drawing as SVG, which keeps it as vectors.
 *
 * The drawing's own renderer already produces SVG, so this is the
 * clean render with the editor's layout styling stripped out. An
 * SVG export is for placing the drawing in other software; the
 * .enggdraw file remains the editable original.
 */
function exportSvg(fileName) {
    const bounds =
        enggDrawingExport.paddedBounds(
            drawnBoundsPoints(),
            enggDrawingExport.DEFAULT_OUTPUT_PX,
            enggDrawingExport.DEFAULT_OUTPUT_PX
        );

    if (!bounds) {
        setToolMessage(
            "There is nothing to export"
        );

        return;
    }

    const svg =
        enggDrawingExport.renderClean(
            drawingState,
            bounds
        );

    if (!svg) {
        return;
    }

    const clone = svg.cloneNode(true);

    /*
     * The render carries the editor's own classes and any styling
     * they depend on. A standalone file cannot rely on that CSS, so
     * the presentation attributes the renderer already set are kept
     * and the class-based styling is not carried across.
     */
    downloadBlob(
        new Blob(
            [
                '<?xml version="1.0" encoding="UTF-8"?>\n',
                new XMLSerializer().serializeToString(clone)
            ],
            { type: "image/svg+xml" }
        ),
        fileName
    );

    setToolMessage(
        `Exported ${fileName}`
    );
}

/*
 * Save the drawing.
 *
 * Where the browser gave us a handle to a file, this writes straight
 * back to it: no panel, no name, and no way for the document to end up
 * in two places. Where it has not - a document that has never been
 * saved, or a browser without the handle API - the Save As flow runs
 * instead, because there is nothing to write back to.
 */
async function saveDrawing() {
    const saved =
        await enggFileSave.save(
            serializeDocumentBody(),
            suggestedFileName()
        );

    if (!saved) {
        /*
         * Nowhere to save back to. Save As is not a lesser thing
         * here - it is the only thing that can happen - so it is run
         * rather than reported.
         */
        await saveDrawingAs();

        return;
    }

    documentFileName = saved;

    markDocumentClean();

    setToolMessage(`Saved ${saved}`);
}

/*
 * Save to a chosen name and location.
 *
 * The name and the folder are the user's to choose, and the panel that
 * offers them is the operating system's own, so this behaves the way
 * saving from any other application does.
 *
 * The document's identity changes only once the file has actually been
 * written. Cancelling the panel, or a disk that refuses, leaves the
 * document as it was - still unsaved, still pointing at whatever file
 * it had. Adopting the new name first would let a cancelled Save As
 * quietly relabel the document, and the next Save would then go
 * somewhere the user never chose.
 */
async function saveDrawingAs() {
    const saved =
        await enggFileSave.saveAs(
            serializeDocumentBody(),
            suggestedFileName()
        );

    if (!saved) {
        return;
    }

    documentFileName = saved;

    markDocumentClean();

    setToolMessage(`Saved ${saved}`);
}

/*
 * The name offered by the save panel.
 *
 * The current file's own name when the document has one, so that Save
 * As starts where the document already lives rather than at a generic
 * default. Saving a correction should suggest the file being
 * corrected, not "drawing".
 */
function suggestedFileName() {
    return enggDocumentFile.withExtension(
        documentFileName || "drawing"
    );
}

/*
 * Open a .enggdraw file.
 *
 * Reading is separated from applying on purpose. The format module
 * decides whether a file can be opened and, if so, what it should
 * become; only once it has answered both does anything here touch
 * the live document. That is what makes a bad file harmless: a
 * file that is not a drawing, or is from a newer build, or is
 * corrupt, is refused BEFORE the open document has been touched, so
 * the drawing the user already has is still there afterwards.
 *
 * Loading then goes through the same state model as a drawing built
 * in this session, so every feature comes back as its real type with
 * its real parameters, and the Feature Tree, Features panel, snapping
 * and manipulation all work on it without any special handling.
 */
function loadDrawing(
    payload,
    fileName
) {
    const result =
        enggDocumentFile.readDocument(
            payload
        );

    if (!result.ok) {
        /*
         * The reason is shown rather than a generic failure,
         * because the user's next action depends entirely on which
         * of these it is: a wrong file needs choosing again, an old
         * one needs a different tool, and a future one needs a newer
         * EnggDraw.
         */
        setToolMessage(
            result.detail
        );

        window.alert(
            result.detail
        );

        return false;
    }

    const data = result.document;

    if (
        !Array.isArray(data.objects) &&
        !Array.isArray(data.sheets)
    ) {
        const detail =
            "The file is an EnggDraw drawing but " +
            "contains no features.";

        setToolMessage(detail);
        window.alert(detail);

        return false;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * The document's own settings, not just its features. Units and
     * calibration travel with the drawing because a length in a file
     * means nothing without them.
     *
     * Applied to the state, not to the collection: these are settings
     * of the whole document - the unit every length on every sheet is
     * in - rather than of any one drawing.
     */
    enggDrawingState.restoreDocument(
        drawingState,
        data
    );

    /*
     * The sheets. This REPLACES the collection rather than merging
     * into it, because opening a file is opening a document: whatever
     * was open before is not part of this one. The format module has
     * already repaired the list - a file always arrives with at least
     * one sheet and with unique ids - so what is loaded here can be
     * trusted without further checking.
     */
    sheetCollection =
        enggSheets.createCollection({
            sheets: data.sheets,
            activeSheetId: data.activeSheetId
        });

    /*
     * The sheet the user was last on goes into the editor, and it is
     * that sheet - not the document - that decides what the editor
     * shows: its features, its camera, its grid, its snapping.
     *
     * Reopening a file therefore puts the student back exactly where
     * they were, at the zoom they were working at, with the grid in
     * the state they had set on that particular sheet.
     */
    loadSheetIntoEditor(activeSheet());

    /*
     * MAKE THE ANALYSIS OBJECTS TRUE AGAIN, RATHER THAN TRUSTING
     * WHAT WAS SAVED.
     *
     * The dependencies are saved - which source each object reads
     * from - but the geometry derived FROM them is not, and must not
     * be: a saved components arrow is a snapshot of what a force
     * looked like once, and reloading it blindly would show a drawing
     * whose analysis objects quietly describe forces that have since
     * been edited. So the associations are restored from the file and
     * the values are recomputed from the sources as they are now.
     *
     * This is the difference between an analysis object being a
     * reading and being a copy, and it is why opening a file cannot
     * produce a diagram that disagrees with the beam above it.
     */
    enggDrawingState.refreshAnalysisObjects(
        drawingState
    );

    syncWorkspaceSettingToggles();

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    /*
     * An opened document is clean: it matches the file it came from.
     * A migrated file is also clean, because what was written and
     * what is now open describe the same drawing.
     */
    if (fileName) {
        documentFileName =
            enggDocumentFile.withExtension(
                fileName
            );
    }

    markDocumentClean();

    refreshSheetTabs();

    notifyReferences();

    setToolMessage(
        result.migratedFrom &&
        result.migratedFrom !==
            enggDocumentFile.CURRENT_VERSION
            ? `Opened ${documentFileName || "drawing"} (upgraded from version ${result.migratedFrom})`
            : `Opened ${documentFileName || "drawing"}`
    );

    renderProperties();
    renderCurrentDrawing();

    return true;
}

/*
 * Choose a .enggdraw file and open it.
 *
 * The file is read and validated before anything is applied, so a
 * file that cannot be opened leaves the current drawing untouched -
 * see loadDrawing, which is where that guarantee is made.
 */
function openDrawing() {
    const input =
        document.createElement("input");

    input.type = "file";
    input.accept = `.${enggDocumentFile.EXTENSION},${enggDocumentFile.MEDIA_TYPE},application/json`;

    input.addEventListener("change", () => {
        const file =
            input.files && input.files[0];

        if (!file) {
            return;
        }

        /*
         * Opening replaces the current drawing, so it asks
         * about unsaved changes first - before the file is even
         * read, so a file that then turns out to be unreadable
         * has cost the user nothing.
         */
        if (
            !confirmDiscardUnsavedChanges(
                () => {}
            )
        ) {
            input.value = "";

            return;
        }

        /*
         * Opened through showOpenFilePicker where the browser has it.
         *
         * The picker returns a handle as well as the file, and the
         * handle is kept: it is how a later Save writes back to the
         * file that was opened rather than producing a copy. The
         * input-element route below is the fallback for browsers
         * without it, and there a handle genuinely does not exist, so
         * Save falls back to asking - which is the honest behaviour
         * rather than a hidden failure.
         */
        if (
            typeof window.showOpenFilePicker ===
            "function"
        ) {
            window
                .showOpenFilePicker({
                    types: [
                        enggFileSave.fileTypes()
                    ],
                    multiple: false
                })
                .then(async (handles) => {
                    const handle = handles[0];

                    if (!handle) {
                        return;
                    }

                    const opened =
                        await handle.getFile();

                    const text =
                        await opened.text();

                    let parsed = null;

                    try {
                        parsed =
                            JSON.parse(text);
                    } catch (error) {
                        setToolMessage(
                            "That file could not be " +
                            "read. It may be damaged, " +
                            "or it may not be an " +
                            "EnggDraw drawing."
                        );

                        return;
                    }

                    if (
                        loadDrawing(
                            parsed,
                            opened.name
                        )
                    ) {
                        enggFileSave.setFileHandle(
                            handle,
                            opened.name
                        );
                    }
                })
                .catch(() => {
                    /*
                     * Cancelled. The current drawing is untouched,
                     * which is what closing a panel should mean.
                     */
                });

            return;
        }

        const reader =
            new FileReader();

        reader.addEventListener("load", () => {
            let parsed = null;

            try {
                parsed = JSON.parse(
                    String(reader.result)
                );
            } catch (error) {
                const detail =
                    "That file could not be read. " +
                    "It may be damaged, or it may not " +
                    "be an EnggDraw drawing.";

                setToolMessage(detail);
                window.alert(detail);

                return;
            }

            loadDrawing(parsed, file.name);
        });

        reader.readAsText(file);
    });

    input.click();
}

/*
 * The File menu's actions, in one place.
 *
 * The menu and the keyboard shortcuts both go through this table, so
 * a command cannot exist on the menu and behave differently from the
 * same key. It also means adding a file command is a single entry
 * rather than a button and a handler that have to be kept in step.
 */
const FILE_ACTIONS = {
  new() {
    /*
     * Both the menu and the shortcut go through the unsaved-changes
     * guard, so New always offers to save first.
     */
    confirmDiscardUnsavedChanges(newDrawing);
  },
  open() {
    openDrawing();
  },
  save() {
    saveDrawing();
  },
  "save-as"() {
    saveDrawingAs();
  },
  export() {
    openExportMenu();
  },
  print() {
    printDrawing();
  }
};

/*
 * Offer the user a recovery copy, if there is one worth offering.
 *
 * Asked once, when the drawing workspace opens, and only when there
 * is genuinely something to rescue. Declining discards it, so a
 * user who does not want it is not asked again next time - and, just
 * as importantly, a stale copy of a drawing they have since finished
 * does not reappear as a warning weeks later.
 */
function offerRecoveryIfAvailable() {
    const record =
        enggRecovery.describe();

    if (!record) {
        return false;
    }

    const features =
        record.features === 1
            ? "1 feature"
            : `${record.features} features`;

    const when =
        record.when
            ? `\n\nLast edited ${record.when}`
            : "";

    const answer = window.confirm(
        "EnggDraw found unsaved work from a previous " +
        `session (${features})${when}.\n\n` +
        "Recover it?"
    );

    if (!answer) {
        enggRecovery.discard();

        return false;
    }

    /*
     * Recovery goes through the same loader as opening a file, so
     * what comes back is a real document rather than a special
     * half-restored state.
     */
    const stored = enggRecovery.read();

    if (!stored) {
        return false;
    }

    return loadDrawing(
        {
            /*
             * The stored copy is already a document body. It is
             * wrapped in the same envelope a file carries and read
             * back through the same loader, so a recovered drawing
             * is version-checked and migrated exactly as an opened
             * file would be - there is no second, less careful path
             * for recovered work.
             */
            format: "enggdraw",
            version: enggDocumentFile.CURRENT_VERSION,
            document: stored.document
        },
        stored.fileName || undefined
    );
}

document
  .querySelectorAll("[data-file-action]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const action =
        FILE_ACTIONS[button.dataset.fileAction];

      if (action) {
        action();
      }
    });
  });

if (drawingFileNew) {
    drawingFileNew.addEventListener(
        "click",
        newDrawing
    );
}

if (drawingFileSave) {
    drawingFileSave.addEventListener(
        "click",
        saveDrawing
    );
}

if (drawingFileOpen) {
    drawingFileOpen.addEventListener(
        "click",
        openDrawing
    );
}

if (
    drawingThickness
) {
    drawingThickness.addEventListener(
        "change",
        applyStyleControls
    );
}

if (
    drawingColor
) {
    drawingColor.addEventListener(
        "change",
        applyStyleControls
    );

    /*
     * Build the CAD colour control around the existing
     * native colour input.
     */
    setupColourControl();
}

if (
    drawingLineType
) {
    drawingLineType.addEventListener(
        "change",
        applyStyleControls
    );
}

if (
    drawingZoomOut
) {
    drawingZoomOut.addEventListener(
        "click",
        () =>
            updateDrawingZoom(
                drawingZoom - 10
            )
    );
}

/*
 * The zoom percentage FIELD accepts a typed value.
 *
 * It has always displayed the zoom, and it has always looked like an
 * input, so leaving it inert was misleading: a field that invites a
 * number and ignores it is worse than a plain label. The value goes
 * through the same updateDrawingZoom the buttons use, so it is clamped
 * and normalised identically and cannot produce a zoom the buttons
 * could not.
 *
 * The text is reset on blur as well as on Enter, because an entry that
 * is not accepted must not be left sitting in the field looking like
 * the current zoom.
 */
function applyTypedZoom() {
    const typed =
        Number(
            String(
                drawingZoomValue.value
            ).replace("%", "").trim()
        );

    if (!Number.isFinite(typed) || typed <= 0) {
        return;
    }

    updateDrawingZoom(typed);
}

if (
    drawingZoomValue
) {
    drawingZoomValue.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyTypedZoom();
                drawingZoomValue.blur();

                return;
            }

            if (event.key === "Escape") {
                drawingZoomValue.value =
                    `${Math.round(drawingZoom)}%`;

                drawingZoomValue.blur();
            }
        }
    );

    drawingZoomValue.addEventListener(
        "blur",
        () => {
            drawingZoomValue.value =
                `${Math.round(drawingZoom)}%`;
        }
    );

    drawingZoomValue.addEventListener(
        "focus",
        () =>
            drawingZoomValue.select()
    );
}

/*
 * ========================================================
 * COLLAPSIBLE SIDE PANELS
 * ========================================================
 *
 * The tool panel and the Features panel can each be folded away,
 * so a student on a small screen can hand their horizontal space
 * to the drawing. The canvas is what the work is on; the panels
 * are navigation, and on a laptop they are the first thing worth
 * sacrificing.
 *
 * WHAT COLLAPSING DOES AND DOES NOT DO
 * ------------------------------------
 * It changes the LAYOUT and nothing else. The rail's width
 * changes, the grid's flexible canvas column takes up the
 * difference, and the drawing is re-rendered into a larger or
 * smaller viewport at exactly the zoom, pan and scale it already
 * had. Nothing here calls the zoom, and nothing here touches a
 * document value.
 *
 * That distinction is the whole reason this is not implemented as
 * a browser zoom or a CSS transform. A drawing that is 150% zoomed
 * stays 150%: it simply shows more of itself when a panel closes
 * and less when one opens. The viewport is measured from the
 * canvas element itself on every render, so this needs no
 * adjustment at all - only a redraw.
 *
 * A re-fit or a re-zoom here would be the obvious way to make the
 * canvas "fill" the new space, and it would be wrong: it would
 * move the student's drawing out from under them, change the zoom
 * they are working at, and make the panels feel like they had
 * changed the document.
 */
function setPanelCollapsed(
    toggle,
    rail,
    collapsed
) {
    if (!toggle || !rail) {
        return;
    }

    rail.classList.toggle(
        "drawing-panel-rail-collapsed",
        collapsed
    );

    /*
     * The grid TRACK is what actually reclaims the space.
     *
     * Narrowing the rail element alone would not do it: the rail
     * sits in a fixed 148px column, so a 22px element inside a
     * 148px track leaves the other 126px claimed by nothing. The
     * canvas column is the only flexible one, so the track has to
     * shrink for the drawing to grow.
     *
     * The workspace's own column template is therefore rewritten,
     * and it is written from the CURRENT state of both rails
     * rather than from this one toggle. A pair of independent
     * class toggles on two separate elements can disagree - one
     * collapsed while the other says otherwise - and the canvas
     * would then be laid out against a template describing a
     * state that does not exist.
     */
    syncWorkspaceColumns();

    /*
     * The arrow names the ACTION, not the state, and points the
     * way it will move. A control that describes where it is
     * rather than what it does is one more thing to work out, and
     * this one is a twenty-pixel strip.
     */
    toggle.setAttribute(
        "aria-expanded",
        collapsed
            ? "false"
            : "true"
    );

    const panelId =
        toggle.getAttribute(
            "aria-controls"
        );

    const panel = panelId
        ? document.getElementById(panelId)
        : null;

    if (panel) {
        panel.hidden = collapsed;
    }

    toggle.title = collapsed
        ? "Show panel"
        : "Hide panel";

    /*
     * The caption names the ACTION, not the state.
     *
     * When the panel is open the strip reads HIDE, because that is
     * what pressing it does. When the panel is closed the strip
     * takes the panel's own name - FEATURES or TOOLS - because at
     * that point the name is the only thing on the strip that
     * tells the student what pressing it will bring back.
     *
     * A control that labelled itself with the current state would
     * need the student to read it twice to work out which way it
     * goes; naming the action means the strip is legible on its
     * own, whether it is a twenty-pixel rail in the expanded
     * state or the only thing left of a collapsed panel.
     */
    const caption =
        toggle.querySelector(
            ".drawing-panel-toggle-text"
        );

    if (caption) {
        const panelName =
            panelId === "drawingFeaturesPanel"
                ? "FEATURES"
                : "TOOLS";

        caption.textContent = collapsed
            ? panelName
            : "HIDE";
    }

    toggle.querySelector("svg")?.setAttribute(
        "transform",
        collapsed
            ? collapsedArrowTransform(toggle)
            : "rotate(0)"
    );

    /*
     * Redraw only. The zoom, the pan and the document scale are
     * all deliberately left exactly as they are - see the note
     * above. A single render picks up the new canvas size.
     */
    renderCurrentDrawing();
}

function collapsedArrowTransform(
    toggle
) {
    return toggle.closest(
        ".drawing-panel-rail-right"
    )
        ? "rotate(180)"
        : "rotate(0)";
}

/*
 * Re-derive the workspace's column template from the current
 * panel state.
 *
 * One place decides the layout, called after every change, so the
 * template and the two rails cannot fall out of step.
 */
function syncWorkspaceColumns() {
    const workspace =
        document.querySelector(
            ".drawing-workspace"
        );

    if (!workspace) {
        return;
    }

    const toolsCollapsed =
        document
            .querySelector(
                ".drawing-panel-rail-left"
            )
            ?.classList.contains(
                "drawing-panel-rail-collapsed"
            ) ?? false;

    const featuresCollapsed =
        document
            .querySelector(
                ".drawing-panel-rail-right"
            )
            ?.classList.contains(
                "drawing-panel-rail-collapsed"
            ) ?? false;

    workspace.classList.toggle(
        "drawing-workspace-tools-collapsed",
        toolsCollapsed
    );

    workspace.classList.toggle(
        "drawing-workspace-features-collapsed",
        featuresCollapsed
    );
}

if (
    drawingToolPanelToggle
) {
    const rail =
        drawingToolPanelToggle.closest(
            ".drawing-panel-rail"
        );

    drawingToolPanelToggle.addEventListener(
        "click",
        () =>
            setPanelCollapsed(
                drawingToolPanelToggle,
                rail,
                !rail.classList.contains(
                    "drawing-panel-rail-collapsed"
                )
            )
    );
}

if (
    drawingFeaturesPanelToggle
) {
    const rail =
        drawingFeaturesPanelToggle.closest(
            ".drawing-panel-rail"
        );

    drawingFeaturesPanelToggle.addEventListener(
        "click",
        () =>
            setPanelCollapsed(
                drawingFeaturesPanelToggle,
                rail,
                !rail.classList.contains(
                    "drawing-panel-rail-collapsed"
                )
            )
    );
}

if (
    drawingZoomIn
) {
    drawingZoomIn.addEventListener(
        "click",
        () =>
            updateDrawingZoom(
                drawingZoom + 10
            )
    );
}

if (
    drawingCanvas
) {
    drawingCanvas.addEventListener(
        "mousemove",
        updateDrawingCoordinates
    );

    drawingCanvas.addEventListener(
        "click",
        handleCanvasClick
    );

    drawingCanvas.addEventListener(
        "dblclick",
        event => {
            /*
             * A DIMENSION OR ANNOTATION EDITS ITSELF.
             *
             * Checked FIRST, and ahead of every other double-click
             * rule, for two reasons.
             *
             * It is the right behaviour: a double-click is the
             * application's "open this" gesture, and a dimension's
             * editor should be reachable by double-clicking the
             * dimension itself rather than by hunting through the
             * Features panel.
             *
             * And it is a guard. Double-clicks on the canvas were
             * reaching tool-specific rules - finishing a polyline,
             * finishing a truss - and a dimension under the cursor
             * could draw one of those in instead of doing what was
             * asked. Routing dimensions to their own handler, and
             * stopping the event there, means no later rule can
             * reinterpret a double-click that landed on one.
             *
             * Only while nothing is being constructed: a double-click
             * during a live construction belongs to that construction.
             */
            if (
                event.detail > 1 &&
                isIdleForEditing()
            ) {
                const pointed =
                    objectAtPoint(
                        canvasPointFromEvent(
                            event,
                            false
                        )
                    );

                /*
                 * A DIMENSION MUST ALREADY BE SELECTED.
                 *
                 * Selecting it and editing it are two different
                 * acts, and the second one has to be asked for
                 * separately. A dimension is a thing you place
                 * and then push around the drawing until it sits
                 * somewhere legible, so almost every interaction
                 * with one is a click, a click-drag, or a
                 * double-click that was really two slow clicks.
                 *
                 * Opening the editor from any of those would make
                 * the drawing unusable: the student could not
                 * select a dimension, could not nudge it into
                 * position, and could not click near it without a
                 * dialog appearing. So the editor needs the one
                 * gesture that cannot be confused with any of
                 * them - a double-click on something already
                 * selected.
                 *
                 * Being already selected is also the honest
                 * signal. It says the student has finished
                 * placing this dimension and is now working ON
                 * it, rather than still putting it there.
                 *
                 * A click on an UNSELECTED dimension therefore
                 * only selects it, exactly as a click on any
                 * other feature does, and the second double-click
                 * opens the editor.
                 */
                if (
                    pointed?.type === "dimension" &&
                    !drawingState.selection
                        .selectedObjectIds.includes(
                            pointed.id
                        )
                ) {
                    /*
                     * Deliberately NOT stopping the event. The
                     * click that selected the dimension has
                     * done its job, and letting the first click
                     * of the pair stand as an ordinary selection
                     * is what makes the second one meaningful.
                     */
                    return;
                }

                if (
                    pointed?.type === "dimension" ||
                    pointed?.type === "annotation"
                ) {
                    event.preventDefault();
                    event.stopPropagation();

                    if (pointed.type === "dimension") {
                        openDimensionEditorFor(pointed);
                    }

                    return;
                }
            }

            if (
                drawingState.activeTool ===
                    "polyline"
            ) {
                event.preventDefault();

                finishPolyline();
                return;
            }

            /*
             * A truss is finished by double-clicking, which is
             * the only explicit "I am done" a progressive
             * construction needs. The click that precedes it has
             * already placed the last member, so by the time the
             * double-click arrives there is nothing left to
             * discard.
             */
            if (
                drawingState.activeTool ===
                    "truss" &&
                drawingState.interaction
                    .phase ===
                    "truss-construct"
            ) {
                event.preventDefault();

                finishTrussConstruction();
                return;
            }

            /*
             * The Distributed Load is also finished explicitly,
             * and with Enter rather than a double-click, because a
             * double-click is two more points along the body. The
             * guard is here as well so a stray double-click
             * during construction never commits a half-drawn
             * load.
             */
            if (
                drawingState.interaction
                    .phase ===
                    "distributed-load-build" &&
                !drawingState.interaction
                    .distributedLoadHasProfile
            ) {
                return;
            }
        }
    );

    /*
     * Direct manipulation takes priority over box
     * selection: a press on a handle or on the body of a
     * selected object starts a geometry drag, otherwise
     * the press falls through to box selection.
     */
    drawingCanvas.addEventListener(
        "pointerdown",
        event => {
            /*
             * An armed eyedropper pre-empts every other
             * canvas interaction, so it works no matter
             * which tool happens to be active.
             */
            if (eyedropperActive) {
                event.preventDefault();
                event.stopPropagation();

                pickColourFromFeature(
                    event
                );

                return;
            }

            if (
                beginManipulationDrag(
                    event
                )
            ) {
                return;
            }

            beginSelectionDrag(
                event
            );
        }
    );

    drawingCanvas.addEventListener(
        "pointermove",
        event => {
            if (manipulationDrag) {
                updateManipulationDrag(
                    event
                );

                return;
            }

            updateSelectionDrag(
                event
            );
        }
    );

    drawingCanvas.addEventListener(
        "pointerup",
        event => {
            if (manipulationDrag) {
                finishManipulationDrag(
                    event
                );

                return;
            }

            finishSelectionDrag(
                event
            );
        }
    );

    drawingCanvas.addEventListener(
        "wheel",
        event => {
            event.preventDefault();

            zoomAtCanvasPoint(
                drawingState.camera.zoom *
                    (
                        event.deltaY < 0
                            ? 1.1
                            : 0.9
                    ),
                event
            );
        },
        {
            passive: false
        }
    );

    drawingCanvas.addEventListener(
        "pointerdown",
        event => {
            if (
                drawingState.activeTool !==
                "pan"
            ) {
                return;
            }

            drawingCanvas.setPointerCapture(
                event.pointerId
            );

            panSession = {
                x:
                    event.clientX,

                y:
                    event.clientY
            };

            setToolMessage(
                "Pan view"
            );
        }
    );

    drawingCanvas.addEventListener(
        "pointermove",
        event => {
            if (!panSession) {
                return;
            }

            const deltaX =
                event.clientX -
                panSession.x;

            const deltaY =
                event.clientY -
                panSession.y;

            const scale =
                enggDrawingState.BASE_PIXELS_PER_UNIT *
                drawingState.camera.zoom;

            enggDrawingState.panCamera(
                drawingState,

                drawingState.camera.panX -
                    deltaX /
                    scale,

                drawingState.camera.panY +
                    deltaY /
                    scale
            );

            panSession = {
                x:
                    event.clientX,

                y:
                    event.clientY
            };

            renderCurrentDrawing();
        }
    );

    drawingCanvas.addEventListener(
        "pointerup",
        event => {
            /*
             * This handler only manages panning. It must
             * not overwrite the status message when no pan
             * was in progress, otherwise a completed drag
             * or Modify step would be replaced by a stale
             * instruction.
             */
            if (!panSession) {
                return;
            }

            if (
                drawingCanvas.hasPointerCapture(
                    event.pointerId
                )
            ) {
                drawingCanvas.releasePointerCapture(
                    event.pointerId
                );
            }

            panSession = null;

            setToolMessage(
                drawingState.activeTool ===
                    "coordinate-system-2d"
                    ? "Specify origin"

                    : drawingState.activeTool ===
                        "line"
                        ? "Specify line start point"

                    : "Ready"
            );
        }
    );

    drawingCanvas.addEventListener(
        "mouseleave",
        () => {
            drawingCoordinates.textContent =
                "X: 0.0 Y: 0.0 mm";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    snapCandidate:
                        null,

                    inference:
                        null
                }
            );

            syncSelectionInteraction();

            renderCurrentDrawing();
        }
    );
}

document.addEventListener(
    "pointerdown",
    event => {
        if (
            !coordinateSystemMenu
        ) {
            return;
        }

        const clickedMenu =
            coordinateSystemMenu.contains(
                event.target
            );

        const clickedAnchor =
            coordinateSystemMenuAnchor?.contains(
                event.target
            );

        if (
            !clickedMenu &&
            !clickedAnchor
        ) {
            closeCoordinateSystemMenu();
        }
    }
);

window.addEventListener(
    "resize",
    closeCoordinateSystemMenu
);

/*
 * Clicking anywhere outside the drawing canvas cancels
 * the active tool.
 *
 * The click still reaches its own target, so the user
 * can click another toolbar button and have that tool
 * activate normally; this only guarantees the previous
 * tool does not stay running behind it.
 */
document.addEventListener(
    "pointerdown",
    event => {
        /*
         * Nothing to do when no tool is running.
         */
        if (
            !modifySession &&
            !activeGlobalTool &&
            !isConstructionTool(
                drawingState.activeTool
            )
        ) {
            return;
        }

        const target =
            event.target;

        /*
         * Clicks on the canvas are the tool's own input,
         * so they are left alone.
         */
        if (
            drawingCanvas.contains(
                target
            )
        ) {
            return;
        }

        /*
         * Clicks on a toolbar or panel button are handled
         * by that button, which activates its own tool and
         * cancels this one.
         */
        if (
            target.closest &&
            target.closest("button")
        ) {
            return;
        }

        /*
         * Clicks inside the Features panel or a popup are
         * part of the operation, not a cancellation.
         */
        if (
            drawingProperties.contains(
                target
            ) ||
            target.closest?.(
                ".drawing-polygon-prompt"
            )
        ) {
            return;
        }

        cancelInteraction();
    }
);

window.addEventListener(
    "scroll",
    closeCoordinateSystemMenu,
    true
);

document.addEventListener(
    "keydown",
    event => {
        const activeElement =
            document.activeElement;

        const editable =
            [
                "INPUT",
                "TEXTAREA",
                "SELECT"
            ].includes(
                activeElement?.tagName
            ) ||
            activeElement?.isContentEditable;

        if (
            !editable &&
            event.ctrlKey &&
            event.key.toLowerCase() ===
                "z"
        ) {
            event.preventDefault();

            if (
                event.shiftKey
            ) {
                performRedo();
            } else {
                performUndo();
            }

            return;
        }

        if (
            !editable &&
            event.ctrlKey &&
            event.key.toLowerCase() ===
                "y"
        ) {
            event.preventDefault();

            performRedo();

            return;
        }

        /*
         * Copy, paste and cut.
         *
         * They act on whatever is selected, through the same
         * selection the rest of the drawing uses, and they are
         * refused while a panel field has focus so typing a
         * value is never mistaken for a command.
         *
         * They are handled before the tool shortcuts, so a
         * construction in progress cannot swallow them, and a
         * half-finished shape is never cut in half by a stray
         * keypress.
         */
        if (
            !editable &&
            event.ctrlKey &&
            drawingState.interaction.phase ===
                "idle"
        ) {
            const key =
                event.key.toLowerCase();

            if (key === "c") {
                event.preventDefault();

                if (copySelectionToClipboard()) {
                    const count =
                        drawingClipboard
                            .features.length;

                    setToolMessage(
                        count === 1
                            ? "Copied 1 feature"
                            : `Copied ${count} features`
                    );
                }

                return;
            }

            if (key === "v") {
                event.preventDefault();

                pasteFromClipboard();

                return;
            }

            if (key === "x") {
                event.preventDefault();

                cutSelectionToClipboard();

                return;
            }
        }

        /*
         * File shortcuts.
         *
         * These are the conventional bindings, and they are handled
         * before the tool shortcuts for the same reason the clipboard
         * ones are: a construction in progress must never swallow a
         * file command, and Ctrl+S in the middle of drawing a beam
         * should save the drawing rather than do nothing.
         *
         * They are refused while a field has focus, for the same
         * reason: a user typing "s" into a name field must not
         * trigger a save.
         *
         * Print and Open are deliberately NOT bound to a bare
         * Ctrl+P / Ctrl+O here. Both are intercepted by the browser
         * itself before this handler ever sees them, and a shortcut
         * that sometimes works and sometimes opens the browser's own
         * dialog is worse than one the user reaches through the
         * menu. They are bound to combinations the browser does not
         * claim, and both are on the File menu.
         */
        if (!editable && event.ctrlKey) {
            const key =
                event.key.toLowerCase();

            if (key === "s") {
                event.preventDefault();

                if (event.shiftKey) {
                    FILE_ACTIONS["save-as"]();
                } else {
                    FILE_ACTIONS.save();
                }

                return;
            }

            if (key === "n") {
                event.preventDefault();

                FILE_ACTIONS.new();

                return;
            }

            if (key === "e" && event.shiftKey) {
                event.preventDefault();

                FILE_ACTIONS.export();

                return;
            }

            if (key === "p" && event.shiftKey) {
                event.preventDefault();

                FILE_ACTIONS.print();

                return;
            }
        }

        /*
         * Ctrl+0 is the CAD convention for fitting the drawing,
         * and it is the one view shortcut worth having by muscle
         * memory: it is the key a user reaches for when a zoom
         * has lost the drawing.
         *
         * It is bound to the same function as the Fit button, so
         * it cannot behave differently from what is on screen.
         */
        if (
            !editable &&
            event.ctrlKey &&
            (
                event.key === "0" ||
                    event.code === "Digit0" ||
                    event.code === "Numpad0"
            )
        ) {
            event.preventDefault();

            fitDrawingToView();

            return;
        }

        if (
            !editable &&
            event.ctrlKey &&
            event.key.toLowerCase() ===
                "a"
        ) {            event.preventDefault();

            enggDrawingState.clearInteraction(
                drawingState
            );

            drawingState.selection
                .boxSelectionIds = [];

            drawingState.selection
                .hoveredObjectId = null;

            enggDrawingState.setActiveTool(
                drawingState,
                "select"
            );

            enggDrawingState.selectObjects(
                drawingState,
                drawingState.objects.map(
                    object =>
                        object.id
                )
            );

            setToolMessage(
                "All components selected"
            );

            renderEngineeringTools(
                activeCategory()
            );

            renderProperties();
            renderCurrentDrawing();

            return;
        }

        /*
         * D changes WHAT a dimension measures.
         *
         * Handled only while a dimension is armed, so it never
         * shadows D for anything else. Tab is accepted as well because
         * cycling a choice is what Tab means everywhere else in the
         * application, and a student should not have to discover a
         * second key.
         */
        if (
            (event.key === "d" ||
                event.key === "D" ||
                event.key === "Tab") &&
            (drawingState.interaction
                .dimensionRefs?.length ||
                drawingState.interaction
                    .annotationKind)
        ) {
            event.preventDefault();

            if (
                drawingState.interaction
                    .annotationKind
            ) {
                cycleAnnotationKind();
            } else {
                cycleDimensionChoice();
            }

            return;
        }

        if (
            event.key ===
            "Escape"
        ) {
            event.preventDefault();

            closeCoordinateSystemMenu();

            /*
             * A truss in progress is the one operation that is
             * explicitly reversible mid-way: Esc throws the
             * whole construction away, including the automatic
             * cleanup, so the drawing the student made before
             * pressing Enter is still what they get back.
             */
            if (
                drawingState.interaction
                    .phase ===
                    "truss-construct"
            ) {
                cancelTrussConstruction();
                return;
            }

            cancelInteraction();

            return;
        }

        /*
         * Typing wins over every shortcut.
         *
         * This is checked BEFORE anything that reacts to Enter,
         * because Enter is also the key that finishes a
         * construction and clears a selection. An annotation
         * being typed, a dimension's value being entered, a
         * sheet being renamed, a Features-panel field being
         * edited - in all of them Enter belongs to the text, and
         * a construction finishing itself mid-sentence is a
         * corruption rather than a convenience.
         *
         * The cost of this ordering is that Enter cannot finish
         * a construction while a field happens to have focus.
         * That is the right trade: the user is typing, and
         * clicking the canvas is how they hand focus back.
         */
        if (
            editable
        ) {
            return;
        }

        /*
         * Enter means "done" for anything being built.
         *
         * Previously only a truss and a distributed load
         * honoured it, so a student half-way through a polyline,
         * a polygon, a coordinate system or a distributed load
         * had no single key that said "commit this and stop".
         * Every other construction had to be finished by a
         * click on some particular spot, which meant knowing
         * where that spot was.
         *
         * So this is now one rule, not a list of rules: if a
         * construction is running and it can be completed, Enter
         * completes it and the drawing returns to its normal
         * resting state.
         *
         * The finishers are asked whether they can complete,
         * and one that cannot (a truss with too few members, a
         * polygon with no points yet) is simply left alone.
         * Refusing is better than committing something the
         * student did not mean, and better than silently
         * cancelling: nothing happens and the construction is
         * still there to carry on with.
         *
         * After that, Enter on a feature that was just created
         * and is still selected is a DESELECT. A feature stays
         * selected after it is drawn so the next click has
         * something to refer to, and that is a useful state -
         * but it means the drawing frequently opens with
         * something highlighted. Enter says "I can see it, I
         * accept it" without touching it. It never moves,
         * edits or recreates anything.
         */
        if (event.key === "Enter") {
            const finished = finishActiveConstruction();

            if (finished) {
                event.preventDefault();
                return;
            }

            if (deselectIfJustCreated()) {
                event.preventDefault();
                return;
            }
        }

        /*
         * Delete and Backspace.
         */        if (
            event.code ===
                "Delete" ||
            event.key ===
                "Delete" ||
            event.key ===
                "Backspace"
        ) {
            /*
             * Backspace deletes too, because it is the key a
             * user reaches for by habit, and refusing it while
             * Delete works makes the tool feel half-finished.
             *
             * It is only a shortcut when nothing is selected:
             * Backspace is the field-editing key, so with a
             * feature selected it deletes that, and with a value
             * being typed it is already excluded above.
             */
            if (
                event.key ===
                    "Backspace" &&
                !drawingState.selection
                    .selectedObjectIds.length
            ) {
                return;
            }

            event.preventDefault();

            deleteSelectedObjects();

            return;
        }

        const shortcut =
            event.key.toUpperCase();

        const tool =
            drawToolDefinitions.find(
                candidate =>
                    candidate.shortcut ===
                    shortcut
            );

        if (tool) {
            activateTool(
                tool.id
            );
        }
    }
);

renderEngineeringTools(
    "GEOMETRY"
);

/*
 * The workspace starts on the document's first sheet.
 *
 * The collection is created empty at startup and the sheet bar is
 * rendered from it, so a document that is later opened or recovered
 * replaces this whole set of sheets rather than adding to it.
 */
loadSheetIntoEditor(activeSheet());

syncWorkspaceSettingToggles();

refreshSheetTabs();

renderCurrentDrawing();
renderProperties();

/*
 * Offer to recover unsaved work from a previous session, once the
 * workspace is up.
 *
 * This is done here, after the first render, for two reasons: the
 * prompt has something to recover INTO, so accepting it shows the
 * recovered drawing rather than a blank canvas that then changes;
 * and it is far enough from page load that the workspace has settled
 * before a dialog interrupts it.
 */
offerRecoveryIfAvailable();