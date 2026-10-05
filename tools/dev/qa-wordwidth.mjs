/*
 * Measures the widest single WORD in every tool label, so the panel
 * can be sized to fit whole words rather than tuned by eye.
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

    /* Visit every discipline so every tool name is measured. */
    const categories = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll(".drawing-category")
        ).map((el) => el.dataset.category)
    );

    const words = new Map();

    for (const category of categories) {
        await page.evaluate((cat) => {
            document
                .querySelector(
                    `.drawing-category[data-category="${cat}"]`
                )
                ?.click();
        }, category);
        await page.waitForTimeout(280);

        const found = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll(".drawing-tool-label")
            ).map((el) => el.textContent.trim())
        );

        found.forEach((text) => {
            text
                .split(/\s+/)
                .filter(Boolean)
                .forEach((word) => {
                    if (!words.has(word)) {
                        words.set(word, text);
                    }
                });
        });
    }

    /* Measure the widest words for real, at the label's own font. */
    return await page.evaluate((pairs) => {
        const probe = document.createElement("span");
        const cs = getComputedStyle(
            document.querySelector(".drawing-tool-label") ||
                document.body
        );

        probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`;

        document.body.appendChild(probe);

        const measured = pairs
            .map(([word, full]) => {
                probe.textContent = word;
                return {
                    word,
                    full,
                    width: Math.round(
                        probe.getBoundingClientRect().width
                    )
                };
            })
            .sort((a, b) => b.width - a.width);

        probe.remove();

        return {
            font: cs.font,
            widest: measured.slice(0, 12)
        };
    }, [...words.entries()]);
}
