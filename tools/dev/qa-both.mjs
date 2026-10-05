/*
 * Measures the workspace columns with both panels collapsed, to
 * check the drawing actually takes the whole width.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    const read = () =>
        page.evaluate(() => {
            const w = document.querySelector(
                ".drawing-workspace"
            );

            const box = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {
                    l: Math.round(r.left),
                    r: Math.round(r.right),
                    w: Math.round(r.width)
                };
            };

            return {
                total: Math.round(
                    w.getBoundingClientRect().width
                ),
                template:
                    getComputedStyle(w)
                        .gridTemplateColumns,
                left: box(".drawing-panel-rail-left"),
                canvas: box(".drawing-canvas"),
                right: box(".drawing-panel-rail-right"),
                toggleText: [
                    document
                        .getElementById(
                            "drawingFeaturesPanelToggle"
                        )
                        ?.innerText?.trim(),
                    document
                        .getElementById(
                            "drawingToolPanelToggle"
                        )
                        ?.innerText?.trim()
                ]
            };
        });

    const open = await read();

    await page.click("#drawingToolPanelToggle");
    await page.click("#drawingFeaturesPanelToggle");
    await page.waitForTimeout(500);

    const bothHidden = await read();

    return { open, bothHidden };
}
