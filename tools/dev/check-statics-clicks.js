/*
 * Calls the Statics creation path the way a student does - by clicking -
 * and reports what happens.
 *
 * Every other check in the suite asks whether a function exists. This one
 * asks whether CALLING it works, which is a different question: a
 * function can be perfectly well defined and still throw the moment it
 * runs, because something it calls is out of scope.
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
    console,
    setTimeout() {},
    clearTimeout() {},
    setInterval() {},
    clearInterval() {},
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

    if (file === "drawing.js") {
        return;
    }

    const source = fs.readFileSync(
        path.join(projectRoot, "js", "engineering-drawing", file), "utf8"
    );

    try {
        vm.runInContext(source, sandbox, { filename: file });
    } catch (error) {
        /* Modules that draw at load have no canvas yet. */
    }
});

const drawingSource = fs.readFileSync(
    path.join(projectRoot, "js", "engineering-drawing", "drawing.js"),
    "utf8"
);

/*
 * Load drawing.js with the entry points published, AND with a drawing
 * state and the few controls it needs already in place - because the
 * whole point is to CALL the creation path, which needs them.
 */
const setup = `
    __state = window.enggDrawingState.createDrawingState();

    /*
     * A BEAM TO ATTACH TO.
     *
     * Without one, the body-attached path takes its "no body here"
     * branch and returns before reaching anything interesting - so the
     * test would pass without ever exercising the moment path, which is
     * the path most likely to be broken.
     *
     * drawing.js keeps its own module-level state under that name, so
     * the beam is added to it rather than to a copy: the function
     * under test reads it from there.
     */
    (function () {
        const style = {
            stroke: "#000000",
            fill: "none",
            lineWidth: 0.5,
            lineType: "solid",
            opacity: 1
        };

        __beam = window.enggDrawingState.geometryFactories.beam(
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            style
        );

        __beam.geometry.depth = 10;

        drawingState.objects.push(__beam);
    })();

    __controls = {};
    const __controlIds = [
        "drawingProperties", "drawingToolMessage", "drawingCanvas",
        "drawingThickness", "drawingColor", "drawingLineType"
    ];
    __controlIds.forEach(id => {
        __controls[id] = {
            id,
            textContent: "",
            innerHTML: "",
            value: "",
            hidden: false,
            disabled: false,
            style: {},
            dataset: {},
            classList: {
                add() {}, remove() {}, toggle() {}, contains: () => false
            },
            options: [],
            selectedOptions: [],
            selectedIndex: 0,
            firstChild: null,
            children: [],
            setAttribute() {},
            getAttribute: () => null,
            appendChild() {},
            removeChild() {},
            insertBefore() {},
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            closest: () => null,
            contains: () => false,
            getBoundingClientRect: () => ({
                left: 0, top: 0, width: 800, height: 600,
                right: 800, bottom: 600
            }),
            focus() {}, blur() {}
        };
    });

    globalThis.__reachable = {
        beginStaticsAttachment:
            typeof beginStaticsAttachment === "function"
                ? beginStaticsAttachment : undefined,
        beginOrCompleteGeometry:
            typeof beginOrCompleteGeometry === "function"
                ? beginOrCompleteGeometry : undefined,
        createStaticsFeature:
            typeof createStaticsFeature === "function"
                ? createStaticsFeature : undefined,
        staticsToolPointCount:
            typeof staticsToolPointCount === "function"
                ? staticsToolPointCount : undefined
    };
`;

let reachable = {};

try {
    vm.runInContext(
        drawingSource + setup,
        sandbox,
        { filename: "drawing.js+harness" }
    );

    reachable = sandbox.__reachable || {};
} catch (error) {
    console.log(
        "  the harness could not load: " + error.message
    );
    process.exit(1);
}

console.log("\nThe entry points resolve\n");

Object.keys(reachable).forEach(name => {
    check(
        typeof reachable[name] === "function",
        name + " is reachable",
        "typeof = " + typeof reachable[name]
    );
});

console.log(
    "\nThe body-attached path can actually be entered\n"
);

/*
 * THE CALL THAT FAILS, IF ANY.
 *
 * `beginStaticsAttachment` is what every support, moment and connection
 * goes through on its first click. Calling it with a resolution naming a
 * beam is exactly what the canvas does, so if a helper it reaches for is
 * not in scope this throws here - on the first click of any Statics
 * tool, with a ReferenceError, before anything is placed.
 */
const attempt = vm.runInContext(
    `(() => {
        const resolution = {
            effectiveConstructionPoint: { x: 200, y: 0 },
            snappedPoint: { x: 200, y: 0 },
            rawPointerPoint: { x: 200, y: 0 },
            snapCandidate: {
                type: "centreline",
                objectId: __beam.id,
                point: { x: 200, y: 0 }
            },
            inference: null,
            hoveredEntity: null
        };

        const results = {};

        // The Moment tool, which goes down its own branch.
        drawingState.activeTool = "applied-moment";
        drawingState.interaction.phase = "idle";

        try {
            beginStaticsAttachment(resolution);
            results.moment = { ok: true };
        } catch (error) {
            results.moment = {
                ok: false,
                message: error.message,
                stack: String(error.stack || "")
                    .split("\\n")
                    .slice(0, 4)
            };
        }

        // A Pin Support, which takes the ordinary body-attached path.
        drawingState.activeTool = "pin-support";
        drawingState.interaction.phase = "idle";

        try {
            beginStaticsAttachment(resolution);
            results.support = { ok: true };
        } catch (error) {
            results.support = {
                ok: false,
                message: error.message,
                stack: String(error.stack || "")
                    .split("\\n")
                    .slice(0, 4)
            };
        }

        return results;
    })()`,
    sandbox
);

console.log(
    "\nAnd the body-attached path completes\n"
);

[
    ["support", "a Pin Support can be started on a beam"],
    ["moment", "a Moment can be started on a beam"]
].forEach(([key, label]) => {
    const result = attempt[key];

    check(
        result && result.ok,
        label,
        result && !result.ok
            ? result.message + "\n      " +
              (result.stack || []).join("\n      ")
            : ""
    );
});

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);