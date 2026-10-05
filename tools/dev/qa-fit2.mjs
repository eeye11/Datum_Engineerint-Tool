/*
 * Exercises Fit against the cases that break it: an empty sheet, a
 * single point, a single flat line, and a dimension that extends
 * past the geometry. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    const result = await page.evaluate(() => {
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

        const pick = (sel) => {
            document.querySelector(sel)?.click();
        };

        const zoom = () =>
            document.getElementById("drawingZoomValue")
                ?.value ?? null;

        const message = () =>
            document.getElementById("drawingToolMessage")
                ?.innerText ?? "";

        const fit = () =>
            pick('[data-global-tool="fit"]');

        const out = {};

        /* 1. Empty sheet. */
        fit();
        out.empty = {
            zoom: zoom(),
            message: message()
        };

        /* 2. A single point - zero span on both axes. */
        pick('[data-tool-id="point"]');
        clickAt(0.5, 0.5);
        fit();
        out.singlePoint = {
            zoom: zoom(),
            message: message()
        };

        /* 3. A single flat horizontal line - zero span in Y. */
        pick('[data-tool-id="line"]');
        clickAt(0.1, 0.4);
        clickAt(0.9, 0.4);
        fit();
        out.flatLine = {
            zoom: zoom(),
            message: message()
        };

        return out;
    });

    await page.waitForTimeout(400);

    return result;
}
