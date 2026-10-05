/*
 * Runs the same click-drag against a known-working span tool and
 * the diagram tool, so a failure specific to one can be told apart
 * from a fault in the test itself. Verification aid.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  const canvas = await page.locator(".drawing-canvas").boundingBox();

  const y = canvas.y + canvas.height / 2;

  const tryTool = async (toolId) => {
    await page.evaluate((id) => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        ?.click();
      document.querySelector(`[data-tool-id="${id}"]`)?.click();
    }, toolId);
    await page.waitForTimeout(350);

    await page.mouse.click(canvas.x + 150, y);
    await page.waitForTimeout(350);

    const mid = await page.evaluate(
      () => document.getElementById("drawingToolMessage")?.innerText || "",
    );

    await page.mouse.click(canvas.x + 450, y, { steps: 10 });
    await page.waitForTimeout(600);

    const done = await page.evaluate(
      () => document.getElementById("drawingToolMessage")?.innerText || "",
    );

    const count = await page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      return svg ? svg.querySelectorAll("g, path, rect, line").length : 0;
    });

    return { toolId, mid, done, count };
  };

  return {
    beam: await tryTool("beam"),
    sfd: await tryTool("shear-force-diagram"),
  };
}
