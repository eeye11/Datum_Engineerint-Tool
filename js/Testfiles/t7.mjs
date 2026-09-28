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

  const setField = async (key, value) => {
    await page.evaluate(
      ([k, v]) => {
        const input = document.querySelector(
          `#drawingProperties [data-property="${k}"]`,
        );
        if (!input) return;
        input.focus();
        input.value = String(v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      [key, value],
    );
    await page.waitForTimeout(500);
  };

  const makeForce = async (fy, magnitude, angle) => {
    await page.locator('#drawingToolList button[data-tool-id="force"]').click();
    await page.waitForTimeout(350);
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * fy);
    await page.waitForTimeout(800);
    await setField("magnitude", magnitude);
    await setField("angle", angle);
  };

  // 100 N at 0 deg and 100 N at 90 deg.
  await makeForce(0.35, 100, 0);
  await makeForce(0.6, 100, 90);

  // Select both forces via their anchors.
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(350);

  const anchors = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    const sx = vb[2] ? sr.width / vb[2] : 1;
    const sy = vb[3] ? sr.height / vb[3] : 1;
    return [...svg.querySelectorAll("line")]
      .filter((l) => l.getAttribute("stroke-dasharray") === null)
      .map((l) => ({
        x: sr.left + (Number(l.getAttribute("x1")) - vb[0]) * sx,
        y: sr.top + (Number(l.getAttribute("y1")) - vb[1]) * sy,
      }));
  });

  out.anchors = anchors.length;

  if (anchors.length >= 2) {
    await page.mouse.click(anchors[0].x, anchors[0].y);
    await page.waitForTimeout(400);
    await page.keyboard.down("Shift");
    await page.mouse.click(anchors[1].x, anchors[1].y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(600);
  }

  out.handles = await page.evaluate(
    () => document.querySelectorAll(".drawing-manipulation-handle").length,
  );

  // Expected: 100 at 0 plus 100 at 90 => 141.42 N at 45 deg.
  await page
    .locator('#drawingToolList button[data-tool-id="resultant"]')
    .click();
  await page.waitForTimeout(700);
  out.resultant = await msg();

  await page
    .locator('#drawingToolList button[data-tool-id="equilibrium"]')
    .click();
  await page.waitForTimeout(700);
  out.equilibrium = await msg();

  await page
    .locator('#drawingToolList button[data-tool-id="force-components"]')
    .click();
  await page.waitForTimeout(700);
  out.components = await msg();

  await page
    .locator('#drawingToolList button[data-tool-id="moment-analysis"]')
    .click();
  await page.waitForTimeout(700);
  out.moments = await msg();

  await page
    .locator('#drawingToolList button[data-tool-id="free-body-diagram"]')
    .click();
  await page.waitForTimeout(700);
  out.fbd = await msg();

  return out;
}
