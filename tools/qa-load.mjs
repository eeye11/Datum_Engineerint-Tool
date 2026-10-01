/*
 * Evaluates drawing.js by hand in the page and reports the exact
 * error, so a silent load failure is named. Verification aid.
 */
export default async function run(page, ui) {
    await page.goto("http://localhost:8931/index.html", {
        waitUntil: "load"
    });
    await page.waitForTimeout(2000);

    return await page.evaluate(async () => {
        const out = {};

        try {
            const res = await fetch(
                "/js/engineering-drawing/drawing.js"
            );
            const text = await res.text();
            out.length = text.length;

            const s = document.createElement("script");
            s.textContent = text;
            document.body.appendChild(s);

            out.noError = true;
            out.sheets = typeof window.enggDrawingSheets;
        } catch (e) {
            out.error = e.message;
            out.stack = (e.stack || "")
                .split("\n")
                .slice(0, 4)
                .join(" | ");
        }

        return out;
    });
}
