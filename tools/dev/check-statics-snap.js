/*
 * Resolves a snap the way the canvas does, with each Statics tool
 * active, over a beam.
 *
 * The candidate FILTER is the change most likely to have stopped these
 * tools working: a tool that is offered nothing it will accept snaps to
 * nothing, and every placement that depends on a snap quietly fails.
 * That failure is invisible in the model - the features are fine, the
 * factories are fine, and only the click is dead.
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
const F = sandbox.enggBodyFrames;

check(!!S, "the snap module is available");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

const state = E.createDrawingState();

const beam = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 400, y: 0 }, style);
beam.geometry.depth = 10;
E.addObject(state, beam);

const bounds = { width: 800, height: 600 };

/* Somewhere on the beam's centreline, well away from either end. */
const onCentreline = { x: 200, y: 0 };

/*
 * Ask for a snap the way resolveConstructionPoint does.
 */
function snapFor(toolId, point) {
    state.activeTool = toolId;

    return S.resolveConstructionPoint(
        point,
        state,
        bounds
    );
}

console.log("\nThe beam publishes a centreline to snap to\n");

const candidates = S.buildSnapCandidates(state);
const types = [...new Set(candidates.map(c => c.type))];

check(
    types.includes("centreline"),
    "a centreline candidate exists on a beam",
    "types = " + types.join(",")
);

const centreline = candidates.find(c => c.type === "centreline");

check(!!centreline, "and it is the beam's");
check(
    centreline && !!centreline.segment,
    "published as a LINE, not as a single point",
    centreline ? JSON.stringify(Object.keys(centreline)) : "none"
);

console.log(
    "\nEvery Statics tool can still snap onto that line\n"
);

[
    ["pin-support", "Pin Support"],
    ["roller-support", "Roller Support"],
    ["fixed-support", "Fixed Support"],
    ["smooth-support", "Smooth Support"],
    ["applied-moment", "Applied Moment"],
    ["point-force", "Point Force"],
    ["line", "Line"],
    ["select", "Select"]
].forEach(([toolId, label]) => {
    const resolution = snapFor(toolId, onCentreline);

    check(
        !!resolution.snapCandidate,
        label + " snaps on the beam's centreline",
        "candidate = " +
            (resolution.snapCandidate
                ? resolution.snapCandidate.type
                : "NONE")
    );
});

console.log(
    "\nA support snaps to the centreline and NOT to a face\n"
);

const supportSnap = snapFor("pin-support", onCentreline);

check(
    supportSnap.snapCandidate &&
        supportSnap.snapCandidate.type === "centreline",
    "the support's snap IS the centreline",
    "got " +
        (supportSnap.snapCandidate
            ? supportSnap.snapCandidate.type
            : "none")
);

/*
 * The attachment must be the point ON the beam the student aimed at -
 * not the end of the line, and not offset onto a face.
 */
check(
    supportSnap.effectiveConstructionPoint &&
        Math.abs(supportSnap.effectiveConstructionPoint.x - 200) < 0.5 &&
        Math.abs(supportSnap.effectiveConstructionPoint.y) < 0.5,
    "and it lands where the pointer was, on the centreline",
    JSON.stringify(supportSnap.effectiveConstructionPoint)
);

console.log(
    "\nA force still snaps to a face, which the filter must not have broken\n"
);

/*
 * The faces are published so a load can be applied to a surface. The
 * support filter refuses them - and the point of checking this is that
 * refusing them for SUPPORTS must not have removed them for everything
 * else.
 */
const onFace = { x: 200, y: 5 };

const forceSnap = snapFor("point-force", onFace);

check(
    !!forceSnap.snapCandidate,
    "a force over the top face still snaps to something",
    "candidate = " +
        (forceSnap.snapCandidate
            ? forceSnap.snapCandidate.type
            : "NONE")
);

console.log(
    "\nThe support is placed outside the body from that snap\n"
);

const snappedPoint =
    supportSnap.effectiveConstructionPoint;

const placement = F.supportPlacement(beam, snappedPoint, false);

check(!!placement, "a placement is produced from the snapped point");
check(
    placement && placement.render.y < placement.attachment.y,
    "the symbol goes below the beam, not onto it",
    placement
        ? "attach " + placement.attachment.y +
          " -> render " + placement.render.y
        : "none"
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);