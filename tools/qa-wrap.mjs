/*
 * Opens Statics, then Collapse, and reports the panel widths and
 * whether any tool name wrapped. Verification aid.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    await page.evaluate(() => {
        document
            .querySelector(
                '.drawing-category[data-category="STATICS"]'
            )
            ?.click();
    });
    await page.waitForTimeout(500);

    return await page.evaluate(() => {
        const w = document.querySelector(
            ".drawing-workspace"
        );

        const rail = document.querySelector(
            ".drawing-panel-rail-left"
        );

        const names = Array.from(
            document.querySelectorAll(
                ".drawing-tool-label"
            )
        );

        /* A name has wrapped when it is taller than one line. */
        const wrapped = names.filter((el) =>
            el.getBoundingClientRect().height > 16
        );

        return {
            template:
                getComputedStyle(w)
                    .gridTemplateColumns,
            railWidth: Math.round(
                rail.getBoundingClientRect().width
            ),
            canvasWidth: Math.round(
                document
                    .querySelector(".drawing-canvas")
                    .getBoundingClientRect().width
            ),
            nameCount: names.length,
            wrappedCount: wrapped.length,
            wrappedSample: wrapped
                .slice(0, 6)
                .map(
                    (el) =>
                        el.textContent.trim() +
                        " (" +
                        Math.round(
                            el.getBoundingClientRect()
                                .height
                        ) +
                        "px)"
                ),
            longestLine: Math.max(
                ...names.map(
                    (el) =>
                        el.getBoundingClientRect()
                            .height
                )
            )
        };
    });
}
