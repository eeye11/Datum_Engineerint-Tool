/*
 * Double-clicks ON a feature and reports whether the polygon
 * side-count prompt appears. Verification aid.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  const canvas = await page.locator(".drawing-canvas").boundingBox();

  const x = canvas.x + 150;
  const y = canvas.y + canvas.height / 2;

  /* Draw a line, so there is a feature to double-click. */
  await page.evaluate(() => {
    document.querySelector('[data-tool-id="line"]')?.click();
  });
  await page.waitForTimeout(200);

  await page.mouse.click(x, y);
  await page.waitForTimeout(200);
  await page.mouse.click(x + 300, y, { steps: 10 });
  await page.waitForTimeout(500);

  const state = () =>
    page.evaluate(() => ({
      polygonPrompt: Boolean(document.querySelector(".drawing-polygon-prompt")),
      polygonText:
        document
          .querySelector(".drawing-polygon-prompt")
          ?.innerText?.slice(0, 200) ?? null,
      message:
        document
          .getElementById("drawingToolMessage")
          ?.innerText?.slice(0, 160) ?? null,
    }));

  const beforeDbl = await state();

  /* Double-click ON the line we just drew. */
  await page.mouse.dblclick(x + 150, y);
  await page.waitForTimeout(700);

  const afterDbl = await state();

  return { beforeDbl, afterDbl };
}
