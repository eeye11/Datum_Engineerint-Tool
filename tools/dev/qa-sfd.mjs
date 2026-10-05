/*
 * Creates an SFD by click-drag and reports what was made, so the
 * analysis templates are checked as a student would meet them.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(/@e\d+ [^\n]*Drawing[^\n]*/)?.[0];

    if (!tab) {
        return { error: "no drawing tab", snap };
    }

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(600);

    const canvas = await page.locator(
        ".drawing-canvas"
    ).boundingBox();

    /* Open the Statics section, then the Analysis group. */
    const before = await ui.snapshot();

    const statics = before.match(
        /@e\d+ button " STATICS/
    )?.[0];

    if (statics) {
        await ui.click(statics.match(/@e\d+/)[0]);
        await page.waitForTimeout(400);
    }

    const after = await ui.snapshot();

    const sfdButton = after.match(
        /@e\d+ [^\n]*Shear Force Diagram[^\n]*/
    )?.[0];

    if (!sfdButton) {
        return {
            error: "no SFD tool button",
            snapshot: after
        };
    }

    await ui.click(sfdButton.match(/@e\d+/)[0]);
    await page.waitForTimeout(300);

    /* Click-drag across a span. */
    const y = canvas.y + canvas.height / 2;
    const x0 = canvas.x + 120;
    const x1 = canvas.x + 420;

    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 100, y, { steps: 8 });
    await page.mouse.move(x1, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    return await page.evaluate(() => {
        const state =
            window.enggDrawingState?.getState?.() ??
            null;

        const list = document.getElementById(
            "drawingProperties"
        );

        return {
            featurePanelText:
                list?.innerText?.slice(0, 600),
            hasDiagramNode: /SFD|Shear/i.test(
                list?.innerText || ""
            )
        };
    });
}
