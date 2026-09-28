export default async function run(page, ui) {
  const out = {};
  const before = await ui.snapshot();
  const tab = before.match(/@(e\d+) [^\n]*Engineering Drawing/)?.[1];
  if (!tab) return { error: "drawing tab missing", before };
  await ui.click(tab);
  await page.waitForTimeout(2000);

  const canvas = page.locator(".drawing-canvas");
  const box = await canvas.boundingBox();
  const msg = () => page.locator("#drawingToolMessage").innerText();

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(400);

  /*
   * Set a property by driving the real input element. The
   * input sits inside the stepper wrapper, so it is located
   * by data-property and filled directly.
   */
  const setField = async (key, value) => {
    await page.evaluate(
      ([k, v]) => {
        const input = document.querySelector(
          `#drawingProperties [data-property="${k}"]`,
        );
        input.focus();
        input.value = String(v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      [key, value],
    );
    await page.waitForTimeout(500);
  };

  const makeForce = async (fx, fy, magnitude, angle) => {
    await page.locator('#drawingToolList button[data-tool-id="force"]').click();
    await page.waitForTimeout(350);
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(800);
    await setField("magnitude", magnitude);
    await setField("angle", angle);
    return page.evaluate(() =>
      Object.fromEntries(
        [
          ...document.querySelectorAll("#drawingProperties [data-property]"),
        ].map((el) => [el.dataset.property, el.value]),
      ),
    );
  };

  out.forceA = await makeForce(0.4, 0.35, 100, 0);
  out.forceB = await makeForce(0.4, 0.6, 100, 90);

  // Select both forces.
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(350);

  const anchors = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    const lines = [...svg.querySelectorAll("line")].filter(
      (l) => l.getAttribute("stroke-dasharray") === null,
    );
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    const sx = vb[2] ? sr.width / vb[2] : 1;
    const sy = vb[3] ? sr.height / vb[3] : 1;
    return lines.map((l) => ({
      x: sr.left + (Number(l.getAttribute("x1")) - vb[0]) * sx,
      y: sr.top + (Number(l.getAttribute("y1")) - vb[1]) * sy,
    }));
  });

  out.anchorCount = anchors.length;

  if (anchors.length >= 2) {
    await page.mouse.click(anchors[0].x, anchors[0].y);
    await page.waitForTimeout(400);
    await page.keyboard.down("Shift");
    await page.mouse.click(anchors[1].x, anchors[1].y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(600);
  }

  out.handlesAfterShift = await page.evaluate(
    () => document.querySelectorAll(".drawing-manipulation-handle").length,
  );

  // Resultant of 100 N at 0 and 100 N at 90 = 141.42 N at 45.
  await page
    .locator('#drawingToolList button[data-tool-id="resultant"]')
    .click();
  await page.waitForTimeout(700);
  out.resultant = await msg();

  // Equilibrium should report the unbalanced sums.
  await page
    .locator('#drawingToolList button[data-tool-id="equilibrium"]')
    .click();
  await page.waitForTimeout(700);
  out.equilibrium = await msg();

  return out;
}
