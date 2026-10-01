/*
 * Double-clicks an empty spot and reports which tool ends up
 * active and whether the polygon side-count prompt appears.
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

    const canvas = await page
        .locator(".drawing-canvas")
        .boundingBox();

    const x = canvas.x + canvas.width / 2;
    const y = canvas.y + canvas.height / 2;

    const state = () =>
        page.evaluate(() => ({
            activeToolButton: document
                .querySelector(
                    ".drawing-tool-button.active"
                )
                ?.dataset?.toolId ??
                document
                    .querySelector(
                        "[data-tool-id].active"
                    )
                    ?.dataset?.toolId ??
                null,
            polygonPromptVisible: Boolean(
                document.querySelector(
                    ".drawing-polygon-prompt"
                )
            )
        }));

    const before = await state();

    await page.mouse.dblclick(x, y);
    await page.waitForTimeout(600);

    const after = await state();

    return { before, after };
}
