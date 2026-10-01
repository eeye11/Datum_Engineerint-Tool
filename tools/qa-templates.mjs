/*
 * Places each of the three analysis templates and reports what the
 * Features panel shows, so they are checked as one semantic object.
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

    const place = async (toolId, offsetY) => {
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
        await page.waitForTimeout(350);

        const y = canvas.y + canvas.height / 2 + offsetY;

        await page.mouse.click(canvas.x + 150, y);
        await page.waitForTimeout(350);
        await page.mouse.click(
            canvas.x + 450,
            y,
            { steps: 12 }
        );
        await page.waitForTimeout(600);

        return await page.evaluate(() => {
            const b = document.querySelector(
                '[data-tool-id="shear-force-diagram"]'
            );

            return {
                active:
                    b?.getAttribute("aria-pressed") ??
                    "",
                panel:
                    document
                        .getElementById("drawingProperties")
                        ?.innerText?.slice(0, 240) || ""
            };
        });
    };

    const sfd = await place("shear-force-diagram", -60);
    const bmd = await place("bending-moment-diagram", 0);
    const afd = await place("axial-force-diagram", 60);

    return { sfd, bmd, afd };
}
