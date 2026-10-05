/*
 * CODEMOD: split the drawing controller into focused modules.
 *
 *   node tools/refactor/split-controller.mjs <controller.js> <outDir> [--dry]
 *
 * The controller is one ES module whose top-level statements fall into
 * contiguous regions by concern. LAYOUT (below) names each region by the
 * first statement in it. Every top-level statement is moved, byte for byte
 * together with the comments above it, into the module for its region, and
 * the codemod works out what each module must import and export.
 *
 * Three things cannot simply be moved:
 *
 *   - A module-level `let` used by more than one module. An imported binding
 *     is read-only, so these become properties of one shared `session`
 *     object (editor/session.js) and every reference becomes session.name.
 *     A `let` used by one module only stays where it is.
 *
 *   - Top-level statements that DO something (wire an event listener,
 *     register a callback, render). Running those while the module graph is
 *     still being evaluated depends on evaluation order, so each module's
 *     are wrapped, in their original order, in an exported install function.
 *     editor/index.js calls the installs in the original order, then runs
 *     the start-up statements.
 *
 *   - `export { x }` statements, which are recomputed.
 *
 * The run prints a report of anything that would be unsafe (a constant
 * whose initialiser reads another module's constant while modules are still
 * being evaluated) before writing.
 */
import fs from "fs";
import path from "path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import * as eslintScope from "eslint-scope";

const [inputFile, outDir, flag] = process.argv.slice(2);
const dry = flag === "--dry";

/*
 * The layout: [file, first statement, description]. The first statement is
 * a declared name, or "after:<name>" for a region that begins with the
 * first statement following that declaration.
 */
const LAYOUT = [
    ["dom.js", "toolHeading", "The editor's DOM elements, looked up once."],
    ["editor-state.js", "drawingState", "The editor's state: the document model, and the UI state shared between editor modules."],
    ["sheet-controller.js", "sheetCollection", "Sheets as the editor sees them: switching, creating, renaming, reordering, deleting, and the references other parts of the app hold to them."],
    ["constants.js", "COORDINATE_SYSTEM_TYPE", "Constants and defaults shared across the editor."],
    ["tool-menus.js", "activeCategory", "The tool list and its submenus: polygon sides, arc modes."],
    ["statics-tools.js", "STATICS_TOOL_MENUS", "Statics tool definitions: which tools attach to a body, how many points each takes, how each is placed, and their instructions."],
    ["analysis-tools.js", "STATICS_ANALYSIS_TOOLS", "Analysis tools: resultant, force components, and the SFD/BMD/AFD diagram frames."],
    ["toolbar-render.js", "renderEngineeringTools", "Rendering the tool list for a toolbar category, and the status message."],
    ["creation-sizing.js", "showSizingPreview", "Creation-time sizing: the popup that asks for a new feature's length, radius or size."],
    ["tool-activation.js", "activate2DCoordinateSystemTool", "Activating a tool, undo/redo, and turning pointer events into drawing coordinates."],
    ["annotation-tool.js", "isAnnotationTool", "The annotation and note tools."],
    ["dimension-tool.js", "isDimensionTool", "The Dimension and Smart Dimension tools: choosing and committing a measurement."],
    ["dimension-inference.js", "dimensionRefFromSnap", "Working out what a dimension click refers to, and which measurement it implies."],
    ["dimension-placement.js", "handleDimensionClick", "Placing a dimension: reference selection and the placement click."],
    ["construction-tools.js", "isConstructionTool", "Which tools construct geometry, and when a click selects an existing feature instead."],
    ["truss-tool.js", "TRUSS_STAGES", "Building a truss member by member."],
    ["load-tool.js", "DISTRIBUTED_LOAD_BODY_PICK_TOLERANCE_PX", "Placing distributed loads: choosing the body, the span, the magnitude and the direction."],
    ["statics-creation.js", "createStaticsFeature", "Creating a Statics feature from a completed placement."],
    ["pointer.js", "resolvePointerPoint", "Resolving the pointer: snapping, inference, and the status feedback."],
    ["construction-geometry.js", "distance", "Geometry used while constructing: rectangles, circumcircles, angles and arcs."],
    ["preview.js", "createPreview", "The live preview while a tool is in use."],
    ["geometry-creation.js", "polygonFromCursor", "Completing geometry: polygons, points, and coordinate systems."],
    ["canvas-render.js", "createSvgElement", "Drawing the editor's canvas."],
    ["hit-testing.js", "distanceToPolygon", "Hit-testing: which feature is under the pointer."],
    ["box-selection.js", "pointInsideSelection", "Box selection: which features a selection rectangle touches."],
    ["feature-tree.js", "objectIcon", "The Features panel's tree of components, and the analysis editors it opens."],
    ["feature-panel.js", "renderProperties", "Rendering the Features panel for the current selection."],
    ["triangle-panel.js", "triangleMeasurements", "The triangle's panel: sides and angles."],
    ["appearance-panel.js", "FEATURES_WITHOUT_A_LINE_TYPE", "The appearance section of a feature's panel."],
    ["truss-optimizer.js", "trussOptimizeMarkup", "Truss optimisation: evening out member triangles while keeping the structure."],
    ["relative-coordinates.js", "relativeParentOf", "Coordinates relative to a parent feature."],
    ["statics-panel.js", "staticsCustomScaleOpen", "The Statics sections of a feature's panel: vectors, annotations, supports and loads."],
    ["feature-panel-markup.js", "featureHeaderMarkup", "A feature's panel markup."],
    ["property-inputs.js", "enhanceNumericInputs", "Numeric inputs and rigid-body shape edits."],
    ["property-binding.js", "bindFeaturePropertyControls", "Wiring a feature panel's controls to the feature."],
    ["triangle-editing.js", "applyTriangleSidesAndAngles", "Solving a triangle from edited sides and angles."],
    ["property-update.js", "updateFeatureProperty", "Applying an edited property to a feature."],
    ["style-controls.js", "syncStyleControls", "The toolbar's thickness, colour and line-type controls."],
    ["canvas-click.js", "handleCanvasClick", "What a click on the canvas does."],
    ["handles.js", "manipulationDrag", "Manipulation handles: which grips a feature has, and which one is under the pointer."],
    ["drag.js", "beginManipulationDrag", "Dragging a feature or one of its handles."],
    ["statics-attachment.js", "isStaticsFeature", "Attaching Statics features to bodies, and keeping them attached as bodies move."],
    ["selection.js", "beginSelectionDrag", "Selection, cancelling, and finishing a construction."],
    ["modify-tools.js", "modifySession", "The Modify tools: Move, Rotate, Mirror, Trim and Extend."],
    ["context-menu.js", "featureContextMenu", "The right-click menu on a feature."],
    ["clipboard-commands.js", "objectsByIds", "Copy, cut, paste and duplicate."],
    ["transforms.js", "reflectPointAcrossLine", "Geometric transforms: mirror, rotate, trim, extend, translate."],
    ["viewport.js", "isFittableObject", "The viewport: fit, zoom, and workspace settings."],
    ["colour-picker.js", "COLOUR_RECENT_LIMIT", "The colour picker."],
    ["delete-command.js", "deleteSelectedObjects", "Deleting the selection, with its dependants."],
    ["workspace-controls.js", "after:deleteSelectedObjects", "The workspace buttons: back, grid, snap, display toggles, undo/redo, and the Modify/View tools."],
    ["document-commands.js", "drawingFileNew", "New, Open, Save, Save As, Print and export, and crash recovery."],
    ["toolbar-wiring.js", "after:offerRecoveryIfAvailable", "Wiring the file, style and zoom controls."],
    ["workspace-layout.js", "applyTypedZoom", "The zoom box and the collapsible side panels."],
    ["canvas-events.js", "after:syncWorkspaceColumns:3", "Pointer events on the canvas, and closing menus on outside clicks."],
    ["keyboard-shortcuts.js", "keydown", "Keyboard shortcuts."],
    ["index.js", "startup", "The drawing editor: installs every part of it and starts it."]
];

/*
 * The shared object that module-level lets move onto. Its name must not
 * already be used in the controller, or a local variable of the same name
 * would capture the rewritten references.
 */
const SHARED = "editorState";
const SHARED_FILE = "editor-state.js";

const src = fs.readFileSync(inputFile, "utf8");
if (new RegExp(`\\b${SHARED}\\b`).test(src)) throw new Error(`${SHARED} is already used in the controller`);
const comments = [];
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", ranges: true, locations: true, onComment: comments });
const scopes = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "module" });
const moduleScope = scopes.scopes.find(s => s.type === "module");

/* ---------- top-level statements ---------- */
const imports = ast.body.filter(s => s.type === "ImportDeclaration");
const statements = [];
let cursor = imports.length ? imports[imports.length - 1].end : 0;
for (const node of ast.body) {
    if (node.type === "ImportDeclaration") continue;
    const textStart = cursor;
    cursor = node.end;
    if (node.type === "ExportNamedDeclaration" && !node.declaration) continue;   // export { x };
    const decl = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    statements.push({
        node, decl,
        textStart,                                   // includes the comments above it
        codeStart: decl.start,
        exportPrefix: node !== decl,                  // `export function ...`
        names: declaredNames(decl),
        exec: !["FunctionDeclaration", "VariableDeclaration", "ClassDeclaration"].includes(decl.type),
        kind: decl.kind || null,
        line: node.loc.start.line
    });
}
const trailing = src.slice(cursor);

function declaredNames(stmt) {
    if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") return [stmt.id.name];
    if (stmt.type === "VariableDeclaration") return stmt.declarations.map(d => d.id.name);
    return [];
}

/* ---------- assign statements to modules ---------- */
const startIndex = LAYOUT.map(([file, start]) => {
    if (start === "keydown") return statements.findIndex(s => s.exec && /addEventListener\(\s*"keydown"/.test(src.slice(s.codeStart, s.codeStart + 200)) && /^document\b/.test(src.slice(s.codeStart, s.codeStart + 20)));
    if (start === "startup") return statements.findIndex(s => s.exec && /^renderEngineeringTools\(/.test(src.slice(s.codeStart, s.codeStart + 40)));
    if (start.startsWith("after:")) {
        const [, name, skip] = start.split(":");
        const at = statements.findIndex(s => s.names.includes(name));
        return at < 0 ? -1 : at + 1 + Number(skip || 0);
    }
    return statements.findIndex(s => s.names.includes(start));
});
LAYOUT.forEach(([file, start], i) => { if (startIndex[i] < 0) throw new Error(`layout start not found: ${file} <- ${start}`); });
for (let i = 1; i < startIndex.length; i++) {
    if (startIndex[i] <= startIndex[i - 1]) throw new Error(`layout out of order at ${LAYOUT[i][0]} (${startIndex[i]} <= ${startIndex[i - 1]})`);
}
if (startIndex[0] !== 0) throw new Error("the first region must start at the first statement");
/*
 * Declarations that belong with an earlier region than the one they sit in.
 * The Statics tool groups are Statics tool definitions, and one of them is
 * built from STATICS_CHILD_TOOLS while modules load, so keeping them beside
 * it also keeps that read inside one module.
 */
const RELOCATE = {
    STATICS_SINGLE_CLICK_TOOLS: "statics-tools.js",
    STATICS_PLACEMENT_TOOLS: "statics-tools.js",
    STATICS_SPAN_TOOLS: "statics-tools.js",
    STATICS_SPAN_SNAP_TOOLS: "statics-tools.js"
};
statements.forEach((s, i) => {
    let m = 0;
    while (m + 1 < startIndex.length && startIndex[m + 1] <= i) m++;
    s.module = LAYOUT[m][0];
    const moved = s.names.map(n => RELOCATE[n]).find(Boolean);
    if (moved) s.module = moved;
});

/* ---------- bindings and references ---------- */
const stmtAt = pos => statements.find(s => pos >= s.textStart && pos < s.node.end) || null;
const ownerOf = new Map();          // binding name -> module
for (const s of statements) for (const n of s.names) ownerOf.set(n, s.module);
const importOf = new Map();         // local name -> { source, imported }
for (const imp of imports) {
    for (const spec of imp.specifiers) {
        importOf.set(spec.local.name, {
            source: imp.source.value,
            kind: spec.type === "ImportDefaultSpecifier" ? "default" : "named",
            imported: spec.imported?.name
        });
    }
}

const parents = new Map();
walk.fullAncestor(ast, (node, _state, ancestors) => {
    if (node.type === "Identifier") parents.set(node, ancestors[ancestors.length - 2]);
});

const usesOf = new Map();           // module -> Set of names it references from elsewhere
const refSites = new Map();         // name -> [{ identifier, module }]
for (const variable of moduleScope.variables) {
    for (const ref of variable.references) {
        const site = stmtAt(ref.identifier.start);
        if (!site) continue;
        if (!refSites.has(variable.name)) refSites.set(variable.name, []);
        refSites.get(variable.name).push({ identifier: ref.identifier, module: site.module, statement: site, isWrite: ref.isWrite(), init: ref.init });
        const owner = ownerOf.get(variable.name);
        if (owner && owner !== site.module || importOf.has(variable.name)) {
            if (!usesOf.has(site.module)) usesOf.set(site.module, new Set());
            usesOf.get(site.module).add(variable.name);
        }
    }
}

/* lets used by more than one module go to the session */
const sessionLets = new Set();
for (const s of statements) {
    if (s.kind !== "let") continue;
    for (const name of s.names) {
        const modules = new Set((refSites.get(name) || []).map(r => r.module));
        modules.add(s.module);
        if (modules.size > 1) sessionLets.add(name);
    }
}

/*
 * ---------- safety report: module-evaluation-time reads across modules ----------
 *
 * A module reading another module's binding WHILE IT LOADS (outside any
 * function) is only safe if that module has already been evaluated. Imported
 * function declarations always are (they are initialised before any module
 * code runs). A const/let/class is, unless the two modules import each other
 * in a cycle - then evaluation order decides, and that is reported.
 */
const report = [];
const functionRanges = [];
walk.full(ast, n => { if (/Function/.test(n.type)) functionRanges.push([n.start, n.end]); });
const deferred = id => functionRanges.some(([a, b]) => id.start > a && id.end <= b);
const isFunction = name => statements.some(s => s.decl.type === "FunctionDeclaration" && s.names.includes(name));
const moduleOfBinding = name => (sessionLets.has(name) ? SHARED_FILE : ownerOf.get(name));

// editor-internal import graph (as the split will produce it)
const graph = new Map(LAYOUT.map(([f]) => [f, new Set()]));
for (const [module, names] of usesOf) {
    for (const n of names) {
        const owner = moduleOfBinding(n);
        if (owner && owner !== module) graph.get(module).add(owner);
    }
}
const reaches = (from, to, seen = new Set()) => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(graph.get(from) || [])].some(next => reaches(next, to, seen));
};

for (const s of statements) {
    if (s.exec) continue;                               // wrapped into install()
    const reader = s.kind === "let" && s.names.every(n => sessionLets.has(n)) ? SHARED_FILE : s.module;
    for (const [name, sites] of refSites) {
        for (const r of sites) {
            if (r.statement !== s || deferred(r.identifier) || r.init) continue;
            if (importOf.has(name) || isFunction(name)) continue;
            const owner = moduleOfBinding(name);
            if (!owner || owner === reader) continue;
            if (reaches(owner, reader)) {
                report.push(`${reader}: ${s.names.join(",")} reads ${name} (${owner}) while loading, and ${owner} imports ${reader}`);
            }
        }
    }
}

console.log(`statements: ${statements.length}, modules: ${LAYOUT.length}, session lets: ${[...sessionLets].join(", ")}`);
const counts = {};
for (const s of statements) counts[s.module] = (counts[s.module] || 0) + (s.node.loc.end.line - s.node.loc.start.line + 1);
console.log(LAYOUT.map(([f]) => `${f}:${counts[f] || 0}`).join("  "));
console.log(report.length ? "UNSAFE:\n  " + report.join("\n  ") : "no load-time cross-module reads");
if (dry) {
    for (const [i, [file]] of LAYOUT.entries()) {
        const s = statements[startIndex[i]];
        console.log(`  ${file.padEnd(26)} line ${String(s.line).padStart(5)}  ${src.slice(s.codeStart, s.codeStart + 70).replace(/s+/g, " ")}`);
    }
    process.exit(0);
}

/* ---------- text edits: session references, export prefixes ---------- */
const edits = [];                   // { start, end, text }
for (const name of sessionLets) {
    for (const r of refSites.get(name) || []) {
        const id = r.identifier;
        const parent = parents.get(id);
        if (r.statement.kind === "let" && r.statement.names.includes(name) && r.init) continue;   // the declaration itself
        if (parent && parent.type === "Property" && parent.shorthand && parent.value === id) {
            edits.push({ start: parent.start, end: parent.end, text: `${name}: ${SHARED}.${name}` });
        } else {
            edits.push({ start: id.start, end: id.end, text: `${SHARED}.${name}` });
        }
    }
}
for (const s of statements) if (s.exportPrefix) edits.push({ start: s.node.start, end: s.decl.start, text: "" });

function textOf(from, to) {
    const inside = edits.filter(e => e.start >= from && e.end <= to).sort((a, b) => b.start - a.start);
    let text = src.slice(from, to);
    for (const e of inside) text = text.slice(0, e.start - from) + e.text + text.slice(e.end - from);
    return text;
}

/* ---------- template-literal-safe indentation for install() bodies ---------- */
const templates = [];
walk.full(ast, n => { if (n.type === "TemplateLiteral") templates.push([n.start, n.end]); });
function indented(from, to, pad) {
    // Indent every line that does not begin inside a template literal.
    const text = textOf(from, to);
    const lines = text.split("\n");
    let offset = from;
    return lines.map((line, i) => {
        const lineStart = offset;
        offset += line.length + 1;
        if (!line.trim()) return line;
        if (i > 0 && templates.some(([a, b]) => lineStart > a && lineStart < b)) return line;
        return pad + line;
    }).join("\n");
}

/* ---------- write modules ---------- */
/* Initialisers that move into session.js take their imports with them. */
if (!usesOf.has(SHARED_FILE)) usesOf.set(SHARED_FILE, new Set());
for (const s of statements.filter(s => s.kind === "let" && s.names.every(n => sessionLets.has(n)))) {
    for (const [name, sites] of refSites) {
        if (sites.some(r => r.statement === s && !r.init)) usesOf.get(SHARED_FILE).add(name);
    }
}

const exportedBy = new Map();
for (const [module, names] of usesOf) {
    for (const n of names) {
        const owner = ownerOf.get(n);
        if (!owner || owner === module || sessionLets.has(n)) continue;
        if (!exportedBy.has(owner)) exportedBy.set(owner, new Set());
        exportedBy.get(owner).add(n);
    }
}
// Public names the rest of the application imports from the editor.
const PUBLIC = ["enggDrawingSheets", "enggDrawing", "renderEngineeringTools"];
for (const n of PUBLIC) {
    const owner = ownerOf.get(n);
    if (!exportedBy.has(owner)) exportedBy.set(owner, new Set());
    exportedBy.get(owner).add(n);
}

const pascal = file => file.replace(/\.js$/, "").split("-").map(w => w[0].toUpperCase() + w.slice(1)).join("");
const installs = [];
fs.mkdirSync(outDir, { recursive: true });

for (const [file, , description] of LAYOUT) {
    const own = statements.filter(s => s.module === file);
    const lines = [];
    if (file === "index.js") {
        // A table of contents for the editor, in reading order.
        const width = Math.max(...LAYOUT.map(([f]) => f.length)) + 2;
        const toc = LAYOUT.filter(([f]) => f !== "index.js")
            .map(([f, , d]) => ` *   ${f.padEnd(width)}${d}`).join("\n");
        lines.push(`/*\n * THE DRAWING EDITOR.\n *\n * This module starts the editor: it installs each part's page wiring, in\n * order, and then renders the first sheet. The parts are:\n *\n${toc}\n *\n * Shared state lives in editor-state.js; DOM lookups in dom.js. Each part that\n * wires itself to the page exports an install function, called below.\n */`);
    } else {
        lines.push(`/*\n * ${description}\n */`);
    }

    // imports: external modules first (in their original order), then editor modules
    const used = usesOf.get(file) || new Set();
    const external = new Map();
    for (const imp of imports) {
        const specs = imp.specifiers.filter(sp => used.has(sp.local.name));
        if (!specs.length) continue;
        const def = specs.find(sp => sp.type === "ImportDefaultSpecifier");
        const named = specs.filter(sp => sp.type === "ImportSpecifier").map(sp => sp.local.name).sort();
        const parts = [];
        if (def) parts.push(def.local.name);
        if (named.length) parts.push(`{ ${named.join(", ")} }`);
        external.set(imp.source.value, `import ${parts.join(", ")} from "${imp.source.value}";`);
    }
    const editorImports = new Map();
    for (const n of used) {
        if (importOf.has(n)) continue;
        const owner = sessionLets.has(n) ? SHARED_FILE : ownerOf.get(n);
        if (!owner || owner === file) continue;
        const binding = sessionLets.has(n) ? SHARED : n;
        if (!editorImports.has(owner)) editorImports.set(owner, new Set());
        editorImports.get(owner).add(binding);
    }
    // A module that touches any session state, including state it used to declare itself.
    const touchesSession = [...sessionLets].some(n =>
        (refSites.get(n) || []).some(r => r.module === file && !(r.init && r.statement.kind === "let")));
    if (touchesSession && file !== SHARED_FILE) {
        if (!editorImports.has(SHARED_FILE)) editorImports.set(SHARED_FILE, new Set());
        editorImports.get(SHARED_FILE).add(SHARED);
    }
    const importLines = [
        ...[...external.keys()].sort().map(k => external.get(k)),
        ...[...editorImports.keys()].sort().map(owner =>
            `import { ${[...editorImports.get(owner)].sort().join(", ")} } from "./${owner}";`)
    ];
    if (importLines.length) lines.push(importLines.join("\n"));

    const exported = exportedBy.get(file) || new Set();
    const body = [];
    const execs = [];
    for (const s of own) {
        if (s.kind === "let" && s.names.every(n => sessionLets.has(n))) continue;   // moved to the session
        if (s.exec) { execs.push(s); continue; }
        const lead = textOf(s.textStart, s.codeStart).replace(/^\s*\n/, "").replace(/^\n+/, "");
        const code = textOf(s.codeStart, s.node.end);
        const prefix = s.names.some(n => exported.has(n)) ? "export " : "";
        body.push(lead + prefix + code);
    }

    if (file === SHARED_FILE) {
        const lets = statements.filter(s => s.kind === "let" && s.names.every(n => sessionLets.has(n)));
        const props = lets.map(s => {
            const lead = textOf(s.textStart, s.codeStart).replace(/^\s*\n/, "").replace(/^\n+/, "").trimEnd();
            const d = s.decl.declarations[0];
            const init = d.init ? textOf(d.init.start, d.init.end) : "null";
            const comment = lead ? lead.split("\n").map(l => "    " + l).join("\n") + "\n" : "";
            return `${comment}    ${d.id.name}: ${init}`;
        });
        body.push(`/*\n * UI state shared between editor modules.\n *\n * These were module-level variables of the single controller file. An\n * imported binding cannot be reassigned, so state that more than one\n * module changes lives on this one object instead.\n */\nexport const ${SHARED} = {\n${props.join(",\n\n")}\n};`);
    }

    if (execs.length && file !== "index.js") {
        const name = `install${pascal(file)}`;
        installs.push({ file, name });
        const parts = execs.map(s => indented(s.textStart, s.node.end, "    ").replace(/^\s*\n/, ""));
        body.push(`/*\n * Wire this part of the editor to the page. Called once, at start-up,\n * by editor/index.js.\n */\nexport function ${name}() {\n${parts.join("\n\n")}\n}`);
    }

    if (file === "index.js") {
        const installImports = installs.map(i => `import { ${i.name} } from "./${i.file}";`).join("\n");
        const reexports = PUBLIC.map(n => `export { ${n} } from "./${ownerOf.get(n)}";`).join("\n");
        lines.push(installImports);
        lines.push(reexports);
        body.unshift(installs.map(i => `${i.name}();`).join("\n"));
        body.push(...execs.map(s => textOf(s.textStart, s.node.end).replace(/^\s*\n/, "")));
        body.push(trailing.trim());
    }

    lines.push(body.join("\n\n"));
    fs.writeFileSync(path.join(outDir, file), lines.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
}
console.log("wrote", LAYOUT.length, "modules to", outDir);
