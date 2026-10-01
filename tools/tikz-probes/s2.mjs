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

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(400);

  // Pick a submenu item and record the status message it produces.
  const pick = async (category, childLabel) => {
    await page
      .locator(`#drawingToolList button[data-tool-id="${category}"]`)
      .click();
    await page.waitForTimeout(350);
    await page
      .locator(".drawing-coordinate-submenu-item", { hasText: childLabel })
      .first()
      .click();
    await page.waitForTimeout(500);
    return {
      active: await page.evaluate(
        () =>
          document.querySelector("#drawingToolList button.active")?.dataset
            .toolId || null,
      ),
      message: await msg(),
    };
  };

  out.activation = {};
  out.activation.particle = await pick("body", "Particle");
  out.activation.rigidBody = await pick("body", "Rigid Body");
  out.activation.pointForce = await pick("force", "Point Force");
  out.activation.pointLoad = await pick("load", "Point Load");

  // Place a Particle and check its panel and tree group.
  await page.locator('#drawingToolList button[data-tool-id="body"]').click();
  await page.waitForTimeout(350);
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Particle" })
    .first()
    .click();
  await page.waitForTimeout(400);
  await page.mouse.click(at(0.3, 0.3).x, at(0.3, 0.3).y);
  await page.waitForTimeout(800);

  out.particleTitle = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  // Place a Point Force.
  await page.locator('#drawingToolList button[data-tool-id="force"]').click();
  await page.waitForTimeout(350);
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Point Force" })
    .first()
    .click();
  await page.waitForTimeout(400);
  await page.mouse.click(at(0.55, 0.3).x, at(0.55, 0.3).y);
  await page.waitForTimeout(800);

  out.forceTitle = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  // Place a Fixed Support.
  await page.locator('#drawingToolList button[data-tool-id="support"]').click();
  await page.waitForTimeout(350);
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Fixed Support" })
    .first()
    .click();
  await page.waitForTimeout(400);
  await page.mouse.click(at(0.3, 0.65).x, at(0.3, 0.65).y);
  await page.waitForTimeout(800);

  out.supportTitle = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  // Feature tree grouping.
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.03, 0.03).x, at(0.03, 0.03).y);
  await page.waitForTimeout(700);

  out.tree = await page.evaluate(() => {
    const groups = [];
    document.querySelectorAll(".drawing-component-group").forEach((g) => {
      const rows = [];
      let node = g.nextElementSibling;
      while (node && node.classList.contains("drawing-component-row")) {
        rows.push(node.innerText.trim());
        node = node.nextElementSibling;
      }
      groups.push({ group: g.textContent.trim(), rows });
    });
    return groups;
  });

  return out;
}
