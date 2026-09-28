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

  // ---- Section structure ----
  out.sections = await page.evaluate(() =>
    [...document.querySelectorAll("#drawingToolList .drawing-tool-group")].map(
      (s) => ({
        label: (
          s.querySelector(".drawing-tool-group-label")?.textContent || ""
        ).trim(),
        tools: [...s.querySelectorAll("button")].map((b) => b.dataset.toolId),
      }),
    ),
  );

  // ---- Each submenu's contents ----
  out.menus = {};
  for (const id of ["body", "force", "moment", "support", "connection"]) {
    await page.locator(`#drawingToolList button[data-tool-id="${id}"]`).click();
    await page.waitForTimeout(350);
    out.menus[id] = (
      await page.locator(".drawing-coordinate-submenu-item").allTextContents()
    ).map((t) => t.trim());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.mouse.click(5, 5);
    await page.waitForTimeout(250);
  }

  // ---- Create each new body type and read its panel ----
  const createSpan = async (label, x1, y1, x2, y2) => {
    await page.locator('#drawingToolList button[data-tool-id="body"]').click();
    await page.waitForTimeout(350);
    await page
      .locator(".drawing-coordinate-submenu-item", { hasText: label })
      .first()
      .click();
    await page.waitForTimeout(400);
    const instruction = await msg();
    await page.mouse.click(at(x1, y1).x, at(x1, y1).y);
    await page.waitForTimeout(280);
    await page.mouse.click(at(x2, y2).x, at(x2, y2).y);
    await page.waitForTimeout(700);
    return {
      instruction,
      title: await page.evaluate(
        () =>
          document.getElementById("drawingProperties").innerText.split("\n")[0],
      ),
      sections: await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "#drawingProperties .drawing-properties-section",
          ),
        ].map((s) => s.textContent.trim()),
      ),
      props: await page.evaluate(() =>
        [
          ...document.querySelectorAll("#drawingProperties [data-property]"),
        ].map((el) => el.dataset.property + "=" + el.value),
      ),
    };
  };

  out.beam = await createSpan("Beam", 0.2, 0.2, 0.45, 0.2);
  out.truss = await createSpan("Truss", 0.2, 0.35, 0.45, 0.35);
  out.cable = await createSpan("Cable", 0.2, 0.5, 0.45, 0.5);
  out.shaft = await createSpan("Shaft", 0.2, 0.65, 0.45, 0.65);

  // ---- Feature tree grouping ----
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
