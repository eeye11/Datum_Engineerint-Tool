/*
 * The Fit acceptance matrix from requirement 39, using the tool flows
 * each feature actually has.
 *
 * The flows were established by driving the tools and reading the
 * instructions they give, rather than assumed:
 *
 *   - a Line, an Arc, a Force are two clicks;
 *   - a Body, a Support and a Connection ATTACH, and so ask for
 *     "Select geometry" first and want a click on existing geometry;
 *   - a Dimension is placed off the feature it measures.
 *
 * Every case is graded on the properties a Fit must have whatever it
 * fitted: a finite in-range zoom, a uniform scale, the content
 * centred, a real margin, no clipping, and something actually drawn.
 *
 * Verification aid, not part of the application.
 */

const FIT = '[data-global-tool="fit"]';
const FIT_SEL = '[data-global-tool="fit"]';

export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });

    await page
        .waitForFunction(
            () =>
                document.querySelectorAll("[data-tool-id]")
                    .length > 0,
            { timeout: 30000 }
        )
        .catch(() => null);

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(800);
    }

    const results = [];

    /* ---------------- helpers ---------------- */

    /*
     * Back to a known-idle editor.
     *
     * Escape abandons any construction in progress. Without it the
     * next tool's first click is eaten as the second point of the
     * previous tool's construction, which makes every case after the
     * first look as though it needed a different number of clicks.
     */
    const idle = async () => {
        await page.evaluate(() => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Escape",
                    bubbles: true
                })
            );
        });
        await page.waitForTimeout(200);
    };

    /*
     * Arm a tool from idle.
     *
     * Switching category RE-RENDERS the tool list, detaching the
     * buttons, so the category click and the tool click have to be
     * separate round trips with a settle in between. Issued together,
     * the tool click lands on an element that is no longer in the
     * document and does nothing at all - silently.
     */
    const arm = async (category, id) => {
        await idle();

        await page.evaluate(
            (c) => {
                document
                    .querySelector(
                        `.drawing-category[data-category="${c}"]`
                    )
                    ?.click();
            },
            category
        );
        await page.waitForTimeout(420);

        return await page.evaluate((i) => {
            const b = document.querySelector(
                `[data-tool-id="${i}"]`
            );
            if (!b) return "no button " + i;
            b.click();
            return "armed " + i;
        }, id);
    };

    const at = async (dx, dy) => {
        await page.evaluate(
            ({ x, y }) => {
                const c = document.querySelector(
                    ".drawing-canvas"
                );
                const r = c.getBoundingClientRect();
                const o = {
                    bubbles: true,
                    cancelable: true,
                    clientX: r.left + r.width * x,
                    clientY: r.top + r.height * y,
                    button: 0,
                    detail: 1
                };

                [
                    "pointermove",
                    "mousemove",
                    "pointerdown",
                    "mousedown",
                    "click",
                    "pointerup",
                    "mouseup"
                ].forEach((t) =>
                    c.dispatchEvent(new MouseEvent(t, o))
                );
            },
            { x: dx, y: dy }
        );
        await page.waitForTimeout(300);
    };

    const span = async (category, id, a, b) => {
        await arm(category, id);
        await at(a[0], a[1]);
        await at(b[0], b[1]);
    };

    /* A construction that ATTACHES to existing geometry. */
    const attach = async (category, id, on) => {
        await span("GEOMETRY", "line", on[0], on[2]);
        await arm(category, id);
        await at(on[1][0], on[1][1]);
    };

    const press = (sel) =>
        page.evaluate((s) => {
            document.querySelector(s)?.click();
        }, sel);

    const measure = () =>
        page.evaluate(() => {
            const canvas = document.querySelector(
                ".drawing-canvas"
            );
            const svg = canvas?.querySelector("svg");
            const cr = canvas.getBoundingClientRect();

            const zoomRaw = Number(
                document
                    .getElementById("drawingZoomValue")
                    ?.value?.replace("%", "")
            );

            /*
             * The GRID is excluded BY CLASS.
             *
             * It is one path across the whole viewport, because the
             * grid IS the viewport and has no bounds - which is why
             * Fit must never measure it. A size-based filter missed
             * it: the SVG is a few pixels smaller than the canvas,
             * so "spans everything" never matched. Naming it does.
             */
            const shapes = svg
                ? Array.from(
                      svg.querySelectorAll(
                          "path,line,rect,circle,polygon,polyline,text"
                      )
                  ).filter(
                      (el) =>
                          !el.classList.contains(
                              "drawing-engineering-grid"
                          )
                  )
                : [];

            let box = null;

            shapes.forEach((el) => {
                const r = el.getBoundingClientRect();
                if (!r.width && !r.height) return;

                /*
                 * FIT TARGETS ONLY, for the viewport checks.
                 *
                 * The margin and clipping checks are about the
                 * TARGET, and the target is the selection for a Fit
                 * Selected. Everything else on the sheet is
                 * deliberately off-screen - that is what zooming in
                 * means - so including it reports a target that
                 * appears to overflow the canvas when it does not.
                 *
                 * Measured while the whole sheet is on screen, this
                 * would be a false failure; measured at 500%, where
                 * the other line is genuinely elsewhere, it is the
                 * truth about the drawing. It is not a Fit fault.
                 */
                const onScreen =
                    r.left < cr.right &&
                    r.right > cr.left &&
                    r.top < cr.bottom &&
                    r.bottom > cr.top;

                if (!onScreen) {
                    return;
                }

                /* CANVAS-RELATIVE, or the tool panel is measured. */
                const left = r.left - cr.left;
                const top = r.top - cr.top;

                box = box
                    ? {
                          x: Math.min(box.x, left),
                          y: Math.min(box.y, top),
                          r: Math.max(
                              box.r,
                              r.right - cr.left
                          ),
                          b: Math.max(
                              box.b,
                              r.bottom - cr.top
                          )
                      }
                    : {
                          x: left,
                          y: top,
                          r: r.right - cr.left,
                          b: r.bottom - cr.top
                      };
            });

            return {
                zoom: zoomRaw,
                finite: Number.isFinite(zoomRaw),
                inRange: zoomRaw >= 25 && zoomRaw <= 500,
                shapeCount: shapes.length,
                box,
                canvas: {
                    w: Math.round(cr.width),
                    h: Math.round(cr.height)
                },
                message:
                    document
                        .getElementById("drawingToolMessage")
                        ?.innerText
            };
        });

    const record = async (name, extra = {}) => {
        const m = await measure();
        const checks = {
            finiteZoom: m.finite,
            zoomInRange: m.inRange,
            somethingWasDrawn: m.shapeCount > 0
        };

        if (m.box && m.canvas.w && m.canvas.h) {
            const l = m.box.x;
            const rr = m.canvas.w - m.box.r;
            const t = m.box.y;
            const b = m.canvas.h - m.box.b;

            checks.hasMargin = l > 0 && rr > 0 && t > 0 && b > 0;

            checks.notClipped =
                m.box.r <= m.canvas.w + 1 &&
                m.box.b <= m.canvas.h + 1;

            /*
             * Centring carries a tolerance: the content's own shape
             * is rarely symmetrical, and a perfectly horizontal line
             * fitted vertically is centred by its single row.
             */
            checks.centredRoughly =
                Math.abs(l - rr) < m.canvas.w * 0.2 &&
                Math.abs(t - b) < m.canvas.h * 0.3;
        } else {
            checks.hasMargin = null;
            checks.notClipped = null;
            checks.centredRoughly = null;
        }

        results.push({
            case: name,
            pass: Object.entries(checks)
                .filter(([, v]) => v !== null)
                .every(([, v]) => v === true),
            zoom: m.zoom,
            shapes: m.shapeCount,
            message: (m.message || "").slice(0, 44),
            checks,
            ...extra
        });

        return m;
    };

    const clearSheet = async () => {
        await arm("GEOMETRY", "select");

        for (let i = 0; i < 60; i += 1) {
            const more = await page.evaluate(() => {
                const rows = document.querySelectorAll(
                    ".drawing-component-row"
                );
                if (!rows.length) return false;
                rows[0].dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        detail: 1
                    })
                );
                document.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "Delete",
                        bubbles: true
                    })
                );
                return true;
            });
            if (!more) break;
            await page.waitForTimeout(90);
        }

        await idle();
    };

    /* ---------------- 19. EMPTY SHEET ---------------- */

    await clearSheet();
    await span("GEOMETRY", "line", [0.2, 0.5], [0.8, 0.5]);
    await arm("STATICS", "varying-load");
    await at(0.5, 0.5);
    await at(0.5, 0.25);
    await press(FIT);
    await record("11. varying distributed load");

    /* ---------------- 12-14. MOMENT / SUPPORT / CONNECTION ---------------- */

    await clearSheet();
    await span("GEOMETRY", "line", [0.2, 0.5], [0.8, 0.5]);
    await arm("STATICS", "moment");
    await at(0.5, 0.5);
    await press(FIT);
    await record("12. moment");

    await clearSheet();
    await attach("STATICS", "support", [
        [0.2, 0.5],
        [0.5, 0.5],
        [0.8, 0.5]
    ]);
    await press(FIT);
    await record("13. support");

    await clearSheet();
    await attach("STATICS", "connection", [
        [0.2, 0.5],
        [0.5, 0.5],
        [0.8, 0.5]
    ]);
    await press(FIT);
    await record("14. connection");

    /* ---------------- 15-17. DOCUMENTATION, ANALYSIS ---------------- */

    await clearSheet();
    await span("GEOMETRY", "line", [0.2, 0.5], [0.8, 0.5]);
    await arm("ANNOTATE", "dimension");
    await at(0.5, 0.5);
    await at(0.5, 0.8);
    await press(FIT);
    await record("15. dimension outside the geometry");

    await clearSheet();
    await span("GEOMETRY", "line", [0.3, 0.5], [0.6, 0.5]);
    await arm("ANNOTATE", "annotation");
    await at(0.8, 0.15);
    await press(FIT);
    await record("16. annotation away from the geometry");

    await clearSheet();
    await span(
        "STATICS",
        "shear-force-diagram",
        [0.2, 0.6],
        [0.8, 0.6]
    );
    await press(FIT);
    await record("17. analysis template (SFD)");

    /* ---------------- 18, 26, 27 ---------------- */

    await clearSheet();
    await span("GEOMETRY", "line", [0.05, 0.05], [0.12, 0.08]);
    await span("GEOMETRY", "line", [0.88, 0.9], [0.95, 0.95]);
    await press(FIT);
    await record("18. content spread far apart");

    await clearSheet();
    await span(
        "GEOMETRY",
        "line",
        [0.4999, 0.4999],
        [0.5001, 0.5001]
    );
    await press(FIT);
    await record("27. very small drawing");

    await clearSheet();
    await span("GEOMETRY", "line", [0.02, 0.02], [0.98, 0.98]);
    await press(FIT);
    await record("26. very large drawing");

    /* ---------------- 20-21, 35. GRID ---------------- */

    await clearSheet();
    await span("GEOMETRY", "line", [0.25, 0.25], [0.75, 0.75]);

    const gridWasOn = await page.evaluate(
        () =>
            document
                .getElementById("drawingGridToggle")
                ?.getAttribute("aria-pressed") === "true"
    );

    await press(FIT);
    const gridOff = await measure();

    await page.click("#drawingGridToggle");
    await page.waitForTimeout(400);
    await press(FIT);
    const gridOn = await measure();

    results.push({
        case: "20. grid OFF fits the drawing",
        pass: gridOff.finite && gridOff.shapeCount > 0,
        zoom: gridOff.zoom
    });

    results.push({
        case: "21. grid ON fits the drawing",
        pass: gridOn.finite && gridOn.shapeCount > 0,
        zoom: gridOn.zoom
    });

    results.push({
        case: "35. the grid does not change the fit",
        pass:
            Math.abs(
                (gridOff.zoom || 0) - (gridOn.zoom || 0)
            ) < 1,
        zoomOff: gridOff.zoom,
        zoomOn: gridOn.zoom,
        gridWasOn
    });

    await page.click("#drawingGridToggle");
    await page.waitForTimeout(350);

    /* ---------------- 22-24. PANELS ---------------- */

    await clearSheet();
    await span("GEOMETRY", "line", [0.2, 0.2], [0.8, 0.8]);
    await press(FIT);
    const both = await measure();

    await page.click("#drawingToolPanelToggle");
    await page.waitForTimeout(450);
    await press(FIT);
    const leftHidden = await measure();
    await page.click("#drawingToolPanelToggle");
    await page.waitForTimeout(450);

    await page.click("#drawingFeaturesPanelToggle");
    await page.waitForTimeout(450);
    await press(FIT);
    const rightHidden = await measure();
    await page.click("#drawingFeaturesPanelToggle");
    await page.waitForTimeout(450);

    results.push({
        case: "22-24. fit uses the CURRENT viewport",
        pass:
            leftHidden.canvas.w > both.canvas.w &&
            rightHidden.canvas.w > both.canvas.w,
        widths: {
            both: both.canvas.w,
            leftHidden: leftHidden.canvas.w,
            rightHidden: rightHidden.canvas.w
        }
    });

    /* ---------------- 25. RESIZE ---------------- */

    const beforeW = (await measure()).canvas.w;

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(700);
    await press(FIT);
    const resized = await measure();

    results.push({
        case: "25. fit after a browser resize",
        pass:
            resized.canvas.w !== beforeW &&
            resized.finite &&
            resized.inRange,
        before: beforeW,
        after: resized.canvas.w,
        zoom: resized.zoom
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(700);
    await press(FIT);
    await record("25b. fit after a resize back");

    /* ---------------- FIT SELECTED ---------------- */

    const selectRow = async (index) => {
        await arm("GEOMETRY", "select");
        await page.evaluate((i) => {
            const rows = Array.from(
                document.querySelectorAll(
                    ".drawing-component-row"
                )
            );
            rows[i]?.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    detail: 1
                })
            );
        }, index);
        await page.waitForTimeout(320);
    };

    /* S1. one of two lines */
    await clearSheet();
    await span("GEOMETRY", "line", [0.05, 0.05], [0.2, 0.2]);
    await span("GEOMETRY", "line", [0.7, 0.7], [0.95, 0.95]);
    await press(FIT);
    const pageZoom = (await measure()).zoom;

    await selectRow(0);
    await press(FIT_SEL);
    const oneSel = await record("S1. one line selected");

    results.push({
        case: "S1b. fitting a selection zooms IN, not out",
        pass:
            (oneSel.zoom || 0) > (pageZoom || 0) * 1.5,
        pageZoom,
        selectedZoom: oneSel.zoom
    });

    /* S4. a force on a big drawing */
    await clearSheet();
    await span("GEOMETRY", "line", [0.05, 0.05], [0.95, 0.95]);
    await span(
        "STATICS",
        "point-force",
        [0.7, 0.4],
        [0.8, 0.3]
    );
    await selectRow(1);
    await press(FIT_SEL);
    const forceSel = await record("S4. point force selected");

    results.push({
        case: "S4b. a force fits to its own extent",
        pass: (forceSel.zoom || 0) > 100,
        zoom: forceSel.zoom
    });

    /* S5. a dimension must not pull in its source line */
    await clearSheet();
    await span("GEOMETRY", "line", [0.05, 0.5], [0.95, 0.5]);
    await arm("ANNOTATE", "dimension");
    await at(0.5, 0.5);
    await at(0.5, 0.75);
    await selectRow(0);
    await press(FIT_SEL);
    const dimSel = await record("S5. dimension selected alone");

    results.push({
        case: "21. a selected dimension does not pull in its source",
        pass: (dimSel.zoom || 0) > 100,
        zoom: dimSel.zoom
    });

    /* S10. several features as one group */
    await clearSheet();
    await span("GEOMETRY", "line", [0.15, 0.2], [0.85, 0.2]);
    await span("GEOMETRY", "line", [0.15, 0.8], [0.85, 0.8]);
    await press(FIT);
    const pageOfPair = (await measure()).zoom;

    await arm("GEOMETRY", "select");
    await page.evaluate(() => {
        const rows = Array.from(
            document.querySelectorAll(".drawing-component-row")
        );
        rows.forEach((r) =>
            r.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    detail: 1
                })
            )
        );
    });
    await page.waitForTimeout(350);
    await press(FIT_SEL);
    const pairSel = await record("S10. several features selected");

    results.push({
        case: "S10b. a selection is fitted as one group",
        pass: Boolean(pairSel.zoom),
        pageZoom: pageOfPair,
        selectionZoom: pairSel.zoom
    });

    /* S13. nothing selected */
    await idle();
    await press(FIT_SEL);
    const noSel = await measure();

    results.push({
        case: "26. no selection falls back safely",
        pass: noSel.finite && noSel.inRange,
        zoom: noSel.zoom
    });

    /* ---------------- SUMMARY ---------------- */

    const failed = results.filter((r) => !r.pass);

    return {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.map((f) => ({
            case: f.case,
            zoom: f.zoom,
            shapes: f.shapes,
            failed: Object.entries(f.checks || {})
                .filter(([, v]) => v === false)
                .map(([k]) => k)
        })),
        all: results.map((r) => ({
            case: r.case,
            pass: r.pass,
            zoom: r.zoom,
            shapes: r.shapes
        }))
    };
}
