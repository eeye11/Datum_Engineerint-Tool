/*
 * Checks every horizontal region for sideways scrolling at a range
 * of widths, so "no scrolling at any screen size" is measured rather
 * than assumed. Verification aid.
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

    const selectors = [
        ".drawing-app-toolbar",
        ".drawing-toolbar",
        ".drawing-tool-list",
        ".drawing-inspector",
        ".drawing-workspace"
    ];

    const widths = [1920, 1440, 1280, 1100, 960, 820, 700, 600, 520];
    const results = [];

    for (const width of widths) {
        await page.setViewportSize({
            width,
            height: 820
        });
        await page.waitForTimeout(320);

        const bad = await page.evaluate((sels) => {
            const out = [];

            sels.forEach((sel) => {
                const el = document.querySelector(sel);
                if (!el) return;

                if (el.scrollWidth > el.clientWidth + 1) {
                    out.push({
                        sel,
                        clientW: el.clientWidth,
                        scrollW: el.scrollWidth
                    });
                }
            });

            return out;
        }, selectors);

        results.push({ width, scrolls: bad });
    }

    return {
        allClean: results.every(
            (r) => r.scrolls.length === 0
        ),
        results
    };
}
