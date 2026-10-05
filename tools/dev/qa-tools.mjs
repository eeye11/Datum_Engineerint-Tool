/*
 * Reports the discipline category tabs and which tools are present
 * after switching to Statics. Verification aid.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    const before = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll(
                ".drawing-category"
            )
        ).map((el) => el.dataset.category)
    );

    const clicked = await page.evaluate(() => {
        const t = document.querySelector(
            '.drawing-category[data-category="STATICS"]'
        );

        if (!t) {
            return false;
        }

        t.click();
        return true;
    });

    await page.waitForTimeout(600);

    const tools = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll("[data-tool-id]")
        ).map((b) => b.dataset.toolId)
    );

    return { before, clicked, tools };
}
