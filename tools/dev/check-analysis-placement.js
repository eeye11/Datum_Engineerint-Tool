/*
 * The interactive reference-axis placement.
 *
 * The specification is that the SOURCE decides what the axis is and
 * the CURSOR decides where it goes, so that is what is checked: that
 * the axis is the source's length and direction, that moving the
 * placement height moves only the axis, and that the committed axis is
 * exactly the one that was previewed.
 *
 * The commit and the preview are read through the same function the
 * application uses, deliberately. Checking them separately would
 * allow the two to disagree, and a student who places an axis where
 * they saw it and gets it somewhere else is worse off than one who
 * never had a preview.
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
    return {
        tagName: tag, attributes: {}, children: [], textContent: "",
        innerHTML: "", value: "", options: [], selectedOptions: [],
        selectedIndex: 0, _listeners: {}, dataset: {}, style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute(n, v) { this.attributes[n] = String(v); },
        getAttribute(n) { return this.attributes[n] ?? null; },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
        get firstChild() { return this.children[0] || null; },
        addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
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
    navigator: { clipboard: { writeText() {}, readText: () => Promise.resolve("") } },
    MathJax: { typesetClear() {}, typesetPromise: () => Promise.resolve() },
    alert() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
        readyState: "complete",
        createElement: (t) => element(t),
        createElementNS: (ns, t) => element(t),
        addEventListener() {}, removeEventListener() {},
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

check(!!D, "the dependency registry loaded");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

/* ================================================================
   THE AXIS IS DERIVED FROM THE SOURCE
   ================================================================ */
console.log("\nThe axis takes its length and direction from the source\n");

const beam = {
    id: "beam-1",
    type: "beam",
    name: "Beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 400, y: 0 } }
};

const level = D.axisFromSource(beam, -120);

check(
    Math.abs(level.length - 400) < 1e-9,
    "a level beam gives an axis of the same length",
    String(level.length)
);

check(
    Math.abs(level.start.x - 0) < 1e-9,
    "the axis starts under the source's start, so A' is under A"
);

check(
    Math.abs(level.end.x - 400) < 1e-9,
    "and ends under the source's end",
    String(level.end.x)
);

check(
    Math.abs(level.start.y - (-120)) < 1e-9,
    "the cursor's height is where the axis sits",
    String(level.start.y)
);

check(
    Math.abs(level.direction.y) < 1e-12,
    "a level beam gives a level axis"
);

/* ---- §3: parallelism ---- */
const sloped = {
    id: "beam-2",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 300, y: 200 } }
};

const slopedAxis = D.axisFromSource(sloped, 0);

check(
    Math.abs(
        Math.hypot(
            slopedAxis.end.x - slopedAxis.start.x,
            slopedAxis.end.y - slopedAxis.start.y
        ) - 360.5551275463989
    ) < 1e-6,
    "an angled beam gives an axis of the same length, not a flat one"
);

check(
    Math.abs(
        (slopedAxis.end.y - slopedAxis.start.y) -
        (sloped.geometry.end.y - sloped.geometry.start.y)
    ) < 1e-9,
    "and parallel to it - the same rise over the same run",
    (slopedAxis.end.y - slopedAxis.start.y) + " vs " +
    (sloped.geometry.end.y - sloped.geometry.start.y)
);

check(
    Math.abs(
        (slopedAxis.end.x - slopedAxis.start.x) -
        (sloped.geometry.end.x - sloped.geometry.start.x)
    ) < 1e-9,
    "and the same horizontal reach"
);

console.log("\nMoving the cursor moves the axis, and nothing else\n");

const high = D.axisFromSource(beam, -400);
const low = D.axisFromSource(beam, -60);

check(
    high.start.y < low.start.y,
    "a higher cursor gives a higher axis"
);

check(
    Math.abs(high.start.x - low.start.x) < 1e-9 &&
        Math.abs(high.end.x - low.end.x) < 1e-9,
    "the axis does not drift sideways as the cursor moves",
    high.start.x + " vs " + low.start.x
);

check(
    high.length === low.length && high.length === 400,
    "and its length is unchanged by the cursor"
);

check(
    Math.abs(high.end.y - high.start.y) < 1e-12 &&
        Math.abs(low.end.y - low.start.y) < 1e-12,
    "and it stays parallel to the source"
);

console.log("\nThe stored placement is a height, not a world point\n");

const drop = D.verticalOffsetOf(
    { start: { x: 0, y: 200 }, end: { x: 400, y: 200 } },
    { geometry: { start: { x: 0, y: 0 }, end: { x: 400, y: 0 } } }
);

check(
    drop === 200,
    "an axis 200 below its source measures as 200",
    String(drop)
);

/* The property that makes §18 work. */
const movedSource = {
    geometry: { start: { x: 0, y: 500 }, end: { x: 400, y: 500 } }
};

const reDerived = D.axisFromSource(
    movedSource,
    movedSource.geometry.start.y + drop
);

check(
    reDerived.start.y === 700,
    "moving the source 500 down keeps the diagram 200 below it",
    String(reDerived.start.y)
);

/* ================================================================
   THE COMMITTED DIAGRAM
   ================================================================ */
console.log("\nThe committed diagram matches the preview and maps its stations\n");

const state = E.createDrawingState();

const realBeam = E.geometryFactories.beam(
    { x: 0, y: 0 }, { x: 400, y: 0 }, style
);
E.addObject(state, realBeam);

const pin = E.geometryFactories["pin-support"]({ x: 0, y: 0 }, 0, style);
E.addObject(state, pin);

const applied = E.geometryFactories.force(
    { x: 200, y: 0 }, { x: 200, y: 60 }, style
);
applied.geometry.magnitude = 50;
applied.geometry.angle = 90;
E.addObject(state, applied);

/* The axis exactly as the preview would have shown it. */
const preview = D.axisFromSource(realBeam, -150);

const sfd = E.geometryFactories["shear-force-diagram"](
    preview.start, preview.end, style
);

D.registerDependency(sfd, [realBeam.id]);
E.addObject(state, sfd);

sfd.geometry.sourceOffset = {
    distance: D.verticalOffsetOf(preview, realBeam)
};

D.refreshAll(state);

const committed = state.objects.find(o => o.id === sfd.id);

check(
    committed.geometry.zeroAxis.from.x === preview.start.x &&
        committed.geometry.zeroAxis.from.y === preview.start.y,
    "the committed axis starts exactly where the preview showed it",
    JSON.stringify(committed.geometry.zeroAxis.from)
);

check(
    committed.geometry.zeroAxis.to.x === preview.end.x &&
        committed.geometry.zeroAxis.to.y === preview.end.y,
    "and ends there too"
);

const forceStation = committed.geometry.referencePositions
    .find(p => p.sourceId === applied.id);

check(
    forceStation && Math.abs(forceStation.position.x - 200) < 1e-9,
    "the load's station is mapped onto the committed axis",
    forceStation ? String(forceStation.position.x) : "none"
);

check(
    committed.geometry.referencePositions.length >= 4,
    "every explicit source position is transferred",
    String(committed.geometry.referencePositions.length)
);

/* §12: proportional mapping, in world units. */
check(
    forceStation && Math.abs(forceStation.t - 0.5) < 1e-9,
    "and it is the fraction along the source, not a guess",
    forceStation ? String(forceStation.t) : "none"
);

console.log("\n§13 nothing about the diagram is solved\n");

const keys = Object.keys(committed.geometry).join(",");

[
    ["shear value", /shearValue|ordinate/i],
    ["moment value", /peakMoment|momentValue/i],
    ["reaction", /reaction/i],
    ["slope", /slope/i]
].forEach(([label, pattern]) => {
    check(!pattern.test(keys), "no " + label + " is generated", keys);
});

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
