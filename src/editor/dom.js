/*
 * The editor's DOM elements, looked up once.
 */

export const toolHeading = document.getElementById("drawingToolHeading");

export const toolList = document.getElementById("drawingToolList");

export const drawingCanvas = document.querySelector(".drawing-canvas");

export const drawingCoordinates = document.getElementById("drawingCoordinates");

export const drawingZoomValue = document.getElementById("drawingZoomValue");

export const drawingZoomOut = document.getElementById("drawingZoomOut");

export const drawingZoomIn = document.getElementById("drawingZoomIn");

export const drawingGridToggle = document.getElementById("drawingGridToggle");

export const drawingSnapToggle = document.getElementById("drawingSnapToggle");

/*
 * THE DISPLAY SETTINGS, beside Grid and Snap.
 *
 * UNITS IS NOT ONE OF THEM.
 *
 * There used to be a `Show Units` control here, and the dimension editor had a
 * per-dimension flag behind it as well - two switches that could both produce a
 * bare `500` where the answer is `500 mm`. A unit is part of what a number
 * MEANS rather than decoration laid over it: `100` is not a force without an N
 * and `500` is not a length without an mm, so hiding one leaves the value on
 * the sheet wrong rather than plainer.
 *
 * The remaining two are visibility controls and stay: Show Dimensions hides
 * annotations the student placed without touching any measurement, and Show
 * Magnitudes does the same for force, load and moment values.
 *
 * They are read from the page rather than created here, so that the
 * toolbar owns what the toolbar shows and this module only reacts to it.
 */
export const drawingDisplayToggles = [
    {
        id: "drawingDimensionsToggle",
        key: "showDimensions"
    },
    {
        id: "drawingMagnitudesToggle",
        key: "showMagnitudes"
    }
].map(entry => ({
    ...entry,
    button: document.getElementById(entry.id)
}));

export const drawingProperties = document.getElementById("drawingProperties");

export const drawingToolMessage = document.getElementById("drawingToolMessage");

export const drawingComponentsBack = document.getElementById("drawingFeaturesBack");

export const drawingUndo = document.getElementById("drawingUndo");

export const drawingRedo = document.getElementById("drawingRedo");

export const drawingThickness = document.getElementById("drawingThickness");

export const drawingColor = document.getElementById("drawingColor");

export const drawingLineType = document.getElementById("drawingLineType");

export const drawingToolPanelToggle = document.getElementById("drawingToolPanelToggle");

export const drawingFeaturesPanelToggle = document.getElementById("drawingFeaturesPanelToggle");
