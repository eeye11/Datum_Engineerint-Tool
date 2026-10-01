/*
 * Reports every call to referenceArcOptions() together with the
 * factory it is passed to, so any that is NOT an arc can be spotted.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(
    __dirname,
    "..",
    "js",
    "engineering-drawing",
    "drawing.js"
);

const lines = fs.readFileSync(file, "utf8").split("\n");

const calls = [];

lines.forEach((line, i) => {
    if (!line.includes("referenceArcOptions()")) {
        return;
    }

    /* The factory is named a few lines above the call. */
    let factory = "unknown";
    let kind = "unknown";

    for (let j = i; j >= Math.max(0, i - 10); j -= 1) {
        const m =
            lines[j] &&
            lines[j].match(
                /geometryFactories\.(\w+)|geometryFactories\["([\w-]+)"\]/
            );

        if (m) {
            factory = m[1] || m[2];
            break;
        }
    }

    /* And the branch it sits in. */
    for (let j = i; j >= Math.max(0, i - 40); j -= 1) {
        const b =
            lines[j] &&
            lines[j].match(
                /drawingState\.activeTool ===\s*(\w+|"[\w-]+")/
            );

        if (b) {
            kind = b[1].replace(/"/g, "");
            break;
        }
    }

    calls.push({
        line: i + 1,
        factory,
        branch: kind,
        ok: factory === "arc"
    });
});

calls.forEach((c) => {
    console.log(
        (c.ok ? "  ok      " : "  WRONG   ") +
            "L" +
            c.line +
            "  factory=" +
            c.factory +
            "  branch=" +
            c.branch
    );
});

const wrong = calls.filter((c) => !c.ok);

console.log(
    "\n" +
        calls.length +
        " call(s), " +
        wrong.length +
        " wrong"
);
