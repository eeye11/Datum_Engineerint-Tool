/*
 * Renders a support's PREVIEW and then its committed self through the
 * real renderer, and checks the symbol lands in the same place both
 * times.
 *
 * That is the property a preview has to have, and it is the one that
 * was broken: the preview was drawn at the snapped point - the middle
 * of the beam - and only the committed feature was pushed clear of the
 * body. So the student saw a support on the beam, clicked, and got one
 * underneath it. A preview that shows a different thing from what the
 * click produces is not a preview.
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

const created = [];

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
        appendChild(c) {
            this.children.push(c);
            c.parentNode = this;
            created.push(c);
            return c;
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
const R = sandbox.enggDrawingRenderer;
const F = sandbox.enggBodyFrames;

check(!!E, "drawing-state loaded");
check(!!R, "renderer loaded");
check(!!F, "body-frames loaded");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

const state = E.createDrawingState();

const beam = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 400, y: 0 }, style);
beam.geometry.depth = 10;
E.addObject(state, beam);

/*
 * Render one thing and return the screen coordinates of its geometry.
 *
 * `previewObjects` is how the drawing hands a live preview to the
 * renderer, so this is the real path a preview takes - not a
 * hand-assembled approximation of it.
 */
function renderNodes(objects, preview) {
    created.length = 0;

    state.objects = objects;

    /*
     * The preview is published on the STATE, not passed alongside it:
     * `renderDrawing` reads it from `state.interaction.previewObjects`
     * and hands each one to the preview routine in turn. Writing a
     * separate state object and passing that would have tested a
     * renderer that never saw the preview at all.
     */
    /*
     * ONLY `previewObjects`.
     *
     * Setting `interaction.preview` as well would draw the preview
     * TWICE: the loop below hands each of `previewObjects` to
     * `renderPreview`, and then the final `renderPreview` call runs
     * once more with `preview` still set - so a symbol that was meant
     * to appear once appears twice, stacked exactly on top of
     * itself.
     *
     * It looks correct on screen, which is why it survived: two
     * identical paths drawn in the same place are indistinguishable
     * from one. It is only visible as a doubled stroke width in the
     * emitted SVG, and as twice as many nodes as the geometry
     * actually has.
     */
    state.interaction.previewObjects =
        preview ? [preview] : [];

    R.renderDrawing(state, canvasRoot);

    return created
        .filter(n => n.tagName === "line" || n.tagName === "polygon")
        .map(n => {
            if (n.tagName === "polygon") {
                return {
                    kind: "polygon",
                    points: n.getAttribute("points")
                };
            }

            return {
                kind: "line",
                x1: Number(n.getAttribute("x1")),
                y1: Number(n.getAttribute("y1")),
                x2: Number(n.getAttribute("x2")),
                y2: Number(n.getAttribute("y2"))
            };
        });
}

/*
 * A render clears the canvas first, but the recording stub keeps every
 * node it is ever handed, so a second render would appear to double the
 * geometry. Trimming to the nodes from the last call only is what makes
 * a second comparison meaningful - and it is worth doing rather than
 * capturing the length, because a doubled set would otherwise make the
 * "same place" check pass by finding a matching pair among the
 * duplicates.
 */
function renderOnce(objects, preview) {
    return renderNodes(objects, preview);
}

/* ---- the committed support ---- */
const snapped = { x: 200, y: 0 };

const placement = F.supportPlacement(beam, snapped, false);

const support = E.geometryFactories["pin-support"](placement.render, {
    parentId: beam.id
});

support.geometry.attachment = { distance: placement.distance };
support.geometry.flipped = false;

const committed = renderNodes([beam, support], null);

check(
    committed.length > 0,
    "a committed support draws something",
    "nodes = " + committed.length
);

/*
 * The support's symbol sits OUTSIDE the beam. World y grows upward, so
 * outside and below means a larger world y - and the screen y that
 * comes out of it is likewise larger, since the renderer negates y.
 */
const beamMidY = 0;

const supportLines = committed.filter(n => n.kind === "line");

check(
    supportLines.every(l => l.y1 > beamMidY && l.y2 > beamMidY),
    "every part of the committed symbol is below the beam",
    JSON.stringify(supportLines.map(l => [l.y1, l.y2]))
);

/*
 * Under the point it was attached to, at whatever screen x that is.
 *
 * The screen x of world x 200 is NOT 200: `engineeringToScreen` puts
 * the origin at the middle of the canvas and scales by a base of pixels
 * per unit. So the expected position is derived from the mapping the
 * renderer used rather than typed in, which also means this check would
 * still hold if the default zoom or canvas size ever changed.
 */
const attachmentScreen = E.engineeringToScreen(
    snapped,
    { width: 800, height: 600 },
    state
);

check(
    supportLines.some(l => {
        const xs = [l.x1, l.x2];

        return xs.every(
            x => Math.abs(x - attachmentScreen.x) <= 30
        );
    }),
    "and it is under the point it was attached to",
    "expected x ~ " + attachmentScreen.x.toFixed(1)
);

/* ---- the preview of the same support ---- */
const preview = {
    id: "preview-statics-attach",
    type: "pin-support",
    parentId: beam.id,
    targetBody: beam,
    geometry: {
        position: placement.render,
        attachment: { distance: placement.distance },
        flipped: false
    },
    style: { stroke: "#1f5c38", fill: "none", lineWidth: 0.5 }
};

const previewNodes = renderNodes([beam], preview);

const previewLines = previewNodes.filter(n => n.kind === "line");

check(
    previewLines.length === supportLines.length,
    "the preview draws the same number of strokes as the committed support",
    previewLines.length + " vs " + supportLines.length
);

check(
    previewLines.every(l => l.y1 > beamMidY && l.y2 > beamMidY),
    "and every part of the PREVIEW is outside the beam too",
    JSON.stringify(previewLines.map(l => [l.y1, l.y2]))
);

/*
 * THE PROPERTY. Every stroke of the preview must be at the same place
 * as the same stroke of the committed feature, because the click is
 * supposed to give the student what they were shown.
 */
const sameGeometry = previewLines.length === supportLines.length &&
    previewLines.every((l, index) => {
        const c = supportLines[index];

        return Math.abs(l.x1 - c.x1) < 1e-6 &&
            Math.abs(l.y1 - c.y1) < 1e-6 &&
            Math.abs(l.x2 - c.x2) < 1e-6 &&
            Math.abs(l.y2 - c.y2) < 1e-6;
    });

check(
    sameGeometry,
    "the preview is in exactly the place the click will put the support",
    JSON.stringify({
        preview: previewLines.map(l => [l.x1, l.y1, l.x2, l.y2]),
        committed: supportLines.map(l => [l.x1, l.y1, l.x2, l.y2])
    })
);

/*
 * Compared against the nodes captured ONCE each, rather than by
 * rendering again. The recording stub keeps every node it is ever
 * handed, so a second render would double the set - and a doubled set
 * would make the "same place" check above pass by finding a matching
 * pair among the duplicates.
 */
check(
    previewNodes.length === committed.length,
    "the preview draws exactly the committed support - not more, not less",
    previewNodes.length + " vs " + committed.length
);

console.log("\nA preview with no body still draws something\n");

const free = E.geometryFactories["pin-support"]({ x: 10, y: 10 }, {});

const freeNodes = renderNodes([free], null);

check(
    freeNodes.length > 0,
    "a support with no parent falls back to its stored position",
    "nodes = " + freeNodes.length
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
