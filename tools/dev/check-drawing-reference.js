/*
 * Exercises the Drawing Reference pipeline directly, in Node, with a
 * hand-built sheet. Isolates the stages so a failure is attributable.
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(
    __dirname,
    "..",
    "js",
    "engineering-drawing"
);

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
    Date,
    isNaN,
    parseFloat,
    performance: { now: () => 0 }
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
    createElement: () => ({
        style: {},
        setAttribute() {},
        appendChild() {},
        cloneNode: () => ({})
    })
};

vm.createContext(sandbox);

/* Only the reference module is needed: it is handed everything. */
/*
 * Stand-in for the export module, which is what fits the camera and
 * performs the clean render. Stubbed minimally here: the point of
 * this test is the REFERENCE pipeline - token, lookup, bounds - not
 * the renderer, which is exercised for real in the browser.
 */
sandbox.window.enggDrawingExport = {
  paddedBounds(points, width, height) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    return {
      minX: Math.min(...xs) - 20,
      minY: Math.min(...ys) - 20,
      maxX: Math.max(...xs) + 20,
      maxY: Math.max(...ys) + 20,
      width,
      height,
    };
  },
  cameraFor() {
    return { zoom: 1, panX: 0, panY: 0 };
  },
  renderClean() {
    return { childElementCount: 1 };
  },
};

sandbox.window.enggDrawingState = {
  createDrawingState: () => ({
    units: "mm",
    objects: [],
    grid: {},
    snap: {},
    styleDefaults: {},
    camera: { zoom: 1, panX: 0, panY: 0 },
  }),
};

vm.runInContext(
    fs.readFileSync(
        path.join(root, "drawing-reference.js"),
        "utf8"
    ),
    sandbox,
    { filename: "drawing-reference.js" }
);

const ref = sandbox.window.enggDrawingReference;

let failures = 0;

function check(condition, message, detail) {
    if (condition) {
        console.log("  pass  " + message);
        return;
    }

    failures += 1;
    console.log(
        "  FAIL  " + message + (detail ? " -- " + detail : "")
    );
}

/* A sheet that plainly has a line in it. */
const sheet = {
    id: "sheet_001",
    name: "Sheet 1",
    units: "mm",
    objects: [
        {
            id: "l1",
            type: "line",
            geometry: {
                start: { x: 0, y: 0 },
                end: { x: 100, y: 50 }
            }
        }
    ],
    grid: { visible: false },
    snap: {},
    styleDefaults: {}
};

console.log("Sheet lookup\n");

check(
    Boolean(
        ref.parseReferences(
            "before [DRAWING_REFERENCE:sheet_001] after"
        ).length === 1
    ),
    "a reference token is found in the source"
);

check(
    ref.parseReferences(
        "before [DRAWING_REFERENCE:sheet_001] after"
    )[0].sheetId === "sheet_001",
    "the token carries the stable sheet id"
);

/*
 * The decisive case: configure the module the way drawing.js does,
 * and ask it to render a sheet that has content. If this reports
 * empty, the failure is in the reference module or the bounds
 * provider rather than in the editor.
 */
let measuredPoints = [];

ref.configure({
    getSheet: (id) => (id === sheet.id ? sheet : null),
    getRenderedPoints: (objects) => {
        /*
         * A stand-in for renderedPointsForObjects: report the extent
         * of every line in the list.
         */
        const points = [];

        (objects || []).forEach((object) => {
            const g = object.geometry || {};

            [g.start, g.end, g.position].forEach(
                (p) => {
                    if (
                        p &&
                        Number.isFinite(p.x) &&
                        Number.isFinite(p.y)
                    ) {
                        points.push({
                            x: p.x,
                            y: p.y
                        });
                    }
                }
            );
        });

        measuredPoints = points;
        return points;
    }
});

const rendered = ref.renderDrawingReference("sheet_001", {
    width: 900,
    height: 600
});

console.log("\nRendering a sheet that has a line in it\n");

check(
    rendered?.ok === true,
    "render reports success",
    "got " + JSON.stringify(rendered?.reason)
);

check(
    rendered?.empty !== true,
    "render does NOT report the sheet as empty",
    "the placeholder text would appear if this failed"
);

check(
    measuredPoints.length > 0,
    "the bounds provider received the sheet's features",
    "measured " + measuredPoints.length + " points"
);

console.log("\nA sheet that really is empty\n");

const emptyRendered = ref.renderDrawingReference(
    "sheet_empty",
    { width: 900, height: 600 }
);

check(
    emptyRendered?.ok === false ||
        emptyRendered?.reason === "missing-sheet",
    "a missing sheet is reported as missing, not as empty",
    "got " + JSON.stringify({
        ok: emptyRendered?.ok,
        reason: emptyRendered?.reason
    })
);

/*
 * THE BUG THIS TEST EXISTS FOR.
 *
 * A sheet with features, whose extent cannot be measured, used to be
 * reported as "empty" - which is what made the written solution print
 * "Sheet 1 - this sheet is empty" over a sheet full of geometry.
 *
 * The two states must stay distinct, and a measurement failure has to
 * be reported as a failure.
 */
console.log("\nA sheet with features whose extent cannot be measured\n");

ref.configure({
    getSheet: (id) => (id === sheet.id ? sheet : null),
    /* Measures nothing, though the sheet plainly has a line in it. */
    getRenderedPoints: () => []
});

const unmeasured = ref.renderDrawingReference("sheet_001", {
    width: 900,
    height: 600
});

check(
    unmeasured?.empty !== true,
    "a measurement failure is NOT reported as an empty sheet",
    "this is what produced the false empty-sheet message"
);

check(
    unmeasured?.ok === false &&
        unmeasured?.reason === "unmeasured",
    "a measurement failure is reported as a failure",
    "got " + JSON.stringify({
        ok: unmeasured?.ok,
        reason: unmeasured?.reason
    })
);

check(
    unmeasured?.featureCount === 1,
    "the failure names how many features were on the sheet",
    "got " + unmeasured?.featureCount
);

/*
 * And the genuinely-empty case must STILL report empty, so the
 * placeholder is not simply removed but reserved for the one state it
 * is true of.
 */
console.log("\nA genuinely empty sheet still reports empty\n");

ref.configure({
    getSheet: (id) =>
        id === "blank"
            ? { ...sheet, objects: [] }
            : null,
    getRenderedPoints: () => []
});

const blank = ref.renderDrawingReference("blank", {
    width: 900,
    height: 600
});

check(
    blank?.ok === true && blank?.empty === true,
    "a sheet with no features reports empty",
    "got " + JSON.stringify({
        ok: blank?.ok,
        empty: blank?.empty
    })
);

console.log(
    "\n" +
        (failures
            ? failures + " check(s) failed"
            : "all checks passed")
);

process.exit(failures ? 1 : 0);
