/*
 * Draws a Point Force and an ordinary Line at the SAME configured
 * thickness and screenshots them, so the comparison is visual rather
 * than a matter of opinion. Verification aid.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(900);
    }

    /* Magnify the canvas so stroke weight can be judged. */
    await page.evaluate(async () => {
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

        /* A Line at the default weight. */
        document
            .querySelector('[data-tool-id="line"]')
            ?.click();
        clickAt(0.08, 0.15);
        clickAt(0.6, 0.15);

        /*
         * A Point Force at its default.
         *
         * The Statics category has to be open first: the Point Force tool
         * only exists there, and a click on a tool button that is not on
         * screen does nothing at all. Without this the force is silently
         * never drawn, and the test ends up comparing a line with another
         * line and concluding they are identical - which is exactly what
         * happened the first time this was run.
         */
        document
          .querySelector('.drawing-category[data-category="STATICS"]')
          ?.click();
        await new Promise((r) => setTimeout(r, 300));
        document
          .querySelector('[data-tool-id="point-force"]')
          ?.click();
        clickAt(0.15, 0.45);
        clickAt(0.6, 0.45);

        /* Back to Geometry for the second reference Line. */
        document
          .querySelector('.drawing-category[data-category="GEOMETRY"]')
          ?.click();
        await new Promise((r) => setTimeout(r, 300));
        document
          .querySelector('[data-tool-id="line"]')
          ?.click();
        clickAt(0.08, 0.75);
        clickAt(0.6, 0.75);
    });
    await page.waitForTimeout(800);

    /* Blow the drawing up 4x so a 1.2px stroke is visible. */
    await page.evaluate(() => {
        const svg = document.querySelector(
            ".drawing-canvas svg"
        );

        if (!svg) return;

        const vb =
            svg.getAttribute("viewBox") ||
            "0 0 100 100";

        const [x, y, w, h] = vb
            .split(/\s+/)
            .map(Number);

        svg.setAttribute(
            "viewBox",
            `${x} ${y} ${w / 3} ${h / 3}`
        );
    });
    await page.waitForTimeout(300);

    return await page.evaluate(() => {
        const svg = document.querySelector(
            ".drawing-canvas svg"
        );

        return {
            widths: Array.from(
                svg?.querySelectorAll("line") || []
            ).map(
                (el) =>
                    Number(
                        el.getAttribute("stroke-width")
                    )
            )
        };
    });
}
