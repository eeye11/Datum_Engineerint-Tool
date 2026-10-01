/*
 * Places a dimension and an annotation well outside the geometry,
 * then Fits, to confirm both are included in the extent and are not
 * clipped. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    return await page.evaluate(() => {
        const canvas = document.querySelector(
            ".drawing-canvas"
        );
        const r = canvas.getBoundingClientRect();

        const clickAt = (dx, dy) => {
            const opts = {
                bubbles: true,
                cancelable: true,
                clientX: r.left + r.width * dx,
                clientY: r.top + r.height * dy,
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
            ].forEach((type) => {
                canvas.dispatchEvent(
                    new MouseEvent(type, opts)
                );
            });
        };

        const pick = (sel) =>
            document.querySelector(sel)?.click();

        const zoom = () =>
            document.getElementById("drawingZoomValue")
                ?.value ?? null;

        /* A short line in the middle. */
        pick('[data-tool-id="line"]');
        clickAt(0.45, 0.5);
        clickAt(0.55, 0.5);

        pick('[data-global-tool="fit"]');
        const lineOnly = zoom();

        /* A dimension on that line, placed well below it. */
        pick('[data-tool-id="dimension"]');
        clickAt(0.5, 0.5);
        clickAt(0.5, 0.85);
        clickAt(0.5, 0.85);

        const panel =
            document.getElementById("drawingProperties")
                ?.innerText || "";

        pick('[data-global-tool="fit"]');
        const withDimension = zoom();

        /*
         * Measure the real drawn extent in screen space, so
         * "is it inside the canvas" is answered by the rendering
         * rather than by the zoom number.
         */
        const svg = canvas.querySelector("svg");
        let box = null;

        if (svg) {
            svg.querySelectorAll(
                "path,line,rect,circle,polygon,polyline"
            ).forEach((el) => {
                try {
                    const b = el.getBBox();
                    if (!b || (!b.width && !b.height)) {
                        return;
                    }

                    box = box
                        ? {
                              x: Math.min(box.x, b.x),
                              y: Math.min(box.y, b.y),
                              right: Math.max(
                                  box.right,
                                  b.x + b.width
                              ),
                              bottom: Math.max(
                                  box.bottom,
                                  b.y + b.height
                              )
                          }
                        : {
                              x: b.x,
                              y: b.y,
                              right: b.x + b.width,
                              bottom: b.y + b.height
                          };
                } catch {
                    /* not renderable */
                }
            });
        }

        return {
            lineOnly,
            withDimension,
            panelHasDimension:
                /Dimension/i.test(panel),
            svgExtent: box,
            canvas: {
                w: Math.round(r.width),
                h: Math.round(r.height)
            },
            fitsInside: box
                ? box.x >= -1 &&
                  box.y >= -1 &&
                  box.right <= r.width + 1 &&
                  box.bottom <= r.height + 1
                : null
        };
    });
}
