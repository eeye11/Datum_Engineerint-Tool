/*
 * Reports whether either panel's content overflows vertically, so
 * the width needed to avoid a scrollbar can be measured rather than
 * guessed. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.setViewportSize({ width: 1440, height: 900 });
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
    await page.waitForTimeout(400);

    return await page.evaluate(() => {
        const measure = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;

            const r = el.getBoundingClientRect();

            return {
                sel,
                clientW: el.clientWidth,
                scrollW: el.scrollWidth,
                clientH: el.clientHeight,
                scrollH: el.scrollHeight,
                overflowsY: el.scrollHeight > el.clientHeight,
                overflowsX: el.scrollWidth > el.clientWidth,
                width: Math.round(r.width)
            };
        };

        const tools = document.getElementById(
            "drawingToolList"
        );

        const rows = tools
            ? tools.querySelectorAll(
                  ".drawing-tool-row, button"
              ).length
            : 0;

        return {
            panels: [
                measure(".drawing-tool-panel"),
                measure(
                    ".drawing-tool-list"
                ),
                measure(".drawing-inspector")
            ],
            toolButtonCount: rows
        };
    });
}
