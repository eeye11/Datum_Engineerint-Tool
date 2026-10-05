/*
 * Measures EVERY tool label against the widest word in it, so a word
 * that cannot fit on a line of its own is found rather than assumed
 * away. Verification aid.
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

    const problems = [];
    let labelW = 0;

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
            const probe = document.createElement("span");
            probe.style.cssText =
                "position:absolute;visibility:hidden;" +
                "white-space:nowrap;";

            document.body.appendChild(probe);

            const out = [];

            document
                .querySelectorAll(".drawing-tool-label")
                .forEach((label) => {
                    const cs = getComputedStyle(label);
                    probe.style.font = cs.font;

                    const box =
                        label.getBoundingClientRect();

                    let widest = 0;
                    let word = "";

                    label.textContent
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                        .forEach((w) => {
                            probe.textContent = w;
                            const px =
                                probe.getBoundingClientRect()
                                    .width;
                            if (px > widest) {
                                widest = px;
                                word = w;
                            }
                        });

                    /*
                     * The box a word must fit into: the label's
                     * width, less the hanging indent it carries.
                     */
                    const indent =
                        parseFloat(
                            cs.paddingLeft
                        ) || 0;

                    out.push({
                        text: label.textContent.trim().slice(
                            0,
                            30
                        ),
                        boxW: Math.round(box.width),
                        usable: Math.round(
                            box.width - indent
                        ),
                        widestPx: Math.round(widest),
                        word
                    });
                });

            probe.remove();
            return out;
        });

        rows.forEach((r) => {
            if (r.boxW > 0) {
                labelW = Math.max(labelW, r.boxW);
            }

            if (r.widestPx > r.usable) {
                problems.push({
                    category,
                    ...r
                });
            }
        });
    }

    return {
        labelWidth: labelW,
        problemCount: problems.length,
        problems: problems.slice(0, 10)
    };
}
