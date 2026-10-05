/*
 * Reports the computed sizing of the right rail's children, to
 * find what is stopping the Features panel from filling it.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    return await page.evaluate(() => {
        const rail = document.querySelector(
            ".drawing-panel-rail-right"
        );

        const info = (el) => {
            if (!el) return null;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
                cls: String(el.className).slice(0, 50),
                w: Math.round(r.width),
                flex: cs.flex,
                width: cs.width,
                maxWidth: cs.maxWidth,
                minWidth: cs.minWidth,
                display: cs.display,
                boxSizing: cs.boxSizing,
                padding: cs.padding
            };
        };

        return {
            rail: info(rail),
            railChildren: [...rail.children].map(info),
            deep: [...rail.querySelectorAll("*")]
                .slice(0, 12)
                .map(info)
        };
    });
}
