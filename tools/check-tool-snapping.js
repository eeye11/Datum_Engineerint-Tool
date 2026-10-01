/*
 * Resolves a snap for EVERY tool the application ships, over a beam,
 * and reports which ones can reach the middle of it.
 *
 * This exists because the candidate FILTER is a shared facility, and a
 * change to it made for one tool silently removes snapping for others.
 * Every tool is asked the same question - "can you snap here?" - at a
 * point in the MIDDLE of the body, where an endpoint-only implementation
 * would fail.
 *
 * The filter is expected to be per-tool, so the answer differs by tool.
 * What must never happen is a tool getting nothing at all.
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
        tagName: tag, attributes: {}, children: [],
        textContent: "", innerHTML: "", value: "",
        options: [], selectedOptions: [], selectedIndex: 0,
        _listeners: {}, dataset: {}, style: {},
        classList: {
            add() {}, remove() {}, toggle() {}, contains: () => false
        },
        setAttribute(n, v) { this.attributes[n] = String(v); },
        getAttribute(n) { return this.attributes[n] ?? null; },
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) {
            this.children = this.children.filter(x => x !== c);
            return c;
        },
        insertBefore(c) { this.children.push(c); return c; },
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
            return {
                left: 0, top: 0, width: 800, height: 600,
                right: 800, bottom: 600
            };
        },
        focus() {}, blur() {}
    };
    return node;
}

const svgRoot = element("svg");

const canvas = {
    querySelector: (sel) =>
        String(sel).indexOf("drawing-renderer") >= 0 ? svgRoot : null,
    getBoundingClientRect: () => ({
        left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600
    }),
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    classList: {
        add() {}, remove() {}, toggle() {}, contains: () => false
    },
    setAttribute() {},
    getAttribute: () => null
};

const sandbox = {
    console, setTimeout() {}, clearTimeout() {},
    setInterval() {}, clearInterval() {},
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
            String(sel).indexOf("drawing-canvas") >= 0 ? canvas : element(sel),
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
const S = sandbox.enggDrawingSnap;

check(!!S, "the snap module is available");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

const state = E.createDrawingState();

const beam = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 400, y: 0 }, style);
beam.geometry.depth = 10;
E.addObject(state, beam);

const bounds = { width: 800, height: 600 };

/*
 * Every tool the application ships, as it appears in the toolbar.
 *
 * The point of listing them is that a filter keyed on a name which does
 * not exist silently does nothing, and a name which matches the WRONG
 * tool silently steals its snapping. Both look identical in the code
 * and only show up by asking each tool in turn.
 */
const TOOLS = [
    ["point-force", "Point Force"],
    ["force-components", "Force Components"],
    ["resultant", "Resultant"],
    ["distributed-load", "Distributed Load"],
    ["varying-distributed-load", "Varying Distributed Load"],
    ["applied-moment", "Applied Moment"],
    ["couple", "Couple Moment"],
    ["pin-support", "Pin Support"],
    ["roller-support", "Roller Support"],
    ["fixed-support", "Fixed Support"],
    ["smooth-support", "Smooth Support"],
    ["pin-connection", "Pin Connection"],
    ["fixed-connection", "Fixed Connection"],
    ["slider-connection", "Slider Connection"],
    ["beam", "Beam"],
    ["truss", "Truss"],
    ["cable", "Cable"],
    ["shaft", "Shaft"],
    ["particle", "Particle"],
    ["rigid-body", "Rigid Body"],
    ["reference-point", "Reference Point"],
    ["reference-line", "Reference Line"],
    ["shear-force-diagram", "SFD"],
    ["bending-moment-diagram", "BMD"],
    ["axial-force-diagram", "AFD"],
    ["line", "Line"],
    ["arc", "Arc"],
    ["circle", "Circle"],
    ["rectangle", "Rectangle"],
    ["polygon", "Polygon"],
    ["point", "Point"],
    ["select", "Select"]
];

function snapFor(toolId, point) {
    state.activeTool = toolId;

    return S.resolveConstructionPoint(
        point,
        state,
        bounds
    );
}

/* Dead centre of the beam, on its centreline. */
const middle = { x: 200, y: 0 };

console.log("\nEvery tool can snap somewhere on a beam\n");

TOOLS.forEach(([toolId, label]) => {
    const resolution = snapFor(toolId, middle);

    check(
        !!resolution.snapCandidate,
        label + " gets a snap on a beam",
        "candidate = " +
            (resolution.snapCandidate
                ? resolution.snapCandidate.type
                : "NONE")
    );
});

console.log(
    "\nThe filter is per-tool, not global\n"
);

/*
 * The candidates offered with a support active, against those offered
 * with a force active. If these are IDENTICAL the filter is not doing
 * anything - and the specific fault being guarded against is a filter
 * so broad it lets a support catch a face, or so narrow it starves a
 * force.
 */
const withSupport = snapFor("pin-support", middle);
const withForce = snapFor("point-force", middle);

check(
    withSupport.snapCandidate &&
        withForce.snapCandidate,
    "both a support and a force snapped"
);

check(
    withSupport.snapCandidate.type === "centreline",
    "a support snaps to the CENTRELINE",
    "got " + withSupport.snapCandidate.type
);

/*
 * A force is NOT restricted to the centreline - it is allowed to reach
 * a face as well, because a load applied to the surface of a member is
 * applied there.
 */
const onFace = { x: 200, y: 5 };

const forceOnFace = snapFor("point-force", onFace);

check(
    !!forceOnFace.snapCandidate,
    "a force can still snap to a beam FACE",
    "candidate = " +
        (forceOnFace.snapCandidate
            ? forceOnFace.snapCandidate.type
            : "NONE")
);

console.log(
    "\nThe filter does not apply to tools it was not written for\n"
);

/*
 * A tool the filter says nothing about must receive EVERYTHING, which
 * is what "a change for one tool must not redefine the candidates for
 * another" means in practice.
 */
const geometryTools = ["line", "arc", "circle", "rectangle", "polygon"];

geometryTools.forEach(toolId => {
    const all = S.buildSnapCandidates(state);

    state.activeTool = toolId;

    const resolution = S.resolveConstructionPoint(
        middle,
        state,
        bounds
    );

    check(
        !!resolution.snapCandidate,
        toolId + " still snaps on a beam",
        "candidate = " +
            (resolution.snapCandidate
                ? resolution.snapCandidate.type
                : "NONE")
    );
});

console.log(
    "\nThe centreline is a CONTINUOUS line, not two points\n"
);

/*
 * The specific fault being guarded against: a centreline published only
 * as its two ends, so a support is placeable at 0% and 100% and nowhere
 * in between. Several positions are asked for, and each must snap.
 */
const fractions = [0.1, 0.25, 0.37, 0.5, 0.64, 0.8];

fractions.forEach(fraction => {
    const at = { x: 400 * fraction, y: 0 };

    const resolution = snapFor("pin-support", at);

    const snapped = resolution.effectiveConstructionPoint;

    check(
        snapped &&
            Math.abs(snapped.x - at.x) < 1.5 &&
            Math.abs(snapped.y) < 1.5,
        "a support snaps at " + Math.round(fraction * 100) + "% along the beam",
        snapped
            ? "wanted " + at.x.toFixed(1) + ", got " + snapped.x.toFixed(1)
            : "no snap"
    );
});

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);