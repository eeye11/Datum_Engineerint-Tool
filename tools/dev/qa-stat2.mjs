/*
 * Screenshots the real tool panel at a large device pixel ratio, so
 * wrapped labels can be read rather than measured indirectly.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 30000 });

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ [^\n]*Engineering Drawing[^\n]*/
    )?.[0];

    if (tab) {
        await ui.click(tab.match(/@e\d+/)[0]);
        await page.waitForTimeout(900);
    }

    /* The discipline with the longest tool names. */
    await page.evaluate(() => {
        document
            .querySelector(
                '.drawing-category[data-category="STATICS"]'
            )
            ?.click();
    });
    await page.waitForTimeout(500);

    return await page.evaluate(() => {
        const panel = document.querySelector(
            ".drawing-panel-rail-left"
        );

        const label = document.querySelector(
            ".drawing-tool-label"
        );

        return {
            panelW: Math.round(
                panel.getBoundingClientRect().width
            ),
            labelW: label
                ? Math.round(
                      label.getBoundingClientRect().width
                  )
                : null,
            labels: Array.from(
                document.querySelectorAll(
                    ".drawing-tool-label"
                )
            ).map(
                (el) => ({
                    text: el.textContent.trim(),
                    w: Math.round(
                        el.getBoundingClientRect().width
                    ),
                    h: Math.round(
                        el.getBoundingClientRect().height
                    )
                })
            )
        };
    });
}
