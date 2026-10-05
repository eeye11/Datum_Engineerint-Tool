/*
 * Checks the two Features-panel problems that are measurable without a
 * browser: that the panel's CSS cannot produce a horizontal scrollbar,
 * and that an SFD/BMD/AFD says what its two axes measure.
 *
 * The CSS is checked by reading it and asking the questions a browser
 * would answer - can a grid track shrink, can a field shrink inside it,
 * can a label wrap - rather than by looking at a screenshot, because
 * these are exactly the declarations that decide whether content fits.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

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

const css = fs.readFileSync(
    path.join(projectRoot, "css", "engineering-drawing.css"),
    "utf8"
);

const drawingSource = fs.readFileSync(
    path.join(projectRoot, "js", "engineering-drawing", "drawing.js"),
    "utf8"
);

const rendererSource = fs.readFileSync(
    path.join(projectRoot, "js", "engineering-drawing", "renderer.js"),
    "utf8"
);

/*
 * Pull one rule out of the stylesheet.
 *
 * The rules here are written over several lines, with the declarations
 * one per line and long explanations between them, so matching a brace
 * pair with indexOf would run past the end of the rule. This walks the
 * braces instead.
 *
 * Comments are removed once, up front, over the whole file - the
 * explanations contain example braces that would otherwise throw the
 * depth count off - and every index below is then an index into that
 * stripped text, so the positions all refer to the same string.
 */
const styles = css.replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector) {
    const at = styles.indexOf(selector);

    if (at < 0) {
        return null;
    }

    const brace = styles.indexOf("{", at);

    if (brace < 0) {
        return null;
    }

    let depth = 0;

    for (let i = brace; i < styles.length; i += 1) {
        if (styles[i] === "{") {
            depth += 1;
        } else if (styles[i] === "}") {
            depth -= 1;

            if (depth === 0) {
                return styles.slice(at, i);
            }
        }
    }

    return styles.slice(at);
}

console.log(
    "\nThe panel scrolls vertically and not sideways\n"
);

const properties = rule("#drawingProperties");

check(!!properties, "the Features panel body has a rule");
check(
    properties && /overflow-x:\s*hidden/.test(properties),
    "and clips horizontal overflow",
    properties
);
check(
    properties && /overflow-y:\s*auto/.test(properties),
    "while scrolling vertically",
    properties
);

console.log(
    "\nA property row's tracks can actually shrink\n"
);

const grid = rule(".drawing-property-grid ");

check(!!grid, "the property grid has a rule");

/*
 * A grid track written as `minmax(46px, 1fr)` has a MINIMUM of 46px,
 * so it cannot go below it no matter how narrow the panel is. The
 * track has to be `minmax(0, ...)` for the column to be flexible, and
 * without that the inputs inside it were what forced the row wider
 * than the panel and hung its right-hand side off the edge.
 */
function tracks(text) {
    return (text || "").match(
        /grid-template-columns:[\s\S]*?;/
    )?.[0];
}

/*
 * A track's FIRST argument is its minimum. `minmax(0, 18px)` is fully
 * flexible - 18px is where it would LIKE to sit, not a floor - while
 * `minmax(46px, 1fr)` cannot go below 46px however narrow the panel
 * gets. So the test is that every minimum is zero, not that the digits
 * 18 and 14 are absent.
 */
function flooredTracks(text) {
    return [...(text || "").matchAll(/minmax\(\s*([^,]+),/g)]
        .map((match) => match[1].trim())
        .filter((minimum) => minimum !== "0");
}

check(
    grid && flooredTracks(grid).length === 0,
    "no track has a fixed pixel minimum",
    tracks(grid) + " floored at " + JSON.stringify(flooredTracks(grid))
);

check(
    grid && /minmax\(0/.test(grid),
    "the tracks are declared flexible",
    tracks(grid)
);

/*
 * The GRID ITSELF also needs min-width: 0. As a flex item it would
 * otherwise be floored at the widest row inside it, so even fully
 * flexible tracks could not bring the panel back under control.
 */
check(
    grid && /min-width:\s*0/.test(grid),
    "the grid may itself shrink below its content",
    grid
);

const valueGrid = rule(".drawing-property-grid-value");

check(
    valueGrid && flooredTracks(valueGrid).length === 0,
    "and the value variant does not reintroduce a fixed minimum",
    tracks(valueGrid) + " floored at " + JSON.stringify(flooredTracks(valueGrid))
);

console.log(
    "\nFields and labels fit inside their track\n"
);

const fields = rule(
    ".drawing-property-grid input[type=\"number\"]"
);

check(
    fields && /width:\s*100%/.test(fields),
    "inputs and selects fill the track rather than exceeding it",
    fields
);
check(
    fields && /min-width:\s*0/.test(fields),
    "and are allowed to shrink below their intrinsic size",
    fields
);

const label = rule(".drawing-property-grid-label");

check(
    label && /overflow-wrap:\s*anywhere/.test(label),
    "a long label breaks rather than widening its column",
    label
);
check(
    label && !/white-space:\s*nowrap/.test(label),
    "and is never held on one line",
    label
);

const readonly = rule(".drawing-property-readonly");

check(
    readonly && !/text-overflow:\s*ellipsis/.test(readonly),
    "a read-only value is not silently truncated",
    readonly
);
check(
    readonly && /white-space:\s*normal/.test(readonly),
    "but wraps instead",
    readonly
);

const action = rule(".drawing-property-action");

check(
    action && /width:\s*100%/.test(action),
    "an action button fills its column",
    action
);
check(
    action && /min-width:\s*0/.test(action),
    "and may shrink",
    action
);

console.log(
    "\nThe parent relation is a wrapping row, not a sentence\n"
);

/*
 * "Relative to: <name>" was one unbreakable string, so a feature with
 * a long name pushed the whole panel sideways and the relation itself
 * - the only thing the row exists to say - was what got cut off.
 */
check(
    drawingSource.includes("Relative to") &&
        /drawing-property-readonly">\$\{parentName\}/.test(drawingSource),
    "the parent name sits in its own wrapping value cell",
    "not found"
);

check(
    !/Relative to: \$\{parent\.name\}/.test(drawingSource),
    "the old prose form is gone"
);

console.log(
    "\nAn SFD, BMD and AFD say what their axes measure\n"
);

/*
 * Each diagram's ordinate has to be named, or the student is asked to
 * plot a value on an axis that does not say which value.
 */
[
    ["sfd", "Shear force", "kN"],
    ["bmd", "Bending moment", "kN·m"],
    ["afd", "Axial force", "kN"]
].forEach(([key, quantity, unit]) => {
    const at = rendererSource.indexOf(
        key + ": {"
    );

    const block = rendererSource.slice(
        at,
        at + 220
    );

    check(
        block.includes(quantity),
        key.toUpperCase() + " names its ordinate: " + quantity,
        block.slice(0, 120)
    );
    check(
        block.includes(unit),
        key.toUpperCase() + " gives its unit: " + unit,
        block.slice(0, 120)
    );
});

check(
    rendererSource.includes("ANALYSIS_DIAGRAM_AXES["),
    "the renderer looks the axes up by diagram kind"
);

check(
    /axes\.y \+ " \(" \+ axes\.unit/.test(rendererSource),
    "and writes the quantity together with its unit"
);

check(
    /axes\.x \+ " \(" \+ axes\.xUnit/.test(rendererSource),
    "and does the same for the abscissa"
);

/*
 * The vertical axis has to have a DIRECTION as well as a name, or a
 * diagram could be read as increasing downward.
 */
check(
    /axisArrow/.test(rendererSource),
    "the ordinate is drawn as an axis, with a direction"
);

check(
    /rotate\(-90/.test(rendererSource),
    "and its name runs along it rather than across the diagram"
);

/*
 * And the axes must not invent VALUES.
 *
 * THIS USED TO FORBID A TICK SCALE ENTIRELY, on the grounds that a tick or
 * a number on the axis would be "the tool answering the exercise rather than
 * supporting it" - a considered position, deliberately REVERSED. A student
 * reading a magnitude off a gridded axis is doing the exercise, not having
 * it done for them.
 *
 * What is still forbidden is the stronger thing: the axes must not state a
 * RANGE. A scale is the student's ruler; a range would be the application
 * claiming to know what the answer is. `axes.min`, `axes.max`,
 * `axes.range` and `axes.step` remain disallowed, and the ticks are opt-in
 * and carry the student's own spacing.
 */
check(
  !/axes\.(min|max|range|step)/.test(rendererSource),
  "no range or step is implied by the axis labels themselves"
);

/*
 * The ticks that replaced it: opt-in, with the student's own spacing on
 * each axis, and drawn against the same scale as the curve so a value they
 * draw at 10 kN sits on the 10 mark.
 */
check(
  /showTicks === true/.test(rendererSource),
  "ticks are opt-in rather than always drawn"
);

check(
  /xTickSpacing/.test(rendererSource) &&
    /yTickSpacing/.test(rendererSource),
  "and both axes have a spacing the student sets"
);

check(
  /MAX_TICKS_PER_AXIS/.test(rendererSource),
  "a spacing that would bury the diagram draws none"
);

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);