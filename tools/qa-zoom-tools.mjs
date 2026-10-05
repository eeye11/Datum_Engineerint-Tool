/*
 * Screenshots the tool list so wrapped labels can be inspected for
 * words cut in the middle. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  await page.setViewportSize({
    width: 1280,
    height: 900,
  });
  await page.waitForTimeout(400);

  /* Magnify the tool panel so wrapping is legible. */
  await page.evaluate(() => {
    const panel = document.querySelector(".drawing-panel-rail-left");

    const clone = panel.cloneNode(true);

    clone.id = "zoom-panel";
    clone.style.cssText =
      "position:fixed;left:0;top:0;z-index:99999;" +
      "width:280px;height:auto;background:#fff;" +
      "border:1px solid #99c;overflow:visible;";

    const list = clone.querySelector(".drawing-tool-list");

    if (list) {
      list.style.overflow = "visible";
    }

    clone.querySelectorAll(".drawing-tool-label").forEach((el) => {
      el.style.fontSize = "22px";
      el.style.lineHeight = "1.2";
    });

    clone.querySelectorAll(".drawing-tool-icon").forEach((el) => {
      el.style.flex = "0 0 36px";
      el.style.width = "36px";
      el.style.height = "36px";
    });

    document.body.appendChild(clone);
  });

  await page.waitForTimeout(300);

  return { zoomed: true };
}
