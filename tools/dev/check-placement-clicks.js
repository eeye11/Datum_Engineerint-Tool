/*
 * Drives drawing.js's OWN click handler for each Statics tool, through
 * the real interaction state, and checks what ends up on the sheet.
 *
 * Every other check asks the model a question. This one asks the
 * question the STUDENT asks - "I clicked the middle of this beam, what
 * happened?" - and there is no other way to find out.
 *
 * The reason it exists: a change to a shared interaction can leave the
 * snap engine, the factories and the renderer all perfectly correct, and
 * still break placement, because the fault is in which branch the click
 * reached. Nothing else in the suite looks there.
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

        /*
         * The renderer uses BOTH spellings - appendChild for most
         * things and `append` for the snap marker - so a stub that
         * only has one of them fails deep inside a draw call and the
         * message names the marker rather than the stub.
         */
        append(...nodes) {
            nodes.forEach(n => this.children.push(n));
        },
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

    /*
     * The canvas's SIZE, and it is read from two different places.
     *
     * `canvasPointFromEvent` takes the rectangle for the pointer offset
     * but takes width and height from clientWidth and clientHeight. A
     * stub that only answers getBoundingClientRect therefore converts
     * with undefined dimensions, every world point comes back NaN, and
     * a placement test fails for a reason that has nothing to do with
     * placement.
     */
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,

    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    classList: {
        add() {}, remove() {}, toggle() {}, contains: () => false
    },
    setAttribute() {},
    getAttribute: () => null,
    append(...nodes) { nodes.forEach(n => canvas.children.push(n)); },
    children: [],
    firstChild: null
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
        querySelector: (sel) => {
                /*
                 * THE CANVAS IS FOUND BY CLASS, NOT BY ID.
                 *
                 * drawing.js resolves the drawing canvas with
                 * querySelector(".drawing-canvas"), and then reads both
                 * getBoundingClientRect AND clientWidth/clientHeight on
                 * every pointer move to turn a click into a world
                 * point.
                 *
                 * Getting this wrong is quiet and misleading: a stub
                 * with only a rectangle produces undefined dimensions,
                 * so every world point comes back NaN, and a placement
                 * test then fails for a reason that has nothing to do
                 * with placement.
                 */
                if (
                    String(sel).indexOf("drawing-canvas") >= 0
                ) {
                    return canvas;
                }

                return element(sel);
            },
        querySelectorAll: () => [],
        getElementById: (id) => {
            /*
             * The canvas, with its FULL size surface.
             *
             * drawing.js captures this at load time and then reads both
             * getBoundingClientRect AND clientWidth/clientHeight on
             * every pointer move to convert a click into a world point.
             * A stub answering with anything less produces undefined
             * dimensions, so every point comes back NaN and a placement
             * test fails for a reason that has nothing to do with
             * placement.
             */
            if (id === "drawingCanvas") {
                return {
                    id,
                    clientWidth: 800,
                    clientHeight: 600,
                    width: 800,
                    height: 600,
                    style: {},
                    dataset: {},
                    classList: {
                        add() {}, remove() {}, toggle() {},
                        contains: () => false
                    },
                    children: [],
                    firstChild: null,
                    setAttribute() {},
                    getAttribute: () => null,
                    appendChild() {},
                    removeChild() {},
                    addEventListener() {},
                    removeEventListener() {},
                    setPointerCapture() {},
                    releasePointerCapture() {},
                    querySelector: (sel) =>
                        String(sel).indexOf("drawing-renderer") >= 0
                            ? canvas
                            : null,
                    querySelectorAll: () => [],
                    contains: () => false,
                    getBoundingClientRect: () => ({
                        left: 0, top: 0, width: 800, height: 600,
                        right: 800, bottom: 600
                    }),
                    focus() {}, blur() {}
                };
            }

            return {
                id,
                textContent: "",
                innerHTML: "",
                value: "",
                hidden: false,
                disabled: false,
                style: {},
                dataset: {},
                classList: {
                    add() {}, remove() {}, toggle() {},
                    contains: () => false
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
                clientWidth: 800,
                clientHeight: 600,
                focus() {}, blur() {}
            };
        },
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

const setup = `
    /* The controls drawing.js resolves by id at load time. */
    __controls = {};
    [
        "drawingProperties", "drawingToolMessage", "drawingCanvas",
        "drawingThickness", "drawingColor", "drawingLineType"
    ].forEach(id => {
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
            querySelector: (sel) =>
                String(sel).indexOf("drawing-renderer") >= 0
                    ? __svg
                    : null,
            querySelectorAll: () => [],
            closest: () => null,
            contains: () => false,
            getBoundingClientRect: () => ({
                left: 0, top: 0, width: 800, height: 600,
                right: 800, bottom: 600
            }),
            /*
             * The canvas rect is NOT the only size the conversion
             * reads: canvasPointFromEvent takes width and height from
             * clientWidth and clientHeight. A stub with only
             * getBoundingClientRect produces undefined dimensions, and
             * every world point comes back NaN - which looks like a
             * placement fault and is not one.
             */
            clientWidth: 800,
            clientHeight: 600,
            focus() {}, blur() {}
        };
    });

    /*
     * The controls have to be REACHABLE by id, not merely built.
     *
     * drawing.js resolves drawingCanvas at load time and then reads
     * its bounding rect on every pointer move to convert between world
     * and screen. A getElementById that answers with something else -
     * or with nothing - leaves that one without a rectangle, and the
     * failure surfaces a long way from its cause: a screen conversion
     * handed an undefined rect throws somewhere inside the snap
     * engine, complaining about a camera that was perfectly fine.
     */
    const __byId = { ...__controls, drawingCanvas: __controls.drawingCanvas };

    document.getElementById = id => __byId[id] || null;

    (function () {
        const style = {
            stroke: "#000000", fill: "none", lineWidth: 0.5,
            lineType: "solid", opacity: 1
        };

        __beam = window.enggDrawingState.geometryFactories.beam(
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            style
        );

        __beam.geometry.depth = 10;

        drawingState.objects.push(__beam);
    })();

    globalThis.__state = drawingState;

    globalThis.__svg = {
        setAttribute() {},
        getAttribute: () => null,
        appendChild() {},
        get firstChild() { return null; }
    };

    globalThis.__clickEvent = function (worldPoint) {
        const screen =
            window.enggDrawingState.engineeringToScreen(
                worldPoint,
                { width: 800, height: 600 },
                drawingState
            );

        return {
            preventDefault() {},
            stopPropagation() {},
            shiftKey: false,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
            button: 0,
            buttons: 0,
            clientX: screen.x,
            clientY: screen.y,
            target: null,
            currentTarget: null
        };
    };

    globalThis.__api = {
        handleCanvasClick:
            typeof handleCanvasClick === "function"
                ? handleCanvasClick : undefined,
        clearInteraction:
            typeof clearInteraction === "function"
                ? clearInteraction : undefined,
        enggDrawingState
    };
`;

try {
    vm.runInContext(
        drawingSource + setup,
        sandbox,
        { filename: "drawing.js+harness" }
    );
} catch (error) {
    console.log("  harness load failed: " + error.message);
    process.exit(1);
}

const run = sandbox.__api;

check(
    typeof run.handleCanvasClick === "function",
    "the canvas click handler is reachable"
);

/*
 * A click, as the browser delivers it.
 *
 * `handleCanvasClick` re-derives the world point from the event's
 * CLIENT coordinates - it does not trust a pre-built resolution - so
 * the client position has to be the real screen position of the world
 * point. Handing it zeros would click the top-left corner of the sheet,
 * which is nowhere near the beam and explains nothing.
 */
function clickEvent(worldPoint) {
    const screen = sandbox.enggDrawingState.engineeringToScreen(
        worldPoint,
        { width: 800, height: 600 },
        sandbox.__state
    );

    return {
        preventDefault() {},
        stopPropagation() {},
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        button: 0,
        buttons: 0,
        clientX: screen.x,
        clientY: screen.y,
        target: canvas,
        currentTarget: canvas
    };
}

console.log("\nA Point Force is placed in the MIDDLE of a beam\n");

const forceOutcome = vm.runInContext(
    `(() => {
        const style = {
            stroke: "#000000", fill: "none", lineWidth: 0.5,
            lineType: "solid", opacity: 1
        };

        drawingState.activeTool = "point-force";
        drawingState.interaction.phase = "idle";
        drawingState.interaction.points = [];

        // The MIDDLE of the beam, which is the position a tool
        // restricted to endpoints could not reach.
        const middle = { x: 200, y: 0 };

        const resolution =
            window.enggDrawingSnap.resolveConstructionPoint(
                { x: 200, y: 0 },
                drawingState,
                { width: 800, height: 600 }
            );

        globalThis.__firstResolution = resolution;

        // First click: anchor the span on the beam's centreline.
        handleCanvasClick(__clickEvent({ x: 200, y: 0 }));

        const afterFirst = {
            phase: drawingState.interaction.phase,
            objects: drawingState.objects.length
        };

        return { afterFirst, resolution };
    })()`,
    sandbox
);

check(
    forceOutcome.afterFirst.objects === 1,
    "the first click places nothing yet - a span tool needs two",
    "objects = " + forceOutcome.afterFirst.objects
);

check(
    forceOutcome.afterFirst.phase === "statics-span",
    "and arms the span for its second point",
    "phase = " + forceOutcome.afterFirst.phase
);

const forcePlaced = vm.runInContext(
    `(() => {
        const before = drawingState.objects.length;

        const resolution =
            window.enggDrawingSnap.resolveConstructionPoint(
                { x: 200, y: 80 },
                drawingState,
                { width: 800, height: 600 }
            );

        handleCanvasClick(__clickEvent({ x: 200, y: 80 }));

        const created =
            drawingState.objects[drawingState.objects.length - 1];

        return {
            added: drawingState.objects.length - before,
            type: created && created.type,
            start: created && created.geometry
                ? created.geometry.start : null,
            parentId: created && created.parentId
        };
    })()`,
    sandbox
);

check(
    forcePlaced.added === 1,
    "the second click creates the Point Force",
    "added = " + forcePlaced.added
);

check(
    forcePlaced.type === "force",
    "and it is a force",
    "type = " + forcePlaced.type
);

check(
    forcePlaced.start &&
        Math.abs(forcePlaced.start.x - 200) < 1.5,
    "applied at the MIDDLE of the beam, not an endpoint",
    JSON.stringify(forcePlaced.start)
);

check(
    forcePlaced.parentId === sandbox.__beam.id,
    "and attached to the beam it was clicked on",
    "parentId = " + forcePlaced.parentId
);

console.log("\nA Pin Support is placed in the MIDDLE of a beam\n");

const supportOutcome = vm.runInContext(
    `(() => {
        const before = drawingState.objects.length;

        drawingState.activeTool = "pin-support";
        drawingState.interaction.phase = "idle";
        drawingState.interaction.points = [];

        const resolution =
            window.enggDrawingSnap.resolveConstructionPoint(
                { x: 120, y: 0 },
                drawingState,
                { width: 800, height: 600 }
            );

        // First click: choose the body.
        handleCanvasClick({
            preventDefault() {},
            shiftKey: false,
            button: 0,
            clientX: 0,
            clientY: 0,
            resolution
        });

        const armed = drawingState.interaction.phase;

        // Second click: choose the place along it.
        handleCanvasClick(__clickEvent({ x: 120, y: 0 }));

        const created =
            drawingState.objects[drawingState.objects.length - 1];

        return {
            armed,
            added: drawingState.objects.length - before,
            type: created && created.type,
            position: created && created.geometry
                ? created.geometry.position : null,
            attachment: created && created.geometry
                ? created.geometry.attachment : null,
            parentId: created && created.parentId
        };
    })()`,
    sandbox
);

check(
    supportOutcome.added === 1,
    "a Pin Support is created by two clicks",
    "added = " + supportOutcome.added
);

check(
    supportOutcome.type === "pin-support",
    "and it is a support",
    "type = " + supportOutcome.type
);

check(
    supportOutcome.parentId === sandbox.__beam.id,
    "attached to the beam",
    "parentId = " + supportOutcome.parentId
);

check(
    supportOutcome.attachment &&
        Number.isFinite(supportOutcome.attachment.distance) &&
        supportOutcome.attachment.distance > 20 &&
        supportOutcome.attachment.distance < 380,
    "its attachment is part-way along the body, NOT an endpoint",
    "distance = " +
        (supportOutcome.attachment
            ? supportOutcome.attachment.distance
            : "none")
);

/*
 * The x of 120 was clicked, so an attachment at 120 along a beam from 0
 * is proof the centreline was snapped continuously rather than the
 * student having to aim at one of its ends.
 */
check(
    supportOutcome.attachment &&
        Math.abs(supportOutcome.attachment.distance - 120) < 2,
    "at exactly where the pointer was - 120 along a 400 body",
    "distance = " +
        (supportOutcome.attachment
            ? supportOutcome.attachment.distance
            : "none")
);

check(
    supportOutcome.position &&
        supportOutcome.position.y < 0,
    "and the symbol is drawn OUTSIDE the body",
    "position = " + JSON.stringify(supportOutcome.position)
);

console.log("\nA Distributed Load is placed over part of a beam\n");

const loadOutcome = vm.runInContext(
    `(() => {
        const before = drawingState.objects.length;

        drawingState.activeTool = "distributed-load";
        drawingState.interaction.phase = "idle";
        drawingState.interaction.points = [];

        const at = p =>
            window.enggDrawingSnap.resolveConstructionPoint(
                p,
                drawingState,
                { width: 800, height: 600 }
            );

        // Choose the body.
        handleCanvasClick(__clickEvent({ x: 0, y: 0 }));

        const armed = drawingState.interaction.phase;

        // A PARTIAL span: 100 to 300, not the whole beam.
        handleCanvasClick(__clickEvent({ x: 100, y: 0 }));

        const midway = drawingState.interaction.phase;

        handleCanvasClick(__clickEvent({ x: 300, y: 0 }));

        const created =
            drawingState.objects[drawingState.objects.length - 1];

        return {
            armed,
            midway,
            added: drawingState.objects.length - before,
            type: created && created.type,
            start: created && created.geometry
                ? created.geometry.start : null,
            end: created && created.geometry
                ? created.geometry.end : null,
            parentId: created && created.parentId
        };
    })()`,
    sandbox
);

check(
    loadOutcome.added === 1,
    "a Distributed Load is created",
    "added = " + loadOutcome.added
);

check(
    loadOutcome.type === "load",
    "and it is a load",
    "type = " + loadOutcome.type
);

check(
    loadOutcome.start && loadOutcome.end &&
        Math.abs(loadOutcome.start.x - 100) < 2 &&
        Math.abs(loadOutcome.end.x - 300) < 2,
    "over a PARTIAL span, not forced to the body's endpoints",
    JSON.stringify({
        start: loadOutcome.start,
        end: loadOutcome.end
    })
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);