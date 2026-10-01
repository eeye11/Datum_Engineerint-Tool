/*
 * Reports the raw names of the analysis diagrams actually stored,
 * read from the DOM the Features panel is built from. Verification
 * aid, not part of the application.
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

        document
            .querySelector(
                '.drawing-category[data-category="STATICS"]'
            )
            ?.click();

        const place = (toolId, dy) => {
            document
                .querySelector(
                    `[data-tool-id="${toolId}"]`
                )
                ?.click();

            clickAt(0.15, dy);
            clickAt(0.75, dy);
        };

        place("shear-force-diagram", 0.25);
        place("bending-moment-diagram", 0.45);
        place("axial-force-diagram", 0.65);

        /*
         * Read the feature list the panel renders, which is built
         * from the stored names, rather than guessing at internal
         * state that is not exposed.
         */
        const rows = Array.from(
            document.querySelectorAll(
                ".drawing-component-row"
            )
        ).map((el) =>
            el.innerText.replace(/\s+/g, " ").trim()
        );

        return {
            rows,
            panelText:
                document
                    .getElementById("drawingProperties")
                    ?.innerText?.slice(0, 400)
        };
    });
}
