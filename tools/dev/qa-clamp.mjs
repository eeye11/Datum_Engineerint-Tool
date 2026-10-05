/*
 * Reports each tool button's box and its label's box, so a clipped
 * label can be told apart from one that simply did not wrap.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    await page.waitForLoadState("load", { timeout: 20000 });

    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);

    await page.evaluate(() => {
        document
            .querySelector(
                '.drawing-category[data-category="STATICS"]'
            )
            ?.click();
    });
    await page.waitForTimeout(500);

    return await page.evaluate(() => {
        const panel =
            document.querySelector(
                ".drawing-tool-panel"
            );

        return {
            panelWidth: Math.round(
                panel?.getBoundingClientRect().width ?? 0
            ),
            rows: Array.from(
                document.querySelectorAll(
                    ".drawing-tool"
                )
            )
                .slice(0, 22)
                .map((btn) => {
                    const label =
                        btn.querySelector(
                            ".drawing-tool-label"
                        );

                    const b =
                        btn.getBoundingClientRect();
                    const l =
                        label?.getBoundingClientRect();

                    return {
                        text: (
                            label?.textContent ?? ""
                        ).trim().slice(0, 26),
                        btnH: Math.round(b.height),
                        labelH: l
                            ? Math.round(l.height)
                            : null,
                        labelW: l
                            ? Math.round(l.width)
                            : null,
                        scrollW: btn.scrollWidth,
                        clientW: btn.clientWidth,
                        clipped:
                            btn.scrollWidth >
                            btn.clientWidth + 1
                    };
                })
        };
    });
}
