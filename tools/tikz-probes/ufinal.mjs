export default async function run(page, ui) {
  const out = {};
  const before = await ui.snapshot();
  const tab = before.match(/@(e\d+) [^\n]*Engineering Drawing/)?.[1];
  if (!tab) return { error: "drawing tab missing", before };
  await ui.click(tab);
  await page.waitForTimeout(2000);

  const canvas = page.locator(".drawing-canvas");
  const box = await canvas.boundingBox();
  const at = (x, y) => ({
    x: box.x + box.width * x,
    y: box.y + box.height * y,
  });
  const msg = () => page.locator("#drawingToolMessage").innerText();

  // ---- Geometry toolbar ----
  await page.locator('.drawing-category[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(300);
  out.geometryTools = await page.evaluate(() =>
    [...document.querySelectorAll("#drawingToolList button")].map(
      (b) => b.dataset.toolId,
    ),
  );
  const core = out.geometryTools.filter((id) =>
    ["triangle", "rectangle", "line", "circle", "arc"].includes(id),
  );
  out.coreOrder = core;
  out.orderMatches =
    JSON.stringify(core) ===
    JSON.stringify(["triangle", "rectangle", "line", "circle", "arc"]);
  out.noConstructionOrCentre =
    !out.geometryTools.includes("construction-line") &&
    !out.geometryTools.includes("centre-line");

  // ---- Geometry creation ----
  const make = async (toolId, pts) => {
    await page
      .locator(`#drawingToolList button[data-tool-id="${toolId}"]`)
      .click();
    await page.waitForTimeout(300);
    for (const [x, y] of pts) {
      await page.mouse.click(at(x, y).x, at(x, y).y);
      await page.waitForTimeout(240);
    }
    await page.waitForTimeout(500);
    return page.evaluate(
      () =>
        document.getElementById("drawingProperties").innerText.split("\n")[0],
    );
  };

  out.tools = {};
  out.tools.line = await make("line", [
    [0.2, 0.25],
    [0.32, 0.25],
  ]);
  out.tools.circle = await make("circle", [
    [0.2, 0.42],
    [0.27, 0.42],
  ]);
  out.tools.rectangle = await make("rectangle", [
    [0.2, 0.62],
    [0.32, 0.74],
  ]);
  out.tools.triangle = await make("triangle", [
    [0.45, 0.15],
    [0.58, 0.15],
    [0.51, 0.05],
  ]);

  // Polygon.
  await page.locator('#drawingToolList button[data-tool-id="polygon"]').click();
  await page.waitForTimeout(350);
  await page.locator('[data-polygon-mode="centre"]').click();
  await page.waitForTimeout(350);
  await page.mouse.click(at(0.72, 0.3).x, at(0.72, 0.3).y);
  await page.waitForTimeout(260);
  await page.mouse.click(at(0.82, 0.3).x, at(0.82, 0.3).y);
  await page.waitForTimeout(450);
  await page.locator("#polygonSidesInput").fill("6");
  await page.locator("[data-polygon-confirm]").click();
  await page.waitForTimeout(650);
  out.tools.polygon = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  // Arc.
  await page.locator('#drawingToolList button[data-tool-id="arc"]').click();
  await page.waitForTimeout(350);
  await page.locator('[data-arc-mode="centrepoint"]').click();
  await page.waitForTimeout(350);
  await page.mouse.click(at(0.72, 0.6).x, at(0.72, 0.6).y);
  await page.waitForTimeout(240);
  await page.mouse.click(at(0.82, 0.6).x, at(0.82, 0.6).y);
  await page.waitForTimeout(240);
  await page.mouse.click(at(0.72, 0.49).x, at(0.72, 0.49).y);
  await page.waitForTimeout(650);
  out.tools.arc = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  // ---- 3-point arc inference ----
  await page.locator('#drawingToolList button[data-tool-id="arc"]').click();
  await page.waitForTimeout(350);
  await page.locator('[data-arc-mode="three-point"]').click();
  await page.waitForTimeout(350);
  const p1 = at(0.3, 0.55);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForTimeout(320);
  await page.mouse.click(at(0.6, 0.35).x, at(0.6, 0.35).y);
  await page.waitForTimeout(320);
  await page.mouse.move(p1.x + 200, p1.y + 3);
  await page.waitForTimeout(700);
  out.arcHorizontal = await msg();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // ---- Spinner ----
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(350);
  await page.mouse.click(at(0.26, 0.25).x, at(0.26, 0.25).y);
  await page.waitForTimeout(550);

  const lengthInput = page.locator(
    '#drawingProperties [data-property="length"]',
  );
  out.lengthBefore = await lengthInput.inputValue();
  const row = page
    .locator("#drawingProperties .drawing-property-grid-value", {
      has: page.locator('[data-property="length"]'),
    })
    .first();
  await row.locator(".drawing-number-stepper button").first().click();
  await page.waitForTimeout(550);
  out.lengthAfterUp = await lengthInput.inputValue();
  out.stepIsOne =
    Number(
      (Number(out.lengthAfterUp) - Number(out.lengthBefore)).toFixed(3),
    ) === 1;

  out.mojibake = await page.evaluate(() =>
    /[\u00c2\u00c3\u20ac]/.test(
      document.getElementById("drawingProperties").innerText,
    ),
  );

  return out;
}
