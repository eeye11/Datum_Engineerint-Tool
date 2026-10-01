/*
 * Screenshots the toolbar at a narrow width, so the wrapped result
 * can be looked at rather than assumed. Verification aid.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(700);
    }

    await page.setViewportSize({
        width: 900,
        height: 800
    });
    await page.waitForTimeout(500);

    return await page.evaluate(() => {
        const bar = document.querySelector(
            ".drawing-app-toolbar"
        );

        return {
            overflowX: getComputedStyle(bar).overflowX,
            rows: new Set(
                Array.from(bar.children).map(
                    (el) =>
                        Math.round(
                            el.getBoundingClientRect()
                                .top
                        )
                )
            ).size,
            scrolls:
                bar.scrollWidth > bar.clientWidth + 1
        };
    });
}
