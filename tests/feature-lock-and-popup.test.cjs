/*
 * ========================================================
 * LOCKING A FEATURE, AND DISMISSING A POPUP
 * ========================================================
 *
 * Two shared defects, both of which let a student past a control:
 *
 *   LOCKING  the `Locked` flag stopped a DRAG but not a TYPED coordinate, so a
 *            "fixed" feature could still be moved from the Features panel. That
 *            is the lock's whole purpose defeated, and it affected Line and
 *            Point alike.
 *
 *   POPUP    Escape cancelled only while the number HAD FOCUS. Clicking any
 *            non-focusable part of the popup - its padding, its label, a blank
 *            corner - blurred the input, and Escape then did nothing at all.
 */

const { JSDOM } = require("jsdom");
const fs = require("fs");
const { locate } = require("./helpers/source-path.cjs");

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.Element = dom.window.Element;

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
    if (ok) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
    }
};

const updater = require(locate("property-update.js"));
const drawingState = require(locate("drawing-state.js")).default;
const markup = fs.readFileSync(locate("feature-panel-markup.js"), "utf8");
const popup = fs.readFileSync(locate("creation-dimension.js"), "utf8");

console.log("\n  A LOCK HOLDS A FEATURE IN PLACE, TABBED OR TYPED\n");

{
    const feature = drawingState.geometryFactories.line(
        { x: 0, y: 0 },
        { x: 60, y: 0 },
    );

    feature.locked = true;

    check(
        "a locked line refuses a typed Start X",
        updater.updateFeatureProperty(feature, "start.x", 999) === false,
        "the lock stopped a drag but not the coordinate field",
    );

    check(
        "and a typed End Y",
        updater.updateFeatureProperty(feature, "end.y", 999) === false,
    );

    check(
        "and a typed Length, which would slide an endpoint",
        updater.updateFeatureProperty(feature, "length", 999) === false,
    );

    check(
        "so the geometry really is where it was",
        feature.geometry.start.x === 0 && feature.geometry.end.y === 0,
    );

    check(
        "but the LABEL still applies while locked",
        updater.updateFeatureProperty(feature, "label", "L1") === true &&
            feature.label === "L1",
        "a lock is about position; a student locks a feature to annotate it",
    );

    feature.locked = false;

    check(
        "and unlocking restores normal editing",
        updater.updateFeatureProperty(feature, "start.x", 5) === true &&
            feature.geometry.start.x === 5,
    );
}

console.log("\n  the same lock protects a Point\n");

{
    const feature = drawingState.geometryFactories.point({ x: 10, y: 20 });

    feature.locked = true;

    check(
        "a locked point refuses a typed X",
        updater.updateFeatureProperty(feature, "position.x", 999) === false,
    );

    check(
        "and a typed Y",
        updater.updateFeatureProperty(feature, "position.y", 999) === false,
    );

    check(
        "while its label is still editable",
        updater.updateFeatureProperty(feature, "label", "N1") === true,
    );

    check(
        "and its position is unchanged",
        feature.geometry.position.x === 10 && feature.geometry.position.y === 20,
    );
}

console.log("\n  the Line panel offers the SAME Lock control as the Point\n");

{
    check(
        "the Line branch pushes a lock row",
        /object\.type === "line"[\s\S]*?rows\.push\(lockRow\(\)\)/.test(markup),
        "the mechanism was shared but the Line panel had no control for it",
    );

    check(
        "it is the SHARED lockRow, not a second control",
        (markup.match(/lockRow\(\)/g) || []).length >= 3,
        "one row builder, used by every type that can be locked",
    );

    /*
     * THE TWO CONTROLS ARE DIFFERENT THINGS, and the file says so: `data-fix`
     * pins a VALUE against editing (a load's intensity), while
     * `data-feature-lock` pins a FEATURE against moving. The Line control is the
     * second of those, not a second spelling of the first.
     */
    check(
        "and the new row is the FEATURE lock, not the value 'Fix' control",
        /data-feature-lock/.test(markup) && /data-fix=/.test(markup),
        "`data-fix` pins a value; `data-feature-lock` pins a feature's position",
    );
}

console.log("\n  A POPUP DISMISSES ON A GENUINE OUTSIDE CLICK\n");

{
    check(
        "the popup asks whether the press landed INSIDE it",
        /pointerInside = popup\.contains\(event\.target\)/.test(popup),
        "the old test was `document.activeElement`, which is not where the click went",
    );

    check(
        "and it is asked in the capture phase, before any blur",
        /addEventListener\("pointerdown", onPointerDown, true\)/.test(popup),
    );

    check(
        "a press inside keeps the popup open",
        /pressWasInsidePopup\(\)[\s\S]{0,80}?return;/.test(popup),
    );

    check(
        "while a press genuinely outside closes it",
        /closeIt\(\);\s*\}, 0\)/.test(popup),
    );
}

console.log("\n  and ESCAPE cancels from ANYWHERE in the popup\n");

{
    check(
        "Escape is caught on the DOCUMENT, not only the input",
        /document\.addEventListener\("keydown", onDocumentKeyDown, true\)/.test(
            popup,
        ),
        "clicking the padding blurred the input, and Escape then did nothing",
    );

    check(
        "it closes only the popup that is actually open",
        /event\.key !== "Escape" \|\| openPopup !== popup/.test(popup),
    );

    check(
        "and the listener is removed with the popup",
        /escapeListener\)[\s\S]{0,120}?document\.removeEventListener\("keydown", escapeListener, true\)/.test(
            popup,
        ),
        "a document listener outlives the popup unless it is taken off",
    );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
    process.exitCode = 1;
}
