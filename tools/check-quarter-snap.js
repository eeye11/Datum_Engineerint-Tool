/*
 * Quarter-region snapping must be a TRUSS capability.
 *
 * This checks the shared snap system directly: it builds the
 * candidate list for a drawing containing a Truss and several
 * non-truss span features, and asserts that only the Truss
 * offers quarter points.
 *
 * Run with: node tools/check-quarter-snap.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "js", "engineering-drawing");

/* Minimal stand-ins for the modules the snap system calls. */
const sandbox = {
    console,
    window: {},
    Math,
    Number,
    JSON,
    Set,
    Map,
    Array,
    Object
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

vm.runInContext(
    fs.readFileSync(path.join(root, "object-snap.js"), "utf8"),
    sandbox,
    { filename: "object-snap.js" }
);

const snap = sandbox.window.enggDrawingSnap;

if (!snap) {
    console.error("FAIL: snap module exposed nothing");
    process.exit(1);
}

const line = (id, type) => ({
    id,
    type,
    geometry: {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
    }
});

const drawing = {
    objects: [
        {
            id: "T1",
            type: "truss",
            geometry: {
                members: [
                    { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }
                ]
            }
        },
        { ...line("L1", "line") },
        { ...line("B1", "beam") },
        { ...line("C1", "cable") },
        { ...line("S1", "shaft") },
        {
            id: "R1",
            type: "rectangle",
            geometry: {
                position: { x: 0, y: 0 },
                width: 100,
                height: 50
            }
        },
        {
            id: "F1",
            type: "force",
            geometry: {
                start: { x: 0, y: 0 },
                end: { x: 100, y: 0 }
            }
        },
        {
            id: "D1",
            type: "dimension",
            geometry: {
                start: { x: 0, y: 0 },
                end: { x: 100, y: 0 }
            }
        }
    ],
    objectSnap: { enabled: true },
    snap: { enabled: false },
    selection: { selectedObjectIds: [] },
    interaction: null
};

const candidates = snap.buildSnapCandidates(drawing);

const quartersByObject = {};

candidates.forEach((candidate) => {
    if (candidate.type !== "quarter") {
        return;
    }

    quartersByObject[candidate.objectId] =
        (quartersByObject[candidate.objectId] || 0) + 1;
});

let failures = 0;

function check(condition, message) {
    if (condition) {
        console.log("  pass  " + message);
        return;
    }

    failures += 1;
    console.log("  FAIL  " + message);
}

console.log("Quarter-region snapping is Truss-only\n");

console.log("Truss:");
check(
    (quartersByObject.T1 || 0) === 2,
    "a truss member offers its 25% and 75% points (got " +
        (quartersByObject.T1 || 0) + ")"
);

console.log("Everything else:");
["L1", "B1", "C1", "S1", "R1", "F1", "D1"].forEach((id) => {
    check(
        !quartersByObject[id],
        id + " offers no quarter point"
    );
});

console.log(
    "\n" +
        (failures
            ? failures + " check(s) failed"
            : "all checks passed")
);

process.exit(failures ? 1 : 0);
