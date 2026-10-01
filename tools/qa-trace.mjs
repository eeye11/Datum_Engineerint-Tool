/*
 * Traces what happens when the SFD tool is chosen and the canvas
 * is clicked, so a failure to commit can be located rather than
 * guessed at. Verification aid, not part of the application.
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

        if (!b) return "no button";

        b.click();
        return "clicked";
    });

    await page.waitForTimeout(300);

    const activeTool = await page.evaluate(() => {
        const b = document.querySelector(
            '[data-tool-id="shear-force-diagram"]'
        );
        return b?.className || "none";
    });

    const message = await page.evaluate(
        () =>
            document
                .getElementById("drawingToolMessage")
                ?.innerText || ""
    );

    const canvas = await page
        .locator(".drawing-canvas")
        .boundingBox();

    const y = canvas.y + canvas.height / 2;

    await page.mouse.click(canvas.x + 120, y);
    await page.waitForTimeout(400);

    const afterFirst = await page.evaluate(
        () =>
            document
                .getElementById("drawingToolMessage")
                ?.innerText || ""
    );

    await page.mouse.click(canvas.x + 420, y, { steps: 10 });
    await page.waitForTimeout(600);

    return {
        picked,
        activeTool,
        message,
        afterFirst,
        finalPanel: await page.evaluate(
            () =>
                document
                    .getElementById("drawingProperties")
                    ?.innerText?.slice(0, 300)
        ),
        finalMessage: await page.evaluate(
            () =>
                document
                    .getElementById("drawingToolMessage")
                    ?.innerText || ""
        )
    };
}
