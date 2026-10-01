/*
 * Reports the live interaction phase while a diagram span is being
 * placed, so a construction that refuses to start can be located.
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

    await page.evaluate(() => {
        document
            .querySelector(
                '.drawing-category[data-category="STATICS"]'
            )
            ?.click();
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
        document
            .querySelector(
                '[data-tool-id="shear-force-diagram"]'
            )
            ?.click();
    });
    await page.waitForTimeout(300);

    const canvas = await page
        .locator(".drawing-canvas")
        .boundingBox();

    const y = canvas.y + canvas.height / 2;

    const probe = () =>
        page.evaluate(() => {
            const w = document.querySelector(
                ".drawing-workspace"
            );

            return {
                message:
                    document
                        .getElementById(
                            "drawingToolMessage"
                        )
                        ?.innerText || "",
                hasDrawingState:
                    typeof window.drawingState !==
                        "undefined"
            };
        });

    const armed = await probe();

    await page.mouse.click(canvas.x + 120, y);
    await page.waitForTimeout(400);

    const afterFirst = await probe();

    await page.mouse.move(canvas.x + 420, y, {
        steps: 10
    });
    await page.waitForTimeout(300);

    const afterMove = await probe();

    await page.mouse.click(canvas.x + 420, y);
    await page.waitForTimeout(600);

    return {
        armed,
        afterFirst,
        afterMove,
        final: await probe(),
        panel: await page.evaluate(
            () =>
                document
                    .getElementById("drawingProperties")
                    ?.innerText?.slice(0, 300)
        )
    };
}
