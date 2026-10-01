/*
 * Creates each of the three analysis templates and reports what the
 * Features panel then shows, so they are checked as one semantic
 * object rather than a pile of geometry. Verification aid.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    const canvas = await page
        .locator(".drawing-canvas")
        .boundingBox();

    const draw = async (toolId) => {
        /* Choose the tool the way the toolbar does. */
        await page.evaluate(
            (id) => {
                const btn = document.querySelector(
                    `[data-tool-id="${id}"]`
                );
                btn?.click();
            },
            toolId
        );
        await page.waitForTimeout(250);

        const y = canvas.y + canvas.height / 2;
        const x0 = canvas.x + 100;
        const x1 = canvas.x + 400;

        await page.mouse.move(x0, y);
        await page.mouse.down();
        await page.mouse.move(
            x0 + (x1 - x0) / 2,
            y,
            { steps: 6 }
        );
        await page.mouse.move(x1, y, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(500);
    };

    await draw("shear-force-diagram");
    await draw("bending-moment-diagram");
    await draw("axial-force-diagram");

    return await page.evaluate(() => {
        const panel = document.getElementById(
            "drawingProperties"
        );

        const svg = document.querySelector(
            ".drawing-canvas svg"
        );

        return {
            featuresPanel:
                panel?.innerText?.slice(0, 800),
            svgText: svg
                ? svg.textContent.trim()
                : null,
            diagramCount: svg
                ? svg.querySelectorAll("rect").length
                : 0
        };
    });
}
