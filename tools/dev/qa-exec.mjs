/*
 * Establishes whether the drawing scripts execute at all in this
 * browser, by evaluating one of them directly and seeing what happens.
 */
export default async function run(page, ui) {
    await page.goto("http://localhost:8931/index.html", {
        waitUntil: "load"
    });
    await page.waitForTimeout(2000);

    return await page.evaluate(async () => {
        const out = {};

        /* 1. Does a simple classic script set a global? */
        try {
            const probe = document.createElement("script");
            probe.textContent =
                "window.__probeRan = 'yes';";
            document.body.appendChild(probe);
            out.probeRan = window.__probeRan;
        } catch (e) {
            out.probeError = e.message;
        }

        /* 2. Is the reference already there, but not on window? */
        out.evalTools =
            typeof eval("typeof drawingToolGroups");

        out.evalState =
            typeof eval("typeof enggDrawingState");

        /* 3. Can a module be fetched and run by hand? */
        try {
            const res = await fetch(
                "/js/engineering-drawing/drawing-state.js"
            );
            const text = await res.text();
            out.fetched = text.length;

            const s = document.createElement("script");
            s.textContent = text;
            document.body.appendChild(s);

            out.afterManualRun =
                typeof window.enggDrawingState;
        } catch (e) {
            out.manualError = e.message;
        }

        return out;
    });
}
