/*
 * Checks the Moment's SEMANTIC model, which is what this change is
 * really about: that direction is a readable word, that reversing it
 * touches nothing else, that the radius is presentation and never the
 * magnitude, and that a Moment and a Couple Moment are told apart by
 * needing a body rather than by looking different.
 *
 * The curved arrow itself, its tangent arrowhead and its line weight
 * are checked by check-rotational-arrow and check-moment-render,
 * which read the SVG the renderer actually produced.
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
const R = sandbox.enggDrawingRotationalArrow;

check(!!E, "drawing-state loaded");
check(!!R, "the rotational arrow module loaded");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

console.log("\nThe parts of a moment are separate facts\n");

const moment = E.geometryFactories.moment(
    { x: 100, y: 50 },
    500,
    "CCW",
    style
);

check(moment.type === "moment", "it is a real Moment feature");
check(!!moment.id, "with a stable id");
check(
    moment.geometry.direction === "CCW",
    "its direction is the WORD CCW, not a flag",
    String(moment.geometry.direction)
);
check(
    moment.geometry.magnitude === 500,
    "its magnitude is 500"
);
check(
    moment.geometry.unit === "N·m",
    "its unit is stored on the feature, not assumed",
    String(moment.geometry.unit)
);
check(
    moment.geometry.arcRadius === undefined,
    "an unresized moment stores NO radius",
    String(moment.geometry.arcRadius)
);

console.log("\nThe radius is presentation and never the magnitude\n");

const big = E.geometryFactories.moment({ x: 0, y: 0 }, 5000, "CCW", style);
const small = E.geometryFactories.moment({ x: 0, y: 0 }, 1, "CCW", style);

const bigArc = R.arcFor({ x: 0, y: 0 }, false, big.geometry.arcRadius);
const smallArc = R.arcFor({ x: 0, y: 0 }, false, small.geometry.arcRadius);

check(
    bigArc.radius === smallArc.radius,
    "a 5000 N-m moment and a 1 N-m one are drawn the same size",
    bigArc.radius + " vs " + smallArc.radius
);

big.geometry.arcRadius = 60;
const resized = R.arcFor({ x: 0, y: 0 }, false, big.geometry.arcRadius);

check(
    resized.radius === 60,
    "the radius can be changed for readability"
);
check(
    big.geometry.magnitude === 5000,
    "and the magnitude is untouched by it",
    String(big.geometry.magnitude)
);
check(
    big.geometry.direction === "CCW",
    "and so is the direction"
);

console.log("\nReverse changes the sense and nothing else\n");

/*
 * The reversal is performed the way the application performs it: one
 * field is written, and the renderer works the rest out from it.
 */
const reversal = E.createDrawingState();
E.addObject(reversal, moment);

const before = JSON.parse(JSON.stringify(moment.geometry));
const styleBefore = JSON.stringify(moment.style);

moment.geometry.direction =
    moment.geometry.direction === "CW" ? "CCW" : "CW";

check(
    moment.geometry.direction === "CW",
    "CCW becomes CW"
);

moment.geometry.direction =
    moment.geometry.direction === "CW" ? "CCW" : "CW";

check(
    moment.geometry.direction === "CCW",
    "and back again"
);

check(
    moment.geometry.position.x === before.position.x &&
        moment.geometry.position.y === before.position.y,
    "the application point never moves",
    JSON.stringify(moment.geometry.position)
);
check(
    moment.geometry.magnitude === before.magnitude,
    "the magnitude is never touched"
);
check(
    moment.geometry.arcRadius === before.arcRadius,
    "the radius is never touched"
);
check(
    JSON.stringify(moment.style) === styleBefore,
    "the style is never touched"
);

/*
 * A reversal is not a reflection. Every point of the symbol stays on
 * the SAME circle about the SAME centre - what changes is which way
 * round the ink runs, not which side of the application point it is
 * on.
 */
const ccwArc = R.arcFor({ x: 100, y: 50 }, false, 20);
const cwArc = R.arcFor({ x: 100, y: 50 }, true, 20);

const ccwRadius = Math.hypot(
    ccwArc.tip.x - ccwArc.center.x,
    ccwArc.tip.y - ccwArc.center.y
);
const cwRadius = Math.hypot(
    cwArc.tip.x - cwArc.center.x,
    cwArc.tip.y - cwArc.center.y
);

check(
    Math.abs(ccwRadius - cwRadius) < 1e-9,
    "both directions sit on the same circle",
    ccwRadius + " vs " + cwRadius
);
check(
    Math.hypot(
        ccwArc.tip.x - cwArc.tip.x,
        ccwArc.tip.y - cwArc.tip.y
    ) > 1,
    "and the head really did move to the other end of the opening"
);

console.log("\nThe head follows the direction\n");

check(
    ccwArc.sweepFlag === 0 && cwArc.sweepFlag === 1,
    "the two directions sweep opposite ways round the circle"
);
check(
    ccwArc.largeArcFlag === 1 && cwArc.largeArcFlag === 1,
    "and both sweep the long way, leaving the gap for the head"
);

/*
 * The head is tangent in each direction - a head aimed at the centre
 * would be a force, not a moment, and that is the specific fault the
 * shared renderer exists to prevent.
 */
[ccwArc, cwArc].forEach((arc, index) => {
    const radial = {
        x: arc.tip.x - arc.center.x,
        y: arc.tip.y - arc.center.y
    };

    const dot =
        radial.x * arc.tangent.x +
        radial.y * arc.tangent.y;

    check(
        Math.abs(dot) < 1e-9,
        (index ? "CW" : "CCW") +
            ": the head is tangent, not aimed at the centre",
        "dot = " + dot.toExponential(2)
    );
});

console.log("\nAn older drawing keeps the direction it was drawn with\n");

const legacy = {
    id: "legacy-moment",
    type: "moment",
    geometry: {
        position: { x: 0, y: 0 },
        magnitude: 10,

        /*
         * The OLD flag. A file saved before directions were words
         * stores this, and if it is ignored every moment in an
         * existing drawing would silently become anticlockwise the
         * moment it was opened.
         */
        clockwise: true
    },
    style
};

check(
    typeof legacy.geometry.clockwise === "boolean",
    "a legacy moment carries a boolean"
);

const legacyArc = R.arcFor({ x: 0, y: 0 }, legacy.geometry.clockwise, 16);

check(
    legacyArc.sweepFlag === 1,
    "which still reads as clockwise, so the arrow still turns the same way"
);

console.log("\nA Couple Moment is a Moment that needs no body\n");

const couple = E.geometryFactories.couple(
    { x: 200, y: 50 },
    300,
    20,
    "CCW",
    style
);

check(couple.type === "couple", "it is its own feature type, not a force");
check(
    couple.geometry.direction === "CCW",
    "with the same direction word a Moment uses"
);
check(
    couple.geometry.unit === "N·m",
    "and the same unit"
);
check(
    couple.geometry.position.x === 200,
    "and its own placement point"
);

/*
 * The distinction between the two is NEEDING A BODY, and it must not
 * leak into how either is stored or drawn - otherwise they would drift
 * apart visually and the only thing telling them apart would be an
 * implementation detail.
 */
const coupleArc = R.arcFor({ x: 200, y: 50 }, false, 16);
const momentArc = R.arcFor({ x: 100, y: 50 }, false, 16);

/*
 * The DEFAULT placement of the two, both measured from their own
 * centre, and compared with a TOLERANCE rather than exactly.
 *
 * The two arcs are computed from different centres - 200 and 100 - so
 * the subtractions differ in the last bit or two of a double. The
 * property being checked is that the two are drawn by one routine, and
 * exact equality would be asserting that two floating-point
 * subtractions produce identical bits, which is not a property of the
 * drawing but of the particular numbers chosen.
 */
const coupleOffset = {
    x: coupleArc.tip.x - coupleArc.center.x,
    y: coupleArc.tip.y - coupleArc.center.y
};

const momentOffset = {
    x: momentArc.tip.x - momentArc.center.x,
    y: momentArc.tip.y - momentArc.center.y
};

check(
    coupleArc.radius === momentArc.radius,
    "both are drawn by the same renderer at the same default size"
);
check(
    coupleArc.sweepExtent === momentArc.sweepExtent,
    "and sweep identically"
);
check(
    Math.abs(coupleOffset.x - momentOffset.x) < 1e-9 &&
        Math.abs(coupleOffset.y - momentOffset.y) < 1e-9,
    "so neither can be told from the drawing by accident",
    JSON.stringify({ coupleOffset, momentOffset })
);

check(
    couple.geometry.position &&
        !couple.geometry.start &&
        !couple.geometry.end,
    "a couple is a rotation, not a vector with two ends",
    JSON.stringify(Object.keys(couple.geometry))
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
