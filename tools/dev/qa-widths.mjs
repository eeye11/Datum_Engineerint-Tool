/*
 * Measures the ACTUAL laid-out widths of each workspace column, so
 * a collapsed panel's released width can be checked rather than
 * assumed. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(/@e\d+ [^\n]*Drawing[^\n]*/)?.[0];

    if (!tab) {
        return { error: "no drawing tab", snap };
    }

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(600);

    const read = () =>
        page.evaluate(() => {
            const w = document.querySelector(
                ".drawing-workspace"
            );

            const box = (sel) => {
                const el = document.querySelector(sel);
                if (!el) {
                    return null;
                }
                const r = el.getBoundingClientRect();
                return {
                    w: Math.round(r.width),
                    left: Math.round(r.left),
                    right: Math.round(r.right)
                };
            };

            return {
                workspaceWidth: Math.round(
                    w.getBoundingClientRect().width
                ),
                left: box(".drawing-panel-rail-left"),
                canvas: box(".drawing-canvas"),
                right: box(".drawing-panel-rail-right"),
                template:
                    getComputedStyle(w)
                        .gridTemplateColumns
            };
        });

    const before = await read();

    await page.click("#drawingFeaturesPanelToggle");
    await page.waitForTimeout(400);

    const rightHidden = await read();

    await page.click("#drawingFeaturesPanelToggle");
    await page.click("#drawingToolPanelToggle");
    await page.waitForTimeout(400);

    const leftHidden = await read();

    return { before, rightHidden, leftHidden };
}
