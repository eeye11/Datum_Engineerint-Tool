/*
 * Compares the rendered stroke width of a Point Force against an
 * ordinary Line of the same configured thickness, so "the force is
 * too thin" is measured rather than argued about. Verification aid.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(900);
    }

    /* Set a known thickness, then draw a line and a force. */
    await page.evaluate(() => {
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
            ].forEach((t) => {
                canvas.dispatchEvent(
                    new MouseEvent(t, opts)
                );
            });
        };

        document
            .querySelector('[data-tool-id="line"]')
            ?.click();
        clickAt(0.15, 0.85);
        clickAt(0.85, 0.85);

        document
            .querySelector('[data-tool-id="point-force"]')
            ?.click();
        clickAt(0.15, 0.25);
        clickAt(0.6, 0.5);
    });
    await page.waitForTimeout(700);

    return await page.evaluate(() => {
        const svg = document.querySelector(
            ".drawing-canvas svg"
        );

        const strokes = [];

        svg?.querySelectorAll("line").forEach((el) => {
            const w = el.getAttribute("stroke-width");
            const bb = el.getBBox();

            strokes.push({
                strokeWidth: Number(w),
                length: Math.round(
                    Math.hypot(bb.width, bb.height)
                )
            });
        });

        return {
            strokes,
            /* The value a 0.5 line should render at 100% zoom. */
            basePixelsPerUnit:
                window.enggDrawingState
                    ?.BASE_PIXELS_PER_UNIT
        };
    });
}
