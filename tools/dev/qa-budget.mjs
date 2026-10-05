/*
 * Breaks down exactly where the tool-panel's horizontal space goes,
 * so the width given to labels is accounted for rather than guessed.
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

    return await page.evaluate(() => {
        const rail = document.querySelector(
            ".drawing-panel-rail-left"
        );
        const panel = document.querySelector(
            ".drawing-tool-panel"
        );
        const list = document.querySelector(
            ".drawing-tool-list"
        );
        const btn = document.querySelector(".drawing-tool");
        const icon = btn?.querySelector(
            ".drawing-tool-icon"
        );
        const label = btn?.querySelector(
            ".drawing-tool-label"
        );

        const w = (el) =>
            el
                ? Math.round(
                      el.getBoundingClientRect().width
                  )
                : null;

        const cs = (el) =>
            el ? getComputedStyle(el) : null;

        return {
            railW: w(rail),
            panelW: w(panel),
            listW: w(list),
            btnW: w(btn),
            iconW: w(icon),
            labelW: w(label),
            details: {
                panelPad: cs(panel)?.padding,
                listPad: cs(list)?.padding,
                btnPad: cs(btn)?.padding,
                btnGap: cs(btn)?.gap,
                labelPad: cs(label)?.paddingLeft,
                labelIndent: cs(label)?.textIndent
            }
        };
    });
}
