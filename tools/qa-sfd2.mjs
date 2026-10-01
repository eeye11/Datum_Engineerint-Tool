/*
 * Places one SFD by click-drag on the canvas and reports whether a
 * semantic analysis feature was created. Verification aid.
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
    await page.waitForTimeout(400);

    const picked = await page.evaluate(() => {
        const b = document.querySelector(
            '[data-tool-id="shear-force-diagram"]'
        );

        if (!b) {
            return false;
        }

        b.click();
        return true;
    });

    await page.waitForTimeout(300);

    const canvas = await page
        .locator(".drawing-canvas")
        .boundingBox();

    const y = canvas.y + canvas.height / 2;
    const x0 = canvas.x + 120;
    const x1 = canvas.x + 420;

    /* Click 1 sets the start. */
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(300);

    /* Click 2 sets the end and commits. */
    await page.mouse.move(x1, y, { steps: 10 });
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(700);

    return await page.evaluate(() => {
        const panel = document.getElementById(
            "drawingProperties"
        );

        const svg = document.querySelector(
            ".drawing-canvas svg"
        );

        return {
            picked: true,
            featuresPanel:
                panel?.innerText?.slice(0, 500),
            svgText: svg?.textContent?.trim(),
            rectCount: svg
                ? svg.querySelectorAll("rect").length
                : 0
        };
    });
}
