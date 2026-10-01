/*
 * Checks that every function the Statics creation path can enter is
 * defined AT THE SCOPE ITS CALLERS USE.
 *
 * This catches a fault class the module-load check cannot see. Every
 * module still parses, every feature factory still works, every unit
 * test of the model still passes - and yet clicking any Statics tool
 * throws, because a helper is declared inside some other function and so
 * is not in scope where it is called from.
 *
 * That is invisible until a student clicks, and invisible to every
 * other check in the suite, because it is a property of the source's
 * SCOPE rather than of any value it computes.
 *
 * The functions are file-scope in drawing.js, which the page keeps to
 * itself. So this re-runs the shipped file's own text in a second
 * context that also loads everything drawing.js depends on, and asks
 * whether each name resolves at the top level - which is the only scope
 * a top-level caller can see.
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

/*
 * Every function the Statics creation path can enter.
 *
 * Not a sample: a name that has drifted out of scope is caught even when
 * it belongs to a tool nobody happened to place while testing.
 */
const ENTRY_POINTS = [
    "beginOrCompleteGeometry",
    "beginStaticsAttachment",
    "beginMomentPlacement",
    "commitMomentPlacement",
    "createStaticsFeature",
    "continueStaticsAttachment",
    "staticsAttachmentGeometry",
    "staticsPreviewType",
    "bodyAttachedPreview",
    "staticsSpanPreview",
    "beginAnalysisDiagram",
    "commitAnalysisAxis",
    "analysisAxisForPlacement",
    "resolveAnalysisAxisPointer",
    "isBodyAttachedTool",
    "staticsToolPointCount",
    "staticsBodyAtPoint",
    "finishActiveConstruction",
    "updatePreview",
    "updateDrawingCoordinates",
    "handleCanvasClick",
    "selectFromCanvasClick",
    "shouldClickSelectExistingObject",
    "deleteSelectedObjects",
    "momentDirectionOf",
    "supportPanelRows",
    "arcRadiusRow"
];

/*
 * Build one context.
 *
 * The page's modules, in the page's order, against a DOM stub complete
 * enough for them to load.
 */
function buildContext(options = {}) {
    const skip = options.skip || null;
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
            left: 0, top: 0, width: 800, height: 600,
            right: 800, bottom: 600
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

    const context = {
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
            clipboard: {
                writeText() {},
                readText: () => Promise.resolve("")
            }
        },
        MathJax: {
            typesetClear() {},
            typesetPromise: () => Promise.resolve()
        },
        alert() {},
        localStorage: {
            getItem: () => null, setItem() {}, removeItem() {}
        },
        document: {
            readyState: "complete",
            createElement: (t) => element(t),
            createElementNS: (ns, t) => element(t),
            addEventListener() {},
            removeEventListener() {},
            querySelector: (sel) =>
                String(sel).indexOf("drawing-canvas") >= 0
                    ? canvas
                    : element(sel),
            querySelectorAll: () => [],
            getElementById: (id) => element(id),
            body: element("body"),
            documentElement: element("html")
        }
    };

    context.window = context;
    context.globalThis = context;
    context.self = context;
    context.addEventListener = () => {};
    context.removeEventListener = () => {};
    context.getComputedStyle = () => ({
        getPropertyValue: () => ""
    });

    vm.createContext(context);

    const html = fs.readFileSync(
        path.join(projectRoot, "index.html"),
        "utf8"
    );

    [...html.matchAll(/js\/engineering-drawing\/([\w-]+\.js)/g)]
        .forEach(m => {
            const file = m[1];

            if (skip && file.indexOf(skip) >= 0) {
                return;
            }

            const source = fs.readFileSync(
                path.join(projectRoot, "js", "engineering-drawing", file),
                "utf8"
            );
            try {
                vm.runInContext(source, context, { filename: file });
            } catch (error) {
                /* Modules that draw at load have no canvas yet. */
            }
        });

    return context;
}

/* ---- ask whether each entry point resolves at the top level ------ */

/*
 * A SECOND, SEPARATE CONTEXT.
 *
 * drawing.js was already loaded into `context` by the page-order pass
 * above, so re-running the same text in that context redeclares its
 * module constants and throws before reaching the probe. The second
 * context loads the page's other modules - which is what drawing.js
 * needs in order to evaluate - but NOT drawing.js itself, so the probe
 * is the only copy of it.
 */
const probeContext = buildContext({
    skip: "drawing.js"
});

const drawingSource = fs.readFileSync(
    path.join(projectRoot, "js", "engineering-drawing", "drawing.js"),
    "utf8"
);

const exportStatement =
    "\n;globalThis.__reachable = {" +
    ENTRY_POINTS.map(
        name =>
            name + ": typeof " + name + " === 'function' ? " + name +
            " : undefined"
    ).join(",") +
    "};";

let reachable = {};

try {
    vm.runInContext(
        drawingSource + exportStatement,
        probeContext,
        { filename: "drawing.js+probe" }
    );

    reachable = probeContext.__reachable || {};
} catch (error) {
    console.log(
        "  the probe could not run: " + error.message
    );
}

console.log("\nEvery Statics entry point is in scope\n");

ENTRY_POINTS.forEach(name => {
    check(
        typeof reachable[name] === "function",
        name + " is reachable from a top-level caller",
        "typeof = " + typeof reachable[name]
    );
});

/*
 * And the SOURCE asked the same question, with the runtime as the
 * authority.
 *
 * Indentation alone is not evidence: several helpers in this file are
 * deliberately indented as locals of their surrounding block, and
 * counting braces by hand cannot tell a nested declaration from a
 * top-level one that happens to be indented - it gets template literals
 * wrong. So indentation is reported as INFORMATION, and a check only
 * fails when the runtime probe cannot resolve the name either.
 */
console.log(
    "\nEvery entry point resolves at run time\n"
);

ENTRY_POINTS.forEach(name => {
    check(
        typeof reachable[name] === "function",
        name + " resolves for a caller that runs it",
        "typeof = " + typeof reachable[name]
    );
});

console.log(
    "\nWhere each is declared\n"
);

const lines = drawingSource.split("\n");

ENTRY_POINTS.forEach(name => {
    const at = lines.findIndex(line =>
        new RegExp("^\\s*function\\s+" + name + "\\b").test(line)
    );

    if (at < 0) {
        console.log("  " + name + ": no declaration found");
        return;
    }

    const indented = /^\s/.test(lines[at]);

    console.log(
        "  " +
        (indented ? "indented" : "top level") +
        "  " + name + " (line " + (at + 1) + ")"
    );
});

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);