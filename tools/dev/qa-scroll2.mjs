/*
 * Measures horizontal overflow at several viewport widths, so the
 * toolbar can be made to fit at the sizes that actually scroll.
 * Verification aid, not part of the application.
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

    const widths = [1920, 1440, 1280, 1100, 960, 820, 700];

    const results = [];

    for (const width of widths) {
        await page.setViewportSize({
            width,
            height: 800
        });
        await page.waitForTimeout(350);

        const row = await page.evaluate(() => {
            const check = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                return {
                    over: el.scrollWidth > el.clientWidth + 1,
                    clientW: el.clientWidth,
                    scrollW: el.scrollWidth
                };
            };

            return {
                app: check(".drawing-app-toolbar"),
                nav: check(".drawing-toolset-nav"),
                sheets: check(".drawing-sheet-bar"),
                tools: check(".drawing-tool-list")
            };
        });

        results.push({ width, ...row });
    }

    return results;
}
