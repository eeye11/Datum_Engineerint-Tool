/*
 * Clicks the canvas at known offsets using a full move/down/up
 * sequence on the canvas ELEMENT, reached through page.locator so
 * the coordinates are the canvas's own. Verification aid.
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
    await page.waitForTimeout(500);

    const box = await page
        .locator(".drawing-canvas")
        .boundingBox();

    const msg = () =>
        page.evaluate(
            () =>
                document
                    .getElementById(
                        "drawingToolMessage"
                    )
                    ?.innerText || ""
        );

    const clickAt = async (dx, dy = 0) => {
        const x = box.x + dx;
        const y = box.y + box.height / 2 + dy;

        await page.mouse.move(x - 3, y - 3);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(350);

        return await msg();
    };

    const place = async (toolId, dy) => {
        await page.evaluate(
            (id) => {
                document
                    .querySelector(
                        `[data-tool-id="${id}"]`
                    )
                    ?.click();
            },
            toolId
        );
        await page.waitForTimeout(300);

        const first = await clickAt(150, dy);
        const second = await clickAt(450, dy);

        return { toolId, first, second };
    };

    return {
        line: await place("line", -60),
        sfd: await place("shear-force-diagram", 0),
        bmd: await place("bending-moment-diagram", 60),
        afd: await place("axial-force-diagram", 120),
        panel: await page.evaluate(
            () =>
                document
                    .getElementById("drawingProperties")
                    ?.innerText?.slice(0, 400)
        )
    };
}
