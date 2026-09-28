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

  // ---- GEOMETRY sections and order ----
  await page.locator('.drawing-category[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  out.geometry = await page.evaluate(() =>
    [...document.querySelectorAll("#drawingToolList .drawing-tool-group")].map(
      (s) => ({
        label: (
          s.querySelector(".drawing-tool-group-label")?.textContent || ""
        ).trim(),
        tools: [...s.querySelectorAll("button")].map((b) => b.dataset.toolId),
        icons: [...s.querySelectorAll("button")].map(
          (b) => !!b.querySelector("svg"),
        ),
      }),
    ),
  );

  // ---- STATICS sections and order ----
  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(500);
  out.statics = await page.evaluate(() =>
    [...document.querySelectorAll("#drawingToolList .drawing-tool-group")].map(
      (s) => ({
        label: (
          s.querySelector(".drawing-tool-group-label")?.textContent || ""
        ).trim(),
        tools: [...s.querySelectorAll("button")].map((b) => b.dataset.toolId),
        icons: [...s.querySelectorAll("button")].map(
          (b) => !!b.querySelector("svg"),
        ),
      }),
    ),
  );

  // ---- POINT: no rotation handle ----
  await page.locator('.drawing-category[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(300);
  await page.locator('#drawingToolList button[data-tool-id="point"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.25, 0.25).x, at(0.25, 0.25).y);
  await page.waitForTimeout(700);

  out.pointHandles = await page.evaluate(() => ({
    total: document.querySelectorAll(".drawing-manipulation-handle").length,
    rotation: document.querySelectorAll(".drawing-manipulation-handle.rotation")
      .length,
  }));

  // ---- LINE: has a rotation handle ----
  await page.locator('#drawingToolList button[data-tool-id="line"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.45, 0.25).x, at(0.45, 0.25).y);
  await page.waitForTimeout(250);
  await page.mouse.click(at(0.65, 0.25).x, at(0.65, 0.25).y);
  await page.waitForTimeout(700);

  out.lineHandles = await page.evaluate(() => ({
    total: document.querySelectorAll(".drawing-manipulation-handle").length,
    rotation: document.querySelectorAll(".drawing-manipulation-handle.rotation")
      .length,
  }));

  // ---- STATICS: create a Body and a Reference Point ----
  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(400);

  await page.locator('#drawingToolList button[data-tool-id="body"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.25, 0.6).x, at(0.25, 0.6).y);
  await page.waitForTimeout(700);
  out.bodyTitle = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  await page
    .locator('#drawingToolList button[data-tool-id="reference-point"]')
    .click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.45, 0.6).x, at(0.45, 0.6).y);
  await page.waitForTimeout(700);
  out.refPointTitle = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  await page
    .locator('#drawingToolList button[data-tool-id="reference-line"]')
    .click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.6, 0.6).x, at(0.6, 0.6).y);
  await page.waitForTimeout(250);
  await page.mouse.click(at(0.8, 0.7).x, at(0.8, 0.7).y);
  await page.waitForTimeout(700);
  out.refLineTitle = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  // ---- Feature Tree grouping ----
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.03, 0.03).x, at(0.03, 0.03).y);
  await page.waitForTimeout(700);

  out.tree = await page.evaluate(() => {
    const groups = [
      ...document.querySelectorAll(".drawing-component-group"),
    ].map((g) => g.textContent.trim());
    const rows = [...document.querySelectorAll(".drawing-component-row")].map(
      (r) => r.innerText.trim(),
    );
    return { groups, rows };
  });

  return out;
}
