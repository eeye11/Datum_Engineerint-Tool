/*
 * THE DRAWING EDITOR.
 *
 * This module starts the editor: it installs each part's page wiring, in
 * order, and then renders the first sheet. The parts are:
 *
 *   dom.js                    The editor's DOM elements, looked up once.
 *   editor-state.js           The editor's state: the document model, and the UI state shared between editor modules.
 *   sheet-controller.js       Sheets as the editor sees them: switching, creating, renaming, reordering, deleting, and the references other parts of the app hold to them.
 *   constants.js              Constants and defaults shared across the editor.
 *   tool-menus.js             The tool list and its submenus: polygon sides, arc modes.
 *   statics-tools.js          Statics tool definitions: which tools attach to a body, how many points each takes, how each is placed, and their instructions.
 *   analysis-tools.js         Analysis tools: resultant, force components, and the SFD/BMD/AFD diagram frames.
 *   toolbar-render.js         Rendering the tool list for a toolbar category, and the status message.
 *   creation-sizing.js        Creation-time sizing: the popup that asks for a new feature's length, radius or size.
 *   tool-activation.js        Activating a tool, undo/redo, and turning pointer events into drawing coordinates.
 *   annotation-tool.js        The annotation and note tools.
 *   dimension-tool.js         The Dimension and Smart Dimension tools: choosing and committing a measurement.
 *   dimension-inference.js    Working out what a dimension click refers to, and which measurement it implies.
 *   dimension-placement.js    Placing a dimension: reference selection and the placement click.
 *   construction-tools.js     Which tools construct geometry, and when a click selects an existing feature instead.
 *   truss-tool.js             Building a truss member by member.
 *   load-tool.js              Placing distributed loads: choosing the body, the span, the magnitude and the direction.
 *   statics-creation.js       Creating a Statics feature from a completed placement.
 *   pointer.js                Resolving the pointer: snapping, inference, and the status feedback.
 *   construction-geometry.js  Geometry used while constructing: rectangles, circumcircles, angles and arcs.
 *   preview.js                The live preview while a tool is in use.
 *   geometry-creation.js      Completing geometry: polygons, points, and coordinate systems.
 *   canvas-render.js          Drawing the editor's canvas.
 *   hit-testing.js            Hit-testing: which feature is under the pointer.
 *   box-selection.js          Box selection: which features a selection rectangle touches.
 *   feature-tree.js           The Features panel's tree of components, and the analysis editors it opens.
 *   feature-panel.js          Rendering the Features panel for the current selection.
 *   triangle-panel.js         The triangle's panel: sides and angles.
 *   appearance-panel.js       The appearance section of a feature's panel.
 *   truss-optimizer.js        Truss optimisation: evening out member triangles while keeping the structure.
 *   relative-coordinates.js   Coordinates relative to a parent feature.
 *   statics-panel.js          The Statics sections of a feature's panel: vectors, annotations, supports and loads.
 *   feature-panel-markup.js   A feature's panel markup.
 *   property-inputs.js        Numeric inputs and rigid-body shape edits.
 *   property-binding.js       Wiring a feature panel's controls to the feature.
 *   triangle-editing.js       Solving a triangle from edited sides and angles.
 *   property-update.js        Applying an edited property to a feature.
 *   style-controls.js         The toolbar's thickness, colour and line-type controls.
 *   canvas-click.js           What a click on the canvas does.
 *   handles.js                Manipulation handles: which grips a feature has, and which one is under the pointer.
 *   drag.js                   Dragging a feature or one of its handles.
 *   statics-attachment.js     Attaching Statics features to bodies, and keeping them attached as bodies move.
 *   selection.js              Selection, cancelling, and finishing a construction.
 *   modify-tools.js           The Modify tools: Move, Rotate, Mirror, Trim and Extend.
 *   context-menu.js           The right-click menu on a feature.
 *   clipboard-commands.js     Copy, cut, paste and duplicate.
 *   transforms.js             Geometric transforms: mirror, rotate, trim, extend, translate.
 *   viewport.js               The viewport: fit, zoom, and workspace settings.
 *   colour-picker.js          The colour picker.
 *   delete-command.js         Deleting the selection, with its dependants.
 *   workspace-controls.js     The workspace buttons: back, grid, snap, display toggles, undo/redo, and the Modify/View tools.
 *   document-commands.js      New, Open, Save, Save As, Print and export, and crash recovery.
 *   toolbar-wiring.js         Wiring the file, style and zoom controls.
 *   workspace-layout.js       The zoom box and the collapsible side panels.
 *   canvas-events.js          Pointer events on the canvas, and closing menus on outside clicks.
 *   keyboard-shortcuts.js     Keyboard shortcuts.
 *
 * Shared state lives in editor-state.js; DOM lookups in dom.js. Each part that
 * wires itself to the page exports an install function, called below.
 */

import { renderCurrentDrawing } from "./canvas-render.js";
import { offerRecoveryIfAvailable } from "./document-commands.js";
import { renderProperties } from "./feature-panel.js";
import { activeSheet, loadSheetIntoEditor, refreshSheetTabs, syncWorkspaceSettingToggles } from "./sheet-controller.js";
import { renderEngineeringTools } from "./toolbar-render.js";

import { installSheetController } from "./sheet-controller.js";
import { installContextMenu } from "./context-menu.js";
import { installWorkspaceControls } from "./workspace-controls.js";
import { installDocumentCommands } from "./document-commands.js";
import { refreshDocumentHeader } from "./document-commands.js";
import { installDrawOrderControls } from "./draw-order.js";
import { installToolbarWiring } from "./toolbar-wiring.js";
import { installWorkspaceLayout } from "./workspace-layout.js";
import { installCanvasEvents } from "./canvas-events.js";
import { installKeyboardShortcuts } from "./keyboard-shortcuts.js";

export { enggDrawingSheets } from "./sheet-controller.js";
export { enggDrawing } from "./sheet-controller.js";
export { renderEngineeringTools } from "./toolbar-render.js";
export * as enggTransforms from "./transforms.js";

installSheetController();
installContextMenu();
installWorkspaceControls();
installDocumentCommands();
installDrawOrderControls();
installToolbarWiring();
installWorkspaceLayout();
installCanvasEvents();
installKeyboardShortcuts();

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
 * Name the document in the header from the very first frame.
 *
 * Nothing has been saved yet, so this puts "Untitled" there rather than leaving
 * an empty slot that fills in only once the user does something.
 */
refreshDocumentHeader();

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
