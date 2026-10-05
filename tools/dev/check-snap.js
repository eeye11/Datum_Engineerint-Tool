/*
 * Shared snap behaviour checks.
 *
 * Exercises the snap system the way a construction does: raw
 * cursor position in, resolved point and message out. Covers the
 * behaviours that are easy to break and hard to notice.
 *
 * Run with: node tools/check-snap.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "js", "engineering-drawing");

const sandbox = {
    console,
    window: {},
    Math,
    Number,
    JSON,
    Set,
    Map,
    Array,
    Object,
    String,
    Boolean,
    isNaN,
    parseFloat
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const BASE_PIXELS_PER_UNIT = 1;

sandbox.enggDrawingState = {
    BASE_PIXELS_PER_UNIT,
    engineeringToScreen(point, bounds, state) {
        return {
            x: point.x * BASE_PIXELS_PER_UNIT * state.camera.zoom,
            y: point.y * BASE_PIXELS_PER_UNIT * state.camera.zoom
        };
    },
    snapCoordinate(value) {
        return value;
    }
};

sandbox.enggLoadProfile = {
    profilePoints: () => [],
    pointAlong: () => null,
    loadBodyNormal: () => ({ x: 0, y: 1 })
};

sandbox.enggFeatureGeometry = {
    rigidBodyShape: () => "rectangle",
    definingPoints: () => []
};

vm.createContext(sandbox);

vm.runInContext(
    fs.readFileSync(path.join(root, "object-snap.js"), "utf8"),
    sandbox,
    { filename: "object-snap.js" }
);

const snap = sandbox.window.enggDrawingSnap;

let failures = 0;

function check(condition, message, detail) {
    if (condition) {
        console.log("  pass  " + message);
        return;
    }

    failures += 1;
    console.log("  FAIL  " + message + (detail ? " -- " + detail : ""));
}

const BOUNDS = { left: 0, top: 0, width: 800, height: 600 };

function makeState(overrides = {}) {
    return {
        camera: { zoom: 1, x: 0, y: 0 },
        objectSnap: { enabled: true },
        snap: { enabled: false },
        selection: { selectedObjectIds: [] },
        objects: [],
        interaction: null,
        ...overrides
    };
}

/*
 * A single point feature is the cleanest probe for tolerance: one
 * target, no spans, so nothing else can win the snap.
 */
const probe = {
    id: "P1",
    type: "point",
    geometry: { position: { x: 0, y: 0 } }
};

/*
 * Walk in from the left until the snap takes, and report how far
 * away the target still caught it. At 100% zoom a world unit is a
 * screen pixel, so this is the on-screen reach.
 */
function snapReach(runningState) {
    for (let d = 60; d >= 0; d -= 0.5) {
        const resolved = snap.resolveConstructionPoint(
            { x: -d, y: 0 },
            runningState,
            BOUNDS
        );

        if (resolved.snapCandidate?.objectId === "P1") {
            return d;
        }
    }

    return 0;
}

console.log("Snap tolerance is tool-aware\n");

const defaultReach = snapReach(
    makeState({ objects: [probe] })
);

const trussReach = snapReach(
    makeState({
        objects: [probe],
        activeTool: "truss"
    })
);

check(
    trussReach > defaultReach,
    "a truss snaps from further away than a default tool",
    "truss " + trussReach + " against default " + defaultReach
);

check(
    trussReach <= defaultReach * 1.6,
    "the truss tolerance stays generous rather than loose",
    "truss reach " + trussReach + " against default " + defaultReach
);

/*
 * A construction that has moved on from its first click keeps its
 * own tolerance, because the armed tool is no longer the truss.
 */
const constructionReach = snapReach(
    makeState({
        objects: [probe],
        activeTool: "select",
        interaction: {
            phase: "truss-construct",
            snapToolId: "truss"
        }
    })
);

check(
    constructionReach === trussReach,
    "a truss under construction keeps its wider tolerance",
    "got " + constructionReach + ", expected " + trussReach
);

/*
 * A non-truss tool must NOT inherit the truss tolerance. The wider
 * catch belongs to the truss alone, and a beam keeping the default
 * is what proves the rule is a per-tool capability rather than a
 * blanket loosening.
 */
const beamReach = snapReach(
    makeState({
        objects: [probe],
        activeTool: "beam"
    })
);

check(
    beamReach === defaultReach,
    "a beam keeps the default tolerance",
    "beam " + beamReach + ", default " + defaultReach
);

/*
 * Zoom must not change how far the snap reaches ON SCREEN, which is
 * what makes it feel identical at every zoom. In world units the
 * reach must shrink as zoom grows.
 */
const zoomedReach = snapReach(
    makeState({
        objects: [probe],
        activeTool: "truss",
        camera: { zoom: 4, x: 0, y: 0 }
    })
);

check(
    Math.abs(zoomedReach - trussReach / 4) < 1,
    "the world-space reach shrinks with zoom, so the on-screen reach is constant",
    "at 400% zoom the world reach is " + zoomedReach + ", expected " + trussReach / 4
);

console.log("\nAlignment resolves the point before the click\n");

const aligned = makeState({
    objects: [
        {
            id: "L1",
            type: "line",
            geometry: {
                start: { x: 0, y: 0 },
                end: { x: 400, y: 0 }
            }
        }
    ]
});

/*
 * The cursor sits OFF the line but within the alignment band. Near
 * the line itself a point-on-object snap would win outright, which
 * is correct but would leave the alignment path untested.
 */
const CURSOR = { x: 137, y: 24 };
const CLEAR = { x: 137, y: 200 };

const insideRegion = snap.resolveConstructionPoint(
    CURSOR,
    aligned,
    BOUNDS
);

check(
    !!insideRegion.inference,
    "an alignment guide is produced inside the snap region"
);

check(
    !!insideRegion.guideline,
    "a guide is shown inside the snap region"
);

/*
 * The PREVIEW must already be on the axis. A guide claiming an
 * alignment while the geometry is still off-axis is worse than no
 * guide at all: it tells the student the snap is working when the
 * point they are about to commit is not on it.
 */
const preview = insideRegion.effectiveConstructionPoint;

check(
    Math.abs(preview.y) < 1e-9,
    "the preview is already on the axis the guide claims",
    "guide claims horizontal but the point sits at y = " + preview.y
);

check(
    Math.abs(preview.x - CURSOR.x) < 1e-9,
    "the preview keeps the cursor's own x, so the point follows the hand"
);

console.log("\nGuideline hold\n");

/*
 * Moving well clear of the region produces no current inference,
 * but the guide is still held from the previous frame, because the
 * previous frame is what is on screen. This is what stops it
 * flickering off on the first small movement out of tolerance.
 */
aligned.interaction = {
    phase: "first-point",
    guideline: {
        inference: insideRegion.guideline,
        at: snap.nowMs()
    }
};

const justOutside = snap.resolveConstructionPoint(
    CLEAR,
    aligned,
    BOUNDS
);

check(
    !justOutside.inference,
    "no inference is claimed well outside the region"
);

check(
    !!justOutside.guideline,
    "the guide is still held immediately after leaving the region"
);

/*
 * Once the hold has expired the guide goes. It is a drafting aid,
 * not a permanent fixture.
 */
aligned.interaction.guideline = {
    inference: insideRegion.guideline,
    at: snap.nowMs() - 5000
};

const expired = snap.resolveConstructionPoint(
    CLEAR,
    aligned,
    BOUNDS
);

check(
    !expired.guideline,
    "the guide is dropped once its hold has expired"
);

console.log(
    "\n" + (failures ? failures + " check(s) failed" : "all checks passed")
);

process.exit(failures ? 1 : 0);
