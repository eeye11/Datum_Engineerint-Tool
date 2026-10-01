/*
 * Exercises the analysis dependency engine against a real drawing
 * state, using the page's own modules in the page's own order.
 *
 * The point of these checks is the associativity the specification
 * calls mandatory: a source changes, and the Analysis object that
 * reads it is true again without being touched. An implementation
 * that copies values once passes every "does it draw" test and fails
 * every one of these.
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

check(!!E, "drawing-state loaded");
check(!!D, "the dependency registry loaded");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

/* ================================================================
   FORCE COMPONENTS
   ================================================================ */
console.log("\nForce Components follow their source\n");

const state = E.createDrawingState();

const force = E.geometryFactories.force(
    { x: 10, y: 50 },
    { x: 40, y: 80 },
    style
);

force.geometry.magnitude = 200;
force.geometry.angle = 30;
force.geometry.forceX = undefined;
force.geometry.forceY = undefined;

E.addObject(state, force);

const components = E.geometryFactories["force-components"](
    { x: 10, y: 50 }, { x: 50, y: 80 }, style
);

D.registerDependency(components, [force.id]);
E.addObject(state, components);

D.refreshAll(state);

const comp = state.objects.find(o => o.id === components.id);

check(
    comp.geometry.horizontal && comp.geometry.vertical,
    "the components object carries an X and a Y component",
    JSON.stringify(Object.keys(comp.geometry))
);

check(
    Math.abs(comp.geometry.forceX - 200 * Math.cos(30 * Math.PI / 180)) < 1e-9,
    "the horizontal component is F cos(theta)",
    String(comp.geometry.forceX)
);

check(
    Math.abs(comp.geometry.vertical.end.x - comp.geometry.position.x) < 1e-9,
    "the vertical component is vertical"
);

check(
    Math.abs(comp.geometry.position.x - 10) < 1e-9 &&
        Math.abs(comp.geometry.position.y - 50) < 1e-9,
    "the component origin is the force's application point"
);

check(
    Math.abs(comp.geometry.original.end.y -
        (comp.geometry.position.y + 200 * Math.sin(30 * Math.PI / 180))) < 1e-9,
    "the original force is drawn at the resolved magnitude and angle"
);

/* ---- 14: the source moves ---- */
force.geometry.start = { x: 100, y: 20 };
force.geometry.position = { x: 100, y: 20 };
D.refreshAll(state);

check(
    Math.abs(comp.geometry.position.x - 100) < 1e-9 &&
        Math.abs(comp.geometry.position.y - 20) < 1e-9,
    "moving the force moves the components with it",
    JSON.stringify(comp.geometry.position)
);

/* ---- 15: the magnitude changes ---- */
force.geometry.magnitude = 400;
D.refreshAll(state);

check(
    Math.abs(comp.geometry.magnitude - 400) < 1e-9,
    "changing the force's magnitude updates the components",
    "magnitude = " + comp.geometry.magnitude
);

check(
    Math.abs(comp.geometry.forceX - 400 * Math.cos(30 * Math.PI / 180)) < 1e-9,
    "the horizontal component follows the new magnitude"
);

/* ---- 16: the direction changes ---- */
force.geometry.angle = 60;
D.refreshAll(state);

check(
    Math.abs(comp.geometry.forceX - 400 * Math.cos(60 * Math.PI / 180)) < 1e-9,
    "changing the direction re-resolves the components",
    "fx = " + comp.geometry.forceX
);

/* ---- 17: X/Y mode ---- */
force.geometry.forceX = 30;
force.geometry.forceY = 40;
D.refreshAll(state);

check(
    Math.abs(comp.geometry.forceX - 30) < 1e-9 &&
        Math.abs(comp.geometry.forceY - 40) < 1e-9,
    "an X/Y force is read through its components",
    JSON.stringify({ x: comp.geometry.forceX, y: comp.geometry.forceY })
);

check(
    comp.geometry.fromComponents === true ||
        D.readForceVector(force).fromComponents === true,
    "the X/Y form is recognised as such"
);

/* ---- 18: nothing is invented ---- */
const unknownForce = E.geometryFactories.force(
    { x: 0, y: 0 }, { x: 10, y: 10 }, style
);

delete unknownForce.geometry.magnitude;
delete unknownForce.geometry.angle;
delete unknownForce.geometry.forceX;
delete unknownForce.geometry.forceY;

E.addObject(state, unknownForce);

const unknown = E.geometryFactories["force-components"](
    { x: 0, y: 0 }, { x: 10, y: 10 }, style
);

D.registerDependency(unknown, [unknownForce.id]);
E.addObject(state, unknown);
D.refreshAll(state);

const unknownComp = state.objects.find(o => o.id === unknown.id);

check(
    unknownComp.engineering.unresolved !== true,
    "a force with no stated values is not reported as broken"
);

check(
    !unknownComp.geometry.horizontal,
    "no components are drawn for a force that states nothing",
    JSON.stringify(Object.keys(unknownComp.geometry))
);

const readUnknown = D.readForceVector(unknownForce);
check(readUnknown.known === false, "an unstated force reads as unknown");

/* ---- 22: the source is deleted ---- */
const state2 = E.createDrawingState();
const doomedForce = E.geometryFactories.force(
    { x: 0, y: 0 }, { x: 30, y: 30 }, style
);
doomedForce.geometry.magnitude = 100;
doomedForce.geometry.angle = 0;
E.addObject(state2, doomedForce);

const doomedComp = E.geometryFactories["force-components"](
    { x: 0, y: 0 }, { x: 30, y: 0 }, style
);
D.registerDependency(doomedComp, [doomedForce.id]);
E.addObject(state2, doomedComp);

E.removeObject(state2, doomedForce.id);
E.resolveAnalysisAfterDeletion(state2, [doomedForce.id]);

check(
    !state2.objects.some(o => o.id === doomedComp.id),
    "a components object is removed with the force it described",
    "remaining = " + state2.objects.length
);

/* ================================================================
   RESULTANT
   ================================================================ */
console.log("\nResultant follows its sources\n");

const state3 = E.createDrawingState();

function makeForce(x, y, magnitude, angle) {
    const f = E.geometryFactories.force(
        { x, y }, { x: x + magnitude, y: y }, style
    );
    f.geometry.magnitude = magnitude;
    f.geometry.angle = angle;
    f.geometry.start = { x, y };
    f.geometry.position = { x, y };
    return f;
}

const f1 = makeForce(0, 0, 100, 0);
const f2 = makeForce(0, 0, 50, 90);

E.addObject(state3, f1);
E.addObject(state3, f2);

const resultant = E.geometryFactories.resultant(
    { x: 0, y: 0 }, { x: 30, y: 0 }, style
);

D.registerDependency(resultant, [f1.id, f2.id]);
E.addObject(state3, resultant);
D.refreshAll(state3);

const res = state3.objects.find(o => o.id === resultant.id);

check(
    Math.abs(res.geometry.magnitude - Math.hypot(100, 50)) < 1e-9,
    "the resultant is the vector sum of its sources",
    "magnitude = " + res.geometry.magnitude
);

check(
    Math.abs(res.geometry.angle - Math.atan2(50, 100) * 180 / Math.PI) < 1e-9,
    "its direction is the direction of that sum"
);

check(
    res.geometry.forceX === 100 && res.geometry.forceY === 50,
    "the summed components are stored explicitly",
    JSON.stringify({ x: res.geometry.forceX, y: res.geometry.forceY })
);

check(
    res.geometry.start.x === 0 && res.geometry.start.y === 0,
    "it is drawn from the common point of the forces it sums"
);

/* ---- 29: a source moves ---- */
f1.geometry.start = { x: 200, y: 200 };
f1.geometry.position = { x: 200, y: 200 };
D.refreshAll(state3);

check(
    res.geometry.start.x === 200 && res.geometry.start.y === 200,
    "moving a source moves where the resultant is drawn from",
    JSON.stringify(res.geometry.start)
);

/* ---- 30: a source value changes ---- */
f1.geometry.magnitude = 200;
D.refreshAll(state3);

check(
    Math.abs(res.geometry.forceX - 200) < 1e-9,
    "changing a source's magnitude updates the resultant",
    "fx = " + res.geometry.forceX
);

f2.geometry.angle = 45;
D.refreshAll(state3);

const expected = 200 + 50 * Math.cos(45 * Math.PI / 180);

check(
    Math.abs(res.geometry.forceX - expected) < 1e-9,
    "changing a source's direction updates the resultant",
    res.geometry.forceX + " vs " + expected
);

/* ---- 31: a source is deleted ---- */
E.removeObject(state3, f2.id);
E.resolveAnalysisAfterDeletion(state3, [f2.id]);

const resAfter = state3.objects.find(o => o.id === resultant.id);

check(
    Boolean(resAfter),
    "the resultant survives when one source of several is deleted"
);

check(
    resAfter &&
        Math.abs(resAfter.geometry.forceX - 200) < 1e-9,
    "and is recalculated from the remaining sources",
    resAfter ? String(resAfter.geometry.forceX) : "gone"
);

E.removeObject(state3, f1.id);
E.resolveAnalysisAfterDeletion(state3, [f1.id]);

check(
    !state3.objects.some(o => o.id === resultant.id),
    "it is removed once no source is left"
);

/* ================================================================
   SFD / BMD / AFD
   ================================================================ */
console.log("\nDiagrams follow their source's span\n");

const state4 = E.createDrawingState();

const beam = E.geometryFactories.beam(
    { x: 0, y: 0 }, { x: 400, y: 0 }, style
);
E.addObject(state4, beam);

const support = E.geometryFactories["pin-support"](
    { x: 0, y: 0 }, 0, style
);
E.addObject(state4, support);

const loadForce = E.geometryFactories.force(
    { x: 100, y: 0 }, { x: 100, y: 60 }, style
);
loadForce.geometry.magnitude = 50;
loadForce.geometry.angle = 90;
E.addObject(state4, loadForce);

const sfd = E.geometryFactories["analysis-diagram"](
    "shear-force-diagram", "SFD",
    { x: 0, y: -200 }, { x: 400, y: -200 }, style
);
D.registerDependency(sfd, [beam.id]);
E.addObject(state4, sfd);
D.refreshAll(state4);

const diag = state4.objects.find(o => o.id === sfd.id);

check(
    diag.geometry.sourceSpan &&
        Math.abs(diag.geometry.sourceSpan.length - 400) < 1e-9,
    "the diagram reports its source's span",
    diag.geometry.sourceSpan ? String(diag.geometry.sourceSpan.length) : "none"
);

check(
    diag.geometry.zeroAxis &&
        diag.geometry.zeroAxis.from.y === -200,
    "the zero axis is where the student put it, not on the beam",
    JSON.stringify(diag.geometry.zeroAxis)
);

check(
    Array.isArray(diag.geometry.referencePositions) &&
        diag.geometry.referencePositions.length >= 4,
    "the source's stations are transferred onto the axis",
    "stations = " +
        (diag.geometry.referencePositions || []).length
);

/*
 * The load acts a quarter of the way along a 400-long beam, so its
 * marker belongs a quarter of the way along the axis.
 */
const loadStation = (diag.geometry.referencePositions || [])
    .find(p => p.sourceId === loadForce.id);

check(
    loadStation &&
        Math.abs(loadStation.t - 0.25) < 1e-9,
    "a source position is mapped as a FRACTION of the span, in world units",
    loadStation ? String(loadStation.t) : "no station"
);

check(
    loadStation &&
        Math.abs(loadStation.position.x - 100) < 1e-9,
    "and is placed on the axis at that fraction",
    loadStation ? String(loadStation.position.x) : "none"
);

/* ---- 39: the source beam is resized ---- */
beam.geometry.end = { x: 800, y: 0 };
D.refreshAll(state4);

check(
    Math.abs(diag.geometry.sourceSpan.length - 800) < 1e-9,
    "lengthening the beam updates the reported span",
    String(diag.geometry.sourceSpan.length)
);

/*
 * The station is read back from the object AFTER the refresh rather
 * than through the reference captured before it.
 *
 * A refresh rebuilds the station list, because the stations are
 * re-derived from the source rather than adjusted in place. Holding
 * the old object and asserting on it would be testing that a stale
 * array is still stale - it says nothing about whether the diagram
 * followed its source, and it would fail against a perfectly correct
 * implementation.
 */
const loadStationAfterResize =
    state4.objects
        .find(o => o.id === sfd.id)
        .geometry.referencePositions
        .find(p => p.sourceId === loadForce.id);

check(
    loadStationAfterResize &&
        Math.abs(loadStationAfterResize.t - 0.125) < 1e-9,
    "and the stations are re-proportioned against the new span",
    loadStationAfterResize ? String(loadStationAfterResize.t) : "gone"
);

/*
 * The axis is now the SAME LENGTH as the resized source, so the load
 * that sits at world x = 100 lands at x = 100 on it.
 *
 * This is the point of deriving the axis from the span: before, the
 * diagram kept its own 400-unit axis while the beam grew to 800, so
 * every marker on it sat at half the offset it should have - the
 * diagram and the beam were quietly disagreeing about where the load
 * was, and nothing said so.
 */
check(
    loadStationAfterResize &&
        Math.abs(loadStationAfterResize.position.x - 100) < 1e-9,
    "the marker sits where the load actually is, because the axis grew with the beam",
    loadStationAfterResize
        ? String(loadStationAfterResize.position.x)
        : "gone"
);

check(
    Math.abs(
        state4.objects.find(o => o.id === sfd.id)
            .geometry.end.x -
        800
    ) < 1e-9,
    "and the axis is exactly as long as the resized source",
    String(
        state4.objects.find(o => o.id === sfd.id).geometry.end.x
    )
);

/* ---- the source beam is moved ---- */
beam.geometry.start = { x: 1000, y: 500 };
beam.geometry.end = { x: 1800, y: 500 };
D.refreshAll(state4);

check(
    diag.geometry.sourceSpan.start.x === 1000,
    "moving the beam updates the source span the diagram reads",
    JSON.stringify(diag.geometry.sourceSpan.start)
);

/*
 * A student's own solution geometry is ordinary drawing features. The
 * refresh must leave them completely alone - that is the whole
 * difference between following a source and solving the exercise.
 */
const studentLine = E.geometryFactories.line(
    { x: 0, y: -200 }, { x: 40, y: -260 }, style
);
E.addObject(state4, studentLine);
const before = JSON.stringify(studentLine.geometry);
D.refreshAll(state4);
check(
    JSON.stringify(studentLine.geometry) === before,
    "the student's drawn solution is never rewritten by an update"
);

/* ---- 7: moving the diagram leaves the source alone ---- */
const beamBefore = JSON.stringify(beam.geometry);

state4.objects
    .find(o => o.id === sfd.id)
    .geometry.placementOffset = { x: 0, y: 400 };

D.refreshAll(state4);

const movedDiagram =
    state4.objects.find(o => o.id === sfd.id);

check(
    JSON.stringify(beam.geometry) === beamBefore,
    "moving a diagram never moves its source"
);

/*
 * The diagram was created at y = -200 with a beam at y = 0, so it sat
 * 200 ABOVE its source, which records as a distance of -200. The drag
 * adds 400, giving 200: the diagram ends up 200 below the beam.
 *
 * Written as a distance below the source rather than a world y,
 * because the distance is the thing that is meant to be preserved - a
 * world y would change whenever the beam moved, which is exactly what
 * §18 rules out.
 */
const beamY = beam.geometry.start.y;
const dropBelow =
    movedDiagram.geometry.zeroAxis.from.y - beamY;

check(
    dropBelow === 200,
    "the drag is added to the stored placement, not substituted for it",
    beamY + " -> " + movedDiagram.geometry.zeroAxis.from.y +
        " (drop " + dropBelow + ")"
);

check(
    movedDiagram.geometry.sourceOffset.distance === 200,
    "and the resulting height is stored as a distance from the source",
    JSON.stringify(movedDiagram.geometry.sourceOffset)
);

check(
    movedDiagram.geometry.placementOffset === null,
    "the drag is not applied a second time on the next refresh"
);

check(
    movedDiagram.geometry.end.x -
        movedDiagram.geometry.start.x === 800,
    "and dragging it did not change its length",
    String(
        movedDiagram.geometry.end.x -
            movedDiagram.geometry.start.x
    )
);

/* ---- a diagram whose source is deleted keeps its own work ---- */
const state5 = E.createDrawingState();
const beam5 = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 200, y: 0 }, style);
E.addObject(state5, beam5);
const sfd5 = E.geometryFactories["analysis-diagram"](
    "shear-force-diagram", "SFD", { x: 0, y: -100 }, { x: 200, y: -100 }, style
);
D.registerDependency(sfd5, [beam5.id]);
E.addObject(state5, sfd5);
const work = E.geometryFactories.line({ x: 0, y: -100 }, { x: 50, y: -150 }, style);
E.addObject(state5, work);
D.refreshAll(state5);

E.removeObject(state5, beam5.id);
E.resolveAnalysisAfterDeletion(state5, [beam5.id]);

const survivor = state5.objects.find(o => o.id === sfd5.id);

check(Boolean(survivor), "a diagram is NOT deleted with its source");
check(
    survivor && survivor.engineering.unresolved === true,
    "it is marked as having lost its reference"
);
check(
    state5.objects.some(o => o.id === work.id),
    "and the student's own drawing inside it is untouched"
);

/* ================================================================
   NO AUTO-SOLVING
   ================================================================ */
console.log("\nNothing is invented\n");

const state6 = E.createDrawingState();
const beam6 = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 300, y: 0 }, style);
E.addObject(state6, beam6);
const sfd6 = E.geometryFactories["analysis-diagram"](
    "shear-force-diagram", "SFD", { x: 0, y: -100 }, { x: 300, y: -100 }, style
);
D.registerDependency(sfd6, [beam6.id]);
E.addObject(state6, sfd6);
D.refreshAll(state6);

const d6 = state6.objects.find(o => o.id === sfd6.id);
const keys = Object.keys(d6.geometry).join(",");

[
    ["shearValue", /shear/i],
    ["momentValue", /momentValue|peakMoment/i],
    ["reaction", /reaction/i],
    ["axial", /axial/i],
    ["slope", /slope/i]
].forEach(([label, pattern]) => {
    check(
        !pattern.test(keys),
        "the diagram invents no " + label,
        keys
    );
});

check(
    !state6.objects.some(o => o.type === "reaction"),
    "no support reaction is generated"
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
