/*
 * Checks the support attachment architecture: that a support snaps to
 * the centreline and not to the body's faces, that its attachment and
 * its drawn position are separate facts, and that both survive the
 * body being moved, rotated and resized.
 *
 * The property that matters is the one the specification states
 * directly - the user clicks the centreline, and the support appears
 * OUTSIDE the body - because getting that right is only possible if
 * the two positions are genuinely different numbers rather than one
 * number drawn twice.
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
const S = sandbox.enggSnap || sandbox.enggDrawingSnap;
const F = sandbox.enggBodyFrames;
const G = sandbox.enggFeatureGeometry;

check(!!E, "drawing-state loaded");
check(!!F, "the body-frames module loaded");

const style = {
    stroke: "#000000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1
};

console.log("\nThe body's local frame\n");

const beam = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 400, y: 0 }, style);
beam.geometry.depth = 10;

const frame = F.frameOf(beam);

check(!!frame, "a beam has a local frame");
check(Math.abs(frame.length - 400) < 1e-9, "its length is the span");
check(
    Math.abs(frame.tangent.x - 1) < 1e-9 && Math.abs(frame.tangent.y) < 1e-9,
    "a level beam's tangent runs along x"
);
check(
    Math.abs(frame.normal.y - 1) < 1e-9,
    "its normal points up the screen"
);
check(
    Math.abs(frame.halfDepth - 5) < 1e-9,
    "it knows how deep it is drawn"
);

/*
 * Throughout this file "below the beam" means a SMALLER world y, not a
 * larger one.
 *
 * World coordinates grow UPWARD - `engineeringToScreen` subtracts world
 * y from the canvas centre - so a smaller world y is further DOWN the
 * screen. Reading a support's position as though y grew downward is
 * the same mistake that had every support drawn above its beam, so it
 * is worth being explicit here rather than re-deriving it per check.
 */
const below = (point, reference) => point.y < reference.y;
const above = (point, reference) => point.y > reference.y;

console.log("\nAttachment and render position are separate\n");

/*
 * The central claim. A support attached at the MIDDLE of a beam's
 * centreline is drawn BELOW it, and the two are different points.
 */
const middle = F.pointAt(frame, 200);

const placement = F.supportPlacement(beam, middle, false);

check(!!placement, "a placement is produced");
check(
    placement.attachment.x === 200 && placement.attachment.y === 0,
    "the attachment is the point clicked on the centreline",
    JSON.stringify(placement.attachment)
);
check(
    below(placement.render, placement.attachment),
    "the symbol is drawn BELOW the beam, not on it",
    "render y = " + placement.render.y
);
check(
    placement.render.x === 200,
    "and directly out from it, with no sideways shift"
);
check(
    Math.abs(placement.render.y - -(5 + F.SUPPORT_CLEARANCE)) < 1e-9,
    "it clears the beam's own depth",
    "render y = " + placement.render.y
);
check(
    placement.attachment.y !== placement.render.y,
    "the two positions really are different numbers"
);

console.log("\nFlip changes the side and nothing else\n");

const flipped = F.supportPlacement(beam, middle, true);

check(
    above(flipped.render, flipped.attachment),
    "a flipped support is drawn ABOVE the beam",
    "render y = " + flipped.render.y
);
check(
    flipped.attachment.x === placement.attachment.x &&
        flipped.attachment.y === placement.attachment.y,
    "the attachment is untouched by a flip"
);
check(
    flipped.distance === placement.distance,
    "the distance along the body is untouched by a flip"
);
check(
    Math.abs(Math.abs(flipped.render.y) - Math.abs(placement.render.y)) < 1e-9,
    "it is the same distance out, on the other side"
);

console.log("\nA rotated body's support is rotated with it\n");

const angled = E.geometryFactories.beam(
    { x: 0, y: 0 }, { x: 300, y: 200 }, style
);
angled.geometry.depth = 10;

const angledFrame = F.frameOf(angled);
const angledMiddle = F.pointAt(angledFrame, angledFrame.length / 2);
const angledPlacement = F.supportPlacement(angled, angledMiddle, false);

check(
    angledPlacement.render.x !== angledMiddle.x ||
        angledPlacement.render.y !== angledMiddle.y,
    "an angled beam's support is not drawn straight down from it",
    JSON.stringify(angledPlacement.render)
);

/*
 * The outward direction must be perpendicular to the member, which is
 * what makes it a real normal rather than a screen offset that happens
 * to look right on a level beam.
 */
const outX = angledPlacement.render.x - angledMiddle.x;
const outY = angledPlacement.render.y - angledMiddle.y;

const perpendicular =
    outX * angledFrame.tangent.x +
    outY * angledFrame.tangent.y;

check(
    Math.abs(perpendicular) < 1e-9,
    "the offset is perpendicular to the member",
    "dot = " + perpendicular
);

check(
    outY < 0,
    "and it points down the screen, as convention requires",
    "out = " + outX.toFixed(3) + ", " + outY.toFixed(3)
);

const angledAngle = F.supportAngle(angledFrame, false);

/*
 * The draw angle is a SCREEN angle and the offset is a WORLD one, so
 * they are compared after converting - screen y grows downward, which
 * is the same inversion the angle's own construction applies.
 */
const offsetLength = Math.hypot(outX, outY);
const screenAngle = Math.atan2(-outY, outX);

check(
    Math.abs(
        Math.cos(angledAngle) -
            Math.cos(screenAngle)
    ) < 1e-9 &&
        Math.abs(
            Math.sin(angledAngle) -
            Math.sin(screenAngle)
        ) < 1e-9,
    "the draw angle matches the offset it was placed with",
    "angle = " + angledAngle.toFixed(4) +
        " vs " + screenAngle.toFixed(4)
);

console.log("\nThe body changing does not disturb the attachment\n");

/* ---- the body is resized ---- */
beam.geometry.end = { x: 800, y: 0 };

/*
 * A support keeps its FRACTION of the member, so doubling the beam's
 * length moves the support out with it and leaves it at the same place
 * ON THE BODY rather than at the same distance in millimetres.
 *
 * This is the behaviour that used to be asserted the other way round. A
 * stored absolute distance kept a support at 200mm on a beam that had
 * grown to 800mm - which held the support still in the drawing but slid
 * it to a quarter of the way along, out from under whatever load it had
 * been put under. Keeping the fraction satisfies a drag and a resize at
 * once, which an absolute distance could not.
 *
 * The attachment here was written as a fraction, so it is read back
 * through the accessor rather than off the stored field.
 */
const attachmentUnderTest = { fraction: 0.25, unit: "fraction" };

const grown = F.attachmentPoint(F.frameOf(beam), attachmentUnderTest);
const grownPlacement = F.supportPlacement(beam, grown, false);

check(
    grown.x === 200,
    "a support a quarter along stays a quarter along a longer beam",
    String(grown.x)
);

/*
 * And it really is the same PLACE on the body, which is the point: the
 * millimetre distance grows with the member instead of staying put.
 */
check(
    Math.abs(F.attachmentFraction(F.frameOf(beam), attachmentUnderTest) - 0.25) < 1e-9,
    "it is still a quarter of the way along, because the beam grew",
    String(F.attachmentFraction(F.frameOf(beam), attachmentUnderTest))
);

/* ---- the body is moved ---- */
beam.geometry.start = { x: 1000, y: 500 };
beam.geometry.end = { x: 1800, y: 500 };

const movedFrame = F.frameOf(beam);
const movedAttachment = F.pointAt(movedFrame, 200);
const movedPlacement = F.supportPlacement(beam, movedAttachment, false);

check(
    movedAttachment.x === 1200 && movedAttachment.y === 500,
    "a moved body carries its support with it",
    JSON.stringify(movedAttachment)
);
check(
    below(movedPlacement.render, movedAttachment),
    "and the support is still drawn outside it",
    "render y = " + movedPlacement.render.y
);

/* ---- the body is deepened ---- */
const shallow = F.supportPlacement(
    { geometry: { start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, depth: 4 } },
    { x: 200, y: 0 },
    false
);

const deep = F.supportPlacement(
    { geometry: { start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, depth: 40 } },
    { x: 200, y: 0 },
    false
);

check(
    deep.render.y < shallow.render.y,
    "a deeper body pushes its support further out to stay clear",
    shallow.render.y + " -> " + deep.render.y
);
check(
    deep.attachment.x === 200 && deep.attachment.y === 0,
    "and the attachment is still on the centreline"
);

console.log("\nMoving a support slides it along the body\n");

/* ---- the move itself ---- */
const state = E.createDrawingState();
const moveBeam = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 400, y: 0 }, style);
moveBeam.geometry.depth = 10;
E.addObject(state, moveBeam);

const support = E.geometryFactories["pin-support"](
    { x: 200, y: 7 }, { parentId: moveBeam.id }
);
support.geometry.attachment = { distance: 200 };
support.geometry.flipped = false;
E.addObject(state, support);

const lookup = id =>
    state.objects.find(o => o.id === id) || null;

/*
 * How far along its member a feature is attached, in millimetres.
 *
 * Read through the public accessor rather than off the stored field,
 * because what is STORED is the fraction of the member and the number
 * anyone actually reasons about is the distance that fraction currently
 * represents. Reaching past the accessor into the storage format is what
 * made this file break when the representation changed: it was asserting
 * a shape of the data rather than a behaviour of the program.
 */
const alongMoveBody = (body, feature) => {
    const frame = F.frameOf(body);

    const point = F.attachmentPoint(
        frame,
        feature.geometry.attachment
    );

    return Math.hypot(
        point.x - frame.start.x,
        point.y - frame.start.y
    );
};

G.translateObject(support, 100, 0, lookup);

check(
    Math.abs(alongMoveBody(moveBeam, support) - 300) < 1e-9,
    "a drag right moves it 100 further along",
    String(alongMoveBody(moveBeam, support))
);
check(
    support.geometry.position.x === 300,
    "and the drawn position follows",
    "x = " + support.geometry.position.x
);
check(
    support.geometry.position.y < 0,
    "and it is still outside the beam"
);

/* ---- dragged past the end ---- */
G.translateObject(support, 500, 0, lookup);

check(
    Math.abs(alongMoveBody(moveBeam, support) - 400) < 1e-9,
    "a drag past the end is clamped to the body, not beyond it",
    String(alongMoveBody(moveBeam, support))
);

/* ---- dragged off the beam vertically ---- */
G.translateObject(support, 0, -300, lookup);

const after = F.supportPlacement(
    moveBeam,
    F.attachmentPoint(F.frameOf(moveBeam), support.geometry.attachment),
    support.geometry.flipped
);

check(
    alongMoveBody(moveBeam, support) >= 0 &&
        alongMoveBody(moveBeam, support) <= 400,
    "it cannot be dragged off the member it is attached to",
    String(alongMoveBody(moveBeam, support))
);
check(
    below(after.render, { x: after.render.x, y: 0 }),
    "and it is still drawn outside the beam afterwards",
    "render y = " + after.render.y
);

console.log("\nEvery support type shares the same attachment logic\n");

[
    "pin-support", "roller-support", "fixed-support", "smooth-support"
].forEach(type => {
    const built = E.geometryFactories[type]({ x: 0, y: 0 }, {});

    check(
        built.type === type,
        type + " keeps its own type"
    );
    check(
        built.geometry.flipped === false,
        type + " defaults to the conventional side"
    );
    check(
        built.geometry.attachment &&
            F.attachmentFraction(null, built.geometry.attachment) === 0,
        type + " is created with an attachment, not a bare position"
    );
});

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
