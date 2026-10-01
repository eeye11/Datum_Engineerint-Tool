/*
 * Checks that the snap pipeline does not throw when a LINE candidate is
 * present, and that alignment still works.
 *
 * The fault this guards against was a real one: inference reuses the
 * snap candidate list, and a centreline is published as a line rather
 * than a point, so reading one for alignment threw - and it threw from
 * deep inside the alignment code, blaming a camera that was fine.
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
        clientWidth: 800,
        clientHeight: 600,
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

/*
 * Two members, so there are real endpoints and real centrelines to
 * align between.
 */
const first = E.geometryFactories.beam(
    { x: 0, y: 0 }, { x: 400, y: 0 }, style
);
first.geometry.depth = 10;
E.addObject(state, first);

const second = E.geometryFactories.beam(
    { x: 0, y: 200 }, { x: 400, y: 200 }, style
);
second.geometry.depth = 10;
E.addObject(state, second);

const bounds = { width: 800, height: 600 };

console.log(
    "\nA snap with a line candidate present does not throw\n"
);

/*
 * THE REGRESSION. The pointer is placed so that inference is actually
 * consulted - near a member, so candidates exist and the alignment pass
 * runs - with every tool tried, because the filter decides which
 * candidates survive to that point.
 */
const TOOLS = [
    "point-force", "distributed-load", "varying-distributed-load",
    "applied-moment", "couple",
    "pin-support", "roller-support", "fixed-support", "smooth-support",
    "beam", "truss", "cable", "shaft",
    "line", "arc", "rectangle", "circle", "polygon", "point",
    "select", "reference-point", "reference-line"
];

let threw = null;

TOOLS.forEach(toolId => {
    state.activeTool = toolId;

    [
        { x: 200, y: 0 },
        { x: 137, y: 3 },
        { x: 400, y: 0 },
        { x: 200, y: 200 }
    ].forEach(point => {
        try {
            S.resolveConstructionPoint(point, state, bounds);
        } catch (error) {
            if (!threw) {
                threw = { toolId, point, message: error.message };
            }
        }
    });
});

check(
    threw === null,
    "no tool throws while snapping near a member",
    threw
        ? toolIdLabel(threw.toolId) + " at " +
          JSON.stringify(threw.point) + " :: " + threw.message
        : ""
);

function toolIdLabel(id) {
    return id;
}

console.log(
    "\nInference returns a usable point\n"
);

/*
 * Alignment itself is covered by check-snap.js, which was written for
 * it and exercises the established paths. What matters HERE is only
 * that a snap near a member with a line candidate present still returns
 * a usable construction point rather than throwing on the way.
 */
state.activeTool = "line";

const usable = S.resolveConstructionPoint(
    { x: 137, y: 0.5 },
    state,
    bounds,
    { lineStart: { x: 0, y: 0 } }
);

check(
    usable.effectiveConstructionPoint &&
        Number.isFinite(
            usable.effectiveConstructionPoint.x
        ) &&
        Number.isFinite(
            usable.effectiveConstructionPoint.y
        ),
    "a construction point comes back, and is a real number",
    JSON.stringify(usable.effectiveConstructionPoint)
);

console.log(
    "\nThe centreline is still a snap target\n"
);

state.activeTool = "pin-support";

const centre = S.resolveConstructionPoint(
    { x: 250, y: 0 },
    state,
    bounds
);

check(
    centre.snapCandidate &&
        centre.snapCandidate.type === "centreline",
    "a support still snaps to the centreline",
    "candidate = " +
        (centre.snapCandidate ? centre.snapCandidate.type : "none")
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);