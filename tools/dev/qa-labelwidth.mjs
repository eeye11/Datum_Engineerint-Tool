/*
 * Measures EVERY tool label's full rendered width, so the panel can be
 * sized to fit whole labels rather than tuned by eye. Verification
 * aid, not part of the application.
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

    const categories = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll(".drawing-category")
        ).map((el) => el.dataset.category)
    );

    const all = [];

    for (const category of categories) {
        await page.evaluate((cat) => {
            document
                .querySelector(
                    `.drawing-category[data-category="${cat}"]`
                )
                ?.click();
        }, category);
        await page.waitForTimeout(260);

        const rows = await page.evaluate(() => {
            /*
             * The width a label needs if it were on ONE line.
             *
             * Rendered offscreen with wrapping switched off, so this
             * is the label's true single-line width and not the width
             * it was squeezed into. That distinction matters: the
             * question is how wide the panel has to be for a name to
             * fit without wrapping at all.
             */
            const probe = document.createElement("div");

            probe.style.cssText =
                "position:absolute;visibility:hidden;" +
                "left:-9999px;white-space:nowrap;";

            document.body.appendChild(probe);

            const out = [];

            document
                .querySelectorAll(".drawing-tool-label")
                .forEach((label) => {
                    const cs = getComputedStyle(label);

                    probe.style.font = cs.font;
                    probe.style.letterSpacing =
                        cs.letterSpacing;
                    probe.textContent =
                        label.textContent.trim();

                    out.push({
                        text: label.textContent.trim(),
                        needed: Math.round(
                            probe.getBoundingClientRect()
                                .width
                        ),
                        fitsNow: label.getClientRects()
                            .length === 1
                    });
                });

            probe.remove();
            return out;
        });

        rows.forEach((r) =>
            all.push({ category, ...r })
        );
    }

    all.sort((a, b) => b.needed - a.needed);

    return {
        panelW: await page.evaluate(
            () =>
                Math.round(
                    document
                        .querySelector(
                            ".drawing-panel-rail-left"
                        )
                        .getBoundingClientRect().width
                )
        ),
        labelW: await page.evaluate(() => {
            const l = document.querySelector(
                ".drawing-tool-label"
            );
            return l
                ? Math.round(
                      l.getBoundingClientRect().width
                  )
                : null;
        }),
        widest: all.slice(0, 12),
        total: all.length
    };
}
