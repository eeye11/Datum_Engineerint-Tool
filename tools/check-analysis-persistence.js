/*
 * Saves a drawing with all five kinds of Analysis object, reloads it,
 * and checks that the relationships survived and the values were
 * recomputed rather than restored.
 *
 * The distinction these checks exist to protect: the SOURCE
 * relationships must come back from the file, and the DERIVED geometry
 * must be recalculated from the sources as they are now. A file that
 * restores both correctly survives a source being edited on another
 * machine between save and open - which is exactly what happens when
 * a drawing is emailed, and what makes an analysis object a
 * relationship rather than a picture of one.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.join(__dirname, "..");

let failed = 0;

function check(ok, label, detail) {
    if (!ok) {
        failed += 1;
    }
    console.log(
        "  " + (ok ? "pass" : "FAIL") + "  " + label +
        (detail && !ok ? " :: " + detail : "")
    );
}

function element(tag) {
    const node = {
        tagName: tag,
        attributes: {},
        children: [],
        textContent: "",
        innerHTML: "",
        value: "",
        options: [],
        selectedOptions: [],
        selectedIndex: 0,
        _listeners: {},
        dataset: {},
        style: {},
        classList: {
            add() {}, remove() {}, toggle() {}, contains: () => false
        },
        setAttribute(n, v) { this.attributes[n] = String(v); },
        getAttribute(n) { return this.attributes[n] ?? null; },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        removeChild(c) {
            this.children = this.children.filter(x => x !== c);
            return c;
        },
        get firstChild() { return this.children[0] || null; },
        addEventListener(t, fn) {
            (this._listeners[t] = this._listeners[t] || []).push(fn);
        },
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        closest() { return null; },
        contains() { return false; },
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
        },
        focus() {}, blur() {}
    };
    return node;
}

const svgRoot = element("svg");

const canvasRoot = {
    querySelector: (sel) =>
        String(sel).indexOf("drawing-renderer") >= 0 ? svgRoot : null,
    getBoundingClientRect: () => ({
        left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600
    }),
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    getAttribute: () => null
};

const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON,
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Blob: function () {},
    FileReader: function () {
        this.readAsText = () => {};
        this.readAsDataURL = () => {};
    },
    navigator: {
        clipboard: { writeText() {}, readText: () => Promise.resolve("") }
    },
    MathJax: { typesetClear() {}, typesetPromise: () => Promise.resolve() },
    alert() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
        readyState: "complete",
        createElement: (t) => element(t),
        createElementNS: (ns, t) => element(t),
        addEventListener() {},
        removeEventListener() {},
        querySelector: (sel) =>
            String(sel).indexOf("drawing-canvas") >= 0 ? canvasRoot : element(sel),
        querySelectorAll: () => [],
        getElementById: (id) => element(id),
        body: element("body"),
        documentElement: element("html")
    }
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.getComputedStyle = () => ({ getPropertyValue: () => "" });

vm.createContext(sandbox);

const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
[...html.matchAll(/js\/engineering-drawing\/([\w-]+\.js)/g)].forEach(m => {
    const file = m[1];
    const source = fs.readFileSync(
        path.join(projectRoot, "js", "engineering-drawing", file), "utf8"
    );
    try {
        vm.runInContext(source, sandbox, { filename: file });
    } catch (error) {
        /* Modules that draw at load have no canvas yet. */
    }
});

const E = sandbox.enggDrawingState;
const D = sandbox.enggAnalysisDependencies;
const F = sandbox.enggDocumentFile;

check(!!E, "drawing-state loaded");
check(!!D, "the dependency registry loaded");
check(!!F, "the document file module loaded");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

/* ---- build a drawing with all five kinds ------------------------ */
const state = E.createDrawingState();

const force = E.geometryFactories.force({ x: 0, y: 0 }, { x: 100, y: 50 }, style);
force.geometry.magnitude = 200;
force.geometry.angle = 30;
E.addObject(state, force);

const force2 = E.geometryFactories.force({ x: 0, y: 0 }, { x: 0, y: 80 }, style);
force2.geometry.magnitude = 50;
force2.geometry.angle = 90;
E.addObject(state, force2);

const beam = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 400, y: 0 }, style);
E.addObject(state, beam);

const components = E.geometryFactories["force-components"](
    { x: 0, y: 0 }, { x: 100, y: 50 }, style
);
D.registerDependency(components, [force.id]);
E.addObject(state, components);

const resultant = E.geometryFactories.resultant(
    { x: 0, y: 0 }, { x: 30, y: 0 }, style
);
D.registerDependency(resultant, [force.id, force2.id]);
E.addObject(state, resultant);

["shear-force-diagram", "bending-moment-diagram", "axial-force-diagram"]
    .forEach(type => {
        const diagram = E.geometryFactories[type](
            { x: 0, y: -200 }, { x: 400, y: -200 }, style
        );
        D.registerDependency(diagram, [beam.id]);
        E.addObject(state, diagram);
    });

D.refreshAll(state);

/* ---- save ------------------------------------------------------- */
const collection = sandbox.enggSheets.createCollection({
    sheets: [{
        id: "sheet-1",
        name: "Sheet 1",
        objects: JSON.parse(JSON.stringify(state.objects))
    }],
    activeSheetId: "sheet-1"
});

/*
 * The file is wrapped in the format envelope, so it is built the way
 * the application builds it rather than by assembling an object here -
 * a hand-rolled envelope would be testing the test's idea of the
 * format rather than the format itself.
 */
const serialized = F.createDocument({
    objects: state.objects,
    sheets: sandbox.enggSheets
        .serializeCollection(collection)
        .sheets,
    activeSheetId: "sheet-1"
});

const text = JSON.stringify(serialized);

/*
 * The relationships have to be IN THE FILE, not merely recomputable
 * from geometry - the file is the only thing that survives being
 * closed.
 */
console.log("\nThe relationships are in the saved file\n");

check(
    text.includes(force.id),
    "the source force's id is saved"
);

check(
    text.includes(force2.id),
    "every resultant source id is saved"
);

check(
    text.includes(beam.id),
    "the source body's id is saved"
);

check(
    text.includes("sourceFeatureIds"),
    "the source relationship is saved as a named field"
);

/* ---- reload ----------------------------------------------------- */
const parsed = JSON.parse(text);
const result = F.readDocument(parsed);

check(result.ok, "the saved file reads back", result.detail);

const reloaded = result.document;
const reloadedState = E.createDrawingState();

/*
 * A saved document keeps its features on its SHEETS, not at the top
 * level - the sheet is what owns a sheet's features. The top level
 * `objects` is a legacy shape that is still read, so both are tried.
 */
reloadedState.objects = JSON.parse(
    JSON.stringify(
        (reloaded.sheets &&
            reloaded.sheets[0] &&
            reloaded.sheets[0].objects) ||
            reloaded.objects ||
            []
    )
);

D.refreshAll(reloadedState);

const find = (reloadedState, type) =>
    reloadedState.objects.find(o => o.type === type);

console.log("\nThe association survives the round trip\n");

const reComponents = find(reloadedState, "force-components");
const reResultant = find(reloadedState, "resultant");
const reSfd = reloadedState.objects.find(
    o => o.type === "analysis-diagram" &&
        o.geometry.diagramType === "SFD"
);

check(Boolean(reComponents), "the Force Components comes back");
check(Boolean(reResultant), "the Resultant comes back");
check(Boolean(reSfd), "the SFD comes back");

check(
    D.sourceIdsOf(reComponents)[0] === force.id,
    "the components still point at the same force",
    JSON.stringify(D.sourceIdsOf(reComponents))
);

check(
    D.sourceIdsOf(reResultant).length === 2,
    "the resultant still has both of its sources",
    JSON.stringify(D.sourceIdsOf(reResultant))
);

console.log(
    "\nValues are recomputed, not restored from the file\n"
);

/*
 * THE POINT OF THE WHOLE EXERCISE, SET UP HONESTLY.
 *
 * The file is reloaded FIRST, and the source is changed on the
 * RELOADED drawing - which is what actually happens when a drawing is
 * emailed: the analysis objects in the file were written when the
 * force was 200 N at 30 degrees, and the force that arrives with them
 * has since been retuned.
 *
 * Editing before the reload would have proved nothing. The file would
 * already contain the new values, so any implementation - including
 * one that blindly restored saved geometry with no dependency system
 * at all - would pass. The change has to happen somewhere the saved
 * data cannot see, or the check is just confirming the file is
 * self-consistent.
 */
const reloadedForce = reloadedState.objects.find(
    o => o.id === force.id
);
const reloadedForce2 = reloadedState.objects.find(
    o => o.id === force2.id
);
const reloadedBeamEarly = reloadedState.objects.find(
    o => o.id === beam.id
);

check(
    Math.abs(reComponents.geometry.magnitude - 200) < 1e-9,
    "on load, the saved values were the ones the file carried",
    String(reComponents.geometry.magnitude)
);

reloadedForce.geometry.magnitude = 400;
reloadedForce.geometry.angle = 60;
reloadedForce2.geometry.angle = 0;
reloadedBeamEarly.geometry.end = { x: 1000, y: 0 };

D.refreshAll(reloadedState);

/*
 * The objects are the same instances, so the values read below are
 * read from the same features the refresh wrote to.
 */
const reComponentsNow = reloadedState.objects.find(
    o => o.id === components.id
);
const reResultantNow = reloadedState.objects.find(
    o => o.id === resultant.id
);
const reSfdNow = reloadedState.objects.find(
    o => o.id === reSfd.id
);

check(
    Math.abs(reComponentsNow.geometry.magnitude - 400) < 1e-9,
    "the components show the force's CURRENT magnitude",
    String(reComponentsNow.geometry.magnitude)
);

check(
    Math.abs(reComponentsNow.geometry.angle - 60) < 1e-9,
    "the components show the force's CURRENT direction",
    String(reComponentsNow.geometry.angle)
);

check(
    Math.abs(
        reComponentsNow.geometry.forceX -
        400 * Math.cos(60 * Math.PI / 180)
    ) < 1e-9,
    "and re-resolve against it"
);

/*
 * The first force is 400 N at 60 degrees and the second is 50 N at 0
 * degrees, so the sum is written out rather than assumed to be
 * "400 along x" - which is the mistake a reader makes by forgetting
 * the second force is no longer vertical.
 */
const expectedSumX =
    400 * Math.cos(60 * Math.PI / 180) + 50;
const expectedSumY =
    400 * Math.sin(60 * Math.PI / 180) + 0;

check(
    Math.abs(
        reResultantNow.geometry.magnitude -
        Math.hypot(expectedSumX, expectedSumY)
    ) < 1e-9,
    "the resultant is re-summed from the current source values",
    reResultantNow.geometry.magnitude +
        " vs " +
        Math.hypot(expectedSumX, expectedSumY)
);

check(
    reSfdNow.geometry.sourceSpan &&
        Math.abs(reSfdNow.geometry.sourceSpan.length - 1000) < 1e-9,
    "the SFD reports the beam's current span",
    reSfdNow.geometry.sourceSpan
        ? String(reSfdNow.geometry.sourceSpan.length)
        : "none"
);

console.log(
    "\nThe student's own work is preserved\n"
);

/*
 * The student may have moved their diagram away from the source. That
 * is THEIR placement and it must survive both the reload and every
 * subsequent refresh - otherwise a diagram would spring back to its
 * beam the moment the file was opened, and the placement they chose
 * would be silently discarded.
 */
const placed = E.geometryFactories["shear-force-diagram"](
    { x: 0, y: -200 }, { x: 400, y: -200 }, style
);
D.registerDependency(placed, [beam.id]);
E.addObject(reloadedState, placed);

D.refreshAll(reloadedState);

const axisBefore = reloadedState.objects
    .find(o => o.id === placed.id)
    .geometry.zeroAxis.from.y;

reloadedState.objects
    .find(o => o.id === placed.id)
    .geometry.placementOffset = { x: 0, y: 350 };

D.refreshAll(reloadedState);

const moved = reloadedState.objects.find(o => o.id === placed.id);

check(
    moved.geometry.zeroAxis.from.y === axisBefore + 350,
    "a diagram can be placed away from its source",
    axisBefore + " -> " + moved.geometry.zeroAxis.from.y
);

/* The beam must not have been dragged along with it. */
const reloadedBeam = reloadedState.objects.find(o => o.id === beam.id);

check(
    reloadedBeam.geometry.end.x === 1000 &&
        reloadedBeam.geometry.start.x === 0,
    "moving the diagram never moves the beam",
    JSON.stringify(reloadedBeam.geometry.start) +
        " -> " +
        JSON.stringify(reloadedBeam.geometry.end)
);

/*
 * The SECOND save is built from the RELOADED collection, not from the
 * one made before the reload. Saving the stale collection here would
 * quietly write the pre-edit objects back out - and the diagram added
 * after the reload would not be in it at all, so the round trip would
 * be testing a file that never contained the thing being checked.
 */
const reloadedCollection = sandbox.enggSheets.createCollection({
    sheets: [{
        id: "sheet-1",
        name: "Sheet 1",
        objects: JSON.parse(
            JSON.stringify(reloadedState.objects)
        )
    }],
    activeSheetId: "sheet-1"
});

const text2 = JSON.stringify(
    F.createDocument({
        objects: reloadedState.objects,
        sheets: sandbox.enggSheets
            .serializeCollection(reloadedCollection)
            .sheets,
        activeSheetId: "sheet-1"
    })
);

const reparsed = F.readDocument(JSON.parse(text2));
const thirdPass = E.createDrawingState();

thirdPass.objects = JSON.parse(
    JSON.stringify(
        (reparsed.document.sheets &&
            reparsed.document.sheets[0] &&
            reparsed.document.sheets[0].objects) ||
            reparsed.document.objects ||
            []
    )
);

D.refreshAll(thirdPass);

const thirdDiagram = thirdPass.objects.find(o => o.id === placed.id);

check(
    thirdDiagram &&
        thirdDiagram.geometry.zeroAxis.from.y ===
            moved.geometry.zeroAxis.from.y,
    "the student's placement survives a second save and reload",
    thirdDiagram
        ? String(thirdDiagram.geometry.zeroAxis.from.y)
        : "gone"
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
