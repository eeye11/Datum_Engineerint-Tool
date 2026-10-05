/*
 * Exercises Fit against a known drawing and reports the resulting
 * zoom and pan, plus whether the drawing actually fits inside the
 * canvas. Verification aid, not part of the application.
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

        const out = {};

        /* --- An empty sheet must not produce a broken zoom. --- */
        const fit = document.querySelector(
            '[data-global-tool="fit"]'
        );

        out.fitButtonPresent = Boolean(fit);

        fit?.click();
        out.emptyZoom =
            document.getElementById("drawingZoomValue")
                ?.value ?? null;

        /* --- Now draw a modest rectangle away from the origin. --- */
        const line = document.querySelector(
            '[data-tool-id="line"]'
        );

        line?.click();
        clickAt(0.12, 0.15);
        clickAt(0.88, 0.85);

        fit?.click();
        out.afterLineZoom =
            document.getElementById("drawingZoomValue")
                ?.value ?? null;
        out.afterLineMessage =
            document.getElementById("drawingToolMessage")
                ?.innerText ?? "";

        /* --- Is the content actually inside the canvas? --- */
        out.contentBounds = (() => {
            const svg = canvas.querySelector("svg");
            if (!svg) return null;

            let box = null;

            svg.querySelectorAll("path,line,rect,circle,polygon").forEach(
                (el) => {
                    try {
                        const b = el.getBBox();
                        if (!b || (!b.width && !b.height)) return;

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
                }
            );

            return box;
        })();

        out.canvasBox = {
            w: Math.round(r.width),
            h: Math.round(r.height)
        };

        return out;
    });
}
