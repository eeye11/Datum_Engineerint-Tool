/*
 * Dispatches real pointer events on the canvas element itself,
 * rather than through the mouse, so a click is delivered even when
 * the browser considers the canvas a non-interactive box.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
    const snap = await ui.snapshot();
    const tab = snap.match(
        /@e\d+ button "Engineering Drawing"/
    )?.[0];

    if (!tab) return { error: "no drawing tab", snap };

    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(700);

    const result = await page.evaluate(() => {
        const canvas = document.querySelector(
            ".drawing-canvas"
        );

        const r = canvas.getBoundingClientRect();

        const msg = () =>
            document
                .getElementById("drawingToolMessage")
                ?.innerText || "";

        /*
         * Choose the tool through the app's own state, then
         * re-render, because clicking a tool button re-renders the
         * list and detaches whatever was being clicked.
         */
        const pick = (toolId) => {
            const btn = document.querySelector(
                `[data-tool-id="${toolId}"]`
            );

            if (!btn) {
                return "no button " + toolId;
            }

            btn.click();
            return "ok";
        };

        const clickAt = (dx, dy) => {
            const x =
                r.left + r.width * dx;
            const y =
                r.top + r.height * dy;

            const opts = {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: 0,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true
            };

            canvas.dispatchEvent(
                new PointerEvent(
                    "pointermove",
                    opts
                )
            );
            canvas.dispatchEvent(
                new MouseEvent(
                    "mousemove",
                    opts
                )
            );
            canvas.dispatchEvent(
                new PointerEvent(
                    "pointerdown",
                    opts
                )
            );
            canvas.dispatchEvent(
                new MouseEvent(
                    "mousedown",
                    opts
                )
            );
            canvas.dispatchEvent(
                new MouseEvent("click", opts)
            );
            canvas.dispatchEvent(
                new PointerEvent(
                    "pointerup",
                    opts
                )
            );
            canvas.dispatchEvent(
                new MouseEvent("mouseup", opts)
            );
        };

        /*
         * The Statics tools only exist once the Statics category
         * is the active one, so open it before reaching for one.
         */
        document
            .querySelector(
                '.drawing-category[data-category="STATICS"]'
            )
            ?.click();

        const out = {};

        const place = (
            toolId,
            dy
        ) => {
            const picked = pick(toolId);

            clickAt(0.15, dy);
            const first = msg();

            clickAt(0.75, dy);
            const second = msg();

            out[toolId] = {
                picked,
                first,
                second
            };
        };

        place("shear-force-diagram", 0.25);
        place("bending-moment-diagram", 0.45);
        place("axial-force-diagram", 0.65);

        out.panel =
            document
                .getElementById("drawingProperties")
                ?.innerText?.slice(0, 500);

        return out;
    });

    await page.waitForTimeout(500);

    return result;
}
