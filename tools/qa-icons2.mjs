/*
 * Screenshots the five Analysis tool buttons, at a magnified size,
 * so the icons can be looked at rather than trusted. Verification
 * aid, not part of the application.
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

    const found = await page.evaluate(() => {
        document
            .querySelector(
                '.drawing-category[data-category="STATICS"]'
            )
            ?.click();

        return true;
    });

    await page.waitForTimeout(600);

    /* Build a magnified contact sheet of the five Analysis icons. */
    await page.evaluate(() => {
        const wanted = [
            "shear-force-diagram",
            "bending-moment-diagram",
            "axial-force-diagram",
            "resultant",
            "force-components"
        ];

        const sheet = document.createElement("div");
        sheet.id = "icon-sheet";
        sheet.style.cssText =
            "position:fixed;inset:0;z-index:99999;background:#fff;" +
            "display:flex;align-items:center;justify-content:center;" +
            "gap:28px;padding:40px;";

        wanted.forEach((id) => {
            const btn = document.querySelector(
                `[data-tool-id="${id}"]`
            );

            if (!btn) {
                return;
            }

            const icon =
                btn.querySelector(
                    ".drawing-tool-icon"
                ) || btn;

            const clone = icon.cloneNode(true);

            clone.style.cssText =
                "width:120px;height:120px;color:#111;" +
                "background:#f7f9fa;border:1px solid #ccd;" +
                "padding:8px;box-sizing:border-box;";

            /*
             * The inner <svg> carries its own width/height, so
             * sizing the wrapper alone leaves the artwork at its
             * original size in the corner. Scale the svg itself.
             */
            clone
                .querySelectorAll("svg")
                .forEach((svg) => {
                    svg.style.width = "100%";
                    svg.style.height = "100%";
                    svg.removeAttribute("width");
                    svg.removeAttribute("height");
                });

            const cell = document.createElement("div");
            cell.style.cssText = "text-align:center;";

            const label = document.createElement("div");
            label.style.cssText =
                "font:12px sans-serif;margin-top:8px;";

            label.textContent =
                btn.innerText.trim() || id;

            cell.appendChild(clone);
            cell.appendChild(label);
            sheet.appendChild(cell);
        });

        document.body.appendChild(sheet);
    });

    await page.waitForTimeout(400);

    return { found };
}
