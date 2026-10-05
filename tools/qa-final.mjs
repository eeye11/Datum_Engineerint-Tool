/*
 * Screenshots the drawing with the panels open, and again with
 * both collapsed, to check the gap, the fill and the captions.
 * Verification aid, not part of the application.
 */
import fs from "fs";

export default async function run(page, ui) {
  await page.setViewportSize({
    width: 1440,
    height: 900,
  });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  const read = () =>
    page.evaluate(() => {
      const w = document.querySelector(".drawing-workspace");

      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          l: Math.round(r.left),
          r: Math.round(r.right),
        };
      };

      const cap = (id) =>
        document
          .getElementById(id)
          ?.querySelector(".drawing-panel-toggle-text")
          ?.textContent?.trim();

      return {
        total: Math.round(w.getBoundingClientRect().width),
        canvas: box(".drawing-canvas"),
        right: box(".drawing-panel-rail-right"),
        captions: {
          tools: cap("drawingToolPanelToggle"),
          features: cap("drawingFeaturesPanelToggle"),
        },
        zoom: document.getElementById("drawingZoomValue")?.value,
      };
    });

  const open = await read();

  await page.click("#drawingToolPanelToggle");
  await page.click("#drawingFeaturesPanelToggle");
  await page.waitForTimeout(500);

  const hidden = await read();

  return { open, hidden };
}
