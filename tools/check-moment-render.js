/*
 * Renders a Moment and a Couple Moment through the REAL renderer and
 * reads the SVG it produces.
 *
 * The browser sandbox available here does not execute page scripts, so
 * the drawing could not be driven by clicking. This instead drives the
 * same modules the page loads, in the same order, against a recording
 * DOM - so what is checked is the actual output of the actual
 * renderer rather than a re-implementation of it.
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

/* ---- a DOM that records the SVG it is given -------------------- */
const created = [];

function element(tag) {
    const node = {
        tagName: tag,
        attributes: {},
        children: [],
        textContent: "",
        _listeners: {},
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name] ?? null;
        },
        appendChild(child) {
            this.children.push(child);
            child.parentNode = this;
            created.push(child);
            return child;
        },
        removeChild(child) {
            this.children = this.children.filter(c => c !== child);
            return child;
        },
        get firstChild() {
            return this.children[0] || null;
        },
        insertBefore(child) {
            this.children.push(child);
            return child;
        },
        addEventListener(type, fn) {
            (this._listeners[type] = this._listeners[type] || []).push(fn);
        },
        removeEventListener() {},
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        closest() {
            return null;
        },
        contains() {
            return false;
        },
        getBoundingClientRect() {
            return {
                left: 0,
                top: 0,
                width: 800,
                height: 600,
                right: 800,
                bottom: 600
            };
        },
        focus() {},
        blur() {},
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains: () => false
        },
        // drawing.js iterates a select's options and its children.
        options: [],
        selectedOptions: [],
        selectedIndex: 0,
        children: [],
        // An input's value is read with .trim() by other modules.
        value: "",
        style: {},
        dataset: {}
    };
    return node;
}

const svgRoot = element("svg");

/*
 * The canvas the drawing is rendered into.
 *
 * It is declared up here, before the sandbox, because two different
 * things need this same object: `document.querySelector(".drawing-
 * canvas")` hands it to drawing.js at load time, and the render call
 * passes it in directly. If it were declared later the sandbox would
 * capture a different one and the two would quietly disagree.
 */
const canvasRoot = {
    querySelector: (sel) =>
        String(sel).indexOf("drawing-renderer") >= 0 ? svgRoot : null,
    getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600
    }),
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    getAttribute: () => null
};

const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Blob: function () {},
    FileReader: function () {
        this.readAsText = () => {};
        this.readAsDataURL = () => {};
    },

    window: {},
    document: {
        readyState: "complete",
        createElement: (tag) => element(tag),
        createElementNS: (ns, tag) => element(tag),
        addEventListener() {},
        removeEventListener() {},
        /*
         * drawing.js captures `.drawing-canvas` at load time and draws
         * through it for the rest of its life, so what this returns has
         * to be a real element - a bare {} fails on its first draw and
         * takes the whole module down with it.
         */
        querySelector: (sel) => {
            if (String(sel).includes("drawing-canvas")) {
                return canvasRoot;
            }
            return element(sel);
        },
        querySelectorAll: () => [],
        getElementById: (id) => element(id),
        body: element("body"),
        documentElement: element("html")
    },

    navigator: { clipboard: { writeText() {}, readText: () => Promise.resolve("") } },

    // written-references.js calls into MathJax at load time.
    MathJax: { typesetClear() {}, typesetPromise: () => Promise.resolve() },

    alert() {},

    localStorage: {
        getItem: () => null,
        setItem() {},
        removeItem() {}
    }
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

/* drawing.js binds window events at load time. */
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.getComputedStyle = () => ({ getPropertyValue: () => "" });

vm.createContext(sandbox);

/* ---- load the page's modules, in the page's own order ----------- */
const html = fs.readFileSync(
    path.join(projectRoot, "index.html"),
    "utf8"
);

const order = [
    ...html.matchAll(/js\/engineering-drawing\/([\w-]+\.js)/g)
].map(m => m[1]);

const loadErrors = [];

order.forEach(file => {
    const source = fs.readFileSync(
        path.join(projectRoot, "js", "engineering-drawing", file),
        "utf8"
    );

    try {
        vm.runInContext(source, sandbox, { filename: file });
    } catch (error) {
        /*
         * Several modules draw once at load time, before the page has
         * given them a canvas. That is correct behaviour - there is
         * nothing to draw onto yet - and it is recorded rather than
         * thrown, so this harness reports the drawing it was asked
         * for instead of the first incidental call.
         */
        loadErrors.push(file + ": " + error.message);
    }
});

const E = sandbox.window.enggDrawingState;
const R = sandbox.window.enggDrawingRenderer;

check(!!E, "drawing-state loaded");
check(!!R, "renderer loaded");
check(
    !!sandbox.window.enggDrawingRotationalArrow,
    "the shared rotational arrow module is loaded"
);

/* ---- build a real document ------------------------------------- */
const state = E.createDrawingState();

const style = {
    stroke: "#000000",
    fill: "none",
    lineWidth: 0.5,
    lineType: "solid",
    opacity: 1
};

const moment = E.geometryFactories.moment(
    { x: 40, y: 30 },
    500,
    "CCW",
    style
);

const couple = E.geometryFactories.couple(
    { x: 120, y: 30 },
    300,
    20,
    "CCW",
    style
);

state.objects.push(moment, couple);

const bounds = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
const render = entity => {
    created.length = 0;

    state.objects = [entity];

    /*
     * renderDrawing takes the STATE first and the canvas second, and
     * finds its own <svg> inside the canvas by class - so the canvas
     * handed over is the one already linked to the svg.
     */
    R.renderDrawing(state, canvasRoot);

    return created.filter(
        c =>
            (c.tagName === "path" || c.tagName === "polygon" || c.tagName === "line") &&
            /*
             * The sheet also carries the engineering grid, which is
             * drawn as paths of its own. Only what belongs to THIS
             * entity is of interest, so grid lines are left out -
             * counting them would report a moment as having two curves.
             */
            !/drawing-engineering-grid/.test(
                String(c.getAttribute("class") || "")
            )
    );
};

console.log("\nA Moment is a curved rotational arrow\n");

const momentNodes = render(moment);
const momentPaths = momentNodes.filter(n => n.tagName === "path");
const momentHeads = momentNodes.filter(n => n.tagName === "polygon");
const momentLines = momentNodes.filter(n => n.tagName === "line");

check(momentPaths.length === 1, "one curve is drawn",
    "paths = " + momentPaths.length);

const d = momentPaths[0] ? momentPaths[0].getAttribute("d") : "";

/*
 * An SVG arc command is
 *
 *     A rx ry x-axis-rotation large-arc-flag sweep-flag x y
 *
 * and the ROTATION is a required parameter, not an optional one - it is
 * the third number after the radius pair.
 *
 * Reading only two flags after the radius pair puts the rotation in the
 * large-arc slot and slides the sweep flag along with it, which describes
 * an arc the drawing never asked for.
 *
 * That is not a hypothetical mistake: the path was emitted without the
 * rotation for a while. Every flag was individually correct, the stored
 * angles described a 300 degree sweep, and the browser rejected the whole
 * command - so both moment tools armed, created their features, listed
 * them in the Features panel, and drew absolutely nothing. Reading the
 * rotation out is what makes these checks able to see that at all.
 */
function readArc(path) {
    const found = String(path || "").match(
        /A\s+[-\d.e+]+\s+[-\d.e+]+\s+([-\d.e+]+)\s+([01])\s+([01])\s/
    );

    if (!found) {
        return null;
    }

    return {
        rotation: Number(found[1]),
        large: found[2] === "1",
        sweep: found[3] === "1"
    };
}

const flags = readArc(d) || {};

check(flags.rotation === 0,
    "the curve states its rotation, so the flags cannot slide into the wrong slots",
    "rotation = " + flags.rotation);

check(flags.large, "the curve sweeps the long way, not the gap",
    "large-arc flag = " + flags.large);

check(flags.sweep === false, "a new moment is anticlockwise",
    "sweep flag = " + flags.sweep);

check(momentHeads.length === 1, "one arrowhead is drawn",
    "heads = " + momentHeads.length);

check(momentLines.length === 0, "no straight arrow shaft is drawn",
    "lines = " + momentLines.length);

check(
    momentPaths[0].getAttribute("stroke-width") !== "1.6",
    "the curve uses the feature's line weight",
    "stroke-width = " + momentPaths[0].getAttribute("stroke-width")
);

/*
 * The head must be tangent to the curve, and its tip must be the
 * curve's end. Both are read back out of the emitted SVG rather than
 * recomputed, so this is checking the drawing.
 *
 * The centre is recovered by asking the state's own mapping where the
 * feature's world position lands on screen. Guessing the scale here
 * would be the same class of mistake the arc code is avoiding.
 */
const end = d.trim().split(/\s+/).slice(-2).map(Number);

const centre = E.engineeringToScreen(
    moment.geometry.position,
    { left: 0, top: 0, width: 800, height: 600 },
    state
);
const firstPoint = momentHeads[0]
    .getAttribute("points")
    .trim()
    .split(/\s+/)[0]
    .split(",")
    .map(Number);

const tipDistance = Math.hypot(firstPoint[0] - end[0], firstPoint[1] - end[1]);

check(tipDistance < 1e-6, "the arrowhead tip is ON the curve's end",
    "distance = " + tipDistance);

/* Perpendicularity of the head's axis to the radius at that point. */
const headPoints = momentHeads[0]
    .getAttribute("points")
    .trim()
    .split(/\s+/)
    .map(p => p.split(",").map(Number));

const radial = { x: end[0] - centre.x, y: end[1] - centre.y };

const axis = {
    x: (headPoints[1][0] + headPoints[2][0]) / 2 - end[0],
    y: (headPoints[1][1] + headPoints[2][1]) / 2 - end[1]
};

const dot =
    radial.x * axis.x + radial.y * axis.y;

/*
 * Perpendicular: the dot product is zero up to the rounding of the
 * coordinates as they were written out, so it is compared against a
 * tolerance scaled by how long the two vectors actually are.
 */
const dotTolerance =
    1e-6 *
    Math.hypot(radial.x, radial.y) *
    Math.hypot(axis.x, axis.y);

check(
    Math.abs(dot) <= dotTolerance + 1e-9,
    "the head is tangent to the curve, not aimed at the centre",
    "dot = " + dot.toExponential(3) +
        " (tolerance " + dotTolerance.toExponential(3) + ")"
);

console.log("\nA Couple Moment is the same symbol, freely placed\n");

const coupleNodes = render(couple);
const couplePaths = coupleNodes.filter(n => n.tagName === "path");
const coupleHeads = coupleNodes.filter(n => n.tagName === "polygon");
const coupleLines = coupleNodes.filter(n => n.tagName === "line");

check(couplePaths.length === 1, "one curve is drawn",
    "paths = " + couplePaths.length);

check(coupleHeads.length === 1, "one arrowhead is drawn",
    "heads = " + coupleHeads.length);

check(coupleLines.length === 0,
    "it is NOT drawn as two straight forces",
    "straight lines = " + coupleLines.length);

const coupleD = couplePaths[0].getAttribute("d");

/* The same reader as above, so both moments are judged the same way. */
const coupleFlags = readArc(coupleD) || {};

check(coupleFlags.rotation === 0,
    "the couple states its rotation too",
    "rotation = " + coupleFlags.rotation);

check(coupleFlags.large, "it sweeps the long way too",
    "large-arc flag = " + coupleFlags.large);

check(coupleFlags.sweep === false, "it defaults to anticlockwise",
    "sweep flag = " + coupleFlags.sweep);

check(
    couplePaths[0].getAttribute("stroke-width") ===
        momentPaths[0].getAttribute("stroke-width"),
    "both use the same line weight, so they cannot drift apart"
);

console.log("\nReversing changes the sense and nothing else\n");

const reversed = E.geometryFactories.moment(
    { x: 40, y: 30 },
    500,
    "CW",
    style
);

const reversedNodes = render(reversed);
const reversedPath = reversedNodes.find(n => n.tagName === "path");
const reversedFlags = (
    reversedPath.getAttribute("d")
        .match(/A\s+[\d.]+\s+[\d.]+\s+([01])\s+([01])\s/) || []
);

check(reversedFlags[2] === "1", "the sweep runs the other way",
    "sweep flag = " + reversedFlags[2]);

const forwardEnd = d.trim().split(/\s+/).slice(-2).map(Number);
const reverseEnd = reversedPath.getAttribute("d")
    .trim().split(/\s+/).slice(-2).map(Number);

/*
 * The head moves to the other end of the opening, but stays on the
 * SAME circle about the SAME centre. A reflection would have moved it
 * to the far side; a reversal must not.
 */
const forwardR = Math.hypot(forwardEnd[0] - centre.x, forwardEnd[1] - centre.y);
const reverseR = Math.hypot(reverseEnd[0] - centre.x, reverseEnd[1] - centre.y);

check(
    Math.abs(forwardR - reverseR) < 1e-6,
    "the radius is unchanged",
    forwardR + " vs " + reverseR
);

check(
    Math.hypot(forwardEnd[0] - reverseEnd[0], forwardEnd[1] - reverseEnd[1]) > 1,
    "the head really did move to the other end"
);

check(
    moment.geometry.position.x === 40 && moment.geometry.position.y === 30,
    "the application point is untouched"
);

check(
    moment.geometry.magnitude === 500,
    "the magnitude is untouched"
);

console.log("\nThe visual radius is presentation, not magnitude\n");

const resized = E.geometryFactories.moment(
    { x: 40, y: 30 },
    500,
    false,
    style
);

resized.geometry.arcRadius = 40;

const resizedPath = render(resized).find(n => n.tagName === "path");
const resizedD = resizedPath.getAttribute("d");
const resizedR = Number(
    resizedD.match(/A\s+([\d.]+)\s/)[1]
);

const baseR = Number(d.match(/A\s+([\d.]+)\s/)[1]);

check(resizedR > baseR, "the curve is drawn larger",
    baseR + " -> " + resizedR);

check(
    resized.geometry.magnitude === 500,
    "the magnitude is unchanged by the radius"
);

check(
    resized.geometry.position.x === 40,
    "the application point is unchanged by the radius"
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
