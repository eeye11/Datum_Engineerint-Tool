/*
 * Reports the tool message after every single canvas click, so the
 * first step of a span construction can be seen or not seen.
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
    await page.waitForTimeout(500);

    const canvas = await page
        .locator(".drawing-canvas")
        .boundingBox();

    const y = canvas.y + canvas.height / 2;

    const msg = () =>
        page.evaluate(
            () =>
                document
                    .getElementById(
                        "drawingToolMessage"
                    )
                    ?.innerText || ""
        );

    const run = async (toolId) => {
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

        const steps = [await msg()];

        for (const dx of [150, 300, 450]) {
            await page.mouse.move(canvas.x + dx, y);
            await page.waitForTimeout(120);
            await page.mouse.down();
            await page.waitForTimeout(60);
            await page.mouse.up();
            await page.waitForTimeout(400);
            steps.push(await msg());
        }

        return { toolId, steps };
    };

    return {
        line: await run("line"),
        beam: await run("beam"),
        sfd: await run("shear-force-diagram")
    };
}
