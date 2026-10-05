/*
 * Reports the real available label width in the tool panel, against
 * the widest word, so the panel can be sized to fit whole words.
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

    const categories = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll(".drawing-category")
        ).map((el) => el.dataset.category)
    );

    let widest = { word: "", width: 0 };

    for (const category of categories) {
        await page.evaluate((cat) => {
            document
                .querySelector(
                    `.drawing-category[data-category="${cat}"]`
                )
                ?.click();
        }, category);
        await page.waitForTimeout(260);

        const row = await page.evaluate(() => {
            const label = document.querySelector(
                ".drawing-tool-label"
            );

            if (!label) return null;

            /* The width a word actually has to fit into. */
            const box = label.getBoundingClientRect();
            const cs = getComputedStyle(label);

            /* Measure the widest word in this label, unsplit. */
            const probe = document.createElement("span");
            probe.style.cssText =
                "position:absolute;visibility:hidden;" +
                "white-space:nowrap;font:" + cs.font;

            document.body.appendChild(probe);

            let max = 0;
            let word = "";

            label.textContent
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .forEach((w) => {
                    probe.textContent = w;
                    const wpx =
                        probe.getBoundingClientRect()
                            .width;
                    if (wpx > max) {
                        max = wpx;
                        word = w;
                    }
                });

            probe.remove();

            return {
                labelW: Math.round(box.width),
                widestWord: word,
                widestPx: Math.round(max),
                text: label.textContent.trim().slice(0, 30)
            };
        });

        if (row && row.widestPx > widest.width) {
            widest = {
                word: row.widestWord,
                width: row.widestPx,
                labelW: row.labelW
            };
        }
    }

    return {
        widest,
        fits:
            widest.width > 0 &&
            widest.labelW >= widest.width
    };
}
